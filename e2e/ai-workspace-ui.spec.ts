import { expect, test } from '@playwright/test';

test('字段结果与证据面板保持联动', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: '当前核对任务' }).click();
  await expect(page.locator('.draft-master-table thead th')).toHaveCount(29);
  await page.locator('.draft-master-table tbody tr').first().locator('td.draft-cell').first().click();
  await expect(page.locator('.context-field-name')).toContainText('当前字段');
  await expect(page.locator('.source-compare-card')).toBeVisible();
  await expect(page.locator('.source-ai-explanation')).toBeVisible();
});

test('窄屏能打开商品导航与字段证据', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '当前核对任务' }).click();
  await expect(page.locator('.recon-left-queue')).toBeHidden();
  await page.getByRole('button', { name: '商品与问题' }).click();
  await expect(page.locator('.recon-left-queue')).toBeVisible();
  await page.getByRole('button', { name: '关闭商品与问题面板' }).click();
  await page.getByRole('button', { name: '字段证据', exact: true }).click();
  await expect(page.locator('.recon-right-evidence')).toBeVisible();
  await page.getByRole('button', { name: '关闭字段证据面板' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('中等宽度保持核对结果可读并通过抽屉查看证据', async ({ page }) => {
  await page.setViewportSize({ width: 965, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '当前核对任务' }).click();
  const workspace = page.locator('.recon-columns-v2');
  const result = page.locator('.recon-center-draft');
  const workspaceBox = await workspace.boundingBox();
  const resultBox = await result.boundingBox();
  expect(resultBox!.width).toBeGreaterThan(550);
  expect(resultBox!.width).toBeCloseTo(workspaceBox!.width, 0);
  await page.getByRole('button', { name: '字段证据', exact: true }).click();
  await expect(page.locator('.recon-right-evidence')).toBeVisible();
  await page.getByRole('button', { name: '关闭字段证据面板' }).click();
});

test('新建任务弹窗遮罩全屏且键盘可关闭', async ({ page }) => {
  await page.setViewportSize({ width: 2122, height: 1076 });
  await page.goto('/');
  await page.getByRole('button', { name: '新建核对任务' }).click();
  const dialog = page.getByRole('dialog', { name: '新建核对任务' });
  await expect(dialog).toBeVisible();
  const backdrop = await page.locator('.intake-modal-backdrop').boundingBox();
  expect(backdrop!.x).toBe(0);
  expect(backdrop!.width).toBe(2122);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
