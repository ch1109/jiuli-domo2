/**
 * 九立 Demo 的领域类型入口。
 *
 * 这里集中定义业务对象、25 列输出契约和三套业务状态。页面与业务动作
 * 应引用这些类型，不自行声明同名状态或字段。
 */

export type EntityId = string;
export type CustomerId = EntityId;
export type MaterialBatchId = EntityId;
export type SourceFileId = EntityId;
export type LogicalInspectionOrderId = EntityId;
export type InspectionSourceLineId = EntityId;
export type InspectionMergedProductId = EntityId;
export type DraftId = EntityId;
export type EntrustmentLineId = EntityId;
export type FieldEvidenceId = EntityId;
export type MatchRelationId = EntityId;
export type DraftVersionId = EntityId;
export type OperationRecordId = EntityId;
export type FinalReconciliationId = EntityId;
export type IsoDateTime = string;

/**
 * UNKNOWN 是来源事实的合法字符串，不表示数字 0；null 表示该字段没有值。
 * 数字字段在领域层保留字符串，避免在未定义规则前丢失原始精度和来源格式。
 */
export type FieldValue = string | null;

export const FINAL_OUTPUT_FIELDS = [
  "客户名",
  "品牌",
  "型号",
  "商品描述",
  "品名",
  "产地",
  "单位",
  "数量",
  "报关单价",
  "总价",
  "币种",
  "件数",
  "净重",
  "毛重",
  "sku",
  "对应的采购",
  "供应商号码",
  "供应商",
  "期票天数",
  "采购订单号",
  "物料号码",
  "托盘数",
  "入仓号",
  "产线",
  "备注",
] as const;

export type FinalOutputField = (typeof FINAL_OUTPUT_FIELDS)[number];
export type FinalOutputRow = Record<FinalOutputField, FieldValue>;

export const REQUIRED_FINAL_OUTPUT_FIELDS = [
  "客户名",
  "品牌",
  "型号",
  "品名",
  "产地",
  "单位",
  "数量",
  "报关单价",
  "总价",
  "币种",
  "件数",
  "净重",
  "毛重",
] as const satisfies readonly FinalOutputField[];

export const FINAL_OUTPUT_TOTAL_FIELDS = ["数量", "件数", "净重", "毛重"] as const satisfies readonly FinalOutputField[];

