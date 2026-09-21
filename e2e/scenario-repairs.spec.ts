import { expect, test, type Page } from '@playwright/test';
import recipes from '../demo-generated/mock/scenarios.json';
import type { UiDraft } from '../lib/demo-store';
async function load(page: Page, id: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo 控制台' }).click();
  await page.locator('.scenario-card').filter({ hasText: id }).click();
  await page.getByRole('button', { name: '委托草稿', exact: true }).click();
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state);
}
for (const id of ['SC-01', 'SC-02', 'SC-06']) test(`${id} 页面新建、匹配与刷新`, async ({ page }) => {
  await load(page, id);
  await expect(page.locator('.draft-card')).toHaveCount(0);
  await page.getByRole('button', { name: '新建 / 打开草稿' }).click();
  await expect(page.getByRole('button', { name: '执行首次匹配' })).toBeVisible();
  if (id === 'SC-02') {
    await page.getByRole('button', { name: '执行首次匹配' }).click();
    expect((await saved(page)).relations).toHaveLength(0);
    await page.getByLabel('补充委托客户').selectOption('C-66be07d6cabe');
  }
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  const before = await saved(page);
  expect(before.relations.length).toBeGreaterThan(0);
  await page.reload();
  expect((await saved(page)).relations).toEqual(before.relations);
});
for (const id of ['SC-14', 'SC-15', 'SC-16', 'SC-21']) test(`${id} 人工选料、冲突处理、封版核销`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await load(page, id);
  await page.locator('.draft-card').click();
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  expect((await saved(page)).relations).toHaveLength(0);
  const draft: UiDraft = (await saved(page)).drafts[0];
  for (const [index, line] of draft.lines.entries()) {
    await expect(page.getByRole('button', { name: '提交人工确认' })).toBeDisabled();
    await page.getByLabel(`选择 ${line.id} 查货依据`).selectOption(`I-8bc7177252aa-25120336-L00${index + 1}`);
  }
  await page.getByRole('button', { name: '提交人工确认' }).click();
  await page.getByRole('button', { name: '确认完成', exact: true }).click();
  expect((await saved(page)).finalReconciliations).toHaveLength(0);
  while (await page.getByRole('button', { name: /^保留委托值：/ }).count()) {
    await page.getByRole('button', { name: /^保留委托值：/ }).first().click();
  }
  while (await page.getByRole('button', { name: /确认本行/ }).count()) {
    await page.getByRole('button', { name: /确认本行/ }).first().click();
  }
  await page.getByRole('button', { name: '确认完成', exact: true }).click();
  await expect(page.getByText('最终 25 列核对单')).toBeVisible();
  await page.reload();
  await expect(page.getByText('最终 25 列核对单')).toBeVisible();
  expect((await saved(page)).sources.filter((source: { availability: string }) => source.availability === '已核销')).toHaveLength(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`${id}-completed.png`), fullPage: true });
});

for (const id of ['SC-05', 'SC-18', 'SC-19']) test(`${id} 完整原始行人工组合，不重复占用，缺料不封版`, async ({ page }) => {
  await load(page, id);
  // These are explicit selections from the existing scenario recipe, not inferred matches.
  const recipe = recipes.find(item => item.id === id)!;
  for (const step of recipe.steps) {
    if (step.action === '新建委托草稿' && 'batchIds' in step) {
      for (const batch of step.batchIds ?? []) {
        await page.getByRole('button', { name: '委托草稿', exact: true }).click();
        await page.getByRole('button', { name: '新建 / 打开草稿' }).click();
        expect((await saved(page)).selectedDraftId).toBe(batch.replace(/^B-/, ''));
      }
    }
    if (step.action === '人工选择原始行' && 'entrustmentLineId' in step && 'sourceLineIds' in step) {
      const state = await saved(page);
      const draft: UiDraft = state.drafts.find((item: UiDraft) => item.lines.some(line => line.id === step.entrustmentLineId));
      await page.getByRole('button', { name: '委托草稿', exact: true }).click();
      await page.locator('.draft-card').filter({ hasText: draft.displayNo }).click();
      await page.getByLabel(`组合 ${step.entrustmentLineId} 查货依据`).selectOption(step.sourceLineIds!);
      const row = page.getByRole('row').filter({ hasText: step.entrustmentLineId! });
      await row.getByRole('button', { name: '建立组合关系' }).click();
      const after = await saved(page);
      const relation = after.relations.find((item: { entrustmentLineId: string }) => item.entrustmentLineId === step.entrustmentLineId);
      expect(relation.inspectionSourceLineIds).toEqual(step.sourceLineIds);
      const allIds = after.relations.flatMap((item: { inspectionSourceLineIds: string[] }) => item.inspectionSourceLineIds);
      expect(new Set(allIds).size).toBe(allIds.length);
      await expect(page.getByRole('button', { name: '提交人工确认' })).toBeDisabled();
      expect(after.finalReconciliations).toHaveLength(0);
    }
  }
});

test('材料队列可按指定基线委托建稿，重复点击不创建第二张', async ({ page }) => {
  await load(page, 'SC-01');
  await page.getByRole('button', { name: '材料接入', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'F-3c3cc10bd26b' });
  await row.getByRole('button', { name: /生成委托草稿/ }).click();
  expect((await saved(page)).selectedDraftId).toBe('D-3c3cc10bd26b');
  await page.getByRole('button', { name: '材料接入', exact: true }).click();
  await row.getByRole('button', { name: /生成委托草稿/ }).click();
  expect((await saved(page)).drafts).toHaveLength(1);
  await expect(page.getByText('该委托材料已经生成草稿，不能重复生成')).toBeVisible();
});
