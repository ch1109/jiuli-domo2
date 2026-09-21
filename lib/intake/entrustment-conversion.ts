import { createFinalOutputRow } from "../domain/final-output";
import type { FinalOutputRow, SourceLocation } from "../domain/types";
import type { ParsedFactRow } from "./parse-contract";

export const ENTRUSTMENT_HEADER_ALIASES: Readonly<Record<keyof FinalOutputRow, readonly string[]>> = {
  客户名: ["客户名", "客户", "收货人"], 品牌: ["品牌", "牌号"], 型号: ["型号", "规格型号", "料号", "货号"], 商品描述: ["商品描述", "描述"], 品名: ["品名", "商品名称", "名称"], 产地: ["产地", "原产地"], 单位: ["单位", "计量单位"], 数量: ["数量", "申报数量"], 报关单价: ["报关单价", "单价", "申报单价"], 总价: ["总价", "金额", "申报总价"], 币种: ["币种", "货币"], 件数: ["件数", "包装件数"], 净重: ["净重"], 毛重: ["毛重"], sku: ["sku", "SKU"], 对应的采购: ["对应的采购"], 供应商号码: ["供应商号码"], 供应商: ["供应商"], 期票天数: ["期票天数"], 采购订单号: ["采购订单号", "订单号"], 物料号码: ["物料号码"], 托盘数: ["托盘数"], 入仓号: ["入仓号"], 产线: ["产线", "生产线"], 备注: ["备注", "说明"],
};

const normalize = (value: string) => value.trim().replace(/\s+/g, "").replace(/[（）()]/g, "");

export interface EntrustmentConversionLine { id: string; sourceOrder: number; fields: FinalOutputRow; sourceLocation: SourceLocation; contentSha256: string; warnings: string[] }

export function convertEntrustmentFacts(input: { facts: readonly ParsedFactRow[]; fileId: string; contentSha256: string; customerName?: string | null }): { lines: EntrustmentConversionLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines: EntrustmentConversionLine[] = [];
  for (const [index, fact] of input.facts.entries()) {
    if (fact.warnings.some((warning) => warning.includes("表头行"))) continue;
    const entries = Object.entries(fact.fields).filter(([key]) => key.trim());
    const headerMap = new Map<string, string>();
    for (const [key, value] of entries) headerMap.set(normalize(key), value ?? "");
    const fields = {} as FinalOutputRow;
    for (const field of Object.keys(ENTRUSTMENT_HEADER_ALIASES) as (keyof FinalOutputRow)[]) {
      const alias = ENTRUSTMENT_HEADER_ALIASES[field].find((item) => headerMap.has(normalize(item)));
      fields[field] = alias ? (headerMap.get(normalize(alias)) || "UNKNOWN") : field === "客户名" && input.customerName ? input.customerName : "UNKNOWN";
    }
    const recognized = Object.values(ENTRUSTMENT_HEADER_ALIASES).some((aliases) => aliases.some((alias) => headerMap.has(normalize(alias))));
    if (!recognized) { warnings.push(`第 ${index + 1} 行没有识别到明确中文表头`); continue; }
    const sourceLocation: SourceLocation = { fileId: input.fileId, page: fact.sourceLocation.page, sheet: fact.sourceLocation.sheet, row:fact.sourceLocation.row, position: fact.sourceLocation.row ? `第 ${fact.sourceLocation.row} 行` : fact.sourceLocation.position };
    const sourceKey = fact.sourceLocation.sheet ? `${fact.sourceLocation.sheet}-R${fact.sourceLocation.row ?? index + 1}` : `R${fact.sourceLocation.row ?? index + 1}`;
    lines.push({ id: `ENTRUST-${input.fileId}-${sourceKey}`, sourceOrder: index + 1, fields: createFinalOutputRow(fields), sourceLocation, contentSha256: input.contentSha256, warnings: [...fact.warnings] });
  }
  if (!lines.length) warnings.push("未生成委托草稿行：文件必须包含明确中文表头");
  return { lines, warnings };
}
