"""事实基线、场景结构及源文件只读完整性验证。失败返回非零，不验收业务动作。"""
from scenario_loader import baseline,load,one
from build_mock import ROOT,OUT,MOCK,read,make_groups,U,template_columns
from collections import Counter
from decimal import Decimal
from openpyxl import load_workbook
import hashlib,json
class InvalidData(ValueError):pass
def require(ok,message):
 if not ok:raise InvalidData(message)
def index(items,label):
 require(len(items)==len({i['id'] for i in items}),label+' duplicate id');return {i['id']:i for i in items}
def validate(data,strict_baseline=True):
 cs=index(data['customers'],'customers');fs=index(data['source-files'],'files');os=index(data['inspection-orders'],'orders');rs=index(data['inspection-source-lines'],'rows');ds=index(data['entrustment-drafts'],'drafts');ls=index(data['entrustment-lines'],'lines');index(data['inspection-groups'],'groups')
 require(data['match-relations']==[],'initial active relations must be empty')
 expected_columns=template_columns()
 require(len(expected_columns)==25 and data['field-contract']['columns']==expected_columns,'25 columns/order differs from Excel')
 require(data['field-contract']['totals']==['数量','件数','净重','毛重'],'total columns')
 require(data['field-contract']['sha256']==hashlib.sha256((ROOT/'委托书草稿单模版.xlsx').read_bytes()).hexdigest(),'template hash changed')
 owned=[];warehouse=[]
 for o in os.values():
  require(isinstance(o['warehouseNo'],str) and o['warehouseNo']!=U and not any(c in o['warehouseNo'] for c in ',;\n'),'one warehouse per logical order')
  require(o['fileId'] in fs,'order file missing');require(o['customerId']==U or o['customerId'] in cs,'order customer missing')
  require(o['sourceLineIds'],'order without rows');warehouse.append((o['customerId'],o['warehouseNo']))
  for rid in o['sourceLineIds']:
   require(rid in rs,'order source row missing');r=rs[rid];owned.append(rid)
   require(r['inspectionOrderId']==o['id'] and r['customerId']==o['customerId'],'row ownership/customer differs')
  if o['customerId']==U:require(o['customerStatus']=='pending','unknown inspection customer not pending')
 require(len(warehouse)==len(set(warehouse)),'duplicate logical warehouse')
 require(Counter(owned)==Counter(rs.keys()),'each original row must have exactly one owner')
 physical=[]
 for r in rs.values():
  src=r['source'];require(src['fileId'] in fs and src.get('page',0)>0 and bool(src.get('position')),'row source location missing')
  f=fs[src['fileId']]
  require(f['role'] in ['inspection','scenario-virtual-inspection'],'reference/auxiliary used as inspection input')
  if not f.get('synthetic'):require(src['page']<=f['pageCount'],'source page out of range')
  require(r['occupation'] is None and r['writtenOff'] is False,'initial occupied/written off')
  require(r['availability']==('quarantined' if r['customerId']==U else 'unloaded'),'unknown customer entering pool or preloaded initial state')
  physical.append((src['fileId'],src['page'],src['position']))
 require(len(physical)==len(set(physical)),'duplicate source location counted twice')
 # Exact recomputation also detects deleted components, duplicate grouping and UNKNOWN->0.
 require(data['inspection-groups']==make_groups(list(rs.values())),'group components/keys/decimal totals/UNKNOWN propagation invalid')
 for d in ds.values():
  require(d['customerId']==U or d['customerId'] in cs,'draft customer missing')
  if d['customerId']==U:require(d['customerStatus']=='待补客户信息','unknown draft customer not pending')
  require(d['fileId'] in fs and fs[d['fileId']]['role']=='entrustment_material','reference used as original entrustment')
  require(d['status']=='待核对' and d['version']==0 and d['loaded'] is False,'baseline draft is a final state')
  require(d['lineIds']==[l['id'] for l in ls.values() if l['draftId']==d['id']],'draft row list/order differs')
 for l in ls.values():
  require(l['draftId'] in ds and l['customerId']==ds[l['draftId']]['customerId'],'entrustment line wrong customer/draft')
  require(list(l['fields'])==expected_columns,'entrustment field order')
  require(l['source']['fileId']==ds[l['draftId']]['fileId'] and l['source']['row']>0,'entrustment source missing')
  require(l['status']=='暂无查货依据','baseline entrustment already matched')
  require(l['fields']['客户名']==(cs[l['customerId']]['name'] if l['customerId']!=U else U),'customer field disagrees with id')
 used=[]
 for rel in data['reviewed-relations']:
  require(rel.get('active') is False,'analysis relation active')
  lid=rel['entrustmentLineId'];require(lid in ls,'relation target missing')
  for rid in rel['sourceLineIds']:
   require(rid in rs,'relation source missing');require(ls[lid]['customerId']!=U and ls[lid]['customerId']==rs[rid]['customerId']==rel['customerId'],'cross-customer relation');used.append(rid)
 require(len(used)==len(set(used)),'duplicate original row allocation')
 for e in data['field-evidence']:
  require(e['entityId'] in rs or e['entityId'] in ls,'evidence entity missing');require(e['source']['fileId'] in fs,'evidence file missing')
 if strict_baseline:
  facts=[read(p) for p in sorted((OUT/'manifests').glob('*.json'))];original_drafts={d['id']:d for m in facts for d in m['entrustmentFacts']}
  require(set(ds)==set(original_drafts),'original entrustment draft missing/added')
  for did,dr in original_drafts.items():
   require(ds[did]['lineIds']==[r['id'] for r in dr['rows']],'entrustment lines merged/deleted/reordered')
   for orig in dr['rows']:
    require(orig['id'] in ls,'original entrustment row missing');r=ls[orig['id']]
    require(r['fields']==orig['fields'] and r['sourceOrder']==orig['sourceOrder'] and r['source']['row']==orig['sourceRow'],'entrustment raw facts changed')
  orig_orders=[o for m in facts for o in m['inspectionFacts']]
  require(len(orig_orders)==len(os),'original order count changed')
  for o in orig_orders:
   oid='I-'+o['fileId'][2:]+'-'+o['warehouseNo'];require(oid in os,'original order missing')
   require(len(o['rows'])==len(os[oid]['sourceLineIds']),'original row count changed')
   for i,orig in enumerate(o['rows'],1):
    r=rs.get(oid+f'-L{i:03}');require(r is not None,'original source line missing')
    require(r['fields']=={k:v for k,v in orig.items() if k not in ['page','position']},'original source fact changed, including UNKNOWN')
  for o in os.values():
   f=fs[o['fileId']];require(not f['byteDuplicateOf'] and not f['contentDuplicateOf'],'duplicate material created inventory')
 return True

