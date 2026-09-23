"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import customersJson from "../demo-generated/mock/customers.json";
import draftsJson from "../demo-generated/mock/entrustment-drafts.json";
import linesJson from "../demo-generated/mock/entrustment-lines.json";
import sourcesJson from "../demo-generated/mock/inspection-source-lines.json";
import filesJson from "../demo-generated/mock/source-files.json";
import scenariosJson from "../demo-generated/mock/scenarios.json";
import materialBatchesJson from "../demo-generated/mock/material-batches.json";
import scenarioOverridesJson from "../demo-generated/mock/scenario-overrides.json";
import { promptFixture, puyiFixture, getPromptFixture, replayPromptResult, initialPromptEvidence } from "./domain/prompt-replay";
import { completeDraft, confirmDraftLine, createEntrustmentDraft, editDraftField, establishManualCompositeMatch, executeInitialMatching, ingestInspectionBatch, reassignMatch, reconcileDraftWithInspectionIncrement, resolveDraftCustomer, selectMatchCandidate, submitDraftForManualConfirmation, unbindMatch, updateEntrustmentDraftMaterial } from "./domain/actions";
import { createFinalOutputRow } from "./domain/final-output";
import { mergeInspectionSourceLines } from "./domain/inspection-merge";
import { deriveDraftStatus } from "./domain/status";
import { canEnterProductPool, completeParseJob, createParseJob, failParseJob, flagParseJobForReview, resolveParseReview as resolveParseReviewState, startParseJob, type ParseJob, type ParsedFactRow, type ParsedMaterialResult } from "./intake/parse-contract";
import { resolveKnownCustomer } from "./intake/customer-resolution";
import { convertEntrustmentFacts, type EntrustmentConversionLine } from "./intake/entrustment-conversion";
import { convertInspectionFacts, type InspectionConversionLine } from "./intake/inspection-conversion";
import { auxiliaryFieldValue, convertAuxiliaryFacts, type AuxiliaryConversion } from "./intake/auxiliary-conversion";
import type {
  DraftVersion,
  EntrustmentDraft,
  EntrustmentLine,
  FieldEvidence,
  FinalOutputField,
  FinalReconciliationSheet,
  FinalOutputRow,
  InspectionSourceFields,
  InspectionSourceLine,
  OperationRecord,
  ProductMatchRelation,
  SourceLocation,
  MaterialType,
} from "./domain/types";

export type ViewKey = "home" | "intake" | "pool" | "drafts" | "workbench" | "history" | "console";

export interface NavigationEntry {
  view: ViewKey;
  customerId?: string | null;
  draftId?: string | null;
}
export type UiStatus = "暂无查货依据" | "已找到查货依据" | "待人工处理" | "人工已确认";
export type TaskStage = "new" | "uploading" | "parsing" | "ready" | "matching" | "review" | "confirming" | "finalized";
export type TaskPanel = "overview" | "materials" | "issues" | "evidence" | "history" | `line:${string}`;

export interface TaskIssue {
  id: string;
  draftId: string;
  lineId: string;
  kind: "missing-evidence" | "field-issue";
  message: string;
  severity: "must" | "review";
}

export interface TaskProgress {
  materials: { current: number; total: number };
  relations: { current: number; total: number };
  review: { current: number; total: number };
  finalization: { current: number; total: number };
}

export interface ScenarioEntry {
  scenarioId: string;
  restoredAt: string;
}

export interface UiLine {
  lockedFields?: readonly FinalOutputField[];
  id: string;
  draftId: string;
  model: string;
  brand: string;
  origin: string;
  quantity: string;
  status: UiStatus;
  relationSourceId: string | null;
  relationSourceIds: string[];
  matchRelationIds: string[];
  fields: FinalOutputRow;
  baseValues?: FinalOutputRow;
  evidenceIds: string[];
  issueIds: string[];
  updatedFieldNames: EntrustmentLine["updatedFieldNames"];
  manuallyConfirmed: boolean;
  sourceOrder: number;
  sourceLocation: SourceLocation | null;
  issue: string | null;
}

export interface UiDraft {
  id: string;
  displayNo: string;
  customerId: string | null;
  customerName: string;
  status: string;
  version: number;
  lines: UiLine[];
  finalized: boolean;
  customerStatus: EntrustmentDraft["customerStatus"];
  materialFileIds: string[];
  hasAiUpdate: boolean;
  lastUpdateReason: string | null;
  finalReconciliationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UiSource {
  id: string;
  customerId: string | null;
  model: string;
  brand: string;
  origin: string;
  quantity: string;
  availability: "可匹配" | "草稿占用" | "已核销" | "未加载";
  warehouseNo: string;
  sourceFileId: string;
  fields: InspectionSourceFields;
  otherFields: Readonly<Record<string, string | null>>;
  logicalInspectionOrderId: string;
  sourceLocation: SourceLocation;
  occupiedDraftId: string | null;
  occupiedEntrustmentLineId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UiEvent {
  id: string;
  type: string;
  summary: string;
  time: string;
  draftId?: string;
}

export interface ConvertedEntrustment { sourceFileId: string; contentSha256: string; customerId: string | null; lines: EntrustmentConversionLine[]; warnings: string[]; convertedAt: string; }
export interface ConvertedInspection { sourceFileId: string; contentSha256: string; customerId: string | null; lines: InspectionConversionLine[]; warnings: string[]; convertedAt: string; }
export type ConvertedAuxiliaryMaterial = AuxiliaryConversion;
export interface MaterialBinding { fileId: string; draftId: string; role: "主委托" | "辅助材料"; boundAt: string; }

export type LocalUploadStatus = "待解析" | "解析中" | "解析成功" | "解析失败" | "待人工复核";
export type PocPhase = "查找" | "检查" | "修改" | "返工";
export interface PocPhaseTiming { phase: PocPhase; elapsedMs: number; startedAt: string | null; }

export interface UiFile {
  id: string;
  name: string;
  materialType: string;
  loaded: boolean;
  duplicate: boolean;
  source: "基线" | "本地上传";
  uploadStatus?: LocalUploadStatus;
  sizeBytes?: number;
  mimeType?: string;
  customerId?: string;
  duplicateOfFileId?: string;
  batchId?: string;
  contentSha256?: string;
}

export type UiParsedFact = ParsedFactRow & { jobId: string; sourceFileId: string };

export interface DemoState {
  view: ViewKey;
  scenarioId: string;
  activeTaskId: string | null;
  taskStage: TaskStage;
  taskIssues: TaskIssue[];
  taskProgress: TaskProgress;
  lastVisitedTaskId: string | null;
  lastVisitedPanel: TaskPanel;
  scenarioEntry: ScenarioEntry | null;
  selectedDraftId: string | null;
  selectedIntakeCustomerId: string | null;
  drafts: UiDraft[];
  sources: UiSource[];
  files: UiFile[];
  parseJobs: ParseJob[];
  parseResults: ParsedMaterialResult[];
  parsedFacts: UiParsedFact[];
  convertedEntrustments: ConvertedEntrustment[];
  convertedInspections: ConvertedInspection[];
  convertedAuxiliaryMaterials: ConvertedAuxiliaryMaterial[];
  materialBindings: MaterialBinding[];
  customers: Array<{ id: string; name: string }>;
  events: UiEvent[];
  relations: ProductMatchRelation[];
  evidence: FieldEvidence[];
  versions: DraftVersion[];
  operations: OperationRecord[];
  finalReconciliations: FinalReconciliationSheet[];
  pocPhaseTimings: PocPhaseTiming[];
  toast: string | null;
  selectedWorkspaceCustomerId: string | null;
  setSelectedWorkspaceCustomerId: (customerId: string | null) => void;
  historyStack: NavigationEntry[];
  goBack: () => void;
  setView: (view: ViewKey) => void;
  setLastVisitedPanel: (panel: TaskPanel) => void;
  setIntakeCustomer: (customerId: string) => void;
  addCustomer: (name: string) => { id: string; name: string };
  selectDraft: (id: string) => void;
  loadScenario: (id: string) => void;
  openBusinessWorkspace: () => void;
  savedBusinessWorkspace: Partial<DemoState> | null;
  previousScenarioWorkspace: Partial<DemoState> | null;
  restorePreviousScenario: () => void;
  ingestFile: (fileId: string) => void;
  stageLocalFile: (file: { name: string; size: number; type: string; file?: File; materialType?: MaterialType; customerId?: string; batchId?: string }) => void;
  parseLocalFile: (fileId: string) => Promise<void>;
  rebindLocalFile: (fileId: string, file: File) => Promise<void>;
  recoverInterruptedParseJobs: () => void;
  togglePocPhase: (phase: PocPhase) => void;
  startParse: (fileId: string) => void;
  recordParseFailure: (fileId: string, code: string, message: string) => void;
  flagParseReview: (fileId: string, reason: string) => void;
  resolveParseReview: (fileId: string) => void;
  completeManualParse: (fileId: string, facts: readonly ParsedFactRow[], materialType: MaterialType, customerId: string | null) => void;
  completeParse: (fileId: string, result: ParsedMaterialResult, facts?: readonly ParsedFactRow[]) => void;
  resolveParsedFileCustomer: (fileId: string, customerId: string) => void;
  parseLatestLocalFile: (input: { fileId: string; file: File }) => Promise<void>;
  createDraft: () => void;
  createDraftFromEntrustmentFile: (fileId: string) => void;
  bindMaterialToDraft: (fileId: string, draftId: string) => void;
  reviseDraftWithEntrustmentFile: (fileId: string, draftId: string) => void;
  matchSelectedDraft: () => void;
  selectLineSource: (lineId: string, sourceId: string) => void;
  resolveSelectedDraftCustomer: (customerId: string) => void;
  editSelectedLineField: (lineId: string, field: FinalOutputField, value: string, review?: FieldEvidence["review"]) => void;
  confirmSelectedLineField: (lineId: string, field: FinalOutputField) => void;
  unbindSelectedLine: (lineId: string) => void;
  reassignSelectedLine: (lineId: string, sourceId: string) => void;
  establishCompositeForLine: (lineId: string, sourceIds: string[]) => void;
  updateSelectedDraftMaterial: (lineId: string, field: FinalOutputField, value: string) => void;
  submitSelectedDraft: () => void;
  revertDraftToReview: () => void;
  confirmLine: (lineId: string) => void;
  unconfirmLine: (lineId: string) => void;
  completeSelectedDraft: () => void;
  clearToast: () => void;
  isEvaluationMode: boolean;
  setEvaluationMode: (enabled: boolean) => void;
}

const now = () => new Date().toISOString();
const baselineTime = "2026-09-18T00:00:00.000Z";
const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
})();
const customerMap = new Map((customersJson as Array<{ id: string; name: string }>).map((customer) => [customer.id, customer.name]));
const localFileBlobs = new Map<string, File>();
export function getLocalMaterial(fileId: string) { return localFileBlobs.get(fileId); }

export const DRAFT_SAMPLE_DISPLAY_MAP: Record<string, string> = {
  'D-3c3cc10bd26b': '2025YBT010-2',
  'D-8181f9edc198': '2026(DG)ZW001',
  'D-b436a16434a4': '2026(DG)ZW003',
  'D-ab6bfdee3e54': '2026(DG)ZW050',
  'D-0971c3fd7c49': '2026ACSY003',
  'D-e60d9bd8df88': '2026AG001',
  'D-fb448776f711': '2026BMH001',
  'D-a64834ca9065': '2026CNKJ001',
  'D-df72916dc019': '26SHPYD056',
  'D-1df4f4d83480': 'YK-260625131-1',
  'D-a235e97d6dd0': 'YK-260625131-2',
  'D-5a09ab721f2e': 'YK-260625131-3',
};

