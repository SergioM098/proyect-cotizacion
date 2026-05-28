import "./chunk-MCKGQKYU.js";

// src/app.ts
import express from "express";
import cors from "cors";
import path4 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/routes/upload.routes.ts
import { Router } from "express";
import { v4 as uuidv42 } from "uuid";
import path3 from "path";

// src/middleware/upload.middleware.ts
import multer from "multer";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var uploadsDir = process.env.VERCEL ? path.join(os.tmpdir(), "conciliacion-uploads") : path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});
var fileFilter = (_req, file, cb) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/pdf",
    "text/csv",
    "application/csv",
    "text/plain"
  ];
  const allowedExts = [".xlsx", ".xls", ".pdf", ".csv"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten archivos Excel (.xlsx), CSV (.csv) o PDF (.pdf)"));
  }
};
var upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
  // 10MB
});

// src/services/pdf-parser.service.ts
import { execFile } from "child_process";
import fs2 from "fs";
import path2 from "path";
import pdfParse from "pdf-parse";
import { fileURLToPath as fileURLToPath2 } from "url";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
function resolvePythonScript() {
  const candidates = [
    path2.join(process.cwd(), "server/scripts/pdf_to_json.py"),
    path2.join(process.cwd(), "scripts/pdf_to_json.py"),
    path2.join(__dirname2, "../scripts/pdf_to_json.py"),
    path2.join(__dirname2, "../../scripts/pdf_to_json.py")
  ];
  return candidates.find((candidate) => fs2.existsSync(candidate)) ?? null;
}
var PYTHON_SCRIPT = resolvePythonScript();
var PYTHON_COMMANDS = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
async function parsePdfFile(filePath) {
  if (process.env.VERCEL) {
    return parsePdfWithNode(filePath);
  }
  try {
    return await parsePdfWithPython(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("no se encontro")) {
      return parsePdfWithNode(filePath);
    }
    throw error;
  }
}
function parsePdfWithPython(filePath) {
  return new Promise((resolve, reject) => {
    if (!PYTHON_SCRIPT) {
      reject(new Error("Error al parsear PDF: no se encontro server/scripts/pdf_to_json.py"));
      return;
    }
    const runPython = (commandIndex) => {
      const command = PYTHON_COMMANDS[commandIndex];
      execFile(
        command,
        [PYTHON_SCRIPT, filePath],
        { maxBuffer: 50 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const isMissingCommand = error?.code === "ENOENT";
          if (isMissingCommand && commandIndex + 1 < PYTHON_COMMANDS.length) {
            runPython(commandIndex + 1);
            return;
          }
          if (error) {
            console.error("Error ejecutando script Python:", stderr);
            reject(new Error(`Error al parsear PDF: ${stderr || stdout || error.message}`));
            return;
          }
          try {
            const result = JSON.parse(stdout);
            if (result.error) {
              reject(new Error(`Error en script Python: ${result.error}`));
              return;
            }
            resolve({
              headers: result.headers || [],
              rows: result.rows || [],
              totalRows: result.totalRows || 0
            });
          } catch (parseError) {
            reject(new Error(`Error parseando respuesta del script Python: ${parseError}`));
          }
        }
      );
    };
    runPython(0);
  });
}
async function parsePdfWithNode(filePath) {
  const data = await pdfParse(fs2.readFileSync(filePath));
  const lines = data.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const accountingRows = parseAccountingLedgerRows(lines);
  if (accountingRows.length > 0) {
    return {
      headers: [
        "TD",
        "Documento.",
        "Fecha.",
        "Detalle Transaccion",
        "Nit CC",
        "Nombre",
        "Cheque No.",
        "Valor Debito",
        "Valor Credito",
        "Saldo Final"
      ],
      rows: accountingRows,
      totalRows: accountingRows.length
    };
  }
  const dateLedRows = parseDateLedRows(lines);
  if (dateLedRows.length > 0) {
    return {
      headers: ["Fecha", "Descripcion", "Valor"],
      rows: dateLedRows,
      totalRows: dateLedRows.length
    };
  }
  const rows = lines.map(splitPdfLine).filter((row) => row.length >= 2 && row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    throw new Error(
      "No se pudo extraer texto tabular del PDF. En Vercel se usa un parser JavaScript; para PDFs escaneados o tablas complejas sube CSV/XLSX."
    );
  }
  const headerIndex = findHeaderIndex(rows);
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const maxCols = Math.max(...rows.map((row) => row.length));
  const headers = headerIndex >= 0 ? normalizeRow(rows[headerIndex], maxCols) : Array.from({ length: maxCols }, (_, index) => `Columna ${index + 1}`);
  const normalizedRows = dataRows.map((row) => normalizeRow(row, headers.length));
  return {
    headers,
    rows: normalizedRows,
    totalRows: normalizedRows.length
  };
}
function parseAccountingLedgerRows(lines) {
  const rows = [];
  const tdPattern = /^[A-Z]{2}$/;
  const dateAtStartPattern = /^(\d{1,2}[/-]\d{1,2}[/-]\d{4})/;
  for (let index = 0; index < lines.length - 2; index++) {
    const detailLine = lines[index].replace(/\s+/g, " ").trim();
    const transactionType = lines[index + 1].trim().toUpperCase();
    const dateLine = lines[index + 2].replace(/\s+/g, " ").trim();
    if (!tdPattern.test(transactionType)) continue;
    const dateMatch = dateLine.match(dateAtStartPattern);
    if (!dateMatch) continue;
    if (isIgnoredPdfLine(detailLine) || /saldo anterior/i.test(detailLine)) continue;
    const extracted = extractTrailingAmount(detailLine);
    if (!extracted) continue;
    const date = dateMatch[1];
    const { document, detail } = splitAccountingDetail(extracted.description);
    const { cheque, balance } = splitAccountingDateLine(dateLine, date);
    const isDebit = transactionType === "RC";
    rows.push([
      transactionType,
      document,
      date,
      detail,
      "",
      "",
      cheque,
      isDebit ? extracted.amount : "",
      isDebit ? "" : extracted.amount,
      balance
    ]);
    index += 2;
  }
  return rows;
}
function splitAccountingDetail(value) {
  const longNumberWithSpace = value.match(/^(\d{7,})\s+(.+)$/);
  if (longNumberWithSpace) {
    const raw = longNumberWithSpace[1];
    return {
      document: raw.slice(0, -3),
      detail: `${raw.slice(-3)} ${longNumberWithSpace[2]}`.trim()
    };
  }
  const longNumberWithText = value.match(/^(\d{7,})([-A-Za-z].*)$/);
  if (longNumberWithText) {
    const raw = longNumberWithText[1];
    return {
      document: raw.slice(0, -3),
      detail: `${raw.slice(-3)}${longNumberWithText[2]}`.trim()
    };
  }
  const compactMatch = value.match(/^(\d{4,})([A-Za-z].*)$/);
  if (compactMatch) {
    return { document: compactMatch[1], detail: compactMatch[2].trim() };
  }
  const spacedMatch = value.match(/^(\d{5,})(\d{3}\s+.+)$/);
  if (spacedMatch) {
    return { document: spacedMatch[1].slice(0, -3), detail: `${spacedMatch[1].slice(-3)} ${spacedMatch[2].slice(3)}`.trim() };
  }
  const simpleMatch = value.match(/^(\d+)\s+(.+)$/);
  if (simpleMatch && simpleMatch[1].length <= 6) {
    return { document: simpleMatch[1], detail: simpleMatch[2].trim() };
  }
  return { document: "", detail: value };
}
function splitAccountingDateLine(line, date) {
  const rest = line.slice(date.length).trim();
  if (!rest) return { cheque: "", balance: "" };
  const spaced = rest.match(/^(\d+)\s+(-?[\d.,]+)$/);
  if (spaced) {
    return { cheque: spaced[1], balance: spaced[2] };
  }
  const balanceOnly = rest.match(/^(-?[\d.,]+)$/);
  if (balanceOnly) {
    return { cheque: "", balance: balanceOnly[1] };
  }
  return { cheque: "", balance: rest };
}
function parseDateLedRows(lines) {
  const rows = [];
  const datePattern = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$|^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;
  for (let index = 0; index < lines.length; index++) {
    const date = lines[index].trim();
    if (!datePattern.test(date)) continue;
    const parts = [];
    index++;
    while (index < lines.length && !datePattern.test(lines[index].trim())) {
      const line = lines[index].replace(/\s+/g, " ").trim();
      if (line && !isIgnoredPdfLine(line)) {
        parts.push(line);
      }
      index++;
    }
    index--;
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    const extracted = extractTrailingAmount(text);
    if (!extracted) continue;
    const { amount, description } = extracted;
    if (!description) continue;
    rows.push([date, description, amount]);
  }
  return rows;
}
function extractTrailingAmount(text) {
  const match = text.match(/(-?\$?[\d.,]+)$/);
  if (!match || match.index === void 0) return null;
  let amount = match[1].replace("$", "").trim();
  let description = text.slice(0, match.index).trim();
  if (!amount.startsWith("-")) {
    const normalizedAmount = splitReferenceFromPositiveAmount(amount);
    if (normalizedAmount !== amount) {
      description = `${description}${amount.slice(0, amount.length - normalizedAmount.length)}`.trim();
      amount = normalizedAmount;
    }
  }
  return { description, amount };
}
function splitReferenceFromPositiveAmount(value) {
  const decimalMatch = value.match(/^(\d+)((?:,\d{3})+\.\d{2})$/);
  if (!decimalMatch) return value;
  const prefix = decimalMatch[1];
  const rest = decimalMatch[2];
  if (prefix.length <= 3) return value;
  const preferredReferenceLength = prefix.startsWith("8") || prefix.startsWith("9") ? 9 : 10;
  const firstGroupLength = prefix.length - preferredReferenceLength;
  if (firstGroupLength >= 1 && firstGroupLength <= 3) {
    return `${prefix.slice(preferredReferenceLength)}${rest}`;
  }
  for (const referenceLength of [9, 10, 8, 7]) {
    const groupLength = prefix.length - referenceLength;
    if (groupLength >= 1 && groupLength <= 3) {
      return `${prefix.slice(referenceLength)}${rest}`;
    }
  }
  return value;
}
function isIgnoredPdfLine(line) {
  const lower = line.toLowerCase();
  return [
    "empresa:",
    "numero de cuenta:",
    "n\xFAmero de cuenta:",
    "fecha y hora",
    "nit:",
    "tipo de cuenta:",
    "impreso por:",
    "saldo efectivo",
    "saldo en canje",
    "saldo total"
  ].some((marker) => lower.includes(marker));
}
function splitPdfLine(line) {
  const wideSplit = line.split(/\s{2,}|\t+/).map((cell) => cell.trim()).filter(Boolean);
  if (wideSplit.length >= 2) return wideSplit;
  const dateAmountMatch = line.match(
    /^(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?)\s+(.+?)\s+(-?[\d.,]+)$/
  );
  if (dateAmountMatch) {
    return [dateAmountMatch[1], dateAmountMatch[2], dateAmountMatch[3]];
  }
  return [line];
}
function findHeaderIndex(rows) {
  const keywords = [
    "fecha",
    "date",
    "descripcion",
    "descripcion",
    "detalle",
    "concepto",
    "monto",
    "valor",
    "debito",
    "debito",
    "credito",
    "credito",
    "saldo",
    "referencia",
    "ref",
    "documento"
  ];
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 30);
  for (let index = 0; index < limit; index++) {
    const text = rows[index].join(" ").toLowerCase();
    const score = keywords.filter((keyword) => text.includes(keyword)).length;
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}
function normalizeRow(row, length) {
  if (row.length === length) return row;
  if (row.length > length) return row.slice(0, length);
  return [...row, ...Array(length - row.length).fill("")];
}

