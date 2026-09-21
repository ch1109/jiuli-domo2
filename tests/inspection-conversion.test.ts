import { describe, expect, it } from "vitest";
import { convertInspectionFacts } from "../lib/intake/inspection-conversion";
const fact = (fields: Record<string,string|null>) => ({ id: "F1", fields, sourceLocation: { page: null, sheet: "查货", row: 2, position: null }, confidence: 1, warnings: [] });
describe("查货事实转换", () => {
  it("按查货表头生成带来源和入仓号的商品行", () => { const result = convertInspectionFacts({ fileId: "FILE", contentSha256: "sha", customerId: "C1", facts: [fact({ 品牌: "Acme", 型号: "M1", 数量: "2", 入仓号: "R001" })] }); expect(result.lines[0]).toMatchObject({ customerId: "C1", warehouseNo: "R001", fields: { 型号: "M1", 数量: "2" }, sourceLocation: { sheet: "查货" } }); });
  it("未知模板不按列序猜测", () => { expect(convertInspectionFacts({ fileId: "FILE", contentSha256: "sha", customerId: null, facts: [fact({ a: "x" })] }).lines).toHaveLength(0); });
});
