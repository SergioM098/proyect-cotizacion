import { useState, useCallback } from 'react';
import type { ReconciliationType } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import type { UploadFileResult } from '../services/api';
import { uploadFiles } from '../services/api';

interface FileUploadProps {
  reconciliationType: ReconciliationType;
  onComplete: (data: UploadFileResult) => void;
}

export function FileUpload({ reconciliationType, onComplete }: FileUploadProps) {
  const labels = RECONCILIATION_LABELS[reconciliationType];
  const [sourceAFile, setSourceAFile] = useState<File | null>(null);
  const [sourceBFile, setSourceBFile] = useState<File | null>(null);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!sourceAFile || !sourceBFile) return;

    setLoadingStep('Subiendo archivos...');
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 50));
      setLoadingStep('Analizando y detectando columnas...');
      const result = await uploadFiles(sourceAFile, sourceBFile, reconciliationType);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoadingStep(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DropZone
          label={labels.sourceA}
          description={`Archivo de ${labels.sourceA.toLowerCase()} (Excel, CSV o PDF)`}
          file={sourceAFile}
          onFile={setSourceAFile}
          accept=".xlsx,.xls,.csv,.pdf"
        />
        <DropZone
          label={labels.sourceB}
          description={`Archivo de ${labels.sourceB.toLowerCase()} (Excel, CSV o PDF)`}
          file={sourceBFile}
          onFile={setSourceBFile}
          accept=".xlsx,.xls,.csv,.pdf"
        />
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!sourceAFile || !sourceBFile || !!loadingStep}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loadingStep ? (
            <span className="inline-flex items-center gap-2">
              <span className="spinner" />
              {loadingStep}
            </span>
          ) : (
            'Subir y continuar'
          )}
        </button>
      </div>
    </div>
  );
}

function DropZone({
  label,
  description,
  file,
  onFile,
  accept,
}: {
  label: string;
  description: string;
  file: File | null;
  onFile: (file: File) => void;
  accept: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFile(selected);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer bg-gray-900/50 ${
        dragOver
          ? 'border-blue-500 bg-blue-950/30'
          : file
            ? 'border-green-500/50 bg-green-950/20'
            : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <label className="cursor-pointer block">
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        <div className="space-y-2">
          <div className="text-4xl">{file ? '\u2705' : '\uD83D\uDCC4'}</div>
          <p className="font-semibold text-gray-200">{label}</p>
          {file ? (
            <p className="text-sm text-green-400">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-400">{description}</p>
              <p className="text-xs text-gray-600">
                Arrastra aqu&iacute; o haz clic para seleccionar
              </p>
            </>
          )}
        </div>
      </label>
    </div>
  );
}
