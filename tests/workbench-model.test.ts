import {beforeEach,describe,expect,it} from 'vitest';
import {useDemoStore} from '../lib/demo-store';
import {getFieldRows, getLineReconStatus} from '../lib/workbench-model';
import {FINAL_OUTPUT_FIELDS} from '../lib/domain/types';
import {promptFixture} from '../lib/domain/prompt-replay';

beforeEach(()=>useDemoStore.getState().loadScenario('SC-08'));
const rows = () => {const s=useDemoStore.getState();return getFieldRows(s.drafts[0].lines[0],s.evidence);};
describe('作业台字段与人工决策',()=>{
  it('完整 25 字段有来源不等于已核验，空白选填不阻塞',()=>{
    expect(rows().map(r=>r.field)).toEqual([...FINAL_OUTPUT_FIELDS]);
    expect(rows().some(r=>r.verified)).toBe(false);
    expect(rows().find(r=>r.field==='托盘数')).toMatchObject({missing:true,needsHuman:false,valueOrigin:'EMPTY'});
  });
  it('真实 P4 状态、原始空值和多条证据',()=>{
    useDemoStore.getState().matchSelectedDraft();
    expect(rows().find(r=>r.field==='入仓号')).toMatchObject({baseValue:null,currentValue:'25120336',action:'FILL',valueOrigin:'AI'});
    expect(rows().find(r=>r.field==='数量')).toMatchObject({verified:false,verificationStatus:'NO_EVIDENCE'});
    const model=rows().find(r=>r.field==='型号')!;
    expect(model.evidence.find(e=>e.modelDecision)?.references).toHaveLength(promptFixture.verificationTargets[0].fields.model.evidence.length);
    expect(model.evidence.find(e=>e.modelDecision)?.references?.[0].normalizedValue).toBe('H25G9TCXXCX702A');
  });
  it('确认当前值保留原因和锁定，可解锁，封版禁止修改',()=>{
    const s=useDemoStore.getState();const id=s.drafts[0].lines[0].id;
    s.editSelectedLineField(id,'毛重','4.2',{actor:'Demo 当前用户',reason:'以最终委托为准',occurredAt:'2026-09-21T00:00:00Z',locked:true});
    expect(rows().find(r=>r.field==='毛重')).toMatchObject({human:true,locked:true,verified:true,status:'人工已确认'});
    expect(useDemoStore.getState().versions.at(-1)?.after[0].lockedFields).toContain('毛重');
    expect(useDemoStore.getState().evidence.at(-1)?.review?.reason).toBe('以最终委托为准');
    s.editSelectedLineField(id,'毛重','4.2',{actor:'Demo 当前用户',reason:'解除锁定',occurredAt:'2026-09-21T00:01:00Z',locked:false});
    expect(rows().find(r=>r.field==='毛重')?.locked).toBe(false);
    const state=useDemoStore.getState();useDemoStore.setState({drafts:state.drafts.map(d=>({...d,finalized:true,status:'已完成'}))});
    s.editSelectedLineField(id,'毛重','9');
    expect(rows().find(r=>r.field==='毛重')?.currentValue).toBe('4.2');
  });
  it('冲突必须说明原因，解决后不因历史证据重复告警',()=>{
    const s=useDemoStore.getState();const d=s.drafts[0];const id=d.lines[0].id;
    useDemoStore.setState({drafts:[{...d,lines:d.lines.map((l,i)=>i===0?{...l,issueIds:['字段冲突:毛重'],relationSourceIds:['I-8bc7177252aa-25120336-L001']}:l)}]});
    const review={actor:'Demo 当前用户',reason:'',occurredAt:'2026-09-21T00:00:00Z',locked:true};
    s.editSelectedLineField(id,'毛重','9',review);
    expect(rows().find(r=>r.field==='毛重')?.conflict).toBe(true);
    s.editSelectedLineField(id,'毛重','9',{...review,reason:'采用复核重量'});
    expect(rows().find(r=>r.field==='毛重')).toMatchObject({conflict:false,currentValue:'9',human:true});
    expect(useDemoStore.getState().evidence.at(-1)?.hadConflict).toBe(true);
  });
  it('解绑后不再把历史 P4 判断当作当前核验',()=>{
    useDemoStore.getState().matchSelectedDraft();
    const id=useDemoStore.getState().drafts[0].lines[0].id;
    useDemoStore.getState().unbindSelectedLine(id);
    expect(rows().some(r=>r.decision)).toBe(false);
    expect(useDemoStore.getState().evidence.some(e=>e.modelDecision)).toBe(true);
  });
  it('准确计算商品行核对状态（未核对、已基于查货核对、人工修正）',()=>{
    const s=useDemoStore.getState();
    const line0 = s.drafts[0].lines[0];
    const fieldRows0 = getFieldRows(line0, s.evidence);
    const statusBefore = getLineReconStatus(line0, fieldRows0, s.sources);
    expect(statusBefore.stateCode).toBe('UNCHECKED');
    expect(statusBefore.hasInspection).toBe(false);

    // 匹配后
    s.matchSelectedDraft();
    const line0Matched = useDemoStore.getState().drafts[0].lines[0];
    const fieldRowsMatched = getFieldRows(line0Matched, useDemoStore.getState().evidence);
    const statusMatched = getLineReconStatus(line0Matched, fieldRowsMatched, useDemoStore.getState().sources);
    expect(statusMatched.hasInspection).toBe(true);

    // 人工修改毛重后
    s.editSelectedLineField(line0Matched.id, '毛重', '4.5', { actor: '测试', reason: '人工核对修改', occurredAt: '2026-09-21T00:00:00Z', locked: false });
    const line0Edited = useDemoStore.getState().drafts[0].lines[0];
    const fieldRowsEdited = getFieldRows(line0Edited, useDemoStore.getState().evidence);
    const statusEdited = getLineReconStatus(line0Edited, fieldRowsEdited, useDemoStore.getState().sources);
    expect(statusEdited.isHumanModified).toBe(true);
    expect(statusEdited.stateCode).toBe('USER_MODIFIED');
    expect(statusEdited.badgeText).toContain('已人工修正');
  });
  it('支持在人工确认中退回修改（返回上一步）',()=>{
    const s=useDemoStore.getState();
    s.matchSelectedDraft();
    // 解决冲突以允许提交人工确认
    const line0 = useDemoStore.getState().drafts[0].lines[0];
    s.editSelectedLineField(line0.id, '毛重', '4.2', { actor: '测试', reason: '解决冲突', occurredAt: '2026-09-21T00:00:00Z', locked: false });
    s.submitSelectedDraft();
    expect(useDemoStore.getState().drafts[0].status).toBe('人工确认中');

    // 退回修改
    useDemoStore.getState().revertDraftToReview();
    expect(useDemoStore.getState().drafts[0].status).not.toBe('人工确认中');
    expect(useDemoStore.getState().toast).toBe('已退回核对与修改状态');
  });
});

