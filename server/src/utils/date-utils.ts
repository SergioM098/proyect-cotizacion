/**
 * Calcula la diferencia en días entre dos fechas ISO.
 */
export function dateDifferenceInDays(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Verifica si dos fechas son iguales.
 */
export function datesMatch(date1: string, date2: string): boolean {
  return date1 === date2;
}

/**
 * Verifica si dos fechas están dentro de una tolerancia dada (en días).
 */
export function datesWithinTolerance(
  date1: string,
  date2: string,
  toleranceDays: number
): boolean {
  return dateDifferenceInDays(date1, date2) <= toleranceDays;
}
