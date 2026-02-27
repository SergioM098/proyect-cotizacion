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
  description: 'Descripci\u00f3n',
  reference: 'Referencia',
  amount: 'Monto (\u00fanico)',
  debit: 'D\u00e9bito',
  credit: 'Cr\u00e9dito',
};

export function ColumnMapper({ uploadData, reconciliationType, onReconcile }: ColumnMapperProps) {
  const labels = RECONCILIATION_LABELS[reconciliationType];
  const [sourceAMapping, setSourceAMapping] = useState<Record<string, string>>(
    initMapping(uploadData.sourceAAutoMapping)
  );
  const [sourceBMapping, setSourceBMapping] = useState<Record<string, string>>(
    initMapping(uploadData.sourceBAutoMapping)
  );
  const [dateTolerance, setDateTolerance] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReconcile = async () => {
    if (!sourceAMapping.date || !sourceAMapping.description) {
      setError(`${labels.sourceA} requiere al menos Fecha y Descripci\u00f3n`);
      return;
    }
    if (!sourceBMapping.date || !sourceBMapping.description) {
      setError(`${labels.sourceB} requiere al menos Fecha y Descripci\u00f3n`);
      return;
    }
    if (!sourceAMapping.amount && (!sourceAMapping.debit && !sourceAMapping.credit)) {
      setError(`${labels.sourceA} requiere Monto o D\u00e9bito/Cr\u00e9dito`);
      return;
    }
    if (!sourceBMapping.amount && (!sourceBMapping.debit && !sourceBMapping.credit)) {
      setError(`${labels.sourceB} requiere Monto o D\u00e9bito/Cr\u00e9dito`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await runReconciliation({
        sessionId: uploadData.sessionId,
        reconciliationType,
        sourceAMapping: buildColumnMapping(sourceAMapping),
        sourceBMapping: buildColumnMapping(sourceBMapping),
        dateTolerance,
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
        mapping={sourceAMapping}
        onMappingChange={setSourceAMapping}
      />

      <MappingSection
        title={labels.sourceB}
        subtitle={`${uploadData.sourceBPreview.totalRows} filas detectadas`}
        headers={uploadData.sourceBPreview.headers}
        sampleRows={uploadData.sourceBPreview.sampleRows}
        mapping={sourceBMapping}
        onMappingChange={setSourceBMapping}
      />

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Configuraci&oacute;n</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">
            Tolerancia de fechas (d&iacute;as):
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={dateTolerance}
            onChange={(e) => setDateTolerance(Number(e.target.value))}
            className="w-20 px-3 py-1.5 border rounded-lg text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleReconcile}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Conciliando...' : 'Ejecutar conciliaci\u00f3n'}
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
}: {
  title: string;
  subtitle: string;
  headers: string[];
  sampleRows: string[][];
  mapping: Record<string, string>;
  onMappingChange: (m: Record<string, string>) => void;
}) {
  const updateField = (field: string, value: string) => {
    onMappingChange({ ...mapping, [field]: value });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      <div className="overflow-x-auto mb-6">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-gray-50">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-gray-600 border-b"
                >
                  <span className="text-xs text-gray-400 mr-1">[{i}]</span>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-100">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-gray-700 truncate max-w-[200px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {(Object.keys(FIELD_LABELS) as MappingField[]).map((field) => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              {FIELD_LABELS[field]}
              {(field === 'date' || field === 'description') && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <select
              value={mapping[field] || ''}
              onChange={(e) => updateField(field, e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="">-- Seleccionar --</option>
              {headers.map((h, i) => (
                <option key={i} value={String(i)}>
                  [{i}] {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function initMapping(
  auto?: Partial<ColumnMapping>
): Record<string, string> {
  if (!auto) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(auto)) {
    if (value !== undefined) result[key] = String(value);
  }
  return result;
}

function buildColumnMapping(mapping: Record<string, string>): ColumnMapping {
  const result: ColumnMapping = {
    date: parseInt(mapping.date) || 0,
    description: parseInt(mapping.description) || 1,
  };
  if (mapping.reference) result.reference = parseInt(mapping.reference);
  if (mapping.amount) result.amount = parseInt(mapping.amount);
  if (mapping.debit) result.debit = parseInt(mapping.debit);
  if (mapping.credit) result.credit = parseInt(mapping.credit);
  return result;
}
