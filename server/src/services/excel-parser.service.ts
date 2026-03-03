import ExcelJS from 'exceljs';
import type { FilePreview } from '../../../shared/types.js';

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export async function parseExcelFile(filePath: string): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('El archivo Excel no contiene hojas de cálculo');
  }

  // Determinar el número máximo de columnas en la hoja
  const maxCols = worksheet.columnCount || 1;

  const allRows: string[][] = [];

  // Usar dimensions para cubrir TODO el rango, incluyendo filas que eachRow puede omitir
  const dims = worksheet.dimensions;
  const lastRowNum = Math.max(
    dims?.bottom ?? 0,
    worksheet.lastRow?.number ?? 0,
    worksheet.rowCount
  );
  console.log(`[EXCEL PARSE] dims=${dims?.top}:${dims?.bottom}, lastRow=${worksheet.lastRow?.number}, rowCount=${worksheet.rowCount} → iterando hasta ${lastRowNum}`);

  for (let rowNum = 1; rowNum <= lastRowNum; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const values = row.values as (string | number | Date | null)[];
    const cells = Array.from({ length: maxCols }, (_, i) => formatCellValue(values[i + 1]));
    // Solo agregar filas que tienen al menos una celda con contenido
    if (cells.some(c => c.trim() !== '')) {
      allRows.push(cells);
    }
  }

  if (allRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Buscar la fila de encabezados reales (puede no ser la primera fila)
  // Archivos contables suelen tener: nombre empresa, NIT, periodo, etc. antes de los headers
  const headerRowIndex = findHeaderRow(allRows);

  let headers: string[];
  let rows: string[][];

  if (headerRowIndex >= 0) {
    headers = allRows[headerRowIndex];
    rows = allRows.slice(headerRowIndex + 1);
  } else {
    // No se encontraron encabezados - generar columnas genéricas
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows;
  }

  // Filtrar filas que no son datos reales de transacciones.
  const headerFingerprint = headers.map(h => h.toLowerCase().trim()).join('|');
  const beforeCount = rows.length;

  rows = rows.filter((row, idx) => {
    // 1. Descartar filas de encabezados de columna repetidos (exports multi-página)
    const rowFingerprint = row.map(c => c.toLowerCase().trim()).join('|');
    if (rowFingerprint === headerFingerprint) {
      console.log(`[FILTER] Fila ${idx}: REPETIDA HEADER → descartada`);
      return false;
    }

    // 2. Descartar filas con metadatos de página (empresa, NIT, periodo, etc.)
    if (isPageMetadata(row)) {
      console.log(`[FILTER] Fila ${idx}: METADATA → descartada |`, row.filter(c => c.trim()).join(' | '));
      return false;
    }

    // 3. Debe tener fecha + monto numérico para ser transacción válida
    if (!looksLikeDataRow(row)) {
      console.log(`[FILTER] Fila ${idx}: SIN fecha+monto → descartada |`, row.filter(c => c.trim()).join(' | '));
      return false;
    }

    return true;
  });

  console.log(`[FILTER] ${beforeCount} filas → ${rows.length} filas después de filtrar`);

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Detecta filas de metadatos/encabezado de página que se repiten en exports multi-página.
 * Ej: nombre empresa, NIT, periodo, "Impreso Por:", "Pag: 2", "Desde:", etc.
 */
const PAGE_METADATA_PATTERNS = [
  /\bnit\.?\s*:?\s*\d/i,
  /\bimpreso\s+por\b/i,
  /\bpag(ina|ína)?[\s.:]+\d/i,
  /\bdesde\s*:/i,
  /\bhasta\s*:/i,
  /\bperiodo\s+de\b/i,
  /\bextractos?\s+de\s+libros/i,
  /\bextractos?\s+bancari/i,
  /\bsaldo\s+anterior\b/i,
  /\bfabrica\s+de\b/i,
  /\bs\.?a\.?s\.?\b/i,
  /\bmoneda\s+nacional\b/i,
  /\bcta\s+corriente\b/i,
  /\btotal\s+cuenta\b/i,
];

function isPageMetadata(row: string[]): boolean {
  const joined = row.join(' ');
  return PAGE_METADATA_PATTERNS.some(pattern => pattern.test(joined));
}

/**
 * Verifica que una fila tenga al menos una fecha y un valor numérico (monto).
 * Esto filtra automáticamente filas que no son transacciones.
 */
function looksLikeDataRow(row: string[]): boolean {
  let hasDate = false;
  let hasAmount = false;

  for (const cell of row) {
    const trimmed = cell.trim();
    if (!trimmed) continue;

    // Fecha: DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD
    if (!hasDate) {
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed) ||
          /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(trimmed)) {
        hasDate = true;
      }
    }

    // Monto numérico: acepta formatos como 1.234.567,89 o 1,234,567.89 o 1234567
    if (!hasAmount) {
      if (/^-?[\d.,]+$/.test(trimmed)) {
        // Debe tener al menos 2 dígitos para no confundir con códigos cortos
        const digitCount = (trimmed.match(/\d/g) || []).length;
        if (digitCount >= 2) {
          hasAmount = true;
        }
      }
    }

    if (hasDate && hasAmount) return true;
  }

  return false;
}

