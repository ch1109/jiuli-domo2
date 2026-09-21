import { describe, expect, it } from "vitest";
import { createDraftCheckOperation, createDraftVersionIfChanged } from "../lib/domain/versioning";
import { createFinalOutputRow } from "../lib/domain/final-output";
import type { DraftLineSnapshot } from "../lib/domain/types";

const before: DraftLineSnapshot = {
  entrustmentLineId: "L-1",
  fields: createFinalOutputRow({ 型号: "A" }),
  status: "暂无查货依据",
  matchRelationIds: [],
};

describe("TASK-0301 草稿版本机制", () => {
  it("首次结果保存为初始版本快照", () => {
    const version = createDraftVersionIfChanged({
      draftId: "D-1",
      version: 0,
      triggerReason: "新建委托",
      before: [],
      after: [before],
      actorType: "系统自动",
      createdAt: "2026-09-18T00:00:00.000Z",
    });
    expect(version).toMatchObject({ version: 0, changedLineIds: ["L-1"], before: [], after: [before] });
  });

  it("实际字段或关系变化才生成 Diff 版本", () => {
    const after: DraftLineSnapshot = {
      ...before,
      fields: createFinalOutputRow({ 型号: "B" }),
      status: "已找到查货依据",
      matchRelationIds: ["MR-1"],
    };
    const version = createDraftVersionIfChanged({
      draftId: "D-1",
      version: 1,
      triggerReason: "增量核对",
      before: [before],
      after: [after],
      addedRelationIds: ["MR-1"],
      actorType: "系统自动",
      createdAt: "2026-09-18T00:00:00.000Z",
    });
    expect(version?.changedLineIds).toEqual(["L-1"]);
    expect(version?.addedRelationIds).toEqual(["MR-1"]);
    expect(version?.before[0].fields["型号"]).toBe("A");
    expect(version?.after[0].fields["型号"]).toBe("B");
  });

  it("重复检查没有变化时不伪造版本，只记录检查事件", () => {
    const version = createDraftVersionIfChanged({
      draftId: "D-1",
      version: 1,
      triggerReason: "增量核对",
      before: [before],
      after: [before],
      actorType: "系统自动",
      createdAt: "2026-09-18T00:00:00.000Z",
    });
    expect(version).toBeNull();
    const operation = createDraftCheckOperation({
      draftId: "D-1",
      customerId: "C-A",
      lineIds: ["L-1"],
      operationType: "增量核对",
      summary: "检查完成，草稿结果无变化",
      occurredAt: "2026-09-18T00:00:00.000Z",
    });
    expect(operation).toMatchObject({ operationType: "增量核对", affectedEntrustmentLineIds: ["L-1"] });
  });
});

