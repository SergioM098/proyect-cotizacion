import { v4 as uuidv4 } from 'uuid';
import type {
  Transaction,
  MatchedPair,
  MatchMethod,
  ReconciliationResult,
  ReconciliationSummary,
  ReconciliationType,
} from '../../../shared/types.js';
import { dateDifferenceInDays } from '../utils/date-utils.js';
import { amountsMatch, amountDifference } from '../utils/amount-utils.js';
import { referencesMatch } from '../utils/string-utils.js';

/**
 * Ejecuta la conciliación cruzando por montos.
 * Usa referencia, fecha y descripción solo como desempate
 * cuando hay múltiples candidatos con el mismo monto.
 */
export function reconcile(
  sourceATransactions: Transaction[],
  sourceBTransactions: Transaction[],
  config: { dateTolerance?: number; amountTolerance: number },
  reconciliationType: ReconciliationType = 'bank'
): ReconciliationResult {
  const remainingA = [...sourceATransactions];
  const remainingB = [...sourceBTransactions];
  const matched: MatchedPair[] = [];

  // En conciliación bancaria, los signos son opuestos:
  // Extracto +1000 (depósito) = Libro -1000 (débito al activo banco)
  // Extracto -500 (pago) = Libro +500 (crédito al activo banco)
  const negateB = reconciliationType === 'bank';

  // Pasada 1: Monto exacto + misma referencia (confianza 100%)
  matchByAmount(remainingA, remainingB, matched, {
    amountTolerance: 0,
    referenceRequired: true,
    method: 'exact',
    confidence: 1.0,
    negateB,
  });

  // Pasada 2: Monto exacto (confianza 90%)
  // Si hay varios con el mismo monto, usa fecha para desempatar
  matchByAmount(remainingA, remainingB, matched, {
    amountTolerance: 0,
    referenceRequired: false,
    method: 'amount_date',
    confidence: 0.9,
    negateB,
  });

  // Pasada 3: Monto con tolerancia pequeña (confianza 70%)
  // Para cubrir diferencias de centavos
  if (config.amountTolerance > 0) {
    matchByAmount(remainingA, remainingB, matched, {
      amountTolerance: config.amountTolerance,
      referenceRequired: false,
      method: 'amount_fuzzy',
      confidence: 0.7,
      negateB,
    });
  }

  // Pasada 4: Muchos-a-uno (N transacciones de un lado suman 1 del otro)
  matchManyToOne(remainingA, remainingB, matched, {
    maxGroupSize: 4,
    amountTolerance: config.amountTolerance,
    negateB,
  });

  return buildResult(matched, remainingA, remainingB, reconciliationType);
}

interface AmountMatchConfig {
  amountTolerance: number;
  referenceRequired: boolean;
  method: MatchMethod;
  confidence: number;
  negateB: boolean; // true = comparar txA.amount con -txB.amount (conciliación bancaria)
}

