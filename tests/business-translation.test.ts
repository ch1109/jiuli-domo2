import { describe, expect, it } from "vitest";
import {
  BUSINESS_TERMS,
  generateCustomerStory,
  generateTaskProcessStages,
  generateWorkspaceSummary,
  translateAvailability,
  translateCoverage,
  translateRelationStatus,
} from "../lib/business-translation";
import { getCustomerWorkbench } from "../lib/customer-workbench-model";
import { buildBusinessWorkspace, useDemoStore } from "../lib/demo-store";

describe("业务语义翻译层 (business-translation)", () => {
  it("正确将技术术语降维翻译为业务术语", () => {
    expect(BUSINESS_TERMS.entrustmentProduct).toBe("待核对商品");
    expect(BUSINESS_TERMS.inspectionRawRow).toBe("查货明细");
    expect(BUSINESS_TERMS.inspectionMergedProduct).toBe("可匹配商品");
    expect(BUSINESS_TERMS.p1Stage).toBe("委托材料识别");
    expect(BUSINESS_TERMS.p2Stage).toBe("查货材料识别");
    expect(BUSINESS_TERMS.p3Stage).toBe("商品自动对应");
    expect(BUSINESS_TERMS.p4Stage).toBe("字段自动核对");

    expect(translateRelationStatus("MATCHED").label).toContain("已找到");
    expect(translateRelationStatus("MULTIPLE_CANDIDATES").label).toContain("多");
    expect(translateRelationStatus("UNMATCHED").label).toContain("暂无");

    expect(translateCoverage("COMPLETE")).toBe("查货依据完整");
    expect(translateCoverage("PARTIAL")).toBe("查货依据不完整");
    expect(translateCoverage("UNCERTAIN")).toBe("覆盖范围待确认");

    expect(translateAvailability("草稿占用")).toBe("已用于当前委托");
    expect(translateAvailability("已核销")).toBe("已完成使用");
  });

  it("基于当前状态生成人话业务总览与指标", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);
    const summary = generateWorkspaceSummary(model);

    expect(summary.headline).toBe("今日业务概况");
    expect(summary.storyLead).toMatch(/当前有 \d+ 票委托正在处理。/);
    expect(summary.storyDetail).toMatch(/其中 \d+ 票正在等待查货对应/);
    expect(summary.metrics.length).toBeGreaterThanOrEqual(5);
  });

  it("正确为客户生成故事卡叙事", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);
    const puyi = model.customers.find((c) => c.name.includes("浦壹") || c.name.includes("海量")) ?? model.customers[0];

    const story = generateCustomerStory(puyi);
    expect(story.name).toBe(puyi.name);
    expect(story.currentStatusText).toMatch(/当前有 \d+ 票委托正在核对|所有委托已完成|当前暂无/);
    expect(story.materialsSummary).toMatch(/委托书 \d+份 · 箱单 \d+份 · 查货单 \d+份/);
    expect(story.aiOrderSummary).toMatch(/委托书识别出 \d+ 个待核对商品/);
    expect(story.progressText).toMatch(/\d+ \/ \d+ 个商品找到查货依据/);
    expect(story.nextStepText.length).toBeGreaterThan(0);
  });

  it("正确为任务生成五阶段流转进度条", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const draft = state.drafts[0];
    const stages = generateTaskProcessStages(draft, state.sources, 9, 3);

    expect(stages).toHaveLength(5);
    expect(stages[0].title).toBe("整理委托材料");
    expect(stages[0].code).toBe("P1");
    expect(stages[0].status).toBe("completed");

    expect(stages[1].title).toBe("整理查货材料");
    expect(stages[1].code).toBe("P2");

    expect(stages[2].title).toBe("自动寻找商品对应");
    expect(stages[2].code).toBe("P3");

    expect(stages[3].title).toBe("自动核对字段");
    expect(stages[3].code).toBe("P4");

    expect(stages[4].title).toBe("人工最终确认");
  });
});
