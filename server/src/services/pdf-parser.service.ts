import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { fileURLToPath } from 'url';
import type { FilePreview } from '../../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePythonScript(): string | null {
  const candidates = [
    path.join(process.cwd(), 'server/scripts/pdf_to_json.py'),
    path.join(process.cwd(), 'scripts/pdf_to_json.py'),
    path.join(__dirname, '../scripts/pdf_to_json.py'),
    path.join(__dirname, '../../scripts/pdf_to_json.py'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const PYTHON_SCRIPT = resolvePythonScript();
const PYTHON_COMMANDS = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

export interface ParsedPdf {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

/**
 * En Vercel no hay binario `python` dentro de la Node Function.
 * Localmente se usa el parser Python si existe; en Vercel o si Python falta,
 * se cae al parser JS para mantener el proyecto desplegable en una sola app.
 */
export async function parsePdfFile(filePath: string): Promise<ParsedPdf> {
  if (process.env.VERCEL) {
    return parsePdfWithNode(filePath);
  }

  try {
    return await parsePdfWithPython(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT') || message.includes('no se encontro')) {
      return parsePdfWithNode(filePath);
    }
    throw error;
  }
}

function parsePdfWithPython(filePath: string): Promise<ParsedPdf> {
  return new Promise((resolve, reject) => {
    if (!PYTHON_SCRIPT) {
      reject(new Error('Error al parsear PDF: no se encontro server/scripts/pdf_to_json.py'));
      return;
    }

    const runPython = (commandIndex: number) => {
      const command = PYTHON_COMMANDS[commandIndex];

      execFile(
        command,
        [PYTHON_SCRIPT, filePath],
        { maxBuffer: 50 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const isMissingCommand = (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
          if (isMissingCommand && commandIndex + 1 < PYTHON_COMMANDS.length) {
            runPython(commandIndex + 1);
            return;
          }

          if (error) {
            console.error('Error ejecutando script Python:', stderr);
            reject(new Error(`Error al parsear PDF: ${stderr || stdout || error.message}`));
            return;
          }

          try {
            const result = JSON.parse(stdout);

            if (result.error) {
              reject(new Error(`Error en script Python: ${result.error}`));
              return;
            }

            resolve({
              headers: result.headers || [],
              rows: result.rows || [],
              totalRows: result.totalRows || 0,
            });
          } catch (parseError) {
            reject(new Error(`Error parseando respuesta del script Python: ${parseError}`));
          }
        }
      );
    };

    runPython(0);
  });
}

async function parsePdfWithNode(filePath: string): Promise<ParsedPdf> {
  const data = await pdfParse(fs.readFileSync(filePath));
  const lines = data.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dateLedRows = parseDateLedRows(lines);
  if (dateLedRows.length > 0) {
    return {
      headers: ['Fecha', 'Descripcion', 'Valor'],
      rows: dateLedRows,
      totalRows: dateLedRows.length,
    };
  }

  const rows = lines
    .map(splitPdfLine)
    .filter((row) => row.length >= 2 && row.some((cell) => cell.trim() !== ''));

  if (rows.length === 0) {
    throw new Error(
      'No se pudo extraer texto tabular del PDF. En Vercel se usa un parser JavaScript; para PDFs escaneados o tablas complejas sube CSV/XLSX.'
    );
  }

  const headerIndex = findHeaderIndex(rows);
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const maxCols = Math.max(...rows.map((row) => row.length));
  const headers = headerIndex >= 0
    ? normalizeRow(rows[headerIndex], maxCols)
    : Array.from({ length: maxCols }, (_, index) => `Columna ${index + 1}`);

  const normalizedRows = dataRows.map((row) => normalizeRow(row, headers.length));

  return {
    headers,
    rows: normalizedRows,
    totalRows: normalizedRows.length,
  };
}

function parseDateLedRows(lines: string[]): string[][] {
  const rows: string[][] = [];
  const datePattern = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$|^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;

  for (let index = 0; index < lines.length; index++) {
    const date = lines[index].trim();
    if (!datePattern.test(date)) continue;

    const parts: string[] = [];
    index++;

    while (index < lines.length && !datePattern.test(lines[index].trim())) {
      const line = lines[index].replace(/\s+/g, ' ').trim();
      if (line && !isIgnoredPdfLine(line)) {
        parts.push(line);
      }
      index++;
    }

    index--;

    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    const extracted = extractTrailingAmount(text);
    if (!extracted) continue;

    const { amount, description } = extracted;
    if (!description) continue;

    rows.push([date, description, amount]);
  }

  return rows;
}

function extractTrailingAmount(text: string): { description: string; amount: string } | null {
  const match = text.match(/(-?\$?[\d.,]+)$/);
  if (!match || match.index === undefined) return null;

  let amount = match[1].replace('$', '').trim();
  let description = text.slice(0, match.index).trim();

  if (!amount.startsWith('-')) {
    const normalizedAmount = splitReferenceFromPositiveAmount(amount);
    if (normalizedAmount !== amount) {
      description = `${description}${amount.slice(0, amount.length - normalizedAmount.length)}`.trim();
      amount = normalizedAmount;
    }
  }

  return { description, amount };
}

function splitReferenceFromPositiveAmount(value: string): string {
  const decimalMatch = value.match(/^(\d+)((?:,\d{3})+\.\d{2})$/);
  if (!decimalMatch) return value;

  const prefix = decimalMatch[1];
  const rest = decimalMatch[2];
  if (prefix.length <= 3) return value;

  const preferredReferenceLength = prefix.startsWith('8') || prefix.startsWith('9') ? 9 : 10;
  const firstGroupLength = prefix.length - preferredReferenceLength;
  if (firstGroupLength >= 1 && firstGroupLength <= 3) {
    return `${prefix.slice(preferredReferenceLength)}${rest}`;
  }

  for (const referenceLength of [9, 10, 8, 7]) {
    const groupLength = prefix.length - referenceLength;
    if (groupLength >= 1 && groupLength <= 3) {
      return `${prefix.slice(referenceLength)}${rest}`;
    }
  }

  return value;
}

function isIgnoredPdfLine(line: string): boolean {
  const lower = line.toLowerCase();
  return [
    'empresa:',
    'numero de cuenta:',
    'número de cuenta:',
    'fecha y hora',
    'nit:',
    'tipo de cuenta:',
    'impreso por:',
    'saldo efectivo',
    'saldo en canje',
    'saldo total',
  ].some((marker) => lower.includes(marker));
}

function splitPdfLine(line: string): string[] {
  const wideSplit = line.split(/\s{2,}|\t+/).map((cell) => cell.trim()).filter(Boolean);
  if (wideSplit.length >= 2) return wideSplit;

  const dateAmountMatch = line.match(
    /^(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?)\s+(.+?)\s+(-?[\d.,]+)$/
  );
  if (dateAmountMatch) {
    return [dateAmountMatch[1], dateAmountMatch[2], dateAmountMatch[3]];
  }

  return [line];
}

function findHeaderIndex(rows: string[][]): number {
  const keywords = [
    'fecha', 'date', 'descripcion', 'descripcion', 'detalle', 'concepto',
    'monto', 'valor', 'debito', 'debito', 'credito', 'credito', 'saldo',
    'referencia', 'ref', 'documento',
  ];

  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 30);

  for (let index = 0; index < limit; index++) {
    const text = rows[index].join(' ').toLowerCase();
    const score = keywords.filter((keyword) => text.includes(keyword)).length;
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function normalizeRow(row: string[], length: number): string[] {
  if (row.length === length) return row;
  if (row.length > length) return row.slice(0, length);
  return [...row, ...Array(length - row.length).fill('')];
}

export function getPdfPreview(parsed: ParsedPdf): FilePreview {
  return {
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    totalRows: parsed.totalRows,
  };
}
