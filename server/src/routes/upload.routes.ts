// v5
console.log('>>>>>> UPLOAD ROUTES V5 CARGADO <<<<<<');
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { upload } from '../middleware/upload.middleware.js';
import { parsePdfFile } from '../services/pdf-parser.service.js';
import { parseCsvFile } from '../services/csv-parser.service.js';
import { autoDetectColumns } from '../services/normalizer.service.js';
import { readExcelFull } from '../utils/excel-full-reader.js';
import type { FilePreview, ReconciliationType } from '../../../shared/types.js';

export interface SessionData {
  reconciliationType: ReconciliationType;
  sourceAHeaders: string[];
  sourceARows: string[][];
  sourceBHeaders: string[];
  sourceBRows: string[][];
  sourceAAutoMapping: ReturnType<typeof autoDetectColumns>;
  sourceBAutoMapping: ReturnType<typeof autoDetectColumns>;
}

export const sessions = new Map<string, SessionData>();

export const uploadRouter = Router();

uploadRouter.post(
  '/',
  upload.fields([
    { name: 'sourceAFile', maxCount: 1 },
    { name: 'sourceBFile', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const reconciliationType = (req.body.reconciliationType || 'bank') as ReconciliationType;

      if (!files.sourceAFile?.[0] || !files.sourceBFile?.[0]) {
        res.status(400).json({
          error: 'Se requieren dos archivos para la conciliación',
        });
        return;
      }

      const sourceAFile = files.sourceAFile[0];
      const sourceBFile = files.sourceBFile[0];

      const sourceARaw = await parseFile(sourceAFile);
      const sourceBRaw = await parseFile(sourceBFile);

      // Debug: últimas filas CRUDAS antes de filtrar
      console.log(`[RAW Source B] Total crudas: ${sourceBRaw.rows.length}`);
      sourceBRaw.rows.slice(-5).forEach((row, i) => {
        const idx = sourceBRaw.rows.length - 5 + i;
        console.log(`[RAW Source B] Fila cruda ${idx}: ${row.filter(c => (c ?? '').trim()).join(' | ')}`);
      });

      // Filtrar filas que no son transacciones reales
      const sourceAParsed = {
        headers: sourceARaw.headers,
        rows: filterDataRows(sourceARaw.headers, sourceARaw.rows, 'Source A'),
      };
      const sourceBParsed = {
        headers: sourceBRaw.headers,
        rows: filterDataRows(sourceBRaw.headers, sourceBRaw.rows, 'Source B'),
      };

      // Debug: ver qué se parseó
      console.log('=== SOURCE A (Banco) ===');
      console.log('Headers:', sourceAParsed.headers);
      console.log('Primera fila:', sourceAParsed.rows[0]);
      console.log('Total filas:', sourceAParsed.rows.length);
      console.log('=== SOURCE B (Libro) ===');
      console.log('Headers:', sourceBParsed.headers);
      console.log('Primera fila:', sourceBParsed.rows[0]);
      console.log('Total filas:', sourceBParsed.rows.length);

      const sourceAAutoMapping = autoDetectColumns(sourceAParsed.headers);
      const sourceBAutoMapping = autoDetectColumns(sourceBParsed.headers);

      console.log('Auto-mapping A:', sourceAAutoMapping);
      console.log('Auto-mapping B:', sourceBAutoMapping);

      const sessionId = uuidv4();
      sessions.set(sessionId, {
        reconciliationType,
        sourceAHeaders: sourceAParsed.headers,
        sourceARows: sourceAParsed.rows,
        sourceBHeaders: sourceBParsed.headers,
        sourceBRows: sourceBParsed.rows,
        sourceAAutoMapping,
        sourceBAutoMapping,
      });

      const sourceAPreview: FilePreview = {
        headers: sourceAParsed.headers,
        sampleRows: sourceAParsed.rows,
        totalRows: sourceAParsed.rows.length,
      };

      const sourceBPreview: FilePreview = {
        headers: sourceBParsed.headers,
        sampleRows: sourceBParsed.rows,
        totalRows: sourceBParsed.rows.length,
      };

      res.json({
        sessionId,
        reconciliationType,
        sourceAPreview,
        sourceBPreview,
        sourceAAutoMapping,
        sourceBAutoMapping,
      });
    } catch (error) {
      next(error);
    }
  }
);

async function parseFile(
  file: Express.Multer.File
): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = path.extname(file.originalname).toLowerCase();
  console.log(`[PARSE FILE] ext=${ext}, file=${file.originalname}, typeof readExcelFull=${typeof readExcelFull}`);

  if (ext === '.xlsx' || ext === '.xls') {
    console.log('[PARSE FILE] >>> Llamando readExcelFull...');
    const result = await readExcelFull(file.path);
    console.log(`[PARSE FILE] <<< readExcelFull retornó ${result.rows.length} filas`);
    return result;
  }

  if (ext === '.csv') {
    const parsed = parseCsvFile(file.path);
    return { headers: parsed.headers, rows: parsed.rows };
  }

  if (ext === '.pdf') {
    const parsed = await parsePdfFile(file.path);
    return { headers: parsed.headers, rows: parsed.rows };
  }

  throw new Error(`Formato de archivo no soportado: ${ext}`);
}


/**
 * Filtra filas que no son transacciones reales.
 * Una transacción válida debe tener al menos una fecha Y un monto numérico.
 * Esto elimina: encabezados de página repetidos, nombre empresa, NIT, periodo,
 * "Pag: 2", "Impreso Por:", sub-cuentas, "SALDO ANTERIOR", etc.
 */
function filterDataRows(headers: string[], rows: string[][], label: string): string[][] {
  const headerFP = headers.map(h => h.toLowerCase().trim()).join('|');
  const before = rows.length;

  const filtered = rows.filter((row, idx) => {
    // Descartar encabezados repetidos (exports multi-página)
    if (row.map(c => c.toLowerCase().trim()).join('|') === headerFP) {
      console.log(`[FILTER ${label}] Fila ${idx}: HEADER REPETIDO → descartada`);
      return false;
    }

    // Debe tener fecha + monto
    let hasDate = false;
    let hasAmount = false;
    let dateVal = '';
    let amountVal = '';

    for (const cell of row) {
      const v = (cell ?? '').trim();
      if (!v) continue;

      if (!hasDate) {
        // DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD
        if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(v) ||
            /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) {
          hasDate = true;
          dateVal = v;
        }
      }

      if (!hasAmount) {
        // Número con separadores de miles/decimales, al menos 2 dígitos
        if (/^-?[\d.,]+$/.test(v) && (v.match(/\d/g) || []).length >= 2) {
          hasAmount = true;
          amountVal = v;
        }
      }

      if (hasDate && hasAmount) return true;
    }

    const nonEmpty = row.filter(c => (c ?? '').trim()).join(' | ');
    console.log(`[FILTER ${label}] Fila ${idx}: DESCARTADA (date=${hasDate}[${dateVal}] amount=${hasAmount}[${amountVal}]) | ${nonEmpty}`);
    return false;
  });

  console.log(`[FILTER ${label}] ${before} filas → ${filtered.length} filas (${before - filtered.length} descartadas)`);
  // Mostrar las últimas 3 filas que pasaron el filtro
  const last3 = filtered.slice(-3);
  last3.forEach((row, i) => {
    console.log(`[FILTER ${label}] Última fila ${filtered.length - last3.length + i}: ${row.filter(c => (c ?? '').trim()).join(' | ')}`);
  });
  return filtered;
}
