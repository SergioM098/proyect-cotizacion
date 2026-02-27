import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { upload } from '../middleware/upload.middleware.js';
import { parseExcelFile } from '../services/excel-parser.service.js';
import { parsePdfFile } from '../services/pdf-parser.service.js';
import { parseCsvFile } from '../services/csv-parser.service.js';
import { autoDetectColumns } from '../services/normalizer.service.js';
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

      const sourceAParsed = await parseFile(sourceAFile);
      const sourceBParsed = await parseFile(sourceBFile);

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
        sampleRows: sourceAParsed.rows.slice(0, 5),
        totalRows: sourceAParsed.rows.length,
      };

      const sourceBPreview: FilePreview = {
        headers: sourceBParsed.headers,
        sampleRows: sourceBParsed.rows.slice(0, 5),
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

  if (ext === '.xlsx' || ext === '.xls') {
    const parsed = await parseExcelFile(file.path);
    return { headers: parsed.headers, rows: parsed.rows };
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
