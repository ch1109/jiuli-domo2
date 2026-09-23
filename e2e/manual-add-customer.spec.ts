import { expect, test } from "@playwright/test";

test("支持在新建核对任务弹窗中手动添加客户，且按钮大小自适应不折行", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建核对任务" }).click();

  const dialog = page.getByRole("dialog", { name: "新建核对任务 / 上传客户材料" });
  await expect(dialog).toBeVisible();

  // 验证按钮样式自适应且文字不拆行
  const cancelBtn = dialog.getByRole("button", { name: "取消" });
  const submitBtn = dialog.getByRole("button", { name: "上传并处理" });
  await expect(cancelBtn).toBeVisible();
  await expect(submitBtn).toBeVisible();

  const cancelBox = await cancelBtn.boundingBox();
  const submitBox = await submitBtn.boundingBox();
  expect(cancelBox!.width).toBeGreaterThanOrEqual(70);
  expect(cancelBox!.height).toBeGreaterThanOrEqual(36);
  expect(submitBox!.width).toBeGreaterThanOrEqual(100);
  expect(submitBox!.height).toBeGreaterThanOrEqual(36);

  // 切换到查货材料
  await dialog.getByRole("tab", { name: "查货材料" }).click();

  // 点击手动添加新客户
  await dialog.getByRole("button", { name: "手动添加新客户" }).click();

  // 输入新客户名称并确认
  const customerInput = dialog.getByLabel("输入新客户名称");
  await expect(customerInput).toBeVisible();
  await customerInput.fill("深圳市超前未来科技有限公司");
  await dialog.getByRole("button", { name: "确认添加" }).click();

  // 验证成功添加并自动选中该客户
  const customerSelect = dialog.getByLabel("选择查货客户");
  await expect(customerSelect).toBeVisible();
  await expect(customerSelect).toHaveValue(/^C-/);
  await expect(customerSelect.locator("option:checked")).toHaveText("深圳市超前未来科技有限公司");
});
test("支持通过下拉选项触发手动添加新客户，并在委托材料中生效", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建核对任务" }).click();

  const dialog = page.getByRole("dialog", { name: "新建核对任务 / 上传客户材料" });
  await expect(dialog).toBeVisible();

  // 在委托材料 Tab 下，通过选择下拉项中的“➕ 手动添加新客户...”
  const entrustSelect = dialog.getByLabel("选择委托客户（选填）");
  await entrustSelect.selectOption("__NEW__");

  // 此时应自动展开输入框
  const customerInput = dialog.getByLabel("输入新客户名称");
  await expect(customerInput).toBeVisible();
  await customerInput.fill("北京华信智联数字技术有限公司");
  await customerInput.press("Enter");

  // 验证成功添加并自动选中
  await expect(entrustSelect).toBeVisible();
  await expect(entrustSelect).toHaveValue(/^C-/);
  await expect(entrustSelect.locator("option:checked")).toHaveText("北京华信智联数字技术有限公司");
});
