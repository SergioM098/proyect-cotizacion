import { v4 as uuidv4 } from 'uuid';
import type { Transaction, ColumnMapping } from '../../../shared/types.js';

export function normalizeTransactions(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping
): Transaction[] {
  const transactions: Transaction[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const date = normalizeDate(getCellValue(row, headers, mapping.date));
      const description = getCellValue(row, headers, mapping.description);
      const reference = mapping.reference
        ? getCellValue(row, headers, mapping.reference)
        : '';

      let amount: number;
      if (mapping.amount !== undefined) {
        amount = normalizeAmount(getCellValue(row, headers, mapping.amount));
      } else {
        const debit = mapping.debit
          ? normalizeAmount(getCellValue(row, headers, mapping.debit))
          : 0;
        const credit = mapping.credit
          ? normalizeAmount(getCellValue(row, headers, mapping.credit))
          : 0;
        amount = credit - debit;
      }

      if (!date || isNaN(amount)) continue;

      transactions.push({
        id: uuidv4(),
        date,
        description: description.replace(/\s+/g, ' ').trim(),
        reference: reference.trim(),
        amount,
        rawAmount: mapping.amount !== undefined
          ? getCellValue(row, headers, mapping.amount)
          : `D:${getCellValue(row, headers, mapping.debit ?? '')} C:${getCellValue(row, headers, mapping.credit ?? '')}`,
        sourceRow: i + 2, // +2 porque fila 1 es headers y el índice es 0-based
        rawDescription: description,
      });
    } catch {
      // Ignorar filas que no se pueden parsear
      continue;
    }
  }

  return transactions;
}

function getCellValue(
  row: string[],
  headers: string[],
  columnRef: string | number
): string {
  if (typeof columnRef === 'number') {
    return row[columnRef] ?? '';
  }
  const index = headers.findIndex(
    (h) => h.toLowerCase().trim() === String(columnRef).toLowerCase().trim()
  );
  if (index === -1) {
    // Intentar como índice numérico
    const numIndex = parseInt(columnRef, 10);
    if (!isNaN(numIndex) && numIndex >= 0 && numIndex < row.length) {
      return row[numIndex] ?? '';
    }
    return '';
  }
  return row[index] ?? '';
}

function normalizeDate(value: string): string {
  if (!value) return '';

  // Limpiar espacios
  const trimmed = value.trim();

  // Ya es ISO: 2026-02-23 o 2026-02-23T...
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.split('T')[0];
  }

  // YYYY/MM/DD o YYYY.MM.DD (formato usado por algunos bancos)
  const ymd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
  const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    let year = dmy[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // d/MM o dd/MM (sin año, común en extractos bancarios colombianos)
  const dm = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dm) {
    const day = dm[1].padStart(2, '0');
    const month = dm[2].padStart(2, '0');
    const year = new Date().getFullYear().toString();
    return `${year}-${month}-${day}`;
  }

  // Intentar parsear como Date de JS (por si viene en otro formato)
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

