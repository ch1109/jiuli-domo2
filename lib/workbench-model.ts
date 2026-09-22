import {
  FINAL_OUTPUT_FIELDS,
  REQUIRED_FINAL_OUTPUT_FIELDS,
  type FieldEvidence,
  type FinalOutputField,
} from "./domain/types";
import type { UiLine } from "./demo-store";

export const missingValue = (value: string | null) =>
  !value?.trim() || value.trim().toUpperCase() === "UNKNOWN";
export function getFieldRows(
  line: UiLine,
  allEvidence: readonly FieldEvidence[],
) {
  return FINAL_OUTPUT_FIELDS.map((field) => {
    const evidence = allEvidence.filter(
      (e) => e.entrustmentLineId === line.id && e.field === field && (!e.modelDecision || line.evidenceIds.includes(e.id)),
    );
    const latest = evidence.at(-1);
    const decision = [...evidence]
      .reverse()
      .find((e) => e.modelDecision)?.modelDecision;
    const lastHuman=[...evidence].reverse().find(e=>e.isManuallyEdited);
    const human = !!lastHuman && (latest?.isManuallyEdited || (!!line.lockedFields?.includes(field) && lastHuman.currentValue===line.fields[field]));
    const conflict = line.issueIds.includes(`字段冲突:${field}`);
    const missing = missingValue(line.fields[field]);
    const required = (
      REQUIRED_FINAL_OUTPUT_FIELDS as readonly FinalOutputField[]
    ).includes(field);
    const locked = line.lockedFields?.includes(field) ?? false;
    const changed = human || evidence.some((e) => e.isAiUpdated);
    const verified =
      !conflict &&
      !missing &&
      (human ||
        decision?.verification_status === "VERIFIED_CONSISTENT" ||
        decision?.verification_status === "VERIFIED_UPDATED");
    const status = conflict
      ? "冲突"
      : missing && required
        ? "必填缺失"
        : human
          ? lastHuman?.originalValue === lastHuman?.currentValue
            ? "人工已确认"
            : "人工修改"
          : decision?.verification_status === "VERIFIED_CONSISTENT"
            ? "一致"
            : decision?.decision === "FILL"
              ? "AI 已补全"
              : decision?.verification_status === "VERIFIED_UPDATED"
                ? "AI 已更新"
                : "未核验";
    return {
      field,
      currentValue: line.fields[field],
      baseValue: line.baseValues ? line.baseValues[field] : evidence.length ? evidence[0].originalValue : line.fields[field],
      verificationStatus: decision?.verification_status ?? "NOT_CHECKED",
      action: decision?.decision ?? "NO_ACTION",
      valueOrigin: human
        ? "HUMAN"
        : missing
          ? "EMPTY"
          : evidence.some((e) => e.isAiUpdated)
            ? "AI"
            : "ORDER",
      evidence,
      evidenceCount: new Set(evidence.filter(e => !e.isManuallyEdited).flatMap(e => e.references ? e.references.map(r=>r.key) : [e.id])).size,
      decision,
      human,
      conflict,
      missing,
      required,
      locked,
      changed,
      verified,
      status,
      needsHuman: conflict || (missing && required),
      review: lastHuman?.review,
    };
  });
}
export type FieldRow = ReturnType<typeof getFieldRows>[number];

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
  stateCode: "UNCHECKED" | "USER_MODIFIED" | "CONFLICT" | "MISSING" | "VERIFIED" | "CHECKING";
  badgeText: string;
  badgeClass: string;
}

export function getLineReconStatus(
  line: UiLine,
  rows: readonly FieldRow[],
  sources: readonly { id: string; model?: string; sourceFileId?: string; quantity?: string }[] = [],
): LineReconStatus {
  const hasInspection = (line.relationSourceIds && line.relationSourceIds.length > 0) || !!line.relationSourceId;
  const matchedSources = sources.filter(
    (s) => (line.relationSourceIds ?? []).includes(s.id) || line.relationSourceId === s.id,
  );
  const inspectionSummary = hasInspection
    ? matchedSources.length > 0
      ? matchedSources.map((s) => `${s.model || "查货行"}${s.quantity ? `(${s.quantity})` : ""}`).join("，")
      : "已关联查货资料"
    : "未关联查货单";

  const humanModifiedFields = rows.filter((r) => r.human).map((r) => r.field);
  const isHumanModified = humanModifiedFields.length > 0;

  const conflictFields = rows.filter((r) => r.conflict).map((r) => r.field);
  const hasConflict = conflictFields.length > 0;

  const missingRequiredFields = rows.filter((r) => r.missing && r.required).map((r) => r.field);

  const isAllVerified = rows.every((r) => r.verified || (!r.required && r.missing));

  let stateCode: LineReconStatus["stateCode"] = "CHECKING";
  let badgeText = "核对中";
  let badgeClass = "badge-gray";

  if (!hasInspection) {
    stateCode = "UNCHECKED";
    badgeText = "未核对 · 缺查货";
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
    badgeText = "基于查货核对一致";
    badgeClass = "badge-green";
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
  };
}
