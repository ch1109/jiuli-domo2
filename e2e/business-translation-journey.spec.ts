import { expect, test } from "@playwright/test";

test("业务语义翻译层与人本工作台完整旅程验证", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  // 1. 首页业务进度面板：人话导语与核心指标
  await expect(page.getByRole("heading", { name: "今日业务概况" })).toBeVisible();
  await expect(page.getByText(/当前有 \d+ 票委托正在处理。/)).toBeVisible();
  await expect(page.getByText(/正在等待查货对应/)).toBeVisible();
  await expect(page.getByRole("button", { name: /处理中委托/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /等待商品对应/ })).toBeVisible();

  // 2. 客户故事卡业务叙事（以上海海量 / 浦壹真实样本为例）
  const puyiCard = page.locator(".cw-customer").filter({ hasText: /上海浦壹|上海海量/ });
  await expect(puyiCard).toBeVisible();

  // 检查故事卡各个层级信息
  await expect(puyiCard.getByText("本次材料")).toBeVisible();
  await expect(puyiCard.getByText(/委托书 1份 · 箱单 [01]份 · 查货单 1份/)).toBeVisible();

  await expect(puyiCard.getByText("AI 已完成整理")).toBeVisible();
  await expect(puyiCard.getByText(/委托书识别出 9 个待核对商品/)).toBeVisible();
  await expect(puyiCard.getByText(/查货单识别出 9 条查货明细，整理为 3 个可匹配商品/)).toBeVisible();

  await expect(puyiCard.getByText("当前进度")).toBeVisible();
  await expect(puyiCard.getByText(/[08] \/ 9 个商品找到查货依据/)).toBeVisible();

  await expect(puyiCard.getByText("下一步")).toBeVisible();
  await expect(puyiCard.getByText(/需要人工确认 7 个商品的多候选对应|AI 正在寻找商品对应关系/)).toBeVisible();

  // 渐进式第三层：技术详情折叠
  await expect(puyiCard.getByText("技术详情（供对账核验）")).toBeVisible();
  await puyiCard.locator("summary").filter({ hasText: "技术详情" }).click();
  await expect(puyiCard.getByText(/待核对商品 9/)).toBeVisible();

  // 3. 待办任务中心表格新业务表头与展开
  const tasksSection = page.locator("#customer-tasks");
  await expect(tasksSection.getByRole("columnheader", { name: "委托任务" })).toBeVisible();
  await expect(tasksSection.getByRole("columnheader", { name: "当前进度" })).toBeVisible();
  await expect(tasksSection.getByRole("columnheader", { name: "AI处理结果" })).toBeVisible();
  await expect(tasksSection.getByRole("columnheader", { name: "需要关注" })).toBeVisible();
  await expect(tasksSection.getByRole("columnheader", { name: "当前状态" })).toBeVisible();
  await expect(tasksSection.getByRole("columnheader", { name: "下一步" })).toBeVisible();

  // 检查首行展开渐进式专业详情
  const expandBtn = tasksSection.locator(".icon-button[title='展开专业详情']").first();
  await expandBtn.click();
  await expect(page.getByText("专业追溯数据（渐进式披露）")).toBeVisible();
  await expect(page.getByText("商品自动对应 (P3)")).toBeVisible();

  // 4. 进入任务作业台，验证五阶段流转进度条
  const viewTaskBtn = tasksSection.getByRole("button", { name: "26SHPYD056" }).first();
  await viewTaskBtn.click();

  // 验证已进入核对作业台
  await expect(page.getByRole("heading", { name: "核对工作台" })).toBeVisible();
  await expect(page.locator(".recon-workflow-container")).toBeVisible();
  await expect(page.getByText("AI 报关智能核对流程（五阶段实时流转）")).toBeVisible();

  // 检查 5 个阶段
  await expect(page.getByText("1. 整理委托材料")).toBeVisible();
  await expect(page.getByText("识别 9 个待核对商品")).toBeVisible();

  await expect(page.getByText("2. 整理查货材料")).toBeVisible();
  await expect(page.getByText(/9 条查货明细 → 3 个可匹配商品/)).toBeVisible();

  await expect(page.getByText("3. 自动寻找商品对应")).toBeVisible();
  await expect(page.getByText("0/9 已对应")).toBeVisible();

  await expect(page.getByText("4. 自动核对字段")).toBeVisible();
  await expect(page.getByText("5. 人工最终确认")).toBeVisible();

  // 检查 summary 词汇
  await expect(page.locator(".recon-summary")).toContainText("待核对商品");
  await expect(page.locator(".recon-summary")).toContainText("已找到对应（已匹配）");
  await expect(page.locator(".recon-summary")).toContainText("字段冲突");

  expect(errors).toEqual([]);
});
