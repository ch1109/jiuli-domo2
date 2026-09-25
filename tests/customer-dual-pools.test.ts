import { describe, it, expect } from 'vitest';
import { buildBusinessWorkspace, useDemoStore } from '../lib/demo-store';
import { getCustomerWorkbench, getBatchRelationQuestions } from '../lib/customer-workbench-model';
import { generateCustomerStory } from '../lib/business-translation';

describe('客户级双池并立、关系矩阵与异步增量核对模型验证', () => {
  const data = buildBusinessWorkspace();
  const state = { ...useDemoStore.getInitialState(), ...data };
  const model = getCustomerWorkbench(state);

  it('正确识别多任务客户（英卡科技 >= 2 票任务）与单任务客户', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'));
    expect(yingka).toBeDefined();
    expect(yingka?.isMultiTask).toBe(true);
    expect(yingka?.tasks.length).toBeGreaterThanOrEqual(2);

    const puyi = model.customers.find((c) => c.name.includes('浦壹') || c.id === 'C-132ffbd28c07');
    expect(puyi).toBeDefined();
    expect(puyi?.tasks.length).toBe(1);
  });

  it('多任务客户生成完整的双池结构（委托任务池 + 查货资料池）', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    expect(yingka.dualPools).toBeDefined();
    expect(yingka.dualPools.entrustmentPool.length).toBe(yingka.tasks.length);
    expect(yingka.dualPools.inspectionPool.length).toBeGreaterThanOrEqual(2);

    // 检查委托池卡片
    const taskCard = yingka.dualPools.entrustmentPool.find((t) => t.displayNo === 'YK-260625131-1');
    expect(taskCard).toBeDefined();
    expect(taskCard?.totalLines).toBe(3);
    expect(taskCard?.usedInspectionBatches.length).toBeGreaterThan(0);

    // 检查查货池卡片
    const ch001 = yingka.dualPools.inspectionPool.find((b) => b.displayNo.includes('CH001'));
    expect(ch001).toBeDefined();
    expect(ch001?.rawRowCount).toBeGreaterThan(0);
    expect(ch001?.availableCount).toBeGreaterThanOrEqual(0);
  });

  it('「委托任务 × 查货批次」关系矩阵精准刻画多对多交集与下钻数据', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    expect(yingka.relationMatrix).toBeDefined();
    expect(yingka.relationMatrix.rows.length).toBe(yingka.tasks.length);
    expect(yingka.relationMatrix.columns.length).toBeGreaterThanOrEqual(2);

    // 查找 YK-1 与 CH001 的单元格
    const yk1Row = yingka.relationMatrix.rows.find((r) => r.displayNo === 'YK-260625131-1')!;
    const ch001Col = yingka.relationMatrix.columns.find((c) => c.displayNo.includes('CH001'))!;
    const cellKey = `${yk1Row.id}_${ch001Col.id}`;
    const cell = yingka.relationMatrix.cells[cellKey];

    expect(cell).toBeDefined();
    expect(cell.matchedCount).toBe(1);
    expect(cell.statusVariant).toBe('matched');
    expect(cell.statusText).toContain('箱1~箱4');
    expect(cell.relations.length).toBe(1);
    expect(cell.relations[0].taskLineModel).toBe('UMW2631');
    expect(cell.relations[0].sourceRowQuantity).toContain('60000');

    // 查找 YK-2 与 CH003 的多候选待人工裁决单元格
    const yk2Row = yingka.relationMatrix.rows.find((r) => r.displayNo === 'YK-260625131-2')!;
    const ch003Col = yingka.relationMatrix.columns.find((c) => c.displayNo.includes('CH003'))!;
    const multiCellKey = `${yk2Row.id}_${ch003Col.id}`;
    const multiCell = yingka.relationMatrix.cells[multiCellKey];

    expect(multiCell).toBeDefined();
    expect(multiCell.multipleCount).toBe(1);
    expect(multiCell.statusVariant).toBe('multiple');
    expect(multiCell.statusText).toContain('候选待人工确认');
  });

  it('客户级全局库存指标正确统计自由查货库存与等待委托商品', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    expect(yingka.inventory).toBeDefined();
    expect(yingka.inventory.unassignedSourcesCount).toBeGreaterThanOrEqual(0);
    expect(yingka.inventory.unassignedBatchesCount).toBeGreaterThanOrEqual(0);
    expect(yingka.inventory.waitingLinesCount).toBeGreaterThanOrEqual(0);
    expect(yingka.inventory.waitingTasksCount).toBeGreaterThanOrEqual(0);
  });

  it('时间轴与增量影响分析器反映材料异步到达与影响范围', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    expect(yingka.timelineEvents.length).toBeGreaterThanOrEqual(3);

    // 时间轴包含委托与查货异步交替节点
    const types = yingka.timelineEvents.map((e) => e.type);
    expect(types).toContain('inspection');
    expect(types).toContain('entrustment');

    // 增量影响分析卡片包含新到批次与受影响任务
    expect(yingka.latestIncrementalImpact).toBeDefined();
    expect(yingka.latestIncrementalImpact?.batchDisplayNo).toContain('CH002');
    expect(yingka.latestIncrementalImpact?.newProductCount).toBeGreaterThan(0);
    expect(yingka.latestIncrementalImpact?.affectedTasks.length).toBeGreaterThan(0);
  });

  it('业务故事卡层支持多任务聚合视图与单任务故事卡视图', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const yingkaStory = generateCustomerStory(yingka);
    expect(yingkaStory.isMultiTask).toBe(true);
    expect(yingkaStory.multiTask).toBeDefined();
    expect(yingkaStory.multiTask?.tasksSummary).toContain('委托任务并发处理');
    expect(yingkaStory.multiTask?.statusPills.length).toBeGreaterThan(0);
    expect(yingkaStory.multiTask?.topTasks.length).toBeGreaterThan(0);

    const puyi = model.customers.find((c) => c.name.includes('浦壹') || c.id === 'C-132ffbd28c07')!;
    const puyiStory = generateCustomerStory(puyi);
    expect(puyiStory.isMultiTask).toBe(false);
  });

  it('批次关系清单准确回答 3 大关键业务问题 (Q1/Q2/Q3)', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const questions = getBatchRelationQuestions(yingka);
    expect(questions.length).toBe(3);

    expect(questions[0].id).toBe('Q1');
    expect(questions[0].question).toContain('CH001 被谁用了');
    expect(questions[0].summary).toContain('12 条查货原始明细');

    expect(questions[1].id).toBe('Q2');
    expect(questions[1].question).toContain('YK-1 用了哪些批次');
    expect(questions[1].summary).toContain('3 个待核对商品');

    expect(questions[2].id).toBe('Q3');
    expect(questions[2].question).toContain('新批次 CH003 来了以后影响谁');
    expect(questions[2].summary).toContain('影响 YK-260625131-2');
  });

  it('UMW2631 查货多行合并后单候选高置信度直接匹配成功，不展示多候选警告', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const summary = yingka.commoditySummary!;
    const umwYk1 = summary.items.find(
      (it) => it.taskDisplayNo === 'YK-260625131-1' && it.entrustmentModel === 'UMW2631'
    );
    expect(umwYk1).toBeDefined();
    expect(umwYk1?.relationLevel).toBe('EXACT_MODEL');
    expect(umwYk1?.sourceBatches?.length).toBeGreaterThan(0);
    expect(umwYk1?.inspectionQuantity).toBe('177000 PCS');
  });

  it('双池卡片与关系矩阵单元格展示具体商品型号依据', () => {
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const yk1Card = yingka.dualPools.entrustmentPool.find((c) => c.displayNo === 'YK-260625131-1');
    expect(yk1Card).toBeDefined();
    expect(yk1Card?.confirmedInspectionBatches?.length).toBeGreaterThan(0);
    expect(yk1Card?.confirmedInspectionBatches?.[0]).toContain('CH001');

    const ch001Card = yingka.dualPools.inspectionPool.find((c) => c.displayNo.includes('CH001'));
    expect(ch001Card).toBeDefined();
    expect(ch001Card?.confirmedTaskItems?.length).toBeGreaterThan(0);

    // 矩阵单元格包含明确型号
    const yk1Row = yingka.relationMatrix.rows.find((r) => r.displayNo === 'YK-260625131-1')!;
    const ch001Col = yingka.relationMatrix.columns.find((c) => c.displayNo.includes('CH001'))!;
    const cellKey = `${yk1Row.id}_${ch001Col.id}`;
    const cell = yingka.relationMatrix.cells[cellKey];
    expect(cell.commoditySummary).toContain('UMW2631');
  });
});
