import { describe, expect, it } from "vitest";
import { buildFinalReconciliationCsv, finalReconciliationFileName } from "../lib/final-reconciliation-csv";
import { FINAL_OUTPUT_FIELDS, type FinalOutputRow, type FinalReconciliationSheet } from "../lib/domain/types";

describe("最终核对单 CSV", () => {
  it("使用 BOM、固定 25 列顺序并正确转义", () => {
    const row = Object.fromEntries(FINAL_OUTPUT_FIELDS.map((field) => [field, field === "商品描述" ? '含"引号,逗号' : field])) as FinalOutputRow;
    const sheet = { rows: [row], totals: { 数量: "9", 件数: "2", 净重: "3.5", 毛重: "4" } } as unknown as FinalReconciliationSheet;
    const csv = buildFinalReconciliationCsv(sheet);
    const [header, data, totals] = csv.slice(1).split("\r\n");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(header.split(",")).toEqual(FINAL_OUTPUT_FIELDS);
    expect(data).toContain('"含""引号,逗号"');
    const totalsCells = totals.split(",");
    expect(totalsCells).toHaveLength(25);
    expect(totalsCells[0]).toBe("合计");
    expect(totalsCells[FINAL_OUTPUT_FIELDS.indexOf("数量")]).toBe("9");
    expect(totalsCells[FINAL_OUTPUT_FIELDS.indexOf("件数")]).toBe("2");
    expect(totalsCells[FINAL_OUTPUT_FIELDS.indexOf("净重")]).toBe("3.5");
    expect(totalsCells[FINAL_OUTPUT_FIELDS.indexOf("毛重")]).toBe("4");
  });

  it("文件名包含草稿号和封版来源版本", () => {
    expect(finalReconciliationFileName("JL-2026-018", 7)).toBe("九立核对单-JL-2026-018-v7.csv");
  });
});
