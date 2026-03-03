/**
 * Lector de archivos .xls (formato binario antiguo) usando SheetJS.
 */
import XLSX from 'xlsx';

export interface ParsedXlsResult {
  headers: string[];
  rows: string[][];
}

const HEADER_KWS = [
  'fecha', 'date', 'descripcion', 'descripción', 'detalle', 'concepto',
  'monto', 'valor', 'debito', 'débito', 'credito', 'crédito', 'saldo',
  'referencia', 'ref', 'documento', 'cheque', 'nombre', 'movimiento',
];

export function readXlsFile(filePath: string): ParsedXlsResult {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo Excel no contiene hojas de cálculo');

  const sheet = workbook.Sheets[sheetName];
  // raw:false formatea fechas como strings, defval para celdas vacías
  const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  // Filtrar filas completamente vacías
  const allRows = rawRows
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(c => c !== ''));

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

  // Normalizar: asegurar que todas las filas tengan el mismo número de columnas
  const numCols = headers.length;
  rows = rows.map(row => {
    if (row.length < numCols) return [...row, ...Array(numCols - row.length).fill('')];
    if (row.length > numCols) return row.slice(0, numCols);
    return row;
  });

  return { headers, rows };
}

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
