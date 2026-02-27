import type { ReconcileRequest, ReconciliationResult, UploadResponse, ColumnMapping, ReconciliationType } from '@shared/types';

const BASE_URL = '/api';

export interface UploadResult extends UploadResponse {
  sourceAAutoMapping: Partial<ColumnMapping>;
  sourceBAutoMapping: Partial<ColumnMapping>;
}

export async function uploadFiles(
  sourceAFile: File,
  sourceBFile: File,
  reconciliationType: ReconciliationType
): Promise<UploadResult> {
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
