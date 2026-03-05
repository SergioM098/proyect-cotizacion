import { useState } from 'react';
import type { WorksheetInfo } from '@shared/types';

interface SheetSelectorProps {
  sourceASheets?: WorksheetInfo[];
  sourceBSheets?: WorksheetInfo[];
  onSelect: (sourceAIndex: number, sourceBIndex: number) => void;
  loading: boolean;
}

export function SheetSelector({ sourceASheets, sourceBSheets, onSelect, loading }: SheetSelectorProps) {
  const [sourceAIndex, setSourceAIndex] = useState(0);
  const [sourceBIndex, setSourceBIndex] = useState(0);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <p className="text-center text-gray-400">
        Se detectaron archivos con m&uacute;ltiples hojas. Selecciona la hoja correcta para cada fuente.
      </p>

      {sourceASheets && (
        <SheetDropdown
          label="Extracto Bancario"
          sheets={sourceASheets}
          selected={sourceAIndex}
          onChange={setSourceAIndex}
        />
      )}

      {sourceBSheets && (
        <SheetDropdown
          label="Libro Contable"
          sheets={sourceBSheets}
          selected={sourceBIndex}
          onChange={setSourceBIndex}
        />
      )}

      <div className="flex justify-center">
        <button
          onClick={() => onSelect(sourceAIndex, sourceBIndex)}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="spinner" />
              Procesando hojas...
            </span>
          ) : (
            'Continuar'
          )}
        </button>
      </div>
    </div>
  );
}

function SheetDropdown({ label, sheets, selected, onChange }: {
  label: string;
  sheets: WorksheetInfo[];
  selected: number;
  onChange: (idx: number) => void;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <label className="block text-sm font-medium text-gray-200 mb-2">{label}</label>
      <select
        value={selected}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
      >
        {sheets.map((s) => (
          <option key={s.index} value={s.index}>
            {s.name} ({s.rowCount} filas)
          </option>
        ))}
      </select>
    </div>
  );
}
