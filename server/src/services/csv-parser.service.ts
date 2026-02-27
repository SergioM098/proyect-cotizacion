import fs from 'fs';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export function parseCsvFile(filePath: string): ParsedCsv {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Detectar delimitador: ; o , o \t
  const firstLine = raw.split('\n')[0] || '';
  const delimiter = detectDelimiter(firstLine);

  const allRows = parseCsvLines(raw, delimiter);

  if (allRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Detectar si la primera fila son encabezados o datos
  const firstRow = allRows[0];
  const isHeader = firstRow.some((cell) => {
    const trimmed = cell.trim().toLowerCase();
    if (!trimmed) return false;
    if (/^-?[\d.,]+$/.test(trimmed)) return false;
    if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(trimmed)) return false;
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed)) return false;
    return /[a-záéíóúñ]/i.test(trimmed);
  });

  let headers: string[];
  let rows: string[][];

  if (isHeader) {
    headers = allRows[0];
    rows = allRows.slice(1);
  } else {
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows;
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };

  // Contar ocurrencias fuera de comillas
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch in counts) {
      counts[ch]++;
    }
  }

  // El que tenga más ocurrencias es el delimitador
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] >= counts[',']) return '\t';
  return ',';
}

function parseCsvLines(raw: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cells = parseCsvRow(trimmed, delimiter);
    // Filtrar filas donde todas las celdas están vacías
    if (cells.every((c) => c.trim() === '')) continue;

    rows.push(cells);
  }

  return rows;
}

function parseCsvRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Comilla escapada ""
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  cells.push(current.trim());
  return cells;
}
