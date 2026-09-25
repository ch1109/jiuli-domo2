import { describe, expect, it } from "vitest";
import { buildBusinessWorkspace, useDemoStore } from "../lib/demo-store";
import { getCustomerWorkbench } from "../lib/customer-workbench-model";
import { getInspectionAvailability } from "../lib/inspection-availability";
import { getFieldRows, getLineReconStatus } from "../lib/workbench-model";

describe("查货材料、候选与已确定关系分开计算", () => {
  const workspace = buildBusinessWorkspace();
  const draft = workspace.drafts.find((item) => item.displayNo === "26SHPYD056")!;

  it("浦壹只有 1 行真正缺查货、7 行有候选，1 行已有确定关系", () => {
    const states = draft.lines.map((line) => getInspectionAvailability(draft, line, workspace.sources, true));
    expect(states.filter((state) => state === "MISSING")).toHaveLength(1);
    expect(states.filter((state) => state === "CANDIDATES")).toHaveLength(7);
    expect(states.filter((state) => state === "MATCHED")).toHaveLength(1);
    expect(states[0]).toBe("MISSING");
    for (const line of draft.lines.slice(1, -1)) {
      const status = getLineReconStatus(line, getFieldRows(line, []), workspace.sources, getInspectionAvailability(draft, line, workspace.sources, true));
      expect(status.aiStatus).toBe("CANDIDATES");
      expect(status.canConfirm).toBe(false);
      expect(status.hasInspection).toBe(false);
    }
  });

  it("用户改动型号后旧样本结论失效；建立关系后才算已确定依据", () => {
    const line = draft.lines[1];
    const changed = { ...line, model: "NOT-IN-INSPECTION" };
    expect(getInspectionAvailability(draft, changed, workspace.sources, true)).toBe("MISSING");
    expect(getInspectionAvailability(draft, { ...line, relationSourceId: "source", relationSourceIds: ["source"] }, workspace.sources, true)).toBe("MATCHED");
  });

  it("其他已有查货样本也不再整单显示为无依据", () => {
    for (const displayNo of ["2025YBT010-2", "2026AG001", "2026BMH001", "YK-260625131-1", "YK-260625131-2", "YK-260625131-3"]) {
      const task = workspace.drafts.find((item) => item.displayNo === displayNo)!;
      expect(task.lines.some((line) => getInspectionAvailability(task, line, workspace.sources, true) === "CANDIDATES"), displayNo).toBe(true);
    }
  });

  it("在商品对应页选定候选后，真实关系同步到工作台与商品汇总", () => {
    useDemoStore.getState().loadScenario("BUSINESS");
    const before = useDemoStore.getState();
    const line = before.drafts.find((item) => item.id === draft.id)!.lines[1];
    const sourceId = "I-970b59d6d5b8-26036383-L001";
    before.selectLineSource(line.id, sourceId, draft.id);
    const after = useDemoStore.getState();
    const updatedDraft = after.drafts.find((item) => item.id === draft.id)!;
    expect(after.relations.some((relation) => relation.active && relation.entrustmentLineId === line.id && relation.inspectionSourceLineIds.includes(sourceId))).toBe(true);
    expect(getInspectionAvailability(updatedDraft, updatedDraft.lines[1], after.sources, true)).toBe("MATCHED");
    const summary = getCustomerWorkbench(after).customers.find((customer) => customer.name.includes("浦壹"))!.commoditySummary;
    expect(summary.items.find((item) => item.lineId === line.id)?.statusText).toBe("人工已对应");
  });

  it("浦壹真实模型结果可以在完整业务场景回放", () => {
    useDemoStore.getState().loadScenario("BUSINESS");
    useDemoStore.getState().selectDraft(draft.id);
    useDemoStore.getState().matchSelectedDraft();
    const state = useDemoStore.getState();
    expect(state.toast).not.toMatch(/失败|变化|不能/);
    expect(state.drafts.find((item) => item.id === draft.id)!.lines.filter((line) => line.relationSourceIds.length > 0)).toHaveLength(1);
  });
});
