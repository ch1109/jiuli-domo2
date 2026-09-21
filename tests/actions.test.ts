import { describe, expect, it } from "vitest";
import {
  addInspectionBatch,
  createEntrustmentDraft,
  editDraftField,
  executeInitialMatching,
  establishAiMatch,
  findInspectionCandidates,
  ingestInspectionBatch,
  reassignMatch,
  reconcileDraftWithInspectionIncrement,
  submitDraftForManualConfirmation,
  confirmDraftLine,
  completeDraft,
  establishManualCompositeMatch,
  updateEntrustmentDraftMaterial,
  resolveDraftCustomer,
  selectMatchCandidate,
  unbindMatch,
} from "../lib/domain/actions";
import { createFinalOutputRow } from "../lib/domain/final-output";
import type { EntrustmentDraft, EntrustmentLine, InspectionSourceLine, SourceFile } from "../lib/domain/types";

const now = "2026-09-18T00:00:00.000Z";

function sourceFile(id: string, sha256: string, contentFingerprint: string | null = null): SourceFile {
  return {
    id,
    batchId: `B-${id}`,
    fileName: `${id}.pdf`,
    fileType: "pdf",
    materialType: "查货",
    sha256,
    contentFingerprint,
    pageCount: 1,
    source: "模拟上传",
    isDuplicate: false,
    duplicateOfFileId: null,
    createdAt: now,
  };
}

