import { describe, expect, it } from "vitest";
import {
  DRAFT_STATUSES,
  ENTRUSTMENT_LINE_STATUSES,
  FINAL_OUTPUT_FIELDS,
  FINAL_OUTPUT_TOTAL_FIELDS,
  INSPECTION_SOURCE_LINE_STATUSES,
  REQUIRED_FINAL_OUTPUT_FIELDS,
  type FinalOutputRow,
} from "../lib/domain/types";

describe("领域类型契约", () => {
  it("固定 25 列最终输出字段及其顺序", () => {
    expect(FINAL_OUTPUT_FIELDS).toEqual([
      "客户名",
      "品牌",
      "型号",
      "商品描述",
      "品名",
      "产地",
      "单位",
      "数量",
      "报关单价",
      "总价",
      "币种",
      "件数",
      "净重",
      "毛重",
      "sku",
      "对应的采购",
      "供应商号码",
      "供应商",
      "期票天数",
      "采购订单号",
      "物料号码",
      "托盘数",
      "入仓号",
      "产线",
      "备注",
    ]);
    expect(FINAL_OUTPUT_FIELDS).toHaveLength(25);
    expect(REQUIRED_FINAL_OUTPUT_FIELDS).toHaveLength(13);
    expect(FINAL_OUTPUT_TOTAL_FIELDS).toEqual(["数量", "件数", "净重", "毛重"]);
  });

  it("集中暴露三套业务状态，避免页面自行发明状态", () => {
    expect(DRAFT_STATUSES).toEqual(["待核对", "部分核对", "可提交人工确认", "人工确认中", "已完成"]);
    expect(ENTRUSTMENT_LINE_STATUSES).toEqual([
      "暂无查货依据",
      "已找到查货依据",
      "待人工处理",
      "人工已确认",
    ]);
    expect(INSPECTION_SOURCE_LINE_STATUSES).toEqual(["可匹配", "草稿占用", "已核销"]);
  });

  it("允许未知和无来源字段保持原样，不把 UNKNOWN 转为数字 0", () => {
    const row: FinalOutputRow = {
      客户名: "客户 A",
      品牌: "UNKNOWN",
      型号: "X-1",
      商品描述: null,
      品名: "集成电路",
      产地: "UNKNOWN",
      单位: "个",
      数量: "0",
      报关单价: null,
      总价: "UNKNOWN",
      币种: null,
      件数: "UNKNOWN",
      净重: "UNKNOWN",
      毛重: null,
      sku: null,
      对应的采购: null,
      供应商号码: null,
      供应商: null,
      期票天数: null,
      采购订单号: null,
      物料号码: null,
      托盘数: null,
      入仓号: null,
      产线: null,
      备注: null,
    };

    expect(row.品牌).toBe("UNKNOWN");
    expect(row.数量).toBe("0");
    expect(row.净重).toBe("UNKNOWN");
    expect(row.报关单价).toBeNull();
  });
});
