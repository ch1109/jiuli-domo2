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

/** 仓库查货材料可核验的字段范围 (对齐 P4 evaluated_fields) */
export const INSPECTION_EVALUATED_FIELDS: readonly FinalOutputField[] = [
  "品名",
  "型号",
  "品牌",
  "产地",
  "数量",
  "单位",
  "件数",
  "净重",
  "毛重",
  "入仓号",
];

export interface P4FieldDecisionInfo {
  field: FinalOutputField;
  decision: "KEEP" | "UPDATE" | "FILL" | "CONFLICT" | "MISSING" | "NO_ACTION";
  verificationStatus:
    | "VERIFIED_CONSISTENT"
    | "VERIFIED_UPDATED"
    | "CONFLICT"
    | "MISSING"
    | "NO_EVIDENCE"
    | "NOT_EVALUATED";
  actionLabel: string;
  actionBadgeClass: string;
  orderValue: string | null;
  inspectionValue: string | null;
  currentValue: string | null;
  reason: string;
  evidenceKeys: string[];
  candidateValues: string[];
  isEvaluatedByInspection: boolean;
  needsHumanAction: boolean;
  hasHumanOverriddenDiff: boolean;
  fieldRow: FieldRow;
}

/**
 * 计算整行 25 字段的结构化 P4 核验决策
 * 严格遵从 P1(委托基准) -> P3(查货依据) -> P4(字段级核验与草稿裁决) 边界
 */
