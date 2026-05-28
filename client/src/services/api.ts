import type {
  ReconcileRequest,
  ReconciliationResult,
  UploadResponse,
  ColumnMapping,
  ReconciliationType,
  WorksheetInfo,
} from '@shared/types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface UploadResult extends UploadResponse {
  sourceAAutoMapping: Partial<ColumnMapping>;
  sourceBAutoMapping: Partial<ColumnMapping>;
}

export interface SheetSelectionResponse {
  sessionId: string;
  requiresSheetSelection: true;
  sourceASheets?: WorksheetInfo[];
  sourceBSheets?: WorksheetInfo[];
}

export type UploadFileResult = UploadResult | SheetSelectionResponse;

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text) {
    throw new Error('El servidor no devolvio respuesta. Verifica que la API este desplegada y configurada.');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('La API no devolvio JSON. Verifica la URL del backend en VITE_API_URL.');
  }
}

async function parseErrorResponse(res: Response, fallback: string): Promise<Error> {
  try {
    const error = await parseJsonResponse<{ error?: string; message?: string }>(res);
    return new Error(error.error || error.message || fallback);
  } catch (parseError) {
    return parseError instanceof Error ? parseError : new Error(fallback);
  }
}

export async function uploadFiles(
  sourceAFile: File,
  sourceBFile: File,
  reconciliationType: ReconciliationType
): Promise<UploadFileResult> {
  const formData = new FormData();
  formData.append('sourceAFile', sourceAFile);
  formData.append('sourceBFile', sourceBFile);
  formData.append('reconciliationType', reconciliationType);

  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw await parseErrorResponse(res, 'Error al subir archivos');
  }

  return parseJsonResponse<UploadFileResult>(res);
}

export async function selectSheets(
  sessionId: string,
  sourceASheetIndex: number,
  sourceBSheetIndex: number
): Promise<UploadResult> {
  const res = await fetch(`${BASE_URL}/upload/select-sheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, sourceASheetIndex, sourceBSheetIndex }),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res, 'Error al seleccionar hojas');
  }

  return parseJsonResponse<UploadResult>(res);
}

export async function runReconciliation(
  request: ReconcileRequest
): Promise<ReconciliationResult> {
  const res = await fetch(`${BASE_URL}/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res, 'Error al ejecutar conciliacion');
  }

  return parseJsonResponse<ReconciliationResult>(res);
}

export function getExportUrl(resultId: string): string {
  return `${BASE_URL}/export/${resultId}`;
}
