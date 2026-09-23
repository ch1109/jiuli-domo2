import { expect, test } from "@playwright/test";

test("上传客户材料入口只保留当前批次所需操作", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建核对" }).click();

  const dialog = page.getByRole("dialog", { name: "上传客户材料" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Demo 材料接入入口，用于模拟委托材料接口与查货材料接口")).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "委托材料" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("主体委托书")).toBeVisible();
  await expect(dialog.getByText("辅助材料")).toBeVisible();
  await expect(dialog.getByText("解析确认")).toHaveCount(0);
  await expect(dialog.getByText("材料队列")).toHaveCount(0);
  await expect(dialog.getByText("进入人工复核")).toHaveCount(0);

  await dialog.getByRole("tab", { name: "查货材料" }).click();
  await expect(dialog.getByLabel("选择查货客户")).toBeVisible();
  await expect(dialog.getByText("查货资料必须先指定客户")).toBeVisible();
  await dialog.getByRole("button", { name: "上传并处理" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("查货资料必须先指定所属客户");
});