/**
 * Busca la fila de encabezados reales en el archivo.
 * Archivos contables colombianos suelen tener filas de título antes de los headers:
 * - Nombre de empresa
 * - NIT
 * - Tipo de reporte
 * - Periodo
 * - Fila vacía
 * - FILA DE ENCABEZADOS ← esta es la que buscamos
 */
function findHeaderRow(allRows: string[][]): number {
  const headerKeywords = [
    'fecha', 'date', 'descripcion', 'descripción', 'detalle', 'concepto',
    'monto', 'valor', 'debito', 'débito', 'credito', 'crédito', 'saldo',
    'referencia', 'ref', 'tipo', 'comprobante', 'compbte', 'fuente',
    'cheque', 'tercero', 'nombre', 'documento', 'doc', 'movimiento',
    'cuenta', 'oficina', 'sucursal',
  ];

  let bestRow = -1;
  let bestScore = 0;

  // Buscar en las primeras 30 filas
  const searchLimit = Math.min(allRows.length, 30);
  for (let i = 0; i < searchLimit; i++) {
    const row = allRows[i];
    const nonEmptyCells = row.filter(c => c.trim() !== '').length;

    // Una fila de encabezados debe tener al menos 3 celdas no vacías
    if (nonEmptyCells < 3) continue;

    // Contar cuántas celdas coinciden con keywords de encabezado
    let keywordMatches = 0;
    for (const cell of row) {
      const lower = cell.toLowerCase().trim();
      if (!lower) continue;
      if (headerKeywords.some(kw => lower.includes(kw))) {
        keywordMatches++;
      }
    }

    // Necesitamos al menos 2 keywords reconocidas
    if (keywordMatches < 2) continue;

    // Score = keywords encontradas + celdas no vacías (preferir la fila más completa)
    const score = keywordMatches * 3 + nonEmptyCells;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  // Si no se encontró con keywords, usar heurística simple:
  // la primera fila con al menos 4 celdas no vacías que sean texto (no números puros)
  if (bestRow === -1) {
    for (let i = 0; i < searchLimit; i++) {
      const row = allRows[i];
      const textCells = row.filter(c => {
        const trimmed = c.trim();
        if (!trimmed) return false;
        if (/^-?[\d.,]+$/.test(trimmed)) return false; // número puro
        return /[a-záéíóúñ]/i.test(trimmed);
      });
      if (textCells.length >= 4) {
        bestRow = i;
        break;
      }
    }
  }

  return bestRow;
}

export function getPreview(parsed: ParsedSheet): FilePreview {
  return {
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    totalRows: parsed.totalRows,
  };
}

function formatCellValue(cell: unknown): string {
  if (cell === null || cell === undefined) return '';

  // Fechas de Excel
  if (cell instanceof Date) {
    return cell.toISOString().split('T')[0];
  }

  // Fórmulas de Excel (exceljs devuelve { result, formula })
  if (typeof cell === 'object' && cell !== null) {
    if ('result' in cell) {
      return formatCellValue((cell as { result: unknown }).result);
    }
    if ('text' in cell) {
      return String((cell as { text: unknown }).text ?? '');
    }
    if ('richText' in cell) {
      const rt = cell as { richText: Array<{ text: string }> };
      return rt.richText.map((r) => r.text).join('');
    }
  }

  return String(cell).trim();
}
