import { describe, expect, it } from 'vitest';
import { FINAL_OUTPUT_FIELDS } from '../lib/domain/types';
import { useDemoStore } from '../lib/demo-store';
const store = () => useDemoStore.getState();
const ids = ['I-8bc7177252aa-25120336-L001', 'I-8bc7177252aa-25120336-L002'];

describe('自测阻断修复', () => {
  for (const scenario of ['SC-01', 'SC-02', 'SC-06']) it(`${scenario} 按配方建稿并记录来源，不重复创建`, () => {
    store().loadScenario(scenario);
    expect(store().drafts).toHaveLength(0);
    store().createDraft();
    expect(store().drafts).toHaveLength(1);
    const draft = store().drafts[0];
    expect(draft.lines.length).toBeGreaterThan(0);
    expect(draft.lines.every(line => line.sourceLocation?.fileId === draft.materialFileIds[0])).toBe(true);
    expect(store().versions).toHaveLength(1);
    store().createDraft();
    expect(store().drafts).toHaveLength(1);
    if (scenario === 'SC-02') {
      expect(draft.customerId).toBeNull();
      store().matchSelectedDraft();
      expect(store().relations).toHaveLength(0);
      store().resolveSelectedDraftCustomer('C-66be07d6cabe');
    }
    store().matchSelectedDraft();
    const current = store().drafts[0];
    expect(store().relations.length).toBeGreaterThan(0);
    expect(store().sources.filter(source => source.occupiedDraftId === current.id).every(source => source.customerId === current.customerId)).toBe(true);
  });
  for (const scenario of ['SC-14', 'SC-15', 'SC-16', 'SC-21']) it(`${scenario} 人工选料保留差异，处理后完成`, () => {
    store().loadScenario(scenario);
    const lines = store().drafts[0].lines;
    store().matchSelectedDraft();
    expect(store().relations).toHaveLength(0);
    store().selectLineSource(lines[0].id, ids[0]);
    store().submitSelectedDraft();
    expect(store().drafts[0].status).not.toBe('人工确认中');
    store().selectLineSource(lines[1].id, ids[1]);
    expect(store().relations.every(relation => relation.establishedBy === '人工')).toBe(true);
    expect(store().drafts[0].lines[0].fields.型号).toBe(lines[0].fields.型号);
    expect(store().drafts[0].lines[0].issueIds).toContain('字段冲突:型号');
    store().submitSelectedDraft();
    expect(store().drafts[0].status).toBe('人工确认中');
    store().completeSelectedDraft();
    expect(store().finalReconciliations).toHaveLength(0);
    for (const line of store().drafts[0].lines) {
      for (const issue of line.issueIds) {
        expect(issue.startsWith('字段冲突:')).toBe(true);
        store().confirmSelectedLineField(line.id, issue.slice(5) as keyof typeof line.fields);
      }
      store().confirmLine(line.id);
    }
    store().completeSelectedDraft();
    expect(store().drafts[0].status, store().toast ?? '').toBe('已完成');
    expect(store().finalReconciliations).toHaveLength(1);
    const sheet = store().finalReconciliations[0];
    expect(Object.keys(sheet.rows[0])).toEqual([...FINAL_OUTPUT_FIELDS]);
    expect(sheet.totals).toMatchObject({ 数量: '28135', 件数: '2', 净重: '8.0', 毛重: '9.2' });
    expect(store().sources.filter(source => source.availability === '已核销').map(source => source.id)).toEqual(ids);
  });
  it('人工入口拒绝跨客户和重复关系', () => {
    store().loadScenario('SC-01'); store().createDraft();
    const line = store().drafts[0].lines[0];
    const other = store().sources.find(source => source.availability === '可匹配' && source.customerId !== store().drafts[0].customerId)!;
    store().selectLineSource(line.id, other.id);
    expect(store().relations).toHaveLength(0);
    store().selectLineSource(line.id, ids[0]);
    store().selectLineSource(line.id, ids[1]);
    expect(store().relations).toHaveLength(1);
    expect(store().sources.find(source => source.id === ids[1])?.availability).toBe('可匹配');
  });
});


describe('人工关系的确认状态保护', () => {
  it('改配必须撤销旧确认，组合入口不能给已有关系重复加料', () => {
    store().loadScenario('SC-09');
    const draft = store().drafts[0];
    const line = draft.lines[0];
    const candidates = store().sources.filter(source => source.customerId === draft.customerId && source.availability === '可匹配' && source.model === line.model);
    store().selectLineSource(line.id, candidates[0].id);
    useDemoStore.setState({ drafts: store().drafts.map(item => ({ ...item, lines: item.lines.map(row => row.id === line.id ? { ...row, manuallyConfirmed: true, status: '人工已确认' as const } : row) })) });
    store().reassignSelectedLine(line.id, candidates[1].id);
    expect(store().drafts[0].lines[0].manuallyConfirmed).toBe(false);
    expect(store().drafts[0].lines[0].status).not.toBe('人工已确认');
    const before = store().relations;
    store().establishCompositeForLine(line.id, [candidates[0].id]);
    expect(store().relations).toEqual(before);
    expect(store().toast).toContain('已有依据');
  });
});
