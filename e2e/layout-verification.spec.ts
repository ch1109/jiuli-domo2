import { test, expect } from '@playwright/test';

test('验证主布局两栏并排与各视图正常渲染', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // 1. 验证 .shell
  const shell = page.locator('.shell');
  await expect(shell).toBeVisible();
  const shellDisplay = await shell.evaluate((el) => window.getComputedStyle(el).display);
  expect(shellDisplay).toBe('flex');

  // 2. 验证 .sidebar
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.x).toBe(0);
  expect(sidebarBox!.y).toBe(0);
  expect(sidebarBox!.width).toBeCloseTo(246, 2);

  // 3. 验证 .content
  const content = page.locator('.content');
  await expect(content).toBeVisible();
  const contentBox = await content.boundingBox();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.x).toBeCloseTo(246, 2);
  expect(contentBox!.y).toBe(0);
  expect(contentBox!.width).toBeGreaterThan(1000);

  // 截图首页
  await page.screenshot({ path: '/Users/chch/.gemini/antigravity/brain/6cd7318f-5728-4752-8730-9a81833c3a1c/home-verified.png', fullPage: false });

  // 切换到核对工作台
  await page.getByRole('button', { name: '当前核对任务' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/chch/.gemini/antigravity/brain/6cd7318f-5728-4752-8730-9a81833c3a1c/workbench-verified.png', fullPage: false });

  // 再次验证核对工作台下的并排
  const wbContentBox = await content.boundingBox();
  expect(wbContentBox!.x).toBeCloseTo(246, 2);
  expect(wbContentBox!.y).toBe(0);
});
