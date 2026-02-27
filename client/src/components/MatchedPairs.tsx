import type { MatchedPair, ReconciliationLabels } from '@shared/types';

interface MatchedPairsProps {
  pairs: MatchedPair[];
  labels: ReconciliationLabels;
}

const METHOD_LABELS: Record<string, string> = {
  exact: 'Exacto',
  amount_date: 'Monto+Fecha',
  amount_reference: 'Monto+Ref',
  amount_fuzzy: 'Monto aprox.',
  fuzzy: 'Aproximado',
};

export function MatchedPairs({ pairs, labels }: MatchedPairsProps) {
  if (pairs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No se encontraron pares conciliados
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        {pairs.length} pares conciliados
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-2 text-left font-medium text-gray-600" colSpan={3}>
                {labels.sourceA}
              </th>
              <th className="px-2 py-2 text-left font-medium text-gray-600" colSpan={3}>
                {labels.sourceB}
              </th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Confianza</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">M&eacute;todo</th>
            </tr>
            <tr className="bg-gray-50 border-b">
              <th className="px-2 py-1 text-left text-xs text-gray-500">Fecha</th>
              <th className="px-2 py-1 text-left text-xs text-gray-500">Descripci&oacute;n</th>
              <th className="px-2 py-1 text-right text-xs text-gray-500">Monto</th>
              <th className="px-2 py-1 text-left text-xs text-gray-500">Fecha</th>
              <th className="px-2 py-1 text-left text-xs text-gray-500">Descripci&oacute;n</th>
              <th className="px-2 py-1 text-right text-xs text-gray-500">Monto</th>
              <th className="px-2 py-1"></th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-2 whitespace-nowrap">{pair.sourceATransaction.date}</td>
                <td className="px-2 py-2 max-w-[180px] truncate">
                  {pair.sourceATransaction.description}
                </td>
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                  {formatMoney(pair.sourceATransaction.amount)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{pair.sourceBTransaction.date}</td>
                <td className="px-2 py-2 max-w-[180px] truncate">
                  {pair.sourceBTransaction.description}
                </td>
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                  {formatMoney(pair.sourceBTransaction.amount)}
                </td>
                <td className="px-2 py-2 text-center">
                  <ConfidenceBadge confidence={pair.confidence} />
                </td>
                <td className="px-2 py-2 text-center text-xs text-gray-500">
                  {METHOD_LABELS[pair.matchMethod] || pair.matchMethod}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  let colorClass: string;
  if (confidence >= 0.9) colorClass = 'bg-green-100 text-green-700';
  else if (confidence >= 0.7) colorClass = 'bg-yellow-100 text-yellow-700';
  else colorClass = 'bg-orange-100 text-orange-700';

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {pct}%
    </span>
  );
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}$${abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
