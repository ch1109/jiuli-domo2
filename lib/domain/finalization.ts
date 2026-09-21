import { calculateFinalOutputTotals, validateFinalOutputRow } from "./final-output";
import { deriveInspectionSourceLineStatus } from "./status";
import { createDraftVersionIfChanged, snapshotDraftLine } from "./versioning";
import type {
  DraftVersion,
  EntrustmentDraft,
  EntrustmentLine,
  FieldEvidenceId,
  FinalReconciliationSheet,
  InspectionSourceLine,
  IsoDateTime,
  OperationRecord,
  ProductMatchRelation,
} from "./types";

export interface CompleteDraftInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly activeRelations: readonly ProductMatchRelation[];
  readonly finalEvidenceIds?: readonly FieldEvidenceId[];
  readonly manualChangeRecordIds?: readonly string[];
  readonly resolvedIssueIds?: readonly string[];
  readonly confirmedBy: string;
  readonly now: IsoDateTime;
}

export interface CompleteDraftResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly finalReconciliation: FinalReconciliationSheet;
  readonly operations: readonly OperationRecord[];
  readonly version: DraftVersion;
}

/** 封版动作：校验问题、生成 25 列快照、核销查货，并将草稿置为不可再增量更新。 */
export function completeDraft(input: CompleteDraftInput): CompleteDraftResult {
  if (input.draft.status !== "人工确认中") throw new Error("草稿不在人工确认中");
  if (input.draft.isFinalized) throw new Error("草稿已经完成");
  if (input.confirmedBy.trim() === "") throw new Error("确认人不能为空");
  if (input.entrustmentLines.some((line) => line.issueIds.length > 0)) throw new Error("仍有商品行待处理问题");
  if (input.entrustmentLines.some((line) => !line.manuallyConfirmed)) throw new Error("仍有商品行未完成人工确认");

  if (!input.draft.customerId) throw new Error("客户未确定，禁止完成");
  const linesById = new Map(input.entrustmentLines.map(line => [line.id, line]));
  if (!linesById.size || linesById.size !== input.entrustmentLines.length ||
      input.draft.lineIds.length !== linesById.size || new Set(input.draft.lineIds).size !== linesById.size ||
      input.draft.lineIds.some(id => !linesById.has(id)) ||
      input.entrustmentLines.some(line => line.draftId !== input.draft.id)) {
    throw new Error("委托商品行与草稿不一致");
  }
  const activeRelations = input.activeRelations.filter((relation) => relation.active);
  const relationById = new Map(activeRelations.map(relation => [relation.id, relation]));
  if (relationById.size !== activeRelations.length) throw new Error("存在重复匹配关系");
  for (const line of input.entrustmentLines) {
    if (!line.matchRelationIds.length || new Set(line.matchRelationIds).size !== line.matchRelationIds.length ||
        line.matchRelationIds.some(id => relationById.get(id)?.entrustmentLineId !== line.id)) {
      throw new Error("存在商品行没有有效查货关系或关系引用不一致");
    }
  }
  const sourcesById = new Map(input.inspectionSourceLines.map(source => [source.id, source]));
  if (sourcesById.size !== input.inspectionSourceLines.length) throw new Error("存在重复查货原始行");
  const relationSourceIds = new Set<string>();
  for (const relation of activeRelations) {
    const line = linesById.get(relation.entrustmentLineId);
    if (relation.draftId !== input.draft.id || !line?.matchRelationIds.includes(relation.id) || !relation.inspectionSourceLineIds.length) {
      throw new Error("匹配关系不属于当前草稿商品行");
    }
    for (const sourceId of relation.inspectionSourceLineIds) {
      if (relationSourceIds.has(sourceId)) throw new Error("查货原始行被重复使用");
      const source = sourcesById.get(sourceId);
      if (!source || source.customerId !== input.draft.customerId || source.status !== "草稿占用" ||
          source.occupiedDraftId !== input.draft.id || source.occupiedEntrustmentLineId !== line.id) {
        throw new Error("查货商品不存在或客户、占用关系不一致");
      }
      relationSourceIds.add(sourceId);
    }
  }
  const sourceLines = input.inspectionSourceLines.map((line) => {
    if (!relationSourceIds.has(line.id)) return { ...line };
    if (line.occupiedDraftId !== input.draft.id) throw new Error("查货商品占用关系不一致");
    return {
      ...line,
      status: deriveInspectionSourceLineStatus({ hasActiveDraftOccupation: false, isWrittenOff: true }),
      occupiedDraftId: input.draft.id,
      updatedAt: input.now,
    };
  });

  for (const line of input.entrustmentLines) {
    const issues = validateFinalOutputRow(line.fields);
    if (issues.length > 0) throw new Error(`最终核对单字段不完整：${issues.map((issue) => issue.message).join("；")}`);
  }
  const finalReconciliationId = `FR-${input.draft.id}-v${input.draft.version + 1}`;
  const finalReconciliation: FinalReconciliationSheet = {
    id: finalReconciliationId,
    sourceDraftId: input.draft.id,
    sourceVersion: input.draft.version + 1,
    rows: input.entrustmentLines.map((line) => ({ ...line.fields })),
    totals: calculateFinalOutputTotals(input.entrustmentLines.map((line) => line.fields)),
    finalMatchRelationIds: activeRelations.map((relation) => relation.id),
    finalEvidenceIds: [...(input.finalEvidenceIds ?? [])],
    manualChangeRecordIds: [...(input.manualChangeRecordIds ?? [])],
    resolvedIssueIds: [...(input.resolvedIssueIds ?? [])],
    confirmedBy: input.confirmedBy,
    confirmedAt: input.now,
  };
  const draft: EntrustmentDraft = {
    ...input.draft,
    status: "已完成",
    isFinalized: true,
    finalReconciliationId,
    version: input.draft.version + 1,
    lastUpdateReason: "确认完成",
    updatedAt: input.now,
  };
  const version = createDraftVersionIfChanged({
    draftId: draft.id,
    version: draft.version,
    triggerReason: "确认完成",
    before: input.entrustmentLines.map(snapshotDraftLine),
    after: input.entrustmentLines.map(snapshotDraftLine),
    actorType: "人工操作",
    createdAt: input.now,
    id: `DV-${draft.id}-${draft.version}-complete`,
    beforeDraftStatus: input.draft.status,
    afterDraftStatus: draft.status,
  });
  if (!version) throw new Error("确认完成没有产生终态版本");
  const operations: OperationRecord[] = [
    {
      id: `OP-${draft.id}-${draft.version}-complete`,
      operationType: "确认完成",
      actorType: "人工操作",
      customerId: draft.customerId,
      draftId: draft.id,
      affectedEntrustmentLineIds: input.entrustmentLines.map((line) => line.id),
      affectedInspectionSourceLineIds: [...relationSourceIds],
      summary: `确认完成，生成最终核对单 ${finalReconciliationId}`,
      occurredAt: input.now,
    },
    {
      id: `OP-${draft.id}-${draft.version}-writeoff`,
      operationType: "查货商品核销",
      actorType: "系统自动",
      customerId: draft.customerId,
      draftId: draft.id,
      affectedEntrustmentLineIds: input.entrustmentLines.map((line) => line.id),
      affectedInspectionSourceLineIds: [...relationSourceIds],
      summary: `核销 ${relationSourceIds.size} 条查货原始商品`,
      occurredAt: input.now,
    },
  ];
  return { draft, entrustmentLines: input.entrustmentLines.map((line) => ({ ...line })), inspectionSourceLines: sourceLines, finalReconciliation, operations, version };
}
