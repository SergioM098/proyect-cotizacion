/**
 * Compara dos montos con tolerancia para redondeos.
 */
export function amountsMatch(
  amount1: number,
  amount2: number,
  tolerance: number = 0
): boolean {
  return Math.abs(amount1 - amount2) <= tolerance;
}

/**
 * Calcula la diferencia absoluta entre dos montos.
 */
export function amountDifference(amount1: number, amount2: number): number {
  return Math.abs(amount1 - amount2);
}

/**
 * Formatea un monto para mostrar.
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
