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

  worksheet.eachRow((row) => {
    const values = row.values as (string | number | Date | null)[];
    // ExcelJS usa índice 1 y devuelve arrays dispersos (sparse arrays)
    // Usar Array.from para crear un array denso sin huecos undefined
    const cells = Array.from({ length: maxCols }, (_, i) => formatCellValue(values[i + 1]));
    allRows.push(cells);
  });

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

  // Filtrar filas vacías o que son sub-encabezados de cuentas (muy pocas celdas llenas)
  const minFilledCells = Math.max(3, Math.floor(headers.filter(h => h.trim()).length * 0.3));
  rows = rows.filter(row => {
    const filledCells = row.filter(c => c.trim() !== '').length;
    return filledCells >= minFilledCells;
  });

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
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
