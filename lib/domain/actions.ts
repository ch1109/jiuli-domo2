import { mergeInspectionSourceLines } from "./inspection-merge";
import { deriveDraftStatus, deriveEntrustmentLineStatus, deriveInspectionSourceLineStatus } from "./status";
import { createFinalOutputRow } from "./final-output";
import { FINAL_OUTPUT_FIELDS } from "./types";
import type {
  ActorType,
  CustomerId,
  DraftLineSnapshot,
  DraftVersion,
  EntrustmentDraft,
  EntrustmentLine,
  FieldEvidence,
  FinalOutputField,
  InspectionMergedProduct,
  InspectionSourceFields,
  InspectionSourceLine,
  InspectionSourceLineId,
  IsoDateTime,
  LogicalInspectionOrder,
  MatchRelationId,
  OperationRecord,
  ProductMatchRelation,
  SourceLocation,
  SourceFile,
} from "./types";
import { snapshotDraftLine } from "./versioning";
import { createDraftCheckOperation, createDraftVersionIfChanged } from "./versioning";
export { completeDraft } from "./finalization";
export type { CompleteDraftInput, CompleteDraftResult } from "./finalization";

export interface InspectionBatchLineInput {
  readonly id: InspectionSourceLineId;
  readonly warehouseNo: string;
  readonly fields: InspectionSourceFields;
  readonly sourceLocation: SourceLocation;
  readonly otherFields?: Readonly<Record<string, string | null>>;
}

export interface InspectionBatchInput {
  readonly sourceFileId: string;
  readonly customerId: string | null;
  readonly createdAt: IsoDateTime;
  readonly lines: readonly InspectionBatchLineInput[];
}

export interface InspectionBatchResult {
  readonly logicalInspectionOrders: readonly LogicalInspectionOrder[];
  readonly sourceLines: readonly InspectionSourceLine[];
  readonly mergedProducts: readonly InspectionMergedProduct[];
}

export interface InspectionBatchStore {
  readonly sourceFiles: readonly SourceFile[];
  readonly logicalInspectionOrders: readonly LogicalInspectionOrder[];
  readonly sourceLines: readonly InspectionSourceLine[];
  readonly mergedProducts: readonly InspectionMergedProduct[];
}

export interface AddInspectionBatchInput {
  readonly sourceFile: SourceFile;
  readonly batch: InspectionBatchInput;
  readonly store: InspectionBatchStore;
}

export interface AddInspectionBatchResult {
  readonly store: InspectionBatchStore;
  readonly accepted: boolean;
  readonly duplicateOfFileId: string | null;
}

function duplicateSourceFile(
  sourceFile: SourceFile,
  existingFiles: readonly SourceFile[],
): SourceFile | undefined {
  return existingFiles.find(
    (existing) =>
      (sourceFile.sha256 !== null && sourceFile.sha256 === existing.sha256) ||
      (sourceFile.contentFingerprint !== null && sourceFile.contentFingerprint === existing.contentFingerprint),
  );
}

/**
 * 新增查货批次的完整入口：先去重，再生成逻辑单、原始行和合并商品并更新商品池。
 * 重复文件只保留重复来源记录，不重复增加库存事实。
 */
export function addInspectionBatch(input: AddInspectionBatchInput): AddInspectionBatchResult {
  if (input.sourceFile.materialType !== "查货") throw new Error("只有查货材料可以进入查货商品池");
  if (input.sourceFile.id !== input.batch.sourceFileId) throw new Error("文件标识与查货批次不一致");

  const duplicate = duplicateSourceFile(input.sourceFile, input.store.sourceFiles);
  if (duplicate) {
    const duplicateFile: SourceFile = {
      ...input.sourceFile,
      isDuplicate: true,
      duplicateOfFileId: duplicate.id,
    };
    return {
      accepted: false,
      duplicateOfFileId: duplicate.id,
      store: { ...input.store, sourceFiles: [...input.store.sourceFiles, duplicateFile] },
    };
  }

  const ingested = ingestInspectionBatch(input.batch);
  return {
    accepted: true,
    duplicateOfFileId: null,
    store: {
      sourceFiles: [...input.store.sourceFiles, { ...input.sourceFile, isDuplicate: false, duplicateOfFileId: null }],
      logicalInspectionOrders: [...input.store.logicalInspectionOrders, ...ingested.logicalInspectionOrders],
      sourceLines: [...input.store.sourceLines, ...ingested.sourceLines],
      mergedProducts: [...input.store.mergedProducts, ...ingested.mergedProducts],
    },
  };
}

export interface EntrustmentDraftLineInput {
  readonly id: string;
  readonly sourceOrder: number;
  readonly fields: Partial<EntrustmentLine["fields"]>;
  readonly sourceLocation?: SourceLocation | null;
}

export interface CreateEntrustmentDraftInput {
  readonly draftId: string;
  readonly displayNo: string;
  /** 模拟客户识别结果；识别失败或不唯一时传 null。 */
  readonly recognizedCustomerId: CustomerId | null;
  readonly materialFileIds: readonly string[];
  readonly lines: readonly EntrustmentDraftLineInput[];
  readonly createdAt: IsoDateTime;
}

export interface CreateEntrustmentDraftResult {
  readonly draft: EntrustmentDraft;
  readonly lines: readonly EntrustmentLine[];
  readonly matchBlocked: boolean;
  readonly matchBlockedReason: string | null;
  readonly operation: OperationRecord;
  readonly initialVersion: DraftVersion;
}

/** 新建委托草稿；客户识别失败时保留草稿，但明确阻止匹配。 */
export function createEntrustmentDraft(input: CreateEntrustmentDraftInput): CreateEntrustmentDraftResult {
  if (input.lines.length === 0) throw new Error("委托草稿至少需要一条商品行");
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length) {
    throw new Error("委托商品行标识不能重复");
  }

  const lines: EntrustmentLine[] = input.lines.map((line) => ({
    id: line.id,
    draftId: input.draftId,
    sourceOrder: line.sourceOrder,
    fields: createFinalOutputRow(line.fields),
    status: "暂无查货依据",
    matchRelationIds: [],
    evidenceIds: [],
    issueIds: [],
    updatedFieldNames: [],
    manuallyConfirmed: false,
    sourceLocation: line.sourceLocation ?? null,
  }));
  const customerResolved = input.recognizedCustomerId !== null;
  const draft: EntrustmentDraft = {
    id: input.draftId,
    displayNo: input.displayNo,
    customerId: input.recognizedCustomerId,
    customerStatus: customerResolved ? "已识别" : "待补客户信息",
    version: 0,
    status: deriveDraftStatus({
      customerId: input.recognizedCustomerId,
      lineStatuses: lines.map((line) => line.status),
      activeMatchRelationCounts: lines.map((line) => line.matchRelationIds.length),
      submittedForManualConfirmation: false,
      isFinalized: false,
    }),
    lineIds: lines.map((line) => line.id),
    materialFileIds: input.materialFileIds,
    hasAiUpdate: false,
    lastUpdateReason: "新建委托",
    isFinalized: false,
    finalReconciliationId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  const matchBlockedReason = customerResolved ? null : "未识别到客户，请补充客户名";
  const operation: OperationRecord = {
    id: `OP-${input.draftId}-create`,
    operationType: "新建委托",
    actorType: "系统自动",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: lines.map((line) => line.id),
    affectedInspectionSourceLineIds: [],
    summary: matchBlockedReason ?? `新建委托草稿 ${draft.displayNo}`,
    occurredAt: input.createdAt,
  };
  const initialVersion: DraftVersion = {
    id: `DV-${draft.id}-0`,
    draftId: draft.id,
    version: 0,
    triggerReason: "新建委托",
    materialBatchIds: [],
    changedLineIds: lines.map((line) => line.id),
    before: [],
    after: lines.map(snapshotDraftLine),
    addedRelationIds: [],
    invalidatedRelationIds: [],
    actorType: "系统自动",
    createdAt: input.createdAt,
  };
  return { draft, lines, matchBlocked: !customerResolved, matchBlockedReason, operation, initialVersion };
}

export interface ResolveDraftCustomerInput {
  readonly draft: EntrustmentDraft;
  readonly lines: readonly EntrustmentLine[];
  readonly customerId: CustomerId;
  readonly knownCustomerIds: readonly CustomerId[];
  readonly now: IsoDateTime;
}

