import { useState } from 'react';
import type { ReconciliationResult, ReconciliationType } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import type { UploadResult } from './services/api';
import { FileUpload } from './components/FileUpload';
import { ColumnMapper } from './components/ColumnMapper';
import { ReconciliationResults } from './components/ReconciliationResults';

type Step = 'select' | 'upload' | 'mapping' | 'results';

export default function App() {
  const [step, setStep] = useState<Step>('select');
  const [reconciliationType, setReconciliationType] = useState<ReconciliationType>('bank');
  const [uploadData, setUploadData] = useState<UploadResult | null>(null);
  const [results, setResults] = useState<ReconciliationResult | null>(null);

  const labels = RECONCILIATION_LABELS[reconciliationType];

  const handleTypeSelect = (type: ReconciliationType) => {
    setReconciliationType(type);
    setStep('upload');
  };

  const handleUploadComplete = (data: UploadResult) => {
    setUploadData(data);
    setStep('mapping');
  };

  const handleReconcileComplete = (data: ReconciliationResult) => {
    setResults(data);
    setStep('results');
  };

  const handleReset = () => {
    setStep('select');
    setUploadData(null);
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              {step === 'select' ? 'Conciliaciones' : labels.title}
            </h1>
            {step !== 'select' && (
              <button
                onClick={handleReset}
                className="text-sm text-blue-600 hover:text-blue-800"
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
                completed={step === 'mapping' || step === 'results'}
              />
              <div className="h-px w-8 bg-gray-300" />
              <StepIndicator
                number={2}
                label="Mapear columnas"
                active={step === 'mapping'}
                completed={step === 'results'}
              />
              <div className="h-px w-8 bg-gray-300" />
              <StepIndicator
                number={3}
                label="Resultados"
                active={step === 'results'}
                completed={false}
              />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {step === 'select' && (
          <TypeSelector onSelect={handleTypeSelect} />
        )}
        {step === 'upload' && (
          <FileUpload
            reconciliationType={reconciliationType}
            onComplete={handleUploadComplete}
          />
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
      <p className="text-center text-gray-600 mb-8">
        Selecciona el tipo de conciliaci&oacute;n que deseas realizar
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => onSelect('bank')}
          className="bg-white rounded-xl shadow-sm border-2 border-transparent hover:border-blue-400 p-8 text-left transition-all hover:shadow-md"
        >
          <div className="text-4xl mb-4">🏦</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Conciliaci&oacute;n Bancaria
          </h3>
          <p className="text-sm text-gray-500">
            Compara el extracto del banco con tu libro contable para identificar
            diferencias y transacciones faltantes.
          </p>
        </button>

        <button
          onClick={() => onSelect('accounts')}
          className="bg-white rounded-xl shadow-sm border-2 border-transparent hover:border-blue-400 p-8 text-left transition-all hover:shadow-md"
        >
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Conciliaci&oacute;n entre Cuentas
          </h3>
          <p className="text-sm text-gray-500">
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
    ? 'bg-blue-600 text-white'
    : completed
      ? 'bg-green-500 text-white'
      : 'bg-gray-200 text-gray-500';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${bgClass}`}
      >
        {completed ? '\u2713' : number}
      </span>
      <span className={active ? 'font-medium text-gray-900' : 'text-gray-500'}>
        {label}
      </span>
    </div>
  );
}