def validate_scenario(bundle):
 d=bundle['facts'];s=bundle['scenario'];validate(d,False)
 rs=index(d['inspection-source-lines'],'rows');ls=index(d['entrustment-lines'],'lines');bs=index(d['material-batches'],'batches');os=index(d['inspection-orders'],'orders');ds=index(d['entrustment-drafts'],'drafts');fs=index(d['source-files'],'files');cs=index(d['customers'],'customers')
 for batch in bs.values():
  require(all(f in fs for f in batch['fileIds']),'batch file missing')
  require(all(o in os for o in batch['inspectionOrderIds']),'batch order missing')
  require(all(dr in ds for dr in batch['draftIds']),'batch draft missing')
 require(bundle['runtime']=={'loadedBatchIds':[],'matchRelations':[],'history':[],'finalOrders':[]},'loader implements business state')
 require(s['steps'] and s['expectedChecks'],'scenario without recipe/checkpoints')
 for bid in bundle['initialBatchIds']:require(bid in bs,'initial batch missing')
 effective_customer={id:dr['customerId'] for id,dr in ds.items()}
 for step in s['steps']:
  if step['action']=='补充客户':effective_customer[step['draftId']]=step['customerId']
  for bid in step.get('batchIds',[]):require(bid in bs,'step batch missing')
  for key,idx in [('draftId',ds),('lineId',ls),('entrustmentLineId',ls),('fileId',fs),('customerId',cs)]:
   if key in step:require(step[key] in idx,'step '+key+' missing')
  for rid in step.get('sourceLineIds',[]):require(rid in rs,'step original row missing')
  target=step.get('lineId',step.get('entrustmentLineId'))
  if target and step.get('sourceLineIds'):
   l=ls[target];c=effective_customer[l['draftId']]
   require(c!=U and all(rs[r]['customerId']==c for r in step['sourceLineIds']),'cross-customer action recipe')
   require(sum(Decimal(rs[r]['fields']['数量']) for r in step['sourceLineIds'])==Decimal(l['fields']['数量']),'manual assignment recipe splits a source row or mismatches quantity')
  if 'materialId' in step:require(any(x['id']==step['materialId'] and x['targetDraftId']==step['draftId'] for x in d.get('revision-materials',[])),'revision target mismatch')
 used=[]
 for rel in s['expectedRelations']:
  require(rel['entrustmentLineId'] in ls,'expected target missing');l=ls[rel['entrustmentLineId']]
  for rid in rel['sourceLineIds']:
   require(rid in rs,'expected source missing');require(l['customerId']!=U and l['customerId']==rs[rid]['customerId'],'cross-customer expected relation');used.append(rid)
  require(sum(Decimal(rs[r]['fields']['数量']) for r in rel['sourceLineIds'])==Decimal(l['fields']['数量']),'expected allocation requires row splitting or quantity differs')
 require(len(used)==len(set(used)),'scenario duplicate allocation')
 for c in s['candidateSets']:
  require(c['entrustmentLineId'] in ls,'candidate target missing');l=ls[c['entrustmentLineId']]
  require(len(c['options'])>=2,'multiple candidate fixture needs two options')
  for option in c['options']:
   for rid in option:require(rid in rs and rs[rid]['customerId']==l['customerId']!=U,'cross-customer candidate')
 if s['id']=='SC-19':
  by_order={};by_draft={}
  for rel in s['expectedRelations']:
   draft=ls[rel['entrustmentLineId']]['draftId']
   for rid in rel['sourceLineIds']:
    oid=rs[rid]['inspectionOrderId'];by_order.setdefault(oid,set()).add(draft);by_draft.setdefault(draft,set()).add(oid)
  require(sum(len(v)>1 for v in by_order.values())>=2 and sum(len(v)>1 for v in by_draft.values())>=2,'not actual crossed many-to-many')
 if s['id']=='SC-03':
  b=bs['B-VF-MULTI-WAREHOUSE'];require(len(b['fileIds'])==1 and len(b['inspectionOrderIds'])==3,'one PDF three orders fixture')
 return True

