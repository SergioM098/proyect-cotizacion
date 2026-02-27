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
  const aToRemove: number[] = [];
  const bToRemove: number[] = [];

  for (let ai = 0; ai < remainingA.length; ai++) {
    if (aToRemove.includes(ai)) continue;

    const txA = remainingA[ai];
    let bestMatch: { index: number; score: number } | null = null;

    for (let bi = 0; bi < remainingB.length; bi++) {
      if (bToRemove.includes(bi)) continue;

      const txB = remainingB[bi];

      // Para conciliación bancaria, comparar con signo invertido
      // Extracto +1000 debe cruzar con Libro -1000 (débito)
      const comparableAmountB = config.negateB ? -txB.amount : txB.amount;

      // Criterio principal: el monto debe coincidir
      if (config.amountTolerance === 0) {
        if (txA.amount !== comparableAmountB) continue;
      } else {
        if (!amountsMatch(txA.amount, comparableAmountB, config.amountTolerance)) continue;
      }

      // Si se requiere referencia, verificar
      if (config.referenceRequired) {
        if (!referencesMatch(txA.reference, txB.reference)) continue;
      }

      // Calcular score de desempate (referencia + fecha)
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

      aToRemove.push(ai);
      bToRemove.push(bestMatch.index);
    }
  }

  aToRemove
    .sort((a, b) => b - a)
    .forEach((i) => remainingA.splice(i, 1));
  bToRemove
    .sort((a, b) => b - a)
    .forEach((i) => remainingB.splice(i, 1));
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

// Palabras clave para detectar gastos bancarios automáticamente
const BANK_CHARGE_KEYWORDS = [
  'gasto bancario', 'gastos bancarios',
  'comision', 'comisión',
  'gmf', '4x1000', '4 x 1000', 'gravamen',
  'cuota de manejo', 'cuota manejo',
  'cobro iva', 'iva pagos automaticos', 'iva pagos automáticos',
  'servicio pago a proveedores', 'servicio pagos a proveedores',
  'servicio pagos a terceros', 'servicio pago a terceros',
  'servicio por pagos a nequi', 'servicio pagos a nequi',
  'cuota plan canal negocios', 'iva cuota plan canal',
];

function isBankCharge(t: Transaction): boolean {
  const desc = t.description.toLowerCase();
  return BANK_CHARGE_KEYWORDS.some(kw => desc.includes(kw));
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
    reconciliationRate:
      matched.length /
      Math.max(totalA, totalB, 1),
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
