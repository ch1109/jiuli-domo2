"""验收数据配方。预期检查点是未来业务验收要求，不是预存页面结果。"""
from build_mock import *
def build():
 A={k:read(MOCK/(k+'.json')) for k in ['customers','inspection-orders','inspection-source-lines','entrustment-drafts','entrustment-lines','reviewed-relations']}
 def os(sample):return [o for o in A['inspection-orders'] if o['sampleId']==sample]
 def ds(sample):return [d for d in A['entrustment-drafts'] if d['sampleId']==sample]
 def line(id):return next(l for l in A['entrustment-lines'] if l['id']==id)
 y='2025YBT010-2';z='2026(DG)ZW003';yk='英卡-抽+整';yo=os(y)[0];yd=ds(y)[0];zo=os(z);zd=ds(z)[0];ko=os(yk)[0];kd=ds(yk)
 other=next(c['id'] for c in A['customers'] if c['name']=='上海浦壹电子科技有限公司');ovs=[]
 def ov(id,reason,ops,samples):ovs.append({'id':id,'synthetic':True,'reason':reason,'baseSamples':samples,'operations':ops,'scope':'仅本场景新副本；不计入真实样本数量，不改默认事实'})
 ov('OV-ISOLATE','真实已确认客户间未找到同型号可直接复用的隔离对照；复制英堡整单为浦壹模拟批次，仅客户和模拟入仓标识改变。',[{'op':'clone-order','fromId':yo['id'],'id':'VI-OTHER','fileId':'VF-OTHER','warehouseNo':'DEMO-OTHER-001','customerId':other}],[y,'26SHPYD056'])
 combine=os('2026(DG)ZW001')+[zo[0]]
 ov('OV-PDF','未发现可靠的单PDF三个实际入仓号；将同客户三张真实查货的页面组成虚拟PDF描述，原入仓号和行不变。',[{'op':'composite-pdf','id':'VF-MULTI-WAREHOUSE','orderIds':[o['id'] for o in combine]}],['2026(DG)ZW001',z])
 ov('OV-CANDIDATES','复制真实英堡整张查货作为同客户另一模拟到货批次；保留型号、数量、重量，供双候选及改配演示。',[{'op':'clone-order','fromId':yo['id'],'id':'VI-CANDIDATE','fileId':'VF-CANDIDATE','warehouseNo':'DEMO-CANDIDATE-001'}],[y])
 ov('OV-EXACT-MODEL','唯一可靠候选测试需要排除未冻结的型号后缀规则；仅将委托两行型号改成对应真实查货基础型号。',[{'op':'patch-field','asset':'entrustment-lines','id':lid,'field':'型号','before':line(lid)['fields']['型号'],'after':next(r for r in A['inspection-source-lines'] if r['id']==rid)['fields']['型号']} for lid,rid in zip(yd['lineIds'],yo['sourceLineIds'])],[y])
 # 更新场景采用原本5行ZW003；保持第1、4等行不变，只改变第2、3行。后续动作明确绑定草稿。
 changes=[{'lineId':zd['lineIds'][1],'field':'产地','before':line(zd['lineIds'][1])['fields']['产地'],'after':'中国'},{'lineId':zd['lineIds'][2],'field':'商品描述','before':line(zd['lineIds'][2])['fields']['商品描述'],'after':line(zd['lineIds'][2])['fields']['商品描述']+'（演示修订）'}]
 ov('OV-REVISION','无可靠修订前后成对原件；沿用ZW003完整原行，仅两字段构造修订材料，明确目标草稿。',[{'op':'revision-material','id':'VM-REVISION','targetDraftId':zd['id'],'changes':changes}],[z])
 # CASE-19真正交叉，沿用完整英卡委托和完整12行查货，不拆任何原始行数量。
 ov('OV-CROSS','原多对多目录缺委托明细，英卡缺26070092查货。复制26070093为第二模拟到货；第三委托UMW的数量、总价、件数、净毛重取已有60000委托对应行，保留前值，以完整箱行表达交叉分配。',[{'op':'clone-order','fromId':ko['id'],'id':'VI-CROSS','fileId':'VF-CROSS','warehouseNo':'DEMO-CROSS-001'}]+[{'op':'patch-field','asset':'entrustment-lines','id':d['lineIds'][2],'field':field,'before':line(d['lineIds'][2])['fields'][field],'after':line(next(x for x in kd if line(x['lineIds'][2])['fields']['数量']=='60000')['lineIds'][2])['fields'][field],'donorLineId':next(x for x in kd if line(x['lineIds'][2])['fields']['数量']=='60000')['lineIds'][2]} for d in kd if line(d['lineIds'][2])['fields']['数量']!='60000' for field in ['数量','总价','件数','净重','毛重']],[yk])
 scenarios=[]
 def step(action,**kw):return {'action':action,**kw}
 def batches(*entities):return ['B-'+e['id'] for e in entities]
 def add(n,name,samples,initial,steps,checks,overrides=(),gaps=(),expected=(),candidates=()):
  scenarios.append({'id':f'SC-{n:02}','caseIds':[f'CASE-{n:02}'],'name':name,'sampleIds':samples,'overrideIds':list(overrides),'initialBatchIds':initial,'steps':steps,'expectedChecks':checks,'expectedRelations':list(expected),'candidateSets':list(candidates),'unresolved':list(gaps),'coverageStatus':'数据已具备（含明确变体）' if overrides else '数据已具备','businessAcceptance':'NOT_RUN_PHASE_MINUS_1'})
 rels=[{k:r[k] for k in ['entrustmentLineId','sourceLineIds','basis']} for r in A['reviewed-relations']]
 start=[step('加载查货',batchIds=batches(yo)),step('新建委托草稿',batchIds=batches(yd))]
 add(1,'客户隔离',[y,'26SHPYD056'],batches(yo)+['B-VI-OTHER'],[step('新建委托草稿',batchIds=batches(yd)),step('执行首次匹配',draftId=yd['id'])],['仅同客户查货可进入候选','直接传入VI-OTHER原始行也必须拒绝','其他客户行保持未占用'],['OV-ISOLATE','OV-EXACT-MODEL'])
 add(2,'客户识别失败后补充',[z],batches(*zo),[step('新建委托草稿',batchIds=batches(zd)),step('执行首次匹配',draftId=zd['id'],expect='客户未补充时拒绝'),step('补充客户',draftId=zd['id'],customerId=zo[0]['customerId'],basis='演示人工选择；非原委托识别结果'),step('执行首次匹配',draftId=zd['id'])],['补客户前草稿可存在但不能匹配','补后只查选定客户池','记录人工补客户事件'])
 add(3,'单PDF多入仓号',['2026(DG)ZW001',z],[],[step('加载查货',batchIds=['B-VF-MULTI-WAREHOUSE'])],['一个虚拟PDF形成三个逻辑查货单','三张单保留原入仓号','每行唯一归属'],['OV-PDF'])
 add(4,'查货三键合并',[yk],[],[step('加载查货',batchIds=batches(ko))],['12条原始行保留','同单三键合并为1个展示组','数量177000；净重53.30；毛重61.70','合并不改变行状态'])
 kr=ko['sourceLineIds'];d1,d2,d3=sorted(kd,key=lambda d:int(line(d['lineIds'][2])['fields']['数量']))
 er1={'entrustmentLineId':d1['lineIds'][2],'sourceLineIds':kr[:4],'basis':'UMW2631 60000 = 四个完整15000原始箱行；同型号箱行选择为演示人工选择'}
 er2={'entrustmentLineId':d2['lineIds'][2],'sourceLineIds':kr[4:8],'basis':'UMW2631 60000 = 其余四个完整15000箱行'}
 add(5,'合并商品部分占用',[yk],batches(ko),[step('新建委托草稿',batchIds=batches(d1)),step('人工选择原始行',**er1),step('新建委托草稿',batchIds=batches(d2)),step('人工选择原始行',**er2)],['前四行占用后第5~12行仍可匹配','第二草稿只能使用剩余行','不占用整个合并展示组'],gaps=['其他型号和第三委托缺完整查货；本场景只验证UMW完整箱行分配'],expected=[er1,er2])
 add(6,'查货先到',[y],batches(yo),[step('新建委托草稿',batchIds=batches(yd)),step('执行首次匹配',draftId=yd['id'])],['查货先进入客户池','到达委托后生成关系和草稿占用','不是核销'],['OV-EXACT-MODEL'],expected=rels)
 add(7,'委托先到与后补查货',[z],batches(zd),[step('补充客户',draftId=zd['id'],customerId=zo[0]['customerId']),step('执行首次匹配',draftId=zd['id'],expect='查货尚未到达，所有行暂无依据'),step('加载查货',batchIds=batches(zo[0])),step('执行增量核对',draftId=zd['id']),step('编辑字段',lineId=zd['lineIds'][2],field='备注',value='人工保留：稳定行'),step('加载查货',batchIds=batches(zo[1])),step('执行增量核对',draftId=zd['id'])],['另一入仓号未到时对应商品暂无依据','后补只影响相关行','原稳定行备注和关系保持','有实际变化才产生版本'])
 prompt_fixture=read(MOCK/'real-calibration-sc08.json')
 prompt_rels=[{'entrustmentLineId':r['order_row_id'],'sourceLineIds':r['selected_raw_row_ids'],'basis':'GPT-5.6 Sol P3 '+prompt_fixture['auditId']+': '+', '.join(r['evidence_keys'])} for r in prompt_fixture['relations'] if r['match_status']=='MATCHED']
 add(8,'真实 Prompt 唯一可靠候选',[y],batches(yo,yd),[step('执行首次匹配',draftId=yd['id'])],['保留委托型号#9/#D，使用查货描述中的明确行标记建立关系','建立关系、占用、字段来源、日志在一次动作完成','P4 保留已核验字段，仅补入仓号25120336','AI核对一致不等于人工确认','未直接核销'],expected=prompt_rels)
 candidates=[{'entrustmentLineId':yd['lineIds'][0],'options':[[yo['sourceLineIds'][0]],['VI-CANDIDATE-L001']]}]
 add(9,'多个候选',[y],batches(yo,yd)+['B-VI-CANDIDATE'],[step('执行首次匹配',draftId=yd['id']),step('选择候选',lineId=yd['lineIds'][0],sourceLineIds=[yo['sourceLineIds'][0]])],['选前两个候选均不占用','不得随机选择','选后只占用指定原始行'],['OV-CANDIDATES','OV-EXACT-MODEL'],candidates=candidates)
 add(10,'字段冲突',[z],batches(zd,*zo),[step('补充客户',draftId=zd['id'],customerId=zo[0]['customerId']),step('人工选择原始行',lineId=zd['lineIds'][2],sourceLineIds=[zo[0]['sourceLineIds'][0]]),step('执行字段交叉核对',draftId=zd['id'])],['委托中国台湾和查货CHINA同时保留','有关系仍可标黄','人工处理必须保留来源和操作记录'])
 add(11,'委托资料更新原草稿',[z],batches(zd,*zo),[step('补充客户',draftId=zd['id'],customerId=zo[0]['customerId']),step('执行首次匹配',draftId=zd['id']),step('更新委托资料',draftId=zd['id'],materialId='VM-REVISION'),step('执行增量核对',draftId=zd['id'])],['只更新目标草稿','第2/3行重核','第1/4等稳定行继承','实际变化形成版本并保留旧关系历史'],['OV-REVISION'])
 add(12,'人工解绑',[y],batches(yo,yd),[step('执行首次匹配',draftId=yd['id']),step('解除匹配',lineId=yd['lineIds'][0])],['旧关系历史保留','原始行释放','重推草稿状态并记录版本'],['OV-EXACT-MODEL'],expected=rels)
 add(13,'人工改配',[y],batches(yo,yd)+['B-VI-CANDIDATE'],[step('人工选择原始行',**rels[0]),step('人工改配',lineId=yd['lineIds'][0],sourceLineIds=['VI-CANDIDATE-L001'])],['旧行释放与新行占用同时发生','旧关系历史保留','版本与字段来源更新'],['OV-CANDIDATES','OV-EXACT-MODEL'],candidates=candidates)
 add(14,'提交整单人工确认准入',[y],batches(yo,yd),[step('人工选择原始行',**rels[0]),step('提交整单人工确认',draftId=yd['id'],expect='尚有无依据行，拒绝'),step('人工选择原始行',**rels[1]),step('提交整单人工确认',draftId=yd['id'],expect='全部有依据即可进入人工确认；型号差异问题保留')],['无依据行阻止提交','黄色问题不阻止进入人工确认','提交不核销、不生成最终单'],expected=rels)
 add(15,'最终确认与核销',[y],batches(yo,yd),[step('人工选择原始行',**r) for r in rels]+[step('提交整单人工确认',draftId=yd['id']),step('确认完成',draftId=yd['id'],expect='未处理型号后缀/必填问题时拒绝'),step('人工处理问题',draftId=yd['id'],resolution='人工确认本单型号#9/#D对应查货基础型号；型号与单位保持原委托值，产地韩国/KOREA保留双来源；毛重使用逐行表格4.2/5.0并记录与仓库章9的差异选择。13个必填字段均有委托原件来源；不填造选填值'),step('确认完成',draftId=yd['id']),step('执行增量核对',draftId=yd['id'],expect='忽略已完成草稿')],['仅问题全部解决才完成','有效关系锁定、使用行核销、最终单生成原子完成','25列及四项合计正确','确认人和时间由动作生成'],expected=rels)
 add(16,'一对一',[y],batches(yo,yd),[step('人工选择原始行',**r) for r in rels],['一张查货支持一个完整委托','逐行原始来源可追溯'],expected=rels)
 add(17,'多查货到单委托',[z],batches(zd,*zo),[step('补充客户',draftId=zd['id'],customerId=zo[0]['customerId']),step('执行首次匹配',draftId=zd['id']),step('人工处理问题',draftId=zd['id'])],['一个草稿可引用26010801和26010211','同型号原始行按明确数量选择','原委托5行保留'],gaps=['原委托缺客户，须先由演示用户明确选择；重量/产地冲突不静默解决'])
 add(18,'单查货到多委托',[yk],batches(ko),[step('新建委托草稿',batchIds=batches(d1,d2)),step('人工选择原始行',**er1),step('人工选择原始行',**er2)],['同一逻辑查货不拆单','两草稿分别使用完整原始行','一个草稿核销不影响另一组行'],gaps=['支持UMW局部关系，其他型号查货缺失，不宣称两张整单能完成'],expected=[er1,er2])
 cross=[er1,{'entrustmentLineId':d2['lineIds'][2],'sourceLineIds':kr[4:6]+['VI-CROSS-L001','VI-CROSS-L002'],'basis':'两个到货各两个完整15000箱行'}, {'entrustmentLineId':d3['lineIds'][2],'sourceLineIds':kr[6:8]+['VI-CROSS-L003','VI-CROSS-L004'],'basis':'两个到货各两个完整15000箱行；委托数量显式变体60000'}]
 add(19,'多对多交叉关系',[yk],batches(ko,*kd)+['B-VI-CROSS'],[step('人工选择原始行',**r) for r in cross],['C1服务三个草稿，C2服务其中两个草稿','至少两个草稿同时引用两个查货单','任一原始行不重复占用','已核销行退出候选'],['OV-CROSS'],gaps=['仅UMW子图用于交叉关系演示；其他型号未到；非欧陆通真实多对多证明'],expected=cross)
 add(20,'重复材料',[yk],[],[step('加载查货',batchIds=batches(ko)),step('重复上传',fileId=ko['fileId'],expect='相同校验值不重复入池'),step('重复上传',fileId='F-baf3de39ef68',expect='不同校验值同内容不重复入池')],['两个文件名实际同26070093','逻辑查货维持1张，原始行12条','重复来源保留'])
 add(21,'最终25列契约',[y],batches(yo,yd),[step('执行SC-15完整动作链'),step('检查输出字段契约',contract='field-contract.json')],['列名顺序直接等于模板','四项合计正确','无来源值保持待处理，不能编造'])
 write('scenario-overrides',ovs);write('scenarios',scenarios)
 headers=['# 验收场景数据覆盖','', '这里的“数据已具备”仅表示可以重复加载事实与动作配方。CASE-01～21 的业务动作、页面及端到端验收均未执行。存在材料缺口的项目不宣称完整自然场景覆盖。','', '|验收场景|使用真实样本|是否需要轻量变体|Mock 场景 ID|当前覆盖状态|','|---|---|---|---|---|']
 for s in scenarios:headers.append('|'+ '|'.join([s['caseIds'][0]+' '+s['name'],'、'.join(s['sampleIds']),'、'.join(s['overrideIds']) or '否',s['id'],s['coverageStatus']+('；存在材料缺口/前置条件：'+'；'.join(s['unresolved']) if s['unresolved'] else '')+'；业务动作尚未验收'])+'|')
 headers+=['','## 变体原因及边界','']
 for o in ovs:headers += [f"- **{o['id']}**：{o['reason']} 具体改动前后和来源见 mock/scenario-overrides.json。"]
 headers+=['','## 真实缺口','', '- 多对多样例原始委托商品UNKNOWN，两个内部结果只是独立多对一，不能替代原始委托。SC-19使用英卡轻量变体。','- 英卡26070092真实查货缺失，SC-05/18只覆盖已证明的UMW原始行分配；不假装整单已具备全部依据。','- BMH、澳创、傲冠、超年查货客户未知，29行隔离保存，不用于任何客户商品池。','- 共享重量不按数量分摊；行级UNKNOWN保留。','- SC-07通过两个实际入仓号先后到达表达后补查货；客户需人工补充。','- SC-15/21提供封版输入和检查点，未产生最终页面/最终核对单。']
 (OUT/'SCENARIO_COVERAGE.md').write_text('\n'.join(headers)+'\n')
 print('scenarios',len(scenarios),'overrides',len(ovs))
if __name__=='__main__':build()
