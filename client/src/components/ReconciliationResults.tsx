import { useState } from 'react';
import type { ReconciliationResult } from '@shared/types';
import { RECONCILIATION_LABELS } from '@shared/types';
import { SummaryCards } from './SummaryCard';
import { MatchedPairs } from './MatchedPairs';
import { TransactionTable } from './TransactionTable';
import { ExportButton } from './ExportButton';

interface ReconciliationResultsProps {
  results: ReconciliationResult;
}

type Tab = 'matched' | 'sourceAOnly' | 'sourceBOnly' | 'bankCharges' | 'discrepancies';

export function ReconciliationResults({ results }: ReconciliationResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('matched');
  const labels = RECONCILIATION_LABELS[results.reconciliationType];

  const discrepancies = results.matched.filter((m) => m.amountDifference > 0);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'matched', label: 'Conciliados', count: results.matched.length },
    { id: 'sourceAOnly', label: `Solo en ${labels.sourceA}`, count: results.sourceAOnly.length },
    { id: 'sourceBOnly', label: `Solo en ${labels.sourceB}`, count: results.sourceBOnly.length },
    ...(results.reconciliationType === 'bank'
      ? [{ id: 'bankCharges' as Tab, label: 'Gastos Bancarios', count: results.bankCharges.length }]
      : []),
    { id: 'discrepancies', label: 'Discrepancias', count: discrepancies.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">
          Resultados de {labels.title}
        </h2>
        <ExportButton resultId={results.id} />
      </div>

      <SummaryCards
        summary={results.summary}
        labels={labels}
        reconciliationType={results.reconciliationType}
      />

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4">
          {activeTab === 'matched' && (
            <MatchedPairs pairs={results.matched} labels={labels} />
          )}
          {activeTab === 'sourceAOnly' && (
            <TransactionTable
              transactions={results.sourceAOnly}
              title={`Transacciones solo en ${labels.sourceA}`}
              emptyMessage={`Todas las transacciones de ${labels.sourceA} fueron conciliadas`}
            />
          )}
          {activeTab === 'sourceBOnly' && (
            <TransactionTable
              transactions={results.sourceBOnly}
              title={`Transacciones solo en ${labels.sourceB}`}
              emptyMessage={`Todas las transacciones de ${labels.sourceB} fueron conciliadas`}
            />
          )}
          {activeTab === 'bankCharges' && (
            <TransactionTable
              transactions={results.bankCharges}
              title="Gastos Bancarios identificados en el extracto"
              emptyMessage="No se identificaron gastos bancarios"
            />
          )}
          {activeTab === 'discrepancies' && (
            <MatchedPairs pairs={discrepancies} labels={labels} />
          )}
        </div>
      </div>
    </div>
  );
}
