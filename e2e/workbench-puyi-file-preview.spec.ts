import { expect, test } from '@playwright/test';

test('上海澜壹任务无需OCR直接定位并渲染原文件（Excel与PDF双向切换）', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });

  await page.goto('/');
  // 进入委托草稿列表
  await page.getByRole('button', { name: '委托草稿', exact: true }).click();
  // 找到上海浦壹/上海澜壹对应的草稿卡片并打开
  const card = page.locator('.draft-card').filter({ hasText: /浦壹|澜壹/ }).first();
  await expect(card).toBeVisible();
  await card.click();

  // 此时进入核对工作台
  await expect(page.getByRole('heading', { name: /上海浦壹|上海澜壹/ })).toBeVisible();
  
  // 选择商品 06 (即截图中选中的商品 R012)
  await page.getByRole('button', { name: /商品 06/ }).click();

  // 点击字段“品牌”
  await page.getByRole('button', { name: '字段核对', exact: true }).click();
  await page.getByRole('button', { name: '品牌', exact: true }).click();

  // 验证右侧面板上下文与非OCR直接定位说明
  await expect(page.locator('.evidence-context')).toContainText('当前字段：品牌');
  await expect(page.locator('.evidence-direct-note')).toBeVisible();

  // 验证原文件切换栏中存在委托书与查货单
  const tabs = page.locator('.material-file-tabs .material-file-tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.filter({ hasText: '报关委托确认单' })).toBeVisible();
  await expect(tabs.filter({ hasText: '1774838084919.pdf' })).toBeVisible();

  // 验证当前默认渲染了原文件表格（Excel）
  await expect(page.locator('.preview-document table')).toBeVisible();

  // 点击切换到查货单 PDF
  await tabs.filter({ hasText: '1774838084919.pdf' }).click();
  await expect(page.getByLabel('PDF 原文件预览')).toBeVisible();
  await expect.poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(400);

  // 截图留存
  await page.screenshot({ path: info.outputPath('puyi-file-preview.png'), fullPage: true });
  expect(errors).toEqual([]);
});