export function getP4FieldDecisions(
  line: UiLine,
  fieldRows: FieldRow[],
  activeSources: UiSource[] = [],
): P4FieldDecisionInfo[] {
  return fieldRows.map((row) => {
    const field = row.field;
    const isEvaluatedByInspection = (
      INSPECTION_EVALUATED_FIELDS as readonly FinalOutputField[]
    ).includes(field);

    const orderValue = row.baseValue ?? null;
    const currentValue = row.currentValue ?? null;

    // 提取查货依据实测值
    let inspectionValue = row.candidateValue ?? null;
    if (!inspectionValue && row.sourceBreakdown.inspectionSource?.inspectionValue) {
      inspectionValue = row.sourceBreakdown.inspectionSource.inspectionValue;
    }
    if (!inspectionValue && activeSources.length > 0) {
      const first = activeSources[0];
      if (field === "入仓号") {
        inspectionValue = first.warehouseNo || first.logicalInspectionOrderId || null;
      } else if (field === "产地") {
        inspectionValue = first.fields?.产地 || first.origin || null;
      } else if (field === "净重") {
        inspectionValue = first.fields?.净重 || null;
      } else if (field === "毛重") {
        inspectionValue = first.fields?.毛重 || null;
      } else if (field === "件数") {
        inspectionValue = first.fields?.件数 || null;
      } else if (field === "数量") {
        inspectionValue = String(
          activeSources.reduce(
            (sum, s) => sum + Number(s.fields?.数量 || s.quantity || 0),
            0,
          ),
        );
      } else if (field === "型号") {
        inspectionValue = first.model || null;
      } else if (field === "品牌") {
        inspectionValue = first.fields?.品牌 || first.brand || null;
      } else if (field === "单位") {
        inspectionValue = first.fields?.单位 || null;
      } else if (field === "品名") {
        inspectionValue = (first as { name?: string }).name || (first.otherFields as Record<string, string | null> | undefined)?.["品名"] || null;
      }
    }

    // 1. 如果字段不在查货核验范围内：严禁冒充核对一致，明确输出 NO_ACTION
    if (!isEvaluatedByInspection) {
      return {
        field,
        decision: "NO_ACTION",
        verificationStatus: "NOT_EVALUATED",
        actionLabel: "本字段不由查货材料核验",
        actionBadgeClass: "badge-no-action",
        orderValue,
        inspectionValue: null,
        currentValue,
        reason: `${field} 属于委托申报类字段（发票单价/编码/申报要素等），不在仓库查货实测核验范围内，系统直接保留委托申报事实。`,
        evidenceKeys: [],
        candidateValues: [],
        isEvaluatedByInspection: false,
        needsHumanAction: row.missing && row.required,
        hasHumanOverriddenDiff: false,
        fieldRow: row,
      };
    }

    // 2. 字段属于查货核验范围
    let decision: "KEEP" | "UPDATE" | "FILL" | "CONFLICT" | "MISSING" = "KEEP";
    let verificationStatus:
      | "VERIFIED_CONSISTENT"
      | "VERIFIED_UPDATED"
      | "CONFLICT"
      | "MISSING"
      | "NO_EVIDENCE" = "VERIFIED_CONSISTENT";
    let actionLabel = "核对一致 (保留)";
    let actionBadgeClass = "badge-consistent";
    let reason = "仓库查货实测值与委托申报值一致，核验通过。";
    let needsHumanAction = false;
    const candidateValues: string[] = [];
    const evidenceKeys: string[] = row.decision?.evidence_keys
      ? [...row.decision.evidence_keys]
      : row.evidence.map((e) => e.id);

    if (row.conflict) {
      decision = "CONFLICT";
      verificationStatus = "CONFLICT";
      actionLabel = "差异冲突 (待人工裁决)";
      actionBadgeClass = "badge-conflict";
      reason =
        row.decision?.reason ||
        `委托申报值 [${orderValue || "空"}] 与查货实测值 [${inspectionValue || "空"}] 存在差异出入，系统无法自动裁决，请人工确认采用哪项。`;
      needsHumanAction = true;
      if (row.candidateValue) candidateValues.push(row.candidateValue);
      else if (inspectionValue) candidateValues.push(inspectionValue);
    } else if (row.missing && row.required) {
      decision = "MISSING";
      verificationStatus = "MISSING";
      actionLabel = "核心必填缺失";
      actionBadgeClass = "badge-missing";
      reason =
        row.decision?.reason ||
        `海关申报核心必填项，委托原单与查货实测均为空缺，需人工补充录入。`;
      needsHumanAction = true;
    } else if (row.checkStatus === "AI_UPDATED" || row.decision?.decision === "UPDATE") {
      decision = "UPDATE";
      verificationStatus = "VERIFIED_UPDATED";
      actionLabel = "查货纠偏 (更新)";
      actionBadgeClass = "badge-updated";
      reason =
        row.decision?.reason ||
        `依据仓库查货实测事实 (${inspectionValue || currentValue}) 自动纠偏修正委托申报值 (${orderValue || "空"})。`;
      if (inspectionValue) candidateValues.push(inspectionValue);
    } else if (row.decision?.decision === "FILL" || (!orderValue && inspectionValue)) {
      decision = "FILL";
      verificationStatus = "VERIFIED_UPDATED";
      actionLabel = "查货补充 (填补)";
      actionBadgeClass = "badge-fill";
      reason =
        row.decision?.reason ||
        `委托方未填报此项，由仓库查货实测记录 (${inspectionValue}) 自动补充入库草稿。`;
      if (inspectionValue) candidateValues.push(inspectionValue);
    } else if (row.checkStatus === "HUMAN_MODIFIED") {
      decision = "KEEP";
      verificationStatus = "VERIFIED_CONSISTENT";
      actionLabel = "人工已修订 (锁定)";
      actionBadgeClass = "badge-human";
      reason =
        row.sourceBreakdown.humanReviewNote ||
        `人工复核员已修订该字段为 [${currentValue}]，系统锁定当前草稿结果，不静默覆盖。`;
      if (inspectionValue) candidateValues.push(inspectionValue);
    } else if (
      row.checkStatus === "VERIFIED_CONSISTENT" ||
      (inspectionValue &&
        orderValue &&
        inspectionValue.trim().toLowerCase() === orderValue.trim().toLowerCase())
    ) {
      decision = "KEEP";
      verificationStatus = "VERIFIED_CONSISTENT";
      actionLabel = "核对一致 (保留)";
      actionBadgeClass = "badge-consistent";
      reason =
        row.decision?.reason ||
        `仓库查货实测值 (${inspectionValue || orderValue}) 与委托申报值一致，核验通过。`;
    } else {
      decision = "KEEP";
      verificationStatus = "NO_EVIDENCE";
      actionLabel = "保留委托值 (无查货实测)";
      actionBadgeClass = "badge-consistent";
      reason =
        row.decision?.reason ||
        "查货实测明细中未提供针对此项的数据，保留委托原单数值。";
    }

    return {
      field,
      decision,
      verificationStatus,
      actionLabel,
      actionBadgeClass,
      orderValue,
      inspectionValue,
      currentValue,
      reason,
      evidenceKeys,
      candidateValues,
      isEvaluatedByInspection: true,
      needsHumanAction,
      hasHumanOverriddenDiff: row.hasHumanOverriddenDiff,
      fieldRow: row,
    };
  });
}
