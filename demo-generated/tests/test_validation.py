import unittest,copy,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from validate import validate,validate_scenario,InvalidData,source_integrity
from scenario_loader import baseline,load,apply
from build_mock import make_groups,MOCK,read
class BaselineValidation(unittest.TestCase):
 def setUp(self):self.data=baseline()
 def reject(self,pattern):
  with self.assertRaisesRegex(InvalidData,pattern):validate(self.data)
 def test_valid_baseline(self):self.assertTrue(validate(self.data))
 def test_cross_customer_relation(self):
  self.data['reviewed-relations'][0]['customerId']='C-invalid';self.reject('cross-customer')
 def test_unknown_customer_not_pending(self):
  d=next(d for d in self.data['entrustment-drafts'] if d['customerId']=='UNKNOWN');d['customerStatus']='已识别';self.reject('not pending')
 def test_unknown_inspection_entering_pool(self):
  r=next(r for r in self.data['inspection-source-lines'] if r['customerId']=='UNKNOWN');r['availability']='unloaded';self.reject('unknown customer entering pool')
 def test_missing_group_component(self):
  self.data['inspection-groups'][0]['sourceLineIds']=['nonexistent'];self.reject('group components')
 def test_wrong_quantity_sum(self):
  self.data['inspection-groups'][0]['totals']['数量']='0';self.reject('decimal totals')
 def test_wrong_net_sum(self):
  self.data['inspection-groups'][0]['totals']['净重']='0';self.reject('decimal totals')
 def test_wrong_gross_sum(self):
  self.data['inspection-groups'][0]['totals']['毛重']='0';self.reject('decimal totals')
 def test_unknown_group_weight_to_zero(self):
  g=next(g for g in self.data['inspection-groups'] if g['totals']['净重']=='UNKNOWN');g['totals']['净重']='0';self.reject('UNKNOWN propagation')
 def test_unknown_source_weight_to_zero_even_with_recomputed_totals(self):
  r=next(r for r in self.data['inspection-source-lines'] if r['fields']['净重']=='UNKNOWN');r['fields']['净重']='0';self.data['inspection-groups']=make_groups(self.data['inspection-source-lines']);self.reject('original source fact changed')
 def test_entrustment_same_model_merge(self):
  d=next(d for d in self.data['entrustment-drafts'] if d['sampleId']=='2026AG001');removed=d['lineIds'].pop();self.data['entrustment-lines']=[l for l in self.data['entrustment-lines'] if l['id']!=removed];self.data['field-evidence']=[e for e in self.data['field-evidence'] if e['entityId']!=removed];self.reject('entrustment lines merged')
 def test_column_order(self):
  cols=self.data['field-contract']['columns'];cols[0],cols[1]=cols[1],cols[0];self.reject('25 columns/order')
 def test_original_row_multiple_orders(self):
  self.data['inspection-orders'][1]['sourceLineIds'].append(self.data['inspection-orders'][0]['sourceLineIds'][0]);self.reject('ownership')
 def test_multiple_warehouse_values(self):
  self.data['inspection-orders'][0]['warehouseNo']=['1','2'];self.reject('one warehouse')
 def test_duplicate_allocation(self):
  self.data['reviewed-relations'].append(copy.deepcopy(self.data['reviewed-relations'][0]));self.reject('duplicate original row allocation')
 def test_reference_used_as_input(self):
  fid=self.data['inspection-source-lines'][0]['source']['fileId'];next(f for f in self.data['source-files'] if f['id']==fid)['role']='reference-result';self.reject('reference/auxiliary')
 def test_missing_source_position(self):
  self.data['inspection-source-lines'][0]['source'].pop('position');self.reject('source location missing')
 def test_precomputed_occupation(self):
  self.data['inspection-source-lines'][0]['occupation']='D-fake';self.reject('initial occupied')
 def test_source_files_unchanged(self):self.assertEqual(source_integrity()['status'],'PASS')
class ScenarioValidation(unittest.TestCase):
 def test_all_21_scenarios_and_copy_isolation(self):
  for s in read(MOCK/'scenarios.json'):
   with self.subTest(scenario=s['id']):
    a=load(s['id']);b=load(s['id']);self.assertEqual(a,b);self.assertTrue(validate_scenario(a));a['facts']['entrustment-lines'][0]['fields']['品牌']='污染';self.assertEqual(load(s['id']),b)
 def test_cross_customer_candidate(self):
  b=load('SC-09');c=b['scenario']['candidateSets'][0];wrong=next(r['id'] for r in b['facts']['inspection-source-lines'] if r['customerId']!=next(l['customerId'] for l in b['facts']['entrustment-lines'] if l['id']==c['entrustmentLineId']));c['options'][0]=[wrong]
  with self.assertRaisesRegex(InvalidData,'cross-customer candidate'):validate_scenario(b)
 def test_cross_customer_action(self):
  b=load('SC-16');st=b['scenario']['steps'][0];st['sourceLineIds']=[next(r['id'] for r in b['facts']['inspection-source-lines'] if r['customerId']=='UNKNOWN')]
  with self.assertRaisesRegex(InvalidData,'cross-customer action'):validate_scenario(b)
 def test_invalid_batch(self):
  b=load('SC-06');b['initialBatchIds']=['missing']
  with self.assertRaisesRegex(InvalidData,'initial batch'):validate_scenario(b)
 def test_patch_previous_value_guard(self):
  b=baseline();override=copy.deepcopy(next(o for o in read(MOCK/'scenario-overrides.json') if o['id']=='OV-EXACT-MODEL'));override['operations'][0]['before']='wrong'
  with self.assertRaises(AssertionError):apply(b,override)
 def test_many_to_many_is_not_independent_pairs(self):
  b=load('SC-19');b['scenario']['expectedRelations']=b['scenario']['expectedRelations'][:1]
  with self.assertRaisesRegex(InvalidData,'not actual crossed'):validate_scenario(b)
 def test_revision_not_applied_on_load(self):
  b=load('SC-11');revision=b['facts']['revision-materials'][0]
  for ch in revision['changes']:self.assertEqual(next(l for l in b['facts']['entrustment-lines'] if l['id']==ch['lineId'])['fields'][ch['field']],ch['before'])
if __name__=='__main__':unittest.main()
