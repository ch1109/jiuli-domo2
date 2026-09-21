import { expect, test } from "@playwright/test";
import scenarios from "../demo-generated/mock/scenarios.json";
import { FINAL_OUTPUT_FIELDS } from "../lib/domain/types";
import {confirmAll,openRelations,selectField,resolveConflicts} from './workbench-helpers';

test("本地文件解析失败可重试并在刷新后保留，不伪造商品池数据", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("上传本地材料").setInputFiles({
    name: "现场查货.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("demo-pdf-placeholder"),
  });

  await expect(page.getByText("文件已接收，等待解析")).toBeVisible();
  const uploadedRow = page.locator("tr").filter({ hasText: "现场查货.pdf" });
  await expect(uploadedRow).toContainText("待解析");
  await uploadedRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(uploadedRow).toContainText("解析失败");
  await expect(uploadedRow.locator(".issue")).toHaveText(/.+/);
  await page.reload();
  const restoredRow = page.locator("tr").filter({ hasText: "现场查货.pdf" });
  await expect(restoredRow).toContainText("解析失败");
  await expect(
    restoredRow.getByRole("button", { name: /重试解析/ }),
  ).toBeVisible();
  await expect(
    uploadedRow.getByRole("button", { name: /接入商品池/ }),
  ).toHaveCount(0);
});

test("真实 XLSX 通过本地适配器生成带来源位置的解析结果", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择材料类型").selectOption("委托书");
  await page
    .getByLabel("选择查货客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await page
    .getByLabel("上传本地材料")
    .setInputFiles(
      "真实整单样本/2026(DG)ZW003/委托文件/智微智能导单文件-1767930508809.xlsx",
    );

  const uploadedRow = page
    .locator("tr")
    .filter({ hasText: "智微智能导单文件-1767930508809.xlsx" })
    .first();
  await uploadedRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(uploadedRow).toContainText("解析成功");
  await expect(
    uploadedRow.getByRole("button", { name: /接入商品池/ }),
  ).toHaveCount(0);

  const parseResult = await page.evaluate(() => {
    const saved = JSON.parse(
      window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}",
    );
    return {
      result: saved.state?.parseResults?.[0],
      facts: saved.state?.parsedFacts,
    };
  });
  expect(parseResult.result).toMatchObject({
    materialType: "委托书",
    customerResolution: "已识别",
    factCount: 6,
  });
  expect(parseResult.result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(parseResult.result.sourceLocations[0]).toMatch(/!R\d+/);
  expect(parseResult.facts).toHaveLength(6);
  expect(parseResult.facts[0].sourceLocation).toMatchObject({
    sheet: expect.any(String),
    row: expect.any(Number),
  });
});

test("真实材料解析后可人工补充客户，补充前不进入商品池", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择材料类型").selectOption("委托书");
  await page
    .getByLabel("上传本地材料")
    .setInputFiles(
      "真实整单样本/2026(DG)ZW003/委托文件/智微智能导单文件-1767930508809.xlsx",
    );

  const uploadedRow = page
    .locator("tr")
    .filter({ hasText: "智微智能导单文件-1767930508809.xlsx" })
    .first();
  await uploadedRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(uploadedRow).toContainText("解析成功");
  await uploadedRow
    .getByRole("combobox", { name: /补充 .* 客户/ })
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await expect(
    page.getByText("已补充材料客户：东莞市智微智能科技有限公司"),
  ).toBeVisible();
  await expect(uploadedRow).toContainText("客户已确认，等待事实转换");
  await expect(
    uploadedRow.getByRole("button", { name: /接入商品池/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .locator("tr")
      .filter({ hasText: "智微智能导单文件-1767930508809.xlsx" })
      .first(),
  ).toContainText("客户已确认，等待事实转换");
  const result = await page.evaluate(
    () =>
      JSON.parse(window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}")
        .state?.parseResults?.[0],
  );
  expect(result).toMatchObject({
    customerResolution: "已识别",
    customerId: expect.any(String),
  });
});

test("真实文本 PDF 通过本地适配器保留页码来源", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择材料类型").selectOption("委托书");
  await page
    .getByLabel("上传本地材料")
    .setInputFiles(
      "真实整单样本/2026ACSY003/委托文件/报关委托书3.23_已签章(1).pdf",
    );

  const uploadedRow = page
    .locator("tr")
    .filter({ hasText: "报关委托书3.23_已签章(1).pdf" })
    .first();
  await uploadedRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(uploadedRow).toContainText("解析成功");
  const parseResult = await page.evaluate(
    () =>
      JSON.parse(window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}")
        .state?.parseResults?.[0],
  );
  expect(parseResult).toMatchObject({
    materialType: "委托书",
    customerResolution: "已识别",
    factCount: 1,
  });
  expect(parseResult.sourceLocations).toContain("第 1 页");
});

