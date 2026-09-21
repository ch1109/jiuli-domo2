import type { ParsedFactRow } from "./parse-contract";
import type { InspectionSourceFields, SourceLocation } from "../domain/types";

const aliases: Record<keyof InspectionSourceFields, string[]> = { 品牌: ["品牌", "牌号"], 型号: ["型号", "规格型号", "料号", "货号"], 产地: ["产地", "原产地"], 数量: ["数量", "查货数量"], 单位: ["单位", "计量单位"], 件数: ["件数", "包装件数"], 净重: ["净重"], 毛重: ["毛重"] };
const norm = (v: string) => v.trim().replace(/\s+/g, "").replace(/[（）()]/g, "");
export interface InspectionConversionLine { id: string; customerId: string | null; warehouseNo: string | null; fields: InspectionSourceFields; sourceFileId: string; sourceLocation: SourceLocation; contentSha256: string; warnings: string[]; }
export function convertInspectionFacts(input: { facts: readonly ParsedFactRow[]; fileId: string; contentSha256: string; customerId: string | null; logicalInspectionOrderId?: string }): { lines: InspectionConversionLine[]; warnings: string[] } {
  const warnings: string[] = []; const lines: InspectionConversionLine[] = [];
  for (const [index, fact] of input.facts.entries()) {
    const map = new Map(Object.entries(fact.fields).map(([k, v]) => [norm(k), v ?? ""]));
    const warehouseNo = map.get("入仓号") || map.get("仓号") || map.get("入仓编号") || null;
    const fields = {} as { -readonly [K in keyof InspectionSourceFields]: InspectionSourceFields[K] }; let recognized = false;
    for (const field of Object.keys(aliases) as (keyof InspectionSourceFields)[]) { const key = aliases[field].find((a) => map.has(norm(a))); if (key) recognized = true; fields[field] = key ? (map.get(norm(key)) || null) : null; }
    if (!recognized) { warnings.push(`第 ${index + 1} 行没有识别到查货字段`); continue; }
    const sourceLocation: SourceLocation = { fileId: input.fileId, page: fact.sourceLocation.page, sheet: fact.sourceLocation.sheet, position: fact.sourceLocation.row ? `第 ${fact.sourceLocation.row} 行` : fact.sourceLocation.position };
    const lineWarnings = [...fact.warnings];
    if (!warehouseNo) lineWarnings.push("缺少入仓号，不能形成逻辑查货单");
    const sourceKey = fact.sourceLocation.sheet ? `${fact.sourceLocation.sheet}-R${fact.sourceLocation.row ?? index + 1}` : `R${fact.sourceLocation.row ?? index + 1}`;
    lines.push({ id: `INSPECT-${input.fileId}-${sourceKey}`, customerId: input.customerId, warehouseNo, fields, sourceFileId: input.fileId, sourceLocation, contentSha256: input.contentSha256, warnings: lineWarnings });
  }
  if (!lines.length) warnings.push("未生成查货商品行：文件必须包含明确查货字段");
  return { lines, warnings };
}
