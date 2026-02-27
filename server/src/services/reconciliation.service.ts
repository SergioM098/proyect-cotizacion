import { v4 as uuidv4 } from 'uuid';
import type {
  Transaction,
  MatchedPair,
  MatchMethod,
  ReconciliationResult,
  ReconciliationSummary,
  ReconciliationType,
} from '../../../shared/types.js';
import { datesMatch, datesWithinTolerance, dateDifferenceInDays } from '../utils/date-utils.js';
import { amountsMatch, amountDifference } from '../utils/amount-utils.js';
import { stringSimilarity, referencesMatch } from '../utils/string-utils.js';

interface MatchConfig {
  amountExact: boolean;
  amountTolerance?: number;
  dateExact: boolean;
  dateTolerance?: number;
  referenceRequired: boolean;
  descriptionSimilarity?: number;
  method: MatchMethod;
  confidence: number;
}

/**
 * Ejecuta la conciliación con algoritmo de 5 pasadas.
 * Funciona tanto para conciliación bancaria como entre cuentas.
 */
export function reconcile(
  sourceATransactions: Transaction[],
  sourceBTransactions: Transaction[],
  config: { dateTolerance: number; amountTolerance: number },
  reconciliationType: ReconciliationType = 'bank'
): ReconciliationResult {
  const remainingA = [...sourceATransactions];
  const remainingB = [...sourceBTransactions];
  const matched: MatchedPair[] = [];

  // Pasada 1: Match exacto (monto + fecha + referencia)
  matchPass(remainingA, remainingB, matched, {
    amountExact: true,
    dateExact: true,
    referenceRequired: true,
    method: 'exact',
    confidence: 1.0,
  });

  // Pasada 2: Monto + Fecha (sin referencia)
  matchPass(remainingA, remainingB, matched, {
    amountExact: true,
    dateExact: true,
    referenceRequired: false,
    method: 'amount_date',
    confidence: 0.9,
  });

  // Pasada 3: Monto + Referencia (fecha cercana)
  matchPass(remainingA, remainingB, matched, {
    amountExact: true,
    dateExact: false,
    dateTolerance: config.dateTolerance,
    referenceRequired: true,
    method: 'amount_reference',
    confidence: 0.85,
  });

  // Pasada 4: Monto exacto + fecha cercana
  matchPass(remainingA, remainingB, matched, {
    amountExact: true,
    dateExact: false,
    dateTolerance: config.dateTolerance,
    referenceRequired: false,
    method: 'amount_fuzzy',
    confidence: 0.7,
  });

  // Pasada 5: Fuzzy
  matchPass(remainingA, remainingB, matched, {
    amountExact: false,
    amountTolerance: config.amountTolerance,
    dateExact: false,
    dateTolerance: config.dateTolerance + 2,
    referenceRequired: false,
    descriptionSimilarity: 0.6,
    method: 'fuzzy',
    confidence: 0.5,
  });

  return buildResult(matched, remainingA, remainingB, reconciliationType);
}

function matchPass(
  remainingA: Transaction[],
  remainingB: Transaction[],
  matched: MatchedPair[],
  config: MatchConfig
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

      if (!isMatch(txA, txB, config)) continue;

      const score = calculateMatchScore(txA, txB);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index: bi, score };
      }
    }

    if (bestMatch !== null) {
      const txB = remainingB[bestMatch.index];

      matched.push({
        sourceATransaction: txA,
        sourceBTransaction: txB,
        confidence: config.confidence,
        matchMethod: config.method,
        amountDifference: amountDifference(txA.amount, txB.amount),
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

function isMatch(
  txA: Transaction,
  txB: Transaction,
  config: MatchConfig
): boolean {
  if (config.amountExact) {
    if (txA.amount !== txB.amount) return false;
  } else if (config.amountTolerance !== undefined) {
    if (!amountsMatch(txA.amount, txB.amount, config.amountTolerance)) {
      return false;
    }
  }

  if (config.dateExact) {
    if (!datesMatch(txA.date, txB.date)) return false;
  } else if (config.dateTolerance !== undefined) {
    if (!datesWithinTolerance(txA.date, txB.date, config.dateTolerance)) {
      return false;
    }
  }

  if (config.referenceRequired) {
    if (!referencesMatch(txA.reference, txB.reference)) return false;
  }

  if (config.descriptionSimilarity !== undefined) {
    const similarity = stringSimilarity(txA.description, txB.description);
    if (similarity < config.descriptionSimilarity) return false;
  }

  return true;
}

function calculateMatchScore(txA: Transaction, txB: Transaction): number {
  let score = 0;

  if (txA.amount === txB.amount) score += 3;
  else score += 1;

  if (txA.date === txB.date) score += 2;
  else score += 1;

  if (referencesMatch(txA.reference, txB.reference)) score += 2;

  score += stringSimilarity(txA.description, txB.description);

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