function matchByAmount(
  remainingA: Transaction[],
  remainingB: Transaction[],
  matched: MatchedPair[],
  config: AmountMatchConfig
): void {
  const usedA = new Set<number>();
  const usedB = new Set<number>();

  // Indexar Source B por monto para lookup O(1)
  const bByAmount = new Map<number, number[]>();
  for (let bi = 0; bi < remainingB.length; bi++) {
    const comparableAmount = config.negateB ? -remainingB[bi].amount : remainingB[bi].amount;
    const key = config.amountTolerance === 0
      ? comparableAmount
      : Math.round(comparableAmount);
    const list = bByAmount.get(key);
    if (list) list.push(bi);
    else bByAmount.set(key, [bi]);
  }

  for (let ai = 0; ai < remainingA.length; ai++) {
    if (usedA.has(ai)) continue;

    const txA = remainingA[ai];
    let bestMatch: { index: number; score: number } | null = null;

    // Obtener candidatos del índice en vez de recorrer todo remainingB
    let candidateIndices: number[];
    if (config.amountTolerance === 0) {
      candidateIndices = bByAmount.get(txA.amount) ?? [];
    } else {
      candidateIndices = [];
      const lo = Math.round(txA.amount - config.amountTolerance);
      const hi = Math.round(txA.amount + config.amountTolerance);
      for (let k = lo; k <= hi; k++) {
        const bucket = bByAmount.get(k);
        if (bucket) candidateIndices.push(...bucket);
      }
    }

    for (const bi of candidateIndices) {
      if (usedB.has(bi)) continue;

      const txB = remainingB[bi];
      const comparableAmountB = config.negateB ? -txB.amount : txB.amount;

      // Verificar match exacto/fuzzy (el bucket puede tener falsos positivos)
      if (config.amountTolerance === 0) {
        if (txA.amount !== comparableAmountB) continue;
      } else {
        if (!amountsMatch(txA.amount, comparableAmountB, config.amountTolerance)) continue;
      }

      if (config.referenceRequired) {
        if (!referencesMatch(txA.reference, txB.reference)) continue;
      }

      const score = calculateTiebreakScore(txA, txB);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index: bi, score };
      }
    }

    if (bestMatch !== null) {
      const txB = remainingB[bestMatch.index];
      const comparableB = config.negateB ? -txB.amount : txB.amount;

      matched.push({
        sourceATransaction: txA,
        sourceBTransaction: txB,
        confidence: config.confidence,
        matchMethod: config.method,
        amountDifference: amountDifference(txA.amount, comparableB),
        dateDifferenceInDays: dateDifferenceInDays(txA.date, txB.date),
      });

      usedA.add(ai);
      usedB.add(bestMatch.index);
    }
  }

  // Remover elementos conciliados (en orden inverso para mantener índices)
  const sortedA = [...usedA].sort((a, b) => b - a);
  for (const i of sortedA) remainingA.splice(i, 1);
  const sortedB = [...usedB].sort((a, b) => b - a);
  for (const i of sortedB) remainingB.splice(i, 1);
}

/**
 * Score de desempate cuando hay varios candidatos con el mismo monto.
 * Prioriza: referencia > fecha cercana.
 */
function calculateTiebreakScore(txA: Transaction, txB: Transaction): number {
  let score = 0;

  // Referencia coincide: +3
  if (referencesMatch(txA.reference, txB.reference)) score += 3;

  // Fecha: entre más cercana, mejor (máx +2)
  const daysDiff = Math.abs(dateDifferenceInDays(txA.date, txB.date));
  if (daysDiff === 0) score += 2;
  else if (daysDiff <= 3) score += 1.5;
  else if (daysDiff <= 7) score += 1;
  else if (daysDiff <= 30) score += 0.5;

  return score;
}

// ========== Matching muchos-a-uno (N:1) ==========

interface ManyToOneConfig {
  maxGroupSize: number;
  amountTolerance: number;
  negateB: boolean;
}

function matchManyToOne(
  remainingA: Transaction[],
  remainingB: Transaction[],
  matched: MatchedPair[],
  config: ManyToOneConfig
): void {
  // Dirección 1: N de B suman 1 de A
  findGroupMatches(remainingA, remainingB, matched, config, 'a_is_one');
  // Dirección 2: N de A suman 1 de B
  findGroupMatches(remainingA, remainingB, matched, config, 'b_is_one');
}

