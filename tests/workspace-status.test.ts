import { describe, expect, it } from "vitest";
import { getTaskSummary } from "../lib/workspace-status";
import type { UiDraft, UiLine } from "../lib/demo-store";
import { createFinalOutputRow } from "../lib/domain/final-output";

const line = (matched: boolean, issue = false): UiLine => ({ id: "line", draftId: "draft", model: "model", brand: "brand", origin: "中国", quantity: "1", fields: createFinalOutputRow({}), evidenceIds: [], updatedFieldNames: [], sourceOrder: 1, sourceLocation: null, matchRelationIds: [], relationSourceId: matched ? "source" : null, relationSourceIds: matched ? ["source"] : [], issue: issue ? "字段冲突" : null, issueIds: [], status: issue ? "待人工处理" : matched ? "已找到查货依据" : "暂无查货依据", manuallyConfirmed: false });
const draft = (lines: UiLine[], extra: Partial<UiDraft> = {}) => ({ customerId: "customer", status: "待核对", finalized: false, lines, ...extra }) as UiDraft;

describe("客户工作台状态", () => {
  it("部分匹配不能被显示为 AI 核对完成", () => {
    expect(getTaskSummary(draft([line(true), line(false)]))).toMatchObject({ businessStatus: "部分核对", matched: 1, total: 2, realtimeStatus: "等待补充 1 行查货" });
    expect(getTaskSummary(draft([line(true), line(true)]))).toMatchObject({ businessStatus: "AI核对完成 · 待人工复核", nextAction: "去复核" });
  });
  it("有冲突时优先提示人工处理", () => {
    expect(getTaskSummary(draft([line(true, true)]))).toMatchObject({ businessStatus: "待人工处理", issues: 1 });
  });
  it("实时处理不覆盖业务状态", () => {
    expect(getTaskSummary(draft([line(true), line(false)]), "正在执行商品匹配")).toMatchObject({ businessStatus: "部分核对", realtimeStatus: "正在执行商品匹配" });
  });
  it("客户缺失、未解析、人工复核和完成保持独立", () => {
    expect(getTaskSummary(draft([], { customerId: null })).businessStatus).toBe("异常");
    expect(getTaskSummary(draft([])).businessStatus).toBe("待解析");
    expect(getTaskSummary(draft([line(false)])).businessStatus).toBe("待匹配");
    expect(getTaskSummary(draft([line(true)], { status: "人工确认中" })).businessStatus).toBe("人工复核中");
    expect(getTaskSummary(draft([line(true, true)], { finalized: true }), "正在执行商品匹配")).toMatchObject({ businessStatus: "已完成", realtimeStatus: "已完成", issues: 0 });
  });
});
