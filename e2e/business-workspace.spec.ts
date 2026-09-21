import { expect, test } from '@playwright/test';

test('首页全量数据与旧场景迁移保留', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();
  await expect(page.locator('.cw-customer')).toHaveCount(9);
  await expect(page.getByText(/已整理 72 份材料/)).toBeVisible();
  await page.evaluate(() => {
    const key = 'jiuli-demo-workspace-v1';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.version = 1;
    data.state.scenarioId = 'SC-08';
    data.state.drafts = [data.state.drafts[0]];
    data.state.drafts[0].lastUpdateReason = '迁移前人工记录';
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();
  await page.getByRole('button', {name: '继续之前的演示场景'}).click();
  await expect(page.getByText('演示场景 SC-08', {exact:true})).toBeVisible();
  const reason = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state.drafts[0].lastUpdateReason);
  expect(reason).toBe('迁移前人工记录');
  await page.getByRole('button', {name: '返回完整客户业务'}).click();
  await page.reload();
  await expect(page.getByText(/已整理 72 份材料/)).toBeVisible();
  expect(errors).toEqual([]);
});
