import type { ReconcileRequest, ReconciliationResult, UploadResponse, ColumnMapping, ReconciliationType, WorksheetInfo } from '@shared/types';

const BASE_URL = '/api';

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
    const error = await res.json();
    throw new Error(error.error || 'Error al subir archivos');
  }

  return res.json();
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
    const error = await res.json();
    throw new Error(error.error || 'Error al seleccionar hojas');
  }

  return res.json();
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
    const error = await res.json();
    throw new Error(error.error || 'Error al ejecutar conciliación');
  }

  return res.json();
}

export function getExportUrl(resultId: string): string {
  return `${BASE_URL}/export/${resultId}`;
}
