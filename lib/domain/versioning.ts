import type {
  ActorType,
  DraftLineSnapshot,
  DraftVersion,
  EntrustmentLine,
  EntrustmentLineId,
  IsoDateTime,
  MatchRelationId,
  OperationRecord,
  CustomerId,
  DraftId,
} from "./types";

/** 版本只保存与草稿结果有关的稳定快照，不把运行时对象直接挂进历史。 */
export function snapshotDraftLine(line: EntrustmentLine): DraftLineSnapshot {
  return {
    entrustmentLineId: line.id,
    ...(line.lockedFields?.length ? {lockedFields:[...line.lockedFields]} : {}),
    fields: { ...line.fields },
    status: line.status,
    matchRelationIds: [...line.matchRelationIds],
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function draftLineSnapshotChanged(
  before: DraftLineSnapshot,
  after: DraftLineSnapshot,
): boolean {
  return !sameJson(before, after);
}

export interface CreateDraftVersionInput {
  readonly draftId: DraftId;
  readonly version: number;
  readonly triggerReason: string;
  readonly materialBatchIds?: readonly string[];
  readonly before: readonly DraftLineSnapshot[];
  readonly after: readonly DraftLineSnapshot[];
  readonly addedRelationIds?: readonly MatchRelationId[];
  readonly invalidatedRelationIds?: readonly MatchRelationId[];
  readonly actorType: ActorType;
  readonly createdAt: IsoDateTime;
  readonly id?: string;
  readonly beforeDraftStatus?: DraftVersion["beforeDraftStatus"];
  readonly afterDraftStatus?: DraftVersion["afterDraftStatus"];
}

/** 只有业务结果真的改变时才生成版本；无变化返回 null。 */
export function createDraftVersionIfChanged(
  input: CreateDraftVersionInput,
): DraftVersion | null {
  const beforeById = new Map(input.before.map((line) => [line.entrustmentLineId, line]));
  const afterById = new Map(input.after.map((line) => [line.entrustmentLineId, line]));
  const changedLineIds = [...new Set([
    ...input.before.map((line) => line.entrustmentLineId),
    ...input.after.map((line) => line.entrustmentLineId),
  ])].filter((lineId) => {
    const before = beforeById.get(lineId);
    const after = afterById.get(lineId);
    return before === undefined || after === undefined || draftLineSnapshotChanged(before, after);
  });
  const addedRelationIds = [...(input.addedRelationIds ?? [])];
  const invalidatedRelationIds = [...(input.invalidatedRelationIds ?? [])];
  const draftStatusChanged = input.beforeDraftStatus !== input.afterDraftStatus;
  if (changedLineIds.length === 0 && addedRelationIds.length === 0 && invalidatedRelationIds.length === 0 && !draftStatusChanged) {
    return null;
  }
  return {
    id: input.id ?? `DV-${input.draftId}-${input.version}`,
    draftId: input.draftId,
    version: input.version,
    triggerReason: input.triggerReason,
    materialBatchIds: [...(input.materialBatchIds ?? [])],
    changedLineIds,
    before: input.before.map((line) => ({ ...line, fields: { ...line.fields }, matchRelationIds: [...line.matchRelationIds] })),
    after: input.after.map((line) => ({ ...line, fields: { ...line.fields }, matchRelationIds: [...line.matchRelationIds] })),
    addedRelationIds,
    invalidatedRelationIds,
    actorType: input.actorType,
    createdAt: input.createdAt,
    beforeDraftStatus: input.beforeDraftStatus,
    afterDraftStatus: input.afterDraftStatus,
  };
}

export interface DraftCheckOperationInput {
  readonly draftId: DraftId;
  readonly customerId: CustomerId | null;
  readonly lineIds: readonly EntrustmentLineId[];
  readonly sourceLineIds?: readonly string[];
  readonly operationType: "增量核对" | "草稿版本变化" | "更新委托资料";
  readonly summary: string;
  readonly occurredAt: IsoDateTime;
  readonly id?: string;
}

/** 检查没有产生业务变化时，保留可追溯的操作事件但不伪造版本。 */
export function createDraftCheckOperation(input: DraftCheckOperationInput): OperationRecord {
  return {
    id: input.id ?? `OP-${input.draftId}-${input.operationType}-${input.occurredAt}`,
    operationType: input.operationType,
    actorType: "系统自动",
    customerId: input.customerId,
    draftId: input.draftId,
    affectedEntrustmentLineIds: [...input.lineIds],
    affectedInspectionSourceLineIds: [...(input.sourceLineIds ?? [])],
    summary: input.summary,
    occurredAt: input.occurredAt,
  };
}
