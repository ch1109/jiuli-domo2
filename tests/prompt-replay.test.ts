import { beforeEach, describe, expect, it } from 'vitest';
import { buildScenarioState, useDemoStore } from '../lib/demo-store';
import { promptFixture, puyiFixture, replayPromptResult } from '../lib/domain/prompt-replay';
import { createFinalOutputRow } from '../lib/domain/final-output';
import type { ExecuteInitialMatchingInput } from '../lib/domain/actions';
import type { FinalOutputField } from '../lib/domain/types';

function input(): ExecuteInitialMatchingInput {
  const state=buildScenarioState('SC-08'); const draft=state.drafts[0];
  return {draft:{...draft,status:'待核对',isFinalized:false,lineIds:draft.lines.map(l=>l.id)},entrustmentLines:draft.lines,
    inspectionSourceLines:state.sources.filter(s=>s.availability!=='未加载').map(s=>({...s,status:'可匹配'})),now:'2026-09-20T05:00:00Z'};
}

beforeEach(()=>useDemoStore.getState().loadScenario('SC-08'));

describe('真实模型结果回放',()=>{
  it('P1/P2 事实完整接入，查货箱号不被手工转成件数',()=>{
    const state=useDemoStore.getState();
    for (const row of promptFixture.orderRows) {
      const line=state.drafts[0].lines.find(l=>l.id===row.id)!;
      expect(line.fields).toEqual(row.fields);
      expect(line.baseValues).toEqual(row.fields);
      expect(state.evidence.filter(e=>e.entrustmentLineId===row.id)).toHaveLength(row.facts.evidence.length);
    }
    for (const row of promptFixture.sourceLines) {
      const source=state.sources.find(s=>s.id===row.id)!;
      expect(source.fields).toEqual(row.fields);
      expect(source.fields.件数).toBeNull();
      expect(JSON.parse(source.otherFields['范围事实']!)).toEqual(promptFixture.stageOutputs.P2.scope_records);
      expect(JSON.parse(source.otherFields['来源问题']!)).toEqual(promptFixture.stageOutputs.P2.issues);
    }
  });
  it('逐项消费真实 P3/P4，保留全部决策及 NO_EVIDENCE，不重核未请求字段',()=>{
    useDemoStore.getState().matchSelectedDraft();const state=useDemoStore.getState();
    for (const verdict of promptFixture.relations) {
      const relation=state.relations.find(r=>r.entrustmentLineId===verdict.order_row_id)!;
      expect(relation.inspectionSourceLineIds).toEqual(verdict.selected_raw_row_ids);
      expect(relation.modelCoverage).toEqual(verdict.coverage);
    }
    for (const patch of promptFixture.rowPatches) {
      const line=state.drafts[0].lines.find(l=>l.id===patch.order_row_id)!;
      expect(state.evidence.filter(e=>e.entrustmentLineId===line.id && e.modelDecision).map(e=>e.modelDecision)).toEqual(patch.field_decisions);
      for(const d of patch.field_decisions) expect(line.fields[promptFixture.fieldMap[d.field as keyof typeof promptFixture.fieldMap] as FinalOutputField]??'').toBe(d.result_value);
      expect(line.fields.备注).toBeNull();
      expect(state.evidence.find(e=>e.entrustmentLineId===line.id && e.field==='数量' && e.modelDecision)?.modelDecision?.verification_status).toBe('NO_EVIDENCE');
      expect(line.baseValues?.入仓号).toBeNull();
    }
    expect(state.versions).toHaveLength(1);
    expect(state.sources.filter(s=>s.availability==='已核销')).toHaveLength(0);
    useDemoStore.getState().matchSelectedDraft();
    expect(useDemoStore.getState().versions).toHaveLength(1);
  });
  it('输出改变时跟随输出，而不是硬编码两行必然匹配、补入仓号',()=>{
    const fixture=structuredClone(promptFixture);
    fixture.relations[0].match_status='UNMATCHED';fixture.relations[0].selected_raw_row_ids=[];
    const decision=fixture.rowPatches[1].field_decisions.find(d=>d.field==='warehouse_no')!;
    decision.decision='KEEP';decision.result_value='';decision.verification_status='NO_EVIDENCE';decision.evidence_keys=[];
    const result=replayPromptResult(input(),fixture);
    expect(result.relations).toHaveLength(1);
    expect(result.entrustmentLines[0].matchRelationIds).toEqual([]);
    expect(result.entrustmentLines[1].fields.入仓号).toBeNull();
  });
  it('占用冲突整批拒绝，不留下半套关系或字段',()=>{
    const original=input();const changed={...original,inspectionSourceLines:original.inspectionSourceLines.map((s,i)=>i===1?{...s,occupiedDraftId:'OTHER'}:s)};
    expect(()=>replayPromptResult(changed)).toThrow('已被占用');
    expect(original.entrustmentLines.every(l=>!l.matchRelationIds.length && !l.fields.入仓号)).toBe(true);
  });
  it('新增候选、事实变化、人工编辑都不能继续套旧模型结果',()=>{
    const baseline=input();
    const changed={...baseline,inspectionSourceLines:[...baseline.inspectionSourceLines,{...baseline.inspectionSourceLines[0],id:'NEW'}]};
    expect(()=>replayPromptResult(changed)).toThrow('候选范围已变化');
    const facts={...baseline,inspectionSourceLines:baseline.inspectionSourceLines.map((s,i)=>i===0?{...s,fields:{...s.fields,净重:'99'}}:s)};
    expect(()=>replayPromptResult(facts)).toThrow('查货事实已变化');
    const line=useDemoStore.getState().drafts[0].lines[0];
    useDemoStore.getState().editSelectedLineField(line.id,'产地','中国');
    useDemoStore.getState().matchSelectedDraft();
    expect(useDemoStore.getState().relations).toEqual([]);
    expect(useDemoStore.getState().toast).toContain('不能复用旧模型结论');
    expect(useDemoStore.getState().drafts[0].lines[0].fields.产地).toBe('中国');
  });
  it('解绑撤销 AI 入仓号及旧核验，但不覆盖人工值；旧来源仍可追溯',()=>{
    useDemoStore.getState().matchSelectedDraft();const line=useDemoStore.getState().drafts[0].lines[0];
    useDemoStore.getState().unbindSelectedLine(line.id);
    let state=useDemoStore.getState();
    expect(state.drafts[0].lines[0].fields.入仓号).toBeNull();
    expect(state.drafts[0].lines[0].evidenceIds.some(id=>state.evidence.find(e=>e.id===id)?.modelDecision)).toBe(false);
    expect(state.evidence.some(e=>e.modelDecision)).toBe(true);
    useDemoStore.getState().matchSelectedDraft();
    expect(useDemoStore.getState().drafts[0].lines[0].fields.入仓号).toBe('25120336');
    useDemoStore.getState().editSelectedLineField(line.id,'入仓号','人工确认值');
    useDemoStore.getState().unbindSelectedLine(line.id);
    state=useDemoStore.getState();expect(state.drafts[0].lines[0].fields.入仓号).toBe('人工确认值');
  });
  it('完整场景人工确认后才生成25列结果并核销',()=>{
    useDemoStore.getState().matchSelectedDraft();useDemoStore.getState().submitSelectedDraft();
    for(const line of useDemoStore.getState().drafts[0].lines) useDemoStore.getState().confirmLine(line.id);
    useDemoStore.getState().completeSelectedDraft();const state=useDemoStore.getState();
    expect(state.drafts[0].finalized).toBe(true);
    expect(state.finalReconciliations[0].rows).toHaveLength(2);
    expect(Object.keys(state.finalReconciliations[0].rows[0])).toHaveLength(25);
    expect(state.sources.filter(s=>s.availability==='已核销')).toHaveLength(2);
  });
});