def source_integrity():
 expected=read(OUT/'source-baseline.json');current=[]
 for p in sorted((ROOT/'真实整单样本').rglob('*')):
  if p.is_file():current.append({'path':str(p.relative_to(ROOT)),'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 require(sorted(current,key=lambda x:x['path'])==sorted(expected,key=lambda x:x['path']),'source files modified/added/deleted/renamed')
 return {'status':'PASS','allFilesIncludingHidden':len(current),'materialFiles':72,'method':'相对路径、字节大小、SHA-256逐项与首次盘点比较'}
def run():
 data=baseline();validate(data);scenarios=read(MOCK/'scenarios.json');require({c for s in scenarios for c in s['caseIds']}=={f'CASE-{i:02}' for i in range(1,22)},'case coverage missing')
 overrides=read(MOCK/'scenario-overrides.json');require(all(o['synthetic'] and o['reason'] and o['operations'] for o in overrides),'override provenance missing')
 for s in scenarios:
  require(all(oid in {o['id'] for o in overrides} for oid in s['overrideIds']),'override missing')
  a=load(s['id']);b=load(s['id']);require(a==b,'non deterministic reload');validate_scenario(a)
  a['facts']['inspection-source-lines'][0]['fields']['数量']='-999';require(load(s['id'])==b,'scenario copy polluted baseline')
 report={'phase':'Phase -1｜真实样本 → Mock 数据基线','status':'PASS','summary':read(MOCK/'baseline-summary.json'),'scenarioDataChecks':len(scenarios),'sourceIntegrity':source_integrity(),'checks':['客户与客户隔离','唯一入仓及原始行归属','三键合并及Decimal精确汇总','UNKNOWN传播','原始委托行和字段逐项一致','关系原始行追溯和无重复分配','25列直接比较Excel','去重与参考结果输入隔离','场景引用、修订目标、实际交叉关系','可重复加载及副本隔离'],'notExecuted':['业务动作验收','UI','端到端测试','Phase 0']}
 (OUT/'validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return report
if __name__=='__main__':run()