test("真实扫描 PDF 返回 OCR_REQUIRED 并进入人工复核", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择材料类型").selectOption("查货");
  await page
    .getByLabel("选择查货客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await page
    .getByLabel("上传本地材料")
    .setInputFiles("真实整单样本/2026(DG)ZW003/查货文件/1767866131153.pdf");

  const uploadedRow = page
    .locator("tr")
    .filter({ hasText: "1767866131153.pdf" })
    .first();
  await uploadedRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(uploadedRow).toContainText("待人工复核");
  await expect(uploadedRow).toContainText(
    "扫描 PDF 无可提取文本，需要人工复核或后续 OCR",
  );
  await expect(
    uploadedRow.getByRole("button", { name: /接入商品池/ }),
  ).toHaveCount(0);
});

test("真实 Excel 建稿与真实扫描查货人工复核可进入同一客户业务链路", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("选择材料类型").selectOption("委托书");
  await page
    .getByLabel("选择查货客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await page
    .getByLabel("上传本地材料")
    .setInputFiles(
      "真实整单样本/2026(DG)ZW003/委托文件/智微智能导单文件-1767930508809.xlsx",
    );

  const entrustmentRow = page
    .locator("tr")
    .filter({ hasText: "智微智能导单文件-1767930508809.xlsx" })
    .first();
  await entrustmentRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(entrustmentRow).toContainText("解析成功");
  await entrustmentRow.getByRole("button", { name: /生成委托草稿/ }).click();
  await expect(page.getByText(/已生成 W\d+ 草稿/)).toBeVisible();

  const draftModel = await page.evaluate(() => {
    const saved = JSON.parse(
      window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}",
    );
    const draft = saved.state?.drafts?.find((item: { id?: string }) =>
      item.id?.startsWith("DRAFT-"),
    );
    return draft?.lines?.[0]?.model as string | undefined;
  });
  expect(draftModel).toBeTruthy();

  await page.getByRole("button", { name: "材料接入" }).click();
  await page.getByLabel("选择材料类型").selectOption("查货");
  await page
    .getByLabel("选择查货客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await expect(page.getByLabel("选择材料类型")).toHaveValue("查货");
  await page
    .getByLabel("上传本地材料")
    .setInputFiles("真实整单样本/2026(DG)ZW003/查货文件/1767866131153.pdf");

  const inspectionRow = page
    .locator("tr")
    .filter({ hasText: "1767866131153.pdf" })
    .first();
  await expect(inspectionRow).toContainText("查货");
  await inspectionRow.getByRole("button", { name: /开始解析/ }).click();
  await expect(inspectionRow).toContainText("待人工复核");
  await inspectionRow.getByRole("button", { name: "查看复核信息" }).click();
  await inspectionRow.getByLabel("人工录入入仓号").fill("25120336");
  await inspectionRow.getByLabel("人工录入品牌").fill("演示品牌");
  await inspectionRow.getByLabel("人工录入型号").fill(draftModel!);
  await inspectionRow.getByLabel("人工录入数量").fill("1");
  await inspectionRow.getByLabel("人工录入产地").fill("中国");
  await inspectionRow.getByRole("button", { name: "保存人工事实" }).click();
  await expect(inspectionRow).toContainText("解析成功");

  await page.getByRole("button", { name: "当前核对任务" }).click();
  await expect(
    page.getByRole("heading", { name: "东莞市智微智能科技有限公司" }),
  ).toBeVisible();
  await expect(page.getByLabel('选择商品',{exact:true})).toContainText(draftModel!);
  await expect(
    page.getByRole('button',{name:'字段核对',exact:true}),
  ).toBeVisible();

  const linkedSource = await page.evaluate((model) => {
    const saved = JSON.parse(
      window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}",
    );
    const file = saved.state?.files?.find(
      (item: { name?: string }) => item.name === "1767866131153.pdf",
    );
    return saved.state?.sources?.find(
      (item: { sourceFileId?: string; model?: string }) =>
        item.sourceFileId === file?.id && item.model === model,
    );
  }, draftModel);
  expect(linkedSource).toMatchObject({
    availability: "草稿占用",
    warehouseNo: "25120336",
    customerId: expect.any(String),
    occupiedDraftId: expect.any(String),
  });
});

