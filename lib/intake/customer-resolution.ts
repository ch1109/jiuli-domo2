import type { ParsedFactRow } from "./parse-contract";

export type CustomerResolutionDecision =
  | { status: "已识别"; customerId: string; evidence: "人工选择" | "事实文本精确命中" }
  | { status: "待补客户信息"; reason: string }
  | { status: "客户冲突"; reason: string };

function commissionPartyText(facts: readonly ParsedFactRow[]): string | null {
  for (const fact of facts) {
    const entries = Object.entries(fact.fields).filter(([, value]) => typeof value === "string" && value.trim());
    const partyIndex = entries.findIndex(([, value]) => /(?:^|[\r\n])\s*委托方\s*(?:[:：]|\s|$)/.test(value as string));
    if (partyIndex < 0) continue;

    const [partyKey, partyValue] = entries[partyIndex];
    const inlineMatch = (partyValue as string).match(/(?:^|[\r\n])\s*委托方\s*(?:[:：]\s*|\s+)([^\r\n]*)/);
    const inlineValue = inlineMatch?.[1]?.trim() ?? "";
    if (inlineValue) return inlineValue;

    // Excel 委托书通常把“委托方：”和公司名放在相邻单元格，保留同一行的相邻值。
    const adjacent = entries[partyIndex + 1]?.[1];
    if (adjacent && !/^(代理方|日期|合同号)\s*[:：]?/.test(adjacent as string)) return adjacent as string;

    // 兼容字段顺序被解析器重排的情况：取委托方标签右侧第一个非标签值。
    const fallback = entries.find(([key, value]) => key !== partyKey && !/^(委托方|代理方|日期|合同号)\s*[:：]?/.test(value as string));
    if (fallback) return fallback[1] as string;
  }
  return null;
}

export function resolveKnownCustomer(input: { facts: readonly ParsedFactRow[]; customers: readonly { id: string; name: string }[]; selectedCustomerId?: string | null; materialType?: "委托书" | "查货" | "发票" | "箱单" | null }): CustomerResolutionDecision {
  const allText = input.facts.flatMap((fact) => Object.values(fact.fields)).filter((value): value is string => typeof value === "string").join("\n");
  const text = input.materialType === "委托书" ? commissionPartyText(input.facts) ?? "" : allText;
  const matches = input.customers.filter((customer) => text.includes(customer.name));
  const selected = input.selectedCustomerId ? input.customers.find((customer) => customer.id === input.selectedCustomerId) : undefined;

  if (input.materialType === "查货" && !selected) return { status: "待补客户信息", reason: "查货材料上传前必须填写所属客户" };
  if (matches.length > 1) return { status: "客户冲突", reason: `材料中出现多个已知客户：${matches.map((item) => item.name).join("、")}` };
  if (selected && matches.length === 1 && matches[0].id !== selected.id) return { status: "客户冲突", reason: `所选客户 ${selected.name} 与材料中的 ${matches[0].name} 不一致` };
  if (selected) return { status: "已识别", customerId: selected.id, evidence: "人工选择" };
  if (matches.length === 1) return { status: "已识别", customerId: matches[0].id, evidence: "事实文本精确命中" };
  return { status: "待补客户信息", reason: "材料中未精确命中已知客户全名" };
}
