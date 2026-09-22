import { FINAL_OUTPUT_FIELDS, REQUIRED_FINAL_OUTPUT_FIELDS, type FinalOutputField, type FinalOutputRow } from "./types";
import type { UiDraft, UiLine } from "../demo-store";
import referenceExtraction from "../../demo-generated/extracted/F-ad8ae0641eda.json";

export type EvaluationDiffType =
  | "CONSISTENT" // 一致
  | "VALUE_MISMATCH" // 值不一致
  | "AI_MISSING" // AI缺失 (GT有值，AI为空)
  | "AI_EXTRA" // AI多填 (GT为空，AI有值)
  | "LINE_MISMATCH"; // 行未对应

export interface FieldEvaluationResult {
  field: FinalOutputField;
  aiValue: string | null;
  gtValue: string | null;
  diffType: EvaluationDiffType;
  diffDescription: string;
  isRequired: boolean;
  aiJudgedConsistent: boolean;
}

export interface LineEvaluationResult {
  lineId: string;
  lineIndex: number;
  model: string;
  gtRowIndex: number | null;
  gtModel: string | null;
  lineMatched: boolean;
  fields: Record<FinalOutputField, FieldEvaluationResult>;
  mismatchCount: number;
  missingCount: number;
  extraCount: number;
}

export interface OverallEvaluationMetrics {
  totalFieldsCompared: number;
  consistentFieldsCount: number;
  mismatchFieldsCount: number;
  aiMissingFieldsCount: number;
  aiExtraFieldsCount: number;
  lineMismatchCount: number;
  overallAccuracyRate: number; // e.g. 94.7%
  requiredAccuracyRate: number; // e.g. 96.2%
  productMatchAccuracyRate: number; // e.g. 88.9%
  humanCorrectionNeededCount: number; // 人工需修正字段
  aiConsistentButIncorrectCount: number; // AI已判断一致但实际错误
  matchedLineCount: number;
  totalLineCount: number;
}

export interface EvaluationReport {
  datasetName: string;
  evaluatedAt: string;
  metrics: OverallEvaluationMetrics;
  lineResults: LineEvaluationResult[];
}

export interface StandardAnswerRow {
  rowIndex: number;
  fields: Partial<Record<FinalOutputField, string>>;
  rawFields?: Record<string, string>;
}

export interface StandardAnswerSheet {
  name: string;
  rows: StandardAnswerRow[];
}

function normalizeValue(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "UNKNOWN" || s === "—" || s === "-") return "";
  // 数值格式规范化：去除多余尾随0，如 12.50 -> 12.5
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const num = parseFloat(s);
    if (!isNaN(num)) return String(num);
  }
  return s;
}

export function parseBuiltinReference(): StandardAnswerSheet {
  try {
    const sheet = referenceExtraction.sheets.find((s) => s.name === "参考结果") ?? referenceExtraction.sheets[0];
    if (!sheet) return { name: "参考结果.xlsx", rows: [] };

    // Group cells by row
    const rowMap = new Map<number, Record<number, string>>();
    for (const cell of sheet.cells) {
      if (!rowMap.has(cell.row)) rowMap.set(cell.row, {});
      rowMap.get(cell.row)![cell.column] = String(cell.cached ?? cell.value ?? "");
    }

    const headerRow = rowMap.get(1) ?? {};
    const colToField = new Map<number, FinalOutputField>();
    for (const [colStr, header] of Object.entries(headerRow)) {
      const col = Number(colStr);
      const cleanHeader = header.trim();
      const matchedField = FINAL_OUTPUT_FIELDS.find(
        (f) => f === cleanHeader || cleanHeader.includes(f) || f.includes(cleanHeader)
      );
      if (matchedField) colToField.set(col, matchedField);
    }

    const rows: StandardAnswerRow[] = [];
    for (const [rowNum, cols] of rowMap.entries()) {
      if (rowNum === 1) continue; // Skip header
      const fields: Partial<Record<FinalOutputField, string>> = {};
      const rawFields: Record<string, string> = {};
      for (const [colStr, val] of Object.entries(cols)) {
        const col = Number(colStr);
        const header = headerRow[col] ?? `Col${col}`;
        rawFields[header] = val;
        const field = colToField.get(col);
        if (field) fields[field] = val;
      }
      rows.push({
        rowIndex: rowNum - 1,
        fields,
        rawFields,
      });
    }

    return {
      name: "参考结果.xlsx (内置标准答案)",
      rows,
    };
  } catch {
    return { name: "参考结果.xlsx", rows: [] };
  }
}

/**
 * 针对当前草稿生成完整的评测基准数据
 * 如果参考答案行数与草稿行数不同（例如参考结果合并了某些批次），
 * 系统基于型号/序号智能对齐商品行，确保逐行对比精准。
 */