export const DRAFT_STATUSES = [
  "待核对",
  "部分核对",
  "可提交人工确认",
  "人工确认中",
  "已完成",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const ENTRUSTMENT_LINE_STATUSES = [
  "暂无查货依据",
  "已找到查货依据",
  "待人工处理",
  "人工已确认",
] as const;
export type EntrustmentLineStatus = (typeof ENTRUSTMENT_LINE_STATUSES)[number];

export const INSPECTION_SOURCE_LINE_STATUSES = ["可匹配", "草稿占用", "已核销"] as const;
export type InspectionSourceLineStatus = (typeof INSPECTION_SOURCE_LINE_STATUSES)[number];

export const CUSTOMER_RESOLUTION_STATUSES = ["已识别", "待补客户信息"] as const;
export type CustomerResolutionStatus = (typeof CUSTOMER_RESOLUTION_STATUSES)[number];

export const MATERIAL_BATCH_KINDS = ["委托", "查货"] as const;
export type MaterialBatchKind = (typeof MATERIAL_BATCH_KINDS)[number];

export const FILE_TYPES = ["pdf", "xlsx", "xls", "jpg", "png", "other"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const MATERIAL_TYPES = ["委托书", "发票", "箱单", "查货"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATCH_ESTABLISHMENT_METHODS = ["AI", "人工"] as const;
export type MatchEstablishmentMethod = (typeof MATCH_ESTABLISHMENT_METHODS)[number];

export const OPERATION_TYPES = [
  "新增查货",
  "新建委托",
  "补充客户信息",
  "更新委托资料",
  "AI 首次匹配",
  "增量核对",
  "人工编辑字段",
  "选择候选",
  "人工建立关系",
  "人工改配",
  "解除匹配",
  "提交人工确认",
  "确认完成",
  "查货商品核销",
  "草稿版本变化",
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const ACTOR_TYPES = ["系统自动", "人工操作"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface SourceLocation {
  readonly row?: number | null;
  readonly column?: string | null;
  readonly rawText?: string;
  readonly bounds?: readonly [number, number, number, number];
  readonly fileId: SourceFileId;
  readonly page: number | null;
  readonly sheet: string | null;
  readonly position: string | null;
}

export interface SourcePageRange {
  readonly start: number;
  readonly end: number;
}

export interface Customer {
  readonly id: CustomerId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly createdAt: IsoDateTime;
}

export interface MaterialBatch {
  readonly id: MaterialBatchId;
  readonly kind: MaterialBatchKind;
  readonly customerId: CustomerId | null;
  readonly createdAt: IsoDateTime;
  readonly sourceFileIds: readonly SourceFileId[];
  readonly isDraftUpdate: boolean;
  readonly targetDraftId: DraftId | null;
}

export interface SourceFile {
  readonly id: SourceFileId;
  readonly batchId: MaterialBatchId;
  readonly fileName: string;
  readonly fileType: FileType;
  readonly materialType: MaterialType;
  readonly sha256: string | null;
  readonly contentFingerprint: string | null;
  readonly pageCount: number | null;
  readonly source: string;
  readonly isDuplicate: boolean;
  readonly duplicateOfFileId: SourceFileId | null;
  readonly createdAt: IsoDateTime;
}

export interface LogicalInspectionOrder {
  readonly id: LogicalInspectionOrderId;
  readonly customerId: CustomerId | null;
  readonly sourceFileId: SourceFileId;
  readonly warehouseNo: string | null;
  readonly sourcePageRange: SourcePageRange | null;
  readonly sourceLineIds: readonly InspectionSourceLineId[];
  readonly createdAt: IsoDateTime;
}

export interface InspectionSourceFields {
  readonly 品牌: FieldValue;
  readonly 型号: FieldValue;
  readonly 产地: FieldValue;
  readonly 数量: FieldValue;
  readonly 单位: FieldValue;
  readonly 件数: FieldValue;
  readonly 净重: FieldValue;
  readonly 毛重: FieldValue;
}

export interface InspectionSourceLine {
  readonly id: InspectionSourceLineId;
  readonly customerId: CustomerId | null;
  readonly logicalInspectionOrderId: LogicalInspectionOrderId;
  readonly sourceFileId: SourceFileId;
  readonly sourceLocation: SourceLocation;
  readonly fields: InspectionSourceFields;
  readonly otherFields: Readonly<Record<string, FieldValue>>;
  readonly status: InspectionSourceLineStatus;
  readonly occupiedDraftId: DraftId | null;
  readonly occupiedEntrustmentLineId: EntrustmentLineId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type InspectionMergeField = keyof InspectionSourceFields;

export interface InspectionMergedProduct {
  readonly id: InspectionMergedProductId;
  readonly customerId: CustomerId | null;
  readonly logicalInspectionOrderId: LogicalInspectionOrderId;
  readonly mergeKey: Pick<InspectionSourceFields, "品牌" | "型号" | "产地">;
  readonly fields: InspectionSourceFields;
  readonly otherFields: Readonly<Record<string, FieldValue>>;
  readonly sourceLineIds: readonly InspectionSourceLineId[];
  readonly conflictingFields: Readonly<Partial<Record<InspectionMergeField, readonly FieldValue[]>>>;
  readonly conflictingOtherFields: Readonly<Record<string, readonly FieldValue[]>>;
  readonly aggregationWarnings: readonly string[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface EntrustmentDraft {
  readonly id: DraftId;
  readonly displayNo: string;
  readonly customerId: CustomerId | null;
  readonly customerStatus: CustomerResolutionStatus;
  readonly version: number;
  readonly status: DraftStatus;
  readonly lineIds: readonly EntrustmentLineId[];
  readonly materialFileIds: readonly SourceFileId[];
  readonly hasAiUpdate: boolean;
  readonly lastUpdateReason: string | null;
  readonly isFinalized: boolean;
  readonly finalReconciliationId: FinalReconciliationId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface EntrustmentLine {
  readonly lockedFields?: readonly FinalOutputField[];
  readonly id: EntrustmentLineId;
  readonly draftId: DraftId;
  readonly sourceOrder: number;
  readonly fields: FinalOutputRow;
  readonly status: EntrustmentLineStatus;
  readonly matchRelationIds: readonly MatchRelationId[];
  readonly evidenceIds: readonly FieldEvidenceId[];
  readonly issueIds: readonly string[];
  readonly updatedFieldNames: readonly FinalOutputField[];
  readonly manuallyConfirmed: boolean;
  readonly sourceLocation: SourceLocation | null;
}

export interface FieldEvidence {
  readonly references?: readonly { key: string; location: SourceLocation; rawValue: FieldValue; normalizedValue: FieldValue; sourceKind?: string }[];
  readonly review?: { actor: string; reason: string; occurredAt: string; sourceEvidenceId?: string; locked: boolean };
  readonly modelAuditId?: string;
  readonly modelDecision?: {
    readonly field: string;
    readonly decision: string;
    readonly result_value: string;
    readonly verification_status: string;
    readonly evidence_keys: readonly string[];
    readonly candidate_values: readonly {value: string; evidence_keys: readonly string[]}[];
    readonly referenced_issue_ids: readonly string[];
    readonly missing_required: boolean;
    readonly reason: string;
  };
  readonly id: FieldEvidenceId;
  readonly draftId: DraftId;
  readonly entrustmentLineId: EntrustmentLineId;
  readonly field: FinalOutputField;
  readonly currentValue: FieldValue;
  readonly originalValue: FieldValue;
  readonly sourceMaterialType: MaterialType;
  readonly sourceFileId: SourceFileId;
  readonly sourceLocation: SourceLocation;
  readonly sourceInspectionLineId: InspectionSourceLineId | null;
  readonly isAiUpdated: boolean;
  readonly isManuallyEdited: boolean;
  readonly hadConflict: boolean;
  readonly candidateValues: readonly FieldValue[];
}

export interface ProductMatchRelation {
  readonly modelCoverage?: {status: string; overlap: string; evidence_keys: readonly string[]};
  readonly modelEvidenceKeys?: readonly string[];
  readonly id: MatchRelationId;
  readonly draftId: DraftId;
  readonly entrustmentLineId: EntrustmentLineId;
  readonly logicalInspectionOrderId: LogicalInspectionOrderId;
  readonly inspectionMergedProductId: InspectionMergedProductId | null;
  readonly inspectionSourceLineIds: readonly InspectionSourceLineId[];
  readonly establishedBy: MatchEstablishmentMethod;
  readonly active: boolean;
  readonly createdAt: IsoDateTime;
  readonly invalidatedAt: IsoDateTime | null;
  readonly invalidationReason: string | null;
  readonly evidenceSummary: string;
}

export interface DraftLineSnapshot {
  readonly lockedFields?: readonly FinalOutputField[];
  readonly entrustmentLineId: EntrustmentLineId;
  readonly fields: FinalOutputRow;
  readonly status: EntrustmentLineStatus;
  readonly matchRelationIds: readonly MatchRelationId[];
}

export interface DraftVersion {
  readonly id: DraftVersionId;
  readonly draftId: DraftId;
  readonly version: number;
  readonly triggerReason: string;
  readonly materialBatchIds: readonly MaterialBatchId[];
  readonly changedLineIds: readonly EntrustmentLineId[];
  readonly before: readonly DraftLineSnapshot[];
  readonly after: readonly DraftLineSnapshot[];
  readonly addedRelationIds: readonly MatchRelationId[];
  readonly invalidatedRelationIds: readonly MatchRelationId[];
  readonly actorType: ActorType;
  readonly createdAt: IsoDateTime;
  /** 草稿状态本身变化时使用；旧版本没有此字段也保持兼容。 */
  readonly beforeDraftStatus?: DraftStatus;
  readonly afterDraftStatus?: DraftStatus;
}

export interface OperationRecord {
  readonly id: OperationRecordId;
  readonly operationType: OperationType;
  readonly actorType: ActorType;
  readonly customerId: CustomerId | null;
  readonly draftId: DraftId | null;
  readonly affectedEntrustmentLineIds: readonly EntrustmentLineId[];
  readonly affectedInspectionSourceLineIds: readonly InspectionSourceLineId[];
  readonly summary: string;
  readonly occurredAt: IsoDateTime;
}

export interface FinalReconciliationSheet {
  readonly id: FinalReconciliationId;
  readonly sourceDraftId: DraftId;
  readonly sourceVersion: number;
  readonly rows: readonly FinalOutputRow[];
  readonly totals: Readonly<Pick<FinalOutputRow, (typeof FINAL_OUTPUT_TOTAL_FIELDS)[number]>>;
  readonly finalMatchRelationIds: readonly MatchRelationId[];
  readonly finalEvidenceIds: readonly FieldEvidenceId[];
  readonly manualChangeRecordIds: readonly OperationRecordId[];
  readonly resolvedIssueIds: readonly string[];
  readonly confirmedBy: string;
  readonly confirmedAt: IsoDateTime;
}