export interface ResolveDraftCustomerResult {
  readonly draft: EntrustmentDraft;
  readonly lines: readonly EntrustmentLine[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 用户明确补充客户后才解除匹配阻断；不接受未知客户 ID。 */
export function resolveDraftCustomer(input: ResolveDraftCustomerInput): ResolveDraftCustomerResult {
  if (!input.knownCustomerIds.includes(input.customerId)) throw new Error("客户标识不存在");
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能补充客户");
  if (input.draft.customerId !== null) throw new Error("草稿客户已确定");

  const draft: EntrustmentDraft = {
    ...input.draft,
    customerId: input.customerId,
    customerStatus: "已识别",
    status: deriveDraftStatus({
      customerId: input.customerId,
      lineStatuses: input.lines.map((line) => line.status),
      activeMatchRelationCounts: input.lines.map((line) => line.matchRelationIds.length),
      submittedForManualConfirmation: input.draft.status === "人工确认中",
      isFinalized: false,
      currentStatus: input.draft.status,
    }),
    version: input.draft.version + 1,
    lastUpdateReason: "补充客户信息",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-customer`,
    operationType: "补充客户信息",
    actorType: "人工操作",
    customerId: input.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [],
    affectedInspectionSourceLineIds: [],
    summary: `补充客户信息：${input.customerId}`,
    occurredAt: input.now,
  };
  const snapshots = input.lines.map(snapshot);
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "补充客户信息",
    materialBatchIds: [],
    changedLineIds: [],
    before: snapshots,
    after: snapshots,
    addedRelationIds: [],
    invalidatedRelationIds: [],
    actorType: "人工操作",
    createdAt: input.now,
  };
  return { draft, lines: input.lines.map((line) => ({ ...line })), operation, version };
}

/**
 * 接入一份查货文件：同一文件按入仓号生成逻辑单，原始行只归属一个逻辑单，
 * 合并展示通过既有纯函数计算，不修改输入数据。
 */
export function ingestInspectionBatch(input: InspectionBatchInput): InspectionBatchResult {
  if (input.lines.length === 0) throw new Error("查货批次至少需要一条原始商品行");
  if (input.lines.some((line) => line.sourceLocation.fileId !== input.sourceFileId)) {
    throw new Error("查货原始行必须属于本次上传文件");
  }
  if (input.lines.some((line) => line.warehouseNo.trim() === "")) {
    throw new Error("每条查货原始行必须有入仓号");
  }
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length) {
    throw new Error("查货原始行标识不能重复");
  }

  const warehouseIds = new Set<string>();
  const linesByWarehouse = new Map<string, InspectionBatchLineInput[]>();
  for (const line of input.lines) {
    const warehouseNo = line.warehouseNo.trim();
    const existing = linesByWarehouse.get(warehouseNo);
    if (existing) existing.push(line);
    else linesByWarehouse.set(warehouseNo, [line]);
    warehouseIds.add(warehouseNo);
  }

  const logicalInspectionOrders: LogicalInspectionOrder[] = [];
  const sourceLines: InspectionSourceLine[] = [];
  const mergedProducts: InspectionMergedProduct[] = [];

  for (const [warehouseNo, warehouseLines] of linesByWarehouse) {
    const logicalInspectionOrderId = `${input.sourceFileId}::${warehouseNo}`;
    const orderSourceLines = warehouseLines.map((line) => line.id);
    const pages = warehouseLines
      .map((line) => line.sourceLocation.page)
      .filter((page): page is number => page !== null);
    const logicalOrder: LogicalInspectionOrder = {
      id: logicalInspectionOrderId,
      customerId: input.customerId,
      sourceFileId: input.sourceFileId,
      warehouseNo,
      sourcePageRange: pages.length > 0 ? { start: Math.min(...pages), end: Math.max(...pages) } : null,
      sourceLineIds: orderSourceLines,
      createdAt: input.createdAt,
    };
    logicalInspectionOrders.push(logicalOrder);

    const createdLines = warehouseLines.map((line, index) => ({
      id: line.id,
      customerId: input.customerId,
      logicalInspectionOrderId,
      sourceFileId: input.sourceFileId,
      sourceLocation: line.sourceLocation,
      fields: line.fields,
      otherFields: line.otherFields ?? {},
      status: "可匹配" as const,
      occupiedDraftId: null,
      occupiedEntrustmentLineId: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      sourceOrder: index + 1,
    }));
    sourceLines.push(...createdLines);
    mergedProducts.push(...mergeInspectionSourceLines(createdLines, { now: input.createdAt }));
  }

  if (logicalInspectionOrders.length !== warehouseIds.size) {
    throw new Error("入仓号逻辑单创建数量不一致");
  }

  return { logicalInspectionOrders, sourceLines, mergedProducts };
}

function normalizeModel(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/\u3000/g, " ").replace(/\s+/g, "").toUpperCase();
  return normalized === "" || normalized === "UNKNOWN" ? null : normalized;
}

function modelsExactlyMatch(left: string | null, right: string | null): boolean {
  const leftValue = normalizeModel(left);
  const rightValue = normalizeModel(right);
  return leftValue !== null && leftValue === rightValue;
}

function matchesExplicitModelEvidence(orderModel: string | null, sourceLine: InspectionSourceLine): boolean {
  return modelsExactlyMatch(orderModel, sourceLine.fields.型号);
}

function normalizeDecimal(value: string | null): string | null {
  if (value === null) return null;
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const sign = match[1] === "-" && (integer !== "0" || fraction !== "") ? "-" : "";
  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}

function fieldValuesEquivalent(field: FinalOutputField, currentValue: string | null, candidateValue: string | null, sourceLine: InspectionSourceLine): boolean {
  if (currentValue === candidateValue) return true;
  if (field === "型号") return modelsExactlyMatch(currentValue, sourceLine.fields.型号);
  if (field === "产地") return currentValue === sourceLine.otherFields["标准产地"];
  if (["数量", "件数", "净重", "毛重"].includes(field)) {
    const currentDecimal = normalizeDecimal(currentValue);
    return currentDecimal !== null && currentDecimal === normalizeDecimal(candidateValue);
  }
  return false;
}

/** 候选搜索的第一层硬过滤：稳定客户 ID、未核销、未被活跃草稿占用。 */
export function findInspectionCandidates(
  entrustmentLine: Pick<EntrustmentLine, "fields"> & { readonly customerId: CustomerId | null },
  sourceLines: readonly InspectionSourceLine[],
): readonly InspectionSourceLine[] {
  const model = normalizeModel(entrustmentLine.fields.型号);
  if (entrustmentLine.customerId === null || model === null) return [];

  return sourceLines.filter(
    (sourceLine) =>
      sourceLine.customerId === entrustmentLine.customerId &&
      sourceLine.status === "可匹配" &&
      sourceLine.occupiedDraftId === null &&
      matchesExplicitModelEvidence(model, sourceLine),
  );
}

export interface EstablishAiMatchInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly candidateSourceLineId: InspectionSourceLineId;
  readonly now: IsoDateTime;
  readonly createRelationId?: (line: EntrustmentLine) => MatchRelationId;
  readonly createOperationId?: (line: EntrustmentLine) => string;
  readonly createVersionId?: (draft: EntrustmentDraft) => string;
}

export interface EstablishAiMatchResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relation: ProductMatchRelation;
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
  readonly evidence: readonly FieldEvidence[];
}

function snapshot(line: EntrustmentLine): DraftLineSnapshot {
  return {
    ...(line.lockedFields?.length ? {lockedFields:[...line.lockedFields]} : {}),
    entrustmentLineId: line.id,
    fields: line.fields,
    status: line.status,
    matchRelationIds: line.matchRelationIds,
  };
}

const MATCHED_FIELD_MAP = [
  ["品牌", "品牌"],
  ["型号", "型号"],
  ["产地", "产地"],
  ["单位", "单位"],
  ["数量", "数量"],
  ["件数", "件数"],
  ["净重", "净重"],
  ["毛重", "毛重"],
] as const satisfies readonly (readonly [FinalOutputField, keyof InspectionSourceFields])[];

function isKnownValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "" && value !== "UNKNOWN";
}

function applyInspectionEvidence(
  line: EntrustmentLine,
  sourceLine: InspectionSourceLine,
  draftId: string,
): { readonly line: EntrustmentLine; readonly evidence: readonly FieldEvidence[] } {
  const fields = { ...line.fields };
  const updatedFieldNames: FinalOutputField[] = [];
  const issueIds = [...line.issueIds];
  const evidenceIds = [...line.evidenceIds];
  const evidence: FieldEvidence[] = [];

  for (const [field, sourceField] of MATCHED_FIELD_MAP) {
    const originalValue = line.fields[field];
    const candidateValue = sourceLine.fields[sourceField];
    const candidateValues = [candidateValue];
    const hasConflict = (isKnownValue(originalValue) || !!line.lockedFields?.includes(field)) && isKnownValue(candidateValue) && !fieldValuesEquivalent(field, originalValue, candidateValue, sourceLine);
    const canUpdate = !line.lockedFields?.includes(field) && !isKnownValue(originalValue) && isKnownValue(candidateValue);
    const currentValue = canUpdate ? candidateValue : originalValue;
    if (canUpdate) {
      fields[field] = candidateValue;
      updatedFieldNames.push(field);
    }
    if (hasConflict) issueIds.push(`字段冲突:${field}`);

    const evidenceId = `FE-${draftId}-${line.id}-${sourceLine.id}-${field}`;
    evidenceIds.push(evidenceId);
    evidence.push({
      id: evidenceId,
      draftId,
      entrustmentLineId: line.id,
      field,
      currentValue,
      originalValue,
      sourceMaterialType: "查货",
      sourceFileId: sourceLine.sourceFileId,
      sourceLocation: sourceLine.sourceLocation,
      sourceInspectionLineId: sourceLine.id,
      isAiUpdated: canUpdate,
      isManuallyEdited: false,
      hadConflict: hasConflict,
      candidateValues,
    });
  }

  const warehouseNo = sourceLine.otherFields["入仓号"];
  if(line.lockedFields?.includes('入仓号') && isKnownValue(warehouseNo) && line.fields.入仓号!==warehouseNo) issueIds.push('字段冲突:入仓号');
  if (!line.lockedFields?.includes("入仓号") && !isKnownValue(line.fields["入仓号"]) && isKnownValue(warehouseNo)) {
    const field: FinalOutputField = "入仓号";
    const evidenceId = `FE-${draftId}-${line.id}-${sourceLine.id}-${field}`;
    fields[field] = warehouseNo;
    updatedFieldNames.push(field);
    evidenceIds.push(evidenceId);
    evidence.push({
      id: evidenceId,
      draftId,
      entrustmentLineId: line.id,
      field,
      currentValue: warehouseNo,
      originalValue: line.fields[field],
      sourceMaterialType: "查货",
      sourceFileId: sourceLine.sourceFileId,
      sourceLocation: sourceLine.sourceLocation,
      sourceInspectionLineId: sourceLine.id,
      isAiUpdated: true,
      isManuallyEdited: false,
      hadConflict: false,
      candidateValues: [warehouseNo],
    });
  }

  return {
    line: {
      ...line,
      fields,
      status: deriveEntrustmentLineStatus({
        activeMatchRelationCount: line.matchRelationIds.length,
        hasBlockingIssue: issueIds.length > 0,
        awaitingCandidateSelection: false,
        manuallyConfirmed: line.manuallyConfirmed,
      }),
      evidenceIds,
      issueIds: [...new Set(issueIds)],
      updatedFieldNames: [...new Set([...line.updatedFieldNames, ...updatedFieldNames])],
    },
    evidence,
  };
}

/**
 * 建立唯一 AI 匹配的原子动作：关系、查货占用、委托行/草稿状态、版本和操作记录
 * 一起返回；所有输入保持不变。
 */
export function establishAiMatch(input: EstablishAiMatchInput): EstablishAiMatchResult {
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止建立匹配");
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能建立匹配");

  const entrustmentLines = input.entrustmentLines.map((line) => ({ ...line }));

  const targetLineIndex = entrustmentLines.findIndex((line) =>
    findInspectionCandidates(
      { fields: line.fields, customerId: input.draft.customerId },
      input.inspectionSourceLines,
    ).some(
      (sourceLine) => sourceLine.id === input.candidateSourceLineId,
    ),
  );
  if (targetLineIndex < 0) throw new Error("指定查货商品不是该委托行的可靠候选");
  const targetLine = entrustmentLines[targetLineIndex];
  const sourceLineIndex = input.inspectionSourceLines.findIndex(
    (sourceLine) => sourceLine.id === input.candidateSourceLineId,
  );
  if (sourceLineIndex < 0) throw new Error("查货原始商品不存在");
  const sourceLine = input.inspectionSourceLines[sourceLineIndex];
  const candidates = findInspectionCandidates(
    { fields: targetLine.fields, customerId: input.draft.customerId },
    input.inspectionSourceLines,
  );
  if (candidates.length !== 1 || candidates[0].id !== sourceLine.id) {
    throw new Error("只有唯一可靠候选才能自动建立匹配");
  }
  if (sourceLine.customerId !== input.draft.customerId) {
    throw new Error("客户不一致，禁止建立匹配");
  }

  const relationId = input.createRelationId?.(targetLine) ?? `MR-${input.draft.id}-${targetLine.id}-${sourceLine.id}`;
  const relation: ProductMatchRelation = {
    id: relationId,
    draftId: input.draft.id,
    entrustmentLineId: targetLine.id,
    logicalInspectionOrderId: sourceLine.logicalInspectionOrderId,
    inspectionMergedProductId: null,
    inspectionSourceLineIds: [sourceLine.id],
    establishedBy: "AI",
    active: true,
    createdAt: input.now,
    invalidatedAt: null,
    invalidationReason: null,
    evidenceSummary: `型号匹配：${targetLine.fields.型号 ?? ""}`,
  };

  const evidenced = applyInspectionEvidence(targetLine, sourceLine, input.draft.id);
  const updatedLine: EntrustmentLine = {
    ...evidenced.line,
    status: deriveEntrustmentLineStatus({
      activeMatchRelationCount: targetLine.matchRelationIds.length + 1,
      hasBlockingIssue: evidenced.line.issueIds.length > 0,
      awaitingCandidateSelection: false,
      manuallyConfirmed: targetLine.manuallyConfirmed,
    }),
    matchRelationIds: [...targetLine.matchRelationIds, relation.id],
  };
  entrustmentLines[targetLineIndex] = updatedLine;

  const inspectionSourceLines = input.inspectionSourceLines.map((line, index) =>
    index === sourceLineIndex
      ? {
          ...line,
          status: deriveInspectionSourceLineStatus({ hasActiveDraftOccupation: true, isWrittenOff: false }),
          occupiedDraftId: input.draft.id,
          occupiedEntrustmentLineId: targetLine.id,
          updatedAt: input.now,
        }
      : { ...line },
  );

  const status = deriveDraftStatus({
    customerId: input.draft.customerId,
    lineStatuses: entrustmentLines.map((line) => line.status),
    activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
    submittedForManualConfirmation: input.draft.status === "人工确认中",
    isFinalized: false,
    currentStatus: input.draft.status,
  });
  const draft: EntrustmentDraft = {
    ...input.draft,
    status,
    version: input.draft.version + 1,
    hasAiUpdate: true,
    lastUpdateReason: "AI 首次匹配",
    updatedAt: input.now,
  };
  const actorType: ActorType = "系统自动";
  const operation: OperationRecord = {
    id: input.createOperationId?.(targetLine) ?? `OP-${draft.id}-${draft.version}`,
    operationType: "AI 首次匹配",
    actorType,
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [targetLine.id],
    affectedInspectionSourceLineIds: [sourceLine.id],
    summary: `为 ${targetLine.id} 建立唯一 AI 匹配并占用 ${sourceLine.id}`,
    occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: input.createVersionId?.(input.draft) ?? `DV-${draft.id}-${draft.version}`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "AI 首次匹配",
    materialBatchIds: [],
    changedLineIds: [targetLine.id],
    before: [snapshot(targetLine)],
    after: [snapshot(updatedLine)],
    addedRelationIds: [relation.id],
    invalidatedRelationIds: [],
    actorType,
    createdAt: input.now,
  };

  return { draft, entrustmentLines, inspectionSourceLines, relation, operation, version, evidence: evidenced.evidence };
}

export interface SelectMatchCandidateInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly entrustmentLineId: string;
  readonly candidateSourceLineId: InspectionSourceLineId;
  readonly now: IsoDateTime;
}

export interface SelectMatchCandidateResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relation: ProductMatchRelation;
  readonly evidence: readonly FieldEvidence[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 人工从多候选中选择一条；只有被选中的原始行会被占用。 */
export function selectMatchCandidate(input: SelectMatchCandidateInput): SelectMatchCandidateResult {
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止选择候选");
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能选择候选");
  const lineIndex = input.entrustmentLines.findIndex((line) => line.id === input.entrustmentLineId);
  if (lineIndex < 0) throw new Error("委托商品行不存在");
  const sourceIndex = input.inspectionSourceLines.findIndex((line) => line.id === input.candidateSourceLineId);
  if (sourceIndex < 0) throw new Error("查货商品不存在");
  const sourceLine = input.inspectionSourceLines[sourceIndex];
  if (sourceLine.customerId !== input.draft.customerId) throw new Error("客户不一致，禁止选择候选");
  if (sourceLine.status !== "可匹配" || sourceLine.occupiedDraftId !== null) throw new Error("候选已不可匹配");
  const targetLine = input.entrustmentLines[lineIndex];
  if (targetLine.matchRelationIds.length) throw new Error("该委托行已有依据，请先解绑或使用改配");

  const relation: ProductMatchRelation = {
    id: `MR-${input.draft.id}-${targetLine.id}-${sourceLine.id}`,
    draftId: input.draft.id,
    entrustmentLineId: targetLine.id,
    logicalInspectionOrderId: sourceLine.logicalInspectionOrderId,
    inspectionMergedProductId: null,
    inspectionSourceLineIds: [sourceLine.id],
    establishedBy: "人工",
    active: true,
    createdAt: input.now,
    invalidatedAt: null,
    invalidationReason: null,
    evidenceSummary: `人工选择候选：${sourceLine.id}`,
  };
  const evidenced = applyInspectionEvidence(targetLine, sourceLine, input.draft.id);
  const updatedLine: EntrustmentLine = {
    ...evidenced.line,
    manuallyConfirmed: false,
    issueIds: evidenced.line.issueIds.filter((issue) => issue !== "多候选"),
    matchRelationIds: [...targetLine.matchRelationIds, relation.id],
    status: deriveEntrustmentLineStatus({
      activeMatchRelationCount: targetLine.matchRelationIds.length + 1,
      hasBlockingIssue: evidenced.line.issueIds.some((issue) => issue !== "多候选"),
      awaitingCandidateSelection: false,
      manuallyConfirmed: false,
    }),
  };
  const entrustmentLines = input.entrustmentLines.map((line, index) => (index === lineIndex ? updatedLine : { ...line }));
  const inspectionSourceLines = input.inspectionSourceLines.map((line, index) =>
    index === sourceIndex
      ? {
          ...line,
          status: deriveInspectionSourceLineStatus({ hasActiveDraftOccupation: true, isWrittenOff: false }),
          occupiedDraftId: input.draft.id,
          occupiedEntrustmentLineId: targetLine.id,
          updatedAt: input.now,
        }
      : { ...line },
  );
  const draft: EntrustmentDraft = {
    ...input.draft,
    version: input.draft.version + 1,
    status: deriveDraftStatus({
      customerId: input.draft.customerId,
      lineStatuses: entrustmentLines.map((line) => line.status),
      activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
      submittedForManualConfirmation: input.draft.status === "人工确认中",
      isFinalized: false,
      currentStatus: input.draft.status,
    }),
    hasAiUpdate: false,
    lastUpdateReason: "选择候选",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-candidate`,
    operationType: "选择候选",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [targetLine.id],
    affectedInspectionSourceLineIds: [sourceLine.id],
    summary: `人工选择 ${sourceLine.id} 作为 ${targetLine.id} 的查货依据`,
    occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}-candidate`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "选择候选",
    materialBatchIds: [],
    changedLineIds: [targetLine.id],
    before: [snapshot(targetLine)],
    after: [snapshot(updatedLine)],
    addedRelationIds: [relation.id],
    invalidatedRelationIds: [],
    actorType: "人工操作",
    createdAt: input.now,
  };
  return { draft, entrustmentLines, inspectionSourceLines, relation, evidence: evidenced.evidence, operation, version };
}

export interface EditDraftFieldInput {
  readonly review?: FieldEvidence["review"];
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly entrustmentLineId: string;
  readonly field: FinalOutputField;
  readonly value: string | null;
  readonly sourceFileId: string;
  readonly sourceLocation: SourceLocation;
  readonly now: IsoDateTime;
  /** 值不变时，允许人工确认保留委托值并关闭对应字段冲突。 */
  readonly resolveConflict?: boolean;
}

export interface EditDraftFieldResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly evidence: FieldEvidence;
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 人工编辑字段：保留旧值和编辑证据，并清理已由编辑解决的字段冲突。 */
export function editDraftField(input: EditDraftFieldInput): EditDraftFieldResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能编辑字段");
  const lineIndex = input.entrustmentLines.findIndex((line) => line.id === input.entrustmentLineId);
  if (lineIndex < 0) throw new Error("委托商品行不存在");
  const beforeLine = input.entrustmentLines[lineIndex];
  const originalValue = beforeLine.fields[input.field];
  if ((input.field === "型号" || input.field === "品牌") && originalValue !== input.value && beforeLine.matchRelationIds.length) {
    throw new Error("修改型号或品牌前请先解绑查货依据，修改后重新选择或匹配");
  }
  const conflictId = `字段冲突:${input.field}`;
  if (originalValue === input.value && !input.review && !(input.resolveConflict && beforeLine.issueIds.includes(conflictId))) {
    throw new Error("字段值未发生变化");
  }
  const fields = { ...beforeLine.fields, [input.field]: input.value };
  if (input.review && beforeLine.issueIds.includes(conflictId) && !input.review.reason.trim()) throw new Error("处理冲突时请填写原因");
  const issueIds = beforeLine.issueIds.filter((issue) => issue !== conflictId && !(isKnownValue(input.value) && issue === `必填缺失:${input.field}`));
  const evidenceId = `FE-${input.draft.id}-${beforeLine.id}-${input.field}-manual-${input.draft.version + 1}`;
  const evidence: FieldEvidence = {
    review: input.review,
    id: evidenceId,
    draftId: input.draft.id,
    entrustmentLineId: beforeLine.id,
    field: input.field,
    currentValue: input.value,
    originalValue,
    sourceMaterialType: "委托书",
    sourceFileId: input.sourceFileId,
    sourceLocation: input.sourceLocation,
    sourceInspectionLineId: null,
    isAiUpdated: false,
    isManuallyEdited: true,
    hadConflict: beforeLine.issueIds.includes(`字段冲突:${input.field}`),
    candidateValues: [originalValue, input.value],
  };
  const updatedLine: EntrustmentLine = {
    ...beforeLine,
    lockedFields: input.review ? [...new Set([...(beforeLine.lockedFields ?? []).filter(field => field !== input.field), ...(input.review.locked ? [input.field] : [])])] : beforeLine.lockedFields,
    fields,
    manuallyConfirmed: false,
    issueIds,
    evidenceIds: [...beforeLine.evidenceIds, evidenceId],
    updatedFieldNames: [...new Set([...beforeLine.updatedFieldNames, input.field])],
    status: deriveEntrustmentLineStatus({
      activeMatchRelationCount: beforeLine.matchRelationIds.length,
      hasBlockingIssue: issueIds.length > 0,
      awaitingCandidateSelection: issueIds.includes("多候选"),
      manuallyConfirmed: false,
    }),
  };
  const entrustmentLines = input.entrustmentLines.map((line, index) => (index === lineIndex ? updatedLine : { ...line }));
  const draft: EntrustmentDraft = {
    ...input.draft,
    version: input.draft.version + 1,
    status: deriveDraftStatus({
      customerId: input.draft.customerId,
      lineStatuses: entrustmentLines.map((line) => line.status),
      activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
      submittedForManualConfirmation: input.draft.status === "人工确认中",
      isFinalized: false,
      currentStatus: input.draft.status,
    }),
    lastUpdateReason: "人工编辑字段",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-field`,
    operationType: "人工编辑字段",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [beforeLine.id],
    affectedInspectionSourceLineIds: [],
    summary: `人工处理 ${beforeLine.id} 的 ${input.field}${input.review ? ` · ${input.review.actor} · ${input.review.reason || "确认当前值"}` : ""}`,
    occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}-field`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "人工编辑字段",
    materialBatchIds: [],
    changedLineIds: [beforeLine.id],
    before: [snapshot(beforeLine)],
    after: [snapshot(updatedLine)],
    addedRelationIds: [],
    invalidatedRelationIds: [],
    actorType: "人工操作",
    createdAt: input.now,
  };
  return { draft, entrustmentLines, evidence, operation, version };
}

export interface UnbindMatchInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relation: ProductMatchRelation;
  readonly now: IsoDateTime;
  readonly invalidationReason?: string;
}

export interface UnbindMatchResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relation: ProductMatchRelation;
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

function releaseRelationSourceLines(
  sourceLines: readonly InspectionSourceLine[],
  relation: ProductMatchRelation,
  draftId: string,
  now: IsoDateTime,
): InspectionSourceLine[] {
  const sourceLineIds = new Set(relation.inspectionSourceLineIds);
  return sourceLines.map((line) => {
    if (!sourceLineIds.has(line.id)) return { ...line };
    if (line.status === "已核销") throw new Error("已核销查货商品不能通过解绑恢复");
    if (line.occupiedDraftId !== draftId) throw new Error("查货商品占用关系不一致");
    return {
      ...line,
      status: deriveInspectionSourceLineStatus({ hasActiveDraftOccupation: false, isWrittenOff: false }),
      occupiedDraftId: null,
      occupiedEntrustmentLineId: null,
      updatedAt: now,
    };
  });
}

/** 解绑动作同时失效历史关系、释放原始查货行并重算草稿状态。 */
export function unbindMatch(input: UnbindMatchInput): UnbindMatchResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能解除匹配");
  if (!input.relation.active) throw new Error("匹配关系已经失效");
  if (input.relation.draftId !== input.draft.id) throw new Error("匹配关系不属于当前草稿");
  const lineIndex = input.entrustmentLines.findIndex((line) => line.id === input.relation.entrustmentLineId);
  if (lineIndex < 0) throw new Error("委托商品行不存在");

  const beforeLine = input.entrustmentLines[lineIndex];
  const invalidatedRelation: ProductMatchRelation = {
    ...input.relation,
    active: false,
    invalidatedAt: input.now,
    invalidationReason: input.invalidationReason ?? "人工解绑",
  };
  const entrustmentLines = input.entrustmentLines.map((line, index) =>
    index === lineIndex
      ? {
          ...line,
          manuallyConfirmed: false,
          matchRelationIds: line.matchRelationIds.filter((id) => id !== input.relation.id),
          status: deriveEntrustmentLineStatus({
            activeMatchRelationCount: line.matchRelationIds.filter(id => id !== input.relation.id).length,
            hasBlockingIssue: line.issueIds.length > 0,
            awaitingCandidateSelection: false,
            manuallyConfirmed: false,
          }),
        }
      : { ...line },
  );
  const inspectionSourceLines = releaseRelationSourceLines(
    input.inspectionSourceLines,
    input.relation,
    input.draft.id,
    input.now,
  );
  const draft: EntrustmentDraft = {
    ...input.draft,
    version: input.draft.version + 1,
    status: deriveDraftStatus({
      customerId: input.draft.customerId,
      lineStatuses: entrustmentLines.map((line) => line.status),
      activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
      submittedForManualConfirmation: input.draft.status === "人工确认中" && entrustmentLines.every(line => line.matchRelationIds.length > 0),
      isFinalized: false,
      currentStatus: input.draft.status,
    }),
    lastUpdateReason: "解除匹配",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-unbind`,
    operationType: "解除匹配",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [beforeLine.id],
    affectedInspectionSourceLineIds: input.relation.inspectionSourceLineIds,
    summary: `解除 ${beforeLine.id} 与 ${input.relation.id} 的匹配`,
    occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}-unbind`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "解除匹配",
    materialBatchIds: [],
    changedLineIds: [beforeLine.id],
    before: [snapshot(beforeLine)],
    after: [snapshot(entrustmentLines[lineIndex])],
    addedRelationIds: [],
    invalidatedRelationIds: [input.relation.id],
    actorType: "人工操作",
    createdAt: input.now,
  };
  return { draft, entrustmentLines, inspectionSourceLines, relation: invalidatedRelation, operation, version };
}

export interface ReassignMatchInput extends UnbindMatchInput {
  readonly newInspectionSourceLineId: InspectionSourceLineId;
}

export interface ReassignMatchResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly oldRelation: ProductMatchRelation;
  readonly newRelation: ProductMatchRelation;
  readonly evidence: readonly FieldEvidence[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 改配是一个原子动作：旧关系失效/释放与新关系建立/占用同时完成。 */
export function reassignMatch(input: ReassignMatchInput): ReassignMatchResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能改配");
  if (!input.relation.active) throw new Error("匹配关系已经失效");
  if (input.relation.draftId !== input.draft.id) throw new Error("匹配关系不属于当前草稿");
  const lineIndex = input.entrustmentLines.findIndex((line) => line.id === input.relation.entrustmentLineId);
  if (lineIndex < 0) throw new Error("委托商品行不存在");
  const newSourceIndex = input.inspectionSourceLines.findIndex((line) => line.id === input.newInspectionSourceLineId);
  if (newSourceIndex < 0) throw new Error("新查货商品不存在");
  const newSource = input.inspectionSourceLines[newSourceIndex];
  if (newSource.customerId !== input.draft.customerId) throw new Error("客户不一致，禁止改配");
  if (newSource.status !== "可匹配" || newSource.occupiedDraftId !== null) throw new Error("新查货商品不可匹配");
  if (input.relation.inspectionSourceLineIds.includes(newSource.id)) throw new Error("新旧查货商品不能相同");

  const beforeLine = input.entrustmentLines[lineIndex];
  const oldRelation: ProductMatchRelation = {
    ...input.relation,
    active: false,
    invalidatedAt: input.now,
    invalidationReason: "人工改配",
  };
  const released = releaseRelationSourceLines(input.inspectionSourceLines, input.relation, input.draft.id, input.now);
  const evidenced = applyInspectionEvidence(beforeLine, newSource, input.draft.id);
  const newRelation: ProductMatchRelation = {
    id: `MR-${input.draft.id}-${beforeLine.id}-${newSource.id}`,
    draftId: input.draft.id,
    entrustmentLineId: beforeLine.id,
    logicalInspectionOrderId: newSource.logicalInspectionOrderId,
    inspectionMergedProductId: null,
    inspectionSourceLineIds: [newSource.id],
    establishedBy: "人工",
    active: true,
    createdAt: input.now,
    invalidatedAt: null,
    invalidationReason: null,
    evidenceSummary: `人工改配至 ${newSource.id}`,
  };
  const updatedLine: EntrustmentLine = {
    ...evidenced.line,
    manuallyConfirmed: false,
    matchRelationIds: [
      ...beforeLine.matchRelationIds.filter((id) => id !== input.relation.id),
      newRelation.id,
    ],
    status: deriveEntrustmentLineStatus({
      activeMatchRelationCount: 1,
      hasBlockingIssue: evidenced.line.issueIds.length > 0,
      awaitingCandidateSelection: false,
      manuallyConfirmed: false,
    }),
  };
  const inspectionSourceLines = released.map((line, index) =>
    index === newSourceIndex
      ? {
          ...line,
          status: deriveInspectionSourceLineStatus({ hasActiveDraftOccupation: true, isWrittenOff: false }),
          occupiedDraftId: input.draft.id,
          occupiedEntrustmentLineId: beforeLine.id,
          updatedAt: input.now,
        }
      : line,
  );
  const draft: EntrustmentDraft = {
    ...input.draft,
    version: input.draft.version + 1,
    status: deriveDraftStatus({
      customerId: input.draft.customerId,
      lineStatuses: input.entrustmentLines.map((line, index) => (index === lineIndex ? updatedLine.status : line.status)),
      activeMatchRelationCounts: input.entrustmentLines.map((line, index) => index === lineIndex ? updatedLine.matchRelationIds.length : line.matchRelationIds.length),
      submittedForManualConfirmation: input.draft.status === "人工确认中",
      isFinalized: false,
      currentStatus: input.draft.status,
    }),
    hasAiUpdate: false,
    lastUpdateReason: "人工改配",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-reassign`,
    operationType: "人工改配",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [beforeLine.id],
    affectedInspectionSourceLineIds: [...input.relation.inspectionSourceLineIds, newSource.id],
    summary: `人工改配 ${beforeLine.id}：${input.relation.id} → ${newRelation.id}`,
    occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}-reassign`,
    draftId: draft.id,
    version: draft.version,
    triggerReason: "人工改配",
    materialBatchIds: [],
    changedLineIds: [beforeLine.id],
    before: [snapshot(beforeLine)],
    after: [snapshot(updatedLine)],
    addedRelationIds: [newRelation.id],
    invalidatedRelationIds: [input.relation.id],
    actorType: "人工操作",
    createdAt: input.now,
  };
  return { draft, entrustmentLines: input.entrustmentLines.map((line, index) => index === lineIndex ? updatedLine : { ...line }), inspectionSourceLines, oldRelation, newRelation, evidence: evidenced.evidence, operation, version };
}

export interface ExecuteInitialMatchingInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly now: IsoDateTime;
}

export interface ExecuteInitialMatchingResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly candidatesByLineId: Readonly<Record<string, readonly InspectionSourceLine[]>>;
  readonly relations: readonly ProductMatchRelation[];
  readonly evidence: readonly FieldEvidence[];
  readonly operations: readonly OperationRecord[];
  readonly versions: readonly DraftVersion[];
}

/** 执行整单首次匹配：唯一候选自动建立，多候选只标记待人工，不占用任何候选。 */
export function executeInitialMatching(input: ExecuteInitialMatchingInput): ExecuteInitialMatchingResult {
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止执行首次匹配");
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能执行首次匹配");

  const beforeLines = input.entrustmentLines.map((line) => ({ ...line }));
  let draft = input.draft;
  let entrustmentLines: EntrustmentLine[] = input.entrustmentLines.map((line) => ({ ...line }));
  let inspectionSourceLines: InspectionSourceLine[] = input.inspectionSourceLines.map((line) => ({ ...line }));
  const candidatesByLineId: Record<string, readonly InspectionSourceLine[]> = {};
  const relations: ProductMatchRelation[] = [];
  const evidence: FieldEvidence[] = [];
  const operations: OperationRecord[] = [];
  const versions: DraftVersion[] = [];

  for (const line of [...entrustmentLines]) {
    if (line.matchRelationIds.length > 0) continue;
    const candidates = findInspectionCandidates({ fields: line.fields, customerId: draft.customerId }, inspectionSourceLines);
    candidatesByLineId[line.id] = candidates;
    const lineIndex = entrustmentLines.findIndex((candidate) => candidate.id === line.id);
    if (lineIndex < 0) continue;

    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      entrustmentLines[lineIndex] = {
        ...entrustmentLines[lineIndex],
        status: "待人工处理",
        issueIds: [...new Set([...entrustmentLines[lineIndex].issueIds, "多候选"])],
      };
      continue;
    }

    const matched = establishAiMatch({
      draft,
      entrustmentLines,
      inspectionSourceLines,
      candidateSourceLineId: candidates[0].id,
      now: input.now,
    });
    draft = matched.draft;
    entrustmentLines = matched.entrustmentLines.map((line) => ({ ...line }));
    inspectionSourceLines = matched.inspectionSourceLines.map((line) => ({ ...line }));
    relations.push(matched.relation);
    evidence.push(...matched.evidence);
    operations.push(matched.operation);
    versions.push(matched.version);
  }

  const changedMultiCandidateLines = entrustmentLines.filter((line) => {
    const before = beforeLines.find((candidate) => candidate.id === line.id);
    return line.issueIds.includes("多候选") && !before?.issueIds.includes("多候选");
  });
  if (changedMultiCandidateLines.length > 0) {
    const versionNumber = draft.version + 1;
    draft = {
      ...draft,
      version: versionNumber,
      hasAiUpdate: true,
      lastUpdateReason: "AI 首次匹配",
      status: deriveDraftStatus({
        customerId: draft.customerId,
        lineStatuses: entrustmentLines.map((line) => line.status),
        activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
        submittedForManualConfirmation: draft.status === "人工确认中",
        isFinalized: false,
        currentStatus: draft.status,
      }),
      updatedAt: input.now,
    };
    const operation: OperationRecord = {
      id: `OP-${draft.id}-${versionNumber}-candidates`,
      operationType: "AI 首次匹配",
      actorType: "系统自动",
      customerId: draft.customerId,
      draftId: draft.id,
      affectedEntrustmentLineIds: changedMultiCandidateLines.map((line) => line.id),
      affectedInspectionSourceLineIds: [],
      summary: "发现多个候选，等待人工选择",
      occurredAt: input.now,
    };
    operations.push(operation);
    versions.push({
      id: `DV-${draft.id}-${versionNumber}-candidates`,
      draftId: draft.id,
      version: versionNumber,
      triggerReason: "AI 首次匹配",
      materialBatchIds: [],
      changedLineIds: changedMultiCandidateLines.map((line) => line.id),
      before: changedMultiCandidateLines.map((line) => snapshot(beforeLines.find((candidate) => candidate.id === line.id) ?? line)),
      after: changedMultiCandidateLines.map(snapshot),
      addedRelationIds: [],
      invalidatedRelationIds: [],
      actorType: "系统自动",
      createdAt: input.now,
    });
  }

  return { draft, entrustmentLines, inspectionSourceLines, candidatesByLineId, relations, evidence, operations, versions };
}

export interface IncrementalInspectionReconciliationInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  /** 增量前已存在的查货行。新增材料只会触发与 addedSourceLineIds 相关的行检查。 */
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly addedSourceLineIds: readonly InspectionSourceLineId[];
  readonly materialBatchId?: string;
  readonly now: IsoDateTime;
}

export interface IncrementalInspectionReconciliationResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relations: readonly ProductMatchRelation[];
  readonly evidence: readonly FieldEvidence[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion | null;
  readonly affectedLineIds: readonly string[];
}

/**
 * 后补查货只检查可能被新增原始行影响的未稳定委托行；稳定关系和无关客户完全继承。
 * 结果无变化时保留检查事件，不提升草稿版本。
 */
export function reconcileDraftWithInspectionIncrement(
  input: IncrementalInspectionReconciliationInput,
): IncrementalInspectionReconciliationResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") {
    return {
      draft: { ...input.draft },
      entrustmentLines: input.entrustmentLines.map((line) => ({ ...line })),
      inspectionSourceLines: input.inspectionSourceLines.map((line) => ({ ...line })),
      relations: [],
      evidence: [],
      operation: createDraftCheckOperation({
        draftId: input.draft.id,
        customerId: input.draft.customerId,
        lineIds: [],
        sourceLineIds: input.addedSourceLineIds,
        operationType: "增量核对",
        summary: "草稿已完成，忽略本次增量核对",
        occurredAt: input.now,
        id: `OP-${input.draft.id}-incremental-finalized-${input.now}`,
      }),
      version: null,
      affectedLineIds: [],
    };
  }
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止执行增量核对");

  const addedIds = new Set(input.addedSourceLineIds);
  const addedLines = input.inspectionSourceLines.filter((line) => addedIds.has(line.id));
  const affectedLines = input.entrustmentLines.filter((line) => line.status !== "人工已确认");
  const potentiallyAffected = affectedLines.filter((line) =>
    addedLines.some((source) => {
      const candidates = findInspectionCandidates({ fields: line.fields, customerId: input.draft.customerId }, [source]);
      if (candidates.length > 0) return true;
      if (line.matchRelationIds.length === 0) return false;
      return source.customerId === input.draft.customerId && matchesExplicitModelEvidence(line.fields.型号, source);
    }),
  );
  const beforeLines = input.entrustmentLines.map((line) => ({ ...line }));
  let draft = input.draft;
  let entrustmentLines = input.entrustmentLines.map((line) => ({ ...line }));
  let inspectionSourceLines = input.inspectionSourceLines.map((line) => ({ ...line }));
  const relations: ProductMatchRelation[] = [];
  const evidence: FieldEvidence[] = [];

  for (const candidateLine of potentiallyAffected) {
    const currentLine = entrustmentLines.find((line) => line.id === candidateLine.id);
    if (!currentLine) continue;
    if (currentLine.matchRelationIds.length > 0) {
      const relatedSource = addedLines.find((source) => source.customerId === draft.customerId && matchesExplicitModelEvidence(currentLine.fields.型号, source));
      if (relatedSource) {
        const refreshed = applyInspectionEvidence(currentLine, relatedSource, draft.id);
        const lineIndex = entrustmentLines.findIndex((line) => line.id === currentLine.id);
        entrustmentLines[lineIndex] = refreshed.line;
        evidence.push(...refreshed.evidence);
      }
      continue;
    }
    const candidates = findInspectionCandidates(
      { fields: currentLine.fields, customerId: draft.customerId },
      inspectionSourceLines,
    );
    if (candidates.length !== 1) {
      if (candidates.length > 1 && !currentLine.issueIds.includes("多候选")) {
        const lineIndex = entrustmentLines.findIndex((line) => line.id === currentLine.id);
        entrustmentLines[lineIndex] = {
          ...currentLine,
          status: "待人工处理",
          issueIds: [...new Set([...currentLine.issueIds, "多候选"])],
        };
      }
      continue;
    }
    if (!modelsExactlyMatch(currentLine.fields.型号, candidates[0].fields.型号)) continue;
    const matched = establishAiMatch({
      draft,
      entrustmentLines,
      inspectionSourceLines,
      candidateSourceLineId: candidates[0].id,
      now: input.now,
    });
    draft = matched.draft;
    entrustmentLines = matched.entrustmentLines.map((line) => ({ ...line }));
    inspectionSourceLines = matched.inspectionSourceLines.map((line) => ({ ...line }));
    relations.push(matched.relation);
    evidence.push(...matched.evidence);
  }

  const changedLineIds = entrustmentLines
    .filter((line) => {
      const before = beforeLines.find((candidate) => candidate.id === line.id);
      return before !== undefined && JSON.stringify(snapshotDraftLine(before)) !== JSON.stringify(snapshotDraftLine(line));
    })
    .map((line) => line.id);
  const version = createDraftVersionIfChanged({
    draftId: input.draft.id,
    version: input.draft.version + 1,
    triggerReason: "增量核对",
    materialBatchIds: input.materialBatchId ? [input.materialBatchId] : [],
    before: beforeLines.filter((line) => changedLineIds.includes(line.id)).map(snapshotDraftLine),
    after: entrustmentLines.filter((line) => changedLineIds.includes(line.id)).map(snapshotDraftLine),
    addedRelationIds: relations.map((relation) => relation.id),
    actorType: "系统自动",
    createdAt: input.now,
    id: `DV-${input.draft.id}-${input.draft.version + 1}-incremental`,
  });
  if (version) {
    draft = {
      ...draft,
      version: input.draft.version + 1,
      status: deriveDraftStatus({
        customerId: draft.customerId,
        lineStatuses: entrustmentLines.map((line) => line.status),
        activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
        submittedForManualConfirmation: input.draft.status === "人工确认中",
        isFinalized: false,
        currentStatus: input.draft.status,
      }),
      hasAiUpdate: true,
      lastUpdateReason: "增量核对",
      updatedAt: input.now,
    };
  } else {
    draft = { ...input.draft, updatedAt: input.now };
  }
  const operation = version
    ? {
        id: `OP-${input.draft.id}-${input.draft.version + 1}-incremental`,
        operationType: "增量核对" as const,
        actorType: "系统自动" as const,
        customerId: draft.customerId,
        draftId: draft.id,
        affectedEntrustmentLineIds: changedLineIds,
        affectedInspectionSourceLineIds: relations.flatMap((relation) => relation.inspectionSourceLineIds),
        summary: `新增查货触发 ${changedLineIds.length} 行增量核对并形成新版本`,
        occurredAt: input.now,
      }
    : createDraftCheckOperation({
        draftId: input.draft.id,
        customerId: input.draft.customerId,
        lineIds: potentiallyAffected.map((line) => line.id),
        sourceLineIds: input.addedSourceLineIds,
        operationType: "增量核对",
        summary: "增量核对完成，草稿结果无变化",
        occurredAt: input.now,
        id: `OP-${input.draft.id}-incremental-check-${input.now}`,
      });
  return {
    draft,
    entrustmentLines,
    inspectionSourceLines,
    relations,
    evidence,
    operation,
    version,
    affectedLineIds: potentiallyAffected.map((line) => line.id),
  };
}

export interface UpdateDraftMaterialInput {
  readonly draft: EntrustmentDraft;
  readonly currentLines: readonly EntrustmentLine[];
  readonly updatedLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly activeRelations: readonly ProductMatchRelation[];
  readonly materialBatchId?: string;
  readonly now: IsoDateTime;
}

export interface UpdateDraftMaterialResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relations: readonly ProductMatchRelation[];
  readonly invalidatedRelations: readonly ProductMatchRelation[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion | null;
  readonly changedLineIds: readonly string[];
}

/**
 * 更新资料必须明确指定目标草稿。只对资料实际变化的行重算，稳定行沿用原对象和关系。
 * 旧关系不会删除：失效、释放、重新匹配在同一个动作结果中返回。
 */
export function updateEntrustmentDraftMaterial(input: UpdateDraftMaterialInput): UpdateDraftMaterialResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能更新委托资料");
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止更新委托资料");
  const currentById = new Map(input.currentLines.map((line) => [line.id, line]));
  const updatedById = new Map(input.updatedLines.map((line) => [line.id, line]));
  const changedLineIds = input.currentLines
    .filter((line) => {
      const updated = updatedById.get(line.id);
      return updated !== undefined && JSON.stringify(line.fields) !== JSON.stringify(updated.fields);
    })
    .map((line) => line.id);
  const beforeLines = input.currentLines.map((line) => ({ ...line }));
  let draft = input.draft;
  let entrustmentLines = input.currentLines.map((line) => ({ ...line }));
  let inspectionSourceLines = input.inspectionSourceLines.map((line) => ({ ...line }));
  const relations: ProductMatchRelation[] = [];
  const invalidatedRelations: ProductMatchRelation[] = [];

  for (const lineId of changedLineIds) {
    const oldLine = currentById.get(lineId);
    const updatedMaterialLine = updatedById.get(lineId);
    if (!oldLine || !updatedMaterialLine) continue;
    const activeRelation = input.activeRelations.find(
      (relation) => relation.active && relation.entrustmentLineId === lineId,
    );

    if (activeRelation) {
      const unbound = unbindMatch({
        draft,
        entrustmentLines,
        inspectionSourceLines,
        relation: activeRelation,
        now: input.now,
        invalidationReason: "更新委托资料",
      });
      draft = unbound.draft;
      entrustmentLines = unbound.entrustmentLines.map((line) => ({ ...line }));
      inspectionSourceLines = unbound.inspectionSourceLines.map((line) => ({ ...line }));
      invalidatedRelations.push(unbound.relation);
    }

    const lineIndex = entrustmentLines.findIndex((line) => line.id === lineId);
    if (lineIndex < 0) continue;
    const materialFields = { ...updatedMaterialLine.fields };
    let refreshedLine: EntrustmentLine = {
      ...entrustmentLines[lineIndex],
      fields: materialFields,
      issueIds: [],
      status: "暂无查货依据",
      matchRelationIds: [],
      updatedFieldNames: [...new Set([
        ...entrustmentLines[lineIndex].updatedFieldNames,
        ...FINAL_OUTPUT_FIELDS.filter((field) => oldLine.fields[field] !== materialFields[field]),
      ])],
    };
    entrustmentLines[lineIndex] = refreshedLine;
    const candidates = findInspectionCandidates(
      { fields: refreshedLine.fields, customerId: input.draft.customerId },
      inspectionSourceLines,
    );
    if (candidates.length > 1) {
      refreshedLine = { ...refreshedLine, status: "待人工处理", issueIds: ["多候选"] };
      entrustmentLines[lineIndex] = refreshedLine;
      continue;
    }
    if (candidates.length === 1 && modelsExactlyMatch(refreshedLine.fields.型号, candidates[0].fields.型号)) {
      const matched = establishAiMatch({
        draft,
        entrustmentLines,
        inspectionSourceLines,
        candidateSourceLineId: candidates[0].id,
        now: input.now,
      });
      draft = matched.draft;
      entrustmentLines = matched.entrustmentLines.map((line) => ({ ...line }));
      inspectionSourceLines = matched.inspectionSourceLines.map((line) => ({ ...line }));
      relations.push(matched.relation);
    }
  }

  const afterLines = entrustmentLines.filter((line) => changedLineIds.includes(line.id));
  const beforeChangedLines = beforeLines.filter((line) => changedLineIds.includes(line.id));
  const version = createDraftVersionIfChanged({
    draftId: input.draft.id,
    version: input.draft.version + 1,
    triggerReason: "更新委托资料",
    materialBatchIds: input.materialBatchId ? [input.materialBatchId] : [],
    before: beforeChangedLines.map(snapshotDraftLine),
    after: afterLines.map(snapshotDraftLine),
    addedRelationIds: relations.map((relation) => relation.id),
    invalidatedRelationIds: invalidatedRelations.map((relation) => relation.id),
    actorType: "系统自动",
    createdAt: input.now,
    id: `DV-${input.draft.id}-${input.draft.version + 1}-material-update`,
  });
  if (version) {
    draft = {
      ...draft,
      version: input.draft.version + 1,
      status: deriveDraftStatus({
        customerId: draft.customerId,
        lineStatuses: entrustmentLines.map((line) => line.status),
        activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length),
        submittedForManualConfirmation: false,
        isFinalized: false,
        currentStatus: input.draft.status,
      }),
      hasAiUpdate: relations.length > 0,
      lastUpdateReason: "更新委托资料",
      updatedAt: input.now,
    };
  } else {
    draft = { ...input.draft, updatedAt: input.now };
  }
  const operation = version
    ? {
        id: `OP-${input.draft.id}-${input.draft.version + 1}-material-update`,
        operationType: "更新委托资料" as const,
        actorType: "系统自动" as const,
        customerId: draft.customerId,
        draftId: draft.id,
        affectedEntrustmentLineIds: changedLineIds,
        affectedInspectionSourceLineIds: [...new Set([
          ...invalidatedRelations.flatMap((relation) => relation.inspectionSourceLineIds),
          ...relations.flatMap((relation) => relation.inspectionSourceLineIds),
        ])],
        summary: `更新 ${draft.displayNo} 的 ${changedLineIds.length} 行委托资料`,
        occurredAt: input.now,
      }
    : createDraftCheckOperation({
        draftId: input.draft.id,
        customerId: input.draft.customerId,
        lineIds: changedLineIds,
        operationType: "更新委托资料",
        summary: "委托资料检查完成，草稿结果无变化",
        occurredAt: input.now,
        id: `OP-${input.draft.id}-material-update-check-${input.now}`,
      });
  return { draft, entrustmentLines, inspectionSourceLines, relations, invalidatedRelations, operation, version, changedLineIds };
}

export interface SubmitDraftForManualConfirmationInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly now: IsoDateTime;
}

export interface SubmitDraftForManualConfirmationResult {
  readonly draft: EntrustmentDraft;
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 只有所有商品行都有查货依据才能进入人工确认；黄色冲突不阻断进入。 */
export function submitDraftForManualConfirmation(
  input: SubmitDraftForManualConfirmationInput,
): SubmitDraftForManualConfirmationResult {
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能提交人工确认");
  if (input.draft.customerId === null) throw new Error("客户未确定，不能提交人工确认");
  if (input.draft.status === "人工确认中") throw new Error("草稿已经处于人工确认中");
  if (input.entrustmentLines.some((line) => line.matchRelationIds.length === 0)) {
    throw new Error("仍有商品行暂无查货依据");
  }
  const draft: EntrustmentDraft = {
    ...input.draft,
    status: "人工确认中",
    version: input.draft.version + 1,
    lastUpdateReason: "提交人工确认",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-submit-confirmation`,
    operationType: "提交人工确认",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: input.entrustmentLines.map((line) => line.id),
    affectedInspectionSourceLineIds: [],
    summary: "整单已具备查货依据，进入人工确认",
    occurredAt: input.now,
  };
  const version = createDraftVersionIfChanged({
    draftId: draft.id,
    version: draft.version,
    triggerReason: "提交人工确认",
    before: input.entrustmentLines.map(snapshotDraftLine),
    after: input.entrustmentLines.map(snapshotDraftLine),
    actorType: "人工操作",
    createdAt: input.now,
    id: `DV-${draft.id}-${draft.version}-submit-confirmation`,
    beforeDraftStatus: input.draft.status,
    afterDraftStatus: draft.status,
  });
  if (!version) throw new Error("提交人工确认没有产生状态变化");
  return { draft, operation, version };
}