function buildDrafts(): UiDraft[] {
  const linesByDraft = new Map<string, UiLine[]>();
  for (const line of linesJson as unknown as Array<{ id: string; draftId: string; sourceOrder: number; fields: Partial<FinalOutputRow>; status: UiStatus; source?: { fileId?: string; page?: number | null; sheet?: string | null; row?: number } }>) {
    const current = linesByDraft.get(line.draftId) ?? [];
    const fields = createFinalOutputRow(line.fields);
    current.push({
      id: line.id,
      draftId: line.draftId,
      model: fields["型号"] ?? "UNKNOWN",
      brand: fields["品牌"] ?? "UNKNOWN",
      origin: fields["产地"] ?? "UNKNOWN",
      quantity: fields["数量"] ?? "UNKNOWN",
      status: line.status,
      relationSourceId: null,
      relationSourceIds: [],
      matchRelationIds: [],
      fields,
      evidenceIds: [],
      issueIds: [],
      updatedFieldNames: [],
      manuallyConfirmed: false,
      sourceOrder: line.sourceOrder,
      sourceLocation: line.source ? { fileId: line.source.fileId ?? "UNKNOWN", page: line.source.page ?? null, sheet: line.source.sheet ?? null, position: line.source.row ? `第 ${line.source.row} 行` : null } : null,
      issue: null,
    });
    linesByDraft.set(line.draftId, current);
  }

  return (draftsJson as unknown as Array<{ id: string; fileId: string; customerId: string; customerStatus: EntrustmentDraft["customerStatus"]; status: EntrustmentDraft["status"]; version: number; lineIds: string[] }>).map((draft, index) => {
    const file = filesJson.find((f: any) => f.id === draft.fileId);
    const realSampleNo = DRAFT_SAMPLE_DISPLAY_MAP[draft.id] || file?.sampleId || `W${String(index + 1).padStart(3, "0")}`;
    return {
      id: draft.id,
      displayNo: realSampleNo,
      customerId: draft.customerId === "UNKNOWN" ? null : draft.customerId,
      customerName: customerMap.get(draft.customerId) ?? "待补客户信息",
      status: draft.status,
      version: draft.version,
      lines: linesByDraft.get(draft.id) ?? [],
      finalized: false,
      customerStatus: draft.customerStatus,
      materialFileIds: [draft.fileId],
      hasAiUpdate: false,
      lastUpdateReason: null,
      finalReconciliationId: null,
      createdAt: baselineTime,
      updatedAt: baselineTime,
    };
  });
}

function buildSources(): UiSource[] {
  return (sourcesJson as unknown as Array<{ id: string; customerId: string; fields: Record<string, string | null | undefined>; inspectionOrderId: string; availability: string; source: { fileId: string; page?: number | null; position?: string | null } }>).map((source) => ({
    id: source.id,
    customerId: source.customerId === "UNKNOWN" ? null : source.customerId,
    model: source.fields["型号"] ?? "UNKNOWN",
    brand: source.fields["品牌"] ?? "UNKNOWN",
    origin: source.fields["产地"] ?? "UNKNOWN",
    quantity: source.fields["数量"] ?? "UNKNOWN",
    availability: source.availability === "unloaded" ? "未加载" : "可匹配",
    warehouseNo: source.inspectionOrderId.split("-").pop() ?? "UNKNOWN",
    sourceFileId: source.source.fileId,
    fields: {
      品牌: source.fields["品牌"] ?? null,
      型号: source.fields["型号"] ?? null,
      产地: source.fields["产地"] ?? null,
      数量: source.fields["数量"] ?? null,
      单位: source.fields["单位"] ?? null,
      件数: source.fields["件数"] ?? null,
      净重: source.fields["净重"] ?? null,
      毛重: source.fields["毛重"] ?? null,
    },
    otherFields: {},
    logicalInspectionOrderId: source.inspectionOrderId,
    sourceLocation: { fileId: source.source.fileId, page: source.source.page ?? null, sheet: null, position: source.source.position ?? null },
    occupiedDraftId: null,
    occupiedEntrustmentLineId: null,
    createdAt: baselineTime,
    updatedAt: baselineTime,
  }));
}

function toDomainDraft(draft: UiDraft): EntrustmentDraft {
  return {
    id: draft.id, displayNo: draft.displayNo, customerId: draft.customerId,
    customerStatus: draft.customerStatus, version: draft.version,
    status: draft.status as EntrustmentDraft["status"], lineIds: draft.lines.map((line) => line.id),
    materialFileIds: draft.materialFileIds, hasAiUpdate: draft.hasAiUpdate,
    lastUpdateReason: draft.lastUpdateReason, isFinalized: draft.finalized,
    finalReconciliationId: draft.finalReconciliationId, createdAt: draft.createdAt, updatedAt: draft.updatedAt,
  };
}

function toDomainLine(line: UiLine): EntrustmentLine {
  return {
    lockedFields: line.lockedFields,
    id: line.id, draftId: line.draftId, sourceOrder: line.sourceOrder, fields: line.fields,
    status: line.status, matchRelationIds: line.matchRelationIds, evidenceIds: line.evidenceIds,
    issueIds: line.issueIds, updatedFieldNames: line.updatedFieldNames,
    manuallyConfirmed: line.manuallyConfirmed, sourceLocation: line.sourceLocation,
  };
}

function toDomainSource(source: UiSource): InspectionSourceLine {
  return {
    id: source.id, customerId: source.customerId, logicalInspectionOrderId: source.logicalInspectionOrderId,
    sourceFileId: source.sourceFileId, sourceLocation: source.sourceLocation, fields: source.fields,
    otherFields: source.otherFields, status: source.availability === "未加载" ? "可匹配" : source.availability,
    occupiedDraftId: source.occupiedDraftId, occupiedEntrustmentLineId: source.occupiedEntrustmentLineId,
    createdAt: source.createdAt, updatedAt: source.updatedAt,
  };
}

export function getMergedPoolProducts(sources: readonly UiSource[]) {
  return mergeInspectionSourceLines(sources.filter((source) => source.availability !== "未加载").map(toDomainSource), { now: baselineTime });
}

export function getPocMetrics(state: Pick<DemoState, "files" | "drafts" | "relations" | "operations"> & { pocPhaseTimings?: PocPhaseTiming[] }, currentTime = Date.now()) {
  const totalLines = state.drafts.reduce((sum, draft) => sum + draft.lines.length, 0);
  const matchedLineIds = new Set(state.relations.filter((relation) => relation.active).map((relation) => relation.entrustmentLineId));
  return {
    loadedFileCount: state.files.filter((file) => file.loaded).length,
    activeRelationCount: state.relations.filter((relation) => relation.active).length,
    manualActionCount: state.operations.filter((operation) => operation.actorType === "人工操作").length,
    matchCoverage: totalLines === 0 ? 0 : Math.round((matchedLineIds.size / totalLines) * 100),
    phaseMetrics: [
      { phase: "查找", actionCount: state.operations.filter((item) => ["AI 首次匹配", "选择候选", "人工建立关系"].includes(item.operationType)).length },
      { phase: "检查", actionCount: state.operations.filter((item) => ["增量核对", "提交人工确认"].includes(item.operationType)).length },
      { phase: "修改", actionCount: state.operations.filter((item) => ["人工编辑字段", "更新委托资料"].includes(item.operationType)).length },
      { phase: "返工", actionCount: state.operations.filter((item) => ["人工改配", "解除匹配"].includes(item.operationType)).length },
    ].map((metric) => {
      const timing = state.pocPhaseTimings?.find((item) => item.phase === metric.phase);
      const runningMs = timing?.startedAt ? Math.max(0, currentTime - new Date(timing.startedAt).getTime()) : 0;
      return { ...metric, activeSeconds: Math.floor(((timing?.elapsedMs ?? 0) + runningMs) / 1000), running: Boolean(timing?.startedAt) };
    }),
    recommendationActions: {
      confirmed: state.operations.filter((item) => item.operationType === "提交人工确认").length,
      reassigned: state.operations.filter((item) => item.operationType === "人工改配").length,
      manuallyLinked: state.operations.filter((item) => item.operationType === "人工建立关系" || item.operationType === "选择候选").length,
      fieldEdited: state.operations.filter((item) => item.operationType === "人工编辑字段").length,
    },
  };
}

export type ScenarioAcceptanceStatus = "已通过" | "被真实材料缺口阻断" | "未执行";

/**
 * 场景验收报告只汇总已有行为断言，不把场景可加载当成业务通过。
 * blocked 场景来自场景规格自身的 unresolved 材料问题。
 */
export function getScenarioAcceptanceReport() {
  const behaviorCovered = new Set(["SC-03", "SC-04", "SC-11", "SC-20", "SC-01", "SC-02", "SC-06", "SC-07", "SC-08", "SC-09", "SC-10", "SC-12", "SC-13", "SC-14", "SC-15", "SC-16", "SC-21"]);
  return (scenariosJson as Array<{ id: string; name: string; expectedChecks: string[]; unresolved: string[] }>).map((scenario) => {
    const status: ScenarioAcceptanceStatus = scenario.unresolved.length > 0
      ? "被真实材料缺口阻断"
      : behaviorCovered.has(scenario.id) ? "已通过" : "未执行";
    return {
      id: scenario.id,
      name: scenario.name,
      status,
      checks: [...scenario.expectedChecks],
      reason: status === "被真实材料缺口阻断" ? scenario.unresolved.join("；") : status === "已通过" ? "已有领域动作或页面测试覆盖关键行为" : "尚未执行完整动作链断言",
    };
  });
}

function fromDomainSource(source: InspectionSourceLine, previous: UiSource): UiSource {
  return {
    ...previous, fields: source.fields, model: source.fields.型号 ?? "UNKNOWN", brand: source.fields.品牌 ?? "UNKNOWN",
    origin: source.fields.产地 ?? "UNKNOWN", quantity: source.fields.数量 ?? "UNKNOWN",
    availability: source.status, occupiedDraftId: source.occupiedDraftId,
    occupiedEntrustmentLineId: source.occupiedEntrustmentLineId, updatedAt: source.updatedAt,
  };
}

function buildPendingInspectionSources(converted: ConvertedInspection): UiSource[] {
  if (!converted.customerId) return [];
  const lines = converted.lines.filter((line): line is InspectionConversionLine & { warehouseNo: string } => line.warehouseNo !== null);
  if (lines.length === 0) return [];
  const ingested = ingestInspectionBatch({
    sourceFileId: converted.sourceFileId,
    customerId: converted.customerId,
    createdAt: converted.convertedAt,
    lines: lines.map((line) => ({ id: line.id, warehouseNo: line.warehouseNo, fields: line.fields, sourceLocation: line.sourceLocation })),
  });
  return ingested.sourceLines.map((source) => ({
    id: source.id,
    customerId: source.customerId,
    model: source.fields.型号 ?? "UNKNOWN",
    brand: source.fields.品牌 ?? "UNKNOWN",
    origin: source.fields.产地 ?? "UNKNOWN",
    quantity: source.fields.数量 ?? "UNKNOWN",
    availability: "未加载" as const,
    warehouseNo: lines.find((line) => line.id === source.id)?.warehouseNo ?? "",
    sourceFileId: source.sourceFileId,
    fields: source.fields,
    otherFields: source.otherFields,
    logicalInspectionOrderId: source.logicalInspectionOrderId,
    sourceLocation: source.sourceLocation,
    occupiedDraftId: null,
    occupiedEntrustmentLineId: null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }));
}

function operationToEvent(operation: OperationRecord): UiEvent {
  return { id: operation.id, type: operation.operationType, summary: operation.summary, time: operation.occurredAt, draftId: operation.draftId ?? undefined };
}

const auxiliaryMatchKey = (fields: Readonly<Record<string, string | null>>) => {
  const normalize = (value: string | null | undefined) => value?.trim().replace(/\s+/g, "").toUpperCase() || null;
  const find = (aliases: string[]) => {
    const entry = Object.entries(fields).find(([key, value]) => aliases.includes(key.trim().replace(/\s+/g, "")) && value);
    return normalize(entry?.[1] as string | undefined);
  };
  return find(["型号", "规格型号", "料号", "货号"]) ?? find(["物料号码"]) ?? find(["sku", "SKU"]);
};

const auxiliaryEvidenceFields: readonly FinalOutputField[] = ["品牌", "型号", "产地", "单位", "数量", "件数", "净重", "毛重", "sku", "供应商", "物料号码", "入仓号"];