export function evaluateDraftAgainstGt(
  draft: UiDraft,
  gtSheet: StandardAnswerSheet
): EvaluationReport {
  const lineResults: LineEvaluationResult[] = [];
  let totalCompared = 0;
  let consistentCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  let lineMismatchTotal = 0;
  let requiredCompared = 0;
  let requiredConsistent = 0;
  let aiConsistentButIncorrect = 0;
  let humanCorrectionNeeded = 0;

  // 尝试为草稿每行找最匹配的标准答案行
  // 1. 先按型号精确匹配；2. 若型号一致有多行，按顺序对应；3. 找不到则尝试按行号对应
  const usedGtIndices = new Set<number>();

  draft.lines.forEach((line, index) => {
    let matchedGt: StandardAnswerRow | null = null;
    const lineModel = (line.fields.型号 ?? line.model ?? "").trim().toUpperCase();

    // 优先匹配相同型号且未被占用的
    const modelMatches = gtSheet.rows.filter(
      (r, i) => !usedGtIndices.has(i) && (r.fields.型号 ?? "").trim().toUpperCase() === lineModel
    );

    if (modelMatches.length > 0) {
      matchedGt = modelMatches[0];
      const gtIdx = gtSheet.rows.indexOf(matchedGt);
      usedGtIndices.add(gtIdx);
    } else if (gtSheet.rows[index] && !usedGtIndices.has(index)) {
      // 退化为按位置匹配
      matchedGt = gtSheet.rows[index];
      usedGtIndices.add(index);
    } else if (gtSheet.rows.length > 0) {
      // 匹配第一个未使用的，或者回退到最相近的
      const fallback = gtSheet.rows.find((_, i) => !usedGtIndices.has(i));
      if (fallback) {
        matchedGt = fallback;
        usedGtIndices.add(gtSheet.rows.indexOf(fallback));
      } else {
        // 如果GT行数比草稿少（例如合并结果），允许匹配同型号已使用的行
        matchedGt = gtSheet.rows.find((r) => (r.fields.型号 ?? "").trim().toUpperCase() === lineModel) ?? gtSheet.rows[0];
      }
    }

    const fieldsResult: Record<FinalOutputField, FieldEvaluationResult> = {} as any;
    let lineMismatches = 0;
    let lineMissings = 0;
    let lineExtras = 0;
    const lineMatched = !!matchedGt;

    if (!lineMatched) lineMismatchTotal++;

    for (const field of FINAL_OUTPUT_FIELDS) {
      const isRequired = (REQUIRED_FINAL_OUTPUT_FIELDS as readonly FinalOutputField[]).includes(field);
      const aiVal = normalizeValue(line.fields[field]);
      const gtVal = matchedGt ? normalizeValue(matchedGt.fields[field]) : "";

      let diffType: EvaluationDiffType = "CONSISTENT";
      let diffDescription = "AI 与标准答案一致";

      if (!lineMatched) {
        diffType = "LINE_MISMATCH";
        diffDescription = "商品行未在标准答案中建立有效对应";
      } else if (aiVal === "" && gtVal !== "") {
        diffType = "AI_MISSING";
        diffDescription = `标准答案有值 [${gtVal}]，AI为空`;
        lineMissings++;
      } else if (aiVal !== "" && gtVal === "") {
        diffType = "AI_EXTRA";
        diffDescription = `标准答案为空，AI有值 [${aiVal}]`;
        lineExtras++;
      } else if (aiVal !== gtVal) {
        diffType = "VALUE_MISMATCH";
        diffDescription = `AI值 [${aiVal}] 与标准答案 [${gtVal}] 不一致`;
        lineMismatches++;
      }

      totalCompared++;
      if (isRequired) requiredCompared++;

      const isAiConsistentJudged = !line.issueIds.some((id) => id.includes(field));

      if (diffType === "CONSISTENT") {
        consistentCount++;
        if (isRequired) requiredConsistent++;
      } else {
        humanCorrectionNeeded++;
        if (diffType === "VALUE_MISMATCH" && isAiConsistentJudged) {
          aiConsistentButIncorrect++;
        }
        if (diffType === "VALUE_MISMATCH") mismatchCount++;
        if (diffType === "AI_MISSING") missingCount++;
        if (diffType === "AI_EXTRA") extraCount++;
      }

      fieldsResult[field] = {
        field,
        aiValue: line.fields[field] ?? null,
        gtValue: matchedGt?.fields[field] ?? null,
        diffType,
        diffDescription,
        isRequired,
        aiJudgedConsistent: isAiConsistentJudged,
      };
    }

    lineResults.push({
      lineId: line.id,
      lineIndex: index,
      model: line.fields.型号 ?? line.model ?? "—",
      gtRowIndex: matchedGt ? matchedGt.rowIndex : null,
      gtModel: matchedGt ? (matchedGt.fields.型号 ?? "—") : null,
      lineMatched,
      fields: fieldsResult,
      mismatchCount: lineMismatches,
      missingCount: lineMissings,
      extraCount: lineExtras,
    });
  });

  const overallAccuracyRate =
    totalCompared > 0 ? Number(((consistentCount / totalCompared) * 100).toFixed(1)) : 100;
  const requiredAccuracyRate =
    requiredCompared > 0 ? Number(((requiredConsistent / requiredCompared) * 100).toFixed(1)) : 100;
  const matchedLineCount = lineResults.filter((l) => l.lineMatched).length;
  const productMatchAccuracyRate =
    draft.lines.length > 0 ? Number(((matchedLineCount / draft.lines.length) * 100).toFixed(1)) : 100;

  return {
    datasetName: gtSheet.name,
    evaluatedAt: new Date().toISOString(),
    metrics: {
      totalFieldsCompared: totalCompared,
      consistentFieldsCount: consistentCount,
      mismatchFieldsCount: mismatchCount,
      aiMissingFieldsCount: missingCount,
      aiExtraFieldsCount: extraCount,
      lineMismatchCount: lineMismatchTotal,
      overallAccuracyRate,
      requiredAccuracyRate,
      productMatchAccuracyRate,
      humanCorrectionNeededCount: humanCorrectionNeeded,
      aiConsistentButIncorrectCount: aiConsistentButIncorrect,
      matchedLineCount,
      totalLineCount: draft.lines.length,
    },
    lineResults,
  };
}
