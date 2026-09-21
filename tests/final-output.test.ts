import { describe, expect, it } from "vitest";
import {
  calculateFinalOutputTotals,
  createFinalOutputRow,
  FINAL_OUTPUT_FIELD_REQUIREMENTS,
  serializeFinalOutputRow,
  validateFinalOutputRow,
} from "../lib/domain/final-output";
import { FINAL_OUTPUT_FIELDS, type FinalOutputRow } from "../lib/domain/types";

function row(overrides: Partial<FinalOutputRow> = {}): FinalOutputRow {
  return createFinalOutputRow({
    客户名: "客户 A",
    品牌: "品牌 A",
    型号: "M-1",
    品名: "芯片",
    产地: "中国",
    单位: "个",
    数量: "1.20",
    报关单价: "2.5",
    总价: "3",
    币种: "USD",
    件数: "2",
    净重: "0.40",
    毛重: "0.50",
    ...overrides,
  });
}

describe("最终 25 列输出契约", () => {
  it("明确 13 项必填、2 项选填和 10 项随模板字段", () => {
    expect(Object.values(FINAL_OUTPUT_FIELD_REQUIREMENTS).filter((value) => value === "必填")).toHaveLength(13);
    expect(Object.values(FINAL_OUTPUT_FIELD_REQUIREMENTS).filter((value) => value === "选填")).toHaveLength(2);
    expect(Object.values(FINAL_OUTPUT_FIELD_REQUIREMENTS).filter((value) => value === "随模板")).toHaveLength(10);
  });

  it("按模板顺序输出完整 25 列，缺少来源的可选字段保持空值", () => {
    const output = createFinalOutputRow({ 客户名: "客户 A", 数量: "1" });

    expect(Object.keys(output)).toEqual(FINAL_OUTPUT_FIELDS);
    expect(serializeFinalOutputRow(output)).toHaveLength(25);
    expect(output.商品描述).toBeNull();
    expect(output.sku).toBeNull();
    expect(output.备注).toBeNull();
    expect(validateFinalOutputRow(output)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "必填值缺失", field: "品牌" }),
        expect.objectContaining({ code: "必填值缺失", field: "总价" }),
      ]),
    );
  });

  it("拒绝旧字段、少列或乱序，且允许选填字段为空", () => {
    const valid = row();
    expect(validateFinalOutputRow(valid)).toEqual([]);

    const wrongOrder = Object.fromEntries([
      ["品牌", valid.品牌],
      ...FINAL_OUTPUT_FIELDS.filter((field) => field !== "品牌").map((field) => [field, valid[field]]),
    ]);
    const issues = validateFinalOutputRow({ ...wrongOrder, 旧字段: "不应存在" });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "列顺序错误" }),
        expect.objectContaining({ code: "多余列", field: "旧字段" }),
      ]),
    );
  });

  it("精确计算四项合计，未知值不被当作 0", () => {
    expect(
      calculateFinalOutputTotals([
        row({ 数量: "1.20", 件数: "2", 净重: "0.40", 毛重: "0.50" }),
        row({ 数量: "2.3", 件数: "1", 净重: "0.6", 毛重: "1.25" }),
      ]),
    ).toEqual({ 数量: "3.50", 件数: "3", 净重: "1.00", 毛重: "1.75" });

    expect(calculateFinalOutputTotals([row({ 数量: "UNKNOWN" })]).数量).toBe("UNKNOWN");
    expect(calculateFinalOutputTotals([])).toEqual({ 数量: "0", 件数: "0", 净重: "0", 毛重: "0" });
  });

  it("UNKNOWN 不能通过必填校验", () => {
    expect(validateFinalOutputRow(row({ 客户名: "UNKNOWN", 数量: "UNKNOWN" }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "必填值缺失", field: "客户名" }),
        expect.objectContaining({ code: "必填值缺失", field: "数量" }),
      ]),
    );
  });
});
