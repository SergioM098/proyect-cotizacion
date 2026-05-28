import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
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
 * Parsea un PDF llamando al script Python (pdfplumber).
 * Devuelve headers + rows para que el usuario mapee las columnas.
 */
export function parsePdfFile(filePath: string): Promise<ParsedPdf> {
  return new Promise((resolve, reject) => {
    if (!PYTHON_SCRIPT) {
      reject(new Error('Error al parsear PDF: no se encontró server/scripts/pdf_to_json.py'));
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

export function getPdfPreview(parsed: ParsedPdf): FilePreview {
  return {
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    totalRows: parsed.totalRows,
  };
}
