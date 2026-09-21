import fixtureJson from '../../demo-generated/mock/real-calibration-sc08.json';
import puyiFixtureJson from '../../demo-generated/mock/real-calibration-26shpyd056.json';
import type { ExecuteInitialMatchingInput, ExecuteInitialMatchingResult } from './actions';
import type { FieldEvidence, FinalOutputField, FinalOutputRow, ProductMatchRelation, SourceLocation } from './types';
import { deriveDraftStatus, deriveEntrustmentLineStatus } from './status';
import { createDraftVersionIfChanged, snapshotDraftLine } from './versioning';

export const promptFixture = fixtureJson;
export const puyiFixture = puyiFixtureJson;

export function getPromptFixture(draftId?: string | null, scenarioId?: string | null) {
  if (draftId === puyiFixture.draftId || scenarioId === puyiFixture.scenarioId) {
    return puyiFixture;
  }
  return promptFixture;
}

const defaultFieldMap = fixtureJson.fieldMap as Record<string, FinalOutputField>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameFields = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(b).every(k => a[k] === b[k]);

/** Replay persisted model decisions. No matching, origin priority or field adjudication here. */
export function replayPromptResult(input: ExecuteInitialMatchingInput, fixture: any = getPromptFixture(input.draft.id)): ExecuteInitialMatchingResult {
  const currentFieldMap = (fixture.fieldMap || defaultFieldMap) as Record<string, FinalOutputField>;
  const empty = { ...input, candidatesByLineId: {}, relations: [], evidence: [], operations: [], versions: [] };
  if (input.draft.isFinalized || input.draft.status === '已完成') return empty;
  if (input.draft.id !== fixture.draftId || input.draft.customerId !== fixture.customerId) throw new Error('当前客户或草稿不属于这份模型记录');
  if (input.entrustmentLines.length !== fixture.orderRows.length) throw new Error('委托行已变化，需要重新运行 Prompt');
  const pending = input.entrustmentLines.filter(line => !line.matchRelationIds.length);
  if (!pending.length) return empty;
  // Saved results are valid only for their input snapshot, including competing candidates.
  const pool = input.inspectionSourceLines.filter(s => s.customerId === fixture.customerId && s.status !== '已核销');
  if (pool.length !== fixture.sourceLines.length || pool.some(s => !fixture.sourceLines.some((f: any) => f.id === s.id))) throw new Error('查货候选范围已变化，需要重新运行 Prompt');
  for (const source of fixture.sourceLines) {
    const current = pool.find(s => s.id === source.id);
    if (!current || !sameFields(current.fields as unknown as Record<string, unknown>, source.fields) || !sameFields(current.otherFields, source.otherFields) || current.logicalInspectionOrderId !== source.logicalInspectionOrderId || current.sourceFileId !== source.sourceFileId) throw new Error('查货事实已变化，需要重新运行 Prompt');
  }
  for (const line of input.entrustmentLines) {
    const baseline = fixture.orderRows.find((r: any) => r.id === line.id);
    if (!baseline) throw new Error('委托行已变化，需要重新运行 Prompt');
    // A partially replayed task must also retain the original competing identities.
    const expected = {...baseline.fields} as FinalOutputRow;
    if (line.matchRelationIds.length) {
      const patch = fixture.rowPatches.find((p: any) => p.order_row_id === line.id);
      for (const decision of patch?.field_decisions ?? []) expected[currentFieldMap[decision.field]] = decision.result_value || null;
    }
    if (!sameFields(line.fields, expected) || (!line.matchRelationIds.length && line.manuallyConfirmed)) throw new Error('委托值或人工状态已变化，不能复用旧模型结论');
  }
  const relations: ProductMatchRelation[] = [];
  const evidence: FieldEvidence[] = [];
  const allocated = new Map<string,string>();
  const entrustmentLines = input.entrustmentLines.map(line => {
    if (line.matchRelationIds.length) return line;
    const verdict = fixture.relations.find((r: any) => r.order_row_id === line.id);
    if (!verdict) throw new Error('模型记录缺少委托行关系');
    const issueIds = [...line.issueIds, ...(verdict.issues || []).map((i: {code:string}) => i.code)];
    if (verdict.match_status !== 'MATCHED') return {...line, issueIds, status: deriveEntrustmentLineStatus({activeMatchRelationCount:0,hasBlockingIssue:issueIds.length>0,awaitingCandidateSelection:verdict.match_status==='MULTIPLE_CANDIDATES',manuallyConfirmed:false})};
    const ids = verdict.selected_raw_row_ids;
    if (!ids.length) throw new Error('模型关系未指定查货行');
    const selected = ids.map((id: string) => {
      const source = pool.find(s => s.id === id);
      if (!source || source.status !== '可匹配' || source.occupiedDraftId || source.occupiedEntrustmentLineId || allocated.has(id)) throw new Error('模型选中的查货行已被占用或不可用');
      allocated.set(id,line.id); return source;
    });
    const target = fixture.verificationTargets.find((t: any) => t.order_row_id === line.id);
    const patch = fixture.rowPatches.find((p: any) => p.order_row_id === line.id);
    if (!target || !patch || !same(target.relation.raw_row_ids,ids) || !same(target.relation.coverage,verdict.coverage)) throw new Error('P3 与 P4 关系记录不一致');
    const relationIds: string[] = [];
    // One UI relation per logical document; all raw resources are kept intact.
    for (const logicalId of new Set<string>(selected.map((s: any) => s.logicalInspectionOrderId))) {
      const relationId = `MR-${fixture.auditId}-${line.id}-${logicalId}-v${input.draft.version+1}`;
      relationIds.push(relationId);
      relations.push({id:relationId,draftId:input.draft.id,entrustmentLineId:line.id,logicalInspectionOrderId:logicalId,inspectionMergedProductId:null,inspectionSourceLineIds:selected.filter((s: any)=>s.logicalInspectionOrderId===logicalId).map((s: any)=>s.id),establishedBy:'AI',active:true,createdAt:input.now,invalidatedAt:null,invalidationReason:null,evidenceSummary:`P3 ${fixture.auditId}：${verdict.evidence_keys.join('、')}`,modelCoverage:verdict.coverage,modelEvidenceKeys:verdict.evidence_keys});
    }
    const fields = {...line.fields};
    const updatedFieldNames = [...line.updatedFieldNames];
    const evidenceIds = [...line.evidenceIds];
    for (const decision of patch.field_decisions) {
      const field = currentFieldMap[decision.field];
      const targetField = (target.fields as Record<string, {current_value:string;evidence:Array<{evidence_key:string;source:{file_id:string;page?:number;sheet?:string;row?:number|null;column?:string|null;raw_text:string}}>}>)[decision.field];
      if (!targetField || (fields[field] ?? '') !== targetField.current_value) throw new Error('P4 输入快照失效，不能应用旧字段决策');
      const write = !line.lockedFields?.includes(field) && (decision.decision === 'FILL' || decision.decision === 'UPDATE');
      if (write) {fields[field] = decision.result_value || null; updatedFieldNames.push(field);}
      else if ((fields[field] ?? '') !== decision.result_value && !line.lockedFields?.includes(field)) throw new Error('模型非写入决策改变了值');
      if (line.lockedFields?.includes(field) && (fields[field] ?? '') !== decision.result_value) issueIds.push(`字段冲突:${field}`);
      if (decision.decision === 'CONFLICT') issueIds.push(`字段冲突:${field}`);
      if (decision.missing_required) issueIds.push(`必填缺失:${field}`);
      const raw = targetField.evidence.find(e=>(decision.evidence_keys as string[]).includes(e.evidence_key))?.source;
      const sourceLocation: SourceLocation = raw ? {fileId:raw.file_id,page:raw.page??null,sheet:raw.sheet??null,position:raw.row?`第 ${raw.row} 行`+(raw.column?` ${raw.column}`:''):raw.raw_text} : selected[0].sourceLocation;
      const id=`FE-${fixture.auditId}-${line.id}-${field}-v${input.draft.version+1}`;
      evidenceIds.push(id);
      const references = targetField.evidence.map(e => {
        const source = e.source as typeof e.source & {column?: string; value?: string};
        const fact = e as typeof e & {value?: string;source_kind?: string};
        const candidate = (decision.candidate_values as Array<{value:string;evidence_keys:string[]}>).find(c => c.evidence_keys.includes(e.evidence_key));
        return {key:e.evidence_key,location:{fileId:source.file_id,page:source.page??null,sheet:source.sheet??null,row:source.row,column:source.column,position:null,rawText:source.raw_text},rawValue:source.raw_text??null,normalizedValue:fact.value??candidate?.value??null,sourceKind:fact.source_kind};
      });
      evidence.push({id,references,draftId:input.draft.id,entrustmentLineId:line.id,field,currentValue:fields[field],originalValue:line.fields[field],sourceMaterialType:'查货',sourceFileId:sourceLocation.fileId,sourceLocation,sourceInspectionLineId:selected[0].id,isAiUpdated:write,isManuallyEdited:false,hadConflict:decision.decision==='CONFLICT',candidateValues:decision.candidate_values.map((c:{value:string})=>c.value),modelDecision:decision,modelAuditId:fixture.auditId});
    }
    return {...line,fields,matchRelationIds:relationIds,evidenceIds,issueIds:[...new Set(issueIds)],updatedFieldNames:[...new Set(updatedFieldNames)],status:deriveEntrustmentLineStatus({activeMatchRelationCount:relationIds.length,hasBlockingIssue:issueIds.length>0,awaitingCandidateSelection:false,manuallyConfirmed:false})};
  });
  const inspectionSourceLines = input.inspectionSourceLines.map(s=>allocated.has(s.id)?{...s,status:'草稿占用' as const,occupiedDraftId:input.draft.id,occupiedEntrustmentLineId:allocated.get(s.id)!,updatedAt:input.now}:s);
  const status=deriveDraftStatus({customerId:input.draft.customerId,lineStatuses:entrustmentLines.map(l=>l.status),activeMatchRelationCounts:entrustmentLines.map(l=>l.matchRelationIds.length),submittedForManualConfirmation:input.draft.status==='人工确认中',isFinalized:false});
  const version=createDraftVersionIfChanged({draftId:input.draft.id,version:input.draft.version+1,triggerReason:'回放真实 Prompt 结果',before:input.entrustmentLines.map(snapshotDraftLine),after:entrustmentLines.map(snapshotDraftLine),addedRelationIds:relations.map(r=>r.id),actorType:'系统自动',createdAt:input.now,beforeDraftStatus:input.draft.status,afterDraftStatus:status});
  return {draft:{...input.draft,status,version:version?.version??input.draft.version,hasAiUpdate:!!version,lastUpdateReason:'回放真实 Prompt 结果',updatedAt:input.now},entrustmentLines,inspectionSourceLines,candidatesByLineId:{},relations,evidence,versions:version?[version]:[],operations:version?[{id:`OP-${fixture.auditId}-v${version.version}`,operationType:'AI 首次匹配',actorType:'系统自动',customerId:input.draft.customerId,draftId:input.draft.id,affectedEntrustmentLineIds:version.changedLineIds,affectedInspectionSourceLineIds:[...allocated.keys()],summary:`回放 ${fixture.auditId} 的 P3 关系与 P4 字段决策`,occurredAt:input.now}]:[]};
}

