import {expect,type Page} from '@playwright/test';
import type {UiDraft} from '../lib/demo-store';
export async function saved(page:Page) {return page.evaluate(()=>JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state);}
export async function selectField(page:Page,lineId:string,field:string) {
  await page.getByLabel('选择商品',{exact:true}).selectOption(lineId);
  await page.getByRole('button',{name:'字段核对',exact:true}).click();
  await page.getByRole('button',{name:/^全部字段/}).click();
  await page.locator('.recon-field-table').getByRole('button',{name:field,exact:true}).click();
}
export async function openRelations(page:Page) {
  const details=page.locator('.relation-tools');if((await details.getAttribute('open'))===null)await details.locator('summary').first().click();
}
export async function confirmAll(page:Page) {
  const state=await saved(page);const draft:UiDraft=state.drafts.find((d:UiDraft)=>d.id===state.selectedDraftId);
  for(const line of draft.lines){await page.getByLabel('选择商品',{exact:true}).selectOption(line.id);await openRelations(page);const button=page.getByRole('button',{name:'确认本行',exact:true});if(await button.count())await button.click();}
}
export async function resolveConflicts(page:Page) {
  const state=await saved(page);const draft:UiDraft=state.drafts.find((d:UiDraft)=>d.id===state.selectedDraftId);
  for(const line of draft.lines)for(const issue of line.issueIds.filter(i=>i.startsWith('字段冲突:'))){await selectField(page,line.id,issue.slice(5));await page.getByLabel('处理原因').fill('以最终委托为准');await page.getByRole('button',{name:'采用委托值',exact:true}).click();}
}
export async function expectFinal(page:Page) {await expect(page.getByText('最终 25 列核对单',{exact:true})).toBeVisible();}