export interface ConfirmDraftLineInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly entrustmentLineId: string;
  readonly now: IsoDateTime;
}

export interface ConfirmDraftLineResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 人工确认模式下逐行确认；问题仍存在时拒绝确认该行。 */
export function confirmDraftLine(input: ConfirmDraftLineInput): ConfirmDraftLineResult {
  if (input.draft.status !== "人工确认中") throw new Error("草稿不在人工确认中");
  const index = input.entrustmentLines.findIndex((line) => line.id === input.entrustmentLineId);
  if (index < 0) throw new Error("委托商品行不存在");
  const beforeLine = input.entrustmentLines[index];
  if (beforeLine.issueIds.length > 0) throw new Error("该商品行仍有待处理问题");
  if (beforeLine.matchRelationIds.length === 0) throw new Error("该商品行暂无查货依据");
  const updatedLine: EntrustmentLine = { ...beforeLine, manuallyConfirmed: true, status: "人工已确认" };
  const entrustmentLines = input.entrustmentLines.map((line, lineIndex) => lineIndex === index ? updatedLine : { ...line });
  const draft: EntrustmentDraft = { ...input.draft, version: input.draft.version + 1, lastUpdateReason: "人工确认商品行", updatedAt: input.now };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-confirm-line-${beforeLine.id}`,
    operationType: "人工编辑字段",
    actorType: "人工操作",
    customerId: draft.customerId,
    draftId: draft.id,
    affectedEntrustmentLineIds: [beforeLine.id],
    affectedInspectionSourceLineIds: [],
    summary: `人工确认商品行 ${beforeLine.id}`,
    occurredAt: input.now,
  };
  const version = createDraftVersionIfChanged({
    draftId: draft.id,
    version: draft.version,
    triggerReason: "人工确认商品行",
    before: [snapshotDraftLine(beforeLine)],
    after: [snapshotDraftLine(updatedLine)],
    actorType: "人工操作",
    createdAt: input.now,
    id: `DV-${draft.id}-${draft.version}-confirm-line-${beforeLine.id}`,
  });
  if (!version) throw new Error("商品行已经是人工已确认");
  return { draft, entrustmentLines, operation, version };
}

export interface EstablishManualCompositeMatchInput {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly entrustmentLineId: string;
  readonly sourceLineIds: readonly InspectionSourceLineId[];
  readonly now: IsoDateTime;
}

export interface EstablishManualCompositeMatchResult {
  readonly draft: EntrustmentDraft;
  readonly entrustmentLines: readonly EntrustmentLine[];
  readonly inspectionSourceLines: readonly InspectionSourceLine[];
  readonly relation: ProductMatchRelation;
  readonly evidence: readonly FieldEvidence[];
  readonly operation: OperationRecord;
  readonly version: DraftVersion;
}

/** 复杂关系的人工原子动作：一条委托行可追溯多条原始查货行，但每条原始行仍独立占用。 */
export function establishManualCompositeMatch(
  input: EstablishManualCompositeMatchInput,
): EstablishManualCompositeMatchResult {
  if (input.draft.customerId === null) throw new Error("客户未确定，禁止建立人工关系");
  if (input.draft.isFinalized || input.draft.status === "已完成") throw new Error("已完成草稿不能建立人工关系");
  const sourceIds = [...new Set(input.sourceLineIds)];
  if (sourceIds.length === 0) throw new Error("至少选择一条查货原始行");
  const lineIndex = input.entrustmentLines.findIndex((line) => line.id === input.entrustmentLineId);
  if (lineIndex < 0) throw new Error("委托商品行不存在");
  const sourceLines = sourceIds.map((id) => input.inspectionSourceLines.find((line) => line.id === id));
  const resolvedSourceLines = sourceLines.filter((line): line is InspectionSourceLine => line !== undefined);
  if (resolvedSourceLines.length !== sourceIds.length) throw new Error("查货原始行不存在");
  if (resolvedSourceLines.some((line) => line.customerId !== input.draft.customerId)) throw new Error("客户不一致，禁止建立人工关系");
  if (resolvedSourceLines.some((line) => line.status !== "可匹配" || line.occupiedDraftId !== null)) throw new Error("存在不可匹配的查货原始行");

  const targetLine = input.entrustmentLines[lineIndex];
  if (targetLine.matchRelationIds.length) throw new Error("该委托行已有依据，请先解绑或使用改配");
  const relation: ProductMatchRelation = {
    id: `MR-${input.draft.id}-${targetLine.id}-composite-${sourceIds.join("-")}`,
    draftId: input.draft.id,
    entrustmentLineId: targetLine.id,
    logicalInspectionOrderId: resolvedSourceLines[0].logicalInspectionOrderId,
    inspectionMergedProductId: null,
    inspectionSourceLineIds: sourceIds,
    establishedBy: "人工",
    active: true,
    createdAt: input.now,
    invalidatedAt: null,
    invalidationReason: null,
    evidenceSummary: `人工组合 ${sourceIds.length} 条查货原始行`,
  };
  // Preserve each source separately. Combining rows is a human decision, not a model verdict.
  const evidence: FieldEvidence[] = [];
  const issueIds = new Set(targetLine.issueIds.filter(issue => issue !== "多候选"));
  for (const source of resolvedSourceLines) {
    for (const [field, sourceField] of MATCHED_FIELD_MAP) {
      const value = source.fields[sourceField];
      const requiresReview = ["数量", "件数", "净重", "毛重"].includes(field) ||
        !isKnownValue(value) || !fieldValuesEquivalent(field, targetLine.fields[field], value, source);
      if (requiresReview) issueIds.add(`字段冲突:${field}`);
      evidence.push({
        id: `FE-${input.draft.id}-${targetLine.id}-composite-v${input.draft.version + 1}-${source.id}-${field}`,
        draftId: input.draft.id, entrustmentLineId: targetLine.id, field,
        currentValue: targetLine.fields[field], originalValue: targetLine.fields[field],
        sourceMaterialType: "查货", sourceFileId: source.sourceFileId,
        sourceLocation: source.sourceLocation, sourceInspectionLineId: source.id,
        isAiUpdated: false, isManuallyEdited: false, hadConflict: requiresReview,
        candidateValues: [value],
      });
    }
  }
  const updatedLine: EntrustmentLine = {
    ...targetLine,
    manuallyConfirmed: false,
    matchRelationIds: [...targetLine.matchRelationIds, relation.id],
    issueIds: [...issueIds],
    evidenceIds: [...targetLine.evidenceIds, ...evidence.map(item => item.id)],
    status: deriveEntrustmentLineStatus({
      activeMatchRelationCount: targetLine.matchRelationIds.length + 1,
      hasBlockingIssue: issueIds.size > 0,
      awaitingCandidateSelection: false,
      manuallyConfirmed: false,
    }),
  };
  const sourceIdSet = new Set(sourceIds);
  const inspectionSourceLines = input.inspectionSourceLines.map((line) => sourceIdSet.has(line.id)
    ? { ...line, status: "草稿占用" as const, occupiedDraftId: input.draft.id, occupiedEntrustmentLineId: targetLine.id, updatedAt: input.now }
    : { ...line });
  const entrustmentLines = input.entrustmentLines.map((line, index) => index === lineIndex ? updatedLine : { ...line });
  const draft: EntrustmentDraft = {
    ...input.draft,
    version: input.draft.version + 1,
    status: deriveDraftStatus({ customerId: input.draft.customerId, lineStatuses: entrustmentLines.map((line) => line.status), activeMatchRelationCounts: entrustmentLines.map((line) => line.matchRelationIds.length), submittedForManualConfirmation: input.draft.status === "人工确认中", isFinalized: false, currentStatus: input.draft.status }),
    lastUpdateReason: "人工建立关系",
    updatedAt: input.now,
  };
  const operation: OperationRecord = {
    id: `OP-${draft.id}-${draft.version}-composite`, operationType: "人工建立关系", actorType: "人工操作", customerId: draft.customerId, draftId: draft.id,
    affectedEntrustmentLineIds: [targetLine.id], affectedInspectionSourceLineIds: sourceIds, summary: `人工将 ${sourceIds.length} 条查货行组合到 ${targetLine.id}`, occurredAt: input.now,
  };
  const version: DraftVersion = {
    id: `DV-${draft.id}-${draft.version}-composite`, draftId: draft.id, version: draft.version, triggerReason: "人工建立关系", materialBatchIds: [], changedLineIds: [targetLine.id],
    before: [snapshotDraftLine(targetLine)], after: [snapshotDraftLine(updatedLine)], addedRelationIds: [relation.id], invalidatedRelationIds: [], actorType: "人工操作", createdAt: input.now,
  };
  return { draft, entrustmentLines, inspectionSourceLines, relation, evidence, operation, version };
}