function findGroupMatches(
  remainingA: Transaction[],
  remainingB: Transaction[],
  matched: MatchedPair[],
  config: ManyToOneConfig,
  direction: 'a_is_one' | 'b_is_one'
): void {
  const oneSide = direction === 'a_is_one' ? remainingA : remainingB;
  const manySide = direction === 'a_is_one' ? remainingB : remainingA;

  const usedOne = new Set<number>();
  const usedMany = new Set<number>();

  for (let oi = 0; oi < oneSide.length; oi++) {
    if (usedOne.has(oi)) continue;
    const targetTx = oneSide[oi];

    // Monto objetivo (aplicar negateB según dirección)
    const targetAmount = direction === 'a_is_one'
      ? targetTx.amount
      : (config.negateB ? -targetTx.amount : targetTx.amount);

    // Recoger candidatos disponibles del lado "muchos"
    const candidates: { index: number; amount: number; tx: Transaction }[] = [];
    for (let mi = 0; mi < manySide.length; mi++) {
      if (usedMany.has(mi)) continue;
      const tx = manySide[mi];
      const amt = direction === 'a_is_one'
        ? (config.negateB ? -tx.amount : tx.amount)
        : tx.amount;
      // Solo candidatos con mismo signo que el objetivo
      if (Math.sign(amt) === Math.sign(targetAmount) || amt === 0) {
        candidates.push({ index: mi, amount: amt, tx });
      }
    }

    if (candidates.length < 2) continue;

    const found = findSubsetSum(candidates, targetAmount, config.amountTolerance, config.maxGroupSize);
    if (!found) continue;

    usedOne.add(oi);
    const allRelated: Transaction[] = [];
    for (const c of found) {
      usedMany.add(c.index);
      allRelated.push(c.tx);
    }

    const sumAmount = found.reduce((s, c) => s + c.amount, 0);
    const pair: MatchedPair = {
      sourceATransaction: direction === 'a_is_one' ? targetTx : allRelated[0],
      sourceBTransaction: direction === 'a_is_one' ? allRelated[0] : targetTx,
      confidence: 0.6,
      matchMethod: 'many_to_one',
      amountDifference: Math.abs(targetAmount - sumAmount),
      dateDifferenceInDays: 0,
      relatedTransactions: allRelated,
    };
    matched.push(pair);
  }

  // Remover elementos usados (orden inverso)
  const sortedOne = [...usedOne].sort((a, b) => b - a);
  for (const i of sortedOne) oneSide.splice(i, 1);
  const sortedMany = [...usedMany].sort((a, b) => b - a);
  for (const i of sortedMany) manySide.splice(i, 1);
}

function findSubsetSum(
  candidates: { index: number; amount: number; tx: Transaction }[],
  target: number,
  tolerance: number,
  maxSize: number
): typeof candidates | null {
  // Ordenar por magnitud descendente para mejor poda
  const sorted = [...candidates].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  // Limitar candidatos para evitar explosión combinatoria
  const limited = sorted.slice(0, 20);

  for (let size = 2; size <= Math.min(maxSize, limited.length); size++) {
    const result = findCombination(limited, target, tolerance, size, 0, [], 0);
    if (result) return result;
  }
  return null;
}

function findCombination(
  candidates: { index: number; amount: number; tx: Transaction }[],
  target: number,
  tolerance: number,
  size: number,
  startIdx: number,
  current: { index: number; amount: number; tx: Transaction }[],
  currentSum: number
): typeof candidates | null {
  if (current.length === size) {
    if (Math.abs(currentSum - target) <= tolerance) {
      return [...current];
    }
    return null;
  }

  for (let i = startIdx; i < candidates.length; i++) {
    const c = candidates[i];
    current.push(c);
    const result = findCombination(candidates, target, tolerance, size, i + 1, current, currentSum + c.amount);
    if (result) return result;
    current.pop();
  }
  return null;
}

