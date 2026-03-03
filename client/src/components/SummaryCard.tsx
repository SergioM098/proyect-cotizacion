import type { ReconciliationSummary, ReconciliationLabels, ReconciliationType } from '@shared/types';

interface SummaryCardProps {
  summary: ReconciliationSummary;
  labels: ReconciliationLabels;
  reconciliationType?: ReconciliationType;
}

export function SummaryCards({ summary, labels, reconciliationType }: SummaryCardProps) {
  const showBankCharges = reconciliationType === 'bank' && summary.bankChargesCount > 0;

  return (
    <div className={`grid grid-cols-2 ${showBankCharges ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}>
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
    green: 'border-green-800/40 bg-green-950/20',
    yellow: 'border-yellow-800/40 bg-yellow-950/20',
    red: 'border-red-800/40 bg-red-950/20',
    blue: 'border-blue-800/40 bg-blue-950/20',
  };
  const valueColorMap = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${valueColorMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