function fromDomainLine(line: EntrustmentLine, previous: UiLine, relations: readonly ProductMatchRelation[]): UiLine {
  const relation = relations.find((item) => item.active && item.entrustmentLineId === line.id);
  return {
    ...previous, ...line,
    baseValues: previous.baseValues ?? { ...previous.fields },
    model: line.fields.型号 ?? "UNKNOWN", brand: line.fields.品牌 ?? "UNKNOWN",
    origin: line.fields.产地 ?? "UNKNOWN", quantity: line.fields.数量 ?? "UNKNOWN",
    relationSourceId: relation?.inspectionSourceLineIds[0] ?? null,
    relationSourceIds: relation ? [...relation.inspectionSourceLineIds] : [],
    matchRelationIds: [...line.matchRelationIds], evidenceIds: [...line.evidenceIds],
    issueIds: [...line.issueIds], updatedFieldNames: [...line.updatedFieldNames],
    issue: line.issueIds.join("、") || null,
  };
}

function buildFiles() {
  return (filesJson as unknown as Array<{ id: string; path: string; extension: string; role: string; byteDuplicateOf: string | null; contentDuplicateOf: string | null }>).map((file) => ({
    id: file.id,
    name: file.path.split("/").pop() ?? file.path,
    materialType: file.role === "inspection" ? "查货" : "委托书",
    loaded: false,
    duplicate: Boolean(file.byteDuplicateOf || file.contentDuplicateOf),
    source: "基线" as const,
  }));
}

type ScenarioBatch = { id: string; fileIds: string[]; inspectionOrderIds: string[]; draftIds: string[] };
type ScenarioOperation =
  | { op: "patch-field"; asset: string; id: string; field: string; before: string; after: string }
  | { op: "clone-order"; fromId: string; id: string; fileId: string; warehouseNo: string; customerId?: string }
  | { op: "composite-pdf"; id: string; orderIds: string[] }
  | { op: "revision-material"; id: string; targetDraftId: string };

export function buildBusinessWorkspace() {
  const puyiEvidence = initialPromptEvidence(puyiFixture);
  const drafts = buildDrafts().map(draft => {
    if (draft.id === puyiFixture.draftId) {
      return {
        ...draft,
        lines: draft.lines.map(line => {
          const matched = puyiEvidence.filter(e => e.entrustmentLineId === line.id);
          return { ...line, evidenceIds: matched.map(e => e.id) };
        }),
      };
    }
    return draft;
  });
  const sources = buildSources().map(source => ({ ...source, availability: source.customerId ? "可匹配" as const : "未加载" as const }));
  const files = buildFiles().map(file => {
    const owners = new Set([...drafts.filter(d => d.materialFileIds.includes(file.id)).map(d => d.customerId), ...sources.filter(s => s.sourceFileId === file.id).map(s => s.customerId)].filter((id): id is string => !!id));
    const asset = filesJson.find(f => f.id === file.id)!;
    if (!owners.size && asset.role === "entrustment_material") {
      for (const draft of drafts) {
        if (draft.customerId && draft.materialFileIds.some(id => filesJson.some(f => f.id === id && f.sampleId === asset.sampleId))) owners.add(draft.customerId);
      }
    }
    const kinds = asset.documentSegments.map(segment => segment.kind);
    const materialType = asset.role === "reference" ? "参考结果" : asset.role === "inspection" ? "查货" : kinds.includes("entrustment") ? "委托书" : kinds.includes("invoice") ? "发票" : kinds.includes("packing-list") ? "箱单" : "其他材料";
    return { ...file, materialType, loaded: true, customerId: owners.size === 1 ? [...owners][0] : undefined };
  });
  return { scenario: { id: "BUSINESS", name: "完整客户业务", initialBatchIds: [], overrideIds: [] }, drafts, availableDrafts: drafts, sources, files, selectedDraftId: drafts[0]?.id ?? null };
}

function workspaceSnapshot(state: Partial<DemoState>): Partial<DemoState> {
  return Object.fromEntries(Object.entries(state).filter(([key, value]) => typeof value !== "function" && !["savedBusinessWorkspace", "previousScenarioWorkspace"].includes(key))) as Partial<DemoState>;
}

export function buildScenarioState(scenarioId: string) {
  if (scenarioId === "BUSINESS") return buildBusinessWorkspace();
  const scenario = (scenariosJson as Array<{ id: string; name: string; initialBatchIds: string[]; overrideIds: string[] }>).find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);

  let drafts = buildDrafts();
  let sources = buildSources();
  let files = buildFiles();
  const batches: ScenarioBatch[] = (materialBatchesJson as ScenarioBatch[]).map((batch) => ({ ...batch, fileIds: [...batch.fileIds], inspectionOrderIds: [...batch.inspectionOrderIds], draftIds: [...batch.draftIds] }));
  const overrides = scenarioOverridesJson as Array<{ id: string; operations: ScenarioOperation[] }>;

  for (const overrideId of scenario.overrideIds) {
    const override = overrides.find((item) => item.id === overrideId);
    if (!override) continue;
    for (const operation of override.operations) {
      if (operation.op === "patch-field" && operation.asset === "entrustment-lines") {
        drafts = drafts.map((draft) => ({
          ...draft,
          lines: draft.lines.map((line) => {
            if (line.id !== operation.id) return line;
            const fields = { ...line.fields, [operation.field]: operation.after } as FinalOutputRow;
            return { ...line, fields, model: fields.型号 ?? "UNKNOWN", brand: fields.品牌 ?? "UNKNOWN", origin: fields.产地 ?? "UNKNOWN", quantity: fields.数量 ?? "UNKNOWN" };
          }),
        }));
      }
      if (operation.op === "clone-order") {
        const originals = sources.filter((source) => source.logicalInspectionOrderId === operation.fromId);
        const cloned = originals.map((source, index) => ({
          ...source,
          id: `${operation.id}-L${String(index + 1).padStart(3, "0")}`,
          customerId: operation.customerId ?? source.customerId,
          logicalInspectionOrderId: operation.id,
          warehouseNo: operation.warehouseNo,
          sourceFileId: operation.fileId,
          sourceLocation: { ...source.sourceLocation, fileId: operation.fileId },
          availability: "未加载" as const,
          occupiedDraftId: null,
          occupiedEntrustmentLineId: null,
        }));
        sources = [...sources, ...cloned];
        files = [...files, { id: operation.fileId, name: `${operation.fileId}.pdf`, materialType: "查货", loaded: false, duplicate: false, source: "基线" as const }];
        batches.push({ id: `B-${operation.id}`, fileIds: [operation.fileId], inspectionOrderIds: [operation.id], draftIds: [] });
      }
      if (operation.op === "composite-pdf") {
        sources = sources.map((source) => operation.orderIds.includes(source.logicalInspectionOrderId)
          ? { ...source, sourceFileId: operation.id, sourceLocation: { ...source.sourceLocation, fileId: operation.id } }
          : source);
        files = [...files, { id: operation.id, name: `${operation.id}.pdf`, materialType: "查货", loaded: false, duplicate: false, source: "基线" as const }];
        batches.push({ id: `B-${operation.id}`, fileIds: [operation.id], inspectionOrderIds: [...operation.orderIds], draftIds: [] });
      }
      // revision-material 只登记后续动作，不在场景加载时提前修改草稿。
    }
  }

  const initialBatches = batches.filter((batch) => scenario.initialBatchIds.includes(batch.id));
  const loadedFileIds = new Set(initialBatches.flatMap((batch) => batch.fileIds));
  const loadedOrderIds = new Set(initialBatches.flatMap((batch) => batch.inspectionOrderIds));
  const loadedDraftIds = new Set(initialBatches.flatMap((batch) => batch.draftIds));
  files = files.map((file) => ({ ...file, loaded: loadedFileIds.has(file.id) }));
  sources = sources.map((source) => ({
    ...source,
    availability: loadedOrderIds.has(source.logicalInspectionOrderId) && source.customerId !== null ? "可匹配" : "未加载",
    occupiedDraftId: null,
    occupiedEntrustmentLineId: null,
  }));
  const availableDrafts = drafts;
  drafts = drafts.filter((draft) => loadedDraftIds.has(draft.id));

  if (scenarioId === promptFixture.scenarioId) {
    drafts = drafts.map(draft => draft.id !== promptFixture.draftId ? draft : {
      ...draft, customerId: promptFixture.customerId, version: 1,
      lines: promptFixture.orderRows.map(row => {
        const previous = draft.lines.find(line => line.id === row.id);
        if (!previous) throw new Error("模型委托行缺少稳定 ID 映射");
        const fields = createFinalOutputRow(row.fields);
        return {...previous, evidenceIds: initialPromptEvidence().filter(e => e.entrustmentLineId === row.id).map(e => e.id), fields, baseValues: {...fields}, sourceOrder: row.sourceOrder, sourceLocation: row.sourceLocation,
          model: fields.型号 ?? "UNKNOWN", brand: fields.品牌 ?? "UNKNOWN", origin: fields.产地 ?? "UNKNOWN", quantity: fields.数量 ?? "UNKNOWN"};
      }),
    });
    sources = sources.map(source => {
      const row = promptFixture.sourceLines.find(item => item.id === source.id);
      return row ? {...source, ...row, model: row.fields.型号 ?? "UNKNOWN", brand: row.fields.品牌 ?? "UNKNOWN", origin: row.fields.产地 ?? "UNKNOWN", quantity: row.fields.数量 ?? "UNKNOWN"} : source;
    });
  }

  return { scenario, drafts, availableDrafts, sources, files, selectedDraftId: drafts[0]?.id ?? null };
}

const emptyTaskProgress = (): TaskProgress => ({
  materials: { current: 0, total: 2 },
  relations: { current: 0, total: 0 },
  review: { current: 0, total: 0 },
  finalization: { current: 0, total: 1 },
});

function buildTaskSnapshot(
  draft: UiDraft | undefined,
  files: readonly UiFile[],
): Pick<DemoState, "taskStage" | "taskIssues" | "taskProgress"> {
  if (!draft) {
    const localFiles = files.filter((file) => file.source === "本地上传");
    return {
      taskStage: localFiles.some((file) => file.uploadStatus === "解析中")
        ? "parsing"
        : localFiles.length
          ? "uploading"
          : "new",
      taskIssues: [],
      taskProgress: emptyTaskProgress(),
    };
  }

  const taskIssues = draft.lines.flatMap<TaskIssue>((line) => {
    const issues: TaskIssue[] = [];
    if (!line.relationSourceId) {
      issues.push({
        id: `${draft.id}:${line.id}:missing-evidence`,
        draftId: draft.id,
        lineId: line.id,
        kind: "missing-evidence",
        message: line.issue ?? "尚无可靠查货依据",
        severity: "must",
      });
    }
    if (line.issue || line.issueIds.length > 0) {
      issues.push({
        id: `${draft.id}:${line.id}:field-issue`,
        draftId: draft.id,
        lineId: line.id,
        kind: "field-issue",
        message: line.issue ?? "存在待处理字段问题",
        severity: "must",
      });
    }
    return issues;
  });
  const relationCount = draft.lines.filter((line) => line.relationSourceId).length;
  const confirmedCount = draft.lines.filter((line) => line.manuallyConfirmed).length;
  const taskFiles = files.filter(
    (file) =>
      draft.materialFileIds.includes(file.id) ||
      (draft.customerId && file.customerId === draft.customerId),
  );
  const hasInspection = taskFiles.some((file) => file.materialType === "查货");
  const hasEntrustment = taskFiles.some((file) => file.materialType === "委托书");
  const taskStage: TaskStage = draft.finalized
    ? "finalized"
    : draft.status === "人工确认中"
      ? "confirming"
      : relationCount === 0
        ? "ready"
        : taskIssues.length > 0
          ? "matching"
          : "review";

  return {
    taskStage,
    taskIssues,
    taskProgress: {
      materials: { current: Number(hasInspection) + Number(hasEntrustment), total: 2 },
      relations: { current: relationCount, total: draft.lines.length },
      review: { current: confirmedCount, total: draft.lines.length },
      finalization: { current: Number(draft.finalized), total: 1 },
    },
  };
}

const initialScenario = buildBusinessWorkspace();
const initialDrafts = initialScenario.drafts;
const initialTaskSnapshot = buildTaskSnapshot(
  initialDrafts.find((draft) => draft.id === initialScenario.selectedDraftId),
  initialScenario.files,
);

