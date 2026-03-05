import { useState } from 'react';
import type { ReconciliationResult, ReconciliationType } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import type { UploadResult, UploadFileResult, SheetSelectionResponse } from './services/api';
import { selectSheets } from './services/api';
import { FileUpload } from './components/FileUpload';
import { ColumnMapper } from './components/ColumnMapper';
import { ReconciliationResults } from './components/ReconciliationResults';
import { SheetSelector } from './components/SheetSelector';

type Step = 'select' | 'upload' | 'sheet-select' | 'mapping' | 'results';

export default function App() {
  const [step, setStep] = useState<Step>('select');
  const [reconciliationType, setReconciliationType] = useState<ReconciliationType>('bank');
  const [uploadData, setUploadData] = useState<UploadResult | null>(null);
  const [results, setResults] = useState<ReconciliationResult | null>(null);
  const [sheetSelection, setSheetSelection] = useState<SheetSelectionResponse | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const labels = RECONCILIATION_LABELS[reconciliationType];
  const hasSheetStep = sheetSelection !== null;

  const handleTypeSelect = (type: ReconciliationType) => {
    setReconciliationType(type);
    setStep('upload');
  };

  const handleUploadComplete = (data: UploadFileResult) => {
    if ('requiresSheetSelection' in data && data.requiresSheetSelection) {
      setSheetSelection(data);
      setStep('sheet-select');
    } else {
      setUploadData(data as UploadResult);
      setStep('mapping');
    }
  };

  const handleSheetSelect = async (sourceAIndex: number, sourceBIndex: number) => {
    if (!sheetSelection) return;
    setSheetLoading(true);
    setSheetError(null);
    try {
      const result = await selectSheets(sheetSelection.sessionId, sourceAIndex, sourceBIndex);
      setUploadData(result);
      setSheetSelection(null);
      setStep('mapping');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Error al seleccionar hojas');
    } finally {
      setSheetLoading(false);
    }
  };

  const handleReconcileComplete = (data: ReconciliationResult) => {
    setResults(data);
    setStep('results');
  };

  const handleReset = () => {
    setStep('select');
    setUploadData(null);
    setResults(null);
    setSheetSelection(null);
    setSheetError(null);
  };

  const isAfterUpload = step === 'sheet-select' || step === 'mapping' || step === 'results';
  const isAfterSheets = step === 'mapping' || step === 'results';

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-100">
              {step === 'select' ? 'Conciliaciones' : labels.title}
            </h1>
            {step !== 'select' && (
              <button
                onClick={handleReset}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Nueva conciliaci&oacute;n
              </button>
            )}
          </div>
          {step !== 'select' && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <StepIndicator
                number={1}
                label="Subir archivos"
                active={step === 'upload'}
                completed={isAfterUpload}
              />
              <div className="h-px w-8 bg-gray-700" />
              {hasSheetStep && (
                <>
                  <StepIndicator
                    number={2}
                    label="Seleccionar hojas"
                    active={step === 'sheet-select'}
                    completed={isAfterSheets}
                  />
                  <div className="h-px w-8 bg-gray-700" />
                </>
              )}
              <StepIndicator
                number={hasSheetStep ? 3 : 2}
                label="Mapear columnas"
                active={step === 'mapping'}
                completed={step === 'results'}
              />
              <div className="h-px w-8 bg-gray-700" />
              <StepIndicator
                number={hasSheetStep ? 4 : 3}
                label="Resultados"
                active={step === 'results'}
                completed={false}
              />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {step === 'select' && (
          <TypeSelector onSelect={handleTypeSelect} />
        )}
        {step === 'upload' && (
          <FileUpload
            reconciliationType={reconciliationType}
            onComplete={handleUploadComplete}
          />
        )}
        {step === 'sheet-select' && sheetSelection && (
          <div className="space-y-4">
            <SheetSelector
              sourceASheets={sheetSelection.sourceASheets}
              sourceBSheets={sheetSelection.sourceBSheets}
              onSelect={handleSheetSelect}
              loading={sheetLoading}
            />
            {sheetError && (
              <div className="max-w-lg mx-auto bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-lg">
                {sheetError}
              </div>
            )}
          </div>
        )}
        {step === 'mapping' && uploadData && (
          <ColumnMapper
            uploadData={uploadData}
            reconciliationType={reconciliationType}
            onReconcile={handleReconcileComplete}
          />
        )}
        {step === 'results' && results && (
          <ReconciliationResults results={results} />
        )}
      </main>
    </div>
  );
}

function TypeSelector({ onSelect }: { onSelect: (type: ReconciliationType) => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-center text-gray-400 mb-8">
        Selecciona el tipo de conciliaci&oacute;n que deseas realizar
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => onSelect('bank')}
          className="bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-500/50 p-8 text-left transition-all"
        >
          <div className="text-4xl mb-4">{'\uD83C\uDFE6'}</div>
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            Conciliaci&oacute;n Bancaria
          </h3>
          <p className="text-sm text-gray-400">
            Compara el extracto del banco con tu libro contable para identificar
            diferencias y transacciones faltantes.
          </p>
        </button>

        <button
          onClick={() => onSelect('accounts')}
          className="bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-500/50 p-8 text-left transition-all"
        >
          <div className="text-4xl mb-4">{'\uD83D\uDCCA'}</div>
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            Conciliaci&oacute;n entre Cuentas
          </h3>
          <p className="text-sm text-gray-400">
            Compara dos cuentas contables entre s&iacute; para verificar que los
            movimientos cuadren correctamente.
          </p>
        </button>
      </div>
    </div>
  );
}

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  const bgClass = active
    ? 'bg-blue-500 text-white'
    : completed
      ? 'bg-green-500 text-white'
      : 'bg-gray-800 text-gray-500';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${bgClass}`}
      >
        {completed ? '\u2713' : number}
      </span>
      <span className={active ? 'font-medium text-gray-100' : 'text-gray-500'}>
        {label}
      </span>
    </div>
  );
}
