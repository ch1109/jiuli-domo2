import type { FinalOutputField, MaterialType, SourceLocation } from "../domain/types";
import type { ParsedFactRow } from "./parse-contract";

export interface AuxiliaryConversionLine {
  readonly id: string;
  readonly fields: Readonly<Record<string, string | null>>;
  readonly sourceLocation: SourceLocation;
  readonly warnings: readonly string[];
}

export interface AuxiliaryConversion {
  readonly sourceFileId: string;
  readonly contentSha256: string;
  readonly materialType: Extract<MaterialType, "发票" | "箱单">;
  readonly customerId: string | null;
  readonly lines: readonly AuxiliaryConversionLine[];
  readonly warnings: readonly string[];
  readonly convertedAt: string;
}

const aliases: Record<FinalOutputField, readonly string[]> = {
  客户名: ["客户名", "客户", "收货人"], 品牌: ["品牌", "牌号"], 型号: ["型号", "规格型号", "料号", "货号"], 商品描述: ["商品描述", "描述"], 品名: ["品名", "商品名称", "名称"],
  产地: ["产地", "原产地"], 单位: ["单位", "计量单位"], 数量: ["数量", "申报数量", "箱数"], 报关单价: ["报关单价", "单价"], 总价: ["总价", "金额"], 币种: ["币种", "货币"], 件数: ["件数", "包装件数"], 净重: ["净重"], 毛重: ["毛重"], sku: ["sku", "SKU"], 对应的采购: ["对应的采购"], 供应商号码: ["供应商号码"], 供应商: ["供应商"], 期票天数: ["期票天数"], 采购订单号: ["采购订单号", "订单号"], 物料号码: ["物料号码"], 托盘数: ["托盘数"], 入仓号: ["入仓号", "仓号", "入仓编号"], 产线: ["产线", "生产线"], 备注: ["备注", "说明"],
};

const normalize = (value: string) => value.trim().replace(/\s+/g, "").replace(/[（）()]/g, "").toLowerCase();

export function convertAuxiliaryFacts(input: {
  readonly facts: readonly ParsedFactRow[];
  readonly fileId: string;
  readonly contentSha256: string;
  readonly materialType: Extract<MaterialType, "发票" | "箱单">;
  readonly customerId: string | null;
  readonly convertedAt: string;
}): AuxiliaryConversion {
  const warnings: string[] = [];
  const lines: AuxiliaryConversionLine[] = [];
  for (const [index, fact] of input.facts.entries()) {
    const fields = { ...fact.fields };
    const keys = new Map(Object.keys(fields).map((key) => [normalize(key), key]));
    const recognized = Object.values(aliases).some((items) => items.some((alias) => keys.has(normalize(alias))));
    if (!recognized) {
      warnings.push(`第 ${index + 1} 行没有识别到辅助材料字段`);
      continue;
    }
    const sourceLocation: SourceLocation = { fileId: input.fileId, page: fact.sourceLocation.page, sheet: fact.sourceLocation.sheet, position: fact.sourceLocation.row ? `第 ${fact.sourceLocation.row} 行` : fact.sourceLocation.position };
    lines.push({ id: `AUX-${input.fileId}-${fact.sourceLocation.sheet ?? "page"}-${fact.sourceLocation.row ?? index + 1}`, fields, sourceLocation, warnings: [...fact.warnings] });
  }
  if (!lines.length) warnings.push("未生成辅助材料事实行：请提供包含型号、物料号码或 SKU 的表格行");
  return { sourceFileId: input.fileId, contentSha256: input.contentSha256, materialType: input.materialType, customerId: input.customerId, lines, warnings, convertedAt: input.convertedAt };
}

export function auxiliaryFieldValue(line: AuxiliaryConversionLine, field: FinalOutputField): string | null {
  const map = new Map(Object.entries(line.fields).map(([key, value]) => [normalize(key), value]));
  const alias = aliases[field].find((item) => map.has(normalize(item)));
  return alias ? map.get(normalize(alias)) ?? null : null;
}
