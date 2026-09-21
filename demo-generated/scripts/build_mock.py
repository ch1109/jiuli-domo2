"""从已落盘盘点生成事实基线；不执行任何匹配、占用或核销动作。"""
from pathlib import Path
from collections import defaultdict
from decimal import Decimal
import json, hashlib, copy, re
from openpyxl import load_workbook
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'demo-generated'; MOCK=OUT/'mock'; U='UNKNOWN'
def read(p):return json.loads(p.read_text())
def write(name,value):
 p=MOCK/(name+'.json');p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def template_columns():
 w=load_workbook(ROOT/'委托书草稿单模版.xlsx',read_only=False)
 try:return [c.value for c in next(w.active.rows)][:25]
 finally:w.close()
def cid(name):return U if name==U else 'C-'+hashlib.sha256(name.encode()).hexdigest()[:12]
def total(rows,key):
 vals=[r['fields'].get(key,U) for r in rows]
 return U if U in vals else format(sum((Decimal(v) for v in vals),Decimal(0)),'f')
def make_groups(rows):
 buckets={}
 for r in rows:
  key=(r['inspectionOrderId'],*(r['fields'][k] for k in ['品牌','型号','产地']))
  if U in key:key=(*key,r['id'])
  buckets.setdefault(key,[]).append(r)
 return [{'id':'G-'+hashlib.sha256('|'.join(r['id'] for r in rs).encode()).hexdigest()[:12], 'inspectionOrderId':rs[0]['inspectionOrderId'],'customerId':rs[0]['customerId'],'sourceLineIds':[r['id'] for r in rs], 'keys':{k:rs[0]['fields'][k] for k in ['品牌','型号','产地']}, 'totals':{k:total(rs,k) for k in ['数量','净重','毛重']},'complete':all(total(rs,k)!=U for k in ['数量','净重','毛重'])} for rs in buckets.values()]
def segments(f):
 """单证分段按已复核页结构；引用发票号不等于含发票正文。"""
 doc=read(OUT/'extracted'/f"{f['id']}.json"); fid=f['id'];n=f['pageCount'] or 0;ss=[]
 def add(kind,pages,identity=U):ss.append({'kind':kind,'pages':pages,'documentNumber':identity,'evidence':{'fileId':fid,'pages':pages,'position':'单证表头/续页标识'},'countingKey':identity if identity!=U else fid+':'+kind+':'+','.join(map(str,pages))})
 if fid=='F-6cb1752655d0':add('inspection-annotation',[1])
 elif f['role']=='inspection':
  if f['sampleId']=='2026BMH001':
   if fid=='F-276766064bb2':add('packing-list',list(range(1,n+1)))
   else:
    for i in range(1,n+1):add('invoice',[i])
  elif f['sampleId']=='2026AG001':add('license',[1])
  elif f['sampleId']=='2026ACSY003':add('delivery-note',[1])
  elif f['sampleId']=='多对多样例':
   if fid=='F-5b778363f744':add('packing-list',[1,2]);add('packing-list',[3,4,5]);add('delivery-note',[6])
   elif fid=='F-93c7d7713617':add('packing-list',[1]);add('packing-list',[2]);add('delivery-note',[3])
   elif fid=='F-5dc64ab64d12':add('packing-list',[1,2]);add('invoice',[3])
   else:
    add('packing-list',[1]);add('invoice',[2])
    if n==3:add('origin-statement',[3])
  elif f['sampleId']=='26SHPYD056':add('packing-list',[1]);add('packing-list',[2])
  else:add('packing-list',list(range(1,n+1)), '8000815164:packing-list' if f['sampleId']=='英卡-抽+整' else U)
 elif f['sampleId']=='英卡-抽+整' and '发票箱单' in f['path']:
  number='8000815164' if '8000815164' in f['path'] else '8000812735';add('invoice',[1],number+':invoice');add('packing-list',list(range(2,n+1)),number+':packing-list')
 elif f['role']=='entrustment_material':add('entrustment',list(range(1,n+1)))
 else:add('reference-result' if 'reference' in f['role'] else 'auxiliary',list(range(1,n+1)))
 return ss

