import realReconciliations from "../demo-generated/mock/real-sample-commodity-reconciliations.json";
import type { UiDraft, UiLine, UiSource } from "./demo-store";

export type InspectionAvailability = "MATCHED" | "CANDIDATES" | "MISSING";

const normalize = (value: string | null | undefined) =>
  (value ?? "").toUpperCase().replace(/[#\-_/\\()（）\s]/g, "").trim();

/** An available source is a candidate, not an established P3 relation or a P4 check. */
export function getInspectionAvailability(
  draft: UiDraft,
  line: UiLine,
  sources: readonly UiSource[],
  useSampleAssessment = false,
): InspectionAvailability {
  if (line.relationSourceIds.length > 0 || line.relationSourceId) return "MATCHED";
  if (!draft.customerId) return "MISSING";

  const model = normalize(line.model);
  const available = sources.some((source) =>
    source.customerId === draft.customerId &&
    source.availability === "可匹配" &&
    model && normalize(source.model) === model,
  );
  if (available) return "CANDIDATES";

  if (useSampleAssessment) {
    const sample = (realReconciliations as Record<string, { items?: Array<{
      lineId: string;
      entrustmentModel: string;
      relationLevel: string;
    }> }>)[draft.displayNo];
    const item = sample?.items?.find((entry) => entry.lineId === line.id);
    if (item && normalize(item.entrustmentModel) === model &&
      ["EXACT_MODEL", "CORE_MODEL_WITH_AFFIX_DIFF", "MULTIPLE_MODEL_CANDIDATES"].includes(item.relationLevel)) {
      return "CANDIDATES";
    }
  }
  return "MISSING";
}
