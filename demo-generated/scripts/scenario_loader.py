"""纯数据加载：返回新副本与待执行动作，不实现业务动作或状态推导。"""
from build_mock import ROOT, OUT, MOCK, read, make_groups, U
import copy,json,sys
ASSETS=['customers','source-files','material-batches','inspection-orders','inspection-source-lines','inspection-groups','entrustment-drafts','entrustment-lines','match-relations','reviewed-relations','field-evidence','field-contract']
def baseline():return {k:read(MOCK/(k+'.json')) for k in ASSETS}
def one(data,asset,id):
 hits=[x for x in data[asset] if x['id']==id]
 if len(hits)!=1:raise ValueError(f'{asset}: invalid unique id {id}')
 return hits[0]
def apply(data,override):
 """白名单变体操作，有前值校验；所有真实值仍保留在variantOf/原始证据。"""
 for op in override['operations']:
  kind=op['op']
  if kind=='patch-field':
   obj=one(data,op['asset'],op['id']);assert obj['fields'][op['field']]==op['before']
   obj.setdefault('scenarioChanges',[]).append(copy.deepcopy(op));obj['fields'][op['field']]=op['after']
  elif kind=='clone-order':
   original=one(data,'inspection-orders',op['fromId']);target=copy.deepcopy(original);target.update(id=op['id'],warehouseNo=op['warehouseNo'],fileId=op['fileId'],sourceLineIds=[],variantOf=original['id'],synthetic=True)
   target['customerId']=op.get('customerId',original['customerId'])
   data['source-files'].append({'id':op['fileId'],'role':'scenario-virtual-inspection','extension':'.pdf','synthetic':True,'variantOf':original['fileId'],'sourcePageRefs':[{'fileId':original['fileId'],'page':p} for p in sorted({r['source']['page'] for r in data['inspection-source-lines'] if r['inspectionOrderId']==original['id']})]})
   for rid in original['sourceLineIds']:
    src=one(data,'inspection-source-lines',rid);row=copy.deepcopy(src);row.update(id=op['id']+f"-L{src['sourceOrder']:03}",inspectionOrderId=target['id'],customerId=target['customerId'],variantOf=rid,synthetic=True)
    row['originalSource']=copy.deepcopy(src['source']);row['source']['fileId']=op['fileId'];data['inspection-source-lines'].append(row);target['sourceLineIds'].append(row['id'])
   data['inspection-orders'].append(target)
   data['material-batches'].append({'id':'B-'+target['id'],'sampleId':target['sampleId'],'kind':'inspection','fileIds':[target['fileId']],'inspectionOrderIds':[target['id']],'draftIds':[],'synthetic':True})
  elif kind=='composite-pdf':
   refs=[]
   for oid in op['orderIds']:
    order=one(data,'inspection-orders',oid)
    for r in data['inspection-source-lines']:
     if r['inspectionOrderId']==oid:
      src=copy.deepcopy(r['source']);key={'fileId':src['fileId'],'page':src['page']}
      if key not in refs:refs.append(key)
      r['originalSource']=src;r['source']={'fileId':op['id'],'page':refs.index(key)+1,'position':src['position']};r['synthetic']=True
    order['originalFileId']=order['fileId'];order['fileId']=op['id']
   data['source-files'].append({'id':op['id'],'role':'scenario-virtual-inspection','extension':'.pdf','synthetic':True,'sourcePageRefs':refs,'description':'虚拟组合文件描述；引用真实页面，不伪造源文件'})
   data['material-batches'].append({'id':'B-'+op['id'],'kind':'inspection','fileIds':[op['id']],'inspectionOrderIds':op['orderIds'],'draftIds':[],'synthetic':True})
  elif kind=='revision-material':
   draft=one(data,'entrustment-drafts',op['targetDraftId'])
   assert draft['status']!='已完成'
   for change in op['changes']:
    line=one(data,'entrustment-lines',change['lineId']);assert line['draftId']==draft['id'];assert line['fields'][change['field']]==change['before']
   data.setdefault('revision-materials',[]).append(copy.deepcopy(op))
  else:raise ValueError('unsupported override '+kind)
 data['inspection-groups']=make_groups(data['inspection-source-lines'])
def load(scenario_id):
 scenario=next((s for s in read(MOCK/'scenarios.json') if s['id']==scenario_id),None)
 if scenario is None:raise ValueError('Unknown scenario '+scenario_id)
 data=baseline()
 for oid in scenario['overrideIds']:
  override=next(o for o in read(MOCK/'scenario-overrides.json') if o['id']==oid);apply(data,override)
 # All facts remain unloaded. Recipe determines arrival; no relation, version, or occupation mutation here.
 return {'schemaVersion':1,'scenario':copy.deepcopy(scenario),'facts':data,'initialBatchIds':list(scenario['initialBatchIds']),'runtime':{'loadedBatchIds':[],'matchRelations':[],'history':[],'finalOrders':[]}}
if __name__=='__main__':print(json.dumps(load(sys.argv[1]),ensure_ascii=False,indent=2))