test("核心工作台可以接入基线材料、打开草稿并记录操作", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "材料接入" }).click();
  await expect(
    page.locator("h1").filter({ hasText: "材料接入" }),
  ).toBeVisible();
  await page
    .getByLabel("选择查货客户")
    .selectOption({ label: "英堡科技（深圳）有限公司" });
  const inspectionRow = page
    .locator("tr")
    .filter({ hasText: "1765426942103.pdf" });
  if (await inspectionRow.getByRole("button", { name: /接入商品池/ }).count()) {
    await inspectionRow.getByRole("button", { name: /接入商品池/ }).click();
    await expect(page.getByText(/查货材料已接入/)).toBeVisible();
  } else {
    await expect(inspectionRow).toContainText("可匹配");
  }
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await expect(
    page.locator("h1").filter({ hasText: "委托草稿" }),
  ).toBeVisible();
  await page.locator(".draft-card").first().click();
  await expect(
    page.getByRole("heading", { name: "英堡科技（深圳）有限公司" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();
  await expect(page.getByText(/已完成首次匹配|检查完成/)).toBeVisible();
  await page.getByRole("button", { name: "版本与操作" }).click();
  await expect(
    page.locator("h1").filter({ hasText: "版本与操作" }),
  ).toBeVisible();
});

test("客户识别失败的委托可人工补充客户，补充前匹配被阻断", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-07" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();

  await expect(page.getByLabel('补充委托客户')).toBeVisible();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();
  await expect(
    page.getByText("客户未确定或草稿已完成，不能匹配"),
  ).toBeVisible();
  await page
    .getByLabel("补充委托客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await expect(
    page.getByText("已补充客户：东莞市智微智能科技有限公司"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "东莞市智微智能科技有限公司" }),
  ).toBeVisible();
});

test("工作台可以人工编辑字段并解绑，商品池同步释放", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();

  await page.getByRole('button',{name:'产地',exact:true}).click();
  const originInput = page.getByLabel('手动修改 产地');
  await originInput.fill("人工确认产地");
  await page.getByRole("button", { name: "保存修改",exact:true }).click();
  await expect(page.getByText("已保存 产地")).toBeVisible();
  await openRelations(page);
  await page.getByRole("button", { name: "解绑查货依据" }).click();
  await expect(page.getByText("已解除匹配并释放查货商品")).toBeVisible();
});

