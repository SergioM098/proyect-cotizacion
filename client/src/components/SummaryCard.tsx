import type { ReconciliationSummary, ReconciliationLabels, ReconciliationType } from '@shared/types';

interface SummaryCardProps {
  summary: ReconciliationSummary;
  labels: ReconciliationLabels;
  reconciliationType?: ReconciliationType;
}

export function SummaryCards({ summary, labels, reconciliationType }: SummaryCardProps) {
  const rate = Math.round(summary.reconciliationRate * 100);
  const showBankCharges = reconciliationType === 'bank' && summary.bankChargesCount > 0;

  return (
    <div className={`grid grid-cols-2 ${showBankCharges ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-6`}>
      <Card
        label="Conciliadas"
        value={String(summary.matchedCount)}
        detail={`$${formatNumber(summary.matchedAmount)}`}
        color="green"
      />
      <Card
        label={`Solo en ${labels.sourceA}`}
        value={String(summary.sourceAOnlyCount)}
        detail={`$${formatNumber(summary.sourceAOnlyAmount)}`}
        color="yellow"
      />
      <Card
        label={`Solo en ${labels.sourceB}`}
        value={String(summary.sourceBOnlyCount)}
        detail={`$${formatNumber(summary.sourceBOnlyAmount)}`}
        color="red"
      />
      {showBankCharges && (
        <Card
          label="Gastos Bancarios"
          value={String(summary.bankChargesCount)}
          detail={`$${formatNumber(summary.bankChargesAmount)}`}
          color="blue"
        />
      )}
      <Card
        label="Tasa de Conciliaci\u00f3n"
        value={`${rate}%`}
        detail={`${summary.discrepancyCount} discrepancias`}
        color={rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red'}
      />
    </div>
  );
}

function Card({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colorMap = {
    green: 'border-green-200 bg-green-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    red: 'border-red-200 bg-red-50',
    blue: 'border-blue-200 bg-blue-50',
  };
  const valueColorMap = {
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-2xl font-bold ${valueColorMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
