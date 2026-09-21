"""Deterministic adapter: preserve Sol facts and decisions; never infer matches."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / 'demo-generated/real-calibration/SC-08-audit'
OUTPUT = ROOT / 'demo-generated/mock/real-calibration-sc08.json'
KEYS = 'customer_name brand model description product_name origin unit quantity customs_unit_price total_price currency packages net_weight gross_weight sku buyer supplier_code supplier payment_term_days purchase_order_no material_no pallet_count warehouse_no production_line remark'.split()
LABELS = '客户名 品牌 型号 商品描述 品名 产地 单位 数量 报关单价 总价 币种 件数 净重 毛重 sku 对应的采购 供应商号码 供应商 期票天数 采购订单号 物料号码 托盘数 入仓号 产线 备注'.split()
FIELD_MAP = dict(zip(KEYS, LABELS))

def read(name):
    return json.loads((AUDIT / name).read_text())

def location(source):
    return {'fileId': source['file_id'], 'page': source.get('page'), 'sheet': source.get('sheet'), 'position': f"第 {source['row']} 行" if source.get('row') else source.get('raw_text')}

def convert():
    from verify_sol_execution import verify
    verify()
    provenance = read('provenance.json')
    for section, base in [('artifact_sha256', AUDIT), ('source_sha256', ROOT)]:
        for name, expected in provenance[section].items():
            if hashlib.sha256((base / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f'Hash mismatch: {name}')
    execution = read('execution-evidence.json')
    assert any(r.get('model') == 'gpt-5.6-sol' for r in execution['records']), 'Missing host model evidence'
    assert provenance['model'] == 'gpt-5.6-sol'
    requests, responses = {}, {}
    for stage in ['P1', 'P2', 'P3', 'P4']:
        req, res = read(f'{stage}-request.json'), read(f'{stage}-response.json')
        assert req['schema_version'] == res['schema_version'] == 'jiuli-ai-v3'
        assert req['prompt'] == res['prompt'] == stage
        assert req['request_id'] == res['request_id']
        assert res['output']['processing_status'] == 'SUCCESS'
        requests[stage], responses[stage] = req, res['output']
    p1, p2, p3, p4 = (responses[s] for s in ['P1', 'P2', 'P3', 'P4'])
    countries = requests['P2']['context']['normalization']['countries']
    order_rows = []
    for row in p1['rows']:
        assert set(row['values']) == set(KEYS)
        row_id = f"D-{row['source']['file_id'][2:]}-R{row['source']['row']:03d}"
        fields = {FIELD_MAP[k]: v or None for k,v in row['values'].items()}
        order_rows.append({'id':row_id, 'fields':fields, 'baseValues':fields.copy(), 'sourceOrder':row['row_no'], 'sourceLocation':location(row['source']), 'facts':row})
    source_rows = []
    for row in p2['raw_rows']:
        logical_id = f"I-{row['source']['file_id'][2:]}-{row['warehouse_no']}"
        # Unique literal origin for pool display only; no priority adjudication.
        origins = list(dict.fromkeys(c['value'] for c in row['origin_candidates']))
        fields = {FIELD_MAP[k]:row['fields'].get(k) or None for k in ['brand','model','quantity','unit','packages','net_weight','gross_weight']}
        fields['产地'] = origins[0] if len(origins)==1 else None
        other = {FIELD_MAP.get(k,k):v for k,v in row['fields'].items() if FIELD_MAP.get(k,k) not in fields}
        other.update({'入仓号':row['warehouse_no'], '范围事实':json.dumps(p2['scope_records'],ensure_ascii=False), '来源问题':json.dumps(p2['issues'],ensure_ascii=False)})
        if len(origins)==1 and origins[0] in countries: other['标准产地']=countries[origins[0]]
        source_rows.append({'id':f"{logical_id}-L{row['record_no']:03d}", 'customerId':p2['customer_id'], 'logicalInspectionOrderId':logical_id, 'warehouseNo':row['warehouse_no'], 'sourceFileId':row['source']['file_id'], 'sourceLocation':location(row['source']), 'fields':fields, 'otherFields':other, 'facts':row})
    orders = {r['id']:r for r in order_rows}; sources = {r['id']:r for r in source_rows}
    assert set(orders)=={r['order_row_id'] for r in requests['P3']['input']['order_rows']}
    assert set(sources)=={r['raw_row_id'] for r in requests['P3']['input']['inspection_candidates']}
    for item in requests['P3']['input']['order_rows']:
        original=orders[item['order_row_id']]['facts']['values']
        for key,value in item['identity'].items():
            if key in original: assert value==original[key], f'P1→P3 fact mismatch: {key}'
    for item in requests['P3']['input']['inspection_candidates']:
        original=sources[item['raw_row_id']]['facts']
        for key,value in item['identity'].items():
            if key in original['fields']: assert value==original['fields'][key], f'P2→P3 fact mismatch: {key}'
        assert item['warehouse_no']==original['warehouse_no']
        assert item['customer_id']==p2['customer_id']
    relations = p3['row_relations']
    assert len(relations)==len(orders) and {r['order_row_id'] for r in relations}==set(orders)
    allocated=[]
    for relation in relations:
        assert set(relation['selected_raw_row_ids']) <= set(sources)
        if relation['match_status']=='MATCHED':
            assert relation['selected_raw_row_ids']
            allocated.extend(relation['selected_raw_row_ids'])
        else: assert not relation['selected_raw_row_ids']
    assert len(allocated)==len(set(allocated)), 'Duplicate resource allocation'
    targets={r['order_row_id']:r for r in requests['P4']['input']['target_rows']}
    assert len(p4['row_patches'])==len(targets)
    for patch in p4['row_patches']:
        target=targets[patch['order_row_id']]
        relation=next(r for r in relations if r['order_row_id']==patch['order_row_id'])
        assert target['relation']['raw_row_ids']==relation['selected_raw_row_ids']
        assert target['relation']['coverage']==relation['coverage']
        assert patch['evaluated_fields']==target['evaluated_fields']
        assert [d['field'] for d in patch['field_decisions']]==target['evaluated_fields']
        for d in patch['field_decisions']:
            f=target['fields'][d['field']]
            assert (orders[patch['order_row_id']]['fields'][FIELD_MAP[d['field']]] or '')==f['base_value']
            assert set(d['referenced_issue_ids']) <= {i['issue_id'] for i in f['unresolved_issues']}
            evidence=f['evidence']+target.get('relation_warehouse_evidence',[])
            assert set(d['evidence_keys']) <= {e['evidence_key'] for e in evidence}
            if d['decision'] not in ['FILL','UPDATE']: assert d['result_value']==f['current_value']
    return {'schemaVersion':2,'scenarioId':'SC-08','model':provenance['model'],'auditId':provenance['audit_id'],
        'customerId':p2['customer_id'], 'draftId':order_rows[0]['id'].rsplit('-R',1)[0],
        'provenanceFile':'demo-generated/real-calibration/SC-08-audit/provenance.json',
        'executionEvidenceSha256':hashlib.sha256((AUDIT/'execution-evidence.json').read_bytes()).hexdigest(),
        'artifactSha256':provenance['artifact_sha256'], 'fieldMap':FIELD_MAP,
        'orderRows':order_rows, 'sourceLines':source_rows,'relations':relations,'rowPatches':p4['row_patches'],
        'verificationTargets':list(targets.values()),'stageOutputs':responses}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    fixture=convert(); content=json.dumps(fixture,ensure_ascii=False,indent=2)+'\n'
    if args.check:
        assert OUTPUT.read_text()==content, 'Fixture differs from deterministic conversion'
        print('Four stages, hashes, references and fixture checked')
    else:
        OUTPUT.write_text(content)
        print('Generated fixture from all four Sol responses')

if __name__=='__main__': main()
