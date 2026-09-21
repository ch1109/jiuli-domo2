import { describe, expect, it } from 'vitest';
import { useDemoStore } from '../lib/demo-store';
import { completeDraft, type CompleteDraftInput } from '../lib/domain/finalization';
function ready(): CompleteDraftInput {
  const store = () => useDemoStore.getState();
  store().loadScenario('SC-08'); store().matchSelectedDraft(); store().submitSelectedDraft();
  for (const line of store().drafts[0].lines) store().confirmLine(line.id);
  const state = store(); const draft = state.drafts[0];
  return structuredClone({
    draft: { ...draft, status: '人工确认中', isFinalized: false, lineIds: draft.lines.map(l => l.id) },
    entrustmentLines: draft.lines,
    inspectionSourceLines: state.sources.filter(s => s.availability !== '未加载').map(s => ({ ...s, status: s.availability })),
    activeRelations: state.relations,
    now: '2026-09-20T12:00:00Z', confirmedBy: '测试审核员',
  }) as CompleteDraftInput;
}
describe('最终核销关系完整性', () => {
  const corruptions: Record<string, (input: CompleteDraftInput) => CompleteDraftInput> = {
    '空草稿': i => ({ ...i, entrustmentLines: [], activeRelations: [] }),
    '缺少客户': i => ({ ...i, draft: { ...i.draft, customerId: null } }),
    '关系属于其他草稿': i => ({ ...i, activeRelations: i.activeRelations.map((r, n) => n ? r : { ...r, draftId: 'OTHER' }) }),
    '关系引用不存在的查货行': i => ({ ...i, inspectionSourceLines: i.inspectionSourceLines.slice(1) }),
    '查货行占用错委托行': i => ({ ...i, inspectionSourceLines: i.inspectionSourceLines.map((s, n) => n ? s : { ...s, occupiedEntrustmentLineId: 'OTHER' }) }),
    '查货行客户不符': i => ({ ...i, inspectionSourceLines: i.inspectionSourceLines.map((s, n) => n ? s : { ...s, customerId: 'OTHER' }) }),
    '查货行不在占用状态': i => ({ ...i, inspectionSourceLines: i.inspectionSourceLines.map((s, n) => n ? s : { ...s, status: '已核销' }) }),
    '委托行关系ID失配': i => ({ ...i, entrustmentLines: i.entrustmentLines.map((l, n) => n ? l : { ...l, matchRelationIds: ['UNKNOWN'] }) }),
    '同一原始行被两行引用': i => ({ ...i, activeRelations: i.activeRelations.map((r, n) => n ? { ...r, inspectionSourceLineIds: i.activeRelations[0].inspectionSourceLineIds } : r) }),
    '存在额外关系': i => ({ ...i, activeRelations: [...i.activeRelations, { ...i.activeRelations[0], id: 'EXTRA', entrustmentLineId: 'OTHER' }] }),
  };
  for (const [name, corrupt] of Object.entries(corruptions)) it(`${name} 时整体拒绝且不改变输入`, () => {
    const input = corrupt(ready()); const before = structuredClone(input);
    expect(() => completeDraft(input)).toThrow();
    expect(input).toEqual(before);
  });
  it('完整输入仍原子生成最终单和两条核销', () => {
    const result = completeDraft(ready());
    expect(result.draft.isFinalized).toBe(true);
    expect(result.inspectionSourceLines.filter(s => s.status === '已核销')).toHaveLength(2);
  });
});
