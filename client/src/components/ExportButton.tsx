import { getExportUrl } from '../services/api';

interface ExportButtonProps {
  resultId: string;
}

export function ExportButton({ resultId }: ExportButtonProps) {
  const handleExport = () => {
    const url = getExportUrl(resultId);
    window.open(url, '_blank');
  };

  return (
    <button
      onClick={handleExport}
      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
    >
      Exportar a Excel
    </button>
  );
}