export const useDemoStore = create<DemoState>()(persist((set, get) => ({
  view: "home",
  savedBusinessWorkspace: null,
  previousScenarioWorkspace: null,
  restorePreviousScenario: () => {
    const state = get();
    if (state.previousScenarioWorkspace) set({ ...state.previousScenarioWorkspace, savedBusinessWorkspace: state.scenarioId === "BUSINESS" ? workspaceSnapshot(state) : state.savedBusinessWorkspace, view: "home" });
  },
  openBusinessWorkspace: () => {
    const state = get();
    if (state.scenarioId === "BUSINESS") return;
    const previousScenarioWorkspace = workspaceSnapshot(state);
    if (state.savedBusinessWorkspace) set({ ...state.savedBusinessWorkspace, previousScenarioWorkspace, view: "home" });
    else { state.loadScenario("BUSINESS"); set({ previousScenarioWorkspace, view: "home" }); }
  },
  scenarioId: initialScenario.scenario.id,
  activeTaskId: initialScenario.selectedDraftId,
  taskStage: initialTaskSnapshot.taskStage,
  taskIssues: initialTaskSnapshot.taskIssues,
  taskProgress: initialTaskSnapshot.taskProgress,
  lastVisitedTaskId: initialScenario.selectedDraftId,
  lastVisitedPanel: "overview",
  scenarioEntry: {
    scenarioId: initialScenario.scenario.id,
    restoredAt: baselineTime,
  },
  selectedDraftId: initialDrafts[0]?.id ?? null,
  selectedIntakeCustomerId: null,
  drafts: initialDrafts,
  sources: initialScenario.sources,
  files: initialScenario.files,
  customers: (customersJson as unknown as Array<{ id: string; name: string }>).map(({ id, name }) => ({ id, name })),
  events: [],
  relations: [],
  evidence: [],
  versions: [],
  operations: [],
  finalReconciliations: [],
  pocPhaseTimings: (["查找", "检查", "修改", "返工"] as PocPhase[]).map((phase) => ({ phase, elapsedMs: 0, startedAt: null })),
  parseJobs: [],
  parseResults: [],
  parsedFacts: [],
  isEvaluationMode: false,
  setEvaluationMode: (enabled) => set({ isEvaluationMode: enabled }),
  convertedEntrustments: [],
  convertedInspections: [],
  convertedAuxiliaryMaterials: [],
  materialBindings: [],
  toast: null,
  selectedWorkspaceCustomerId: null,
  historyStack: [],
  setSelectedWorkspaceCustomerId: (selectedWorkspaceCustomerId) =>
    set((state) => {
      if (state.selectedWorkspaceCustomerId === selectedWorkspaceCustomerId) return state;
      const currentEntry: NavigationEntry = {
        view: state.view,
        customerId: state.selectedWorkspaceCustomerId,
        draftId: state.selectedDraftId,
      };
      return {
        selectedWorkspaceCustomerId,
        historyStack: [...state.historyStack, currentEntry].slice(-30),
      };
    }),
  goBack: () =>
    set((state) => {
      // 如果当前在客户工作台的具体客户详情页（view === "home" && selectedWorkspaceCustomerId !== null）
      // 返回上一级优先回到客户工作台首页（全部客户概览），避免跳过首页直接退回核对工作台等外部视图
      if (state.view === "home" && state.selectedWorkspaceCustomerId) {
        const stack = [...state.historyStack];
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          if (last.view === "home" && !last.customerId) {
            stack.pop();
          }
        }
        return {
          selectedWorkspaceCustomerId: null,
          historyStack: stack,
        };
      }

      if (state.historyStack.length === 0) {
        if (state.selectedWorkspaceCustomerId) {
          return { selectedWorkspaceCustomerId: null };
        }
        return { view: "home", selectedWorkspaceCustomerId: null };
      }
      const stack = [...state.historyStack];
      const prev = stack.pop()!;
      return {
        view: prev.view,
        selectedWorkspaceCustomerId: prev.customerId ?? null,
        selectedDraftId:
          prev.draftId !== undefined ? prev.draftId : state.selectedDraftId,
        historyStack: stack,
      };
    }),
  setView: (view) =>
    set((state) => {
      // 1. 如果当前已经在 home，但选了具体客户，点击【客户工作台】导航项应该回到全客户首页看板
      if (state.view === view) {
        if (view === "home" && state.selectedWorkspaceCustomerId) {
          const currentEntry: NavigationEntry = {
            view: state.view,
            customerId: state.selectedWorkspaceCustomerId,
            draftId: state.selectedDraftId,
          };
          return {
            selectedWorkspaceCustomerId: null,
            historyStack: [...state.historyStack, currentEntry].slice(-30),
          };
        }
        return state;
      }
      const currentEntry: NavigationEntry = {
        view: state.view,
        customerId: state.selectedWorkspaceCustomerId,
        draftId: state.selectedDraftId,
      };
      return {
        view,
        // 从其他视图点击进入客户工作台时，重置客户选择，直达全量客户看板（首页）
        ...(view === "home" ? { selectedWorkspaceCustomerId: null } : {}),
        historyStack: [...state.historyStack, currentEntry].slice(-30),
        lastVisitedTaskId:
          view === "workbench" ? state.selectedDraftId : state.lastVisitedTaskId,
      };
    }),
  setLastVisitedPanel: (lastVisitedPanel) => set({ lastVisitedPanel }),
  setIntakeCustomer: (selectedIntakeCustomerId) => set({ selectedIntakeCustomerId }),
  addCustomer: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("客户名称不能为空");
    }
    const existing = get().customers.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      return existing;
    }
    const hexPart = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
    const newCustomer = {
      id: `C-${hexPart}`,
      name: trimmed,
    };
    set((state) => ({
      customers: [newCustomer, ...state.customers],
    }));
    return newCustomer;
  },
  selectDraft: (selectedDraftId) =>
    set((state) => {
      const currentEntry: NavigationEntry = {
        view: state.view,
        customerId: state.selectedWorkspaceCustomerId,
        draftId: state.selectedDraftId,
      };
      return {
        selectedDraftId,
        activeTaskId: selectedDraftId,
        lastVisitedTaskId: selectedDraftId,
        lastVisitedPanel:
          state.lastVisitedTaskId === selectedDraftId
            ? state.lastVisitedPanel
            : "overview",
        view: "workbench",
        historyStack: [...state.historyStack, currentEntry].slice(-30),
      };
    }),
  loadScenario: (scenarioId) => {
    try {
      const restored = buildScenarioState(scenarioId);
      const current = get();
      if (current.scenarioId === "BUSINESS" && scenarioId !== "BUSINESS") set({ savedBusinessWorkspace: workspaceSnapshot(current) });
      set({
        scenarioId,
        activeTaskId: restored.selectedDraftId,
        lastVisitedTaskId: restored.selectedDraftId,
        lastVisitedPanel: "overview",
        scenarioEntry: { scenarioId, restoredAt: now() },
        selectedDraftId: restored.selectedDraftId,
        selectedIntakeCustomerId: null,
        drafts: restored.drafts,
        sources: restored.sources,
        files: restored.files,
        events: [], relations: [], evidence: scenarioId === promptFixture.scenarioId ? initialPromptEvidence() : (scenarioId === "BUSINESS" || scenarioId === "26SHPYD056" ? [...initialPromptEvidence(), ...initialPromptEvidence(puyiFixture)] : []), versions: [], operations: [], finalReconciliations: [],
        pocPhaseTimings: (["查找", "检查", "修改", "返工"] as PocPhase[]).map((phase) => ({ phase, elapsedMs: 0, startedAt: null })),
        parseJobs: [], parseResults: [], parsedFacts: [], convertedEntrustments: [], convertedInspections: [], convertedAuxiliaryMaterials: [], materialBindings: [],
        toast: null,
      });
    } catch (error) {
      set({ toast: error instanceof Error ? error.message : "场景恢复失败" });
    }
  },
  ingestFile: (fileId) => {
    const file = get().files.find((item) => item.id === fileId);
    if (!file) return;
    if (file.source === "本地上传" && file.uploadStatus !== "解析成功") {
      set({ toast: "本地文件已接收，等待解析后才能进入商品池" });
      return;
    }
    const selectedCustomerId = file.customerId ?? get().selectedIntakeCustomerId;
    if (file.materialType === "查货" && !selectedCustomerId) {
      set({ toast: "请先选择查货材料所属客户" });
      return;
    }
    const fileSources = get().sources.filter((source) => source.sourceFileId === fileId);
    if (file.materialType === "查货" && fileSources.some((source) => source.customerId !== null && source.customerId !== selectedCustomerId)) {
      set({ toast: "所选客户与材料基线客户不一致" });
      return;
    }
    set((state) => {
      let sources = state.sources.map((source) => source.sourceFileId === fileId && source.availability === "未加载" ? { ...source, customerId: selectedCustomerId, availability: "可匹配" as const } : source);
      const addedSourceIds = file.duplicate ? [] : sources.filter((source) => source.sourceFileId === fileId && source.availability === "可匹配").map((source) => source.id);
      let drafts = state.drafts;
      let relations = [...state.relations];
      let evidence = [...state.evidence];
      const versions = [...state.versions];
      const operations = [...state.operations];
      const incrementalEvents: UiEvent[] = [];
      if (addedSourceIds.length > 0) {
        for (const currentDraft of drafts.filter((draft) => !draft.finalized && draft.customerId === selectedCustomerId)) {
          if (state.scenarioId === promptFixture.scenarioId && currentDraft.id === promptFixture.draftId) continue;
          const result = reconcileDraftWithInspectionIncrement({
            draft: toDomainDraft(currentDraft), entrustmentLines: currentDraft.lines.map(toDomainLine),
            inspectionSourceLines: sources.filter((source) => source.availability !== "未加载").map(toDomainSource),
            addedSourceLineIds: addedSourceIds, now: now(),
          });
          relations = [...relations, ...result.relations];
          evidence = [...evidence, ...result.evidence];
          if (result.version) versions.push(result.version);
          operations.push(result.operation);
          incrementalEvents.unshift(operationToEvent(result.operation));
          const activeRelations = relations.filter((relation) => relation.active);
          const lines = result.entrustmentLines.map((line) => fromDomainLine(line, currentDraft.lines.find((item) => item.id === line.id)!, activeRelations));
          drafts = drafts.map((draft) => draft.id === currentDraft.id ? { ...draft, lines, version: result.draft.version, status: result.draft.status, hasAiUpdate: result.draft.hasAiUpdate, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : draft);
          const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
          sources = sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source);
        }
      }
      const intakeEvent = { id: `EV-${Date.now()}`, type: "新增查货", summary: file.duplicate ? `记录重复材料 ${file.name}` : `接入 ${file.name}`, time: now() };
      return {
        files: state.files.map((item) => item.id === fileId ? { ...item, loaded: true } : item), sources, drafts, relations, evidence, versions, operations,
        toast: file.duplicate ? "重复材料已记录，商品池未增加" : incrementalEvents.length ? "查货材料已接入，并完成受影响草稿的增量核对" : "查货材料已接入商品池",
        events: [...incrementalEvents, intakeEvent, ...state.events],
      };
    });
  },
  stageLocalFile: ({ name, size, type, file: fileBlob, materialType, customerId, batchId }) => {
    const normalizedName = name.trim();
    const extension = normalizedName.toLowerCase().split(".").pop() ?? "";
    const allowedExtensions = new Set(["pdf", "xlsx", "xls", "jpg", "jpeg", "png"]);
    const maxBytes = 20 * 1024 * 1024;
    if (!normalizedName || !extension || !allowedExtensions.has(extension)) {
      set({ toast: "暂支持 PDF、Excel、JPG、PNG 文件" });
      return;
    }
    if (size <= 0 || size > maxBytes) {
      set({ toast: "文件大小需大于 0 且不超过 20MB" });
      return;
    }
    set((state) => {
      const duplicate = state.files.some((file) => file.name === normalizedName && file.sizeBytes === size);
      const id = `UPLOAD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const staged: UiFile = {
        id,
        name: normalizedName,
        materialType: materialType ?? "待识别",
        loaded: false,
        duplicate,
        source: "本地上传",
        uploadStatus: "待解析",
        sizeBytes: size,
        mimeType: type || undefined,
        customerId,
        batchId,
      };
      const parseJob = createParseJob({ id: `PARSE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sourceFileId: id, now: now() });
      if (fileBlob) localFileBlobs.set(id, fileBlob);
      const event: UiEvent = {
        id: `EV-${Date.now()}`,
        type: "接收本地文件",
        summary: duplicate ? `发现重复文件 ${normalizedName}，等待解析` : `已接收 ${normalizedName}，等待解析`,
        time: now(),
      };
      return {
        files: [staged, ...state.files],
        parseJobs: [parseJob, ...state.parseJobs],
        events: [event, ...state.events],
        toast: duplicate ? "文件已接收，但与现有材料重复" : "文件已接收，等待解析",
      };
    });
  },
  startParse: (fileId) => set((state) => {
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job) return { toast: "找不到解析任务" };
    try {
      const next = startParseJob(job, now());
      return { parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item), files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "解析中" as const } : file), toast: "已开始解析，等待解析器返回结果" };
    } catch (error) { return { toast: error instanceof Error ? error.message : "无法开始解析" }; }
  }),
  recordParseFailure: (fileId, code, message) => set((state) => {
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job) return { toast: "找不到解析任务" };
    try {
      const next = failParseJob(job, { now: now(), code, message });
      return { parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item), files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "解析失败" as const } : file), events: [{ id: `EV-${Date.now()}`, type: "解析失败", summary: `${state.files.find((file) => file.id === fileId)?.name ?? fileId}：${message}`, time: now() }, ...state.events], toast: "解析失败，可重试" };
    } catch (error) { return { toast: error instanceof Error ? error.message : "记录解析失败失败" }; }
  }),
  flagParseReview: (fileId, reason) => set((state) => {
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job) return { toast: "找不到解析任务" };
    try {
      const next = flagParseJobForReview(job, reason, now());
      return { parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item), files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "待人工复核" as const } : file), toast: "已进入人工复核，确认后才能重试" };
    } catch (error) { return { toast: error instanceof Error ? error.message : "无法进入人工复核" }; }
  }),
  resolveParseReview: (fileId) => set((state) => {
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job) return { toast: "找不到解析任务" };
    try {
      const next = resolveParseReviewState(job, now());
      return { parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item), files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "解析失败" as const } : file), toast: "人工复核已确认，可重新解析" };
    } catch (error) { return { toast: error instanceof Error ? error.message : "无法确认人工复核" }; }
  }),
  completeManualParse: (fileId, facts, materialType, customerId) => {
    const state = get();
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job || job.status !== "待人工复核") { set({ toast: "当前材料不在人工复核状态" }); return; }
    const result: ParsedMaterialResult = { jobId: job.id, sourceFileId: fileId, contentSha256: `manual-${fileId}`, batchId: `BATCH-${fileId}`, materialType, customerId, customerResolution: customerId ? "已识别" : "待补客户信息", factCount: facts.length, sourceLocations: facts.map((fact) => fact.sourceLocation.position ?? (fact.sourceLocation.row ? `第 ${fact.sourceLocation.row} 行` : "人工录入")), parsedAt: now() };
    set({ parseJobs: state.parseJobs.map((item) => item.id === job.id ? { ...item, status: "解析中", errorCode: null, errorMessage: null, reviewReason: null, updatedAt: now() } : item), files: state.files.map((file) => file.id === fileId ? { ...file, materialType, customerId: customerId ?? undefined } : file), toast: "人工录入已保存，正在生成事实" });
    get().completeParse(fileId, result, facts);
  },
  completeParse: (fileId, result, facts = []) => {
    let shouldIngestInspection = false;
    set((state) => {
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!job) return { toast: "找不到解析任务" };
    try {
      const next = completeParseJob(job, now());
      if (result.jobId !== job.id || result.factCount <= 0) return { toast: "解析结果无有效事实行，不能进入商品池" };
      const duplicateOf = state.parseResults.find((item) => item.sourceFileId !== fileId && item.contentSha256 === result.contentSha256);
      if (duplicateOf) {
        return {
          parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item),
          parseResults: [...state.parseResults.filter((item) => item.jobId !== result.jobId), result],
          parsedFacts: [...state.parsedFacts.filter((fact) => fact.sourceFileId !== fileId), ...facts.map((fact) => ({ ...fact, jobId: job.id, sourceFileId: fileId }))],
          files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "解析成功" as const, duplicate: true, duplicateOfFileId: duplicateOf.sourceFileId } : file),
          toast: `内容与已有材料重复，未重复生成业务数据（${duplicateOf.sourceFileId}）`,
        };
      }
      const ready = canEnterProductPool(next, result);
      const conversion = result.materialType === "委托书" ? convertEntrustmentFacts({ facts, fileId, contentSha256: result.contentSha256, customerName: result.customerId ? state.customers.find((customer) => customer.id === result.customerId)?.name : null }) : null;
      const inspectionConversion = result.materialType === "查货" ? convertInspectionFacts({ facts, fileId, contentSha256: result.contentSha256, customerId: result.customerId }) : null;
      const auxiliaryConversion = result.materialType === "发票" || result.materialType === "箱单" ? convertAuxiliaryFacts({ facts, fileId, contentSha256: result.contentSha256, materialType: result.materialType, customerId: result.customerId, convertedAt: now() }) : null;
      const conversionWarnings = conversion?.warnings ?? inspectionConversion?.warnings ?? auxiliaryConversion?.warnings ?? [];
      const containsNonTextFacts = facts.some((fact) => Object.keys(fact.fields).some((field) => field !== "rawText"));
      if (containsNonTextFacts && ((conversion && conversion.lines.length === 0) || (inspectionConversion && inspectionConversion.lines.length === 0) || (auxiliaryConversion && auxiliaryConversion.lines.length === 0))) {
        const review = flagParseJobForReview(job, conversionWarnings.join("；") || "解析到了原始事实，但没有识别出可入池的业务商品行", now());
        return {
          parseJobs: state.parseJobs.map((item) => item.id === job.id ? review : item),
          files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "待人工复核" as const } : file),
          parseResults: [...state.parseResults.filter((item) => item.jobId !== result.jobId), result],
          parsedFacts: [...state.parsedFacts.filter((fact) => fact.sourceFileId !== fileId), ...facts.map((fact) => ({ ...fact, jobId: job.id, sourceFileId: fileId }))],
          toast: "解析到了原始事实，但没有生成业务商品行，请人工复核",
        };
      }
      const convertedEntrustments = conversion ? [...state.convertedEntrustments.filter((item) => item.sourceFileId !== fileId), { sourceFileId: fileId, contentSha256: result.contentSha256, customerId: result.customerId, lines: conversion.lines, warnings: conversion.warnings, convertedAt: now() }] : state.convertedEntrustments;
      const convertedInspections = inspectionConversion ? [...state.convertedInspections.filter((item) => item.sourceFileId !== fileId), { sourceFileId: fileId, contentSha256: result.contentSha256, customerId: result.customerId, lines: inspectionConversion.lines, warnings: inspectionConversion.warnings, convertedAt: now() }] : state.convertedInspections;
      const convertedAuxiliaryMaterials = auxiliaryConversion ? [...state.convertedAuxiliaryMaterials.filter((item) => item.sourceFileId !== fileId), auxiliaryConversion] : state.convertedAuxiliaryMaterials;
      const convertedSources = inspectionConversion && result.customerId ? buildPendingInspectionSources({ sourceFileId: fileId, contentSha256: result.contentSha256, customerId: result.customerId, lines: inspectionConversion.lines, warnings: inspectionConversion.warnings, convertedAt: now() }) : [];
      shouldIngestInspection = convertedSources.length > 0 && result.materialType === "查货" && result.customerId !== null;
      const events = conversion ? [{ id: `EV-${Date.now()}`, type: "委托事实转换", summary: `${fileId}：生成 ${conversion.lines.length} 条委托事实行`, time: now() }, ...state.events] : inspectionConversion ? [{ id: `EV-${Date.now()}`, type: "查货事实转换", summary: `${fileId}：生成 ${inspectionConversion.lines.length} 条查货商品行`, time: now() }, ...state.events] : state.events;
      return { parseJobs: state.parseJobs.map((item) => item.id === job.id ? next : item), parseResults: [...state.parseResults.filter((item) => item.jobId !== result.jobId), result], parsedFacts: [...state.parsedFacts.filter((fact) => fact.sourceFileId !== fileId), ...facts.map((fact) => ({ ...fact, jobId: job.id, sourceFileId: fileId }))], convertedEntrustments, convertedInspections, convertedAuxiliaryMaterials, sources: convertedSources.length ? [...state.sources.filter((source) => source.sourceFileId !== fileId), ...convertedSources] : state.sources, events, files: state.files.map((file) => file.id === fileId ? { ...file, uploadStatus: "解析成功" as const, materialType: result.materialType, customerId: result.customerId ?? undefined, contentSha256: result.contentSha256 } : file), toast: ready ? "解析成功，已完成材料事实转换" : "解析成功，请补充材料客户" };
      } catch (error) { return { toast: error instanceof Error ? error.message : "解析完成状态更新失败" }; }
    });
    if (shouldIngestInspection) get().ingestFile(fileId);
  },
  resolveParsedFileCustomer: (fileId, customerId) => {
    let shouldIngestInspection = false;
    set((state) => {
    const customer = state.customers.find((item) => item.id === customerId);
    const result = state.parseResults.find((item) => item.sourceFileId === fileId);
    const job = state.parseJobs.find((item) => item.sourceFileId === fileId);
    if (!customer || !result || !job || job.status !== "解析成功") return { toast: "解析任务或客户不存在，无法补充客户" };
    const resolved: ParsedMaterialResult = { ...result, customerId, customerResolution: "已识别" };
    const convertedEntrustments = state.convertedEntrustments.map((item) => item.sourceFileId === fileId ? { ...item, customerId, lines: item.lines.map((line) => ({ ...line, fields: { ...line.fields, 客户名: customer.name } })) } : item);
    const convertedInspections = state.convertedInspections.map((item) => item.sourceFileId === fileId ? { ...item, customerId, lines: item.lines.map((line) => ({ ...line, customerId })) } : item);
    const convertedAuxiliaryMaterials = state.convertedAuxiliaryMaterials.map((item) => item.sourceFileId === fileId ? { ...item, customerId } : item);
    const inspection = convertedInspections.find((item) => item.sourceFileId === fileId);
    const sources = inspection ? buildPendingInspectionSources({ sourceFileId: fileId, contentSha256: inspection.contentSha256, customerId, lines: inspection.lines, warnings: inspection.warnings, convertedAt: inspection.convertedAt }) : [];
    shouldIngestInspection = sources.length > 0;
    return { files: state.files.map((file) => file.id === fileId ? { ...file, customerId } : file), parseResults: state.parseResults.map((item) => item.jobId === result.jobId ? resolved : item), convertedEntrustments, convertedInspections, convertedAuxiliaryMaterials, sources: sources.length ? [...state.sources.filter((source) => source.sourceFileId !== fileId), ...sources] : state.sources, events: [{ id: `EV-${Date.now()}`, type: "补充材料客户", summary: `${state.files.find((file) => file.id === fileId)?.name ?? fileId}：${customer.name}`, time: now() }, ...state.events], toast: `已补充材料客户：${customer.name}` };
    });
    if (shouldIngestInspection) get().ingestFile(fileId);
  },
  parseLatestLocalFile: async ({ fileId, file }) => {
    const staged = get().files.find((item) => item.source === "本地上传" && item.id === fileId);
    if (!staged) { set({ toast: "找不到刚上传的文件，请重新选择" }); return; }
    get().startParse(staged.id);
    const form = new FormData();
    form.set("file", file);
    form.set("sourceFileId", staged.id);
    if (["委托书", "发票", "箱单", "查货"].includes(staged.materialType)) form.set("materialType", staged.materialType);
    if (staged.customerId) form.set("customerId", staged.customerId);
    try {
      const response = await fetch("/api/parse", { method: "POST", body: form });
      const payload = await response.json() as { adapterId?: string; adapterVersion?: string; sourceFileId?: string; contentSha256?: string; materialType?: ParsedMaterialResult["materialType"] | null; customerId?: string | null; customerResolution?: ParsedMaterialResult["customerResolution"]; facts?: ParsedFactRow[]; warnings?: string[]; errorCode?: string; errorMessage?: string };
      if (!response.ok || payload.errorCode) {
        if (payload.errorCode === "OCR_REQUIRED" || payload.warnings?.includes("OCR_REQUIRED")) { get().flagParseReview(staged.id, payload.errorMessage ?? "扫描 PDF 无可提取文本，需要人工复核或后续 OCR"); return; }
        get().recordParseFailure(staged.id, payload.errorCode ?? "ADAPTER_FAILED", payload.errorMessage ?? "解析器执行失败"); return;
      }
      if (payload.warnings?.includes("OCR_REQUIRED")) { get().flagParseReview(staged.id, "扫描 PDF 无可提取文本，需要人工复核或后续 OCR"); return; }
      if (!payload.materialType || !payload.facts?.length || !payload.sourceFileId || !payload.contentSha256 || !payload.customerResolution) { get().flagParseReview(staged.id, "解析事实或材料类型不完整，需要人工复核"); return; }
      const customerDecision = resolveKnownCustomer({ facts: payload.facts, customers: get().customers, selectedCustomerId: staged.customerId ?? null, materialType: payload.materialType });
      if (customerDecision.status === "客户冲突") { get().flagParseReview(staged.id, customerDecision.reason); return; }
      const customerId = customerDecision.status === "已识别" ? customerDecision.customerId : null;
      const customerResolution = customerDecision.status === "已识别" ? "已识别" as const : "待补客户信息" as const;
      const sourceLocations = payload.facts.map((fact) => fact.sourceLocation?.sheet ? `${fact.sourceLocation.sheet}!R${fact.sourceLocation.row ?? "?"}` : fact.sourceLocation?.page ? `第 ${fact.sourceLocation.page} 页` : fact.sourceLocation?.position ?? "位置未知");
      get().completeParse(staged.id, { jobId: get().parseJobs.find((job) => job.sourceFileId === staged.id)?.id ?? "", sourceFileId: staged.id, contentSha256: payload.contentSha256, batchId: `BATCH-${staged.id}`, materialType: payload.materialType, customerId, customerResolution, factCount: payload.facts.length, sourceLocations, parsedAt: now() }, payload.facts);
    } catch (error) {
      get().recordParseFailure(staged.id, "ADAPTER_FAILED", error instanceof Error ? error.message : "解析请求失败");
    }
  },
  parseLocalFile: async (fileId) => {
    const staged = get().files.find((item) => item.id === fileId);
    const file = localFileBlobs.get(fileId);
    if (!staged || !file) { set({ toast: "当前会话没有可解析的原文件，请重新选择" }); return; }
    await get().parseLatestLocalFile({ fileId: staged.id, file });
  },
  rebindLocalFile: async (fileId, file) => {
    const staged = get().files.find((item) => item.id === fileId && item.source === "本地上传");
    if (!staged) { set({ toast: "找不到需要恢复的本地材料" }); return; }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) { set({ toast: "文件大小需大于 0 且不超过 20MB" }); return; }
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["pdf", "xlsx", "xls", "jpg", "jpeg", "png"].includes(extension)) { set({ toast: "暂支持 PDF、Excel、JPG、PNG 文件" }); return; }
    if (staged.contentSha256 && typeof crypto !== "undefined" && crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== staged.contentSha256) { set({ toast: "重新选择的文件内容与原任务不一致，请选择原文件" }); return; }
    }
    localFileBlobs.set(fileId, file);
    set({ files: get().files.map((item) => item.id === fileId ? { ...item, name: file.name, sizeBytes: file.size, mimeType: file.type || item.mimeType } : item), toast: "原文件已重新绑定，正在恢复解析" });
    await get().parseLatestLocalFile({ fileId, file });
  },
  recoverInterruptedParseJobs: () => set((state) => {
    const interrupted = state.parseJobs.filter((job) => job.status === "解析中");
    if (!interrupted.length) return {};
    const ids = new Set(interrupted.map((job) => job.sourceFileId));
    return {
      parseJobs: state.parseJobs.map((job) => ids.has(job.sourceFileId) ? { ...job, status: "解析失败" as const, errorCode: "INTERRUPTED", errorMessage: "页面刷新中断了解析，请重新选择原文件后重试", updatedAt: now() } : job),
      files: state.files.map((file) => ids.has(file.id) ? { ...file, uploadStatus: "解析失败" as const } : file),
      events: [...interrupted.map((job) => ({ id: `EV-${job.id}-recovered`, type: "解析任务恢复", summary: `${job.sourceFileId}：刷新后恢复为可重试`, time: now() })), ...state.events],
    };
  }),
  togglePocPhase: (phase) => set((state) => {
    const current = state.pocPhaseTimings.find((item) => item.phase === phase);
    const timestamp = now();
    if (!current) return {};
    const next = state.pocPhaseTimings.map((item) => {
      if (item.phase !== phase) return item.startedAt ? { ...item, elapsedMs: item.elapsedMs + Math.max(0, new Date(timestamp).getTime() - new Date(item.startedAt).getTime()), startedAt: null } : item;
      if (!item.startedAt) return { ...item, startedAt: timestamp };
      return { ...item, elapsedMs: item.elapsedMs + Math.max(0, new Date(timestamp).getTime() - new Date(item.startedAt).getTime()), startedAt: null };
    });
    return { pocPhaseTimings: next, toast: current.startedAt ? `已暂停${phase}计时` : `已开始${phase}计时` };
  }),
  createDraft: () => {
    const state = get();
    const recipe = scenariosJson.find((item) => item.id === state.scenarioId);
    const batchIds = recipe?.steps.flatMap((step) => "batchIds" in step && step.action === "新建委托草稿" ? step.batchIds ?? [] : []) ?? [];
    const draftIds = (materialBatchesJson as ScenarioBatch[]).filter(batch => batchIds.includes(batch.id)).flatMap(batch => batch.draftIds);
    const pending = buildScenarioState(state.scenarioId).availableDrafts.find(item => draftIds.includes(item.id) && !state.drafts.some(draft => draft.id === item.id));
    if (pending) {
      get().createDraftFromEntrustmentFile(pending.materialFileIds[0]);
      return;
    }
    const draft = state.drafts.find((item) => !item.customerId && !item.finalized) ?? state.drafts.find((item) => !item.finalized);
    if (!draft) { set({ view: "intake", toast: "请在材料接入中选择委托书生成草稿" }); return; }
    set({ selectedDraftId: draft.id, view: "workbench", toast: `已打开 ${draft.displayNo} 草稿` });
  },
  createDraftFromEntrustmentFile: (fileId) => set((state) => {
    const baseline = buildScenarioState(state.scenarioId).availableDrafts.find(draft => draft.materialFileIds.includes(fileId));
    const converted = state.convertedEntrustments.find((item) => item.sourceFileId === fileId) ?? (baseline ? {
      customerId: baseline.customerId, lines: baseline.lines,
    } : undefined);
    if (!converted || converted.lines.length === 0) return { toast: "没有可生成的委托事实行" };
    if (state.drafts.some((draft) => draft.materialFileIds.includes(fileId))) {
      return { toast: "该委托材料已经生成草稿，不能重复生成" };
    }
    const file = state.files.find((item) => item.id === fileId);
    const customerId = converted.customerId;
    const customerName = state.customers.find((item) => item.id === customerId)?.name ?? "待补客户信息";
    const draftId = baseline?.id ?? `DRAFT-${fileId}`;
    const displayNo = `W${String(state.drafts.length + 1).padStart(3, "0")}`;
    const created = createEntrustmentDraft({
      draftId,
      displayNo,
      recognizedCustomerId: customerId,
      materialFileIds: [fileId],
      lines: converted.lines.map((line) => ({ id: line.id, sourceOrder: line.sourceOrder, fields: line.fields, sourceLocation: line.sourceLocation })),
      createdAt: now(),
    });
    const lines: UiLine[] = created.lines.map((line) => ({
      ...line,
      model: line.fields.型号 ?? "UNKNOWN", brand: line.fields.品牌 ?? "UNKNOWN", origin: line.fields.产地 ?? "UNKNOWN", quantity: line.fields.数量 ?? "UNKNOWN",
      relationSourceId: null, relationSourceIds: [], matchRelationIds: [...line.matchRelationIds], evidenceIds: [...line.evidenceIds], issueIds: [...line.issueIds], updatedFieldNames: [...line.updatedFieldNames], issue: line.issueIds.join("、") || null,
    }));
    const draft: UiDraft = {
      ...created.draft,
      customerName,
      status: created.draft.status,
      version: created.draft.version,
      lines,
      materialFileIds: [...created.draft.materialFileIds],
      finalized: created.draft.isFinalized,
    };
    const event: UiEvent = { id: created.operation.id, type: "新建委托", summary: `${file?.name ?? fileId}：生成 ${lines.length} 条草稿行`, time: now(), draftId };
    setTimeout(() => {
      const s = get();
      if (s.selectedDraftId === draftId && customerId && s.sources.some((src) => src.customerId === customerId && src.availability === "可匹配")) {
        s.matchSelectedDraft();
      }
    }, 10);
    return { files: state.files.map(item => item.id === fileId ? { ...item, loaded: true } : item), drafts: [...state.drafts, draft], selectedDraftId: draftId, view: "workbench", operations: [...state.operations, created.operation], versions: [...state.versions, created.initialVersion], events: [event, ...state.events], toast: `已生成 ${displayNo} 草稿并自动完成AI核对` };
  }),
  bindMaterialToDraft: (fileId, draftId) => set((state) => {
    const file = state.files.find((item) => item.id === fileId);
    const draft = state.drafts.find((item) => item.id === draftId);
    const auxiliary = state.convertedAuxiliaryMaterials.find((item) => item.sourceFileId === fileId);
    if (!file || !draft || !auxiliary) return { toast: "辅助材料尚未解析完成" };
    if (file.materialType !== "发票" && file.materialType !== "箱单") return { toast: "只有发票或箱单可以绑定到草稿" };
    if (draft.finalized) return { toast: "已完成草稿不能绑定新材料" };
    if (state.materialBindings.some((binding) => binding.fileId === fileId)) return { toast: "该材料已经绑定过草稿" };
    if (!auxiliary.customerId || auxiliary.customerId !== draft.customerId) return { toast: "材料客户与草稿客户不一致" };

    const beforeLines = draft.lines;
    const nextEvidence: FieldEvidence[] = [];
    const lines = draft.lines.map((line) => {
      const lineKey = auxiliaryMatchKey(line.fields);
      const match = auxiliary.lines.find((candidate) => lineKey !== null && auxiliaryMatchKey(candidate.fields) === lineKey);
      if (!match) return line;
      const issueIds = [...line.issueIds];
      const evidenceIds = [...line.evidenceIds];
      for (const field of auxiliaryEvidenceFields) {
        const candidateValue = auxiliaryFieldValue(match, field);
        if (candidateValue === null || candidateValue.trim() === "" || candidateValue === "UNKNOWN") continue;
        const originalValue = line.fields[field];
        const hasConflict = originalValue !== null && originalValue.trim() !== "" && originalValue !== "UNKNOWN" && originalValue !== candidateValue;
        if (hasConflict) issueIds.push(`字段冲突:${field}`);
        const evidenceId = `FE-${draft.id}-${line.id}-${fileId}-${field}`;
        evidenceIds.push(evidenceId);
        nextEvidence.push({ id: evidenceId, draftId: draft.id, entrustmentLineId: line.id, field, currentValue: originalValue, originalValue, sourceMaterialType: file.materialType as "发票" | "箱单", sourceFileId: fileId, sourceLocation: match.sourceLocation, sourceInspectionLineId: null, isAiUpdated: false, isManuallyEdited: false, hadConflict: hasConflict, candidateValues: [candidateValue] });
      }
      return { ...line, issueIds: [...new Set(issueIds)], evidenceIds: [...new Set(evidenceIds)], issue: [...new Set(issueIds)].join("、") || null };
    });
    const changed = lines.some((line, index) => JSON.stringify(line.issueIds) !== JSON.stringify(beforeLines[index]?.issueIds) || line.evidenceIds.length !== (beforeLines[index]?.evidenceIds.length ?? 0));
    const changedLineIds = lines.filter((line, index) => JSON.stringify(line.issueIds) !== JSON.stringify(beforeLines[index]?.issueIds) || line.evidenceIds.length !== (beforeLines[index]?.evidenceIds.length ?? 0)).map((line) => line.id);
    const operation: OperationRecord = { id: `OP-${draft.id}-bind-${fileId}`, operationType: "更新委托资料", actorType: "人工操作", customerId: draft.customerId, draftId: draft.id, affectedEntrustmentLineIds: changedLineIds, affectedInspectionSourceLineIds: [], summary: changed ? `绑定${file.materialType} ${file.name}，发现 ${nextEvidence.filter((item) => item.hadConflict).length} 项字段冲突` : `绑定${file.materialType} ${file.name}，未发现可比对字段`, occurredAt: now() };
    const binding: MaterialBinding = { fileId, draftId, role: "辅助材料", boundAt: now() };
    const updatedDraft = { ...draft, lines, materialFileIds: [...new Set([...draft.materialFileIds, fileId])], version: changed ? draft.version + 1 : draft.version, lastUpdateReason: "绑定辅助材料", updatedAt: now() };
    const version = changed ? { id: `DV-${draft.id}-${draft.version + 1}-auxiliary`, draftId: draft.id, version: draft.version + 1, triggerReason: "绑定辅助材料", materialBatchIds: file.batchId ? [file.batchId] : [], changedLineIds, before: beforeLines.filter((line) => changedLineIds.includes(line.id)).map((line) => ({ entrustmentLineId: line.id, fields: line.fields, status: line.status, matchRelationIds: line.matchRelationIds })), after: lines.filter((line) => changedLineIds.includes(line.id)).map((line) => ({ entrustmentLineId: line.id, fields: line.fields, status: line.status, matchRelationIds: line.matchRelationIds })), addedRelationIds: [], invalidatedRelationIds: [], actorType: "人工操作" as const, createdAt: now() } : null;
    return { drafts: state.drafts.map((item) => item.id === draftId ? updatedDraft : item), materialBindings: [...state.materialBindings, binding], evidence: [...state.evidence, ...nextEvidence], operations: [...state.operations, operation], versions: version ? [...state.versions, version] : state.versions, events: [operationToEvent(operation), ...state.events], toast: changed ? "辅助材料已绑定，并标记字段冲突" : "辅助材料已绑定" };
  }),
  reviseDraftWithEntrustmentFile: (fileId, draftId) => set((state) => {
    const converted = state.convertedEntrustments.find((item) => item.sourceFileId === fileId);
    const draft = state.drafts.find((item) => item.id === draftId);
    if (!converted || !draft) return { toast: "修订材料或目标草稿不存在" };
    if (state.scenarioId === promptFixture.scenarioId) return {toast: "真实 Prompt 场景的新委托请新建草稿；原始基准不覆盖"};
    if (draft.finalized) return { toast: "已完成草稿不能更新委托资料" };
    if (converted.lines.length !== draft.lines.length) return { toast: "修订材料商品行数量变化，请先人工确认行对应关系" };
    const updatedLines = draft.lines.map((line, index) => ({ ...toDomainLine(line), fields: converted.lines[index].fields, sourceLocation: converted.lines[index].sourceLocation }));
    try {
      const result = updateEntrustmentDraftMaterial({ draft: toDomainDraft(draft), currentLines: draft.lines.map(toDomainLine), updatedLines, inspectionSourceLines: state.sources.map(toDomainSource), activeRelations: state.relations.filter((relation) => relation.active), materialBatchId: state.files.find((file) => file.id === fileId)?.batchId, now: now() });
      const activeRelations = [...state.relations.filter((relation) => !result.invalidatedRelations.some((item) => item.id === relation.id)), ...result.invalidatedRelations, ...result.relations];
      const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, activeRelations.filter((relation) => relation.active)));
      const updatedDraft: UiDraft = { ...draft, lines, materialFileIds: [...new Set([...draft.materialFileIds, fileId])], version: result.draft.version, status: result.draft.status, hasAiUpdate: result.draft.hasAiUpdate, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt };
      const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
      const operation = result.operation;
      return { drafts: state.drafts.map((item) => item.id === draftId ? updatedDraft : item), sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source), relations: activeRelations, operations: [...state.operations, operation], versions: result.version ? [...state.versions, result.version] : state.versions, events: [operationToEvent(operation), ...state.events], materialBindings: [...state.materialBindings, { fileId, draftId, role: "主委托" as const, boundAt: now() }], toast: result.version ? "修订材料已更新草稿并重新核对受影响行" : "修订材料检查完成，结果未变化" };
    } catch (error) { return { toast: error instanceof Error ? error.message : "更新委托资料失败" }; }
  }),
  matchSelectedDraft: () => {
    const { selectedDraftId } = get();
    if (!selectedDraftId) return;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft || !draft.customerId || draft.finalized) return { toast: "客户未确定或草稿已完成，不能匹配" };
      let result;
      try {
        const fixture = getPromptFixture(draft.id, state.scenarioId);
        const isReplay = (state.scenarioId === fixture.scenarioId && draft.id === fixture.draftId) || draft.id === puyiFixture.draftId;
        result = (isReplay ? ((input: any) => replayPromptResult(input, fixture)) : executeInitialMatching)({
          draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine),
          inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource), now: now(),
        });
      } catch (error) { return {toast: error instanceof Error ? error.message : "模型记录应用失败"}; }
      const allRelations = [...state.relations, ...result.relations];
      const relationByLine = new Map(allRelations.filter((relation) => relation.active).map((relation) => [relation.entrustmentLineId, relation]));
      const lines = result.entrustmentLines.map((line) => {
        const relation = relationByLine.get(line.id);
        return {
          ...draft.lines.find((item) => item.id === line.id)!, ...line,
          model: line.fields.型号 ?? "UNKNOWN", brand: line.fields.品牌 ?? "UNKNOWN",
          origin: line.fields.产地 ?? "UNKNOWN", quantity: line.fields.数量 ?? "UNKNOWN",
          relationSourceId: relation?.inspectionSourceLineIds[0] ?? null,
          relationSourceIds: relation ? [...relation.inspectionSourceLineIds] : [],
          matchRelationIds: [...line.matchRelationIds], evidenceIds: [...line.evidenceIds],
          issueIds: [...line.issueIds], updatedFieldNames: [...line.updatedFieldNames],
          issue: line.issueIds.join("、") || null,
        };
      });
      const changed = result.operations.length > 0;
      const updatedDraft: UiDraft = {
        ...draft, lines, version: result.draft.version, status: result.draft.status,
        hasAiUpdate: result.draft.hasAiUpdate, lastUpdateReason: result.draft.lastUpdateReason,
        updatedAt: result.draft.updatedAt,
      };
      const updatedSourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
      return {
        sources: state.sources.map((source) => updatedSourceById.has(source.id) ? fromDomainSource(updatedSourceById.get(source.id)!, source) : source),
        drafts: state.drafts.map((item) => item.id === draft.id ? updatedDraft : item),
        toast: changed ? `${draft.displayNo} 已完成首次匹配` : "检查完成，没有新的匹配结果",
        relations: allRelations, evidence: [...state.evidence, ...result.evidence],
        versions: [...state.versions, ...result.versions], operations: [...state.operations, ...result.operations],
        events: [...result.operations.map(operationToEvent).reverse(), ...state.events],
      };
    });
  },
  selectLineSource: (lineId, sourceId) => {
    const { selectedDraftId } = get();
    if (!selectedDraftId) return;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      const source = state.sources.find((item) => item.id === sourceId);
      if (!draft || !source || source.availability !== "可匹配") return { toast: "该查货行已不可匹配" };
      if (!draft.customerId || source.customerId !== draft.customerId) return { toast: "客户不一致，禁止选择候选" };
      let result;
      try {
        result = selectMatchCandidate({
          draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine),
          inspectionSourceLines: state.sources.filter((item) => item.availability !== "未加载").map(toDomainSource),
          entrustmentLineId: lineId, candidateSourceLineId: sourceId, now: now(),
        });
      } catch (error) {
        return { toast: error instanceof Error ? error.message : "候选选择失败" };
      }
      const relationByLine = new Map([...state.relations, result.relation].filter((relation) => relation.active).map((relation) => [relation.entrustmentLineId, relation]));
      const lines = result.entrustmentLines.map((line) => {
        const relation = relationByLine.get(line.id);
        return { ...draft.lines.find((item) => item.id === line.id)!, ...line, model: line.fields.型号 ?? "UNKNOWN", brand: line.fields.品牌 ?? "UNKNOWN", origin: line.fields.产地 ?? "UNKNOWN", quantity: line.fields.数量 ?? "UNKNOWN", relationSourceId: relation?.inspectionSourceLineIds[0] ?? null, relationSourceIds: relation ? [...relation.inspectionSourceLineIds] : [], matchRelationIds: [...line.matchRelationIds], evidenceIds: [...line.evidenceIds], issueIds: [...line.issueIds], updatedFieldNames: [...line.updatedFieldNames], issue: line.issueIds.join("、") || null };
      });
      const sourceById = new Map(result.inspectionSourceLines.map((item) => [item.id, item]));
      return {
        drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
        sources: state.sources.map((item) => sourceById.has(item.id) ? fromDomainSource(sourceById.get(item.id)!, item) : item),
        toast: "已选择查货候选",
        relations: [...state.relations, result.relation], evidence: [...state.evidence, ...result.evidence],
        versions: [...state.versions, result.version], operations: [...state.operations, result.operation],
        events: [operationToEvent(result.operation), ...state.events],
      };
    });
  },
  resolveSelectedDraftCustomer: (customerId) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      try {
        const result = resolveDraftCustomer({
          draft: toDomainDraft(draft), lines: draft.lines.map(toDomainLine), customerId,
          knownCustomerIds: state.customers.map((customer) => customer.id), now: now(),
        });
        const customerName = state.customers.find((customer) => customer.id === customerId)?.name ?? customerId;
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? {
            ...item, customerId: result.draft.customerId, customerName,
            customerStatus: result.draft.customerStatus, status: result.draft.status,
            version: result.draft.version, lastUpdateReason: result.draft.lastUpdateReason,
            updatedAt: result.draft.updatedAt,
          } : item),
          operations: [...state.operations, result.operation],
          versions: [...state.versions, result.version],
          events: [operationToEvent(result.operation), ...state.events],
          toast: `已补充客户：${customerName}`,
        };
      } catch (error) {
        return { toast: error instanceof Error ? error.message : "补充客户失败" };
      }
    });
  },
  editSelectedLineField: (lineId, field, value, review) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      try {
        const result = editDraftField({
          review,
          draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine),
          entrustmentLineId: lineId, field, value,
          sourceFileId: "MANUAL-INPUT", sourceLocation: { fileId: "MANUAL-INPUT", page: null, sheet: null, position: "工作台人工输入" }, now: now(),
        });
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, state.relations));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          evidence: [...state.evidence, result.evidence], versions: [...state.versions, result.version], operations: [...state.operations, result.operation],
          events: [operationToEvent(result.operation), ...state.events], toast: `已保存 ${field}`,
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "字段保存失败" }; }
    });
  },
  confirmSelectedLineField: (lineId, field) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      const currentLine = draft?.lines.find((item) => item.id === lineId);
      if (!draft || !currentLine) return { toast: "商品行不存在" };
      try {
        const result = editDraftField({
          draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), entrustmentLineId: lineId,
          field, value: currentLine.fields[field], resolveConflict: true,
          sourceFileId: "MANUAL-CONFIRM", sourceLocation: { fileId: "MANUAL-CONFIRM", page: null, sheet: null, position: "人工确认保留委托值" }, now: now(),
        });
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, state.relations));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          evidence: [...state.evidence, result.evidence], versions: [...state.versions, result.version], operations: [...state.operations, result.operation], events: [operationToEvent(result.operation), ...state.events], toast: `已确认保留委托值：${field}`,
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "冲突确认失败" }; }
    });
  },
  unbindSelectedLine: (lineId) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      const relation = state.relations.find((item) => item.active && item.entrustmentLineId === lineId && item.draftId === selectedDraftId);
      if (!draft || !relation) return { toast: "当前商品行没有可解绑关系" };
      try {
        const result = unbindMatch({ draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource), relation, now: now() });
        const relations = state.relations.map((item) => item.id === relation.id ? result.relation : item);
        let lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, relations));
        if (relation.modelCoverage) {
          lines = lines.map(line => {
            if (line.id !== lineId || !line.baseValues) return line;
            const fields = {...line.fields};
            const invalidIds = state.evidence.filter(e => e.entrustmentLineId === lineId && e.modelDecision).map(e => e.id);
            for (const field of line.updatedFieldNames) {
              const latest = state.evidence.filter(e => e.entrustmentLineId === lineId && e.field === field).at(-1);
              if (latest?.modelDecision && latest.isAiUpdated) fields[field] = line.baseValues[field];
            }
            return {...line, fields, evidenceIds:line.evidenceIds.filter(id=>!invalidIds.includes(id)),updatedFieldNames:line.updatedFieldNames.filter(field=>state.evidence.filter(e=>e.entrustmentLineId===lineId && e.field===field).at(-1)?.isManuallyEdited),model:fields.型号??"UNKNOWN",origin:fields.产地??"UNKNOWN",quantity:fields.数量??"UNKNOWN"};
          });
        }
        const version = {...result.version, after: result.version.after.map(snapshot => {
          const line = lines.find(l=>l.id===snapshot.entrustmentLineId)!;
          return {...snapshot,fields:{...line.fields}};
        })};
        const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source),
          relations, versions: [...state.versions, version], operations: [...state.operations, result.operation], events: [operationToEvent(result.operation), ...state.events], toast: "已解除匹配并释放查货商品",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "解绑失败" }; }
    });
  },
  reassignSelectedLine: (lineId, sourceId) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      const relation = state.relations.find((item) => item.active && item.entrustmentLineId === lineId && item.draftId === selectedDraftId);
      if (!draft || !relation) return { toast: "当前商品行没有可改配关系" };
      try {
        const result = reassignMatch({ draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource), relation, newInspectionSourceLineId: sourceId, now: now() });
        const relations = [...state.relations.map((item) => item.id === relation.id ? result.oldRelation : item), result.newRelation];
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, relations));
        const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source),
          relations, evidence: [...state.evidence, ...result.evidence], versions: [...state.versions, result.version], operations: [...state.operations, result.operation], events: [operationToEvent(result.operation), ...state.events], toast: "已完成改配",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "改配失败" }; }
    });
  },
  establishCompositeForLine: (lineId, sourceIds) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      try {
        const result = establishManualCompositeMatch({ draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource), entrustmentLineId: lineId, sourceLineIds: sourceIds, now: now() });
        const relations = [...state.relations, result.relation];
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, relations));
        const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source),
          relations, evidence: [...state.evidence, ...result.evidence], versions: [...state.versions, result.version], operations: [...state.operations, result.operation], events: [operationToEvent(result.operation), ...state.events], toast: `已组合 ${sourceIds.length} 条查货原始行`,
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "组合关系建立失败" }; }
    });
  },
  updateSelectedDraftMaterial: (lineId, field, value) => {
    const selectedDraftId = get().selectedDraftId;
    set((state) => {
      if (state.scenarioId === promptFixture.scenarioId) return {toast: "真实 Prompt 场景请使用人工字段编辑；原始委托基准不覆盖"};
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      const updatedLines = draft.lines.map((line) => line.id === lineId ? toDomainLine({ ...line, fields: { ...line.fields, [field]: value } as FinalOutputRow }) : toDomainLine(line));
      try {
        const result = updateEntrustmentDraftMaterial({
          draft: toDomainDraft(draft), currentLines: draft.lines.map(toDomainLine), updatedLines,
          inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource),
          activeRelations: state.relations.filter((relation) => relation.active && relation.draftId === draft.id), now: now(),
        });
        const invalidatedById = new Map(result.invalidatedRelations.map((relation) => [relation.id, relation]));
        const relations = [...state.relations.map((relation) => invalidatedById.get(relation.id) ?? relation), ...result.relations];
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, relations));
        const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, hasAiUpdate: result.draft.hasAiUpdate, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source),
          relations, versions: result.version ? [...state.versions, result.version] : state.versions,
          operations: [...state.operations, result.operation], events: [operationToEvent(result.operation), ...state.events], toast: result.version ? "委托资料已更新，仅重算变化行" : "委托资料检查完成，结果无变化",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "委托资料更新失败" }; }
    });
  },
  submitSelectedDraft: () => {
    const { selectedDraftId } = get();
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return {};
      try {
        const result = submitDraftForManualConfirmation({ draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), now: now() });
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, status: result.draft.status, version: result.draft.version, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          operations: [...state.operations, result.operation], versions: [...state.versions, result.version],
          events: [operationToEvent(result.operation), ...state.events], toast: "已进入人工确认",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "提交人工确认失败" }; }
    });
  },
  revertDraftToReview: () => {
    const { selectedDraftId } = get();
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return {};
      if (draft.status !== "人工确认中") return { toast: "当前草稿不处于人工确认状态" };
      try {
        const newStatus = deriveDraftStatus({
          customerId: draft.customerId,
          lineStatuses: draft.lines.map((l) => l.status as any),
          activeMatchRelationCounts: draft.lines.map((l) => l.relationSourceIds.length),
          submittedForManualConfirmation: false,
          isFinalized: false,
          currentStatus: "部分核对",
        });
        const nextVersion = draft.version + 1;
        const newDraft: UiDraft = {
          ...draft,
          status: newStatus,
          version: nextVersion,
          lastUpdateReason: "退回修改（返回上一步）",
          updatedAt: now(),
        };
        const operation: OperationRecord = {
          id: `OP-${draft.id}-${nextVersion}-revert-review`,
          operationType: "草稿版本变化",
          actorType: "人工操作",
          customerId: draft.customerId,
          draftId: draft.id,
          affectedEntrustmentLineIds: draft.lines.map((line) => line.id),
          affectedInspectionSourceLineIds: [],
          summary: "撤销人工确认状态，退回工作台重新核对与修改",
          occurredAt: now(),
        };
        return {
          drafts: state.drafts.map((item) => (item.id === draft.id ? newDraft : item)),
          operations: [...state.operations, operation],
          events: [operationToEvent(operation), ...state.events],
          toast: "已退回核对与修改状态",
        };
      } catch (error) {
        return { toast: error instanceof Error ? error.message : "退回修改失败" };
      }
    });
  },
  confirmLine: (lineId) => {
    const { selectedDraftId } = get();
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      try {
        const result = confirmDraftLine({ draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine), entrustmentLineId: lineId, now: now() });
        const lines = result.entrustmentLines.map((line) => fromDomainLine(line, draft.lines.find((item) => item.id === line.id)!, state.relations));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, lines, version: result.draft.version, status: result.draft.status, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          operations: [...state.operations, result.operation], versions: [...state.versions, result.version], events: [operationToEvent(result.operation), ...state.events], toast: "商品行已确认",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "商品行确认失败" }; }
    });
  },
  unconfirmLine: (lineId) => {
    const { selectedDraftId } = get();
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return { toast: "请先选择委托草稿" };
      const lines = draft.lines.map((l) => l.id === lineId ? { ...l, manuallyConfirmed: false } : l);
      return {
        drafts: state.drafts.map((d) => d.id === draft.id ? { ...d, lines } : d),
        toast: "已取消商品行的人工确认",
      };
    });
  },
  completeSelectedDraft: () => {
    const { selectedDraftId } = get();
    set((state) => {
      const draft = state.drafts.find((item) => item.id === selectedDraftId);
      if (!draft) return {};
      try {
        const result = completeDraft({
          draft: toDomainDraft(draft), entrustmentLines: draft.lines.map(toDomainLine),
          inspectionSourceLines: state.sources.filter((source) => source.availability !== "未加载").map(toDomainSource),
          activeRelations: state.relations.filter((relation) => relation.active && relation.draftId === draft.id),
          finalEvidenceIds: [...new Set(draft.lines.flatMap(line => line.evidenceIds))],
          manualChangeRecordIds: state.operations.filter((item) => item.draftId === draft.id && item.actorType === "人工操作").map((item) => item.id),
          confirmedBy: "演示用户", now: now(),
        });
        const sourceById = new Map(result.inspectionSourceLines.map((source) => [source.id, source]));
        return {
          drafts: state.drafts.map((item) => item.id === draft.id ? { ...item, status: result.draft.status, finalized: result.draft.isFinalized, finalReconciliationId: result.draft.finalReconciliationId, version: result.draft.version, lastUpdateReason: result.draft.lastUpdateReason, updatedAt: result.draft.updatedAt } : item),
          sources: state.sources.map((source) => sourceById.has(source.id) ? fromDomainSource(sourceById.get(source.id)!, source) : source),
          finalReconciliations: [...state.finalReconciliations, result.finalReconciliation],
          operations: [...state.operations, ...result.operations], versions: [...state.versions, result.version], events: [...result.operations.map(operationToEvent).reverse(), ...state.events], toast: "已确认完成，最终核对单已生成",
        };
      } catch (error) { return { toast: error instanceof Error ? error.message : "确认完成失败" }; }
    });
  },
  clearToast: () => set({ toast: null }),
}), {
  name: "jiuli-demo-workspace-v1",
  version: 4,
  migrate: (persisted): DemoState => {
    const previous = persisted as Partial<DemoState>;
    // 强制使用最新的真实业务样本整单体系
    const business = buildBusinessWorkspace();
    return { ...previous, scenarioId: "BUSINESS", view: "home", drafts: business.drafts, sources: business.sources, files: business.files,
      selectedDraftId: business.selectedDraftId, activeTaskId: business.selectedDraftId, lastVisitedTaskId: business.selectedDraftId, lastVisitedPanel: "overview",
      scenarioEntry: { scenarioId: "BUSINESS", restoredAt: baselineTime },
      events: [], relations: [], evidence: [], versions: [], operations: [], finalReconciliations: [],
      parseJobs: [], parseResults: [], parsedFacts: [], convertedEntrustments: [], convertedInspections: [], convertedAuxiliaryMaterials: [], materialBindings: [],
      savedBusinessWorkspace: null, previousScenarioWorkspace: workspaceSnapshot(previous),
    } as DemoState;
  },
  storage: createJSONStorage(() => typeof window === "undefined" ? memoryStorage : window.localStorage),
  onRehydrateStorage: () => (state) => {
    if (state) {
      const fixedDrafts = state.drafts.map((d) => {
        const real = DRAFT_SAMPLE_DISPLAY_MAP[d.id];
        if (real && d.displayNo !== real) {
          return { ...d, displayNo: real };
        }
        return d;
      });
      const hasOldW = state.drafts.some((d) => d.displayNo.match(/^W\d{3}$/));
      if (hasOldW) {
        useDemoStore.setState({ drafts: fixedDrafts });
      }
      state.recoverInterruptedParseJobs();
    }
  },
}));

let syncingTaskSnapshot = false;

useDemoStore.subscribe((state) => {
  if (syncingTaskSnapshot) return;
  const activeTaskId = state.selectedDraftId;
  const draft = state.drafts.find((item) => item.id === activeTaskId);
  const snapshot = buildTaskSnapshot(draft, state.files);
  const lastVisitedTaskId =
    state.view === "workbench" ? activeTaskId : state.lastVisitedTaskId;
  const unchanged =
    state.activeTaskId === activeTaskId &&
    state.lastVisitedTaskId === lastVisitedTaskId &&
    state.taskStage === snapshot.taskStage &&
    JSON.stringify(state.taskIssues) === JSON.stringify(snapshot.taskIssues) &&
    JSON.stringify(state.taskProgress) === JSON.stringify(snapshot.taskProgress);
  if (unchanged) return;

  syncingTaskSnapshot = true;
  useDemoStore.setState({
    activeTaskId,
    lastVisitedTaskId,
    ...snapshot,
  });
  syncingTaskSnapshot = false;
});