function normalizeAmount(value: string): number {
  if (!value) return 0;

  let cleaned = value.replace(/[^0-9.,\-]/g, '');

  // Determinar formato: 1.234,56 (europeo/latam) vs 1,234.56 (US)
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Formato: 1.234,56 → coma es decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato: 1,234.56 → punto es decimal
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Solo comas: podría ser decimal
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

/**
 * Intenta detectar automáticamente qué columna corresponde a qué campo.
 */
export function autoDetectColumns(headers: string[], sampleRows?: string[][]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lower = headers.map(normalizeText);

  // Fecha
  const dateKeywords = ['fecha', 'date', 'fec', 'dia'];
  const dateIdx = lower.findIndex((h) =>
    dateKeywords.some((k) => h.includes(k))
  );
  if (dateIdx !== -1) mapping.date = dateIdx;

  // Descripción
  const descKeywords = ['descripcion', 'descripción', 'concepto', 'detalle', 'description', 'desc'];
  const descIdx = lower.findIndex((h) =>
    descKeywords.some((k) => h.includes(k))
  );
  if (descIdx !== -1) mapping.description = descIdx;

  // Si la columna de descripción tiene muy baja variedad (ej: siempre dice
  // "Bancolombia Cta Aho"), buscar una columna alternativa más descriptiva
  if (mapping.description !== undefined && sampleRows && sampleRows.length > 3) {
    const di = mapping.description as number;
    const sample = sampleRows.slice(0, 20);
    const uniqueVals = new Set(sample.map(r => (r[di] ?? '').trim().toLowerCase()).filter(Boolean));
    if (uniqueVals.size <= 2) {
      const altDescKeywords = ['nombre', 'tercero', 'beneficiario', 'cliente', 'proveedor', 'pagador'];
      const altIdx = lower.findIndex((h, i) =>
        i !== di && altDescKeywords.some(k => h.includes(k))
      );
      if (altIdx !== -1) {
        mapping.description = altIdx;
      }
    }
  }

  // Referencia
  const refKeywords = ['referencia', 'ref', 'reference', 'num', 'número', 'numero', 'td', 'documento', 'doc', 'dcto', 'comprobante'];
  const refIdx = lower.findIndex((h) =>
    refKeywords.some((k) => h.includes(k))
  );
  if (refIdx !== -1) mapping.reference = refIdx;

  // Débito (detectar ANTES que monto para evitar conflictos con "Valor Debito")
  const debitKeywords = ['debito', 'débito', 'debit', 'cargo', 'egreso', 'salida'];
  const debitIdx = lower.findIndex((h) =>
    debitKeywords.some((k) => h.includes(k))
  );
  if (debitIdx !== -1) mapping.debit = debitIdx;

  // Crédito
  const creditKeywords = ['credito', 'crédito', 'credit', 'abono', 'ingreso', 'entrada', 'haber'];
  const creditIdx = lower.findIndex((h) =>
    creditKeywords.some((k) => h.includes(k))
  );
  if (creditIdx !== -1) mapping.credit = creditIdx;

  // Monto único: solo si NO hay columnas separadas de débito/crédito
  if (debitIdx === -1 && creditIdx === -1) {
    const amountKeywords = ['monto', 'amount', 'valor', 'importe', 'total'];
    const amountIdx = lower.findIndex((h) =>
      amountKeywords.some((k) => h.includes(k))
    );
    if (amountIdx !== -1) mapping.amount = amountIdx;
  }

  inferMissingColumnsFromRows(mapping, headers, sampleRows);

  return mapping;
}

function inferMissingColumnsFromRows(
  mapping: Partial<ColumnMapping>,
  headers: string[],
  sampleRows?: string[][]
): void {
  if (!sampleRows || sampleRows.length === 0 || headers.length === 0) return;

  const rows = sampleRows.slice(0, 30);

  if (mapping.date === undefined) {
    const dateIdx = bestColumnIndex(headers, rows, looksLikeDate);
    if (dateIdx !== -1) mapping.date = dateIdx;
  }

  if (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined) {
    const amountIdx = bestColumnIndex(headers, rows, looksLikeAmount);
    if (amountIdx !== -1) mapping.amount = amountIdx;
  }

  if (mapping.description === undefined) {
    let bestIdx = -1;
    let bestScore = 0;

    for (let col = 0; col < headers.length; col++) {
      if (col === mapping.date || col === mapping.amount || col === mapping.debit || col === mapping.credit) {
        continue;
      }

      const values = rows.map((row) => row[col] ?? '').filter(Boolean);
      const textValues = values.filter((value) => /[a-zA-Z]/.test(value) && !looksLikeAmount(value));
      const avgLength = textValues.reduce((sum, value) => sum + value.length, 0) / Math.max(textValues.length, 1);
      const score = textValues.length * 2 + avgLength;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = col;
      }
    }

    if (bestIdx !== -1) mapping.description = bestIdx;
  }
}

function bestColumnIndex(
  headers: string[],
  rows: string[][],
  predicate: (value: string) => boolean
): number {
  let bestIdx = -1;
  let bestScore = 0;

  for (let col = 0; col < headers.length; col++) {
    const score = rows.reduce((count, row) => count + (predicate(row[col] ?? '') ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col;
    }
  }

  return bestScore >= Math.max(2, Math.ceil(rows.length * 0.25)) ? bestIdx : -1;
}

function looksLikeDate(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(trimmed) ||
    /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(trimmed) ||
    /^\d{1,2}[\/\-]\d{1,2}$/.test(trimmed)
  );
}

function looksLikeAmount(value: string): boolean {
  const cleaned = value.trim().replace(/[$\s]/g, '');
  return /^-?\d[\d.,]*$/.test(cleaned) && (cleaned.match(/\d/g) || []).length >= 2;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ã¡/g, 'a')
    .replace(/Ã©/g, 'e')
    .replace(/Ã­/g, 'i')
    .replace(/Ã³/g, 'o')
    .replace(/Ãº/g, 'u')
    .replace(/Ã±/g, 'n')
    .trim();
}
