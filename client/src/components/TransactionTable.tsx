import type { Transaction } from '@shared/types';

interface TransactionTableProps {
  transactions: Transaction[];
  title: string;
  emptyMessage?: string;
}

export function TransactionTable({
  transactions,
  title,
  emptyMessage = 'No hay transacciones',
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">{emptyMessage}</div>
    );
  }

  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          {title}: <span className="font-semibold text-gray-700">{transactions.length}</span> transacciones
        </p>
        <p className={`text-sm font-semibold font-mono ${totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          Total: {formatMoney(totalAmount)}
        </p>
      </div>
      <div className="overflow-auto rounded-lg border border-gray-200 max-h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-14">Fila</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-28">Fecha</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Descripción</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Descripción Original</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-32">Referencia</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 w-36">Monto</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 w-36">Monto Original</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => (
              <tr
                key={tx.id}
                className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <td className="px-3 py-2.5 text-center text-xs text-gray-400 font-mono">
                  {tx.sourceRow}
                </td>
                <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap font-medium">
                  {formatDate(tx.date)}
                </td>
                <td className="px-3 py-2.5 text-gray-700" title={tx.description}>
                  <span className="block max-w-[300px] truncate">
                    {tx.description}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-400 italic text-xs" title={tx.rawDescription}>
                  <span className="block max-w-[300px] truncate">
                    {tx.rawDescription !== tx.description ? tx.rawDescription : <span className="text-gray-300">—</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                  {tx.reference || <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-3 py-2.5 text-right whitespace-nowrap font-mono font-semibold ${
                  tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatMoney(tx.amount)}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs text-gray-400">
                  {tx.rawAmount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
