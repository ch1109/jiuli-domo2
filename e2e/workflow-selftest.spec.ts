import {expect,test,type Page} from '@playwright/test';
import {confirmAll,openRelations,selectField} from './workbench-helpers';

async function openMatched(page:Page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Demo 控制台'}).click();
  await page.locator('.scenario-card').filter({hasText:'SC-08'}).click();
  await page.getByRole('button',{name:'委托草稿'}).click();
  await page.locator('.draft-card').click();
  await page.getByRole('button',{name:/执行首次匹配/}).click();
  await page.getByRole('button',{name:'提交人工复核'}).click();
  await confirmAll(page);
}
async function saved(page:Page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state);
}

test('确认后修改必须再确认，封版后刷新仍只读且只核销一次',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await openMatched(page);
  await selectField(page,(await saved(page)).drafts[0].lines[0].id,'产地');
  await page.getByLabel('手动修改 产地').fill('人工复核产地');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await openRelations(page);
  await expect(page.getByRole('button',{name:/确认本行/})).toHaveCount(1);
  await page.getByRole('button',{name:'确认完成'}).click();
  expect((await saved(page)).finalReconciliations).toHaveLength(0);
  await page.getByRole('button',{name:/确认本行/}).click();
  await page.getByRole('button',{name:'确认完成'}).click();
  await expect(page.getByText('最终 25 列核对单')).toBeVisible();
  const before=await saved(page);
  expect(before.sources.filter((s:{availability:string})=>s.availability==='已核销')).toHaveLength(2);
  await page.reload();
  await expect(page.getByText('最终 25 列核对单')).toBeVisible();
  await expect(page.getByRole('button',{name:'解绑查货依据',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('手动修改 产地')).toHaveCount(0);
  expect((await saved(page)).finalReconciliations).toEqual(before.finalReconciliations);
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('finalized.png'),fullPage:true});
});

test('确认中解绑可返回匹配，重配最终单不引用旧模型证据',async({page},testInfo)=>{
  await openMatched(page);
  const before=await saved(page);const first=before.drafts[0].lines[0];
  const oldIds=before.evidence.filter((e:{entrustmentLineId:string;modelDecision:unknown})=>e.entrustmentLineId===first.id&&e.modelDecision).map((e:{id:string})=>e.id);
  await page.getByLabel('选择商品',{exact:true}).selectOption(first.id);
  await openRelations(page);
  await page.getByRole('button',{name:'解绑查货依据',exact:true}).click();
  await expect(page.getByRole('button',{name:/执行首次匹配/})).toBeVisible();
  expect((await saved(page)).sources.filter((s:{availability:string})=>s.availability==='草稿占用')).toHaveLength(1);
  await page.reload();
  await page.getByRole('button',{name:/执行首次匹配/}).click();
  await page.getByRole('button',{name:'提交人工复核'}).click();
  await openRelations(page);
  await expect(page.getByRole('button',{name:/确认本行/})).toHaveCount(1);
  await page.getByRole('button',{name:/确认本行/}).click();
  await page.getByRole('button',{name:'确认完成'}).click();
  await expect(page.getByText('最终 25 列核对单')).toBeVisible();
  const after=await saved(page);
  expect(after.finalReconciliations[0].finalEvidenceIds.some((id:string)=>oldIds.includes(id))).toBe(false);
  expect(after.evidence.filter((e:{id:string})=>oldIds.includes(e.id))).toHaveLength(oldIds.length);
  await page.screenshot({path:testInfo.outputPath('rematched-final.png'),fullPage:true});
});
