import type { ReconciliationType } from '../../../shared/types.js';

export interface ReconciliationLabels {
  sourceA: string;
  sourceB: string;
  title: string;
}

export const RECONCILIATION_LABELS: Record<ReconciliationType, ReconciliationLabels> = {
  bank: {
    sourceA: 'Extracto Bancario',
    sourceB: 'Libro Contable',
    title: 'Conciliaci\u00f3n Bancaria',
  },
  accounts: {
    sourceA: 'Cuenta A',
    sourceB: 'Cuenta B',
    title: 'Conciliaci\u00f3n entre Cuentas',
  },
};
