import { expect, test } from "@playwright/test";

test("一体化任务旅程从任务首页进入并连续打开工作台", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "九立智能核对工作台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建核对" })).toBeVisible();

  await page.getByRole("button", { name: "新建核对" }).click();
  const intake = page.getByRole("dialog", { name: "上传客户材料" });
  await expect(intake).toBeVisible();
  await expect(intake.getByRole("tab", { name: "委托材料" })).toHaveAttribute("aria-selected", "true");
  await expect(intake.getByLabel("选择委托客户（选填）")).toBeVisible();
  await expect(intake.getByText("主体委托书")).toBeVisible();
  await expect(intake.getByText("辅助材料")).toHaveCount(0);
  await intake.getByRole("tab", { name: "查货材料" }).click();
  await expect(intake.getByLabel("选择查货客户")).toBeVisible();
  await expect(intake.getByText("查货资料必须先指定客户")).toBeVisible();
  await expect(intake.getByText("解析确认")).toHaveCount(0);
  await expect(intake.getByText("材料队列")).toHaveCount(0);
  await intake.getByRole("button", { name: "关闭上传客户材料窗口" }).click();

  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "当前核对任务" }).click();
  await expect(page.getByRole("heading", { name: "英堡科技（深圳）有限公司" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI处理记录" })).toBeVisible();

  await page.getByRole("button", { name: "客户工作台", exact: true }).click();
  const customer = page.locator(".cw-customer").filter({ hasText: "英堡科技（深圳）有限公司" });
  await customer.getByRole("button", { name: "进入客户工作台" }).click();
  await page.getByRole("tab", { name: /查货商品池/ }).click();
  await expect(page.locator(".cw-product").first()).toBeVisible();
  await page.locator(".cw-product summary").first().click();
  await expect(page.locator(".cw-sources").first()).toBeVisible();
  await page.getByRole("tab", { name: /材料记录/ }).click();
  await expect(page.getByRole("columnheader", { name: "原始材料" })).toBeVisible();
  await page.getByRole("tab", { name: /委托核对任务/ }).click();
  await expect(page.getByRole("columnheader", { name: "业务状态" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "实时状态" })).toBeVisible();
  await page.locator(".cw-task-link").first().click();
  await expect(page.locator("h1")).toHaveText("核对工作台");
  await expect(page.getByRole('heading',{name:/问题中心/})).toBeVisible();
  await expect(page.locator('.recon-summary')).toContainText('已匹配');
});
