"""逐页目视核实后的抽取记录。不是场景造数；UNKNOWN 不以参考结果补齐。
修改此文件必须重新核对 source-baseline、原页及 extracted 页内坐标。
"""
from pathlib import Path
import json, hashlib
from decimal import Decimal
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'demo-generated'
U='UNKNOWN'
DOCS={p.stem:json.loads(p.read_text()) for p in (OUT/'extracted').glob('F-*.json')}
ORDERS=[]
def row(page,position,brand,model,origin,quantity,unit='PCS',packages=U,net=U,gross=U,**extra):
 return {'page':page,'position':position,'品牌':brand,'型号':model,'产地':origin,'数量':str(quantity),'单位':unit,'件数':str(packages),'净重':str(net),'毛重':str(gross),**extra}
def order(fid,warehouse,customer,rows,note='',shared=None):
 d=DOCS[fid]
 ORDERS.append({'fileId':fid,'sampleId':d['sampleId'],'warehouseNo':warehouse,'customerName':customer,'rows':rows,'notes':note,'sharedMeasurements':shared or []})
YBT='英堡科技（深圳）有限公司'; ZW='东莞市智微智能科技有限公司';PY='上海浦壹电子科技有限公司'; YK='深圳市英卡科技有限公司';OL='深圳欧陆通电子股份有限公司'
order('F-8bc7177252aa','25120336',YBT,[row(1,'商品表第1行','SK HYNIX','H25G9TCXXCX702A','KOREA',12081,unit=U,packages=1,net='3.60',gross='4.20'),row(1,'商品表第2行','SK HYNIX','D25G9TCX8CX239C','KOREA',16054,unit=U,packages=1,net='4.40',gross='5.00')], '入仓章毛重9 KG，表格合计9.20 KG；两个来源均保留。')
order('F-4626eef2dd66','26010713',ZW,[row(1,'商品表第1行','uPI','UP9505UQGW','UNKNOWN',2500,**{'COD':'Taiwan China','手写COO':'TW,CN'}),row(1,'商品表第2行','uPI','UP7501M8','UNKNOWN',3000,**{'COD':'Taiwan China','手写COO':'TW,CN'})], '印刷列为COD，手写COO为TW,CN；不静默将COD映射成产地。', [{'page':1,'scope':'箱1两行','件数':'1','净重':'1.4','毛重':'1.8','仓库章毛重':'1'}])
order('F-cdbd27982284','26010048',ZW,[row(1,f'商品表第{i}行','ASMEDIA',m,'TAIWAN, CHINA',q,**{'物料号码':part}) for i,(m,q,part) in enumerate([('ASM1543',6500,'300200002056'),('ASM2480B',3500,'300200002198'),('ASM1562',6500,'300200001648'),('ASM1164',7000,'300200008018')],1)],'品牌取页内手写ASMEDIA；不按数量摊重量。',[{'page':1,'scope':'整箱4行','件数':'1','净重':'5.20','毛重':'8.50','仓库章毛重':'8'}])
order('F-ad06ec2cd295','26010801',ZW,[row(1,'商品表第1行','ASL','CS5511AN','CHINA',1680),row(1,'商品表第2行','ASL','CS5511AN','CHINA',5040),row(1,'商品表第3行','ASL','CS5512AN','CHINA',3360,packages=1,net='5.00',gross='5.30')], '箱1前两行共享10/10.60 KG，不拆分；委托两行产地中国台湾与查货CHINA冲突。',[{'page':1,'scope':'箱1，商品表1、2行','件数':'1','净重':'10.00','毛重':'10.60'},{'page':1,'scope':'整单','件数':'2','净重':'15.00','毛重':'15.90','仓库章毛重':'16'}])
order('F-e928e7608540','26010211',ZW,[row(1,'主商品表第1行','REALTEK','ALC897-VA2-CG','CHINA',21600,packages=1,net='15.40',gross='22.00'),row(1,'主商品表第2行','REALTEK','ALC897-VA2-CG','CHINA',13400,net='10.12'),row(1,'主商品表第3行','REALTEK','RTS5411S-GR','CHINA',2600,net='1.97',**{'COD':'TAIWAN, CHINA'})], '下方六条LOT明细为主表重复细分证据，不再生成重复库存；箱2毛重17.25为后两行共享；手写RTS5411S-GR 16000pcs与表格2600冲突。',[{'page':1,'scope':'箱2，主表2、3行','件数':'1','毛重':'17.25'},{'page':1,'scope':'整单','件数':'2','净重':'27.49','毛重':'39.25','仓库章毛重':'40'}])
order('F-bfe5061027e1','26050640',ZW,[row(1,'商品表第1行','MAXLINEAR','SP3243EBEY-L/TR',U,2500,packages=1,net='0.56',gross='1.56',**{'COD':'KOREA'})],'原印刷列标题C.O.D.，不能直接认作COO；模板委托产地韩国。',[{'page':1,'scope':'整单','仓库章毛重':'2'}])
order('F-2907feed0d42','26033175',U,[row(1,f'商品表第{i}行',b,m,U,q,**{'批次/尾码':tail}) for i,(b,m,q,tail) in enumerate([('MICRON','MT29F4T08EUHAFM4',1401,'NW920'),('MICRON','MT29F2T08CUHBBM4',1564,'NWB21'),('Toshiba','TH58TF1V23BA8H',1080,'1V23'),('Toshiba','TH58TF2T23BA8J',368,'2T23')],1)],'页内未显示委托客户；右侧手写为COD而非明确COO；重量是每两行共享且未区分净毛。',[{'page':1,'scope':'商品1、2','件数':'1','重量类型未区分':'7.6'},{'page':1,'scope':'商品3、4','件数':'1','重量类型未区分':'4.6'}])
order('F-6b255626250f','26050688',U,[row(1,'商品表第1行','SUSE','B-RPGC-2C4V-PS1','德国',20,unit=U,**{'报关单价':'1617.04','总价':'32340.80','商品描述':'Linux操作系统软件，标准三年服务','币种':'USD'}),row(1,'商品表第2行','SUSE','B-RPGC-2C4V-PS1','德国',12,unit=U,**{'报关单价':'2175.00','总价':'26100.00','商品描述':'Linux操作系统软件，标准三年服务','币种':'USD'})], 'License编号2026AG001，未印客户；委托写标准一年服务，查货写三年服务。',[{'page':1,'scope':'整单','件数':'1'}])
order('F-8e681d73b55a','26057448',U,[row(1,'商品表第1行','HIROSE','BM25U-4P/2-V(85)','JAPAN',580000,unit='pc',packages=3,net='4.81',gross='31.66')], 'Bill to为深圳市快极科技有限公司；委托方为福建省超年科技股份有限公司，客户归属不能自动合并。正文另有入仓号018230127，属于哪个编号体系UNKNOWN，不能把同一行复制到两个逻辑单。',[{'page':1,'scope':'整单','仓库章毛重':'31','正文另一入仓号':'018230127'}])
order('F-970b59d6d5b8','26036383',PY,[row(1,f'WINBOND批次明细第{i}行','WINBOND','W25N01GVZEIG','CHINA' if i==1 else 'TAIWAN, CHINA',q,unit=U,**{'DC':dc}) for i,(q,dc) in enumerate([(4000,'2542'),(3840,'2523'),(11520,'2544'),(3840,'2545'),(15360,'2548'),(12000,'2551'),(102880,'2552')],1)]+[row(2,f'MARVELL批次明细第{i}行','MARVELL','88E6240A1TFJ2C000','TAIWAN, CHINA',q,unit=U,**{'DC':dc}) for i,(q,dc) in enumerate([(900,'2522'),(1800,'2524')],1)],'第2页同PDF续页没有独立入仓号；按第1页入仓章2页及总件数归属。保留9条批次明细，Shipped Qty汇总不重复计行。',[{'page':1,'scope':'WINBOND 7行','件数':'4','净重':'57.7','毛重':'61.7'},{'page':2,'scope':'MARVELL 2行','件数':'1','净重':'6.8','毛重':'7.4'},{'page':1,'scope':'仓库实测整单','件数':'5','毛重':'75'}])
order('F-a5368260946b','26070093',YK,[row(1,f'箱{i}','UNISOC','UMW2631','CHINA',15000 if i<12 else 12000,unit='pcs',packages=1,net='4.50' if i<12 else '3.80',gross='5.20' if i<12 else '4.50') for i in range(1,13)],'文件名26070092但条码26070093；与F-baf3de39ef68内容相同，只生成12行。客户由英卡内部单明确引用入仓号26070093佐证，不将MESSRS英华国际自动作为英卡别名。',[{'page':1,'scope':'整单','件数':'12','净重':'53.30','毛重':'61.70','仓库章毛重':'64'}])
# 百闽海文件：买方名称不同，全部留在待确认客户的隔离区；保留真实数量。
ti=[('F-b98a101d8392','26027114',[('TXS0108EPWR','CN',16000)]),('F-c5195fdb15a3','26027143',[('TXS0108EPWR','CN',30000),('TXS0108EPWR','CN',40000)]),('F-94d0c3955b2a','26027191',[('TLV62569DBVR','US',150000)]*3),('F-39b0b8e82a3a','26027254',[('TXS0108EPWR','CN',26000)]),('F-a06d575c587d','26027251',[('SN74HC245PWR','US',24000)]),('F-69127fcfa5c3','26027300',[('SN74LVC1G04DBVR','DE',150000),('INA180A2IDBVR','JP',9000)]),('F-de4e00bf55d8','26027299',[('LM2576SX-3.3/NOPB','GB',500)]),('F-b03e0011849f','26027298',[('LM2576SX-3.3/NOPB',U,4000)]),('F-cb09c02b9ed5','26027323',[('TPS51200DRCR','JP',12000)]),('F-f29936219cd1','26027322',[('SN74LVC08ADR','US',20000),('LM2904BIDR','US',150000)])]
for fid,wh,items in ti:
 order(fid,wh,U,[row(i,'发票商品第1行','TI',m,c,q,unit='EA') for i,(m,c,q) in enumerate(items,1)],'Sold to为FUJIAN CENTERM INFORMATION CO., LTD；不能仅凭目录绑定百闽海。'+('同一印刷商品行含DE:2500及GB:1500；保持原行、产地多值，不自动拆行。' if wh=='26027298' else ''), [{'page':1,'scope':'原始客户','buyer':'FUJIAN CENTERM INFORMATION CO., LTD'}]+([{'page':1,'scope':'商品1产地数量组成','DE':'2500','GB':'1500'}] if wh=='26027298' else []))
