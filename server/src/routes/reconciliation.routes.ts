import { Router } from 'express';
import { sessions } from './upload.routes.js';
import { normalizeTransactions } from '../services/normalizer.service.js';
import { reconcile } from '../services/reconciliation.service.js';
import type { ReconcileRequest, ReconciliationResult, Transaction } from '../../../shared/types.js';
import { RECONCILIATION_LABELS } from '../utils/labels.js';
import ExcelJS from 'exceljs';

export const reconciliationRouter = Router();

const results = new Map<string, ReconciliationResult>();

reconciliationRouter.post('/reconcile', (req, res, next) => {
  try {
    const body = req.body as ReconcileRequest;
    const { sessionId, sourceAMapping, sourceBMapping, reconciliationType } = body;
    const dateTolerance = body.dateTolerance ?? 3;
    const amountTolerance = body.amountTolerance ?? 0.01;

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada. Sube los archivos nuevamente.' });
      return;
    }

    const sourceATransactions = normalizeTransactions(
      session.sourceARows,
      session.sourceAHeaders,
      sourceAMapping
    );

    const sourceBTransactions = normalizeTransactions(
      session.sourceBRows,
      session.sourceBHeaders,
      sourceBMapping
    );

    if (sourceATransactions.length === 0) {
      res.status(400).json({
        error: 'No se pudieron extraer transacciones del primer archivo. Verifica el mapeo de columnas.',
      });
      return;
    }

    if (sourceBTransactions.length === 0) {
      res.status(400).json({
        error: 'No se pudieron extraer transacciones del segundo archivo. Verifica el mapeo de columnas.',
      });
      return;
    }

    const result = reconcile(
      sourceATransactions,
      sourceBTransactions,
      { dateTolerance, amountTolerance },
      reconciliationType || session.reconciliationType
    );

    results.set(result.id, result);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

reconciliationRouter.get('/results/:id', (req, res) => {
  const result = results.get(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Resultado no encontrado.' });
    return;
  }
  res.json(result);
});

reconciliationRouter.get('/export/:id', async (req, res, next) => {
  try {
    const result = results.get(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Resultado no encontrado.' });
      return;
    }

    const labels = RECONCILIATION_LABELS[result.reconciliationType];
    const workbook = new ExcelJS.Workbook();

    // ========== HOJA PRINCIPAL: Formato estilo conciliación bancaria ==========
    const sheet = workbook.addWorksheet(labels.title);
    sheet.getColumn(1).width = 14;  // Fecha
    sheet.getColumn(2).width = 14;  // Doc/Ref
    sheet.getColumn(3).width = 42;  // Descripción
    sheet.getColumn(4).width = 20;  // Valor
    sheet.getColumn(5).width = 20;  // Total sección

    let row = 1;

    // Título principal
    sheet.mergeCells(row, 1, row, 5);
    const titleCell = sheet.getCell(row, 1);
    titleCell.value = labels.title.toUpperCase();
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = darkGreenFill();
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 30;
    row++;

    // Fecha de generación
    sheet.mergeCells(row, 1, row, 3);
    sheet.getCell(row, 1).value = `Fecha de generación: ${new Date().toLocaleDateString('es-CO')}`;
    sheet.getCell(row, 1).font = { italic: true, size: 10 };
    row += 2;

    if (result.reconciliationType === 'bank') {
      // Categorizar transacciones del extracto bancario (sourceA)
      const consignacionesExtracto = result.sourceAOnly.filter(t => t.amount >= 0);
      const pagosExtracto = result.sourceAOnly.filter(t => t.amount < 0);

      // Categorizar transacciones del libro contable (sourceB)
      const pagosLibros = result.sourceBOnly.filter(t => t.amount < 0);
      const consignacionesLibros = result.sourceBOnly.filter(t => t.amount >= 0);

      // Sección 1: (+) Consignaciones en extracto y no en libros
      row = writeTransactionSection(sheet, row,
        '(+) CONSIGNACIONES EN EXTRACTO Y NO EN LIBROS',
        consignacionesExtracto, true);
      row++;

      // Sección 2: (-) Pagos en extractos y no en libros
      row = writeTransactionSection(sheet, row,
        '(-) PAGOS EN EXTRACTOS Y NO EN LIBROS',
        pagosExtracto, true);
      row++;

      // Sección 3: (+) Pagos en libros y no en extracto
      row = writeTransactionSection(sheet, row,
        '(+) PAGOS EN LIBROS Y NO EN EXTRACTO',
        pagosLibros, true);
      row++;

      // Sección 4: (-) Consignaciones en libros y no en extracto
      row = writeTransactionSection(sheet, row,
        '(-) CONSIGNACIONES EN LIBROS Y NO EN EXTRACTO',
        consignacionesLibros, true);
      row++;

      // Sección 5: Gastos Bancarios
      if (result.bankCharges.length > 0) {
        row = writeTransactionSection(sheet, row,
          'GASTOS BANCARIOS',
          result.bankCharges, true);
        row++;
      }
    } else {
      // Conciliación entre cuentas: 2 secciones
      row = writeTransactionSection(sheet, row,
        `SOLO EN ${labels.sourceA.toUpperCase()}`,
        result.sourceAOnly, false);
      row++;

      row = writeTransactionSection(sheet, row,
        `SOLO EN ${labels.sourceB.toUpperCase()}`,
        result.sourceBOnly, false);
      row++;
    }

    // ---- RESUMEN al final ----
    row++;
    row = writeSectionBar(sheet, row, 'RESUMEN', null);
    row = writeSummaryLine(sheet, row, `Total transacciones ${labels.sourceA}`, result.summary.totalSourceATransactions);
    row = writeSummaryLine(sheet, row, `Total transacciones ${labels.sourceB}`, result.summary.totalSourceBTransactions);
    row = writeSummaryLine(sheet, row, 'Conciliadas', result.summary.matchedCount);
    row = writeSummaryLine(sheet, row, `Solo en ${labels.sourceA}`, result.summary.sourceAOnlyCount);
    row = writeSummaryLine(sheet, row, `Solo en ${labels.sourceB}`, result.summary.sourceBOnlyCount);
    if (result.summary.bankChargesCount > 0) {
      row = writeSummaryLine(sheet, row, 'Gastos Bancarios', result.summary.bankChargesCount);
      row = writeSummaryLine(sheet, row, 'Total Gastos Bancarios', `$${result.summary.bankChargesAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`);
    }
    row = writeSummaryLine(sheet, row, 'Tasa de conciliación', `${(result.summary.reconciliationRate * 100).toFixed(1)}%`);
    row = writeSummaryLine(sheet, row, 'Discrepancias', result.summary.discrepancyCount);

    // ========== HOJA 2: Transacciones Conciliadas ==========
    const matchedSheet = workbook.addWorksheet('Conciliados');
    matchedSheet.getColumn(1).width = 12;
    matchedSheet.getColumn(2).width = 30;
    matchedSheet.getColumn(3).width = 16;
    matchedSheet.getColumn(4).width = 12;
    matchedSheet.getColumn(5).width = 30;
    matchedSheet.getColumn(6).width = 16;
    matchedSheet.getColumn(7).width = 12;
    matchedSheet.getColumn(8).width = 16;

    // Título Conciliados
    let mRow = 1;
    matchedSheet.mergeCells(mRow, 1, mRow, 8);
    const mTitle = matchedSheet.getCell(mRow, 1);
    mTitle.value = 'TRANSACCIONES CONCILIADAS';
    mTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    mTitle.fill = darkGreenFill();
    mTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    matchedSheet.getRow(mRow).height = 25;
    mRow++;

    // Headers de conciliados
    const matchedHeaders = [
      `Fecha ${labels.sourceA}`, `Descripción ${labels.sourceA}`, `Monto ${labels.sourceA}`,
      `Fecha ${labels.sourceB}`, `Descripción ${labels.sourceB}`, `Monto ${labels.sourceB}`,
      'Confianza', 'Método',
    ];
    for (let i = 0; i < matchedHeaders.length; i++) {
      const cell = matchedSheet.getCell(mRow, i + 1);
      cell.value = matchedHeaders[i];
      cell.font = { bold: true, size: 10 };
      cell.fill = lightGreenFill();
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center' };
    }
    mRow++;

    // Data de conciliados
    for (const m of result.matched) {
      matchedSheet.getCell(mRow, 1).value = m.sourceATransaction.date;
      matchedSheet.getCell(mRow, 1).border = thinBorder();
      matchedSheet.getCell(mRow, 2).value = m.sourceATransaction.description;
      matchedSheet.getCell(mRow, 2).border = thinBorder();
      const aAmt = matchedSheet.getCell(mRow, 3);
      aAmt.value = m.sourceATransaction.amount;
      aAmt.numFmt = '#,##0.00';
      aAmt.alignment = { horizontal: 'right' };
      aAmt.border = thinBorder();

      matchedSheet.getCell(mRow, 4).value = m.sourceBTransaction.date;
      matchedSheet.getCell(mRow, 4).border = thinBorder();
      matchedSheet.getCell(mRow, 5).value = m.sourceBTransaction.description;
      matchedSheet.getCell(mRow, 5).border = thinBorder();
      const bAmt = matchedSheet.getCell(mRow, 6);
      bAmt.value = m.sourceBTransaction.amount;
      bAmt.numFmt = '#,##0.00';
      bAmt.alignment = { horizontal: 'right' };
      bAmt.border = thinBorder();

      matchedSheet.getCell(mRow, 7).value = `${(m.confidence * 100).toFixed(0)}%`;
      matchedSheet.getCell(mRow, 7).border = thinBorder();
      matchedSheet.getCell(mRow, 7).alignment = { horizontal: 'center' };
      matchedSheet.getCell(mRow, 8).value = m.matchMethod;
      matchedSheet.getCell(mRow, 8).border = thinBorder();
      mRow++;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=conciliacion-${result.id.slice(0, 8)}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// ========== Helpers de formato Excel ==========

function darkGreenFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } };
}

function lightGreenFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
}

function writeSectionBar(
  sheet: ExcelJS.Worksheet, row: number, title: string, total: number | null
): number {
  sheet.mergeCells(row, 1, row, 4);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = darkGreenFill();
  titleCell.alignment = { vertical: 'middle' };

  const totalCell = sheet.getCell(row, 5);
  if (total !== null) {
    totalCell.value = total;
    totalCell.numFmt = '#,##0.00';
  }
  totalCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  totalCell.fill = darkGreenFill();
  totalCell.alignment = { horizontal: 'right', vertical: 'middle' };

  sheet.getRow(row).height = 22;
  return row + 1;
}

function writeColumnHeaders(sheet: ExcelJS.Worksheet, row: number): number {
  const headers = ['Fecha', 'Doc', 'Descripción', 'Valor'];
  for (let i = 0; i < headers.length; i++) {
    const cell = sheet.getCell(row, i + 1);
    cell.value = headers[i];
    cell.font = { bold: true, size: 10 };
    cell.fill = lightGreenFill();
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center' };
  }
  return row + 1;
}

function writeTransactionRow(
  sheet: ExcelJS.Worksheet, row: number, t: Transaction, useAbsValue: boolean
): number {
  sheet.getCell(row, 1).value = t.date;
  sheet.getCell(row, 1).border = thinBorder();

  sheet.getCell(row, 2).value = t.reference;
  sheet.getCell(row, 2).border = thinBorder();

  sheet.getCell(row, 3).value = t.description;
  sheet.getCell(row, 3).border = thinBorder();

  const amountCell = sheet.getCell(row, 4);
  amountCell.value = useAbsValue ? Math.abs(t.amount) : t.amount;
  amountCell.numFmt = '#,##0.00';
  amountCell.alignment = { horizontal: 'right' };
  amountCell.border = thinBorder();

  return row + 1;
}

function writeTransactionSection(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  transactions: Transaction[],
  useAbsValue: boolean
): number {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  row = writeSectionBar(sheet, row, title, total);
  row = writeColumnHeaders(sheet, row);

  if (transactions.length === 0) {
    sheet.mergeCells(row, 1, row, 4);
    const emptyCell = sheet.getCell(row, 1);
    emptyCell.value = '(Sin transacciones)';
    emptyCell.font = { italic: true, color: { argb: 'FF999999' } };
    emptyCell.alignment = { horizontal: 'center' };
    for (let i = 1; i <= 4; i++) {
      sheet.getCell(row, i).border = thinBorder();
    }
    row++;
  } else {
    for (const t of transactions) {
      row = writeTransactionRow(sheet, row, t, useAbsValue);
    }
  }

  return row;
}

function writeSummaryLine(
  sheet: ExcelJS.Worksheet, row: number, label: string, value: number | string
): number {
  sheet.mergeCells(row, 1, row, 3);
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 10 };
  labelCell.border = thinBorder();

  sheet.mergeCells(row, 4, row, 5);
  const valueCell = sheet.getCell(row, 4);
  valueCell.value = value;
  if (typeof value === 'number') {
    valueCell.numFmt = '#,##0';
  }
  valueCell.font = { bold: true, size: 10 };
  valueCell.alignment = { horizontal: 'right' };
  valueCell.border = thinBorder();

  return row + 1;
}