/** P1 nearby sources become the initial field evidence without changing any value. */
export function initialPromptEvidence(fixture: any = promptFixture): FieldEvidence[] {
  const currentFieldMap = (fixture.fieldMap || defaultFieldMap) as Record<string, FinalOutputField>;
  return fixture.orderRows.flatMap((row: any) => (row.facts?.evidence || []).map((fact: any, index: number) => ({
    id:`FE-${fixture.auditId}-P1-${row.id}-${index}`,draftId:fixture.draftId,entrustmentLineId:row.id,field:currentFieldMap[fact.field] ?? fact.field,currentValue:fact.value||null,originalValue:fact.value||null,sourceMaterialType:'委托书' as const,sourceFileId:fact.source.file_id,
    sourceLocation:{fileId:fact.source.file_id,page:fact.source.page ?? null,sheet:fact.source.sheet ?? null,row:fact.source.row ?? null,column:fact.source.column ?? null,rawText:fact.source.raw_text,position:fact.source.row?`第 ${fact.source.row} 行`+(fact.source.column?` ${fact.source.column}`:''):fact.source.raw_text},sourceInspectionLineId:null,isAiUpdated:false,isManuallyEdited:false,hadConflict:false,candidateValues:[],modelAuditId:fixture.auditId,
  })));
}