function sourceLine(id: string, customerId: string, model = "X"): InspectionSourceLine {
  return {
    id,
    customerId,
    logicalInspectionOrderId: "I-1",
    sourceFileId: "F-1",
    sourceLocation: { fileId: "F-1", page: 1, sheet: null, position: id },
    fields: { 品牌: "B", 型号: model, 产地: "中国", 数量: "1", 单位: "个", 件数: "1", 净重: "1", 毛重: "2" },
    otherFields: {},
    status: "可匹配",
    occupiedDraftId: null,
    occupiedEntrustmentLineId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function entrustmentLine(id = "L-1", model = "X"): EntrustmentLine {
  return {
    id,
    draftId: "D-1",
    sourceOrder: 1,
    fields: createFinalOutputRow({ 客户名: "客户 A", 品牌: "B", 型号: model, 品名: "货物", 产地: "中国", 单位: "个" }),
    status: "暂无查货依据",
    matchRelationIds: [],
    evidenceIds: [],
    issueIds: [],
    updatedFieldNames: [],
    manuallyConfirmed: false,
    sourceLocation: null,
  };
}

function draft(customerId: string | null = "C-A"): EntrustmentDraft {
  return {
    id: "D-1",
    displayNo: "W001",
    customerId,
    customerStatus: customerId ? "已识别" : "待补客户信息",
    version: 0,
    status: "待核对",
    lineIds: ["L-1"],
    materialFileIds: ["F-D"],
    hasAiUpdate: false,
    lastUpdateReason: null,
    isFinalized: false,
    finalReconciliationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("CASE-03 查货接入动作", () => {
  it("一份 PDF 按三个入仓号创建三个逻辑查货单，原始行唯一归属", () => {
    const result = ingestInspectionBatch({
      sourceFileId: "F-PDF",
      customerId: "C-A",
      createdAt: now,
      lines: [
        { id: "L-1", warehouseNo: "R001", fields: sourceLine("L-1", "C-A").fields, sourceLocation: { fileId: "F-PDF", page: 1, sheet: null, position: "1" } },
        { id: "L-2", warehouseNo: "R002", fields: sourceLine("L-2", "C-A").fields, sourceLocation: { fileId: "F-PDF", page: 2, sheet: null, position: "1" } },
        { id: "L-3", warehouseNo: "R003", fields: sourceLine("L-3", "C-A").fields, sourceLocation: { fileId: "F-PDF", page: 3, sheet: null, position: "1" } },
      ],
    });

    expect(result.logicalInspectionOrders).toHaveLength(3);
    expect(result.logicalInspectionOrders.map((order) => order.warehouseNo)).toEqual(["R001", "R002", "R003"]);
    expect(result.sourceLines).toHaveLength(3);
    expect(new Set(result.sourceLines.map((line) => line.logicalInspectionOrderId)).size).toBe(3);
    expect(result.logicalInspectionOrders.flatMap((order) => order.sourceLineIds)).toEqual(["L-1", "L-2", "L-3"]);
    expect(result.sourceLines.every((line) => line.sourceFileId === "F-PDF")).toBe(true);
  });

  it("重复上传不重复增加逻辑单、原始行或合并商品，并记录重复来源", () => {
    const firstFile = sourceFile("F-FIRST", "sha-1", "content-1");
    const first = addInspectionBatch({
      sourceFile: firstFile,
      batch: {
        sourceFileId: firstFile.id,
        customerId: "C-A",
        createdAt: now,
        lines: [{ id: "L-1", warehouseNo: "R001", fields: sourceLine("L-1", "C-A").fields, sourceLocation: { fileId: firstFile.id, page: 1, sheet: null, position: "1" } }],
      },
      store: { sourceFiles: [], logicalInspectionOrders: [], sourceLines: [], mergedProducts: [] },
    });
    expect(first.accepted).toBe(true);
    expect(first.store.logicalInspectionOrders).toHaveLength(1);
    expect(first.store.sourceLines).toHaveLength(1);
    expect(first.store.mergedProducts).toHaveLength(1);
    const duplicateFile = sourceFile("F-DUP", "sha-2", "content-1");
    const duplicate = addInspectionBatch({
      sourceFile: duplicateFile,
      batch: {
        sourceFileId: duplicateFile.id,
        customerId: "C-A",
        createdAt: now,
        lines: [{ id: "L-DUP", warehouseNo: "R001", fields: sourceLine("L-DUP", "C-A").fields, sourceLocation: { fileId: duplicateFile.id, page: 1, sheet: null, position: "1" } }],
      },
      store: first.store,
    });

    expect(duplicate.accepted).toBe(false);
    expect(duplicate.duplicateOfFileId).toBe("F-FIRST");
    expect(duplicate.store.sourceFiles).toHaveLength(2);
    expect(duplicate.store.sourceFiles[1]).toMatchObject({ isDuplicate: true, duplicateOfFileId: "F-FIRST" });
    expect(duplicate.store.logicalInspectionOrders).toHaveLength(1);
    expect(duplicate.store.sourceLines).toHaveLength(1);
    expect(duplicate.store.mergedProducts).toHaveLength(1);

    const sameHash = addInspectionBatch({
      sourceFile: sourceFile("F-SAME-HASH", "sha-1", "content-other"),
      batch: {
        sourceFileId: "F-SAME-HASH",
        customerId: "C-A",
        createdAt: now,
        lines: [{ id: "L-SAME-HASH", warehouseNo: "R002", fields: sourceLine("L-SAME-HASH", "C-A").fields, sourceLocation: { fileId: "F-SAME-HASH", page: 1, sheet: null, position: "1" } }],
      },
      store: first.store,
    });
    expect(sameHash.accepted).toBe(false);
    expect(sameHash.duplicateOfFileId).toBe("F-FIRST");
    expect(sameHash.store.logicalInspectionOrders).toHaveLength(1);
  });
});

describe("真实 Prompt 型号标记证据", () => {
  it("自动候选不推断后缀含义，原始型号保持不变", () => {
    const line = entrustmentLine("L-MARKER", "ABC123#9");
    const withoutMarker = sourceLine("S-MARKER", "C-A", "ABC123");
    const withMarker = { ...withoutMarker, otherFields: { "业务行标记": "#9" } };

    expect(findInspectionCandidates({ fields: line.fields, customerId: "C-A" }, [withoutMarker])).toEqual([]);
    expect(findInspectionCandidates({ fields: line.fields, customerId: "C-A" }, [withMarker])).toEqual([]);
    expect(line.fields.型号).toBe("ABC123#9");
  });

  it("后缀差异的唯一候选不由 AI 自动占用，人工选择后保留型号冲突", () => {
    const line = entrustmentLine("L-MARKER", "ABC123#9");
    const source = sourceLine("S-MARKER", "C-A", "ABC123");
    const matched = executeInitialMatching({ draft: draft(), entrustmentLines: [line], inspectionSourceLines: [source], now });

    expect(matched.relations).toHaveLength(0);
    expect(matched.candidatesByLineId["L-MARKER"]).toEqual([]);
    const selected = selectMatchCandidate({
      draft: matched.draft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: matched.inspectionSourceLines,
      entrustmentLineId: "L-MARKER",
      candidateSourceLineId: "S-MARKER",
      now,
    });
    expect(selected.relation.establishedBy).toBe("人工");
    expect(selected.entrustmentLines[0].issueIds).toContain("字段冲突:型号");
  });
});

describe("CASE-01 客户隔离与首次匹配动作", () => {
  it("候选只返回同一稳定客户 ID，另一个客户同型号商品不进入候选", () => {
    const line = entrustmentLine();
    const customerA = sourceLine("A-1", "C-A");
    const customerB = sourceLine("B-1", "C-B");
    expect(findInspectionCandidates({ fields: line.fields, customerId: "C-A" }, [customerA, customerB]).map((candidate) => candidate.id)).toEqual(["A-1"]);
  });

  it("唯一候选建立关系并同时占用原始行，输入对象不被直接修改", () => {
    const line = entrustmentLine();
    const originalSource = sourceLine("A-1", "C-A");
    const result = establishAiMatch({
      draft: draft(),
      entrustmentLines: [line],
      inspectionSourceLines: [originalSource],
      candidateSourceLineId: "A-1",
      now,
    });

    expect(result.relation.establishedBy).toBe("AI");
    expect(result.relation.inspectionSourceLineIds).toEqual(["A-1"]);
    expect(result.inspectionSourceLines[0]).toMatchObject({ status: "草稿占用", occupiedDraftId: "D-1", occupiedEntrustmentLineId: "L-1" });
    expect(result.entrustmentLines[0].status).toBe("已找到查货依据");
    expect(result.draft.version).toBe(1);
    expect(originalSource.status).toBe("可匹配");
    expect(line.matchRelationIds).toEqual([]);
  });

  it("客户未确定或跨客户商品不能建立关系，且不留下半状态", () => {
    expect(() => establishAiMatch({
      draft: draft(null),
      entrustmentLines: [entrustmentLine("L-1")],
      inspectionSourceLines: [sourceLine("A-1", "C-A")],
      candidateSourceLineId: "A-1",
      now,
    })).toThrow("客户未确定");

    const source = sourceLine("B-1", "C-B");
    expect(() => establishAiMatch({
      draft: draft(),
      entrustmentLines: [entrustmentLine()],
      inspectionSourceLines: [source],
      candidateSourceLineId: "B-1",
      now,
    })).toThrow("可靠候选");
    expect(source.status).toBe("可匹配");
  });

  it("首次匹配覆盖无候选、唯一候选和多候选，不把 AI 结果直接核销", () => {
    const uniqueLine = entrustmentLine("L-UNIQUE");
    const noCandidateLine = entrustmentLine("L-NONE", "NO-MATCH");
    const multipleLine = entrustmentLine("L-MULTI", "Y");
    const uniqueSource = sourceLine("S-UNIQUE", "C-A");
    const multipleA = sourceLine("S-MULTI-A", "C-A", "Y");
    const multipleB = sourceLine("S-MULTI-B", "C-A", "Y");
    const result = executeInitialMatching({
      draft: { ...draft(), lineIds: ["L-UNIQUE", "L-NONE", "L-MULTI"] },
      entrustmentLines: [uniqueLine, noCandidateLine, multipleLine],
      inspectionSourceLines: [uniqueSource, multipleA, multipleB],
      now,
    });

    expect(result.entrustmentLines.find((line) => line.id === "L-UNIQUE")).toMatchObject({ status: "已找到查货依据" });
    expect(result.entrustmentLines.find((line) => line.id === "L-NONE")).toMatchObject({ status: "暂无查货依据" });
    expect(result.entrustmentLines.find((line) => line.id === "L-MULTI")).toMatchObject({ status: "待人工处理", issueIds: ["多候选"] });
    expect(result.candidatesByLineId["L-MULTI"].map((line) => line.id)).toEqual(["S-MULTI-A", "S-MULTI-B"]);
    expect(result.inspectionSourceLines.find((line) => line.id === "S-UNIQUE")).toMatchObject({ status: "草稿占用" });
    expect(result.inspectionSourceLines.find((line) => line.id === "S-MULTI-A")).toMatchObject({ status: "可匹配" });
    expect(result.inspectionSourceLines.find((line) => line.id === "S-MULTI-B")).toMatchObject({ status: "可匹配" });
    expect(result.relations).toHaveLength(1);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.draft.hasAiUpdate).toBe(true);
  });

  it("人工解绑保留失效关系，释放原始行并重算草稿", () => {
    const originalLine = entrustmentLine();
    const originalSource = sourceLine("S-OLD", "C-A");
    const matched = establishAiMatch({
      draft: draft(),
      entrustmentLines: [originalLine],
      inspectionSourceLines: [originalSource],
      candidateSourceLineId: originalSource.id,
      now,
    });
    const unbound = unbindMatch({
      draft: matched.draft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: matched.inspectionSourceLines,
      relation: matched.relation,
      now,
    });

    expect(unbound.relation).toMatchObject({ active: false, invalidationReason: "人工解绑" });
    expect(unbound.inspectionSourceLines[0]).toMatchObject({ status: "可匹配", occupiedDraftId: null, occupiedEntrustmentLineId: null });
    expect(unbound.entrustmentLines[0]).toMatchObject({ status: "暂无查货依据", matchRelationIds: [] });
    expect(unbound.operation.operationType).toBe("解除匹配");
    expect(unbound.version.invalidatedRelationIds).toEqual([matched.relation.id]);
  });

  it("人工改配在同一动作中释放旧行、占用新行并建立人工关系", () => {
    const originalLine = entrustmentLine();
    const originalSource = sourceLine("S-OLD", "C-A");
    const newSource = sourceLine("S-NEW", "C-A", "NEW-MODEL");
    const matched = establishAiMatch({
      draft: draft(),
      entrustmentLines: [originalLine],
      inspectionSourceLines: [originalSource, newSource],
      candidateSourceLineId: originalSource.id,
      now,
    });
    const reassigned = reassignMatch({
      draft: matched.draft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: matched.inspectionSourceLines,
      relation: matched.relation,
      newInspectionSourceLineId: newSource.id,
      now,
    });

    expect(reassigned.oldRelation).toMatchObject({ active: false, invalidationReason: "人工改配" });
    expect(reassigned.newRelation).toMatchObject({ active: true, establishedBy: "人工", inspectionSourceLineIds: ["S-NEW"] });
    expect(reassigned.inspectionSourceLines.find((line) => line.id === "S-OLD")).toMatchObject({ status: "可匹配", occupiedDraftId: null });
    expect(reassigned.inspectionSourceLines.find((line) => line.id === "S-NEW")).toMatchObject({ status: "草稿占用", occupiedDraftId: "D-1" });
    expect(reassigned.entrustmentLines[0].matchRelationIds).toEqual([reassigned.newRelation.id]);
    expect(reassigned.operation.operationType).toBe("人工改配");
    expect(reassigned.version.invalidatedRelationIds).toEqual([matched.relation.id]);
  });

  it("多候选人工选择只占用被选中的查货行", () => {
    const line = entrustmentLine("L-MULTI");
    const first = sourceLine("S-FIRST", "C-A");
    const second = sourceLine("S-SECOND", "C-A");
    const initial = executeInitialMatching({
      draft: draft(),
      entrustmentLines: [line],
      inspectionSourceLines: [first, second],
      now,
    });
    const selected = selectMatchCandidate({
      draft: initial.draft,
      entrustmentLines: initial.entrustmentLines,
      inspectionSourceLines: initial.inspectionSourceLines,
      entrustmentLineId: "L-MULTI",
      candidateSourceLineId: "S-SECOND",
      now,
    });

    expect(selected.relation.establishedBy).toBe("人工");
    expect(selected.inspectionSourceLines.find((source) => source.id === "S-FIRST")).toMatchObject({ status: "可匹配" });
    expect(selected.inspectionSourceLines.find((source) => source.id === "S-SECOND")).toMatchObject({ status: "草稿占用" });
    expect(selected.entrustmentLines[0]).toMatchObject({ status: "已找到查货依据", issueIds: [] });
    expect(selected.operation.operationType).toBe("选择候选");
  });

  it("唯一候选首次匹配只生成一个版本", () => {
    const result = executeInitialMatching({
      draft: draft(),
      entrustmentLines: [entrustmentLine()],
      inspectionSourceLines: [sourceLine("S-ONLY", "C-A")],
      now,
    });

    expect(result.relations).toHaveLength(1);
    expect(result.operations).toHaveLength(1);
    expect(result.versions).toHaveLength(1);
  });

  it("字段冲突进入待人工处理，人工编辑保留旧值和新证据并清除该冲突", () => {
    const line = { ...entrustmentLine(), fields: { ...entrustmentLine().fields, 产地: "日本" } };
    const source = sourceLine("S-CONFLICT", "C-A");
    const matched = establishAiMatch({
      draft: draft(),
      entrustmentLines: [line],
      inspectionSourceLines: [source],
      candidateSourceLineId: source.id,
      now,
    });
    expect(matched.entrustmentLines[0].status).toBe("待人工处理");
    expect(matched.entrustmentLines[0].issueIds).toContain("字段冲突:产地");
    expect(matched.evidence.find((item) => item.field === "产地")).toMatchObject({ hadConflict: true, candidateValues: ["中国"] });

    const edited = editDraftField({
      draft: matched.draft,
      entrustmentLines: matched.entrustmentLines,
      entrustmentLineId: line.id,
      field: "产地",
      value: "中国台湾",
      sourceFileId: "F-MANUAL",
      sourceLocation: { fileId: "F-MANUAL", page: 1, sheet: null, position: "人工输入" },
      now,
    });
    expect(edited.entrustmentLines[0]).toMatchObject({ fields: { 产地: "中国台湾" }, status: "已找到查货依据" });
    expect(edited.entrustmentLines[0].issueIds).not.toContain("字段冲突:产地");
    expect(edited.evidence).toMatchObject({ isManuallyEdited: true, originalValue: "日本", currentValue: "中国台湾" });
    expect(edited.operation.operationType).toBe("人工编辑字段");
  });

  it("人工可以确认保留委托原值并关闭字段冲突", () => {
    const line = { ...entrustmentLine(), fields: { ...entrustmentLine().fields, 产地: "日本" }, issueIds: ["字段冲突:产地"], status: "待人工处理" as const, matchRelationIds: ["MR-1"] };
    const result = editDraftField({
      draft: { ...draft(), status: "部分核对" }, entrustmentLines: [line], entrustmentLineId: line.id,
      field: "产地", value: "日本", resolveConflict: true,
      sourceFileId: "MANUAL", sourceLocation: { fileId: "MANUAL", page: null, sheet: null, position: "人工确认" }, now,
    });

    expect(result.entrustmentLines[0].fields.产地).toBe("日本");
    expect(result.entrustmentLines[0].issueIds).not.toContain("字段冲突:产地");
    expect(result.evidence.isManuallyEdited).toBe(true);
  });
});

describe("CASE-02 新建委托草稿与补充客户", () => {
  it("客户识别失败时保留草稿，但明确阻止匹配", () => {
    const result = createEntrustmentDraft({
      draftId: "D-UNKNOWN",
      displayNo: "W-UNKNOWN",
      recognizedCustomerId: null,
      materialFileIds: ["F-ENTRUSTMENT"],
      lines: [{ id: "L-UNKNOWN", sourceOrder: 1, fields: { 型号: "X", 品牌: "B" } }],
      createdAt: now,
    });

    expect(result.draft.customerId).toBeNull();
    expect(result.draft.customerStatus).toBe("待补客户信息");
    expect(result.matchBlocked).toBe(true);
    expect(result.matchBlockedReason).toBe("未识别到客户，请补充客户名");
    expect(result.operation.operationType).toBe("新建委托");
    expect(() => establishAiMatch({
      draft: result.draft,
      entrustmentLines: result.lines,
      inspectionSourceLines: [sourceLine("A-UNKNOWN", "C-A")],
      candidateSourceLineId: "A-UNKNOWN",
      now,
    })).toThrow("客户未确定");
  });

  it("用户明确选择已知客户后绑定草稿并记录补充动作，未知客户被拒绝", () => {
    const created = createEntrustmentDraft({
      draftId: "D-UNKNOWN",
      displayNo: "W-UNKNOWN",
      recognizedCustomerId: null,
      materialFileIds: ["F-ENTRUSTMENT"],
      lines: [{ id: "L-UNKNOWN", sourceOrder: 1, fields: { 型号: "X", 品牌: "B" } }],
      createdAt: now,
    });
    expect(() => resolveDraftCustomer({
      draft: created.draft,
      lines: created.lines,
      customerId: "C-NOT-KNOWN",
      knownCustomerIds: ["C-A"],
      now,
    })).toThrow("客户标识不存在");

    const resolved = resolveDraftCustomer({
      draft: created.draft,
      lines: created.lines,
      customerId: "C-A",
      knownCustomerIds: ["C-A", "C-B"],
      now,
    });
    expect(resolved.draft.customerId).toBe("C-A");
    expect(resolved.draft.customerStatus).toBe("已识别");
    expect(resolved.draft.version).toBe(1);
    expect(resolved.operation.operationType).toBe("补充客户信息");
    expect(resolved.version.triggerReason).toBe("补充客户信息");
  });
});

describe("CASE-07 委托先到、查货后到", () => {
  it("只更新受新增查货影响的行，稳定行保持原快照", () => {
    const waitingLine = entrustmentLine("L-WAIT", "LATE");
    const stableLine = { ...entrustmentLine("L-STABLE", "STABLE"), status: "已找到查货依据" as const, matchRelationIds: ["MR-STABLE"] };
    const lateSource = sourceLine("S-LATE", "C-A", "LATE");
    const unrelatedSource = sourceLine("S-OTHER", "C-B", "LATE");
    const result = reconcileDraftWithInspectionIncrement({
      draft: { ...draft(), lineIds: [waitingLine.id, stableLine.id] },
      entrustmentLines: [waitingLine, stableLine],
      inspectionSourceLines: [lateSource, unrelatedSource],
      addedSourceLineIds: [lateSource.id],
      materialBatchId: "B-C008",
      now,
    });

    expect(result.version).not.toBeNull();
    expect(result.draft.version).toBe(1);
    expect(result.affectedLineIds).toEqual(["L-WAIT"]);
    expect(result.entrustmentLines.find((line) => line.id === "L-WAIT")).toMatchObject({ status: "已找到查货依据", matchRelationIds: [result.relations[0].id] });
    expect(result.entrustmentLines.find((line) => line.id === "L-STABLE")).toEqual(stableLine);
    expect(result.inspectionSourceLines.find((line) => line.id === "S-LATE")).toMatchObject({ status: "草稿占用", occupiedDraftId: "D-1" });
    expect(result.inspectionSourceLines.find((line) => line.id === "S-OTHER")?.status).toBe("可匹配");
  });

  it("重复增量检查没有变化，只记录操作事件", () => {
    const stableLine = { ...entrustmentLine("L-STABLE", "STABLE"), status: "已找到查货依据" as const, matchRelationIds: ["MR-STABLE"] };
    const source = sourceLine("S-LATE", "C-A", "LATE");
    const result = reconcileDraftWithInspectionIncrement({
      draft: { ...draft(), lineIds: [stableLine.id] },
      entrustmentLines: [stableLine],
      inspectionSourceLines: [source],
      addedSourceLineIds: [source.id],
      now,
    });
    expect(result.version).toBeNull();
    expect(result.operation.operationType).toBe("增量核对");
    expect(result.draft.version).toBe(0);
  });

  it("已完成草稿完全排除增量任务", () => {
    const line = { ...entrustmentLine(), status: "人工已确认" as const, matchRelationIds: ["MR-DONE"] };
    const result = reconcileDraftWithInspectionIncrement({
      draft: { ...draft(), status: "已完成", isFinalized: true, version: 4 },
      entrustmentLines: [line],
      inspectionSourceLines: [sourceLine("S-NEW", "C-A", "X")],
      addedSourceLineIds: ["S-NEW"],
      now,
    });
    expect(result.version).toBeNull();
    expect(result.affectedLineIds).toEqual([]);
    expect(result.draft.version).toBe(4);
    expect(result.operation.summary).toContain("已完成");
  });
});

describe("CASE-11 委托资料更新原草稿", () => {
  it("只重算发生变化的商品行，旧关系失效且原始行释放", () => {
    const oldLine = entrustmentLine("L-CHANGE", "OLD");
    const stableLine = { ...entrustmentLine("L-STABLE", "STABLE"), status: "已找到查货依据" as const, matchRelationIds: ["MR-STABLE"] };
    const oldSource = sourceLine("S-OLD", "C-A", "OLD");
    const newSource = sourceLine("S-NEW", "C-A", "NEW");
    const matched = establishAiMatch({
      draft: { ...draft(), lineIds: [oldLine.id, stableLine.id] },
      entrustmentLines: [oldLine, stableLine],
      inspectionSourceLines: [oldSource, newSource],
      candidateSourceLineId: oldSource.id,
      now,
    });
    const updatedLine = { ...matched.entrustmentLines.find((line) => line.id === oldLine.id)!, fields: { ...oldLine.fields, 型号: "NEW" } };
    const result = updateEntrustmentDraftMaterial({
      draft: matched.draft,
      currentLines: matched.entrustmentLines,
      updatedLines: [updatedLine, stableLine],
      inspectionSourceLines: matched.inspectionSourceLines,
      activeRelations: [matched.relation],
      materialBatchId: "B-UPDATE",
      now,
    });
    expect(result.changedLineIds).toEqual(["L-CHANGE"]);
    expect(result.invalidatedRelations[0]).toMatchObject({ id: matched.relation.id, active: false, invalidationReason: "更新委托资料" });
    expect(result.relations[0]).toMatchObject({ active: true, inspectionSourceLineIds: ["S-NEW"] });
    expect(result.inspectionSourceLines.find((line) => line.id === "S-OLD")).toMatchObject({ status: "可匹配", occupiedDraftId: null });
    expect(result.inspectionSourceLines.find((line) => line.id === "S-NEW")).toMatchObject({ status: "草稿占用", occupiedDraftId: "D-1" });
    expect(result.entrustmentLines.find((line) => line.id === "L-STABLE")).toEqual(stableLine);
    expect(result.version?.changedLineIds).toEqual(["L-CHANGE"]);
  });

  it("目标草稿已完成时拒绝更新", () => {
    expect(() => updateEntrustmentDraftMaterial({
      draft: { ...draft(), status: "已完成", isFinalized: true },
      currentLines: [entrustmentLine()],
      updatedLines: [entrustmentLine()],
      inspectionSourceLines: [],
      activeRelations: [],
      now,
    })).toThrow("已完成草稿不能更新委托资料");
  });
});

describe("CASE-14/0402 整单人工确认", () => {
  it("仍有无查货依据行时拒绝提交", () => {
    expect(() => submitDraftForManualConfirmation({
      draft: draft(),
      entrustmentLines: [entrustmentLine()],
      now,
    })).toThrow("仍有商品行暂无查货依据");
  });

  it("所有行有依据但有黄色问题时允许进入人工确认", () => {
    const line = { ...entrustmentLine(), status: "待人工处理" as const, matchRelationIds: ["MR-1"], issueIds: ["字段冲突:产地"] };
    const result = submitDraftForManualConfirmation({
      draft: { ...draft(), status: "部分核对" },
      entrustmentLines: [line],
      now,
    });
    expect(result.draft.status).toBe("人工确认中");
    expect(result.version.beforeDraftStatus).toBe("部分核对");
    expect(result.version.afterDraftStatus).toBe("人工确认中");
  });

  it("人工确认模式下只允许确认已处理问题的商品行", () => {
    const blocked = { ...entrustmentLine("L-BLOCKED"), status: "待人工处理" as const, matchRelationIds: ["MR-B"], issueIds: ["字段冲突:产地"] };
    const clear = { ...entrustmentLine("L-CLEAR"), status: "已找到查货依据" as const, matchRelationIds: ["MR-C"], issueIds: [] };
    const inReview = { ...draft(), status: "人工确认中" as const, lineIds: [blocked.id, clear.id], version: 2 };
    expect(() => confirmDraftLine({ draft: inReview, entrustmentLines: [blocked, clear], entrustmentLineId: blocked.id, now })).toThrow("仍有待处理问题");
    const result = confirmDraftLine({ draft: inReview, entrustmentLines: [blocked, clear], entrustmentLineId: clear.id, now });
    expect(result.entrustmentLines.find((line) => line.id === clear.id)).toMatchObject({ status: "人工已确认", manuallyConfirmed: true });
    expect(result.draft.version).toBe(3);
  });
});

describe("CASE-15 确认完成、最终核对单与核销", () => {
  function completeLine(): EntrustmentLine {
    return {
      ...entrustmentLine("L-DONE", "DONE"),
      fields: createFinalOutputRow({
        客户名: "客户 A", 品牌: "B", 型号: "DONE", 品名: "货物", 产地: "中国", 单位: "个",
        数量: "2", 报关单价: "10", 总价: "20", 币种: "USD", 件数: "1", 净重: "2", 毛重: "3",
      }),
      status: "人工已确认",
      matchRelationIds: ["MR-DONE"],
      manuallyConfirmed: true,
    };
  }

  it("仍有问题时拒绝确认完成", () => {
    const line = { ...completeLine(), issueIds: ["字段冲突:产地"] };
    expect(() => completeDraft({
      draft: { ...draft(), status: "人工确认中" },
      entrustmentLines: [line],
      inspectionSourceLines: [],
      activeRelations: [],
      confirmedBy: "user",
      now,
    })).toThrow("仍有商品行待处理问题");
  });

  it("确认完成原子生成最终单并核销实际使用的查货行", () => {
    const line = completeLine();
    const source = { ...sourceLine("S-DONE", "C-A", "DONE"), status: "草稿占用" as const, occupiedDraftId: "D-1", occupiedEntrustmentLineId: line.id };
    const relation = {
      id: "MR-DONE", draftId: "D-1", entrustmentLineId: line.id, logicalInspectionOrderId: source.logicalInspectionOrderId,
      inspectionMergedProductId: null, inspectionSourceLineIds: [source.id], establishedBy: "人工" as const, active: true,
      createdAt: now, invalidatedAt: null, invalidationReason: null, evidenceSummary: "人工确认",
    };
    const result = completeDraft({
      draft: { ...draft(), status: "人工确认中", version: 2, lineIds: [line.id] },
      entrustmentLines: [line],
      inspectionSourceLines: [source],
      activeRelations: [relation],
      finalEvidenceIds: ["FE-1"],
      manualChangeRecordIds: ["OP-1"],
      confirmedBy: "user",
      now,
    });
    expect(result.draft).toMatchObject({ status: "已完成", isFinalized: true, finalReconciliationId: result.finalReconciliation.id });
    expect(result.finalReconciliation.rows[0]["型号"]).toBe("DONE");
    expect(result.finalReconciliation.totals).toMatchObject({ 数量: "2", 件数: "1", 净重: "2", 毛重: "3" });
    expect(result.inspectionSourceLines[0]).toMatchObject({ status: "已核销", occupiedDraftId: "D-1" });
    expect(result.operations.map((operation) => operation.operationType)).toEqual(["确认完成", "查货商品核销"]);
    expect(result.version.afterDraftStatus).toBe("已完成");
  });
});

describe("CASE-16~19 复杂关系", () => {
  it("一条委托行可以组合多条查货原始行，其他原始行继续可匹配", () => {
    const line = entrustmentLine("L-MANY", "X");
    const first = sourceLine("S-1", "C-A", "X");
    const second = sourceLine("S-2", "C-A", "X");
    const third = sourceLine("S-3", "C-A", "X");
    const result = establishManualCompositeMatch({
      draft: draft(), entrustmentLines: [line], inspectionSourceLines: [first, second, third], entrustmentLineId: line.id, sourceLineIds: [first.id, second.id], now,
    });
    expect(result.relation.inspectionSourceLineIds).toEqual(["S-1", "S-2"]);
    expect(result.inspectionSourceLines.find((item) => item.id === "S-1")?.status).toBe("草稿占用");
    expect(result.inspectionSourceLines.find((item) => item.id === "S-2")?.status).toBe("草稿占用");
    expect(result.inspectionSourceLines.find((item) => item.id === "S-3")?.status).toBe("可匹配");
  });

  it("跨客户组合被拒绝且不留下半状态", () => {
    const line = entrustmentLine("L-MANY", "X");
    const own = sourceLine("S-OWN", "C-A", "X");
    const other = sourceLine("S-OTHER", "C-B", "X");
    expect(() => establishManualCompositeMatch({ draft: draft(), entrustmentLines: [line], inspectionSourceLines: [own, other], entrustmentLineId: line.id, sourceLineIds: [own.id, other.id], now })).toThrow("客户不一致");
    expect(own.status).toBe("可匹配");
    expect(other.status).toBe("可匹配");
  });

  it("已完成草稿不能新增组合关系", () => {
    const line = entrustmentLine("L-DONE", "X");
    const source = sourceLine("S-DONE", "C-A", "X");
    expect(() => establishManualCompositeMatch({
      draft: { ...draft(), status: "已完成", isFinalized: true },
      entrustmentLines: [line], inspectionSourceLines: [source],
      entrustmentLineId: line.id, sourceLineIds: [source.id], now,
    })).toThrow("已完成草稿不能建立人工关系");
  });

  it("已完成草稿不能通过任何关系动作再次占用或释放商品", () => {
    const line = entrustmentLine("L-FINAL", "X");
    const source = sourceLine("S-FINAL", "C-A", "X");
    const matched = establishAiMatch({
      draft: draft(),
      entrustmentLines: [line],
      inspectionSourceLines: [source],
      candidateSourceLineId: source.id,
      now,
    });
    const finalizedDraft = { ...matched.draft, status: "已完成" as const, isFinalized: true };
    expect(() => executeInitialMatching({
      draft: finalizedDraft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: matched.inspectionSourceLines,
      now,
    })).toThrow("已完成草稿不能执行首次匹配");
    expect(() => selectMatchCandidate({
      draft: finalizedDraft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: [sourceLine("S-OTHER", "C-A", "X")],
      entrustmentLineId: line.id,
      candidateSourceLineId: "S-OTHER",
      now,
    })).toThrow("已完成草稿不能选择候选");
    expect(() => unbindMatch({
      draft: finalizedDraft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: matched.inspectionSourceLines,
      relation: matched.relation,
      now,
    })).toThrow("已完成草稿不能解除匹配");
    expect(() => reassignMatch({
      draft: finalizedDraft,
      entrustmentLines: matched.entrustmentLines,
      inspectionSourceLines: [...matched.inspectionSourceLines, sourceLine("S-NEW", "C-A", "Y")],
      relation: matched.relation,
      newInspectionSourceLineId: "S-NEW",
      now,
    })).toThrow("已完成草稿不能改配");
  });
});
