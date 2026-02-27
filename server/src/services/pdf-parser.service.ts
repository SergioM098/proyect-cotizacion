import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FilePreview } from '../../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/pdf_to_json.py');

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
    execFile(
      'python',
      [PYTHON_SCRIPT, filePath],
      { maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error('Error ejecutando script Python:', stderr);
          reject(new Error(`Error al parsear PDF: ${stderr || error.message}`));
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
  });
}

export function getPdfPreview(parsed: ParsedPdf): FilePreview {
  return {
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5),
    totalRows: parsed.totalRows,
  };
}
