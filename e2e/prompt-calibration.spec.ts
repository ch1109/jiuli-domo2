import {expect,test} from '@playwright/test';
import fixture from '../demo-generated/mock/real-calibration-sc08.json';
import {selectField} from './workbench-helpers';

test('SC-08 页面回放实际 P3/P4，刷新保留结果和缺证据说明',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Demo 控制台'}).click();
  await page.locator('.scenario-card').filter({hasText:'SC-08'}).click();
  await page.getByRole('button',{name:'委托草稿'}).click();
  await page.locator('.draft-card').click();
  await page.getByRole('button',{name:/执行首次匹配/}).click();
  await selectField(page,fixture.orderRows[0].id,'入仓号');
  await expect(page.getByLabel('手动修改 入仓号')).toHaveValue('25120336');
  await selectField(page,fixture.orderRows[0].id,'数量');
  await expect(page.getByText('数值相同但查货单位缺失，不能完成整行数量可比核验。').first()).toBeVisible();
  await expect(page.getByText(fixture.stageOutputs.P2.issues[0].message,{exact:true}).first()).toBeVisible();
  await page.reload();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state);
  for(const patch of fixture.rowPatches) {
    expect(state.evidence.filter((e:{entrustmentLineId:string;modelDecision:unknown})=>e.entrustmentLineId===patch.order_row_id && e.modelDecision).map((e:{modelDecision:unknown})=>e.modelDecision)).toEqual(patch.field_decisions);
  }
  expect(state.relations.map((r:{inspectionSourceLineIds:string[]})=>r.inspectionSourceLineIds)).toEqual(fixture.relations.map(r=>r.selected_raw_row_ids));
  expect(state.versions).toHaveLength(1);
});
