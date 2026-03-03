import type { MatchedPair, ReconciliationLabels } from '@shared/types';

interface MatchedPairsProps {
  pairs: MatchedPair[];
  labels: ReconciliationLabels;
}

const METHOD_LABELS: Record<string, { label: string; color: string }> = {
  exact: { label: 'Exacto', color: 'bg-green-100 text-green-700' },
  amount_date: { label: 'Monto+Fecha', color: 'bg-blue-100 text-blue-700' },
  amount_reference: { label: 'Monto+Ref', color: 'bg-indigo-100 text-indigo-700' },
  amount_fuzzy: { label: 'Monto aprox.', color: 'bg-yellow-100 text-yellow-700' },
  fuzzy: { label: 'Aproximado', color: 'bg-orange-100 text-orange-700' },
};

export function MatchedPairs({ pairs, labels }: MatchedPairsProps) {
  if (pairs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No se encontraron pares conciliados
      </div>
    );
  }

  const totalAmount = pairs.reduce((sum, p) => sum + Math.abs(p.sourceATransaction.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{pairs.length}</span> pares conciliados
        </p>
        <p className="text-sm font-semibold font-mono text-green-600">
          Total: {formatMoney(totalAmount)}
        </p>
      </div>
      <div className="overflow-auto rounded-lg border border-gray-200 max-h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100">
              <th
                className="px-2 py-2.5 text-left font-semibold text-blue-700 border-b-2 border-blue-300"
                colSpan={7}
              >
                {labels.sourceA}
              </th>
              <th
                className="px-2 py-2.5 text-left font-semibold text-purple-700 border-b-2 border-purple-300 border-l-2 border-l-gray-300"
                colSpan={7}
              >
                {labels.sourceB}
              </th>
              <th
                className="px-2 py-2.5 text-center font-semibold text-gray-600 border-b-2 border-gray-300 border-l-2 border-l-gray-300"
                colSpan={4}
              >
                Resultado
              </th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* Source A sub-headers */}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 w-10">Fila</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Fecha</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Descripción</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Desc. Original</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Ref.</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Monto</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Monto Orig.</th>
              {/* Source B sub-headers */}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 border-l-2 border-l-gray-300 w-10">Fila</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Fecha</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Descripción</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Desc. Original</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Ref.</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Monto</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Monto Orig.</th>
              {/* Result sub-headers */}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 border-l-2 border-l-gray-300">Confianza</th>
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500">Método</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Dif. Monto</th>
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500">Dif. Días</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, i) => {
              const method = METHOD_LABELS[pair.matchMethod] || {
                label: pair.matchMethod,
                color: 'bg-gray-100 text-gray-600',
              };
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  {/* Source A */}
                  <td className="px-2 py-2 text-center text-xs text-gray-400 font-mono">
                    {pair.sourceATransaction.sourceRow}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-medium">
                    {formatDate(pair.sourceATransaction.date)}
                  </td>
                  <td
                    className="px-2 py-2 max-w-[160px] truncate text-gray-700"
                    title={pair.sourceATransaction.description}
                  >
                    {pair.sourceATransaction.description}
                  </td>
                  <td className="px-2 py-2 max-w-[140px] truncate text-gray-400 italic text-xs" title={pair.sourceATransaction.rawDescription}>
                    {pair.sourceATransaction.rawDescription !== pair.sourceATransaction.description ? pair.sourceATransaction.rawDescription : '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-400 font-mono text-xs">
                    {pair.sourceATransaction.reference || '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-mono whitespace-nowrap font-semibold text-gray-800">
                    {formatMoney(pair.sourceATransaction.amount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-xs text-gray-400">
                    {pair.sourceATransaction.rawAmount}
                  </td>

                  {/* Source B */}
                  <td className="px-2 py-2 text-center text-xs text-gray-400 font-mono border-l-2 border-l-gray-200">
                    {pair.sourceBTransaction.sourceRow}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700 font-medium">
                    {formatDate(pair.sourceBTransaction.date)}
                  </td>
                  <td
                    className="px-2 py-2 max-w-[160px] truncate text-gray-700"
                    title={pair.sourceBTransaction.description}
                  >
                    {pair.sourceBTransaction.description}
                  </td>
                  <td className="px-2 py-2 max-w-[140px] truncate text-gray-400 italic text-xs" title={pair.sourceBTransaction.rawDescription}>
                    {pair.sourceBTransaction.rawDescription !== pair.sourceBTransaction.description ? pair.sourceBTransaction.rawDescription : '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-400 font-mono text-xs">
                    {pair.sourceBTransaction.reference || '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-mono whitespace-nowrap font-semibold text-gray-800">
                    {formatMoney(pair.sourceBTransaction.amount)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-xs text-gray-400">
                    {pair.sourceBTransaction.rawAmount}
                  </td>

                  {/* Result */}
                  <td className="px-2 py-2 text-center border-l-2 border-l-gray-200">
                    <ConfidenceBadge confidence={pair.confidence} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${method.color}`}>
                      {method.label}
                    </span>
                  </td>
                  <td className={`px-2 py-2 text-right font-mono text-xs whitespace-nowrap ${
                    pair.amountDifference > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'
                  }`}>
                    {pair.amountDifference > 0 ? formatMoney(pair.amountDifference) : '—'}
                  </td>
                  <td className={`px-2 py-2 text-center text-xs ${
                    pair.dateDifferenceInDays > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-400'
                  }`}>
                    {pair.dateDifferenceInDays > 0 ? `${pair.dateDifferenceInDays}d` : '—'}
                  </td>
                </tr>
              );
            })}
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
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
      {pct}%
    </span>
  );
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}$${abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(isoDate: string): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
