import { expect, test } from "@playwright/test";

test("保存整票核对结果后重进仍保留修改和商品行标识", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "当前核对任务", exact: true }).click();

  const firstCard = page.locator(".line-queue-card").first();
  await expect(firstCard.locator(".badge-line-modified")).toHaveText("未修改");
  await expect(page.getByRole("button", { name: "整票通过复核", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "字段来源", exact: true }).click();
  await page.getByLabel("修订字段值").fill("人工修改型号-测试");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(firstCard.locator(".badge-line-modified")).toHaveText("已修改");
  await expect(page.locator(".draft-master-table tbody tr").first().locator(".row-modified-label")).toHaveText("已修改");

  await page.getByRole("button", { name: "保存结果", exact: true }).click();
  await expect(page.getByText(/核对结果已保存，可稍后继续修改/)).toBeVisible();
  await page.getByRole("button", { name: "客户工作台", exact: true }).click();
  await page.getByRole("button", { name: "当前核对任务", exact: true }).click();
  await expect(page.locator(".line-queue-card").first().locator(".badge-line-modified")).toHaveText("已修改");

  await page.reload();
  await page.getByRole("button", { name: "当前核对任务", exact: true }).click();
  await expect(page.locator(".line-queue-card").first().locator(".badge-line-modified")).toHaveText("已修改");
  await page.getByRole("button", { name: "字段来源", exact: true }).click();
  await expect(page.getByLabel("修订字段值")).toHaveValue("人工修改型号-测试");
});
