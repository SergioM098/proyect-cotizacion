import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { upload } from '../middleware/upload.middleware.js';
import { parsePdfFile } from '../services/pdf-parser.service.js';
import { parseCsvFile } from '../services/csv-parser.service.js';
import { autoDetectColumns } from '../services/normalizer.service.js';
import { readExcelFull, listExcelSheets } from '../utils/excel-full-reader.js';
import { readXlsFile, listXlsSheets } from '../utils/xls-reader.js';
import type { FilePreview, ReconciliationType, WorksheetInfo } from '../../../shared/types.js';
import { TtlMap } from '../utils/ttl-map.js';

export interface SessionData {
  reconciliationType: ReconciliationType;
  sourceAFilePath?: string;
  sourceBFilePath?: string;
  sourceASheets?: WorksheetInfo[];
  sourceBSheets?: WorksheetInfo[];
  sourceAHeaders: string[];
  sourceARows: string[][];
  sourceBHeaders: string[];
  sourceBRows: string[][];
  sourceAAutoMapping: ReturnType<typeof autoDetectColumns>;
  sourceBAutoMapping: ReturnType<typeof autoDetectColumns>;
}

// Sesiones expiran después de 30 min de inactividad
export const sessions = new TtlMap<SessionData>(30 * 60 * 1000);

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

      // Detectar archivos Excel con múltiples hojas
      const extA = path.extname(sourceAFile.originalname).toLowerCase();
      const extB = path.extname(sourceBFile.originalname).toLowerCase();

      let sourceASheets: WorksheetInfo[] | undefined;
      let sourceBSheets: WorksheetInfo[] | undefined;

      if (extA === '.xlsx') {
        const sheets = await listExcelSheets(sourceAFile.path);
        if (sheets.length > 1) sourceASheets = sheets;
      } else if (extA === '.xls') {
        const sheets = listXlsSheets(sourceAFile.path);
        if (sheets.length > 1) sourceASheets = sheets;
      }
      if (extB === '.xlsx') {
        const sheets = await listExcelSheets(sourceBFile.path);
        if (sheets.length > 1) sourceBSheets = sheets;
      } else if (extB === '.xls') {
        const sheets = listXlsSheets(sourceBFile.path);
        if (sheets.length > 1) sourceBSheets = sheets;
      }

      // Si algún archivo tiene múltiples hojas, pausar para selección
      if (sourceASheets || sourceBSheets) {
        const sessionId = uuidv4();
        sessions.set(sessionId, {
          reconciliationType,
          sourceAFilePath: sourceAFile.path,
          sourceBFilePath: sourceBFile.path,
          sourceASheets,
          sourceBSheets,
          sourceAHeaders: [],
          sourceARows: [],
          sourceBHeaders: [],
          sourceBRows: [],
          sourceAAutoMapping: {},
          sourceBAutoMapping: {},
        });

        res.json({
          sessionId,
          requiresSheetSelection: true,
          sourceASheets,
          sourceBSheets,
        });
        return;
      }

      // Flujo normal: archivos de una sola hoja
      const sourceARaw = await parseFile(sourceAFile);
      const sourceBRaw = await parseFile(sourceBFile);

      const sourceAParsed = {
        headers: sourceARaw.headers,
        rows: filterDataRows(sourceARaw.headers, sourceARaw.rows),
      };
      const sourceBParsed = {
        headers: sourceBRaw.headers,
        rows: filterDataRows(sourceBRaw.headers, sourceBRaw.rows),
      };

      const sourceAAutoMapping = autoDetectColumns(sourceAParsed.headers, sourceAParsed.rows);
      const sourceBAutoMapping = autoDetectColumns(sourceBParsed.headers, sourceBParsed.rows);

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

