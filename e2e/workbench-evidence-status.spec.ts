import { expect, test } from "@playwright/test";

test("浦壹工作台把查货候选与真正缺查货分开显示", async ({ page }) => {
  await page.goto("/");
  await page.locator("#customer-tasks").getByRole("button", { name: "26SHPYD056" }).first().click();

  const metrics = page.locator(".compact-metrics");
  await expect(metrics.locator(".metric-tile").filter({ hasText: "有查货候选" })).toContainText("7");
  await expect(metrics.locator(".metric-tile").filter({ hasText: "等待查货" })).toContainText("1");
  await expect(metrics.locator(".metric-tile").filter({ hasText: "AI已核对" })).toContainText("1");
  await expect(page.locator(".draft-table-wrapper .td-status").filter({ hasText: "有查货候选" })).toHaveCount(7);
  await expect(page.locator(".draft-table-wrapper .td-status").filter({ hasText: "暂无查货依据" })).toHaveCount(1);
});

test("商品对应页选定候选后，核对工作台读取同一条真实关系", async ({ page }) => {
  await page.goto("/");
  const customer = page.locator(".cw-customer").filter({ hasText: "上海浦壹" });
  await customer.getByRole("button", { name: /查看.*商品/ }).click();
  const group = page.locator(".cw-task-group-card").filter({ hasText: "26SHPYD056" });
  await expect(group.getByTitle("人工选择查货依据")).toHaveCount(7);
  await group.getByTitle("人工选择查货依据").first().click();
  await expect(page.getByRole("dialog", { name: "选择对应查货商品" }).locator(".cw-candidate-card")).toHaveCount(7);
  await page.getByRole("button", { name: "确认以此候选建立对应关系 ✓" }).click();
  await expect(group.getByTitle("人工选择查货依据")).toHaveCount(6);
  await group.getByRole("button", { name: "26SHPYD056" }).click();
  await expect(page.locator("#draft-row-D-df72916dc019-R008 .td-status")).not.toContainText("有查货候选");
  const related = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("jiuli-demo-workspace-v1")!);
    return saved.state.relations.some((relation: { active: boolean; entrustmentLineId: string }) => relation.active && relation.entrustmentLineId === "D-df72916dc019-R008");
  });
  expect(related).toBe(true);
});

test("旧本地快照只补齐未编辑的浦壹核对结果，并保留其他任务编辑", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "jiuli-demo-workspace-v1";
    const saved = JSON.parse(localStorage.getItem(key)!);
    const task = saved.state.drafts.find((draft: { id: string }) => draft.id === "D-df72916dc019");
    task.version = 0;
    task.lines.forEach((line: { relationSourceId: string | null; relationSourceIds: string[]; matchRelationIds: string[] }) => {
      line.relationSourceId = null;
      line.relationSourceIds = [];
      line.matchRelationIds = [];
    });
    saved.state.relations = saved.state.relations.filter((relation: { draftId: string }) => relation.draftId !== task.id);
    saved.state.operations = saved.state.operations.filter((operation: { draftId: string }) => operation.draftId !== task.id);
    saved.state.drafts.find((draft: { id: string }) => draft.id === "D-3c3cc10bd26b").lastUpdateReason = "保留人工进度";
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.locator("#customer-tasks").getByRole("button", { name: "26SHPYD056" }).first().click();
  await expect(page.locator(".compact-metrics .metric-tile").filter({ hasText: "AI已核对" })).toContainText("1");
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem("jiuli-demo-workspace-v1")!).state.drafts.find((draft: { id: string }) => draft.id === "D-3c3cc10bd26b").lastUpdateReason);
  expect(retained).toBe("保留人工进度");
});
