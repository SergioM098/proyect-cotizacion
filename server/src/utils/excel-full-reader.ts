console.log('>>>>>> EXCEL-FULL-READER CARGADO <<<<<<');
/**
 * Lector de Excel que maneja archivos donde ExcelJS pierde filas al final
 * porque el elemento <dimension> del XML no cubre todas las filas con datos.
 * Solución: parchear el <dimension> con el máximo real de filas del XML.
 */
import ExcelJS from 'exceljs';
import fs from 'fs';

async function patchedExcelBuffer(filePath: string): Promise<Buffer | Uint8Array> {
  const raw = fs.readFileSync(filePath);
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(raw);

    // Encontrar la hoja de trabajo en el ZIP
    const sheetKey = Object.keys(zip.files).find(k =>
      /xl\/worksheets\/sheet\d+\.xml$/i.test(k)
    );
    if (!sheetKey) return raw;

    let xml = await zip.files[sheetKey].async('string');

    // Encontrar el número real máximo de fila en el XML
    const rowNums: number[] = [];
    const rx = /<row\b[^>]*\br="(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(xml)) !== null) rowNums.push(parseInt(m[1], 10));
    if (rowNums.length === 0) return raw;

    const trueMax = Math.max(...rowNums);
    console.log(`[EXCEL READER] Archivo: ${filePath.split(/[\\/]/).pop()}, max fila XML = ${trueMax}`);

    // Parchear <dimension ref="A1:J60"/> → <dimension ref="A1:J{trueMax}"/>
    const patched = xml.replace(
      /(<dimension\s+ref="[A-Z]+\d+:[A-Z]+)\d+(")/,
      (_, pre, post) => `${pre}${trueMax}${post}`
    );

    if (patched !== xml) {
      console.log(`[EXCEL READER] dimension parcheada hasta fila ${trueMax}`);
      zip.file(sheetKey, patched);
      return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
    }
    return raw;
  } catch (e) {
    console.log('[EXCEL READER] Error al parchear, usando original:', (e as Error).message);
    return raw;
  }
}

export interface ParsedExcelResult {
  headers: string[];
  rows: string[][];
}

export async function readExcelFull(filePath: string): Promise<ParsedExcelResult> {
  console.log(`[readExcelFull] LLAMADA con: ${filePath}`);
  const buffer = await patchedExcelBuffer(filePath);
  console.log(`[readExcelFull] buffer obtenido, tamaño=${buffer.length}`);

  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('El archivo Excel no contiene hojas de cálculo');

  const maxCols = worksheet.columnCount || 1;
  const allRows: string[][] = [];

  worksheet.eachRow((row) => {
    const values = row.values as (string | number | Date | null)[];
    const cells = Array.from({ length: maxCols }, (_, i) => cellToString(values[i + 1]));
    if (cells.some(c => c.trim() !== '')) {
      allRows.push(cells);
    }
  });

  console.log(`[EXCEL READER] ${allRows.length} filas no vacías leídas`);

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

  console.log(`[EXCEL READER] Header en índice ${headerIdx}, ${rows.length} filas de datos`);
  console.log(`[EXCEL READER] Headers: ${headers.join(' | ')}`);
  // Mostrar las primeras 10 filas para debug
  rows.slice(0, 10).forEach((row, i) => {
    console.log(`[EXCEL READER] Fila ${i}: ${row.filter(c => c.trim()).join(' | ')}`);
  });
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
