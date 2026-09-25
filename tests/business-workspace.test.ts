import { describe, expect, it } from 'vitest';
import { buildBusinessWorkspace, useDemoStore } from '../lib/demo-store';
import { getCustomerWorkbench } from '../lib/customer-workbench-model';

describe('完整客户业务与场景隔离', () => {
  it('展示全部事实并隔离客户未知查货，不预造匹配结果', () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);
    expect(data.files).toHaveLength(72);
    expect(data.drafts).toHaveLength(12);
    expect(data.drafts.flatMap(d => d.lines)).toHaveLength(50);
    expect(data.sources).toHaveLength(122);
    expect(data.sources.filter(s => !s.customerId)).toHaveLength(29);
    expect(model.customers).toHaveLength(9);
    expect(model.customers.every(c => c.files.length > 0)).toBe(true);
    expect(model.customers.reduce((n,c) => n+c.counts.raw,0)).toBe(122);
    expect(model.relations.filter(r => r.status === 'MATCHED')).toHaveLength(1);
    expect(model.relations.some(r => r.status === 'MULTIPLE_CANDIDATES')).toBe(true);
    expect(model.relations.some(r => r.status === 'PENDING')).toBe(true);
    expect(model.customers.every(c => c.counts.packingFiles === 0)).toBe(true);
  });
  it('完整业务编辑在进入场景、返回以及恢复场景后保持独立', () => {
    useDemoStore.setState(useDemoStore.getInitialState(), true);
    const draftId = useDemoStore.getState().drafts[0].id;
    useDemoStore.setState(s => ({ drafts: s.drafts.map(d => d.id === draftId ? {...d, lastUpdateReason: '保留业务编辑'} : d) }));
    useDemoStore.getState().loadScenario('SC-08');
    expect(useDemoStore.getState().drafts).toHaveLength(1);
    useDemoStore.getState().openBusinessWorkspace();
    expect(useDemoStore.getState().drafts).toHaveLength(12);
    expect(useDemoStore.getState().drafts[0].lastUpdateReason).toBe('保留业务编辑');
    useDemoStore.getState().restorePreviousScenario();
    expect(useDemoStore.getState().scenarioId).toBe('SC-08');
    expect(useDemoStore.getState().drafts).toHaveLength(1);
  });
});
