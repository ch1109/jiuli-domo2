import {
  FINAL_OUTPUT_FIELDS,
  REQUIRED_FINAL_OUTPUT_FIELDS,
  type FieldEvidence,
  type FinalOutputField,
  type SourceLocation,
} from "./domain/types";
import type { UiLine, UiSource } from "./demo-store";

export const missingValue = (value: string | null) =>
  !value?.trim() || value.trim().toUpperCase() === "UNKNOWN";

export const CORE_OUTPUT_FIELDS: readonly FinalOutputField[] = [
  "品牌",
  "型号",
  "品名",
  "产地",
  "单位",
  "数量",
  "报关单价",
  "总价",
  "件数",
  "净重",
  "毛重",
];

export type FieldCheckStatusType =
  | "VERIFIED_CONSISTENT" // ✓ AI核对一致
  | "AI_UPDATED" // ↑ AI根据查货更新
  | "CONFLICT" // ⚠ 存在冲突
  | "HUMAN_MODIFIED" // ● 人工已修改
  | "NO_INSPECTION" // ○ 尚未核对 (等待对应查货材料)
  | "MISSING_REQUIRED"; // ✕ 必填缺失

export interface FieldSourceBreakdown {
  orderSource?: {
    fileId?: string;
    fileName?: string;
    locationText?: string;
    rawValue?: string | null;
  };
  inspectionSource?: {
    fileId?: string;
    fileName?: string;
    warehouseNo?: string;
    locationText?: string;
    inspectionValue?: string | null;
  };
  aiRuleNote?: string;
  humanReviewNote?: string;
}