// Endpoint para seleccionar hojas en archivos multi-hoja
uploadRouter.post('/select-sheets', async (req, res, next) => {
  try {
    const { sessionId, sourceASheetIndex, sourceBSheetIndex } = req.body;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada. Sube los archivos nuevamente.' });
      return;
    }

    if (!session.sourceAFilePath || !session.sourceBFilePath) {
      res.status(400).json({ error: 'Sesión sin archivos asociados.' });
      return;
    }

    const sourceAIdx = sourceASheetIndex ?? 0;
    const sourceBIdx = sourceBSheetIndex ?? 0;

    const sourceARaw = await parseFileByPath(session.sourceAFilePath, sourceAIdx);
    const sourceBRaw = await parseFileByPath(session.sourceBFilePath, sourceBIdx);

    const sourceAParsed = {
      headers: sourceARaw.headers,
      rows: filterDataRows(sourceARaw.headers, sourceARaw.rows),
    };
    const sourceBParsed = {
      headers: sourceBRaw.headers,
      rows: filterDataRows(sourceBRaw.headers, sourceBRaw.rows),
    };

    const sourceAAutoMapping = autoDetectColumns(sourceAParsed.headers, sourceAParsed.rows);
    const sourceBAutoMapping = autoDetectColumns(sourceBParsed.headers, sourceBParsed.rows);

    // Actualizar sesión con datos parseados
    session.sourceAHeaders = sourceAParsed.headers;
    session.sourceARows = sourceAParsed.rows;
    session.sourceBHeaders = sourceBParsed.headers;
    session.sourceBRows = sourceBParsed.rows;
    session.sourceAAutoMapping = sourceAAutoMapping;
    session.sourceBAutoMapping = sourceBAutoMapping;
    sessions.set(sessionId, session);

    res.json({
      sessionId,
      reconciliationType: session.reconciliationType,
      sourceAPreview: {
        headers: sourceAParsed.headers,
        sampleRows: sourceAParsed.rows,
        totalRows: sourceAParsed.rows.length,
      },
      sourceBPreview: {
        headers: sourceBParsed.headers,
        sampleRows: sourceBParsed.rows,
        totalRows: sourceBParsed.rows.length,
      },
      sourceAAutoMapping,
      sourceBAutoMapping,
    });
  } catch (error) {
    next(error);
  }
});

async function parseFile(
  file: Express.Multer.File,
  sheetIndex: number = 0
): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = path.extname(file.originalname).toLowerCase();
  return parseFileByPath(file.path, sheetIndex, ext);
}

async function parseFileByPath(
  filePath: string,
  sheetIndex: number = 0,
  ext?: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const fileExt = ext || path.extname(filePath).toLowerCase();

  if (fileExt === '.xlsx') {
    return readExcelFull(filePath, sheetIndex);
  }

  if (fileExt === '.xls') {
    return readXlsFile(filePath, sheetIndex);
  }

  if (fileExt === '.csv') {
    const parsed = parseCsvFile(filePath);
    return { headers: parsed.headers, rows: parsed.rows };
  }

  if (fileExt === '.pdf') {
    const parsed = await parsePdfFile(filePath);
    return { headers: parsed.headers, rows: parsed.rows };
  }

  throw new Error(`Formato de archivo no soportado: ${fileExt}`);
}

/**
 * Filtra filas que no son transacciones reales.
 * Una transacción válida debe tener al menos una fecha Y un monto numérico.
 */
function filterDataRows(headers: string[], rows: string[][]): string[][] {
  const headerFP = headers.map(h => h.toLowerCase().trim()).join('|');

  return rows.filter((row) => {
    // Descartar encabezados repetidos (exports multi-página)
    if (row.map(c => c.toLowerCase().trim()).join('|') === headerFP) {
      return false;
    }

    // Debe tener fecha + monto
    let hasDate = false;
    let hasAmount = false;

    for (const cell of row) {
      const v = (cell ?? '').trim();
      if (!v) continue;

      if (!hasDate) {
        if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(v) ||
            /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) {
          hasDate = true;
        }
      }

      if (!hasAmount) {
        if (/^-?[\d.,]+$/.test(v) && (v.match(/\d/g) || []).length >= 2) {
          hasAmount = true;
        }
      }

      if (hasDate && hasAmount) return true;
    }

    return false;
  });
}