// src/services/csv-parser.service.ts
import fs3 from "fs";
function parseCsvFile(filePath) {
  const raw = fs3.readFileSync(filePath, "utf-8");
  const firstLine = raw.split("\n")[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const allRows = parseCsvLines(raw, delimiter);
  if (allRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }
  const firstRow = allRows[0];
  const isHeader = firstRow.some((cell) => {
    const trimmed = cell.trim().toLowerCase();
    if (!trimmed) return false;
    if (/^-?[\d.,]+$/.test(trimmed)) return false;
    if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(trimmed)) return false;
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed)) return false;
    return /[a-záéíóúñ]/i.test(trimmed);
  });
  let headers;
  let rows;
  if (isHeader) {
    headers = allRows[0];
    rows = allRows.slice(1);
  } else {
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows;
  }
  return {
    headers,
    rows,
    totalRows: rows.length
  };
}
function detectDelimiter(line) {
  const counts = { ";": 0, ",": 0, "	": 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch in counts) {
      counts[ch]++;
    }
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["	"]) return ";";
  if (counts["	"] >= counts[","]) return "	";
  return ",";
}
function parseCsvLines(raw, delimiter) {
  const rows = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = parseCsvRow(trimmed, delimiter);
    if (cells.every((c) => c.trim() === "")) continue;
    rows.push(cells);
  }
  return rows;
}
function parseCsvRow(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current.trim());
  return cells;
}