export function getFieldRows(
  line: UiLine,
  allEvidence: readonly FieldEvidence[],
) {
  const hasInspection =
    (line.relationSourceIds && line.relationSourceIds.length > 0) ||
    !!line.relationSourceId;

  return FINAL_OUTPUT_FIELDS.map((field) => {
    const evidence = allEvidence.filter(
      (e) =>
        e.entrustmentLineId === line.id &&
        e.field === field &&
        (!e.modelDecision || line.evidenceIds.includes(e.id)),
    );
    const latest = evidence.at(-1);
    const decision = [...evidence]
      .reverse()
      .find((e) => e.modelDecision)?.modelDecision;
    const lastHuman = [...evidence].reverse().find((e) => e.isManuallyEdited);
    const human =
      !!lastHuman &&
      (latest?.isManuallyEdited ||
        (!!line.lockedFields?.includes(field) &&
          lastHuman.currentValue === line.fields[field]));
    const conflict = hasInspection && line.issueIds.includes(`字段冲突:${field}`);
    const missing = missingValue(line.fields[field]);
    const required = (
      REQUIRED_FINAL_OUTPUT_FIELDS as readonly FinalOutputField[]
    ).includes(field);
    const locked = line.lockedFields?.includes(field) ?? false;
    const aiUpdated = !human && evidence.some((e) => e.isAiUpdated);
    const changed = human || aiUpdated;

    const baseValue = line.baseValues
      ? line.baseValues[field]
      : evidence.length
        ? evidence[0].originalValue
        : line.fields[field];

    const inspectionEvidence = evidence.find(
      (e) => e.sourceMaterialType === "查货" && !e.isManuallyEdited,
    );
    const candidateValue =
      inspectionEvidence?.candidateValues?.[0] ??
      (inspectionEvidence?.references?.[0]?.normalizedValue || null);

    const verified =
      !conflict &&
      !missing &&
      (human ||
        decision?.verification_status === "VERIFIED_CONSISTENT" ||
        decision?.verification_status === "VERIFIED_UPDATED");

    let checkStatus: FieldCheckStatusType = "NO_INSPECTION";
    let statusText = "初始委托";
    let fieldSubNote = "";

    // 人工修改保护：如果人工修改过，且查货实测值与当前值不一致
    const hasHumanOverriddenDiff =
      human &&
      !!candidateValue &&
      candidateValue.trim() !== "" &&
      candidateValue.trim().toLowerCase() !== (line.fields[field] || "").trim().toLowerCase();

    if (conflict) {
      checkStatus = "CONFLICT";
      statusText = "查货差异";
      fieldSubNote = candidateValue ? `查货: ${candidateValue}` : "与查货不符";
    } else if (missing && required) {
      checkStatus = "MISSING_REQUIRED";
      statusText = "必填缺失";
      fieldSubNote = "报关必填项";
    } else if (human) {
      checkStatus = "HUMAN_MODIFIED";
      statusText =
        lastHuman?.originalValue === lastHuman?.currentValue
          ? "人工已确认"
          : "人工修改";
      fieldSubNote = hasHumanOverriddenDiff
        ? `后续AI查货: ${candidateValue}`
        : "已人工留痕";
    } else if (aiUpdated || decision?.verification_status === "VERIFIED_UPDATED") {
      checkStatus = "AI_UPDATED";
      statusText = "AI已更新";
      fieldSubNote = `原委托: ${baseValue || "空"} | 查货: ${candidateValue || line.fields[field]}`;
    } else if (decision?.verification_status === "VERIFIED_CONSISTENT") {
      checkStatus = "VERIFIED_CONSISTENT";
      statusText = "核对一致";
      fieldSubNote = "与查货一致";
    } else if (!hasInspection) {
      checkStatus = "NO_INSPECTION";
      statusText = "初始委托";
      fieldSubNote = "";
    }

    // 来源结构化数据拆解
    const orderEvidence = evidence.find(
      (e) => e.sourceMaterialType === "委托书" || !e.sourceMaterialType,
    );
    const sourceBreakdown: FieldSourceBreakdown = {
      orderSource: {
        fileId: orderEvidence?.sourceFileId ?? line.sourceLocation?.fileId,
        fileName: orderEvidence?.sourceFileId ?? "委托材料原件",
        locationText: orderEvidence?.sourceLocation?.position ?? (line.sourceLocation?.row ? `第 ${line.sourceLocation.row} 行` : "委托原单"),
        rawValue: baseValue,
      },
      inspectionSource: hasInspection
        ? {
            fileId: inspectionEvidence?.sourceFileId,
            fileName: inspectionEvidence?.sourceFileId ?? "查货报告单",
            warehouseNo: (line.relationSourceId ?? line.relationSourceIds?.[0]) || "WH-REC",
            locationText: inspectionEvidence?.sourceLocation?.position ?? "查货批次明细",
            inspectionValue: candidateValue,
          }
        : undefined,
      aiRuleNote: decision?.reason || (aiUpdated ? `AI根据仓库查货实测事实将 [${baseValue || "空"}] 更新为 [${line.fields[field]}]` : undefined),
      humanReviewNote: lastHuman?.review?.reason,
    };

    return {
      field,
      currentValue: line.fields[field],
      baseValue,
      candidateValue,
      checkStatus,
      statusSubNote: fieldSubNote,
      hasHumanOverriddenDiff,
      verificationStatus: decision?.verification_status ?? "NOT_CHECKED",
      action: decision?.decision ?? "NO_ACTION",
      valueOrigin: human
        ? "HUMAN"
        : missing
          ? "EMPTY"
          : aiUpdated
            ? "AI"
            : "ORDER",
      evidence,
      evidenceCount: new Set(
        evidence
          .filter((e) => !e.isManuallyEdited)
          .flatMap((e) =>
            e.references ? e.references.map((r) => r.key) : [e.id],
          ),
      ).size,
      decision,
      human,
      conflict,
      missing,
      required,
      locked,
      changed,
      verified,
      status: statusText,
      needsHuman: conflict || (missing && required),
      review: lastHuman?.review,
      sourceBreakdown,
    };
  });
}

export type FieldRow = ReturnType<typeof getFieldRows>[number];

export type LineAiStatus = "VERIFIED_OK" | "NEEDS_CONFIRM" | "NO_INSPECTION";
export type LineHumanStatus = "CONFIRMED" | "MODIFIED" | "PENDING";
export type LineActionType =
  | "NO_INSPECTION" // 尚无可靠查货关系（禁止确认本行，可手动建立对应）
  | "NEEDS_RESOLVE" // AI已核对但存在未决问题（需先处理问题）
  | "CAN_CONFIRM" // AI已核对无阻塞（可确认当前商品）
  | "CONFIRMED"; // 已人工复核（可取消确认）

export interface LineReconStatus {
  lineId: string;
  hasInspection: boolean;
  inspectionSummary: string;
  isHumanModified: boolean;
  humanModifiedFields: FinalOutputField[];
  hasConflict: boolean;
  conflictFields: FinalOutputField[];
  missingRequiredFields: FinalOutputField[];
  isAllVerified: boolean;
  stateCode:
    | "UNCHECKED"
    | "USER_MODIFIED"
    | "CONFLICT"
    | "MISSING"
    | "VERIFIED"
    | "CHECKING";
  badgeText: string;
  badgeClass: string;
  // 两个独立维度的核心状态
  aiStatus: LineAiStatus;
  aiStatusText: string;
  humanStatus: LineHumanStatus;
  humanStatusText: string;
  // 行级动作与权限
  actionType: LineActionType;
  canConfirm: boolean;
}

