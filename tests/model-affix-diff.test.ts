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

  it('英卡科技应准确归集 9 个商品，其中 5 自动对应、1 后缀提醒、2 需人工选择、1 暂无查货依据', () => {
    const yingka = workbench.customers.find((c) => c.name.includes('英卡'));
    expect(yingka).toBeDefined();

    const summary = yingka!.commoditySummary;
    expect(summary).toBeDefined();
    expect(summary.totalCount).toBe(9);
    expect(summary.exactCount).toBe(5);
    expect(summary.affixDiffCount).toBe(1);
    expect(summary.multipleCount).toBe(2);
    expect(summary.noCandidateCount).toBe(1);
    expect(summary.conflictCount).toBe(0);
    expect(summary.actionRequiredItems.length).toBe(2);

    // 验证 74HC00PW-Q100 为 CORE_MODEL_WITH_AFFIX_DIFF
    const hc00 = summary.items.find((it) => it.entrustmentModel === '74HC00PW-Q100');
    expect(hc00).toBeDefined();
    expect(hc00!.relationLevel).toBe('CORE_MODEL_WITH_AFFIX_DIFF');
    expect(hc00!.statusText).toBe('已自动对应 · 有提醒');
    expect(hc00!.noticeText).toContain(',118');
    expect(hc00!.inspectionModel).toBe('74HC00PW-Q100,118');

    // 验证 ABC123 (YK-2) 与 ZX990 (YK-3) 需人工选择
    const multiItems = summary.items.filter((it) => it.relationLevel === 'MULTIPLE_MODEL_CANDIDATES');
    expect(multiItems.length).toBe(2);
    expect(multiItems.map((m) => m.entrustmentModel)).toEqual(['ABC123', 'ZX990']);
  });

  it('浦壹 26SHPYD056 包含 8 个已自动对应（7 无问题 · 1 有后缀提醒）及 1 个暂无依据', () => {
    const puyi = workbench.customers.find((c) => c.name.includes('浦壹'));
    expect(puyi).toBeDefined();

    const summary = puyi!.commoditySummary;
    expect(summary).toBeDefined();
    expect(summary.totalCount).toBe(9);
    expect(summary.exactCount).toBe(7);
    expect(summary.affixDiffCount).toBe(1);
    expect(summary.noCandidateCount).toBe(1);
    expect(summary.multipleCount).toBe(0);
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
      '9 个商品：8 已自动对应（7 无问题 · 1 有型号差异提醒）· 1 暂无查货依据 · 当前无需人工选择'
    );
  });

  it('2026BMH001 具有人工选择提醒的构成式进度', () => {
    const bmh = pendingTasks.find((t) => t.displayNo === '2026BMH001');
    expect(bmh).toBeDefined();
    expect(bmh!.compositionalProgress).toContain('5 已自动对应 · 6 需要人工选择');
  });
});
