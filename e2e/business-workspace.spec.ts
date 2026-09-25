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
  const prevScenario = await page.evaluate(() => {
    const key = 'jiuli-demo-workspace-v1';
    return JSON.parse(localStorage.getItem(key)!).state.previousScenarioWorkspace;
  });
  expect(prevScenario.scenarioId).toBe('SC-08');
  expect(prevScenario.drafts[0].lastUpdateReason).toBe('迁移前人工记录');
  await expect(page.getByText(/已整理 72 份材料/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('各页面返回上一页导航功能正常', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // 1. 进入客户详情页
  const yingkaCard = page.locator('.cw-customer', { hasText: '英卡科技' });
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');

  // 2. 点击返回上一页
  await page.getByRole('button', { name: '返回上一页' }).first().click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 3. 再次进入英卡科技详情页，通过详情页顶部的“返回客户工作台首页（全部客户）”快捷按钮返回
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');
  await page.getByRole('button', { name: '返回客户工作台首页（全部客户）' }).click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 4. 再次进入英卡科技详情页，通过侧边栏“客户工作台”导航项返回首页
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');
  await page.getByRole('button', { name: '客户工作台' }).first().click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 5. 再次进入英卡科技详情页，通过左侧 Brand Logo 返回首页
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');
  await page.getByLabel('九立智能核对工作台 - 返回首页').click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 6. 再次进入英卡科技详情页，通过顶部面包屑“客户工作台”链接返回首页
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');
  await page.locator('.breadcrumb-nav-link').click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 7. 从核对工作台切换到客户详情页后，点击顶栏返回上一页，能优先退回客户工作台首页而非死循环跳回核对工作台
  await page.getByRole('button', { name: '当前核对任务' }).click();
  await expect(page.getByRole('heading', { name: '核对工作台' })).toBeVisible();
  // 切换到客户工作台，再进入傲冠软件
  await page.getByRole('button', { name: '客户工作台' }).click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();
  const aoguanCard = page.locator('.cw-customer', { hasText: '傲冠软件' });
  await aoguanCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('傲冠软件');
  // 点击顶栏返回按钮
  await page.getByRole('button', { name: '返回上一页' }).first().click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  // 8. 访问客户商品池并返回
  await page.getByRole('button', { name: '商品池' }).click();
  await expect(page.getByRole('heading', { name: '客户商品池' })).toBeVisible();
  await page.getByRole('button', { name: '返回上一页' }).first().click();
  await expect(page.getByText('完整客户业务 · 已整理事实')).toBeVisible();

  expect(errors).toEqual([]);
});

test('英卡科技客户工作台：用真实委托行和已加载查货池展示商品候选', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // 1. 从首页进入英卡科技工作台
  const yingkaCard = page.locator('.cw-customer', { hasText: '英卡科技' });
  await expect(yingkaCard).toBeVisible();
  await yingkaCard.getByRole('button', { name: /查看全部匹配明细 →|查看商品匹配明细 →|查看全部商品对应 →|查看商品对应 →/ }).click();

  // 2. 验证客户抬头及 5 状态核心 KPI 横幅
  await expect(page.locator('.cw-customer-overview-card').getByRole('heading', { level: 2 })).toContainText('英卡科技');
  await expect(page.locator('.cw-customer-overview-card .cw-customer-code-tag')).toHaveText('KH-YKKJ');
  await expect(page.locator('.cw-five-kpi-badge')).toHaveText([
    '已自动对应', '已自动对应 · 有提醒', '需要人工选择', '暂无查货依据', '存在明确冲突',
  ]);

  // 3. 验证 Tab 0「商品对应」按委托任务分组
  await expect(page.getByText('全部商品对应清单 (9/9) · 按委托任务分组')).toBeVisible();
  await expect(page.getByRole('button', { name: 'YK-260625131-1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'YK-260625131-2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'YK-260625131-3' })).toBeVisible();

  // 4. 旧样本声称的 CH002 尚未入池，不能显示为已自动对应。
  await expect(page.getByText('CH001 + CH002')).not.toBeVisible();
  await expect(page.locator('.cw-five-kpi-item.orange .cw-five-kpi-num')).toHaveText('3');
  await expect(page.locator('.cw-five-kpi-item.gray .cw-five-kpi-num')).toHaveText('6');

  // 5. 点击查看依据，候选来源须来自当前实际查货池。
  const umwRow = page.locator('tr', { hasText: 'UMW2631' }).first();
  await umwRow.getByRole('button', { name: '查看依据', exact: true }).click();
  await expect(page.locator('.cw-commodity-drawer')).toBeVisible();
  await expect(page.locator('.cw-commodity-drawer')).toContainText('UMW2631');

  // 关闭抽屉
  await page.getByRole('button', { name: '关闭详情抽屉' }).click();
  await expect(page.locator('.cw-commodity-drawer')).not.toBeVisible();

  // 6. 验证 Tab「批次关系」当前处于隐藏状态
  await expect(page.getByRole('tab', { name: '批次关系' })).not.toBeVisible();

  /* 批次关系暂时隐藏，后续调整后恢复：
  await page.getByRole('tab', { name: '批次关系' }).click();

  // 验证自然语言关系清单横幅
  await expect(page.getByText('异步材料池与批次关联关系清单')).toBeVisible();
  await expect(page.getByText('当前客户有 3 票委托、共 9 个待核对商品')).toBeVisible();

  // 验证 3 大关键问题卡片
  await expect(page.getByRole('heading', { name: 'CH001 被谁用了？' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YK-1 用了哪些批次？' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '新批次 CH003 来了以后影响谁？' })).toBeVisible();

  // 验证高级关系图（矩阵）单元格具体型号
  await expect(page.getByText('「委托任务 × 查货批次」高级关系矩阵')).toBeVisible();
  await expect(page.getByText('同一商品可能同时出现在多个查货批次列中')).toBeVisible();
  await expect(page.getByRole('button', { name: /UMW2631.*箱1~箱4/ })).toBeVisible();
  */

  expect(errors).toEqual([]);
});
