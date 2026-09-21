import { describe, expect, it } from "vitest";
import { resolveKnownCustomer } from "../lib/intake/customer-resolution";
import type { ParsedFactRow } from "../lib/intake/parse-contract";

const customers = [{ id: "C-1", name: "甲方科技有限公司" }, { id: "C-2", name: "乙方电子有限公司" }];
const fact = (rawText: string): ParsedFactRow => ({ id: `F-${rawText}`, fields: { rawText }, sourceLocation: { page: 1, sheet: null, row: null, position: null }, confidence: null, warnings: [] });

describe("TASK-0904 上传材料客户识别", () => {
  it("只用完整已知客户名做精确识别", () => {
    expect(resolveKnownCustomer({ facts: [fact("委托方：甲方科技有限公司")], customers })).toEqual({ status: "已识别", customerId: "C-1", evidence: "事实文本精确命中" });
    expect(resolveKnownCustomer({ facts: [fact("委托方：甲方科技")], customers })).toMatchObject({ status: "待补客户信息" });
  });

  it("多客户或手选客户冲突时进入冲突状态", () => {
    expect(resolveKnownCustomer({ facts: [fact("甲方科技有限公司 / 乙方电子有限公司")], customers })).toMatchObject({ status: "客户冲突" });
    expect(resolveKnownCustomer({ facts: [fact("委托方：甲方科技有限公司")], customers, selectedCustomerId: "C-2" })).toMatchObject({ status: "客户冲突" });
  });

  it("文本无客户时接受明确人工选择", () => {
    expect(resolveKnownCustomer({ facts: [fact("型号 M-001")], customers, selectedCustomerId: "C-2" })).toEqual({ status: "已识别", customerId: "C-2", evidence: "人工选择" });
  });

  it("委托书只从委托方字段识别客户，并支持 Excel 相邻单元格", () => {
    expect(resolveKnownCustomer({
      facts: [{ ...fact(""), fields: { column_1: "委托方：", column_2: "甲方科技有限公司", column_3: "代理方：", column_4: "乙方电子有限公司" } }],
      customers,
      materialType: "委托书",
    })).toMatchObject({ status: "已识别", customerId: "C-1" });
    expect(resolveKnownCustomer({ facts: [fact("委托方签字并盖章确认：")], customers, materialType: "委托书" })).toMatchObject({ status: "待补客户信息" });
  });

  it("查货材料没有上传前客户时必须补充", () => {
    expect(resolveKnownCustomer({ facts: [fact("型号 M-001")], customers, materialType: "查货" })).toMatchObject({ status: "待补客户信息" });
    expect(resolveKnownCustomer({ facts: [fact("型号 M-001")], customers, selectedCustomerId: "C-2", materialType: "查货" })).toMatchObject({ status: "已识别", customerId: "C-2" });
  });
});
