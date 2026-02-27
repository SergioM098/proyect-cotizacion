// ========================================
// TIPO DE CONCILIACIÓN
// ========================================

export type ReconciliationType = 'bank' | 'accounts';

export interface ReconciliationLabels {
  sourceA: string;
  sourceB: string;
  title: string;
}

export const RECONCILIATION_LABELS: Record<ReconciliationType, ReconciliationLabels> = {
  bank: {
    sourceA: 'Extracto Bancario',
    sourceB: 'Libro Contable',
    title: 'Conciliación Bancaria',
  },
  accounts: {
    sourceA: 'Cuenta A',
    sourceB: 'Cuenta B',
    title: 'Conciliación entre Cuentas',
  },
};

// ========================================
// TRANSACCIÓN NORMALIZADA
// ========================================

export interface Transaction {
  id: string;
  date: string; // formato ISO: "2024-01-15"
  description: string;
  reference: string;
  amount: number; // positivo = crédito/ingreso, negativo = débito/egreso
  rawAmount: string;
  sourceRow: number;
  rawDescription: string;
}

export type TransactionSource = 'sourceA' | 'sourceB';

export interface SourcedTransaction extends Transaction {
  source: TransactionSource;
}

// ========================================
// RESULTADO DE CONCILIACIÓN
// ========================================

export type MatchMethod =
  | 'exact'
  | 'amount_date'
  | 'amount_reference'
  | 'amount_fuzzy'
  | 'fuzzy';

export interface MatchedPair {
  sourceATransaction: Transaction;
  sourceBTransaction: Transaction;
  confidence: number;
  matchMethod: MatchMethod;
  amountDifference: number;
  dateDifferenceInDays: number;
}

export interface ReconciliationSummary {
  totalSourceATransactions: number;
  totalSourceBTransactions: number;
  matchedCount: number;
  sourceAOnlyCount: number;
  sourceBOnlyCount: number;
  matchedAmount: number;
  sourceAOnlyAmount: number;
  sourceBOnlyAmount: number;
  bankChargesCount: number;
  bankChargesAmount: number;
  reconciliationRate: number;
  discrepancyCount: number;
}

export interface ReconciliationResult {
  id: string;
  createdAt: string;
  reconciliationType: ReconciliationType;
  matched: MatchedPair[];
  sourceAOnly: Transaction[];
  sourceBOnly: Transaction[];
  bankCharges: Transaction[];
  summary: ReconciliationSummary;
}

// ========================================
// CONFIGURACIÓN DE PARSEO
// ========================================

export interface ColumnMapping {
  date: string | number;
  description: string | number;
  reference?: string | number;
  debit?: string | number;
  credit?: string | number;
  amount?: string | number;
}

export interface FilePreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

export interface UploadResponse {
  sessionId: string;
  reconciliationType: ReconciliationType;
  sourceAPreview: FilePreview;
  sourceBPreview: FilePreview;
}

export interface ReconcileRequest {
  sessionId: string;
  reconciliationType: ReconciliationType;
  sourceAMapping: ColumnMapping;
  sourceBMapping: ColumnMapping;
  dateTolerance?: number;
  amountTolerance?: number;
}