def build():
 inv=read(OUT/'source_inventory.json'); manifests=[read(p) for p in sorted((OUT/'manifests').glob('*.json'))];files=copy.deepcopy(inv['files'])
 for f in files:f['documentSegments']=segments(f)
 # 单证统计以正文分段去重，不按文件名计业务单证。
 for s in inv['samples']:
  fs=[f for f in files if f['sampleId']==s['sampleId']];unique={}
  for f in fs:
   for seg in f['documentSegments']:
    if f['byteDuplicateOf']:continue
    unique.setdefault((seg['kind'],seg['countingKey']),seg)
  for kind,key in [('invoice','invoiceDocumentCount'),('packing-list','packingListDocumentCount')]:
   assert s[key]==sum(k[0]==kind for k in unique),(s['sampleId'],key,s[key],unique)
 names=sorted({m['customer'] for m in manifests});customers=[]
 for name in names:
  evidence=[]
  for m in manifests:
   for d in m['entrustmentFacts']:
    if d['customerName']==name:evidence.append(d['customerEvidence'])
   for o in m['inspectionFacts']:
    if o['customerName']==name:evidence.append({'fileId':o['fileId'],'page':1,'position':'客户/收货方；英卡以内部单入仓号归属为准','warehouseNo':o['warehouseNo'], 'supportingReferences':[{'fileId':'F-39b32ef999ed','page':2,'position':'客户抬头及26070093'}] if m['sampleId']=='英卡-抽+整' else []})
  customers.append({'id':cid(name),'name':name,'evidence':evidence,'aliases':[]})
 orders=[];rows=[];drafts=[];lines=[];evidence=[];batches=[]
 for m in manifests:
  for o in m['inspectionFacts']:
   oid='I-'+o['fileId'][2:]+'-'+o['warehouseNo'];c=cid(o['customerName']);ids=[]
   for j,r in enumerate(o['rows'],1):
    rid=f'{oid}-L{j:03}';ids.append(rid);fields={k:v for k,v in r.items() if k not in ['page','position']};source={'fileId':o['fileId'],'page':r['page'],'position':r['position']}
    rows.append({'id':rid,'inspectionOrderId':oid,'customerId':c,'fields':fields,'modelComparison':str(fields['型号']).strip().upper(),'source':source,'sourceOrder':j,'availability':'quarantined' if c==U else 'unloaded','occupation':None,'writtenOff':False})
    for k,v in fields.items():evidence.append({'id':rid+':'+k,'entityId':rid,'field':k,'value':v,'source':source|{'field':k},'kind':'inspection-original'})
   orders.append({'id':oid,'sampleId':m['sampleId'],'fileId':o['fileId'],'warehouseNo':o['warehouseNo'],'customerId':c,'customerStatus':'pending' if c==U else 'identified','sourceLineIds':ids,'notes':o['notes'],'sharedMeasurements':o['sharedMeasurements'],'loaded':False})
   batches.append({'id':'B-'+oid,'sampleId':m['sampleId'],'kind':'inspection','fileIds':[o['fileId']],'inspectionOrderIds':[oid],'draftIds':[]})
  for d in m['entrustmentFacts']:
   c=cid(d['customerName']);ids=[]
   for r in d['rows']:
    ids.append(r['id']);lines.append({'id':r['id'],'draftId':d['id'],'customerId':c,'fields':r['fields'],'sourceOrder':r['sourceOrder'],'source':{'fileId':d['fileId'],'sheet':d['customerEvidence'].get('sheet'),'row':r['sourceRow'],'page':d['customerEvidence'].get('page')},'extraFields':r['extraFields'],'status':'暂无查货依据'})
    for k,v in r['evidence'].items():evidence.append({'id':r['id']+':'+k,'entityId':r['id'],'field':k,'value':r['fields'].get(k,r['extraFields'].get(k,U)),'source':v,'kind':'entrustment-original'})
   drafts.append({'id':d['id'],'sampleId':m['sampleId'],'fileId':d['fileId'],'customerId':c,'customerStatus':'待补客户信息' if c==U else '已识别','lineIds':ids,'status':'待核对','loaded':False,'version':0,'sharedMeasurements':d['sharedMeasurements']})
   primary=next(f for f in files if f['id']==d['fileId'])
   submission=[f['id'] for f in files if f['role']=='entrustment_material' and Path(f['path']).parent==Path(primary['path']).parent]
   drafts[-1]['supportingFileIds']=[fid for fid in submission if fid!=d['fileId']]
   batches.append({'id':'B-'+d['id'],'sampleId':m['sampleId'],'kind':'entrustment','fileIds':submission,'inspectionOrderIds':[],'draftIds':[d['id']]})
 groups=make_groups(rows)
 # 只存分析预期，绝不当作初始有效关系。YBT两个型号后缀的对照为本单特例。
 yrows=[r for r in rows if r['inspectionOrderId'].startswith('I-8bc7177252aa')];yd=next(d for d in drafts if d['sampleId']=='2025YBT010-2')
 expected=[{'id':f'ER-YBT-{i+1}','entrustmentLineId':lid,'sourceLineIds':[r['id']],'customerId':r['customerId'],'basis':'本单品牌、基础型号、数量逐行对应；#9/#D后缀差异保留，需后续匹配规则或人工确认','requiresReview':True,'active':False} for i,(lid,r) in enumerate(zip(yd['lineIds'],yrows))]
 contract={'schemaVersion':1,'source':'委托书草稿单模版.xlsx','sha256':hashlib.sha256((ROOT/'委托书草稿单模版.xlsx').read_bytes()).hexdigest(),'columns':template_columns(),'totals':['数量','件数','净重','毛重'],'requiredFields':[f for i,f in enumerate(template_columns()) if i<14 and i!=3],'requirementsSource':'spec_final/01_IMPLEMENTATION_SPEC.md §4','unknownPolicy':'UNKNOWN不等于0；选填/随模板无来源值后续输出留空，不因这些字段为空阻止确认'}
 assets={'customers':customers,'source-files':files,'material-batches':batches,'inspection-orders':orders,'inspection-source-lines':rows,'inspection-groups':groups,'entrustment-drafts':drafts,'entrustment-lines':lines,'match-relations':[],'reviewed-relations':expected,'field-evidence':evidence,'field-contract':contract}
 for n,v in assets.items():write(n,v)
 summary=inv['summary']|{'customerCount':len(customers),'inspectionGroupCount':len(groups),'mergedGroupCount':sum(len(g['sourceLineIds'])>1 for g in groups),'quarantinedOrderCount':sum(o['customerId']==U for o in orders),'quarantinedSourceLineCount':sum(r['customerId']==U for r in rows),'pendingCustomerDraftCount':sum(d['customerId']==U for d in drafts)}
 write('baseline-summary',summary);print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':build()
