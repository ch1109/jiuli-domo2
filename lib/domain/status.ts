import type {
  CustomerId,
  DraftStatus,
  EntrustmentLineStatus,
  InspectionSourceLineStatus,
} from "./types";

export interface EntrustmentLineStatusInput {
  /** 当前仍有效的商品匹配关系数量。 */
  readonly activeMatchRelationCount: number;
  /** 是否存在必须由人工解决的问题。 */
  readonly hasBlockingIssue: boolean;
  /** 是否正在等待用户从多个候选中选择。 */
  readonly awaitingCandidateSelection: boolean;
  /** 人工确认阶段是否已经确认或修正本行。 */
  readonly manuallyConfirmed: boolean;
}

/** 按商品依据、人工问题和确认结果推导委托商品行状态。 */
export function deriveEntrustmentLineStatus(input: EntrustmentLineStatusInput): EntrustmentLineStatus {
  if (input.manuallyConfirmed) return "人工已确认";
  if (input.hasBlockingIssue || input.awaitingCandidateSelection) return "待人工处理";
  if (input.activeMatchRelationCount > 0) return "已找到查货依据";
  return "暂无查货依据";
}

export interface DraftStatusInput {
  readonly customerId: CustomerId | null;
  readonly lineStatuses: readonly EntrustmentLineStatus[];
  /** 每行当前仍有效的关系数；传入后，草稿依据只由有效关系决定。 */
  readonly activeMatchRelationCounts?: readonly number[];
  /** 提交整单人工确认动作成功后传 true。 */
  readonly submittedForManualConfirmation: boolean;
  /** 确认完成动作已生成最终核对单并封版。 */
  readonly isFinalized: boolean;
  /** 用于保护已完成草稿不因旧输入回退。 */
  readonly currentStatus?: DraftStatus;
}

/** 按整单依据、客户和确认阶段推导委托书草稿状态。 */
export function deriveDraftStatus(input: DraftStatusInput): DraftStatus {
  if (input.isFinalized || input.currentStatus === "已完成") return "已完成";
  if (input.submittedForManualConfirmation) return "人工确认中";
  const hasEvidence = (status: EntrustmentLineStatus, index: number): boolean =>
    input.activeMatchRelationCounts
      ? (input.activeMatchRelationCounts[index] ?? 0) > 0
      : status === "已找到查货依据" || status === "人工已确认";
  if (input.customerId === null || !input.lineStatuses.some(hasEvidence)) {
    return "待核对";
  }
  if (input.lineStatuses.length > 0 && input.lineStatuses.every(hasEvidence)) {
    return "可提交人工确认";
  }
  return "部分核对";
}

export interface InspectionSourceLineStatusInput {
  /** 是否有有效关系使本原始行被未完成草稿占用。 */
  readonly hasActiveDraftOccupation: boolean;
  /** 确认完成动作是否已将本原始行核销。 */
  readonly isWrittenOff: boolean;
}

/** 按占用和核销事实推导查货原始商品行状态。 */
export function deriveInspectionSourceLineStatus(
  input: InspectionSourceLineStatusInput,
): InspectionSourceLineStatus {
  if (input.isWrittenOff) return "已核销";
  if (input.hasActiveDraftOccupation) return "草稿占用";
  return "可匹配";
}
