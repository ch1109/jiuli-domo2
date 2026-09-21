import { describe, expect, it } from "vitest";
import { mergeInspectionSourceLines } from "../lib/domain/inspection-merge";
import type { FieldValue, InspectionSourceLine, InspectionSourceFields } from "../lib/domain/types";

const fixedNow = "2026-09-18T00:00:00.000Z";

type SourceLineOverrides = Partial<InspectionSourceFields> &
  Partial<Pick<InspectionSourceLine, "logicalInspectionOrderId" | "customerId" | "status">> & {
    otherFields?: Readonly<Record<string, FieldValue>>;
  };

function sourceLine(id: string, overrides: SourceLineOverrides = {}): InspectionSourceLine {
  const {
    logicalInspectionOrderId = "I-ORDER-001",
    customerId = "C-CUSTOMER-001",
    status = "可匹配",
    otherFields = {},
    ...fieldOverrides
  } = overrides;

  return {
    id,
    customerId,
    logicalInspectionOrderId,
    sourceFileId: "F-FILE-001",
    sourceLocation: {
      fileId: "F-FILE-001",
      page: 1,
      sheet: null,
      position: `商品表第${id.slice(-1)}行`,
    },
    fields: {
      品牌: "X",
      型号: "ABC-123",
      产地: "中国台湾",
      数量: "50",
      单位: "PCS",
      件数: "1",
      净重: "45.00",
      毛重: "52.00",
      ...fieldOverrides,
    },
    otherFields,
    status,
    occupiedDraftId: null,
    occupiedEntrustmentLineId: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
}

describe("查货三键合并", () => {
  it("同逻辑查货单内按品牌、型号、产地合并并精确累加", () => {
    const first = sourceLine("L-03");
    const secondWithValues = sourceLine("L-08", { 数量: "30", 净重: "27", 毛重: "31" });

    const merged = mergeInspectionSourceLines([first, secondWithValues], { now: fixedNow });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      logicalInspectionOrderId: "I-ORDER-001",
      mergeKey: { 品牌: "X", 型号: "ABC-123", 产地: "中国台湾" },
      fields: {
        数量: "80",
        净重: "72.00",
        毛重: "83.00",
        单位: "PCS",
        件数: "1",
      },
      sourceLineIds: ["L-03", "L-08"],
      aggregationWarnings: [],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    expect(first.status).toBe("可匹配");
    expect(secondWithValues.status).toBe("可匹配");
    expect(merged[0].sourceLineIds).toEqual([first.id, secondWithValues.id]);
  });

  it("不同逻辑查货单或任一三键不同都不会合并", () => {
    const sameKeyDifferentOrder = sourceLine("L-02", { logicalInspectionOrderId: "I-ORDER-002" });
    const differentBrand = sourceLine("L-03", { 品牌: "Y" });
    const differentModel = sourceLine("L-04", { 型号: "OTHER-999" });
    const differentOrigin = sourceLine("L-05", { 产地: "中国" });

    const merged = mergeInspectionSourceLines([
      sourceLine("L-01"),
      sameKeyDifferentOrder,
      differentBrand,
      differentModel,
      differentOrigin,
    ], { now: fixedNow });

    expect(merged).toHaveLength(5);
    expect(merged.every((group) => group.sourceLineIds.length > 0)).toBe(true);
  });

  it("合并展示保留每条原始行的独立占用状态", () => {
    const occupied = sourceLine("L-03", { status: "草稿占用" });
    const available = sourceLine("L-08", { status: "可匹配" });

    const [merged] = mergeInspectionSourceLines([occupied, available], { now: fixedNow });

    expect(merged.sourceLineIds).toEqual(["L-03", "L-08"]);
    expect(occupied.status).toBe("草稿占用");
    expect(available.status).toBe("可匹配");
  });

  it("三键含 UNKNOWN 时不猜测合并，数值不可计算时传播 UNKNOWN", () => {
    const unknownKey = sourceLine("L-02", { 型号: "UNKNOWN" });
    const unknownWeight = sourceLine("L-03", { 净重: "UNKNOWN" });

    const merged = mergeInspectionSourceLines([sourceLine("L-01"), unknownKey, unknownWeight], { now: fixedNow });

    expect(merged).toHaveLength(2);
    const incomplete = merged.find((group) => group.sourceLineIds.includes("L-03"));
    expect(incomplete?.fields.净重).toBe("UNKNOWN");
    expect(incomplete?.fields.数量).toBe("100");
    expect(incomplete?.aggregationWarnings).toContain("净重不可计算，合并结果不完整");
  });

  it("非合计字段出现多值时保留冲突，不静默选择一项", () => {
    const first = sourceLine("L-01", { otherFields: { 原箱号: "BOX-1" } });
    const secondWithExtra = sourceLine("L-02", { 件数: "2", otherFields: { 原箱号: "BOX-2" } });

    const [merged] = mergeInspectionSourceLines([first, secondWithExtra], { now: fixedNow });

    expect(merged.fields.件数).toBe("UNKNOWN");
    expect(merged.conflictingFields.件数).toEqual(["1", "2"]);
    expect(merged.otherFields.原箱号).toBe("UNKNOWN");
    expect(merged.conflictingOtherFields.原箱号).toEqual(["BOX-1", "BOX-2"]);
    expect(merged.aggregationWarnings).toEqual([
      "件数存在多值，待人工处理",
      "原箱号存在多值，待人工处理",
    ]);
  });
});
