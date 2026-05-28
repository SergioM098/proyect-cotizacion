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
  description: 'Descripcion',
  reference: 'Referencia',
  amount: 'Monto',
  debit: 'Debito',
  credit: 'Credito',
};

const FIELD_COLORS: Record<MappingField, string> = {
  date: 'bg-blue-900/40 text-blue-400 border-blue-800/50',
  description: 'bg-purple-900/40 text-purple-400 border-purple-800/50',
  reference: 'bg-gray-800 text-gray-400 border-gray-700',
  amount: 'bg-green-900/40 text-green-400 border-green-800/50',
  debit: 'bg-red-900/40 text-red-400 border-red-800/50',
  credit: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50',
};

const MAPPING_FIELDS: MappingField[] = ['date', 'description', 'reference', 'amount', 'debit', 'credit'];

export function ColumnMapper({ uploadData, reconciliationType, onReconcile }: ColumnMapperProps) {
  const labels = RECONCILIATION_LABELS[reconciliationType];
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceAMapping, setSourceAMapping] = useState<Partial<ColumnMapping>>(uploadData.sourceAAutoMapping ?? {});
  const [sourceBMapping, setSourceBMapping] = useState<Partial<ColumnMapping>>(uploadData.sourceBAutoMapping ?? {});

  const sourceAErrors = validateMapping(sourceAMapping, labels.sourceA);
  const sourceBErrors = validateMapping(sourceBMapping, labels.sourceB);
  const hasErrors = sourceAErrors.length > 0 || sourceBErrors.length > 0;

  const handleReconcile = async () => {
    if (hasErrors) return;

    setLoadingStep('Normalizando transacciones...');
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 50));
      setLoadingStep('Ejecutando conciliacion...');
      const result = await runReconciliation({
        sessionId: uploadData.sessionId,
        reconciliationType,
        sourceAMapping: toColumnMapping(sourceAMapping),
        sourceBMapping: toColumnMapping(sourceBMapping),
        amountTolerance: 0.01,
      });
      setLoadingStep('Preparando resultados...');
      onReconcile(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conciliar');
    } finally {
      setLoadingStep(null);
    }
  };

  return (
    <div className="space-y-8">
      <MappingSection
        title={labels.sourceA}
        subtitle={`${uploadData.sourceAPreview.totalRows} filas detectadas`}
        headers={uploadData.sourceAPreview.headers}
        sampleRows={uploadData.sourceAPreview.sampleRows}
        mapping={sourceAMapping}
        onMappingChange={setSourceAMapping}
        errors={sourceAErrors}
      />

      <MappingSection
        title={labels.sourceB}
        subtitle={`${uploadData.sourceBPreview.totalRows} filas detectadas`}
        headers={uploadData.sourceBPreview.headers}
        sampleRows={uploadData.sourceBPreview.sampleRows}
        mapping={sourceBMapping}
        onMappingChange={setSourceBMapping}
        errors={sourceBErrors}
      />

      {error && (
        <div className="bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleReconcile}
          disabled={!!loadingStep || hasErrors}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loadingStep ? (
            <span className="inline-flex items-center gap-2">
              <span className="spinner" />
              {loadingStep}
            </span>
          ) : (
            'Ejecutar conciliacion'
          )}
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
  mapping,
  onMappingChange,
  errors,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  sampleRows: string[][];
  mapping: Partial<ColumnMapping>;
  onMappingChange: (mapping: Partial<ColumnMapping>) => void;
  errors: string[];
}) {
  const columnToField = new Map<number, MappingField>();
  for (const [field, colIndex] of Object.entries(mapping)) {
    if (colIndex !== undefined) {
      columnToField.set(Number(colIndex), field as MappingField);
    }
  }

  const updateField = (field: MappingField, value: string) => {
    const next = { ...mapping };
    if (value === '') {
      delete next[field];
    } else {
      next[field] = Number(value);
    }
    onMappingChange(next);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-100 text-lg">{title}</h3>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {MAPPING_FIELDS.map((field) => (
          <label key={field} className="space-y-1">
            <span className="block text-xs font-medium text-gray-400">{FIELD_LABELS[field]}</span>
            <select
              value={mapping[field] ?? ''}
              onChange={(event) => updateField(field, event.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Sin columna</option>
              {headers.map((header, index) => (
                <option key={`${field}-${index}`} value={index}>
                  {header || `Columna ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="mb-4 bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-lg text-sm">
          <p className="font-medium mb-1">Selecciona las columnas requeridas:</p>
          <ul className="list-disc list-inside">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-auto max-h-[600px] rounded-lg border border-gray-800">
        <table className="text-sm w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800/60">
              {headers.map((h, i) => {
                const mappedField = columnToField.get(i);
                return (
                  <th
                    key={i}
                    className={`px-3 py-2 text-left font-medium border-b border-gray-700 ${
                      mappedField
                        ? FIELD_COLORS[mappedField]
                        : 'text-gray-500'
                    }`}
                  >
                    {h || `Columna ${i + 1}`}
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
              <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30'}>
                {headers.map((_, ci) => {
                  const mappedField = columnToField.get(ci);
                  return (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 truncate max-w-[220px] ${
                        mappedField ? 'text-gray-200 font-medium' : 'text-gray-500'
                      }`}
                    >
                      {row[ci] ?? ''}
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

function validateMapping(mapping: Partial<ColumnMapping> | undefined, sourceName: string): string[] {
  const errors: string[] = [];
  if (!mapping) {
    errors.push(`No se pudo detectar ninguna columna en ${sourceName}`);
    return errors;
  }
  if (mapping.date === undefined) {
    errors.push(`${sourceName}: Fecha`);
  }
  if (mapping.description === undefined) {
    errors.push(`${sourceName}: Descripcion`);
  }
  if (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined) {
    errors.push(`${sourceName}: Monto (o Debito/Credito)`);
  }
  return errors;
}

function toColumnMapping(mapping: Partial<ColumnMapping>): ColumnMapping {
  return {
    ...mapping,
    date: mapping.date ?? 0,
    description: mapping.description ?? 1,
  };
}