order('F-276766064bb2','26027223',U,[row(p,f'印刷明细{j}','TI','SN74AHC1G08DBVR','US',q,unit='EA',net=n) for p,j,q,n in [(1,1,300000,'19.6'),(2,1,300000,'19.2'),(3,1,300000,'24.1'),(4,1,120000,U),(4,2,180000,U),(5,1,300000,'17.0'),(6,1,300000,'25.3')]],'现有PDF6页，原印刷页码为1～6 OF 8，缺页7、8；箱明细和手写抽出数量为附属证据，不代替印刷明细或拆库存。Sold to/最终目的方为FUJIAN STAR-NET AIOT TECHNOLOGY CO., LTD；未知与百闽海关系。',[{'page':4,'scope':'两条批次','净重':'22.6'},{'page':1,'scope':'仓库章整单','件数':'29','毛重':'136'}])
# 欧陆通：查货正文明确客户；委托原件缺商品明细，内部结果仅作参考。
def ol(fid,wh,rs,note='',shared=None):order(fid,wh,OL,rs,note,shared)
ol('F-5dc64ab64d12','26040077',[row(1,f'箱{i}','AOS',m,'China',q,packages=1,net=n,gross=g) for i,(m,q,n,g) in enumerate([('AOD3N80',2500,'1.94','2.44'),('AON6512',6000,'1.63','2.13'),('AON6354',3000,'0.80','1.30')],1)],'第2页合计，第3页发票，不重复计商品。')
ol('F-168417940250','26040117',[row(1,f'箱{i}','ST',m,o,q,packages=1,net=n,gross=g) for i,(m,o,q,n,g) in enumerate([('M24C02-RMN6TPTHA','France',5000,'.400','2.140'),('PM8834TR','Italy',5000,'.400','2.090'),('STD4N80K5','Italy',2500,'.750','1.970')],1)],'保留DESCRIPTION完整型号及IC BODY基础型号差异，发票为辅助证据。')
ol('F-2e8354efac27','26040114',[row(1,'箱001','ST','LM393DT','China',2500,packages=1,net='.200',gross='1.220')])
ol('F-929e7033b39f','26040116',[row(1,'箱001','TAIWAN SEMICONDUCTOR','SK310A','China',7500,packages=1,net='.360',gross='1.400')])
ol('F-7d97d15951fc','26040139',[row(1,'箱001','ST','STM32G474MCT6','France',714,packages=1,net='.358',gross='2.160')])
ol('F-f1e1e4ea2ac5','26040716',[row(1,'箱1','ON','MMUN2214LT1G','CN',6000,unit='pcs',packages=1,net='.34',gross='.40')])
ol('F-da9dfc44a0f9','26040156',[row(1,'箱1','MICROCHIP','PIC18F25K22T-E/SS','TH',6300,packages=1,net='3.500',gross='4.100'),row(1,'箱2','MICROCHIP','PIC18F46K22T-I/PT','TH',3600,packages=1,net='4.000',gross='4.900')], '第3页产地说明明确COO TH、COD USA；内部结果产地美国不能覆盖COO。')
ol('F-c578af30ff9a','26040177',[row(1,'箱1','DIODES','D-SBR10U60CT','CN 中国',100,packages=1,net='.19',gross='.95')])
ol('F-cd33df861950','26040178',[row(1,'箱1','VISHAY','SIHP21N60EF-GE3','Israel 以色列',2000,packages=1,net='3.90',gross='6.08'),row(1,'箱2','ROHM','R6030ENZ4C13','CN 中国',1200,packages=1,net='7.62',gross='10.40')])
ol('F-ea04d3e7518a','26040179',[row(1,'箱1','INFINEON','IPW65R041CFD7(SP005413359)','CN 中国',720,packages=1,net='5.22',gross='6.53')])
ol('F-93c7d7713617','26040084',[row(1,'箱1批次1','DIODES','S8KC-13','TAIWAN,CHINA',12000),row(1,'箱1批次2','DIODES','S8KC-13','TAIWAN,CHINA',3000),row(2,'箱1','DIODES','BSS84DW-7-F','CHINA',3000,packages=1,net='.28',gross='.40')], '两份箱单同一入仓号；第3页送货汇总不重复计入。',[{'page':1,'scope':'箱1两个批次','件数':'1','净重':'6.36','毛重':'7.00'}])
bsc=[15000,10000,20000,5000,15000,5000,20000,15000,30000,45000,15000,10000,20000,45000,10000,10000,5000]
rs=[row(1 if i<=11 else 2,f'BSC批次明细{i}','INFINEON','BSC026N08NS5','CHINA',q,**{'COD':'GERMANY'}) for i,q in enumerate(bsc,1)]
spa=[500,2500,2000,500,2000,2500,500,2000,2500,2500,2500,1500]
rs += [row(3 if i<=11 else 4,f'SPA批次明细{i}','INFINEON','SPA11N65C3','CHINA',q,**{'COD':'MALAYSIA'}) for i,q in enumerate(spa,1)]
rs += [row(4,f'其他商品明细{i}','INFINEON',m,o,q,net=n,gross=g) for i,(m,o,q,n,g) in enumerate([('IPW60R037CSFD','CHINA',240,U,U),('IPW60R037CSFD','CHINA',240,U,U),('IPW60R120P7','CHINA',240,U,U),('IPW60R120P7','CHINA',240,U,U),('IPW60R045P7','CHINA',480,'4.09','4.34'),('IPP110N20N3 G','CHINA',500,'1.62','1.87'),('IPA80R600P7','CHINA',500,'1.71','1.96'),('2EDN7524F','PHILIPPINES',2500,'1.13','1.54'),('BSC010N04LS','CHINA',5000,'1.33','1.70')],1)]
ol('F-5b778363f744','26040083',rs,'箱单印刷38条批次商品；每箱共用重量不分摊，5页备注及6页送货汇总不重复计入。第4页BSC010N04LS净重1.33，内部结果1.32存在差异。',[{'page':2,'scope':'BSC026N08NS5箱单','件数':'7','数量':'295000','净重':'68.09','毛重':'73.34'},{'page':4,'scope':'其他8型号箱单','件数':'12','数量':'31440','净重':'87.64','毛重':'93.84'},{'page':4,'scope':'IPW60R037CSFD两行','件数':'1','净重':'4.12','毛重':'4.37'},{'page':4,'scope':'IPW60R120P7两行','件数':'1','净重':'4.14','毛重':'4.39'}])
# 不含联系人、地址及银行信息的复核登记。参考结果仍独立保留角色。
REVIEW={}
for d in DOCS.values():
 REVIEW[d['id']]={'fileId':d['id'],'sampleId':d['sampleId'],'role':d['role'],'pages':[{'page':p['page'],'review':'已检查整页结构、表头、行结构及入仓标记；识读存疑字段保留UNKNOWN','evidence':p['renderPath']} for p in d.get('pages',[])],'sheets':[{'sheet':s['name'],'rows':s['rows'],'columns':s['columns'],'merged':s['merged']} for s in d.get('sheets',[])]}
if __name__=='__main__':
 (OUT/'reviewed-facts.json').write_text(json.dumps({'inspectionOrders':ORDERS,'reviewLog':list(REVIEW.values())},ensure_ascii=False,indent=2))
 print('reviewed orders',len(ORDERS),'rows',sum(len(o['rows']) for o in ORDERS))
