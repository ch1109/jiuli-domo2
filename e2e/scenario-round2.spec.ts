import { expect, test, type Page } from '@playwright/test';
async function load(page: Page, id: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo 控制台' }).click();
  await page.locator('.scenario-card').filter({ hasText: id }).click();
}
async function state(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('jiuli-demo-workspace-v1')!).state); }
async function ingest(page: Page, file: string, customer: string) {
  await page.getByRole('button', { name: '材料接入', exact: true }).click();
  await page.getByLabel('选择查货客户').selectOption(customer);
  await page.getByRole('row').filter({ hasText: file }).getByRole('button', { name: /接入商品池/ }).click();
}
test('SC-03 虚拟组合 PDF 保留三个入仓号与各行唯一归属', async ({ page }) => {
  await load(page, 'SC-03');
  await ingest(page, 'VF-MULTI-WAREHOUSE', 'C-66be07d6cabe');
  const rows = (await state(page)).sources.filter((s: { sourceFileId: string; availability: string }) => s.sourceFileId === 'VF-MULTI-WAREHOUSE' && s.availability === '可匹配');
  expect(rows.length).toBeGreaterThan(0);
  expect([...new Set(rows.map((s: { warehouseNo: string }) => s.warehouseNo))].sort()).toEqual(['26010048', '26010713', '26010801']);
  expect(new Set(rows.map((s: { logicalInspectionOrderId: string }) => s.logicalInspectionOrderId)).size).toBe(3);
  expect(new Set(rows.map((s: { id: string }) => s.id)).size).toBe(rows.length);
  await page.reload();
  expect((await state(page)).sources.filter((s: { sourceFileId: string; availability: string }) => s.sourceFileId === 'VF-MULTI-WAREHOUSE' && s.availability === '可匹配')).toEqual(rows);
});
for (const id of ['SC-04', 'SC-20']) test(`${id} 接入十二条原始行，合并展示与去重`, async ({ page }) => {
  await load(page, id);
  const baseline = await state(page);
  const customer = baseline.sources.find((s: { sourceFileId: string }) => s.sourceFileId === 'F-a5368260946b').customerId;
  await ingest(page, 'F-a5368260946b', customer);
  await page.getByRole('button', { name: '客户商品池', exact: true }).click();
  await expect(page.getByText('177000', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /展开 .* 来源/ })).toHaveCount(1);
  await page.getByRole('button', { name: /展开 .* 来源/ }).click();
  await expect(page.locator('.source-detail-list > div')).toHaveCount(12);
  const loaded = (await state(page)).sources.filter((s: { availability: string }) => s.availability !== '未加载');
  expect(loaded).toHaveLength(12);
  if (id === 'SC-20') {
    await page.getByRole('button', { name: '材料接入', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'F-a5368260946b' })).toContainText('已接入');
    await expect(page.getByRole('row').filter({ hasText: 'F-baf3de39ef68' })).toContainText('重复材料');
    await page.reload();
    expect((await state(page)).sources.filter((s: { availability: string }) => s.availability !== '未加载')).toEqual(loaded);
  }
});

test('SC-11 两个非型号字段可修订，稳定行不重建并保留历史', async ({ page }) => {
  await load(page, 'SC-11');
  await page.getByRole('button', { name: '委托草稿', exact: true }).click();
  await page.locator('.draft-card').click();
  await page.getByLabel('补充委托客户').selectOption('C-66be07d6cabe');
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  const before = await state(page);
  for (const [id, field, value] of [['D-b436a16434a4-R003', '产地', '中国'], ['D-b436a16434a4-R004', '商品描述', 'UNKNOWN（演示修订）']]) {
    const row = page.getByRole('row').filter({ hasText: id });
    await row.getByText('查看 25 字段详情').click();
    await page.getByLabel(`字段详情 ${id} ${field}`).fill(value);
    await page.getByLabel(`修订 ${id} ${field}`, { exact: true }).click();
  }
  const after = await state(page);
  expect(after.drafts).toHaveLength(before.drafts.length);
  expect(after.drafts[0].version).toBeGreaterThan(before.drafts[0].version);
  const changed = ['D-b436a16434a4-R003', 'D-b436a16434a4-R004'];
  for (const line of before.drafts[0].lines) if (!changed.includes(line.id)) {
    expect(after.drafts[0].lines.find((l: { id: string }) => l.id === line.id)).toEqual(line);
  }
  expect(after.drafts[0].lines.find((l: { id: string }) => l.id === changed[0]).fields.产地).toBe('中国');
  expect(after.drafts[0].lines.find((l: { id: string }) => l.id === changed[1]).fields.商品描述).toBe('UNKNOWN（演示修订）');
  expect(after.versions.slice(before.versions.length).flatMap((v: { changedLineIds: string[] }) => v.changedLineIds)).toEqual(changed);
  for (const old of before.relations.filter((r: { entrustmentLineId: string }) => changed.includes(r.entrustmentLineId))) {
    expect(after.relations.some((r: { id: string; active: boolean }) => r.id === old.id && !r.active)).toBe(true);
  }
  await page.reload();
  expect((await state(page)).drafts).toEqual(after.drafts);
});