describe('连续操作与终态保护',()=>{
  it('已确认行再次编辑后必须重新确认，不能沿用旧确认直接封版',()=>{
    const store=useDemoStore.getState();store.matchSelectedDraft();store.submitSelectedDraft();
    for(const line of useDemoStore.getState().drafts[0].lines) store.confirmLine(line.id);
    const first=useDemoStore.getState().drafts[0].lines[0];
    store.editSelectedLineField(first.id,'备注','重新检查后填写');
    expect(useDemoStore.getState().drafts[0].lines[0].manuallyConfirmed).toBe(false);
    store.completeSelectedDraft();expect(useDemoStore.getState().drafts[0].finalized).toBe(false);
    store.confirmLine(first.id);store.completeSelectedDraft();expect(useDemoStore.getState().drafts[0].finalized).toBe(true);
  });
  it('确认中解绑退出确认阶段，重新匹配后可再次提交，其他已确认行不丢失',()=>{
    const store=useDemoStore.getState();store.matchSelectedDraft();store.submitSelectedDraft();
    for(const line of useDemoStore.getState().drafts[0].lines) store.confirmLine(line.id);
    const first=useDemoStore.getState().drafts[0].lines[0];store.unbindSelectedLine(first.id);
    expect(useDemoStore.getState().drafts[0].status).toBe('部分核对');
    expect(useDemoStore.getState().drafts[0].lines[0].manuallyConfirmed).toBe(false);
    store.matchSelectedDraft();expect(useDemoStore.getState().drafts[0].lines[0].relationSourceIds).toHaveLength(1);
    store.submitSelectedDraft();store.confirmLine(first.id);store.completeSelectedDraft();
    expect(useDemoStore.getState().drafts[0].finalized).toBe(true);
  });
  it('解绑重配后最终证据只引用当前有效证据，历史记录仍保留',()=>{
    const store=useDemoStore.getState();store.matchSelectedDraft();
    const first=useDemoStore.getState().drafts[0].lines[0];
    const oldIds=useDemoStore.getState().evidence.filter(e=>e.entrustmentLineId===first.id && e.modelDecision).map(e=>e.id);
    store.unbindSelectedLine(first.id);store.matchSelectedDraft();store.submitSelectedDraft();
    for(const line of useDemoStore.getState().drafts[0].lines) store.confirmLine(line.id);
    store.completeSelectedDraft();const state=useDemoStore.getState();
    expect(state.finalReconciliations[0].finalEvidenceIds.some(id=>oldIds.includes(id))).toBe(false);
    expect(state.evidence.filter(e=>oldIds.includes(e.id))).toHaveLength(oldIds.length);
  });
  it('必填缺失不核销，补齐后允许继续确认',()=>{
    const store=useDemoStore.getState();store.matchSelectedDraft();store.submitSelectedDraft();
    const first=useDemoStore.getState().drafts[0].lines[0];store.editSelectedLineField(first.id,'品名','');
    for(const line of useDemoStore.getState().drafts[0].lines) store.confirmLine(line.id);
    store.completeSelectedDraft();expect(useDemoStore.getState().drafts[0].finalized).toBe(false);
    expect(useDemoStore.getState().sources.some(s=>s.availability==='已核销')).toBe(false);
    store.editSelectedLineField(first.id,'品名','晶圆');store.confirmLine(first.id);store.completeSelectedDraft();
    expect(useDemoStore.getState().drafts[0].finalized).toBe(true);
  });
  it('封版后编辑、解绑、再次确认和匹配都不改变历史结果',()=>{
    const store=useDemoStore.getState();store.matchSelectedDraft();store.submitSelectedDraft();
    for(const line of useDemoStore.getState().drafts[0].lines) store.confirmLine(line.id);
    store.completeSelectedDraft();const before=structuredClone({draft:useDemoStore.getState().drafts[0],sheets:useDemoStore.getState().finalReconciliations,versions:useDemoStore.getState().versions,sources:useDemoStore.getState().sources});
    const first=before.draft.lines[0];store.editSelectedLineField(first.id,'备注','不应保存');store.unbindSelectedLine(first.id);store.confirmLine(first.id);store.matchSelectedDraft();store.completeSelectedDraft();
    const after=useDemoStore.getState();expect({draft:after.drafts[0],sheets:after.finalReconciliations,versions:after.versions,sources:after.sources}).toEqual(before);
  });
  it('上海浦壹 26SHPYD056 四步全通模型结果正确回放', () => {
    const draft = {
      id: puyiFixture.draftId,
      customerId: puyiFixture.customerId,
      lineIds: puyiFixture.orderRows.map((r: any) => r.id),
      materialFileIds: ['F-df72916dc019'],
      version: 1,
      status: '待核对',
      hasAiUpdate: false,
      isFinalized: false,
      manuallyEditedFieldKeys: [],
      updatedAt: '2026-09-20T05:00:00Z',
    };
    const entrustmentLines = puyiFixture.orderRows.map((r: any) => ({
      id: r.id,
      draftId: puyiFixture.draftId,
      status: '未开始' as const,
      sourceOrder: r.sourceOrder,
      sourceLocation: r.sourceLocation,
      fields: createFinalOutputRow(r.fields),
      baseValues: createFinalOutputRow(r.fields),
      matchRelationIds: [],
      evidenceIds: [],
      issueIds: [],
      updatedFieldNames: [],
      manuallyConfirmed: false,
      manuallyConfirmedFieldNames: [],
      updatedAt: '2026-09-20T05:00:00Z',
    }));
    const inspectionSourceLines = puyiFixture.sourceLines.map((s: any) => ({
      id: s.id,
      logicalInspectionOrderId: s.logicalInspectionOrderId,
      customerId: s.customerId,
      sourceFileId: s.sourceFileId,
      sourceLocation: s.sourceLocation,
      fields: s.fields,
      otherFields: s.otherFields,
      status: '可匹配' as const,
      occupiedDraftId: null,
      occupiedEntrustmentLineId: null,
      updatedAt: '2026-09-20T05:00:00Z',
    }));
    const result = replayPromptResult({
      draft: draft as any,
      entrustmentLines: entrustmentLines as any,
      inspectionSourceLines: inspectionSourceLines as any,
      now: '2026-09-20T05:00:00Z',
    }, puyiFixture);
    expect(result.relations).toHaveLength(1);
    expect(result.entrustmentLines.filter((l: any) => l.status === '待人工处理')).toHaveLength(8);
    expect(result.entrustmentLines.filter((l: any) => l.status === '已找到查货依据')).toHaveLength(1);
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