// Palabras clave para detectar gastos bancarios automáticamente
const BANK_CHARGE_KEYWORDS = [
  // Genéricos
  'gasto bancario', 'gastos bancarios',
  'comision', 'comisión', 'comision pse',
  'gmf', '4x1000', '4 x 1000', 'gravamen',
  'cuota de manejo', 'cuota manejo', 'cuota manejo trj',
  'imp/trans financ', 'imp trans financ', // 4x1000 acumulado mes (Colpatria)
  // Bancolombia
  'cobro iva', 'iva pagos automaticos', 'iva pagos automáticos',
  'servicio pago a proveedores', 'servicio pagos a proveedores',
  'servicio pagos a terceros', 'servicio pago a terceros',
  'servicio pago a otros bancos', 'servicio pagos a otros bancos',
  'servicio por pagos a nequi', 'servicio pagos a nequi',
  'cuota plan canal negocios', 'iva cuota plan canal',
  'impto gobierno 4x1000',
  // Colpatria / Scotiabank
  'com.mes b.virtual', 'com mes b virtual', 'com mes b.virtual',
  'com.iva mes b.vir', 'com iva mes b', 'com.iva mes',
  'cta. servicio', 'cta servicio',
  // Banco de Occidente / Otros
  'abono intereses ahorros', 'abono intereses',
  'ajuste interes ahorros', 'ajuste intereses ahorros',
  'db automati cuota tarjcre', 'db automati cuota tarjeta',
  'pago int ctes sobregiro', 'pago intereses sobregiro',
  'iva sobre comisiones',
  'comision transferencias', 'comisión transferencias',
];

function isBankCharge(t: Transaction): boolean {
  const text = `${t.description} ${t.reference}`.toLowerCase();
  return BANK_CHARGE_KEYWORDS.some(kw => text.includes(kw));
}

function buildResult(
  matched: MatchedPair[],
  sourceAOnly: Transaction[],
  sourceBOnly: Transaction[],
  reconciliationType: ReconciliationType
): ReconciliationResult {
  // Separar gastos bancarios del sourceAOnly (solo para conciliación bancaria)
  const bankCharges = reconciliationType === 'bank'
    ? sourceAOnly.filter(isBankCharge)
    : [];
  const filteredSourceAOnly = reconciliationType === 'bank'
    ? sourceAOnly.filter(t => !isBankCharge(t))
    : sourceAOnly;

  // Generar transacciones sintéticas por diferencias de centavos
  // en pares conciliados con fuzzy matching
  if (reconciliationType === 'bank') {
    for (const pair of matched) {
      if (pair.amountDifference === 0) continue;

      const absBank = Math.abs(pair.sourceATransaction.amount);
      const absBook = Math.abs(pair.sourceBTransaction.amount);
      const diff = Math.abs(absBank - absBook);

      const syntheticTx: Transaction = {
        id: uuidv4(),
        date: pair.sourceATransaction.date,
        description: `Dif. centavos: ${pair.sourceATransaction.description}`,
        reference: pair.sourceATransaction.reference,
        amount: diff,
        rawAmount: diff.toFixed(2),
        sourceRow: 0,
        rawDescription: `Diferencia por centavos (${pair.matchMethod})`,
      };

      if (absBank > absBook) {
        // Banco tiene más → consignaciones en extracto y no en libros
        filteredSourceAOnly.push(syntheticTx);
      } else {
        // Libro tiene más → consignaciones en libros y no en extracto
        sourceBOnly.push(syntheticTx);
      }
    }
  }

  const totalA = matched.length + filteredSourceAOnly.length + bankCharges.length;
  const totalB = matched.length + sourceBOnly.length;

  const summary: ReconciliationSummary = {
    totalSourceATransactions: totalA,
    totalSourceBTransactions: totalB,
    matchedCount: matched.length,
    sourceAOnlyCount: filteredSourceAOnly.length,
    sourceBOnlyCount: sourceBOnly.length,
    matchedAmount: matched.reduce((sum, m) => sum + Math.abs(m.sourceATransaction.amount), 0),
    sourceAOnlyAmount: filteredSourceAOnly.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    sourceBOnlyAmount: sourceBOnly.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    bankChargesCount: bankCharges.length,
    bankChargesAmount: bankCharges.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    discrepancyCount: matched.filter((m) => m.amountDifference > 0).length,
  };

  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    reconciliationType,
    matched,
    sourceAOnly: filteredSourceAOnly,
    sourceBOnly,
    bankCharges,
    summary,
  };
}
