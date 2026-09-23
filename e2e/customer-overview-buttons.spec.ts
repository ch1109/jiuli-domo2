import { expect, test } from '@playwright/test';

test('客户业务概览四级交互定稿规范端到端测试', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  // 1. 验证客户卡片总数
  const cards = page.locator('.cw-customer');
  await expect(cards).toHaveCount(9);

  // 2. 验证上海浦壹（存在多候选）：
  // - 具有唯一高强调实心主按钮：[进入核对工作台]
  // - 具有固定核心入口：查看商品匹配明细 →
  // - 具有 ··· 菜单
  const puyiCard = cards.filter({ hasText: /上海浦壹|上海海量/ });
  await expect(puyiCard).toBeVisible();
  await expect(puyiCard.getByRole('button', { name: '进入核对工作台' })).toBeVisible();
  await expect(puyiCard.getByRole('button', { name: '查看商品匹配明细 →' })).toBeVisible();
  await expect(puyiCard.getByRole('button', { name: '更多操作' })).toBeVisible();

  // 3. 验证百闽海（存在多候选）：
  // - 具有唯一高强调实心主按钮：[进入核对工作台]
  // - 具有固定核心入口：查看商品匹配明细 →
  const bmhCard = cards.filter({ hasText: /百闽海/ });
  await expect(bmhCard).toBeVisible();
  await expect(bmhCard.getByRole('button', { name: '进入核对工作台' })).toBeVisible();
  await expect(bmhCard.getByRole('button', { name: '查看商品匹配明细 →' })).toBeVisible();

  // 4. 验证澳创实业（等待查货资料）：
  // - 规则五：无实心主操作！
  // - 具有固定核心入口：查看商品匹配明细 →
  const acsyCard = cards.filter({ hasText: /澳创实业/ });
  await expect(acsyCard).toBeVisible();
  await expect(acsyCard.locator('.cw-btn-primary-action')).not.toBeVisible();
  await expect(acsyCard.getByRole('button', { name: '查看商品匹配明细 →' })).toBeVisible();

  // 5. 验证英堡科技（AI核对完成，待人工复核）：
  // - 具有唯一高强调实心主按钮：[开始人工复核]
  // - 具有固定核心入口：查看商品匹配明细 →
  const yingbaoCard = cards.filter({ hasText: /英堡科技/ });
  await expect(yingbaoCard).toBeVisible();
  await expect(yingbaoCard.getByRole('button', { name: '开始人工复核' })).toBeVisible();
  await expect(yingbaoCard.getByRole('button', { name: '查看商品匹配明细 →' })).toBeVisible();

  // 6. 验证欧陆通（已完成）：
  // - 规则九：无实心主操作！
  // - 具有固定核心入口：查看商品匹配明细 →
  // - 具有弱导航链接：查看最终核对单 →
  const oultCard = cards.filter({ hasText: /欧陆通/ });
  await expect(oultCard).toBeVisible();
  await expect(oultCard.locator('.cw-btn-primary-action')).not.toBeVisible();
  await expect(oultCard.getByRole('button', { name: '查看商品匹配明细 →' })).toBeVisible();
  await expect(oultCard.getByRole('button', { name: '查看最终核对单 →' })).toBeVisible();

  // 7. 验证英卡科技（多任务）：
  // - 固定入口为：查看全部匹配明细 →
  // - 弱导航：查看全部 3 票 ›
  const yingkaCard = cards.filter({ hasText: /英卡科技/ });
  await expect(yingkaCard).toBeVisible();
  await expect(yingkaCard.getByRole('button', { name: '查看全部匹配明细 →' })).toBeVisible();
  await expect(yingkaCard.getByRole('button', { name: '查看全部 3 票 ›' })).toBeVisible();

  // 8. 交互测试：点击浦壹卡片的“查看商品匹配明细 →”，成功进入商品对应面板与规范副标题
  await puyiCard.getByRole('button', { name: '查看商品匹配明细 →' }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('上海浦壹');
  await expect(page.locator('.cw-tabs button.active')).toHaveText('商品对应');
  await expect(page.getByText('查看 AI 已建立的商品关系，处理无法自动确定的对应。')).toBeVisible();

  // 返回上一页
  await page.getByRole('button', { name: '返回上一页' }).first().click();

  // 9. 点击“补充查货资料”后打开材料入口，自动进入查货模式并预设当前客户
  const acsyMoreBtn = acsyCard.getByRole('button', { name: '更多操作' });
  await acsyMoreBtn.click();
  const dropdown = acsyCard.locator('.cw-more-dropdown');
  await expect(dropdown).toBeVisible();
  await expect(dropdown.getByRole('menuitem', { name: '查看原始材料' })).toBeVisible();
  await expect(dropdown.getByRole('menuitem', { name: '查看处理历史' })).toBeVisible();

  await dropdown.getByRole('menuitem', { name: '补充查货资料' }).click();
  const modal = page.locator('.intake-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('上传客户材料')).toBeVisible();
  await expect(modal.getByRole('tab', { name: '查货材料' })).toHaveAttribute('aria-selected', 'true');
  const customerSelect = modal.locator('select[aria-label="选择查货客户"]');
  await expect(customerSelect.locator('option:checked')).toHaveText(/澳创/);

  // 关闭弹窗
  await modal.getByRole('button', { name: '关闭上传客户材料窗口' }).click();
  await expect(modal).not.toBeVisible();

  // 10. 交互测试：点击英堡科技的“开始人工复核”，直接进入核对工作台
  await yingbaoCard.getByRole('button', { name: '开始人工复核' }).click();
  await expect(page.getByRole('heading', { name: '核对工作台', exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});
