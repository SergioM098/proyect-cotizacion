/**
 * Calcula la similitud entre dos cadenas usando distancia de Levenshtein normalizada.
 * Retorna un valor entre 0 (completamente diferentes) y 1 (idénticas).
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Verifica si dos referencias son iguales (ignorando espacios y case).
 */
export function referencesMatch(ref1: string, ref2: string): boolean {
  const clean1 = ref1.replace(/\s+/g, '').toLowerCase();
  const clean2 = ref2.replace(/\s+/g, '').toLowerCase();
  return clean1.length > 0 && clean2.length > 0 && clean1 === clean2;
}
