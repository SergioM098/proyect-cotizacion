import { useState } from 'react';
import type { ColumnMapping, ReconciliationResult, ReconciliationType } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import type { UploadResult } from '../services/api';
import { runReconciliation } from '../services/api';

interface ColumnMapperProps {
  uploadData: UploadResult;
  reconciliationType: ReconciliationType;
  onReconcile: (result: ReconciliationResult) => void;
}

type MappingField = 'date' | 'description' | 'reference' | 'amount' | 'debit' | 'credit';

const FIELD_LABELS: Record<MappingField, string> = {
  date: 'Fecha',
  description: 'Descripción',
  reference: 'Referencia',
  amount: 'Monto',
  debit: 'Débito',
  credit: 'Crédito',
};

const FIELD_COLORS: Record<MappingField, string> = {
  date: 'bg-blue-100 text-blue-700 border-blue-200',
  description: 'bg-purple-100 text-purple-700 border-purple-200',
  reference: 'bg-gray-100 text-gray-700 border-gray-200',
  amount: 'bg-green-100 text-green-700 border-green-200',
  debit: 'bg-red-100 text-red-700 border-red-200',
  credit: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export function ColumnMapper({ uploadData, reconciliationType, onReconcile }: ColumnMapperProps) {
  const labels = RECONCILIATION_LABELS[reconciliationType];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceAMapping = buildColumnMapping(uploadData.sourceAAutoMapping);
  const sourceBMapping = buildColumnMapping(uploadData.sourceBAutoMapping);

  const sourceAErrors = validateMapping(uploadData.sourceAAutoMapping, labels.sourceA);
  const sourceBErrors = validateMapping(uploadData.sourceBAutoMapping, labels.sourceB);
  const hasErrors = sourceAErrors.length > 0 || sourceBErrors.length > 0;

  const handleReconcile = async () => {
    if (hasErrors) return;

    setLoading(true);
    setError(null);

    try {
      const result = await runReconciliation({
        sessionId: uploadData.sessionId,
        reconciliationType,
        sourceAMapping,
        sourceBMapping,
        amountTolerance: 0.01,
      });
      onReconcile(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conciliar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <MappingSection
        title={labels.sourceA}
        subtitle={`${uploadData.sourceAPreview.totalRows} filas detectadas`}
        headers={uploadData.sourceAPreview.headers}
        sampleRows={uploadData.sourceAPreview.sampleRows}
        autoMapping={uploadData.sourceAAutoMapping}
        errors={sourceAErrors}
      />

      <MappingSection
        title={labels.sourceB}
        subtitle={`${uploadData.sourceBPreview.totalRows} filas detectadas`}
        headers={uploadData.sourceBPreview.headers}
        sampleRows={uploadData.sourceBPreview.sampleRows}
        autoMapping={uploadData.sourceBAutoMapping}
        errors={sourceBErrors}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleReconcile}
          disabled={loading || hasErrors}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Conciliando...' : 'Ejecutar conciliación'}
        </button>
      </div>
    </div>
  );
}

function MappingSection({
  title,
  subtitle,
  headers,
  sampleRows,
  autoMapping,
  errors,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  sampleRows: string[][];
  autoMapping: Partial<ColumnMapping>;
  errors: string[];
}) {
  // Build a reverse map: column index → field name
  const columnToField = new Map<number, MappingField>();
  for (const [field, colIndex] of Object.entries(autoMapping)) {
    if (colIndex !== undefined) {
      columnToField.set(Number(colIndex), field as MappingField);
    }
  }

  const detectedFields = Object.entries(autoMapping)
    .filter(([, v]) => v !== undefined)
    .map(([field, colIndex]) => ({
      field: field as MappingField,
      column: headers[Number(colIndex)] || `Columna ${colIndex}`,
    }));

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-800 text-lg">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      {/* Campos detectados como badges */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Columnas detectadas
        </p>
        <div className="flex flex-wrap gap-2">
          {detectedFields.map(({ field, column }) => (
            <span
              key={field}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${FIELD_COLORS[field]}`}
            >
              {FIELD_LABELS[field]}
              <span className="opacity-60">→</span>
              {column}
            </span>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <p className="font-medium mb-1">No se pudieron detectar columnas requeridas:</p>
          <ul className="list-disc list-inside">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabla de preview con columnas resaltadas */}
      <div className="overflow-auto max-h-[400px] rounded-lg border border-gray-200">
        <table className="text-sm w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50">
              {headers.map((h, i) => {
                const mappedField = columnToField.get(i);
                return (
                  <th
                    key={i}
                    className={`px-3 py-2 text-left font-medium border-b ${
                      mappedField
                        ? FIELD_COLORS[mappedField]
                        : 'text-gray-400'
                    }`}
                  >
                    {h}
                    {mappedField && (
                      <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                        {FIELD_LABELS[mappedField]}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                {row.map((cell, ci) => {
                  const mappedField = columnToField.get(ci);
                  return (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 truncate max-w-[200px] ${
                        mappedField ? 'text-gray-800 font-medium' : 'text-gray-400'
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function validateMapping(
  auto: Partial<ColumnMapping> | undefined,
  sourceName: string
): string[] {
  const errors: string[] = [];
  if (!auto) {
    errors.push(`No se pudo detectar ninguna columna en ${sourceName}`);
    return errors;
  }
  if (auto.date === undefined) {
    errors.push('Fecha');
  }
  if (auto.description === undefined) {
    errors.push('Descripción');
  }
  if (auto.amount === undefined && auto.debit === undefined && auto.credit === undefined) {
    errors.push('Monto (o Débito/Crédito)');
  }
  return errors;
}

function buildColumnMapping(auto: Partial<ColumnMapping> | undefined): ColumnMapping {
  const mapping: ColumnMapping = {
    date: auto?.date ?? 0,
    description: auto?.description ?? 1,
  };
  if (auto?.reference !== undefined) mapping.reference = auto.reference;
  if (auto?.amount !== undefined) mapping.amount = auto.amount;
  if (auto?.debit !== undefined) mapping.debit = auto.debit;
  if (auto?.credit !== undefined) mapping.credit = auto.credit;
  return mapping;
}
