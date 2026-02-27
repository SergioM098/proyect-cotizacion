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

  const allRows: string[][] = [];

  worksheet.eachRow((row) => {
    const values = row.values as (string | number | Date | null)[];
    // ExcelJS usa índice 1, el primer elemento es undefined
    const cells = values.slice(1).map((cell) => formatCellValue(cell));
    allRows.push(cells);
  });

  if (allRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Detectar si la primera fila son encabezados o datos
  const firstRow = allRows[0];
  const isHeader = firstRow.some((cell) => {
    const trimmed = cell.trim().toLowerCase();
    if (!trimmed) return false;
    // Si la celda es puramente numérica o una fecha, es dato, no header
    if (/^-?[\d.,]+$/.test(trimmed)) return false;
    if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(trimmed)) return false;
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed)) return false;
    // Si contiene letras, probablemente es un header
    return /[a-záéíóúñ]/i.test(trimmed);
  });

  let headers: string[];
  let rows: string[][];

  if (isHeader) {
    headers = allRows[0];
    rows = allRows.slice(1);
  } else {
    // No hay encabezados - generar columnas genéricas
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows;
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
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
