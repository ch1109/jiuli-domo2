import { beforeEach, describe, expect, it } from 'vitest';
import { useDemoStore } from '../lib/demo-store';
import { getCustomerWorkbench } from '../lib/customer-workbench-model';
import { generateCustomerStory } from '../lib/business-translation';

describe('客户补充流程及AI流水线追溯集成测试', () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState(), true);
  });

  it('点击补充客户进入独立补充客户页面', () => {
    const store = useDemoStore.getState();
    const zwTask = store.drafts.find((d) => d.displayNo === '2026(DG)ZW001');
    expect(zwTask).toBeTruthy();
    expect(zwTask?.customerId).toBeNull();

    // 触发 openCustomerSupplement
    store.openCustomerSupplement(zwTask!.id);

    const updated = useDemoStore.getState();
    expect(updated.view).toBe('customer-supplement');
    expect(updated.targetCustomerSupplementDraftId).toBe(zwTask!.id);
  });

  it('9家客户全量呈现，未确认前为待补充客户且操作为补充客户，确认后完成四步全量贯通', () => {
    const store = useDemoStore.getState();
    const modelBefore = getCustomerWorkbench(store);
    expect(modelBefore.customers).toHaveLength(9); // 9 家客户完整存在

    const zhiweiBefore = modelBefore.customers.find((c) => c.id === 'C-66be07d6cabe');
    expect(zhiweiBefore).toBeTruthy();
    expect(zhiweiBefore!.tasks.length).toBe(0); // 未确认前任务数为 0

    const zwDraftIds = store.drafts
      .filter((d) => ['2026(DG)ZW001', '2026(DG)ZW003', '2026(DG)ZW050'].includes(d.displayNo))
      .map((d) => d.id);

    expect(zwDraftIds.length).toBe(3);

    // 执行批量补充客户并完成商品对应
    store.supplementCustomerForTasks({
      draftIds: zwDraftIds,
      customerId: 'C-66be07d6cabe',
    });

    const stateAfter = useDemoStore.getState();
    const zwTasks = stateAfter.drafts.filter((d) => zwDraftIds.includes(d.id));

    // 检查草稿状态更新
    for (const t of zwTasks) {
      expect(t.customerId).toBe('C-66be07d6cabe');
      expect(t.customerName).toBe('东莞市智微智能科技有限公司');
      expect(t.customerStatus).toBe('已识别');
      // 验证商品行是否已建立查货对应关系
      expect(t.lines.some((l) => l.relationSourceIds.length > 0 || l.relationSourceId !== null)).toBe(true);
    }

    // 检查客户工作台与概览故事
    const modelAfter = getCustomerWorkbench(stateAfter);
    const zhiweiCustomer = modelAfter.customers.find((c) => c.id === 'C-66be07d6cabe');
    expect(zhiweiCustomer).toBeTruthy();
    expect(zhiweiCustomer!.tasks.length).toBe(3); // 补充后任务数为 3

    const story = generateCustomerStory(zhiweiCustomer!);
    expect(story.badge.label).toBe('已完成商品匹配 · 待复核');
    expect(story.badge.variant).toBe('green');
    expect(story.isMultiTask).toBe(false); // 遵循标准规范故事卡，不走带有4个全0方框的多任务卡
    expect(story.actionModel.primaryAction?.text).toBe('进入核对工作台');
    expect(story.unresolvedItems[0]?.text).toContain('P1~P4');
    expect(story.nextStepText).toContain('四个提示词全流程已执行完成');
  });
});