test("SC-10 字段冲突要求人工处理并保留来源操作记录", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-10" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page
    .getByLabel("补充委托客户")
    .selectOption({ label: "东莞市智微智能科技有限公司" });
  await expect(
    page.getByRole("heading", { name: "东莞市智微智能科技有限公司" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();

  const lineId = "D-b436a16434a4-R004";
  const sourceId = "I-ad06ec2cd295-26010801-L001";
  await page.getByLabel('选择商品',{exact:true}).selectOption(lineId);
  const candidate = page.getByLabel('为 R004 选择查货依据');
  await expect(candidate).toBeVisible();
  await candidate.selectOption(sourceId);
  await selectField(page,lineId,'产地');
  await expect(page.locator('.active-field')).toContainText('冲突');
  await expect(page.getByLabel('手动修改 产地')).toHaveValue(
    "中国台湾",
  );
  await expect(
    page.getByRole("button", { name: "采用查货：CHINA" }),
  ).toBeVisible();

  const keepEntrustment = page.getByRole("button", {
    name: "采用委托值",
  });
  await expect(keepEntrustment).toBeVisible();
  await expect(keepEntrustment).toBeDisabled();
  await page.getByLabel('处理原因').fill('以最终委托产地为准');
  await keepEntrustment.click();
  await expect(page.getByText("已保存 产地")).toBeVisible();

  const persisted = await page.evaluate(
    ({ lineId, sourceId }) => {
      const saved = JSON.parse(
        window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}",
      );
      const state = saved.state ?? {};
      const line = state.drafts
        ?.flatMap(
          (draft: { lines?: Array<{ id?: string }> }) => draft.lines ?? [],
        )
        .find((item: { id?: string }) => item.id === lineId);
      const source = state.sources?.find(
        (item: { id?: string }) => item.id === sourceId,
      );
      const evidence = state.evidence?.filter((item: { id?: string }) =>
        line?.evidenceIds?.includes(item.id),
      );
      const operations = state.operations?.filter(
        (item: { affectedEntrustmentLineIds?: string[] }) =>
          item.affectedEntrustmentLineIds?.includes(lineId),
      );
      return { line, source, evidence, operations };
    },
    { lineId, sourceId },
  );
  expect(persisted.line).toMatchObject({ relationSourceId: sourceId });
  expect(persisted.line.issueIds).not.toContain("字段冲突:产地");
  expect(persisted.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "产地",
        currentValue: "中国台湾",
        originalValue: "中国台湾",
        sourceInspectionLineId: sourceId,
        hadConflict: true,
      }),
    ]),
  );
  expect(persisted.operations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operationType: "人工编辑字段",
        summary: expect.stringContaining("产地"),
      }),
    ]),
  );
});

test("黄金路径生成最终 25 列核对单并核销查货商品", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();

  await resolveConflicts(page);
  await page.getByRole("button", { name: "提交人工复核" }).click();
  await confirmAll(page);
  await page.getByRole("button", { name: "确认完成" }).click();

  await expect(page.getByText("已确认完成，最终核对单已生成")).toBeVisible();
  await expect(page.getByText("最终 25 列核对单")).toBeVisible();
  await page.getByRole('button',{name:'25 列结果',exact:true}).click();
  await expect(page.locator(".recon-result-table thead th")).toHaveCount(26);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出最终核对单" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^九立核对单-.+-v\d+\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.slice(1).split("\r\n")[0].split(",")).toEqual(FINAL_OUTPUT_FIELDS);

  const finalState = await page.evaluate(() => {
    const saved = JSON.parse(
      window.localStorage.getItem("jiuli-demo-workspace-v1") ?? "{}",
    );
    const sheet = saved.state?.finalReconciliations?.[0];
    const sources = saved.state?.sources ?? [];
    return {
      sheet,
      writtenOffSources: sources.filter(
        (source: { availability?: string }) => source.availability === "已核销",
      ),
    };
  });
  expect(finalState.sheet).toMatchObject({
    rows: expect.any(Array),
    finalMatchRelationIds: expect.arrayContaining([expect.any(String)]),
    finalEvidenceIds: expect.arrayContaining([expect.any(String)]),
  });
  expect(Object.keys(finalState.sheet.rows[0])).toHaveLength(25);
  expect(finalState.writtenOffSources.length).toBeGreaterThan(0);
});

