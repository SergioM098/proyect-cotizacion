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

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        {title}: {transactions.length} transacciones
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Descripci\u00f3n</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Referencia</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Monto</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Fila</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-2 text-gray-700 max-w-[300px] truncate">
                  {tx.description}
                </td>
                <td className="px-3 py-2 text-gray-500">{tx.reference || '-'}</td>
                <td className={`px-3 py-2 text-right whitespace-nowrap font-mono ${
                  tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatMoney(tx.amount)}
                </td>
                <td className="px-3 py-2 text-center text-gray-400">{tx.sourceRow}</td>
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
