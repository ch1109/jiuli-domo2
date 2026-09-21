import { expect, test } from "@playwright/test";

test("一体化任务旅程从任务首页进入并连续打开工作台", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "九立智能核对工作台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建核对" })).toBeVisible();

  await page.getByRole("button", { name: "新建核对" }).click();
  await expect(page.getByText("第 1 步")).toBeVisible();
  await expect(page.getByText("按材料用途上传")).toBeVisible();
  await expect(page.getByLabel("上传查货材料")).toBeAttached();
  await expect(page.getByLabel("上传委托材料")).toBeAttached();
  await expect(page.getByText("解析确认")).toBeVisible();

  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "当前核对任务" }).click();
  await expect(page.getByRole("heading", { name: "英堡科技（深圳）有限公司" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始核对（执行首次匹配）" })).toBeVisible();

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
