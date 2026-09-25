import { describe, it, expect } from 'vitest';
import {
  analyzeModelAffixDiff,
  generateCommodityReconciliationSummary,
  getCustomerWorkbench,
} from '../lib/customer-workbench-model';
import { generatePendingTasksSummary } from '../lib/business-translation';
import { buildBusinessWorkspace, useDemoStore } from '../lib/demo-store';

describe('型号前后缀差异分析 (analyzeModelAffixDiff)', () => {
  it('完全一致时识别为无差异', () => {
    const diff = analyzeModelAffixDiff('74HC00PW', '74HC00PW');
    expect(diff.hasDiff).toBe(false);
    expect(diff.diffType).toBe('none');
    expect(diff.coreModel).toBe('74HC00PW');
  });

  it('标准化（连字符、空格）一致时识别为无差异', () => {
    const diff = analyzeModelAffixDiff('UMW-2631', 'UMW2631');
    expect(diff.hasDiff).toBe(false);
    expect(diff.diffType).toBe('none');
  });

  it('查货型号带包装/编带后缀时正确提取', () => {
    const diff = analyzeModelAffixDiff('74HC00PW-Q100', '74HC00PW-Q100,118');
    expect(diff.hasDiff).toBe(true);
    expect(diff.diffType).toBe('suffix');
    expect(diff.coreModel).toBe('74HC00PW-Q100');
    expect(diff.suffix).toBe(',118');
    expect(diff.explanation).toContain('查货型号多出后缀 [,118]');
  });

  it('查货型号带前缀时正确提取', () => {
    const diff = analyzeModelAffixDiff('ABC123', 'XX-ABC123');
    expect(diff.hasDiff).toBe(true);
    expect(diff.diffType).toBe('prefix');
    expect(diff.coreModel).toBe('ABC123');
    expect(diff.prefix).toBe('XX-');
  });

  it('完全不匹配时识别为复杂差异', () => {
    const diff = analyzeModelAffixDiff('XLIM-ASM05', '10');
    expect(diff.hasDiff).toBe(true);
    expect(diff.diffType).toBe('complex');
  });
});

describe('客户级商品对应汇总 (generateCommodityReconciliationSummary)', () => {
  const data = buildBusinessWorkspace();
  const state = { ...useDemoStore.getInitialState(), ...data };
  const workbench = getCustomerWorkbench(state);

  it('英卡按三键合并后，3 个 UMW2631 直接自动对应成功，6 个无查货依据，无需人工选择', () => {
    const yingka = workbench.customers.find((c) => c.name.includes('英卡'));
    expect(yingka).toBeDefined();

    const summary = yingka!.commoditySummary;
    expect(summary).toBeDefined();
    expect(summary.totalCount).toBe(9);
    expect(summary.exactCount).toBe(3);
    expect(summary.affixDiffCount).toBe(0);
    expect(summary.multipleCount).toBe(0);
    expect(summary.noCandidateCount).toBe(6);
    expect(summary.conflictCount).toBe(0);
    expect(summary.actionRequiredItems.length).toBe(0);
    expect(summary.items.every((item) => state.drafts.some((draft) => draft.lines.some((line) => line.id === item.lineId && line.model === item.entrustmentModel)))).toBe(true);
  });

  it('浦壹 26SHPYD056 查货合并后 8 个已自动对应及 1 个暂无依据', () => {
    const puyi = workbench.customers.find((c) => c.name.includes('浦壹'));
    expect(puyi).toBeDefined();

    const summary = puyi!.commoditySummary;
    expect(summary).toBeDefined();
    expect(summary.totalCount).toBe(9);
    expect(summary.exactCount).toBe(8);
    expect(summary.affixDiffCount).toBe(0);
    expect(summary.multipleCount).toBe(0);
    expect(summary.noCandidateCount).toBe(1);
    expect(summary.actionRequiredItems).toHaveLength(0);
  });
});

describe('构成式进度文案 (compositionalProgress)', () => {
  const data = buildBusinessWorkspace();
  const state = { ...useDemoStore.getInitialState(), ...data };
  const workbench = getCustomerWorkbench(state);
  const pendingTasks = generatePendingTasksSummary(workbench);

  it('26SHPYD056 具有标准构成式进度表达', () => {
    const puyiTask = pendingTasks.find((t) => t.displayNo === '26SHPYD056');
    expect(puyiTask).toBeDefined();
    expect(puyiTask!.compositionalProgress).toBe(
      '9 个商品：8 已建立对应 · 1 暂无查货依据'
    );
  });

  it('2026BMH001 具有人工选择提醒的构成式进度', () => {
    const bmh = pendingTasks.find((t) => t.displayNo === '2026BMH001');
    expect(bmh).toBeDefined();
    expect(bmh!.compositionalProgress).toBe('11 个商品：11 已建立对应');
  });
});
