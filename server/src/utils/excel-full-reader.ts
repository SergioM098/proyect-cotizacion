/**
 * Lector de Excel que maneja archivos donde ExcelJS pierde filas al final
 * porque el elemento <dimension> del XML no cubre todas las filas con datos.
 * Solución: parchear el <dimension> con el máximo real de filas del XML.
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import type { WorksheetInfo } from '../../../shared/types.js';

async function patchedExcelBuffer(filePath: string): Promise<Buffer | Uint8Array> {
  const raw = fs.readFileSync(filePath);
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(raw);

    // Parchear TODAS las hojas (no solo la primera)
    const sheetKeys = Object.keys(zip.files).filter(k =>
      /xl\/worksheets\/sheet\d+\.xml$/i.test(k)
    );
    if (sheetKeys.length === 0) return raw;

    let modified = false;
    for (const sheetKey of sheetKeys) {
      let xml = await zip.files[sheetKey].async('string');

      const rowNums: number[] = [];
      const rx = /<row\b[^>]*\br="(\d+)"/g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(xml)) !== null) rowNums.push(parseInt(m[1], 10));
      if (rowNums.length === 0) continue;

      const trueMax = Math.max(...rowNums);
      const patched = xml.replace(
        /(<dimension\s+ref="[A-Z]+\d+:[A-Z]+)\d+(")/,
        (_, pre, post) => `${pre}${trueMax}${post}`
      );

      if (patched !== xml) {
        zip.file(sheetKey, patched);
        modified = true;
      }
    }

    if (modified) {
      return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
    }
    return raw;
  } catch {
    return raw;
  }
}

export interface ParsedExcelResult {
  headers: string[];
  rows: string[][];
}

/**
 * Lista las hojas de un archivo Excel sin parsear su contenido.
 */
export async function listExcelSheets(filePath: string): Promise<WorksheetInfo[]> {
  const raw = fs.readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(raw as any);

  return workbook.worksheets.map((ws, i) => ({
    name: ws.name,
    index: i,
    rowCount: ws.rowCount || 0,
  }));
}

/**
 * Lee una hoja específica de un archivo Excel.
 * @param sheetIndex Índice de la hoja (0-based). Por defecto lee la primera.
 */
export async function readExcelFull(filePath: string, sheetIndex: number = 0): Promise<ParsedExcelResult> {
  const buffer = await patchedExcelBuffer(filePath);

  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) throw new Error('La hoja seleccionada no existe en el archivo Excel');

  const maxCols = worksheet.columnCount || 1;
  const allRows: string[][] = [];

  worksheet.eachRow((row) => {
    const values = row.values as (string | number | Date | null)[];
    const cells = Array.from({ length: maxCols }, (_, i) => cellToString(values[i + 1]));
    if (cells.some(c => c.trim() !== '')) {
      allRows.push(cells);
    }
  });

  if (allRows.length === 0) return { headers: [], rows: [] };

  const headerIdx = findHeader(allRows);
  let headers: string[];
  let rows: string[][];

  if (headerIdx >= 0) {
    headers = allRows[headerIdx];
    rows = allRows.slice(headerIdx + 1);
  } else {
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows.slice(1);
  }

  return { headers, rows };
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    const d = cell;
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getUTCFullYear()}`;
  }
  if (typeof cell === 'object') {
    if ('result' in (cell as object)) return cellToString((cell as { result: unknown }).result);
    if ('text' in (cell as object)) return String((cell as { text: unknown }).text ?? '');
    if ('richText' in (cell as object))
      return (cell as { richText: Array<{ text: string }> }).richText.map(r => r.text).join('');
  }
  return String(cell).trim();
}

const HEADER_KWS = [
  'fecha', 'date', 'descripcion', 'descripción', 'detalle', 'concepto',
  'monto', 'valor', 'debito', 'débito', 'credito', 'crédito', 'saldo',
  'referencia', 'ref', 'documento', 'cheque', 'nombre', 'movimiento',
];

function findHeader(rows: string[][]): number {
  let best = -1, bestScore = 0;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const nonEmpty = row.filter(c => c.trim() !== '').length;
    if (nonEmpty < 3) continue;

    // Saltar filas con celdas fusionadas (todas iguales — ExcelJS expande merges)
    const uniqueValues = new Set(row.filter(c => c.trim() !== '').map(c => c.trim().toLowerCase()));
    if (uniqueValues.size === 1 && nonEmpty > 3) continue;

    let matches = 0;
    for (const cell of row) {
      const lower = cell.toLowerCase().trim();
      if (HEADER_KWS.some(kw => lower.includes(kw))) matches++;
    }
    if (matches < 2) continue;
    const score = matches * 3 + nonEmpty;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