// src/services/normalizer.service.ts
import { v4 as uuidv4 } from "uuid";
function normalizeTransactions(rows, headers, mapping) {
  const transactions = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const date = normalizeDate(getCellValue(row, headers, mapping.date));
      const description = getCellValue(row, headers, mapping.description);
      const reference = mapping.reference ? getCellValue(row, headers, mapping.reference) : "";
      let amount;
      if (mapping.amount !== void 0) {
        amount = normalizeAmount(getCellValue(row, headers, mapping.amount));
      } else {
        const debit = mapping.debit ? normalizeAmount(getCellValue(row, headers, mapping.debit)) : 0;
        const credit = mapping.credit ? normalizeAmount(getCellValue(row, headers, mapping.credit)) : 0;
        amount = credit - debit;
      }
      if (!date || isNaN(amount)) continue;
      transactions.push({
        id: uuidv4(),
        date,
        description: description.replace(/\s+/g, " ").trim(),
        reference: reference.trim(),
        amount,
        rawAmount: mapping.amount !== void 0 ? getCellValue(row, headers, mapping.amount) : `D:${getCellValue(row, headers, mapping.debit ?? "")} C:${getCellValue(row, headers, mapping.credit ?? "")}`,
        sourceRow: i + 2,
        // +2 porque fila 1 es headers y el índice es 0-based
        rawDescription: description
      });
    } catch {
      continue;
    }
  }
  return transactions;
}
function getCellValue(row, headers, columnRef) {
  if (typeof columnRef === "number") {
    return row[columnRef] ?? "";
  }
  const index = headers.findIndex(
    (h) => h.toLowerCase().trim() === String(columnRef).toLowerCase().trim()
  );
  if (index === -1) {
    const numIndex = parseInt(columnRef, 10);
    if (!isNaN(numIndex) && numIndex >= 0 && numIndex < row.length) {
      return row[numIndex] ?? "";
    }
    return "";
  }
  return row[index] ?? "";
}
function normalizeDate(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.split("T")[0];
  }
  const ymd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  const dm = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dm) {
    const day = dm[1].padStart(2, "0");
    const month = dm[2].padStart(2, "0");
    const year = (/* @__PURE__ */ new Date()).getFullYear().toString();
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    return parsed.toISOString().split("T")[0];
  }
  return "";
}
function normalizeAmount(value) {
  if (!value) return 0;
  let cleaned = value.replace(/[^0-9.,\-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma !== -1 && lastDot === -1) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  }
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}
function autoDetectColumns(headers, sampleRows) {
  const mapping = {};
  const lower = headers.map(normalizeText);
  const dateKeywords = ["fecha", "date", "fec", "dia"];
  const dateIdx = lower.findIndex(
    (h) => dateKeywords.some((k) => h.includes(k))
  );
  if (dateIdx !== -1) mapping.date = dateIdx;
  const descKeywords = ["descripcion", "descripci\xF3n", "concepto", "detalle", "description", "desc"];
  const descIdx = lower.findIndex(
    (h) => descKeywords.some((k) => h.includes(k))
  );
  if (descIdx !== -1) mapping.description = descIdx;
  if (mapping.description !== void 0 && sampleRows && sampleRows.length > 3) {
    const di = mapping.description;
    const sample = sampleRows.slice(0, 20);
    const uniqueVals = new Set(sample.map((r) => (r[di] ?? "").trim().toLowerCase()).filter(Boolean));
    if (uniqueVals.size <= 2) {
      const altDescKeywords = ["nombre", "tercero", "beneficiario", "cliente", "proveedor", "pagador"];
      const altIdx = lower.findIndex(
        (h, i) => i !== di && altDescKeywords.some((k) => h.includes(k))
      );
      if (altIdx !== -1) {
        mapping.description = altIdx;
      }
    }
  }
  const refKeywords = ["referencia", "ref", "reference", "num", "n\xFAmero", "numero", "td", "documento", "doc", "dcto", "comprobante"];
  const refIdx = lower.findIndex(
    (h) => refKeywords.some((k) => h.includes(k))
  );
  if (refIdx !== -1) mapping.reference = refIdx;
  const debitKeywords = ["debito", "d\xE9bito", "debit", "cargo", "egreso", "salida"];
  const debitIdx = lower.findIndex(
    (h) => debitKeywords.some((k) => h.includes(k))
  );
  if (debitIdx !== -1) mapping.debit = debitIdx;
  const creditKeywords = ["credito", "cr\xE9dito", "credit", "abono", "ingreso", "entrada", "haber"];
  const creditIdx = lower.findIndex(
    (h) => creditKeywords.some((k) => h.includes(k))
  );
  if (creditIdx !== -1) mapping.credit = creditIdx;
  if (debitIdx === -1 && creditIdx === -1) {
    const amountKeywords = ["monto", "amount", "valor", "importe", "total"];
    const amountIdx = lower.findIndex(
      (h) => amountKeywords.some((k) => h.includes(k))
    );
    if (amountIdx !== -1) mapping.amount = amountIdx;
  }
  inferMissingColumnsFromRows(mapping, headers, sampleRows);
  return mapping;
}
function inferMissingColumnsFromRows(mapping, headers, sampleRows) {
  if (!sampleRows || sampleRows.length === 0 || headers.length === 0) return;
  const rows = sampleRows.slice(0, 30);
  if (mapping.date === void 0) {
    const dateIdx = bestColumnIndex(headers, rows, looksLikeDate);
    if (dateIdx !== -1) mapping.date = dateIdx;
  }
  if (mapping.amount === void 0 && mapping.debit === void 0 && mapping.credit === void 0) {
    const amountIdx = bestColumnIndex(headers, rows, looksLikeAmount);
    if (amountIdx !== -1) mapping.amount = amountIdx;
  }
  if (mapping.description === void 0) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let col = 0; col < headers.length; col++) {
      if (col === mapping.date || col === mapping.amount || col === mapping.debit || col === mapping.credit) {
        continue;
      }
      const values = rows.map((row) => row[col] ?? "").filter(Boolean);
      const textValues = values.filter((value) => /[a-zA-Z]/.test(value) && !looksLikeAmount(value));
      const avgLength = textValues.reduce((sum, value) => sum + value.length, 0) / Math.max(textValues.length, 1);
      const score = textValues.length * 2 + avgLength;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = col;
      }
    }
    if (bestIdx !== -1) mapping.description = bestIdx;
  }
  if (mapping.description === void 0) {
    const fallbackIdx = bestDescriptionFallback(headers, rows, mapping);
    if (fallbackIdx !== -1) mapping.description = fallbackIdx;
  }
}
function bestDescriptionFallback(headers, rows, mapping) {
  let bestIdx = -1;
  let bestScore = 0;
  for (let col = 0; col < headers.length; col++) {
    if (col === mapping.date || col === mapping.amount || col === mapping.debit || col === mapping.credit) {
      continue;
    }
    const values = rows.map((row) => (row[col] ?? "").trim()).filter(Boolean);
    const uniqueValues = new Set(values.map((value) => value.toLowerCase()));
    const avgLength = values.reduce((sum, value) => sum + value.length, 0) / Math.max(values.length, 1);
    const score = values.length * 3 + uniqueValues.size + avgLength;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col;
    }
  }
  if (bestIdx !== -1) return bestIdx;
  const amountIdx = typeof mapping.amount === "number" ? mapping.amount : void 0;
  const dateIdx = typeof mapping.date === "number" ? mapping.date : void 0;
  for (let col = 0; col < headers.length; col++) {
    if (col !== dateIdx && col !== amountIdx) return col;
  }
  return -1;
}
function bestColumnIndex(headers, rows, predicate) {
  let bestIdx = -1;
  let bestScore = 0;
  for (let col = 0; col < headers.length; col++) {
    const score = rows.reduce((count, row) => count + (predicate(row[col] ?? "") ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col;
    }
  }
  return bestScore >= Math.max(2, Math.ceil(rows.length * 0.25)) ? bestIdx : -1;
}
function looksLikeDate(value) {
  const trimmed = value.trim();
  return /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(trimmed) || /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(trimmed) || /^\d{1,2}[\/\-]\d{1,2}$/.test(trimmed);
}
function looksLikeAmount(value) {
  const cleaned = value.trim().replace(/[$\s]/g, "");
  return /^-?\d[\d.,]*$/.test(cleaned) && (cleaned.match(/\d/g) || []).length >= 2;
}
function normalizeText(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Ã¡/g, "a").replace(/Ã©/g, "e").replace(/Ã­/g, "i").replace(/Ã³/g, "o").replace(/Ãº/g, "u").replace(/Ã±/g, "n").trim();
}

