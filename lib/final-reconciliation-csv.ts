import { FINAL_OUTPUT_FIELDS, type FinalReconciliationSheet } from "./domain/types";

function escapeCsvCell(value: string | null): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('\"', '\"\"')}"` : text;
}

export function buildFinalReconciliationCsv(sheet: Pick<FinalReconciliationSheet, "rows" | "totals">): string {
  const header = FINAL_OUTPUT_FIELDS.map(escapeCsvCell).join(",");
  const rows = sheet.rows.map((row) => FINAL_OUTPUT_FIELDS.map((field) => escapeCsvCell(row[field])).join(","));
  const totalsRow = FINAL_OUTPUT_FIELDS.map((field) => {
    if (field === "客户名") return escapeCsvCell("合计");
    if (field === "数量" || field === "件数" || field === "净重" || field === "毛重") return escapeCsvCell(sheet.totals[field]);
    return "";
  }).join(",");
  return `\uFEFF${[header, ...rows, totalsRow].join("\r\n")}`;
}

export function finalReconciliationFileName(displayNo: string, sourceVersion: number): string {
  return `九立核对单-${displayNo}-v${sourceVersion}.csv`;
}
