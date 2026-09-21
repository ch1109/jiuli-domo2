import { describe, expect, it } from "vitest";
import { convertEntrustmentFacts } from "../lib/intake/entrustment-conversion";

const fact = (fields: Record<string, string | null>) => ({ id: "f1", fields, sourceLocation: { page: null, sheet: "委托", row: 7, position: null }, confidence: null, warnings: [] });

describe("表头驱动的委托事实转换", () => {
  it("按中文表头映射并保留来源与指纹", () => {
    const result = convertEntrustmentFacts({ fileId: "F1", contentSha256: "sha", customerName: "客户A", facts: [fact({ 品牌: "Acme", 型号: "M-1", 数量: "2" })] });
    expect(result.lines[0]).toMatchObject({ contentSha256: "sha", sourceLocation: { sheet: "委托", position: "第 7 行" }, fields: { 客户名: "客户A", 品牌: "Acme", 型号: "M-1", 数量: "2", 产地: "UNKNOWN" } });
  });
  it("未知模板不按列序猜测", () => {
    const result = convertEntrustmentFacts({ fileId: "F1", contentSha256: "sha", facts: [fact({ col1: "Acme", col2: "M-1" })] });
    expect(result.lines).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("明确中文表头");
  });
});