// src/utils/excel-full-reader.ts
import ExcelJS from "exceljs";
import fs4 from "fs";
async function patchedExcelBuffer(filePath) {
  const raw = fs4.readFileSync(filePath);
  try {
    const { default: JSZip } = await import("./lib-M7IZ2SB7.js");
    const zip = await JSZip.loadAsync(raw);
    const sheetKeys = Object.keys(zip.files).filter(
      (k) => /xl\/worksheets\/sheet\d+\.xml$/i.test(k)
    );
    if (sheetKeys.length === 0) return raw;
    let modified = false;
    for (const sheetKey of sheetKeys) {
      let xml = await zip.files[sheetKey].async("string");
      const rowNums = [];
      const rx = /<row\b[^>]*\br="(\d+)"/g;
      let m;
      while ((m = rx.exec(xml)) !== null) rowNums.push(parseInt(m[1], 10));
      if (rowNums.length === 0) continue;
      const trueMax = Math.max(...rowNums);
      const patched = xml.replace(
        /(<dimension\s+ref="[A-Z]+\d+:[A-Z]+)\d+(")/,
        (_, pre, post) => `${pre}${trueMax}${post}`
      );
      if (patched !== xml) {
        zip.file(sheetKey, patched);
        modified = true;
      }
    }
    if (modified) {
      return new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));
    }
    return raw;
  } catch {
    return raw;
  }
}
async function listExcelSheets(filePath) {
  const raw = fs4.readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(raw);
  return workbook.worksheets.map((ws, i) => ({
    name: ws.name,
    index: i,
    rowCount: ws.rowCount || 0
  }));
}
async function readExcelFull(filePath, sheetIndex = 0) {
  const buffer = await patchedExcelBuffer(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) throw new Error("La hoja seleccionada no existe en el archivo Excel");
  const maxCols = worksheet.columnCount || 1;
  const allRows = [];
  worksheet.eachRow((row) => {
    const values = row.values;
    const cells = Array.from({ length: maxCols }, (_, i) => cellToString(values[i + 1]));
    if (cells.some((c) => c.trim() !== "")) {
      allRows.push(cells);
    }
  });
  if (allRows.length === 0) return { headers: [], rows: [] };
  const headerIdx = findHeader(allRows);
  let headers;
  let rows;
  if (headerIdx >= 0) {
    headers = allRows[headerIdx];
    rows = allRows.slice(headerIdx + 1);
  } else {
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows.slice(1);
  }
  return { headers, rows };
}
function cellToString(cell) {
  if (cell === null || cell === void 0) return "";
  if (cell instanceof Date) {
    const d = cell;
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${d.getUTCFullYear()}`;
  }
  if (typeof cell === "object") {
    if ("result" in cell) return cellToString(cell.result);
    if ("text" in cell) return String(cell.text ?? "");
    if ("richText" in cell)
      return cell.richText.map((r) => r.text).join("");
  }
  return String(cell).trim();
}
var HEADER_KWS = [
  "fecha",
  "date",
  "descripcion",
  "descripci\xF3n",
  "detalle",
  "concepto",
  "monto",
  "valor",
  "debito",
  "d\xE9bito",
  "credito",
  "cr\xE9dito",
  "saldo",
  "referencia",
  "ref",
  "documento",
  "cheque",
  "nombre",
  "movimiento"
];
function findHeader(rows) {
  let best = -1, bestScore = 0;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c.trim() !== "").length;
    if (nonEmpty < 3) continue;
    const uniqueValues = new Set(row.filter((c) => c.trim() !== "").map((c) => c.trim().toLowerCase()));
    if (uniqueValues.size === 1 && nonEmpty > 3) continue;
    let matches = 0;
    for (const cell of row) {
      const lower = cell.toLowerCase().trim();
      if (HEADER_KWS.some((kw) => lower.includes(kw))) matches++;
    }
    if (matches < 2) continue;
    const score = matches * 3 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// src/utils/xls-reader.ts
import * as XLSX from "xlsx";
var HEADER_KWS2 = [
  "fecha",
  "date",
  "descripcion",
  "descripci\xF3n",
  "detalle",
  "concepto",
  "monto",
  "valor",
  "debito",
  "d\xE9bito",
  "credito",
  "cr\xE9dito",
  "saldo",
  "referencia",
  "ref",
  "documento",
  "cheque",
  "nombre",
  "movimiento"
];
function listXlsSheets(filePath) {
  const workbook = XLSX.readFile(filePath, { bookSheets: true });
  return workbook.SheetNames.map((name, index) => ({
    name,
    index,
    rowCount: 0
    // SheetJS con bookSheets no carga datos, no podemos saber rowCount
  }));
}
function readXlsFile(filePath, sheetIndex = 0) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName) throw new Error("La hoja seleccionada no existe en el archivo Excel");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ""
  });
  const allRows = rawRows.map((row) => row.map((cell) => String(cell ?? "").trim())).filter((row) => row.some((c) => c !== ""));
  if (allRows.length === 0) return { headers: [], rows: [] };
  const headerIdx = findHeader2(allRows);
  let headers;
  let rows;
  if (headerIdx >= 0) {
    headers = allRows[headerIdx];
    rows = allRows.slice(headerIdx + 1);
  } else {
    headers = allRows[0].map((_, i) => `Columna ${i + 1}`);
    rows = allRows.slice(1);
  }
  const numCols = headers.length;
  rows = rows.map((row) => {
    if (row.length < numCols) return [...row, ...Array(numCols - row.length).fill("")];
    if (row.length > numCols) return row.slice(0, numCols);
    return row;
  });
  return { headers, rows };
}
function findHeader2(rows) {
  let best = -1, bestScore = 0;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c.trim() !== "").length;
    if (nonEmpty < 3) continue;
    let matches = 0;
    for (const cell of row) {
      const lower = cell.toLowerCase().trim();
      if (HEADER_KWS2.some((kw) => lower.includes(kw))) matches++;
    }
    if (matches < 2) continue;
    const score = matches * 3 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// src/utils/ttl-map.ts
var TtlMap = class {
  constructor(maxAgeMs, options) {
    this.maxAgeMs = maxAgeMs;
    const cleanupMs = options?.cleanupIntervalMs ?? 6e4;
    this.onExpire = options?.onExpire;
    this.timer = setInterval(() => this.cleanup(), cleanupMs);
    if (this.timer.unref) this.timer.unref();
  }
  maxAgeMs;
  store = /* @__PURE__ */ new Map();
  timer;
  onExpire;
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return void 0;
    entry.lastAccessed = Date.now();
    return entry.data;
  }
  set(key, value) {
    this.store.set(key, { data: value, lastAccessed: Date.now() });
  }
  has(key) {
    return this.store.has(key);
  }
  delete(key) {
    return this.store.delete(key);
  }
  get size() {
    return this.store.size;
  }
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.lastAccessed > this.maxAgeMs) {
        if (this.onExpire) this.onExpire(key, entry.data);
        this.store.delete(key);
      }
    }
  }
};

// src/routes/upload.routes.ts
var sessions = new TtlMap(30 * 60 * 1e3);
var uploadRouter = Router();
uploadRouter.post(
  "/",
  upload.fields([
    { name: "sourceAFile", maxCount: 1 },
    { name: "sourceBFile", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const files = req.files;
      const reconciliationType = req.body.reconciliationType || "bank";
      if (!files.sourceAFile?.[0] || !files.sourceBFile?.[0]) {
        res.status(400).json({
          error: "Se requieren dos archivos para la conciliaci\xF3n"
        });
        return;
      }
      const sourceAFile = files.sourceAFile[0];
      const sourceBFile = files.sourceBFile[0];
      const extA = path3.extname(sourceAFile.originalname).toLowerCase();
      const extB = path3.extname(sourceBFile.originalname).toLowerCase();
      let sourceASheets;
      let sourceBSheets;
      if (extA === ".xlsx") {
        const sheets = await listExcelSheets(sourceAFile.path);
        if (sheets.length > 1) sourceASheets = sheets;
      } else if (extA === ".xls") {
        const sheets = listXlsSheets(sourceAFile.path);
        if (sheets.length > 1) sourceASheets = sheets;
      }
      if (extB === ".xlsx") {
        const sheets = await listExcelSheets(sourceBFile.path);
        if (sheets.length > 1) sourceBSheets = sheets;
      } else if (extB === ".xls") {
        const sheets = listXlsSheets(sourceBFile.path);
        if (sheets.length > 1) sourceBSheets = sheets;
      }
      if (sourceASheets || sourceBSheets) {
        const sessionId2 = uuidv42();
        sessions.set(sessionId2, {
          reconciliationType,
          sourceAFilePath: sourceAFile.path,
          sourceBFilePath: sourceBFile.path,
          sourceASheets,
          sourceBSheets,
          sourceAHeaders: [],
          sourceARows: [],
          sourceBHeaders: [],
          sourceBRows: [],
          sourceAAutoMapping: {},
          sourceBAutoMapping: {}
        });
        res.json({
          sessionId: sessionId2,
          requiresSheetSelection: true,
          sourceASheets,
          sourceBSheets
        });
        return;
      }
      const sourceARaw = await parseFile(sourceAFile);
      const sourceBRaw = await parseFile(sourceBFile);
      const sourceAParsed = {
        headers: sourceARaw.headers,
        rows: filterDataRows(sourceARaw.headers, sourceARaw.rows)
      };
      const sourceBParsed = {
        headers: sourceBRaw.headers,
        rows: filterDataRows(sourceBRaw.headers, sourceBRaw.rows)
      };
      const sourceAAutoMapping = autoDetectColumns(sourceAParsed.headers, sourceAParsed.rows);
      const sourceBAutoMapping = autoDetectColumns(sourceBParsed.headers, sourceBParsed.rows);
      const sessionId = uuidv42();
      sessions.set(sessionId, {
        reconciliationType,
        sourceAHeaders: sourceAParsed.headers,
        sourceARows: sourceAParsed.rows,
        sourceBHeaders: sourceBParsed.headers,
        sourceBRows: sourceBParsed.rows,
        sourceAAutoMapping,
        sourceBAutoMapping
      });
      const sourceAPreview = {
        headers: sourceAParsed.headers,
        sampleRows: sourceAParsed.rows,
        totalRows: sourceAParsed.rows.length
      };
      const sourceBPreview = {
        headers: sourceBParsed.headers,
        sampleRows: sourceBParsed.rows,
        totalRows: sourceBParsed.rows.length
      };
      res.json({
        sessionId,
        reconciliationType,
        sourceAPreview,
        sourceBPreview,
        sourceAAutoMapping,
        sourceBAutoMapping
      });
    } catch (error) {
      next(error);
    }
  }
);
uploadRouter.post("/select-sheets", async (req, res, next) => {
  try {
    const { sessionId, sourceASheetIndex, sourceBSheetIndex } = req.body;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Sesi\xF3n no encontrada. Sube los archivos nuevamente." });
      return;
    }
    if (!session.sourceAFilePath || !session.sourceBFilePath) {
      res.status(400).json({ error: "Sesi\xF3n sin archivos asociados." });
      return;
    }
    const sourceAIdx = sourceASheetIndex ?? 0;
    const sourceBIdx = sourceBSheetIndex ?? 0;
    const sourceARaw = await parseFileByPath(session.sourceAFilePath, sourceAIdx);
    const sourceBRaw = await parseFileByPath(session.sourceBFilePath, sourceBIdx);
    const sourceAParsed = {
      headers: sourceARaw.headers,
      rows: filterDataRows(sourceARaw.headers, sourceARaw.rows)
    };
    const sourceBParsed = {
      headers: sourceBRaw.headers,
      rows: filterDataRows(sourceBRaw.headers, sourceBRaw.rows)
    };
    const sourceAAutoMapping = autoDetectColumns(sourceAParsed.headers, sourceAParsed.rows);
    const sourceBAutoMapping = autoDetectColumns(sourceBParsed.headers, sourceBParsed.rows);
    session.sourceAHeaders = sourceAParsed.headers;
    session.sourceARows = sourceAParsed.rows;
    session.sourceBHeaders = sourceBParsed.headers;
    session.sourceBRows = sourceBParsed.rows;
    session.sourceAAutoMapping = sourceAAutoMapping;
    session.sourceBAutoMapping = sourceBAutoMapping;
    sessions.set(sessionId, session);
    res.json({
      sessionId,
      reconciliationType: session.reconciliationType,
      sourceAPreview: {
        headers: sourceAParsed.headers,
        sampleRows: sourceAParsed.rows,
        totalRows: sourceAParsed.rows.length
      },
      sourceBPreview: {
        headers: sourceBParsed.headers,
        sampleRows: sourceBParsed.rows,
        totalRows: sourceBParsed.rows.length
      },
      sourceAAutoMapping,
      sourceBAutoMapping
    });
  } catch (error) {
    next(error);
  }
});
async function parseFile(file, sheetIndex = 0) {
  const ext = path3.extname(file.originalname).toLowerCase();
  return parseFileByPath(file.path, sheetIndex, ext);
}
async function parseFileByPath(filePath, sheetIndex = 0, ext) {
  const fileExt = ext || path3.extname(filePath).toLowerCase();
  if (fileExt === ".xlsx") {
    return readExcelFull(filePath, sheetIndex);
  }
  if (fileExt === ".xls") {
    return readXlsFile(filePath, sheetIndex);
  }
  if (fileExt === ".csv") {
    const parsed = parseCsvFile(filePath);
    return { headers: parsed.headers, rows: parsed.rows };
  }
  if (fileExt === ".pdf") {
    const parsed = await parsePdfFile(filePath);
    return { headers: parsed.headers, rows: parsed.rows };
  }
  throw new Error(`Formato de archivo no soportado: ${fileExt}`);
}
function filterDataRows(headers, rows) {
  const headerFP = headers.map((h) => h.toLowerCase().trim()).join("|");
  return rows.filter((row) => {
    if (row.map((c) => c.toLowerCase().trim()).join("|") === headerFP) {
      return false;
    }
    let hasDate = false;
    let hasAmount = false;
    for (const cell of row) {
      const v = (cell ?? "").trim();
      if (!v) continue;
      if (!hasDate) {
        if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(v) || /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) {
          hasDate = true;
        }
      }
      if (!hasAmount) {
        if (/^-?[\d.,]+$/.test(v) && (v.match(/\d/g) || []).length >= 2) {
          hasAmount = true;
        }
      }
      if (hasDate && hasAmount) return true;
    }
    return false;
  });
}

// src/routes/reconciliation.routes.ts
import { Router as Router2 } from "express";

// src/services/reconciliation.service.ts
import { v4 as uuidv43 } from "uuid";

// src/utils/date-utils.ts
function dateDifferenceInDays(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1e3 * 60 * 60 * 24));
}

// src/utils/amount-utils.ts
function amountsMatch(amount1, amount2, tolerance = 0) {
  return Math.abs(amount1 - amount2) <= tolerance;
}
function amountDifference(amount1, amount2) {
  return Math.abs(amount1 - amount2);
}

// src/utils/string-utils.ts
function referencesMatch(ref1, ref2) {
  const clean1 = ref1.replace(/\s+/g, "").toLowerCase();
  const clean2 = ref2.replace(/\s+/g, "").toLowerCase();
  return clean1.length > 0 && clean2.length > 0 && clean1 === clean2;
}

// src/services/reconciliation.service.ts
function reconcile(sourceATransactions, sourceBTransactions, config, reconciliationType = "bank") {
  const remainingA = [...sourceATransactions];
  const remainingB = [...sourceBTransactions];
  const matched = [];
  const negateB = reconciliationType === "bank";
  matchByAmount(remainingA, remainingB, matched, {
    amountTolerance: 0,
    referenceRequired: true,
    method: "exact",
    confidence: 1,
    negateB
  });
  matchByAmount(remainingA, remainingB, matched, {
    amountTolerance: 0,
    referenceRequired: false,
    method: "amount_date",
    confidence: 0.9,
    negateB
  });
  if (config.amountTolerance > 0) {
    matchByAmount(remainingA, remainingB, matched, {
      amountTolerance: config.amountTolerance,
      referenceRequired: false,
      method: "amount_fuzzy",
      confidence: 0.7,
      negateB
    });
  }
  matchManyToOne(remainingA, remainingB, matched, {
    maxGroupSize: 4,
    amountTolerance: config.amountTolerance,
    negateB
  });
  return buildResult(matched, remainingA, remainingB, reconciliationType);
}
function matchByAmount(remainingA, remainingB, matched, config) {
  const usedA = /* @__PURE__ */ new Set();
  const usedB = /* @__PURE__ */ new Set();
  const bByAmount = /* @__PURE__ */ new Map();
  for (let bi = 0; bi < remainingB.length; bi++) {
    const comparableAmount = config.negateB ? -remainingB[bi].amount : remainingB[bi].amount;
    const key = config.amountTolerance === 0 ? comparableAmount : Math.round(comparableAmount);
    const list = bByAmount.get(key);
    if (list) list.push(bi);
    else bByAmount.set(key, [bi]);
  }
  for (let ai = 0; ai < remainingA.length; ai++) {
    if (usedA.has(ai)) continue;
    const txA = remainingA[ai];
    let bestMatch = null;
    let candidateIndices;
    if (config.amountTolerance === 0) {
      candidateIndices = bByAmount.get(txA.amount) ?? [];
    } else {
      candidateIndices = [];
      const lo = Math.round(txA.amount - config.amountTolerance);
      const hi = Math.round(txA.amount + config.amountTolerance);
      for (let k = lo; k <= hi; k++) {
        const bucket = bByAmount.get(k);
        if (bucket) candidateIndices.push(...bucket);
      }
    }
    for (const bi of candidateIndices) {
      if (usedB.has(bi)) continue;
      const txB = remainingB[bi];
      const comparableAmountB = config.negateB ? -txB.amount : txB.amount;
      if (config.amountTolerance === 0) {
        if (txA.amount !== comparableAmountB) continue;
      } else {
        if (!amountsMatch(txA.amount, comparableAmountB, config.amountTolerance)) continue;
      }
      if (config.referenceRequired) {
        if (!referencesMatch(txA.reference, txB.reference)) continue;
      }
      const score = calculateTiebreakScore(txA, txB);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index: bi, score };
      }
    }
    if (bestMatch !== null) {
      const txB = remainingB[bestMatch.index];
      const comparableB = config.negateB ? -txB.amount : txB.amount;
      matched.push({
        sourceATransaction: txA,
        sourceBTransaction: txB,
        confidence: config.confidence,
        matchMethod: config.method,
        amountDifference: amountDifference(txA.amount, comparableB),
        dateDifferenceInDays: dateDifferenceInDays(txA.date, txB.date)
      });
      usedA.add(ai);
      usedB.add(bestMatch.index);
    }
  }
  const sortedA = [...usedA].sort((a, b) => b - a);
  for (const i of sortedA) remainingA.splice(i, 1);
  const sortedB = [...usedB].sort((a, b) => b - a);
  for (const i of sortedB) remainingB.splice(i, 1);
}
function calculateTiebreakScore(txA, txB) {
  let score = 0;
  if (referencesMatch(txA.reference, txB.reference)) score += 3;
  const daysDiff = Math.abs(dateDifferenceInDays(txA.date, txB.date));
  if (daysDiff === 0) score += 2;
  else if (daysDiff <= 3) score += 1.5;
  else if (daysDiff <= 7) score += 1;
  else if (daysDiff <= 30) score += 0.5;
  return score;
}
function matchManyToOne(remainingA, remainingB, matched, config) {
  findGroupMatches(remainingA, remainingB, matched, config, "a_is_one");
  findGroupMatches(remainingA, remainingB, matched, config, "b_is_one");
}
function findGroupMatches(remainingA, remainingB, matched, config, direction) {
  const oneSide = direction === "a_is_one" ? remainingA : remainingB;
  const manySide = direction === "a_is_one" ? remainingB : remainingA;
  const usedOne = /* @__PURE__ */ new Set();
  const usedMany = /* @__PURE__ */ new Set();
  for (let oi = 0; oi < oneSide.length; oi++) {
    if (usedOne.has(oi)) continue;
    const targetTx = oneSide[oi];
    const targetAmount = direction === "a_is_one" ? targetTx.amount : config.negateB ? -targetTx.amount : targetTx.amount;
    const candidates = [];
    for (let mi = 0; mi < manySide.length; mi++) {
      if (usedMany.has(mi)) continue;
      const tx = manySide[mi];
      const amt = direction === "a_is_one" ? config.negateB ? -tx.amount : tx.amount : tx.amount;
      if (Math.sign(amt) === Math.sign(targetAmount) || amt === 0) {
        candidates.push({ index: mi, amount: amt, tx });
      }
    }
    if (candidates.length < 2) continue;
    const found = findSubsetSum(candidates, targetAmount, config.amountTolerance, config.maxGroupSize);
    if (!found) continue;
    usedOne.add(oi);
    const allRelated = [];
    for (const c of found) {
      usedMany.add(c.index);
      allRelated.push(c.tx);
    }
    const sumAmount = found.reduce((s, c) => s + c.amount, 0);
    const pair = {
      sourceATransaction: direction === "a_is_one" ? targetTx : allRelated[0],
      sourceBTransaction: direction === "a_is_one" ? allRelated[0] : targetTx,
      confidence: 0.6,
      matchMethod: "many_to_one",
      amountDifference: Math.abs(targetAmount - sumAmount),
      dateDifferenceInDays: 0,
      relatedTransactions: allRelated
    };
    matched.push(pair);
  }
  const sortedOne = [...usedOne].sort((a, b) => b - a);
  for (const i of sortedOne) oneSide.splice(i, 1);
  const sortedMany = [...usedMany].sort((a, b) => b - a);
  for (const i of sortedMany) manySide.splice(i, 1);
}
function findSubsetSum(candidates, target, tolerance, maxSize) {
  const sorted = [...candidates].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const limited = sorted.slice(0, 20);
  for (let size = 2; size <= Math.min(maxSize, limited.length); size++) {
    const result = findCombination(limited, target, tolerance, size, 0, [], 0);
    if (result) return result;
  }
  return null;
}
function findCombination(candidates, target, tolerance, size, startIdx, current, currentSum) {
  if (current.length === size) {
    if (Math.abs(currentSum - target) <= tolerance) {
      return [...current];
    }
    return null;
  }
  for (let i = startIdx; i < candidates.length; i++) {
    const c = candidates[i];
    current.push(c);
    const result = findCombination(candidates, target, tolerance, size, i + 1, current, currentSum + c.amount);
    if (result) return result;
    current.pop();
  }
  return null;
}
var BANK_CHARGE_KEYWORDS = [
  // Genéricos
  "gasto bancario",
  "gastos bancarios",
  "comision",
  "comisi\xF3n",
  "comision pse",
  "gmf",
  "4x1000",
  "4 x 1000",
  "gravamen",
  "cuota de manejo",
  "cuota manejo",
  "cuota manejo trj",
  "imp/trans financ",
  "imp trans financ",
  // 4x1000 acumulado mes (Colpatria)
  // Bancolombia
  "cobro iva",
  "iva pagos automaticos",
  "iva pagos autom\xE1ticos",
  "servicio pago a proveedores",
  "servicio pagos a proveedores",
  "servicio pagos a terceros",
  "servicio pago a terceros",
  "servicio pago a otros bancos",
  "servicio pagos a otros bancos",
  "servicio por pagos a nequi",
  "servicio pagos a nequi",
  "cuota plan canal negocios",
  "iva cuota plan canal",
  "impto gobierno 4x1000",
  // Colpatria / Scotiabank
  "com.mes b.virtual",
  "com mes b virtual",
  "com mes b.virtual",
  "com.iva mes b.vir",
  "com iva mes b",
  "com.iva mes",
  "cta. servicio",
  "cta servicio",
  // Banco de Occidente / Otros
  "abono intereses ahorros",
  "abono intereses",
  "ajuste interes ahorros",
  "ajuste intereses ahorros",
  "db automati cuota tarjcre",
  "db automati cuota tarjeta",
  "pago int ctes sobregiro",
  "pago intereses sobregiro",
  "iva sobre comisiones",
  "comision transferencias",
  "comisi\xF3n transferencias"
];
function isBankCharge(t) {
  const text = `${t.description} ${t.reference}`.toLowerCase();
  return BANK_CHARGE_KEYWORDS.some((kw) => text.includes(kw));
}
function buildResult(matched, sourceAOnly, sourceBOnly, reconciliationType) {
  const bankCharges = reconciliationType === "bank" ? sourceAOnly.filter(isBankCharge) : [];
  const filteredSourceAOnly = reconciliationType === "bank" ? sourceAOnly.filter((t) => !isBankCharge(t)) : sourceAOnly;
  if (reconciliationType === "bank") {
    for (const pair of matched) {
      if (pair.amountDifference === 0) continue;
      const absBank = Math.abs(pair.sourceATransaction.amount);
      const absBook = Math.abs(pair.sourceBTransaction.amount);
      const diff = Math.abs(absBank - absBook);
      const syntheticTx = {
        id: uuidv43(),
        date: pair.sourceATransaction.date,
        description: `Dif. centavos: ${pair.sourceATransaction.description}`,
        reference: pair.sourceATransaction.reference,
        amount: diff,
        rawAmount: diff.toFixed(2),
        sourceRow: 0,
        rawDescription: `Diferencia por centavos (${pair.matchMethod})`
      };
      if (absBank > absBook) {
        filteredSourceAOnly.push(syntheticTx);
      } else {
        sourceBOnly.push(syntheticTx);
      }
    }
  }
  const totalA = matched.length + filteredSourceAOnly.length + bankCharges.length;
  const totalB = matched.length + sourceBOnly.length;
  const summary = {
    totalSourceATransactions: totalA,
    totalSourceBTransactions: totalB,
    matchedCount: matched.length,
    sourceAOnlyCount: filteredSourceAOnly.length,
    sourceBOnlyCount: sourceBOnly.length,
    matchedAmount: matched.reduce((sum, m) => sum + Math.abs(m.sourceATransaction.amount), 0),
    sourceAOnlyAmount: filteredSourceAOnly.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    sourceBOnlyAmount: sourceBOnly.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    bankChargesCount: bankCharges.length,
    bankChargesAmount: bankCharges.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    discrepancyCount: matched.filter((m) => m.amountDifference > 0).length
  };
  return {
    id: uuidv43(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    reconciliationType,
    matched,
    sourceAOnly: filteredSourceAOnly,
    sourceBOnly,
    bankCharges,
    summary
  };
}

// src/utils/labels.ts
var RECONCILIATION_LABELS = {
  bank: {
    sourceA: "Extracto Bancario",
    sourceB: "Libro Contable",
    title: "Conciliaci\xF3n Bancaria"
  },
  accounts: {
    sourceA: "Cuenta A",
    sourceB: "Cuenta B",
    title: "Conciliaci\xF3n entre Cuentas"
  }
};

// src/routes/reconciliation.routes.ts
import ExcelJS2 from "exceljs";
var reconciliationRouter = Router2();
var results = new TtlMap(2 * 60 * 60 * 1e3);
reconciliationRouter.post("/reconcile", (req, res, next) => {
  try {
    const body = req.body;
    const { sessionId, sourceAMapping, sourceBMapping, reconciliationType } = body;
    const dateTolerance = body.dateTolerance ?? 3;
    const amountTolerance = body.amountTolerance ?? 1;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Sesi\xF3n no encontrada. Sube los archivos nuevamente." });
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
        error: "No se pudieron extraer transacciones del primer archivo. Verifica el mapeo de columnas."
      });
      return;
    }
    if (sourceBTransactions.length === 0) {
      res.status(400).json({
        error: "No se pudieron extraer transacciones del segundo archivo. Verifica el mapeo de columnas."
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
reconciliationRouter.get("/results/:id", (req, res) => {
  const result = results.get(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Resultado no encontrado." });
    return;
  }
  res.json(result);
});
reconciliationRouter.get("/export/:id", async (req, res, next) => {
  try {
    const result = results.get(req.params.id);
    if (!result) {
      res.status(404).json({ error: "Resultado no encontrado." });
      return;
    }
    const labels = RECONCILIATION_LABELS[result.reconciliationType];
    const workbook = new ExcelJS2.Workbook();
    const sheet = workbook.addWorksheet(labels.title);
    sheet.getColumn(1).width = 14;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 42;
    sheet.getColumn(4).width = 20;
    sheet.getColumn(5).width = 20;
    let row = 1;
    sheet.mergeCells(row, 1, row, 5);
    const titleCell = sheet.getCell(row, 1);
    titleCell.value = labels.title.toUpperCase();
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.fill = darkGreenFill();
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(row).height = 30;
    row++;
    sheet.mergeCells(row, 1, row, 3);
    sheet.getCell(row, 1).value = `Fecha de generaci\xF3n: ${(/* @__PURE__ */ new Date()).toLocaleDateString("es-CO")}`;
    sheet.getCell(row, 1).font = { italic: true, size: 10 };
    row += 2;
    if (result.reconciliationType === "bank") {
      const consignacionesExtracto = result.sourceAOnly.filter((t) => t.amount >= 0);
      const pagosExtracto = [
        ...result.sourceAOnly.filter((t) => t.amount < 0),
        ...result.bankCharges
      ];
      const pagosLibros = result.sourceBOnly.filter((t) => t.amount < 0);
      const consignacionesLibros = result.sourceBOnly.filter((t) => t.amount >= 0);
      row = writeTransactionSection(
        sheet,
        row,
        "(+) CONSIGNACIONES EN EXTRACTO Y NO EN LIBROS",
        consignacionesExtracto,
        false
      );
      row++;
      row = writeTransactionSection(
        sheet,
        row,
        "(-) PAGOS EN EXTRACTOS Y NO EN LIBROS",
        pagosExtracto,
        false
      );
      row++;
      row = writeTransactionSection(
        sheet,
        row,
        "(+) PAGOS EN LIBROS Y NO EN EXTRACTO",
        pagosLibros,
        false
      );
      row++;
      row = writeTransactionSection(
        sheet,
        row,
        "(-) CONSIGNACIONES EN LIBROS Y NO EN EXTRACTO",
        consignacionesLibros,
        false
      );
      row++;
    } else {
      row = writeTransactionSection(
        sheet,
        row,
        `SOLO EN ${labels.sourceA.toUpperCase()}`,
        result.sourceAOnly,
        false
      );
      row++;
      row = writeTransactionSection(
        sheet,
        row,
        `SOLO EN ${labels.sourceB.toUpperCase()}`,
        result.sourceBOnly,
        false
      );
      row++;
    }
    row++;
    row = writeSectionBar(sheet, row, "RESUMEN", null);
    row = writeSummaryLine(sheet, row, `Total transacciones ${labels.sourceA}`, result.summary.totalSourceATransactions);
    row = writeSummaryLine(sheet, row, `Total transacciones ${labels.sourceB}`, result.summary.totalSourceBTransactions);
    row = writeSummaryLine(sheet, row, "Conciliadas", result.summary.matchedCount);
    row = writeSummaryLine(sheet, row, `Solo en ${labels.sourceA}`, result.summary.sourceAOnlyCount);
    row = writeSummaryLine(sheet, row, `Solo en ${labels.sourceB}`, result.summary.sourceBOnlyCount);
    if (result.summary.bankChargesCount > 0) {
      row = writeSummaryLine(sheet, row, "Gastos Bancarios", result.summary.bankChargesCount);
      row = writeSummaryLine(sheet, row, "Total Gastos Bancarios", `$${result.summary.bankChargesAmount.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`);
    }
    row = writeSummaryLine(sheet, row, "Discrepancias", result.summary.discrepancyCount);
    const matchedSheet = workbook.addWorksheet("Conciliados");
    matchedSheet.getColumn(1).width = 12;
    matchedSheet.getColumn(2).width = 30;
    matchedSheet.getColumn(3).width = 16;
    matchedSheet.getColumn(4).width = 12;
    matchedSheet.getColumn(5).width = 30;
    matchedSheet.getColumn(6).width = 16;
    matchedSheet.getColumn(7).width = 12;
    matchedSheet.getColumn(8).width = 16;
    let mRow = 1;
    matchedSheet.mergeCells(mRow, 1, mRow, 8);
    const mTitle = matchedSheet.getCell(mRow, 1);
    mTitle.value = "TRANSACCIONES CONCILIADAS";
    mTitle.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    mTitle.fill = darkGreenFill();
    mTitle.alignment = { horizontal: "center", vertical: "middle" };
    matchedSheet.getRow(mRow).height = 25;
    mRow++;
    const matchedHeaders = [
      `Fecha ${labels.sourceA}`,
      `Descripci\xF3n ${labels.sourceA}`,
      `Monto ${labels.sourceA}`,
      `Fecha ${labels.sourceB}`,
      `Descripci\xF3n ${labels.sourceB}`,
      `Monto ${labels.sourceB}`,
      "Confianza",
      "M\xE9todo",
      "Agrupados"
    ];
    matchedSheet.getColumn(9).width = 40;
    for (let i = 0; i < matchedHeaders.length; i++) {
      const cell = matchedSheet.getCell(mRow, i + 1);
      cell.value = matchedHeaders[i];
      cell.font = { bold: true, size: 10 };
      cell.fill = lightGreenFill();
      cell.border = thinBorder();
      cell.alignment = { horizontal: "center" };
    }
    mRow++;
    for (const m of result.matched) {
      matchedSheet.getCell(mRow, 1).value = m.sourceATransaction.date;
      matchedSheet.getCell(mRow, 1).border = thinBorder();
      matchedSheet.getCell(mRow, 2).value = m.sourceATransaction.description;
      matchedSheet.getCell(mRow, 2).border = thinBorder();
      const aAmt = matchedSheet.getCell(mRow, 3);
      aAmt.value = m.sourceATransaction.amount;
      aAmt.numFmt = "#,##0.00";
      aAmt.alignment = { horizontal: "right" };
      aAmt.border = thinBorder();
      matchedSheet.getCell(mRow, 4).value = m.sourceBTransaction.date;
      matchedSheet.getCell(mRow, 4).border = thinBorder();
      matchedSheet.getCell(mRow, 5).value = m.sourceBTransaction.description;
      matchedSheet.getCell(mRow, 5).border = thinBorder();
      const bAmt = matchedSheet.getCell(mRow, 6);
      bAmt.value = m.sourceBTransaction.amount;
      bAmt.numFmt = "#,##0.00";
      bAmt.alignment = { horizontal: "right" };
      bAmt.border = thinBorder();
      matchedSheet.getCell(mRow, 7).value = `${(m.confidence * 100).toFixed(0)}%`;
      matchedSheet.getCell(mRow, 7).border = thinBorder();
      matchedSheet.getCell(mRow, 7).alignment = { horizontal: "center" };
      matchedSheet.getCell(mRow, 8).value = m.matchMethod;
      matchedSheet.getCell(mRow, 8).border = thinBorder();
      const groupCell = matchedSheet.getCell(mRow, 9);
      if (m.relatedTransactions && m.relatedTransactions.length > 0) {
        groupCell.value = m.relatedTransactions.map((rt) => `${rt.date} | ${rt.description} | ${rt.amount}`).join("\n");
        groupCell.alignment = { wrapText: true, vertical: "top" };
      }
      groupCell.border = thinBorder();
      mRow++;
    }
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=conciliacion-${result.id.slice(0, 8)}.xlsx`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});
function darkGreenFill() {
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B5E20" } };
}
function lightGreenFill() {
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
}
function thinBorder() {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" }
  };
}
function writeSectionBar(sheet, row, title, total) {
  sheet.mergeCells(row, 1, row, 4);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  titleCell.fill = darkGreenFill();
  titleCell.alignment = { vertical: "middle" };
  const totalCell = sheet.getCell(row, 5);
  if (total !== null) {
    totalCell.value = total;
    totalCell.numFmt = "#,##0.00";
  }
  totalCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  totalCell.fill = darkGreenFill();
  totalCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(row).height = 22;
  return row + 1;
}
function writeColumnHeaders(sheet, row) {
  const headers = ["Fecha", "Doc", "Descripci\xF3n", "Valor"];
  for (let i = 0; i < headers.length; i++) {
    const cell = sheet.getCell(row, i + 1);
    cell.value = headers[i];
    cell.font = { bold: true, size: 10 };
    cell.fill = lightGreenFill();
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
  }
  return row + 1;
}
function writeTransactionRow(sheet, row, t, useAbsValue) {
  sheet.getCell(row, 1).value = t.date;
  sheet.getCell(row, 1).border = thinBorder();
  sheet.getCell(row, 2).value = t.reference;
  sheet.getCell(row, 2).border = thinBorder();
  sheet.getCell(row, 3).value = t.description;
  sheet.getCell(row, 3).border = thinBorder();
  const amountCell = sheet.getCell(row, 4);
  amountCell.value = useAbsValue ? Math.abs(t.amount) : t.amount;
  amountCell.numFmt = "#,##0.00";
  amountCell.alignment = { horizontal: "right" };
  amountCell.border = thinBorder();
  return row + 1;
}
function writeTransactionSection(sheet, row, title, transactions, useAbsValue) {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  row = writeSectionBar(sheet, row, title, total);
  row = writeColumnHeaders(sheet, row);
  if (transactions.length === 0) {
    sheet.mergeCells(row, 1, row, 4);
    const emptyCell = sheet.getCell(row, 1);
    emptyCell.value = "(Sin transacciones)";
    emptyCell.font = { italic: true, color: { argb: "FF999999" } };
    emptyCell.alignment = { horizontal: "center" };
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
function writeSummaryLine(sheet, row, label, value) {
  sheet.mergeCells(row, 1, row, 3);
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 10 };
  labelCell.border = thinBorder();
  sheet.mergeCells(row, 4, row, 5);
  const valueCell = sheet.getCell(row, 4);
  valueCell.value = value;
  if (typeof value === "number") {
    valueCell.numFmt = "#,##0";
  }
  valueCell.font = { bold: true, size: 10 };
  valueCell.alignment = { horizontal: "right" };
  valueCell.border = thinBorder();
  return row + 1;
}

// src/middleware/error.middleware.ts
function errorMiddleware(err, _req, res, _next) {
  console.error("Error:", err.message);
  res.status(500).json({
    error: err.message || "Error interno del servidor"
  });
}

// src/app.ts
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = path4.dirname(__filename3);
var app = express();
app.use(cors());
app.use(express.json());
app.get(["/api/health", "/health"], (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/upload", uploadRouter);
app.use("/api", reconciliationRouter);
app.use("/upload", uploadRouter);
app.use("/", reconciliationRouter);
if (!process.env.VERCEL) {
  const clientDist = path4.join(__dirname3, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path4.join(clientDist, "index.html"));
  });
}
app.use(errorMiddleware);

// src/index.ts
var PORT = process.env.PORT || 3001;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor de conciliacion corriendo en http://localhost:${PORT}`);
  });
}
export {
  app
};