export function getLineReconStatus(
  line: UiLine,
  rows: readonly FieldRow[],
  sources: readonly {
    id: string;
    model?: string;
    sourceFileId?: string;
    quantity?: string;
  }[] = [],
): LineReconStatus {
  const hasInspection =
    (line.relationSourceIds && line.relationSourceIds.length > 0) ||
    !!line.relationSourceId;
  const matchedSources = sources.filter(
    (s) =>
      (line.relationSourceIds ?? []).includes(s.id) ||
      line.relationSourceId === s.id,
  );
  const inspectionSummary = hasInspection
    ? matchedSources.length > 0
      ? matchedSources
          .map(
            (s) => `${s.model || "查货行"}${s.quantity ? `(${s.quantity})` : ""}`,
          )
          .join("，")
      : "已关联查货资料"
    : "暂无查货依据";

  const humanModifiedFields = rows.filter((r) => r.human).map((r) => r.field);
  const isHumanModified = humanModifiedFields.length > 0;

  const conflictFields = rows.filter((r) => r.conflict).map((r) => r.field);
  const hasConflict = conflictFields.length > 0;

  const missingRequiredFields = rows
    .filter((r) => r.missing && r.required)
    .map((r) => r.field);

  const isAllVerified = rows.every((r) => r.verified || (!r.required && r.missing));

  let stateCode: LineReconStatus["stateCode"] = "CHECKING";
  let badgeText = "核对中";
  let badgeClass = "badge-gray";

  if (!hasInspection) {
    stateCode = "UNCHECKED";
    badgeText = "暂无查货依据";
    badgeClass = "badge-orange";
  } else if (isHumanModified) {
    stateCode = "USER_MODIFIED";
    badgeText = `已人工修正 (${humanModifiedFields.length})`;
    badgeClass = "badge-blue";
  } else if (hasConflict) {
    stateCode = "CONFLICT";
    badgeText = `查货差异 (${conflictFields.length})`;
    badgeClass = "badge-red";
  } else if (missingRequiredFields.length > 0) {
    stateCode = "MISSING";
    badgeText = `必填缺失 (${missingRequiredFields.length})`;
    badgeClass = "badge-red";
  } else if (isAllVerified) {
    stateCode = "VERIFIED";
    badgeText = "AI核对完成";
    badgeClass = "badge-green";
  }

  // 1. AI 核对状态
  let aiStatus: LineAiStatus = "VERIFIED_OK";
  let aiStatusText = "✓ AI核对完成";
  if (!hasInspection) {
    aiStatus = "NO_INSPECTION";
    aiStatusText = "○ 暂无查货依据";
  } else if (hasConflict || missingRequiredFields.length > 0 || line.issueIds.length > 0) {
    aiStatus = "NEEDS_CONFIRM";
    const issuesCount = conflictFields.length + missingRequiredFields.length;
    aiStatusText = `⚠ 需人工确认 (${issuesCount > 0 ? `${issuesCount}项问题` : "关系存疑"})`;
  }

  // 2. 人工复核状态
  let humanStatus: LineHumanStatus = "PENDING";
  let humanStatusText = "○ 待人工复核";
  if (line.manuallyConfirmed) {
    humanStatus = "CONFIRMED";
    humanStatusText = "● 人工已确认";
  } else if (isHumanModified) {
    humanStatus = "MODIFIED";
    humanStatusText = "✏️ 人工已修改";
  }

  // 3. 行级操作动作类型与权限
  let actionType: LineActionType = "CAN_CONFIRM";
  let canConfirm = true;

  if (line.manuallyConfirmed) {
    actionType = "CONFIRMED";
    canConfirm = true;
  } else if (!hasInspection) {
    actionType = "NO_INSPECTION";
    canConfirm = false; // 严禁无依据确认！
  } else if (hasConflict || missingRequiredFields.length > 0 || line.issueIds.length > 0) {
    actionType = "NEEDS_RESOLVE";
    canConfirm = false; // 需先处理问题
  } else {
    actionType = "CAN_CONFIRM";
    canConfirm = true;
  }

  return {
    lineId: line.id,
    hasInspection,
    inspectionSummary,
    isHumanModified,
    humanModifiedFields,
    hasConflict,
    conflictFields,
    missingRequiredFields,
    isAllVerified,
    stateCode,
    badgeText,
    badgeClass,
    aiStatus,
    aiStatusText,
    humanStatus,
    humanStatusText,
    actionType,
    canConfirm,
  };
}
