import { describe, expect, it } from "vitest";
import { parseBuiltinReference, evaluateDraftAgainstGt } from "../lib/domain/evaluation-engine";
import { useDemoStore } from "../lib/demo-store";

describe("评测引擎 (Evaluation Engine)", () => {
  it("成功解析内置参考结果.xlsx标准答案", () => {
    const builtin = parseBuiltinReference();
    expect(builtin.rows.length).toBeGreaterThan(0);
    expect(builtin.rows[0].fields.型号).toBeDefined();
    expect(builtin.rows[0].fields.品牌).toBeDefined();
  });

  it("基于当前草稿与标准答案计算评测准确率与差异", () => {
    const state = useDemoStore.getState();
    const draft = state.drafts[0];
    expect(draft).toBeDefined();

    const builtin = parseBuiltinReference();
    const report = evaluateDraftAgainstGt(draft, builtin);

    expect(report.metrics.totalFieldsCompared).toBeGreaterThan(0);
    expect(report.metrics.overallAccuracyRate).toBeGreaterThan(0);
    expect(report.metrics.overallAccuracyRate).toBeLessThanOrEqual(100);
    expect(report.lineResults.length).toBe(draft.lines.length);

    // 检查字段级评估结果
    const firstLine = report.lineResults[0];
    expect(firstLine.fields.型号).toBeDefined();
    expect(["CONSISTENT", "VALUE_MISMATCH", "AI_MISSING", "AI_EXTRA", "LINE_MISMATCH"]).toContain(
      firstLine.fields.型号.diffType
    );
  });
});
