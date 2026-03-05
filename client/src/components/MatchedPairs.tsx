import type { MatchedPair, ReconciliationLabels } from '@shared/types';

interface MatchedPairsProps {
  pairs: MatchedPair[];
  labels: ReconciliationLabels;
}

const METHOD_LABELS: Record<string, { label: string; color: string }> = {
  exact: { label: 'Exacto', color: 'bg-green-900/40 text-green-400' },
  amount_date: { label: 'Monto+Fecha', color: 'bg-blue-900/40 text-blue-400' },
  amount_reference: { label: 'Monto+Ref', color: 'bg-indigo-900/40 text-indigo-400' },
  amount_fuzzy: { label: 'Monto aprox.', color: 'bg-yellow-900/40 text-yellow-400' },
  fuzzy: { label: 'Aproximado', color: 'bg-orange-900/40 text-orange-400' },
  many_to_one: { label: 'N:1', color: 'bg-cyan-900/40 text-cyan-400' },
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
        <p className="text-sm text-gray-400">
          <span className="font-semibold text-gray-200">{pairs.length}</span> pares conciliados
        </p>
        <p className="text-sm font-semibold font-mono text-green-400">
          Total: {formatMoney(totalAmount)}
        </p>
      </div>
      <div className="rounded-lg border border-gray-800 max-h-[75vh] overflow-y-auto">
        <table className="w-full text-sm table-fixed">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800/60">
              <th
                className="px-1.5 py-2 text-left text-xs font-semibold text-blue-400 border-b-2 border-blue-800/60"
                colSpan={5}
              >
                {labels.sourceA}
              </th>
              <th
                className="px-1.5 py-2 text-left text-xs font-semibold text-purple-400 border-b-2 border-purple-800/60 border-l-2 border-l-gray-700"
                colSpan={5}
              >
                {labels.sourceB}
              </th>
              <th
                className="px-1.5 py-2 text-center text-xs font-semibold text-gray-400 border-b-2 border-gray-700 border-l-2 border-l-gray-700"
                colSpan={4}
              >
                Resultado
              </th>
            </tr>
            <tr className="bg-gray-800/40 border-b border-gray-700">
              {/* Source A sub-headers */}
              <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 w-[3%]">#</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[6%]">Fecha</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[20%]">Descripción</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[5%]">Ref.</th>
              <th className="px-1.5 py-1 text-right text-[10px] font-medium text-gray-500 w-[9%]">Monto</th>
              {/* Source B sub-headers */}
              <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 border-l-2 border-l-gray-700 w-[3%]">#</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[6%]">Fecha</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[20%]">Descripción</th>
              <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-500 w-[5%]">Ref.</th>
              <th className="px-1.5 py-1 text-right text-[10px] font-medium text-gray-500 w-[9%]">Monto</th>
              {/* Result sub-headers */}
              <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 border-l-2 border-l-gray-700 w-[4%]">Conf.</th>
              <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 w-[5%]">Método</th>
              <th className="px-1.5 py-1 text-right text-[10px] font-medium text-gray-500 w-[3%]">Dif.$</th>
              <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-500 w-[2%]">Días</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, i) => {
              const method = METHOD_LABELS[pair.matchMethod] || {
                label: pair.matchMethod,
                color: 'bg-gray-800 text-gray-400',
              };
              const hasRelated = pair.relatedTransactions && pair.relatedTransactions.length > 1;
              return (
                <><tr
                  key={i}
                  className={`border-b border-gray-800/50 hover:bg-blue-950/20 transition-colors ${
                    i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/20'
                  }`}
                >
                  {/* Source A */}
                  <td className="px-1.5 py-1.5 text-center text-[10px] text-gray-600 font-mono">
                    {pair.sourceATransaction.sourceRow}
                  </td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap text-xs text-gray-300">
                    {formatDate(pair.sourceATransaction.date)}
                  </td>
                  <td
                    className="px-1.5 py-1.5 truncate text-xs text-gray-300"
                    title={pair.sourceATransaction.rawDescription || pair.sourceATransaction.description}
                  >
                    {pair.sourceATransaction.description}
                  </td>
                  <td className="px-1.5 py-1.5 text-gray-500 font-mono text-[10px] truncate">
                    {pair.sourceATransaction.reference || '—'}
                  </td>
                  <td className="px-1.5 py-1.5 text-right font-mono whitespace-nowrap text-xs font-semibold text-gray-200">
                    {formatMoney(pair.sourceATransaction.amount)}
                  </td>

                  {/* Source B */}
                  <td className="px-1.5 py-1.5 text-center text-[10px] text-gray-600 font-mono border-l-2 border-l-gray-700">
                    {pair.sourceBTransaction.sourceRow}
                  </td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap text-xs text-gray-300">
                    {formatDate(pair.sourceBTransaction.date)}
                  </td>
                  <td
                    className="px-1.5 py-1.5 truncate text-xs text-gray-300"
                    title={pair.sourceBTransaction.rawDescription || pair.sourceBTransaction.description}
                  >
                    {pair.sourceBTransaction.description}
                  </td>
                  <td className="px-1.5 py-1.5 text-gray-500 font-mono text-[10px] truncate">
                    {pair.sourceBTransaction.reference || '—'}
                  </td>
                  <td className="px-1.5 py-1.5 text-right font-mono whitespace-nowrap text-xs font-semibold text-gray-200">
                    {formatMoney(pair.sourceBTransaction.amount)}
                  </td>

                  {/* Result */}
                  <td className="px-1.5 py-1.5 text-center border-l-2 border-l-gray-700">
                    <ConfidenceBadge confidence={pair.confidence} />
                  </td>
                  <td className="px-1.5 py-1.5 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${method.color}`}>
                      {method.label}
                    </span>
                  </td>
                  <td className={`px-1.5 py-1.5 text-right font-mono text-[10px] whitespace-nowrap ${
                    pair.amountDifference > 0 ? 'text-red-400 font-semibold' : 'text-gray-600'
                  }`}>
                    {pair.amountDifference > 0 ? formatMoney(pair.amountDifference) : '—'}
                  </td>
                  <td className={`px-1.5 py-1.5 text-center text-[10px] ${
                    pair.dateDifferenceInDays > 0 ? 'text-yellow-400 font-semibold' : 'text-gray-600'
                  }`}>
                    {pair.dateDifferenceInDays > 0 ? `${pair.dateDifferenceInDays}d` : '—'}
                  </td>
                </tr>
                {hasRelated && (
                  <tr key={`${i}-related`} className="bg-cyan-950/10 border-b border-cyan-800/30">
                    <td colSpan={14} className="px-4 py-1.5 text-[10px] text-cyan-400">
                      <span className="font-semibold">Agrupadas ({pair.relatedTransactions!.length}):</span>
                      {pair.relatedTransactions!.map((rt, ri) => (
                        <span key={ri} className="ml-2 inline-flex items-center gap-1">
                          <span className="text-gray-500">{formatDate(rt.date)}</span>
                          <span className="truncate max-w-[120px]">{rt.description}</span>
                          <span className="font-mono font-semibold">{formatMoney(rt.amount)}</span>
                          {ri < pair.relatedTransactions!.length - 1 && <span className="text-gray-600 ml-1">|</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
                </>
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
  if (confidence >= 0.9) colorClass = 'bg-green-900/40 text-green-400';
  else if (confidence >= 0.7) colorClass = 'bg-yellow-900/40 text-yellow-400';
  else colorClass = 'bg-orange-900/40 text-orange-400';

  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${colorClass}`}>
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
