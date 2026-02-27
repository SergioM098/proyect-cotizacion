import { useState, useCallback } from 'react';
import type { ReconciliationType } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import type { UploadResult } from '../services/api';
import { uploadFiles } from '../services/api';

interface FileUploadProps {
  reconciliationType: ReconciliationType;
  onComplete: (data: UploadResult) => void;
}

export function FileUpload({ reconciliationType, onComplete }: FileUploadProps) {
  const labels = RECONCILIATION_LABELS[reconciliationType];
  const [sourceAFile, setSourceAFile] = useState<File | null>(null);
  const [sourceBFile, setSourceBFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!sourceAFile || !sourceBFile) return;

    setLoading(true);
    setError(null);

    try {
      const result = await uploadFiles(sourceAFile, sourceBFile, reconciliationType);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!sourceAFile || !sourceBFile || loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Procesando archivos...' : 'Subir y continuar'}
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
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        dragOver
          ? 'border-blue-400 bg-blue-50'
          : file
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-gray-400'
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
          <p className="font-semibold text-gray-700">{label}</p>
          {file ? (
            <p className="text-sm text-green-600">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500">{description}</p>
              <p className="text-xs text-gray-400">
                Arrastra aqu&iacute; o haz clic para seleccionar
              </p>
            </>
          )}
        </div>
      </label>
    </div>
  );
}