test('已有依据时禁止直接改型号；解绑后允许编辑，旧模型结论不能复用', async ({ page }) => {
  await load(page, 'SC-08');
  await page.getByRole('button', { name: '委托草稿', exact: true }).click();
  await page.locator('.draft-card').click();
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  const before = await state(page); const id = before.drafts[0].lines[0].id;
  const row = page.getByRole('row').filter({ hasText: id });
  await row.getByText('查看 25 字段详情').click();
  await page.getByLabel(`字段详情 ${id} 型号`).fill('DIFFERENT-MODEL');
  await page.getByLabel(`字段详情 ${id} 型号`).locator('..').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('修改型号或品牌前请先解绑查货依据，修改后重新选择或匹配')).toBeVisible();
  expect((await state(page)).drafts).toEqual(before.drafts);
  await row.getByRole('button', { name: '解绑', exact: true }).click();
  await row.getByText('查看 25 字段详情').click();
  await page.getByLabel(`字段详情 ${id} 型号`).fill('DIFFERENT-MODEL');
  await page.getByLabel(`字段详情 ${id} 型号`).locator('..').getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  const after = await state(page);
  expect(after.drafts[0].lines[0].fields.型号).toBe('DIFFERENT-MODEL');
  expect(after.drafts[0].lines[0].matchRelationIds).toHaveLength(0);
  expect(after.toast).toContain('不能复用旧模型结论');
});

test('SC-17 两张查货支持五行委托，人工组合复核后仍拒绝缺必填值封版', async ({ page }) => {
  await load(page, 'SC-17');
  await page.getByRole('button', { name: '委托草稿', exact: true }).click();
  await page.locator('.draft-card').click();
  await page.getByLabel('补充委托客户').selectOption('C-66be07d6cabe');
  await page.getByRole('button', { name: '执行首次匹配' }).click();
  const first = 'D-b436a16434a4-R002';
  await page.getByLabel(`组合 ${first} 查货依据`).selectOption(['I-e928e7608540-26010211-L001', 'I-e928e7608540-26010211-L002']);
  await page.getByRole('row').filter({ hasText: first }).getByRole('button', { name: '建立组合关系' }).click();
  for (const [line, source] of [['R004', 'L001'], ['R005', 'L002']]) {
    await page.getByLabel(`选择 D-b436a16434a4-${line} 查货依据`).selectOption(`I-ad06ec2cd295-26010801-${source}`);
  }
  const linked = await state(page);
  expect(linked.drafts[0].lines).toHaveLength(5);
  expect(linked.relations.filter((r: { active: boolean }) => r.active)).toHaveLength(5);
  expect(new Set(linked.relations.map((r: { logicalInspectionOrderId: string }) => r.logicalInspectionOrderId)).size).toBe(2);
  const composite = linked.drafts[0].lines[0];
  expect(composite.fields.数量).toBe('35000');
  expect(composite.fields.净重).toBe('25.59');
  expect(composite.issueIds).toContain('字段冲突:毛重');
  await page.getByRole('button', { name: '提交人工确认' }).click();
  await page.getByRole('button', { name: '确认完成', exact: true }).click();
  expect((await state(page)).finalReconciliations).toHaveLength(0);
  while (await page.getByRole('button', { name: /^保留委托值：/ }).count()) {
    await page.getByRole('button', { name: /^保留委托值：/ }).first().click();
  }
  while (await page.getByRole('button', { name: /确认本行/ }).count()) {
    await page.getByRole('button', { name: /确认本行/ }).first().click();
  }
  await page.getByRole('button', { name: '确认完成', exact: true }).click();
  const after = await state(page);
  expect(after.toast).toContain('最终核对单字段不完整');
  expect(after.finalReconciliations).toHaveLength(0);
  expect(after.sources.filter((s: { availability: string }) => s.availability === '已核销')).toHaveLength(0);
  expect(after.drafts[0].lines.every((l: { fields: { 币种: string; 总价: string } }) => l.fields.币种 === 'UNKNOWN' && l.fields.总价 === 'UNKNOWN')).toBe(true);
  await page.reload();
  expect((await state(page)).relations).toEqual(after.relations);
});