test("旧版变体场景的委托修订流程保持可用", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-12" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();

  await openRelations(page);
  await page.getByText('修订委托型号',{exact:true}).click();
  const modelInput = page.getByLabel(/更新 .* 委托型号/).first();
  await modelInput.fill("NO-NEW-CANDIDATE");
  await page.getByRole("button", { name: "更新委托资料" }).first().click();
  await expect(page.getByText("委托资料已更新，仅重算变化行")).toBeVisible();
  await expect(page.getByLabel('选择商品',{exact:true})).toContainText('NO-NEW-CANDIDATE');
});

test("客户商品池展示三键合并结果并可展开全部原始组成行", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-05" }).click();
  await page.getByRole("button", { name: "客户商品池" }).click();

  await expect(page.getByText("UMW2631").first()).toBeVisible();
  await expect(page.getByText("177000")).toBeVisible();
  await page.getByRole("button", { name: /展开/ }).first().click();
  await expect(page.locator(".source-detail-list > div")).toHaveCount(12);
  await expect(page.getByText("尚未被草稿使用").first()).toBeVisible();
});

test("场景控制台会恢复真实初始状态并清空上一场景运行结果", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await expect(
    page.getByText("已恢复场景：真实 Prompt 唯一可靠候选"),
  ).toBeVisible();

  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await expect(page.locator(".draft-card")).toHaveCount(1);
  await expect(page.locator(".draft-card")).toContainText(
    "英堡科技（深圳）有限公司",
  );
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();
  await page.getByRole("button", { name: "版本与操作" }).click();
  await expect(page.locator(".timeline-item")).toHaveCount(1);

  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-07" }).click();
  await page.getByRole("button", { name: "版本与操作" }).click();
  await expect(page.getByText("还没有操作记录")).toBeVisible();
});

test("控制台展示并可独立加载全部 21 个验收场景", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await expect(page.locator(".scenario-card")).toHaveCount(21);

  for (const scenario of scenarios) {
    await page
      .locator(".scenario-card")
      .filter({ hasText: scenario.id })
      .click();
    await expect(page.getByText(`已恢复场景：${scenario.name}`)).toBeVisible();
    await expect(page.locator(".scenario-guide")).toContainText(
      `${scenario.id} · ${scenario.name}`,
    );
  }
});

test("刷新保留运行状态，恢复场景按钮明确清空运行结果", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();
  await page.reload();

  await expect(page.getByText(/I-8bc7177252aa/).first()).toBeVisible();
  await page.getByRole("button", { name: "版本与操作" }).click();
  await expect(page.locator(".timeline-item")).toHaveCount(1);
  await page.getByTitle("恢复当前场景").click();
  await expect(
    page.getByText("已恢复场景：真实 Prompt 唯一可靠候选"),
  ).toBeVisible();
  await expect(page.getByText("还没有操作记录")).toBeVisible();
});

test("POC 指标会跟随真实匹配结果变化", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await expect(page.getByTestId("metric-active-relations")).toHaveText("0");
  await expect(page.getByTestId("metric-match-coverage")).toHaveText("0%");

  await page.getByRole("button", { name: "委托草稿", exact: true }).click();
  await page.locator(".draft-card").click();
  await page.getByRole("button", { name: /执行首次匹配/ }).click();
  await page.getByRole("button", { name: "Demo 控制台" }).click();

  await expect(page.getByTestId("metric-active-relations")).toHaveText("2");
  await expect(page.getByTestId("metric-match-coverage")).toHaveText("100%");
});

test("键盘、空态和小屏布局可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "材料接入" })).toBeFocused();

  await page.getByRole("button", { name: "Demo 控制台" }).click();
  await page.locator(".scenario-card").filter({ hasText: "SC-08" }).click();
  await expect(page.locator(".scenario-guide-body")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px$/,
  );

  await page.getByRole("button", { name: "客户商品池" }).click();
  await page.getByRole("button", { name: "已核销" }).click();
  await expect(page.getByText("当前没有可展示的商品")).toBeVisible();
  await expect(
    page.getByText("当前筛选条件下没有商品，请切换其他状态。"),
  ).toBeVisible();
});
