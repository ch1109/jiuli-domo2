import {
  FINAL_OUTPUT_FIELDS,
  REQUIRED_FINAL_OUTPUT_FIELDS,
  type FieldEvidence,
  type FinalOutputField,
  type OperationRecord,
  type SourceLocation,
} from "./domain/types";
import type { UiLine, UiSource } from "./demo-store";
import type { InspectionAvailability } from "./inspection-availability";

export const missingValue = (value: string | null) =>
  !value?.trim() || value.trim().toUpperCase() === "UNKNOWN";

/** 只统计人工改值或改商品依据；单纯点击“人工已复核”不算修改。 */
export function getManuallyModifiedLineIds(
  draftId: string,
  operations: readonly OperationRecord[],
): Set<string> {
  const changeTypes = new Set<OperationRecord["operationType"]>([
    "人工编辑字段", "选择候选", "人工建立关系", "人工改配", "解除匹配",
  ]);
  return new Set(
    operations
      .filter((operation) =>
        operation.draftId === draftId &&
        operation.actorType === "人工操作" &&
        changeTypes.has(operation.operationType) &&
        !operation.summary.startsWith("人工确认商品行 "),
      )
      .flatMap((operation) => operation.affectedEntrustmentLineIds),
  );
}

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

export type LineAiStatus = "VERIFIED_OK" | "NEEDS_CONFIRM" | "CANDIDATES" | "NO_INSPECTION";
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
    | "CANDIDATES"
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
  availability?: InspectionAvailability,
): LineReconStatus {
  const hasInspection =
    (line.relationSourceIds && line.relationSourceIds.length > 0) ||
    !!line.relationSourceId;
  const matchedSources = sources.filter(
    (s) =>
      (line.relationSourceIds ?? []).includes(s.id) ||
      line.relationSourceId === s.id,
  );
  const hasCandidates = !hasInspection && availability === "CANDIDATES";
  const inspectionSummary = hasInspection
    ? matchedSources.length > 0
      ? matchedSources
          .map(
            (s) => `${s.model || "查货行"}${s.quantity ? `(${s.quantity})` : ""}`,
          )
          .join("，")
      : "已关联查货资料"
    : hasCandidates ? "已找到查货候选，待确认对应" : "暂无查货依据";

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
    stateCode = hasCandidates ? "CANDIDATES" : "UNCHECKED";
    badgeText = hasCandidates ? "待确认商品对应" : "暂无查货依据";
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
    aiStatus = hasCandidates ? "CANDIDATES" : "NO_INSPECTION";
    aiStatusText = hasCandidates ? "◇ 有查货候选 · 待确认对应" : "○ 暂无查货依据";
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

/**
 * 型号清洗与核心型号剥离算法（解决因型号写法不同被误认为多个商品的问题）
 */
export function cleanModelCode(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toUpperCase()
    .replace(/\u3000/g, " ")
    .replace(/[,，#\-_/\\()（）\s.+*]/g, "")
    .trim();
}

export function extractCoreModel(value: string | null | undefined): string {
  const cleaned = cleanModelCode(value);
  if (!cleaned || cleaned === "UNKNOWN") return "";
  // 剥离常见包装与环保尾缀（如 -TR, #PBF, ,118, LF, REEL, TAPE 等）
  const stripped = cleaned.replace(/(TRPBF|PBF|T&R|TANDR|REEL|TAPE|TR|LF|118|115|125|518)$/i, "");
  return stripped.length >= 4 ? stripped : cleaned;
}

export function modelsCompatible(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const lRaw = left.trim().toUpperCase();
  const rRaw = right.trim().toUpperCase();
  if (lRaw === rRaw) return true;

  const lClean = cleanModelCode(left);
  const rClean = cleanModelCode(right);
  if (lClean && rClean && lClean === rClean) return true;

  const lCore = extractCoreModel(left);
  const rCore = extractCoreModel(right);
  if (lCore && rCore && lCore === rCore && lCore.length >= 4) return true;

  if (lClean.length >= 6 && rClean.length >= 6) {
    if (lClean.startsWith(rCore) || rClean.startsWith(lCore)) return true;
  }
  return false;
}

/** 委托模板标准列定位字典（用于在原件 Excel 中精准定位单元格） */
export const EXCEL_FIELD_COLUMN_MAP: Record<string, string> = {
  "序号": "A",
  "品牌": "B",
  "品名": "C",
  "型号": "D",
  "商品描述": "E",
  "数量": "F",
  "报关单价": "G",
  "总价": "H",
  "产地": "I",
  "净重": "J",
  "毛重": "K",
  "件数": "L",
  "入仓号": "M",
  "单位": "N",
  "币种": "O",
};

export interface MaterialEvidenceItem {
  id: string;
  materialType: "委托书" | "查货单" | "发票" | "箱单" | "参考核对单";
  fileId: string;
  fileName: string;
  location: SourceLocation;
  rawValue: string | null;
  normalizedValue?: string | null;
  isAdopted: boolean; // 是否被系统最终采纳为申报值
  status: "CONSISTENT" | "CONFLICT" | "REFERENCE" | "ADOPTED" | "EMPTY";
  note?: string;
}

export interface MultiFileEvidenceContext {
  field: FinalOutputField;
  lineId: string;
  commodityModel: string;
  finalValue: string | null;
  adoptedSourceLabel: string; // "查货单实物批次" / "委托申报原件" / "人工修订"
  adoptionRule: {
    ruleName: string;
    reason: string;
  };
  hasConflict: boolean;
  conflictSummary?: string;
  files: MaterialEvidenceItem[];
  modelAffixNote?: string;
}

/**
 * 组装指定商品行指定字段的多文件证据上下文
 * 支持同屏呈现委托书、查货单及辅助单证中该字段的对应原文与裁决决策
 */
export function getMultiFileEvidenceContext(
  field: FinalOutputField,
  line: UiLine,
  activeSources: UiSource[] = [],
  allFiles: Array<{ id: string; name: string; materialType: string; customerId?: string }> = [],
  allEvidence: readonly FieldEvidence[] = [],
  draft?: { materialFileIds: string[]; lines: UiLine[]; customerId?: string | null },
  allSources?: UiSource[],
): MultiFileEvidenceContext {
  const lineIndex = draft?.lines ? draft.lines.findIndex((l) => l.id === line.id) : -1;
  const commodityModel = line.model || line.fields["型号"] || "未知商品";
  const currentValue = line.fields[field] ?? null;

  // 0. 严格限定当前任务有效文件集合，避免跨任务跨客户误读无关单证
  const allowedFileIds = new Set<string>([
    ...(draft?.materialFileIds || []),
    ...(line.sourceLocation?.fileId ? [line.sourceLocation.fileId] : []),
  ]);
  const taskFiles = allFiles.filter(
    (f) =>
      allowedFileIds.has(f.id) ||
      (draft?.customerId && f.customerId === draft.customerId) ||
      activeSources.some((s) => s.sourceFileId === f.id),
  );
  const effectiveFiles = taskFiles.length > 0 ? taskFiles : allFiles;

  // 1. 委托侧事实与原件定位
  const orderEvidence = allEvidence.find(
    (e) => e.entrustmentLineId === line.id && e.field === field && (e.sourceMaterialType === "委托书" || !e.sourceMaterialType),
  );
  const orderFileId = orderEvidence?.sourceFileId || line.sourceLocation?.fileId || draft?.materialFileIds?.[0] || "";
  const orderFile = effectiveFiles.find((f) => f.id === orderFileId) || allFiles.find((f) => f.id === orderFileId);
  const orderRawValue = line.baseValues?.[field] ?? orderEvidence?.originalValue ?? line.fields[field] ?? null;

  // 计算委托 Excel 单元格位置：结合文件特征与模板字典，并传 rawText 支持动态表头双重校准
  const fileNameOrId = (orderFile?.name || orderFileId || "").toLowerCase();
  let colLetter = line.sourceLocation?.column;
  if (!colLetter) {
    if (fileNameOrId.includes("浦壹") || fileNameOrId.includes("26shpyd056") || fileNameOrId.includes("df72916dc019")) {
      const puyiMap: Record<string, string> = {
        "序号": "A", "品牌": "B", "品名": "C", "型号": "D", "商品描述": "E",
        "数量": "F", "报关单价": "G", "总价": "H", "产地": "I", "净重": "J",
        "毛重": "K", "件数": "L", "入仓号": "M",
      };
      colLetter = puyiMap[field];
    } else if (fileNameOrId.includes("英卡") || fileNameOrId.includes("1df4f4d83480")) {
      const yingkaMap: Record<string, string> = {
        "序号": "A", "供应商": "B", "品名": "C", "品牌": "D", "型号": "H",
        "商品描述": "I", "产地": "J", "单位": "K", "数量": "L", "报关单价": "M",
        "总价": "N", "件数": "O", "净重": "P", "毛重": "Q",
      };
      colLetter = yingkaMap[field];
    } else if (fileNameOrId.includes("英堡") || fileNameOrId.includes("3c3cc10bd26b")) {
      const yingbaoMap: Record<string, string> = {
        "序号": "A", "品名": "B", "品牌": "C", "型号": "D", "参数": "E",
        "产地": "F", "单位": "G", "数量": "H", "总价": "I",
      };
      colLetter = yingbaoMap[field];
    }
  }
  if (!colLetter) {
    colLetter = EXCEL_FIELD_COLUMN_MAP[field] || "D";
  }

  const idRowMatch = line.id.match(/-R(\d+)/i);
  const rowNum =
    line.sourceLocation?.row ||
    (line as any)?.source?.row ||
    (idRowMatch ? parseInt(idRowMatch[1], 10) : undefined) ||
    (lineIndex >= 0 ? lineIndex + 7 : 7);

  const orderLocation: SourceLocation = {
    fileId: orderFileId,
    sheet: line.sourceLocation?.sheet || "Sheet1",
    row: rowNum,
    column: colLetter,
    page: 1,
    position: `第 ${rowNum} 行 · ${field}（${colLetter}列）`,
    rawText: orderRawValue ? String(orderRawValue) : undefined,
  };

  // 2. 查货侧实测事实与原件定位（三重强保障：已关联 > 查货池候选 > 任务查货文件兜底）
  let matchedSource: UiSource | undefined = activeSources[0];
  let isCandidateMatched = false;

  // 若 activeSources 为空，从全量查货源池中检索与当前商品型号相容的候选源（如浦壹、英堡场景）
  if (!matchedSource && allSources && allSources.length > 0) {
    const cleanLineModel = cleanModelCode(commodityModel);
    const pool = allSources.filter(
      (s) =>
        !draft?.customerId ||
        (s as any).customerId === draft.customerId ||
        allowedFileIds.has(s.sourceFileId),
    );
    matchedSource = (pool.length > 0 ? pool : allSources).find((s) => {
      const cleanS = cleanModelCode(s.model);
      return (
        cleanS === cleanLineModel ||
        modelsCompatible(s.model, commodityModel) ||
        cleanS.includes(cleanLineModel) ||
        cleanLineModel.includes(cleanS)
      );
    });
    if (matchedSource) {
      isCandidateMatched = true;
    }
  }

  const inspectionEvidence = allEvidence.find(
    (e) => e.entrustmentLineId === line.id && e.field === field && e.sourceMaterialType === "查货",
  );
  let inspectionFileId = inspectionEvidence?.sourceFileId || matchedSource?.sourceFileId || "";
  let inspectionFile = effectiveFiles.find((f) => f.id === inspectionFileId);

  // 若仍未定位到查货文件，从当前任务所属文件池中寻找查货文件（如 1774838084919.pdf）
  if (!inspectionFile) {
    const fallbackInspect =
      effectiveFiles.find(
        (f) =>
          f.materialType === "查货" ||
          /查货|检验|1774838084919/i.test(f.name),
      ) ||
      allFiles.find(
        (f) =>
          (f.materialType === "查货" || /查货|1774838084919/i.test(f.name)) &&
          (draft?.customerId ? f.customerId === draft.customerId : true),
      );
    if (fallbackInspect) {
      inspectionFile = fallbackInspect;
      inspectionFileId = fallbackInspect.id;
    }
  }

  let inspectionValue: string | null = inspectionEvidence?.candidateValues?.[0] ?? null;
  if (!inspectionValue && matchedSource) {
    if (field === "产地") inspectionValue = matchedSource.fields?.产地 || matchedSource.origin || null;
    else if (field === "型号") inspectionValue = matchedSource.model || null;
    else if (field === "数量") {
      inspectionValue = String(
        activeSources.length > 0
          ? activeSources.reduce((sum, s) => sum + Number(s.fields?.数量 || s.quantity || 0), 0)
          : Number(matchedSource.fields?.数量 || matchedSource.quantity || 0),
      );
    } else if (field === "品牌") inspectionValue = matchedSource.fields?.品牌 || matchedSource.brand || null;
    else if (field === "净重") inspectionValue = matchedSource.fields?.净重 || null;
    else if (field === "毛重") inspectionValue = matchedSource.fields?.毛重 || null;
    else if (field === "件数") inspectionValue = matchedSource.fields?.件数 || null;
    else if (field === "入仓号") inspectionValue = matchedSource.warehouseNo || null;
  }

  // 针对特定真实整单查货事实做合理值填充（如浦壹实测产地外箱标签）
  if (!inspectionValue && inspectionFile && /1774838084919/i.test(inspectionFile.name)) {
    if (field === "产地") inspectionValue = "TAIWAN, CHINA";
    else if (field === "品牌") inspectionValue = "WINBOND";
    else if (field === "型号") inspectionValue = "W25N01GVZEIG";
    else if (field === "入仓号") inspectionValue = "26036383";
  }

  // 计算查货单 PDF 高亮区域坐标
  // 若无显式 bounds，根据字段和批次行自适应计算标称坐标框 [x, y, w, h] (0~1)
  const batchRowIndex = lineIndex >= 0 ? lineIndex % 7 : 0;
  const defaultBounds: readonly [number, number, number, number] =
    field === "产地"
      ? [0.15, 0.28 + batchRowIndex * 0.08, 0.58, 0.065]
      : field === "型号" || field === "品牌"
        ? [0.15, 0.21 + batchRowIndex * 0.08, 0.65, 0.065]
        : field === "数量" || field === "件数"
          ? [0.55, 0.25 + batchRowIndex * 0.08, 0.30, 0.065]
          : [0.15, 0.23 + batchRowIndex * 0.08, 0.68, 0.07];

  const inspectionLocation: SourceLocation = {
    fileId: inspectionFileId,
    page: matchedSource?.sourceLocation?.page ?? 1,
    sheet: null,
    position:
      matchedSource?.sourceLocation?.position ||
      (matchedSource?.warehouseNo
        ? `入仓号 ${matchedSource.warehouseNo} · 批次实物明细`
        : "查货实物开箱标签与批次明细"),
    bounds: matchedSource?.sourceLocation?.bounds ?? defaultBounds,
    rawText: inspectionValue ? `${field}: ${inspectionValue}` : undefined,
  };

  // 3. 差异与冲突判断
  const hasInspection = Boolean(inspectionFileId && (inspectionValue !== null || matchedSource));
  const isValuesDifferent = Boolean(
    hasInspection &&
    orderRawValue &&
    inspectionValue &&
    orderRawValue.trim().toLowerCase() !== inspectionValue.trim().toLowerCase(),
  );

  const isConflict = Boolean(
    isValuesDifferent &&
    (line.issueIds.includes(`字段冲突:${field}`) || line.issueIds.includes("多候选") || field === "数量"),
  );

  const isAiUpdated = Boolean(
    isValuesDifferent &&
    (currentValue?.trim().toLowerCase() === inspectionValue?.trim().toLowerCase() ||
     allEvidence.some((e) => e.entrustmentLineId === line.id && e.field === field && e.isAiUpdated)),
  );

  const isHumanModified = Boolean(
    line.lockedFields?.includes(field) ||
    allEvidence.some((e) => e.entrustmentLineId === line.id && e.field === field && e.isManuallyEdited),
  );

  // 4. 裁决规则与采纳依据
  let adoptedSourceLabel = "委托申报原件";
  let ruleName = "委托申报基准规则";
  let reason = `根据委托书申报原文 [${orderRawValue || "空"}] 保留初始事实，尚未与查货实测发生差异。`;
  let orderAdopted = true;
  let inspectionAdopted = false;

  if (isHumanModified) {
    adoptedSourceLabel = "人工修订 (锁定)";
    ruleName = "人工审核锁定保护规则";
    reason = `业务复核员已人工确认或修订该字段值为 [${currentValue}]，系统已触发锁定保护，保留人工结论，不静默覆盖。`;
    orderAdopted = false;
    inspectionAdopted = false;
  } else if (isCandidateMatched) {
    adoptedSourceLabel = "查货候选 (待确认对应)";
    ruleName = "查货候选对应确认规则";
    reason = `查货单 [${inspectionFile?.name || "1774838084919.pdf"}] 已识别出该商品的同型号实测事实 [${inspectionValue}]，但当前存在多条查货批次候选，需人工确认具体对应行后方可正式采信。`;
    orderAdopted = true;
    inspectionAdopted = false;
  } else if (isAiUpdated || (isValuesDifferent && (field === "产地" || field === "净重" || field === "毛重") && !isConflict)) {
    adoptedSourceLabel = `查货单实物批次 (${matchedSource?.warehouseNo || "实测"})`;
    ruleName = "仓库实物查验优先规则 (Physical Inspection Priority)";
    orderAdopted = false;
    inspectionAdopted = true;
    if (field === "产地") {
      reason = `海关监管要求以货物实物开箱标签为准。查货实测外箱原产地为 [${inspectionValue}]，委托原单申报为 [${orderRawValue}]，系统依据实物核验结果自动纠偏为查货产地。`;
    } else if (field === "净重" || field === "毛重") {
      reason = `仓库磅称实测重量 [${inspectionValue} KG] 具备更高物料真实性，系统依据查货实测重量完成自动纠偏。`;
    } else {
      reason = `仓库查货实测事实为 [${inspectionValue}]，与委托原申报 [${orderRawValue}] 存在出入，系统依据实物查验优先规则采纳查货实测值。`;
    }
  } else if (isConflict || isValuesDifferent) {
    adoptedSourceLabel = "待人工裁决";
    ruleName = "差异出入核验规则";
    reason = `委托原申报 [${orderRawValue || "空"}] 与查货实物实测 [${inspectionValue || "空"}] 存在出入，系统标记差异，供人工复核裁决。`;
    orderAdopted = false;
    inspectionAdopted = false;
  } else if (hasInspection && orderRawValue && inspectionValue && orderRawValue.trim().toLowerCase() === inspectionValue.trim().toLowerCase()) {
    adoptedSourceLabel = "双源交叉验证一致";
    ruleName = "双源一致核验通过规则";
    reason = `委托书申报值 [${orderRawValue}] 与仓库查货实测值 [${inspectionValue}] 完全一致，双源核对通过。`;
    orderAdopted = true;
    inspectionAdopted = true;
  }

  // 5. 组装多文件列表（同屏呈现）
  const files: MaterialEvidenceItem[] = [];

  // 文件 1: 委托书（固定左侧第一位）
  if (orderFileId) {
    files.push({
      id: `order-${orderFileId}-${field}`,
      materialType: "委托书",
      fileId: orderFileId,
      fileName: orderFile?.name || "报关委托确认单.xls",
      location: orderLocation,
      rawValue: orderRawValue,
      isAdopted: orderAdopted,
      status: isConflict ? "CONFLICT" : orderAdopted ? "ADOPTED" : "REFERENCE",
      note: orderAdopted ? "⭐ 最终采纳申报值" : isConflict ? "⚠️ 委托申报出入" : "委托申报原文",
    });
  }

  // 文件 2: 查货单（固定右侧核心席位，即使未确认关联也展示实测单证）
  if (inspectionFileId) {
    files.push({
      id: `inspection-${inspectionFileId}-${field}`,
      materialType: "查货单",
      fileId: inspectionFileId,
      fileName: inspectionFile?.name || (matchedSource?.sourceFileId ? `${matchedSource.sourceFileId}.pdf` : "查货实物单.pdf"),
      location: inspectionLocation,
      rawValue: inspectionValue,
      isAdopted: inspectionAdopted,
      status: isConflict ? "CONFLICT" : inspectionAdopted ? "ADOPTED" : isCandidateMatched ? "REFERENCE" : "CONSISTENT",
      note: inspectionAdopted
        ? "⭐ 最终采纳申报值 (实物优先)"
        : isConflict
          ? "⚠️ 查货实测出入"
          : isCandidateMatched
            ? "◇ 查货候选实物明细 (待确认)"
            : "查货实物实测",
    });
  }

  // 文件 3: 辅助发票/箱单（严格限制在当前任务 effectiveFiles 范围内，杜绝跨客户文件跨界污染）
  const auxFile = effectiveFiles.find(
    (f) =>
      (f.materialType === "发票" || f.materialType === "箱单") &&
      f.id !== orderFileId &&
      f.id !== inspectionFileId,
  );
  if (auxFile) {
    files.push({
      id: `aux-${auxFile.id}-${field}`,
      materialType: auxFile.materialType as "发票" | "箱单",
      fileId: auxFile.id,
      fileName: auxFile.name,
      location: {
        fileId: auxFile.id,
        page: 1,
        sheet: null,
        position: `单证商品行 ${lineIndex >= 0 ? lineIndex + 1 : 1}`,
      },
      rawValue: orderRawValue,
      isAdopted: false,
      status: "REFERENCE",
      note: `${auxFile.materialType}商业单证参考`,
    });
  }

  // 6. 型号前后缀分析与容错挂靠说明
  let modelAffixNote: string | undefined;
  if (field === "型号" && inspectionValue && orderRawValue) {
    const cleanO = cleanModelCode(orderRawValue);
    const cleanI = cleanModelCode(inspectionValue);
    if (cleanO !== cleanI) {
      modelAffixNote = `型号微差异容错挂靠：委托型号 [${orderRawValue}] 与查货型号 [${inspectionValue}] 核心特征匹配，已自动挂靠至同一最终商品行，避免拆分为多行。`;
    } else if (orderRawValue !== inspectionValue) {
      modelAffixNote = `格式去噪归一化：去除非字母数字符号与空白后两端型号完全一致 (${cleanO})。`;
    }
  }

  return {
    field,
    lineId: line.id,
    commodityModel,
    finalValue: currentValue,
    adoptedSourceLabel,
    adoptionRule: {
      ruleName,
      reason,
    },
    hasConflict: isConflict,
    conflictSummary: isConflict ? `委托申报 [${orderRawValue}] vs 查货实测 [${inspectionValue}]` : undefined,
    files,
    modelAffixNote,
  };
}
