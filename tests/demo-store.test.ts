import { beforeEach, describe, expect, it } from "vitest";
import { buildScenarioState, getMergedPoolProducts, getPocMetrics, getScenarioAcceptanceReport, useDemoStore } from "../lib/demo-store";
import scenarios from "../demo-generated/mock/scenarios.json";

const initialState = useDemoStore.getState();
// Legacy action tests use an explicit synthetic scenario; real Prompt tests load SC-08 separately.
const testFixture = buildScenarioState("SC-12");

beforeEach(() => {
  useDemoStore.setState({
    view: initialState.view,
    scenarioId: testFixture.scenario.id,
    selectedDraftId: testFixture.selectedDraftId,
    selectedIntakeCustomerId: null,
    drafts: testFixture.drafts,
    sources: testFixture.sources,
    files: testFixture.files,
    customers: initialState.customers,
    events: [],
    relations: [],
    evidence: [],
    versions: [],
    operations: [],
    finalReconciliations: [],
    parseJobs: initialState.parseJobs,
    parseResults: initialState.parseResults,
    parsedFacts: initialState.parsedFacts,
    convertedEntrustments: [],
    convertedInspections: [],
    convertedAuxiliaryMaterials: [],
    materialBindings: [],
    toast: null,
  });
});
describe("一体化任务状态", () => {
  it("选择任务后同步阶段、问题和四类进度", () => {
    const draft = useDemoStore.getState().drafts[0];
    useDemoStore.getState().selectDraft(draft.id);

    const state = useDemoStore.getState();
    expect(state.activeTaskId).toBe(draft.id);
    expect(state.lastVisitedTaskId).toBe(draft.id);
    expect(state.taskStage).toBe("ready");
    expect(state.taskIssues.some((issue) => issue.draftId === draft.id)).toBe(true);
    expect(state.taskProgress.relations.total).toBe(draft.lines.length);
    expect(state.taskProgress.finalization).toEqual({ current: 0, total: 1 });
  });

  it("继续同一任务时保留商品行和字段位置，并记录演示场景来源", () => {
    useDemoStore.getState().loadScenario("SC-08");
    const draft = useDemoStore.getState().drafts[0];
    const panel = `line:${draft.lines[0].id}|型号` as const;
    useDemoStore.getState().selectDraft(draft.id);
    useDemoStore.getState().setLastVisitedPanel(panel);
    useDemoStore.getState().setView("home");
    useDemoStore.getState().selectDraft(draft.id);

    const state = useDemoStore.getState();
    expect(state.lastVisitedPanel).toBe(panel);
    expect(state.scenarioEntry?.scenarioId).toBe("SC-08");
    expect(state.scenarioEntry?.restoredAt).toBeTruthy();
  });
});

describe("委托事实生成真实草稿", () => {
  it("从转换结果生成可继续匹配的草稿，并阻止重复生成", () => {
    const state = useDemoStore.getState();
    const customer = state.customers[0];
    const fileId = "LOCAL-ENTRUST-1";
    const fields = { 客户名: customer.name, 品牌: "品牌A", 型号: "型号A", 商品描述: "商品", 品名: "商品", 产地: "中国", 单位: "件", 数量: "2", 报关单价: "1", 总价: "2", 币种: "CNY", 件数: "1", 净重: "1", 毛重: "1", sku: "SKU", 对应的采购: "采购", 供应商号码: "供应商号", 供应商: "供应商", 期票天数: "0", 采购订单号: "PO", 物料号码: "M", 托盘数: "0", 入仓号: "IN", 产线: "线", 备注: "" } as never;
    useDemoStore.setState({ convertedEntrustments: [{ sourceFileId: fileId, contentSha256: "sha", customerId: customer.id, lines: [{ id: "ENTRUST-LOCAL-ENTRUST-1-2", sourceOrder: 1, fields, sourceLocation: { fileId, page: null, sheet: "Sheet1", position: "第 2 行" }, contentSha256: "sha", warnings: [] }], warnings: [], convertedAt: new Date().toISOString() }] });
    useDemoStore.getState().createDraftFromEntrustmentFile(fileId);
    const created = useDemoStore.getState().drafts.at(-1)!;
    expect(created).toMatchObject({ id: `DRAFT-${fileId}`, customerId: customer.id, status: "待核对", finalized: false });
    expect(created.lines[0]).toMatchObject({ model: "型号A", sourceLocation: { fileId, position: "第 2 行" }, status: "暂无查货依据" });
    expect(useDemoStore.getState().view).toBe("workbench");
    useDemoStore.getState().createDraftFromEntrustmentFile(fileId);
    expect(useDemoStore.getState().toast).toContain("已经生成草稿");
    expect(useDemoStore.getState().drafts.filter((draft) => draft.id === `DRAFT-${fileId}`)).toHaveLength(1);
  });

  it("生成的草稿可以接入查货并完成匹配", () => {
    const state = useDemoStore.getState();
    const base = state.drafts.find((draft) => draft.customerId)!;
    const fileId = "LOCAL-ENTRUST-2";
    useDemoStore.setState({ convertedEntrustments: [{ sourceFileId: fileId, contentSha256: "sha-2", customerId: base.customerId, lines: [{ id: "ENTRUST-LOCAL-ENTRUST-2-2", sourceOrder: 1, fields: base.lines[0].fields, sourceLocation: { fileId, page: null, sheet: "Sheet1", position: "第 2 行" }, contentSha256: "sha-2", warnings: [] }], warnings: [], convertedAt: new Date().toISOString() }] });
    useDemoStore.getState().createDraftFromEntrustmentFile(fileId);
    const draft = useDemoStore.getState().drafts.at(-1)!;
    const source = { ...state.sources[0], id: "S-REAL-1", sourceFileId: "LOCAL-INSPECTION-1", customerId: draft.customerId, availability: "可匹配" as const, model: draft.lines[0].model, brand: draft.lines[0].brand, origin: draft.lines[0].origin, quantity: draft.lines[0].quantity, fields: { ...state.sources[0].fields, 型号: draft.lines[0].model, 品牌: draft.lines[0].brand, 产地: draft.lines[0].origin, 数量: draft.lines[0].quantity } };
    useDemoStore.setState({ sources: [source] });
    useDemoStore.getState().matchSelectedDraft();
    const result = useDemoStore.getState();
    expect(result.drafts.at(-1)?.lines[0].relationSourceId).toBe("S-REAL-1");
    expect(result.sources[0].availability).toBe("草稿占用");
  });
});

describe("辅助材料闭环", () => {
  it("同一批次可接收多个文件，并保留批次标识", () => {
    const batchId = "UPLOAD-BATCH-TEST";
    useDemoStore.getState().stageLocalFile({ name: "批次-发票.xlsx", size: 100, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "发票", batchId });
    useDemoStore.getState().stageLocalFile({ name: "批次-箱单.xlsx", size: 101, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "箱单", batchId });
    expect(useDemoStore.getState().files.filter((file) => file.batchId === batchId)).toHaveLength(2);
  });

  it("辅助材料必须明确绑定同客户草稿，并保留字段冲突证据", () => {
    const state = useDemoStore.getState();
    const draft = state.drafts.find((item) => item.customerId)!;
    const fileId = "AUX-INVOICE-1";
    const customerId = draft.customerId!;
    useDemoStore.setState({
      files: [...state.files, { id: fileId, name: "invoice.xlsx", materialType: "发票", loaded: false, duplicate: false, source: "本地上传", uploadStatus: "解析成功", customerId }],
      convertedAuxiliaryMaterials: [{ sourceFileId: fileId, contentSha256: "aux-sha", materialType: "发票", customerId, convertedAt: new Date().toISOString(), warnings: [], lines: [{ id: "AUX-L1", fields: { 型号: draft.lines[0].model, 品牌: "另一品牌", 数量: draft.lines[0].quantity }, sourceLocation: { fileId, page: null, sheet: "Sheet1", position: "第 2 行" }, warnings: [] }] }],
    });
    useDemoStore.getState().bindMaterialToDraft(fileId, draft.id);
    const result = useDemoStore.getState();
    expect(result.materialBindings).toContainEqual(expect.objectContaining({ fileId, draftId: draft.id, role: "辅助材料" }));
    expect(result.drafts.find((item) => item.id === draft.id)?.lines[0].issueIds).toContain("字段冲突:品牌");
    expect(result.evidence.some((item) => item.sourceFileId === fileId && item.hadConflict)).toBe(true);
  });

  it("修订委托材料沿用原草稿行标识，并触发统一资料更新动作", () => {
    const state = useDemoStore.getState();
    const draft = state.drafts.find((item) => item.customerId)!;
    const fileId = "REVISION-ENTRUST-1";
    useDemoStore.setState({ convertedEntrustments: [{ sourceFileId: fileId, contentSha256: "revision-sha", customerId: draft.customerId, warnings: [], convertedAt: new Date().toISOString(), lines: draft.lines.map((line, index) => ({ id: `REV-L${index + 1}`, sourceOrder: line.sourceOrder, fields: { ...line.fields, 型号: `${line.model}-REV` }, sourceLocation: { fileId, page: null, sheet: "Sheet1", position: `第 ${index + 2} 行` }, contentSha256: "revision-sha", warnings: [] })) }] });
    useDemoStore.getState().reviseDraftWithEntrustmentFile(fileId, draft.id);
    const updated = useDemoStore.getState().drafts.find((item) => item.id === draft.id)!;
    expect(updated.lines.map((line) => line.id)).toEqual(draft.lines.map((line) => line.id));
    expect(updated.lines[0].model).toContain("-REV");
    expect(useDemoStore.getState().operations.at(-1)?.operationType).toBe("更新委托资料");
  });
});

describe("解析异常和不可用状态", () => {
  it("人工复核录入事实后可以进入委托转换", () => {
    useDemoStore.getState().stageLocalFile({ name: "扫描委托.pdf", size: 100, type: "application/pdf", materialType: "委托书" });
    const file = useDemoStore.getState().files.find((item) => item.name === "扫描委托.pdf")!;
    useDemoStore.getState().startParse(file.id);
    useDemoStore.getState().flagParseReview(file.id, "扫描件无文本，需要人工录入");
    const customer = useDemoStore.getState().customers[0];
    useDemoStore.getState().completeManualParse(file.id, [{ id: "MANUAL-1", fields: { 品牌: "B", 型号: "M", 数量: "1" }, sourceLocation: { page: 1, sheet: null, row: null, position: "人工录入" }, confidence: 1, warnings: [] }], "委托书", customer.id);
    expect(useDemoStore.getState().parseJobs.find((job) => job.sourceFileId === file.id)?.status).toBe("解析成功");
    expect(useDemoStore.getState().convertedEntrustments[0].lines[0].fields.型号).toBe("M");
  });
  it("无事实行不会标记解析成功，也不会写入转换结果", () => {
    useDemoStore.getState().stageLocalFile({ name: "空材料.xlsx", size: 100, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "委托书" });
    const file = useDemoStore.getState().files.find((item) => item.name === "空材料.xlsx")!;
    useDemoStore.getState().startParse(file.id);
    const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
    useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "empty", batchId: "B-E", materialType: "委托书", customerId: null, customerResolution: "待补客户信息", factCount: 0, sourceLocations: [], parsedAt: new Date().toISOString() }, []);
    expect(useDemoStore.getState().convertedEntrustments).toHaveLength(0);
    expect(useDemoStore.getState().toast).toContain("无有效事实行");
  });

  it("重复上传只记录重复状态，不增加可用材料", () => {
    useDemoStore.getState().stageLocalFile({ name: "重复.xlsx", size: 100, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    useDemoStore.getState().stageLocalFile({ name: "重复.xlsx", size: 100, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const files = useDemoStore.getState().files.filter((item) => item.name === "重复.xlsx");
    expect(files).toHaveLength(2);
    expect(files.filter((item) => item.duplicate)).toHaveLength(1);
    expect(useDemoStore.getState().events.some((event) => event.summary.includes("发现重复文件"))).toBe(true);
  });
});

describe("TASK-0903-c 解析任务页面状态闭环", () => {
  it("失败、人工复核和重试会保留任务状态，未成功前不会进入商品池", () => {
    useDemoStore.getState().stageLocalFile({ name: "扫描件.pdf", size: 2048, type: "application/pdf" });
    const file = useDemoStore.getState().files.find((item) => item.name === "扫描件.pdf")!;
    expect(useDemoStore.getState().parseJobs.find((job) => job.sourceFileId === file.id)?.status).toBe("待解析");
    useDemoStore.getState().startParse(file.id);
    useDemoStore.getState().recordParseFailure(file.id, "OCR_REQUIRED", "PDF 无文本，需要人工确认");
    useDemoStore.getState().startParse(file.id);
    useDemoStore.getState().flagParseReview(file.id, "客户和商品行无法可靠识别");
    expect(useDemoStore.getState().parseJobs.find((job) => job.sourceFileId === file.id)?.status).toBe("待人工复核");
    useDemoStore.getState().resolveParseReview(file.id);
    const retryable = useDemoStore.getState().parseJobs.find((job) => job.sourceFileId === file.id)!;
    expect(retryable).toMatchObject({ status: "解析失败", attempt: 2, errorCode: "REVIEW_REQUIRED_RETRY" });
    expect(useDemoStore.getState().sources.every((source) => source.sourceFileId !== file.id)).toBe(true);
  });

  it("解析成功可保存事实，补充客户后才标记客户已识别", () => {
    useDemoStore.getState().stageLocalFile({ name: "查货.xlsx", size: 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const file = useDemoStore.getState().files.find((item) => item.name === "查货.xlsx")!;
    useDemoStore.getState().startParse(file.id);
    const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
    useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "sha256-upload", batchId: "BATCH-UPLOAD-1", materialType: "查货", customerId: null, customerResolution: "待补客户信息", factCount: 1, sourceLocations: ["Sheet1!R2"], parsedAt: new Date().toISOString() }, [{ id: "FACT-UPLOAD-1", fields: { 型号: "M-001" }, sourceLocation: { page: null, sheet: "Sheet1", row: 2, position: null }, confidence: null, warnings: [] }]);
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.uploadStatus).toBe("解析成功");
    expect(useDemoStore.getState().parseResults).toHaveLength(1);
    expect(useDemoStore.getState().parseResults[0]).toMatchObject({ customerId: null, customerResolution: "待补客户信息" });
    expect(useDemoStore.getState().toast).toBe("解析成功，请补充材料客户");
    expect(useDemoStore.getState().parsedFacts[0]).toMatchObject({ jobId: job.id, sourceFileId: file.id, id: "FACT-UPLOAD-1" });
    const customer = useDemoStore.getState().customers[0];
    useDemoStore.getState().resolveParsedFileCustomer(file.id, customer.id);
    expect(useDemoStore.getState().parseResults[0]).toMatchObject({ customerId: customer.id, customerResolution: "已识别" });
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.customerId).toBe(customer.id);
    expect(useDemoStore.getState().sources.every((source) => source.sourceFileId !== file.id)).toBe(true);
  });

  it("已识别客户的查货解析直接复用接入动作，按入仓号入池并触发增量核对", () => {
    const customer = useDemoStore.getState().customers[0];
    useDemoStore.getState().stageLocalFile({ name: "现场查货-已识别.xlsx", size: 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "查货", customerId: customer.id });
    const file = useDemoStore.getState().files.find((item) => item.name === "现场查货-已识别.xlsx")!;
    useDemoStore.getState().startParse(file.id);
    const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
    const facts = [{ id: "FACT-INSPECT-1", fields: { 品牌: "B", 型号: "M-LIVE", 产地: "中国", 数量: "2", 单位: "个", 件数: "1", 净重: "1", 毛重: "2", 入仓号: "R-LIVE" }, sourceLocation: { page: null, sheet: "Sheet1", row: 2, position: null }, confidence: null, warnings: [] }];
    useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "sha-live-inspection", batchId: "B-LIVE", materialType: "查货", customerId: customer.id, customerResolution: "已识别", factCount: 1, sourceLocations: ["Sheet1!R2"], parsedAt: new Date().toISOString() }, facts);
    const result = useDemoStore.getState();
    expect(result.files.find((item) => item.id === file.id)).toMatchObject({ loaded: true, uploadStatus: "解析成功" });
    expect(result.sources.filter((source) => source.sourceFileId === file.id)).toMatchObject([{ availability: "可匹配", warehouseNo: "R-LIVE", logicalInspectionOrderId: `${file.id}::R-LIVE` }]);
    expect(result.events.some((event) => event.type === "新增查货")).toBe(true);
  });

  it("内容哈希重复时不重新生成查货商品或重置已有占用", () => {
    const customer = useDemoStore.getState().customers[0];
    const facts = [{ id: "FACT-DUP-1", fields: { 品牌: "B", 型号: "M-DUP", 数量: "1", 入仓号: "R-DUP" }, sourceLocation: { page: null, sheet: "Sheet1", row: 2, position: null }, confidence: null, warnings: [] }];
    const parse = (name: string, id: string) => {
      useDemoStore.getState().stageLocalFile({ name, size: 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "查货", customerId: customer.id });
      const file = useDemoStore.getState().files.find((item) => item.name === name)!;
      useDemoStore.getState().startParse(file.id);
      const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
      useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "sha-same-content", batchId: `B-${id}`, materialType: "查货", customerId: customer.id, customerResolution: "已识别", factCount: 1, sourceLocations: ["Sheet1!R2"], parsedAt: new Date().toISOString() }, [{ ...facts[0], id }]);
      return file.id;
    };
    const firstId = parse("同内容-A.xlsx", "FACT-DUP-A");
    const firstSourceCount = useDemoStore.getState().sources.filter((source) => source.sourceFileId === firstId).length;
    const secondId = parse("同内容-B.xlsx", "FACT-DUP-B");
    const second = useDemoStore.getState().files.find((item) => item.id === secondId);
    expect(firstSourceCount).toBe(1);
    expect(second).toMatchObject({ duplicate: true, duplicateOfFileId: firstId });
    expect(useDemoStore.getState().sources.filter((source) => source.sourceFileId === secondId)).toHaveLength(0);
  });

  it("解析有原始事实但无法转换商品行时进入人工复核，不伪装成解析成功", () => {
    useDemoStore.getState().stageLocalFile({ name: "无法识别.xlsx", size: 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "委托书" });
    const file = useDemoStore.getState().files.find((item) => item.name === "无法识别.xlsx")!;
    useDemoStore.getState().startParse(file.id);
    const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
    useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "sha-unmapped", batchId: "BATCH-UNMAPPED", materialType: "委托书", customerId: null, customerResolution: "待补客户信息", factCount: 1, sourceLocations: ["Sheet1!R2"], parsedAt: new Date().toISOString() }, [{ id: "FACT-UNMAPPED", fields: { column_1: "标题", column_2: "合计" }, sourceLocation: { page: null, sheet: "Sheet1", row: 2, position: null }, confidence: null, warnings: [] }]);
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.uploadStatus).toBe("待人工复核");
    expect(useDemoStore.getState().parseJobs.find((item) => item.id === job.id)?.status).toBe("待人工复核");
    expect(useDemoStore.getState().parseResults[0]).toMatchObject({ jobId: job.id, factCount: 1 });
    expect(useDemoStore.getState().parsedFacts[0]).toMatchObject({ id: "FACT-UNMAPPED", sourceFileId: file.id });
    expect(useDemoStore.getState().convertedEntrustments.some((item) => item.sourceFileId === file.id)).toBe(false);
  });

  it("委托材料后补客户后，转换结果可生成已识别客户草稿", () => {
    useDemoStore.getState().stageLocalFile({ name: "委托.xlsx", size: 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", materialType: "委托书" });
    const file = useDemoStore.getState().files.find((item) => item.name === "委托.xlsx")!;
    useDemoStore.getState().startParse(file.id);
    const job = useDemoStore.getState().parseJobs.find((item) => item.sourceFileId === file.id)!;
    useDemoStore.getState().completeParse(file.id, { jobId: job.id, sourceFileId: file.id, contentSha256: "sha-entrust", batchId: "BATCH-E", materialType: "委托书", customerId: null, customerResolution: "待补客户信息", factCount: 1, sourceLocations: ["Sheet1!R2"], parsedAt: new Date().toISOString() }, [{ id: "FACT-E", fields: { 型号: "M-1", 品牌: "B", 数量: "1" }, sourceLocation: { page: null, sheet: "Sheet1", row: 2, position: null }, confidence: null, warnings: [] }]);
    const customer = useDemoStore.getState().customers[0];
    useDemoStore.getState().resolveParsedFileCustomer(file.id, customer.id);
    expect(useDemoStore.getState().convertedEntrustments[0].customerId).toBe(customer.id);
    useDemoStore.getState().createDraftFromEntrustmentFile(file.id);
    expect(useDemoStore.getState().drafts.at(-1)).toMatchObject({ customerId: customer.id, customerStatus: "已识别" });
  });
});

describe("TASK-0801 页面状态统一接入领域动作", () => {
  it("首次匹配同步生成关系、占用、证据、版本和标准操作记录", () => {
    const state = useDemoStore.getState();
    const baseDraft = state.drafts.find((draft) => draft.customerId !== null)!;
    const line = baseDraft.lines[0];
    const baseSource = state.sources[0];
    const source = {
      ...baseSource,
      customerId: baseDraft.customerId,
      availability: "可匹配" as const,
      model: line.model,
      brand: line.brand,
      origin: line.origin,
      quantity: line.quantity,
      fields: {
        ...baseSource.fields,
        品牌: line.fields.品牌,
        型号: line.fields.型号,
        产地: line.fields.产地,
        数量: line.fields.数量,
      },
    };
    const draft = { ...baseDraft, lines: [line], status: "待核对", version: 0 };
    useDemoStore.setState({
      selectedDraftId: draft.id,
      drafts: [draft],
      sources: [source],
      relations: [], evidence: [], versions: [], operations: [], events: [],
    });

    useDemoStore.getState().matchSelectedDraft();
    const result = useDemoStore.getState();

    expect(result.relations).toHaveLength(1);
    expect(result.versions).toHaveLength(1);
    expect(result.operations[0].operationType).toBe("AI 首次匹配");
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.sources[0]).toMatchObject({ availability: "草稿占用", occupiedDraftId: draft.id });
    expect(result.drafts[0].lines[0].relationSourceId).toBe(source.id);
    expect(result.drafts[0].lines[0].status).not.toBe("暂无查货依据");
  });

  it("人工选择候选在页面状态层也拒绝跨客户商品", () => {
    const state = useDemoStore.getState();
    const draft = state.drafts.find((item) => item.customerId !== null)!;
    const line = draft.lines[0];
    const otherSource = {
      ...state.sources[0],
      customerId: "C-OTHER",
      availability: "可匹配" as const,
      model: line.model,
      fields: { ...state.sources[0].fields, 型号: line.fields.型号 },
    };
    useDemoStore.setState({ selectedDraftId: draft.id, drafts: [{ ...draft, lines: [line] }], sources: [otherSource], relations: [], evidence: [], versions: [], operations: [], events: [] });

    useDemoStore.getState().selectLineSource(line.id, otherSource.id);
    const result = useDemoStore.getState();

    expect(result.toast).toBe("客户不一致，禁止选择候选");
    expect(result.relations).toHaveLength(0);
    expect(result.sources[0].availability).toBe("可匹配");
  });
});

describe("TASK-0802 真实场景加载与重置", () => {
  it("按真实 Prompt 校准加载 SC-08，保留原始型号和明确行标记", () => {
    const restored = buildScenarioState("SC-08");

    expect(restored.drafts.map((draft) => draft.id)).toEqual(["D-3c3cc10bd26b"]);
    expect(restored.drafts[0].lines.map((line) => line.model)).toEqual(["H25G9TCXXCX702A#9", "D25G9TCX8CX239C#D"]);
    expect(restored.sources
      .filter((source) => source.id === "I-8bc7177252aa-25120336-L001" || source.id === "I-8bc7177252aa-25120336-L002")
      .map((source) => source.otherFields["品名"])).toEqual(["64GB INK DIE (#9)", "64GB INK DIE (#D)"]);
    expect(restored.sources.filter((source) => source.availability === "可匹配").map((source) => source.logicalInspectionOrderId)).toEqual([
      "I-8bc7177252aa-25120336",
      "I-8bc7177252aa-25120336",
    ]);
  });

  it("使用描述行标记建立两条关系，并按 P4 只补入仓号", () => {
    useDemoStore.getState().loadScenario("SC-08");
    useDemoStore.getState().matchSelectedDraft();
    const result = useDemoStore.getState();

    expect(result.relations.filter((relation) => relation.active)).toHaveLength(2);
    expect(result.drafts[0].lines.map((line) => line.model)).toEqual(["H25G9TCXXCX702A#9", "D25G9TCX8CX239C#D"]);
    expect(result.drafts[0].lines.map((line) => line.fields["入仓号"])).toEqual(["25120336", "25120336"]);
    expect(result.drafts[0].lines.flatMap((line) => line.issueIds)).not.toEqual(expect.arrayContaining([
      "字段冲突:型号",
      "字段冲突:产地",
      "字段冲突:净重",
      "字段冲突:毛重",
    ]));
  });

  it("切换场景会清空上一个场景的运行时关系、版本和事件", () => {
    useDemoStore.setState({
      relations: [{} as never], versions: [{} as never], evidence: [{} as never], operations: [{} as never],
      events: [{ id: "OLD", type: "旧事件", summary: "旧状态", time: "2026-09-18T00:00:00.000Z" }],
    });

    useDemoStore.getState().loadScenario("SC-07");
    const result = useDemoStore.getState();

    expect(result.scenarioId).toBe("SC-07");
    expect(result.drafts.map((draft) => draft.id)).toEqual(["D-b436a16434a4"]);
    expect(result.relations).toEqual([]);
    expect(result.versions).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it("显式场景变体会生成隔离的虚拟查货单，不污染其他场景", () => {
    const isolation = buildScenarioState("SC-01");
    const baseline = buildScenarioState("SC-06");

    expect(isolation.sources.some((source) => source.logicalInspectionOrderId === "VI-OTHER" && source.availability === "可匹配")).toBe(true);
    expect(baseline.sources.some((source) => source.logicalInspectionOrderId === "VI-OTHER")).toBe(false);
  });
});

describe("TASK-0803 材料接入与客户识别闭环", () => {
  it("查货材料未选择客户时拒绝接入，选择正确客户后才进入商品池", () => {
    const state = useDemoStore.getState();
    const source = state.sources.find((item) => item.customerId !== null)!;
    const file = state.files.find((item) => item.id === source.sourceFileId)!;
    useDemoStore.setState({
      files: state.files.map((item) => item.id === file.id ? { ...item, loaded: false } : item),
      sources: state.sources.map((item) => item.sourceFileId === file.id ? { ...item, availability: "未加载" as const } : item),
      selectedIntakeCustomerId: null,
    });

    useDemoStore.getState().ingestFile(file.id);
    expect(useDemoStore.getState().toast).toBe("请先选择查货材料所属客户");
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.loaded).toBe(false);

    useDemoStore.getState().setIntakeCustomer(source.customerId!);
    useDemoStore.getState().ingestFile(file.id);
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.loaded).toBe(true);
    expect(useDemoStore.getState().sources.filter((item) => item.sourceFileId === file.id).every((item) => item.availability !== "未加载")).toBe(true);
  });

  it("客户未知草稿补充客户前禁止匹配，补充后记录版本和操作", () => {
    useDemoStore.getState().loadScenario("SC-07");
    useDemoStore.getState().matchSelectedDraft();
    expect(useDemoStore.getState().toast).toContain("客户未确定");

    const customerId = useDemoStore.getState().customers[0].id;
    useDemoStore.getState().resolveSelectedDraftCustomer(customerId);
    const result = useDemoStore.getState();

    expect(result.drafts[0]).toMatchObject({ customerId, customerStatus: "已识别", version: 1 });
    expect(result.operations.at(-1)?.operationType).toBe("补充客户信息");
    expect(result.versions.at(-1)?.triggerReason).toBe("补充客户信息");
  });
});

describe("TASK-0804 工作台人工处理闭环", () => {
  it("人工字段编辑保留证据、版本和操作记录", () => {
    useDemoStore.getState().loadScenario("SC-08");
    useDemoStore.getState().matchSelectedDraft();
    const line = useDemoStore.getState().drafts[0].lines[0];

    useDemoStore.getState().editSelectedLineField(line.id, "产地", "人工确认产地");
    const result = useDemoStore.getState();

    expect(result.drafts[0].lines[0].fields.产地).toBe("人工确认产地");
    expect(result.evidence.at(-1)).toMatchObject({ field: "产地", isManuallyEdited: true });
    expect(result.operations.at(-1)?.operationType).toBe("人工编辑字段");
  });

  it("解绑会让旧关系失效并释放原查货商品", () => {
    useDemoStore.getState().loadScenario("SC-08");
    useDemoStore.getState().matchSelectedDraft();
    const line = useDemoStore.getState().drafts[0].lines[0];
    const sourceId = line.relationSourceId!;

    useDemoStore.getState().unbindSelectedLine(line.id);
    const result = useDemoStore.getState();

    expect(result.relations.find((relation) => relation.entrustmentLineId === line.id)?.active).toBe(false);
    expect(result.sources.find((source) => source.id === sourceId)).toMatchObject({ availability: "可匹配", occupiedDraftId: null });
    expect(result.drafts[0].lines[0].relationSourceId).toBeNull();
  });

  it("改配会原子释放旧商品、占用新商品并保留关系历史", () => {
    useDemoStore.getState().loadScenario("SC-09");
    useDemoStore.getState().matchSelectedDraft();
    const draft = useDemoStore.getState().drafts[0];
    const line = draft.lines[0];
    const candidates = useDemoStore.getState().sources.filter((source) => source.customerId === draft.customerId && source.availability === "可匹配" && source.model === line.model);
    useDemoStore.getState().selectLineSource(line.id, candidates[0].id);
    useDemoStore.getState().reassignSelectedLine(line.id, candidates[1].id);
    const result = useDemoStore.getState();

    expect(result.sources.find((source) => source.id === candidates[0].id)?.availability).toBe("可匹配");
    expect(result.sources.find((source) => source.id === candidates[1].id)?.availability).toBe("草稿占用");
    expect(result.relations.filter((relation) => relation.entrustmentLineId === line.id).map((relation) => relation.active)).toEqual([false, true]);
    expect(result.operations.at(-1)?.operationType).toBe("人工改配");
  });

  it("组合关系占用选中的多条原始行，其他候选保持可匹配", () => {
    useDemoStore.getState().loadScenario("SC-09");
    const draft = useDemoStore.getState().drafts[0];
    const line = draft.lines[0];
    const candidates = useDemoStore.getState().sources.filter((source) => source.customerId === draft.customerId && source.availability === "可匹配" && source.model === line.model);

    useDemoStore.getState().establishCompositeForLine(line.id, candidates.slice(0, 2).map((source) => source.id));
    const result = useDemoStore.getState();

    expect(result.drafts[0].lines[0].relationSourceIds).toEqual(candidates.slice(0, 2).map((source) => source.id));
    expect(result.sources.filter((source) => candidates.slice(0, 2).some((candidate) => candidate.id === source.id)).every((source) => source.availability === "草稿占用")).toBe(true);
    expect(result.operations.at(-1)?.operationType).toBe("人工建立关系");
  });
});

describe("TASK-0805 最终确认与 25 列核对单", () => {
  it("确认完成原子生成最终单并核销实际使用商品", () => {
    const state = useDemoStore.getState();
    const baseDraft = state.drafts.find((draft) => draft.customerId !== null)!;
    const line = baseDraft.lines[0];
    const baseSource = state.sources[0];
    const source = {
      ...baseSource,
      customerId: baseDraft.customerId,
      availability: "可匹配" as const,
      model: line.model,
      brand: line.brand,
      origin: line.origin,
      quantity: line.quantity,
      fields: {
        品牌: line.fields.品牌, 型号: line.fields.型号, 产地: line.fields.产地,
        数量: line.fields.数量, 单位: line.fields.单位, 件数: line.fields.件数,
        净重: line.fields.净重, 毛重: line.fields.毛重,
      },
    };
    const draft = { ...baseDraft, lines: [line], status: "待核对", version: 0 };
    useDemoStore.setState({ selectedDraftId: draft.id, drafts: [draft], sources: [source], relations: [], evidence: [], versions: [], operations: [], events: [], finalReconciliations: [] });

    useDemoStore.getState().matchSelectedDraft();
    useDemoStore.getState().submitSelectedDraft();
    useDemoStore.getState().confirmLine(line.id);
    useDemoStore.getState().completeSelectedDraft();
    const result = useDemoStore.getState();

    expect(result.drafts[0]).toMatchObject({ status: "已完成", finalized: true });
    expect(result.sources[0].availability).toBe("已核销");
    expect(result.finalReconciliations).toHaveLength(1);
    expect(Object.keys(result.finalReconciliations[0].rows[0])).toHaveLength(25);
    expect(result.finalReconciliations[0]).toMatchObject({ confirmedBy: "演示用户" });
    expect(result.operations.slice(-2).map((operation) => operation.operationType)).toEqual(["确认完成", "查货商品核销"]);
  });
});

describe("TASK-0811 后补查货与委托资料更新", () => {
  it("后补查货接入后只为受影响待核对行建立增量关系", () => {
    const state = useDemoStore.getState();
    const baseDraft = state.drafts.find((draft) => draft.customerId !== null)!;
    const line = baseDraft.lines[0];
    const baseSource = state.sources[0];
    const file = { id: baseSource.sourceFileId, name: "later.pdf", materialType: "查货", loaded: false, duplicate: false, source: "基线" as const };
    const source = {
      ...baseSource, customerId: baseDraft.customerId, availability: "未加载" as const,
      model: line.model, brand: line.brand, origin: line.origin, quantity: line.quantity,
      fields: { 品牌: line.fields.品牌, 型号: line.fields.型号, 产地: line.fields.产地, 数量: line.fields.数量, 单位: line.fields.单位, 件数: line.fields.件数, 净重: line.fields.净重, 毛重: line.fields.毛重 },
    };
    const draft = { ...baseDraft, lines: [line], status: "待核对", version: 0 };
    useDemoStore.setState({ selectedDraftId: draft.id, selectedIntakeCustomerId: draft.customerId, drafts: [draft], sources: [source], files: [file], relations: [], evidence: [], versions: [], operations: [], events: [] });

    useDemoStore.getState().ingestFile(file.id);
    const result = useDemoStore.getState();

    expect(result.drafts[0].lines[0].relationSourceId).toBe(source.id);
    expect(result.sources[0].availability).toBe("草稿占用");
    expect(result.operations.at(-1)?.operationType).toBe("增量核对");
    expect(result.toast).toContain("增量核对");
  });

  it("委托资料更新只重算变化行，释放旧依据并占用新依据", () => {
    const state = useDemoStore.getState();
    const baseDraft = state.drafts.find((draft) => draft.customerId !== null)!;
    const line = baseDraft.lines[0];
    const baseSource = state.sources[0];
    const oldSource = { ...baseSource, id: "S-OLD", customerId: baseDraft.customerId, availability: "可匹配" as const, model: line.model, fields: { ...baseSource.fields, 品牌: line.fields.品牌, 型号: line.fields.型号, 产地: line.fields.产地 } };
    const newSource = { ...baseSource, id: "S-NEW", customerId: baseDraft.customerId, availability: "可匹配" as const, model: "NEW-MODEL", fields: { ...baseSource.fields, 品牌: line.fields.品牌, 型号: "NEW-MODEL", 产地: line.fields.产地 } };
    const draft = { ...baseDraft, lines: [line], status: "待核对", version: 0 };
    useDemoStore.setState({ selectedDraftId: draft.id, drafts: [draft], sources: [oldSource, newSource], relations: [], evidence: [], versions: [], operations: [], events: [] });
    useDemoStore.getState().matchSelectedDraft();

    useDemoStore.getState().updateSelectedDraftMaterial(line.id, "型号", "NEW-MODEL");
    const result = useDemoStore.getState();

    expect(result.sources.find((source) => source.id === "S-OLD")?.availability).toBe("可匹配");
    expect(result.sources.find((source) => source.id === "S-NEW")?.availability).toBe("草稿占用");
    expect(result.drafts[0].lines[0].model).toBe("NEW-MODEL");
    expect(result.operations.at(-1)?.operationType).toBe("更新委托资料");
  });
});

describe("TASK-0812 客户商品池合并和来源展开", () => {
  it("同逻辑单三键相同的原始行形成一个合并商品且保留全部组成行", () => {
    const scenario = buildScenarioState("SC-05");
    const products = getMergedPoolProducts(scenario.sources);
    const umw = products.find((product) => product.fields.型号 === "UMW2631");

    expect(umw).toBeDefined();
    expect(umw?.sourceLineIds).toHaveLength(12);
    expect(umw?.fields).toMatchObject({ 数量: "177000", 净重: "53.30", 毛重: "61.70" });
    expect(scenario.sources.filter((source) => umw?.sourceLineIds.includes(source.id))).toHaveLength(12);
  });
});

describe("TASK-0813 21 个场景页面验收基线", () => {
  it("全部 21 个场景都能创建独立状态副本并清空运行时结果", () => {
    expect(scenarios).toHaveLength(21);
    for (const scenario of scenarios) {
      const restored = buildScenarioState(scenario.id);
      expect(restored.scenario.id).toBe(scenario.id);
      useDemoStore.setState({ relations: [{} as never], versions: [{} as never], events: [{ id: "OLD", type: "旧", summary: "旧", time: "2026-09-18T00:00:00.000Z" }] });
      useDemoStore.getState().loadScenario(scenario.id);
      expect(useDemoStore.getState().scenarioId).toBe(scenario.id);
      expect(useDemoStore.getState().relations).toEqual([]);
      expect(useDemoStore.getState().versions).toEqual([]);
      expect(useDemoStore.getState().events).toEqual([]);
    }
  });
});

describe("TASK-0814 本地持久化", () => {
  it("核心业务状态会写入持久化存储，场景重置会覆盖运行态", async () => {
    useDemoStore.getState().loadScenario("SC-08");
    useDemoStore.getState().matchSelectedDraft();
    const storage = useDemoStore.persist.getOptions().storage;
    const saved = await storage?.getItem("jiuli-demo-workspace-v1");
    const savedState = saved?.state as ReturnType<typeof useDemoStore.getState>;

    expect(savedState.scenarioId).toBe("SC-08");
    expect(savedState.relations).toHaveLength(2);
    expect(savedState.operations).toHaveLength(1);

    useDemoStore.getState().loadScenario("SC-08");
    expect(useDemoStore.getState().relations).toEqual([]);
    expect(useDemoStore.getState().operations).toEqual([]);
  });
});

describe("T22 刷新后的解析任务恢复", () => {
  it("把刷新时仍在解析中的任务恢复成可重试，并保留原任务", () => {
    useDemoStore.getState().stageLocalFile({ name: "中断任务.pdf", size: 1024, type: "application/pdf" });
    const file = useDemoStore.getState().files.find((item) => item.name === "中断任务.pdf")!;
    useDemoStore.getState().startParse(file.id);

    useDemoStore.getState().recoverInterruptedParseJobs();

    expect(useDemoStore.getState().parseJobs.find((job) => job.sourceFileId === file.id)).toMatchObject({
      status: "解析失败",
      errorCode: "INTERRUPTED",
    });
    expect(useDemoStore.getState().files.find((item) => item.id === file.id)?.uploadStatus).toBe("解析失败");
    expect(useDemoStore.getState().events.some((event) => event.type === "解析任务恢复")).toBe(true);
  });
});

describe("T25 默认场景校准", () => {
  it("默认工作区与显式恢复 SC-01 使用同一份场景事实", () => {
    const expected = buildScenarioState("SC-01");
    useDemoStore.getState().loadScenario("SC-01");
    const restored = useDemoStore.getState();
    expect(restored.files.map((file) => [file.id, file.loaded])).toEqual(expected.files.map((file) => [file.id, file.loaded]));
    expect(restored.sources.map((source) => [source.id, source.availability])).toEqual(expected.sources.map((source) => [source.id, source.availability]));
    expect(restored.drafts.map((draft) => draft.id)).toEqual(expected.drafts.map((draft) => draft.id));
  });
});

describe("T23 逐场景验收报告", () => {
  it("21 个场景逐一给出通过、材料阻断或未执行结论", () => {
    const report = getScenarioAcceptanceReport();
    expect(report).toHaveLength(21);
    expect(report.every((item) => ["已通过", "被真实材料缺口阻断", "未执行"].includes(item.status))).toBe(true);
    expect(report.filter((item) => item.status === "被真实材料缺口阻断").length).toBeGreaterThan(0);
    expect(report.every((item) => item.checks.length > 0)).toBe(true);
  });
});

describe("TASK-0821 POC 指标接入真实工作区", () => {
  it("指标会随匹配关系和人工业务动作实时变化", () => {
    useDemoStore.getState().loadScenario("SC-08");

    expect(getPocMetrics(useDemoStore.getState())).toMatchObject({
      activeRelationCount: 0,
      manualActionCount: 0,
      matchCoverage: 0,
    });

    useDemoStore.getState().matchSelectedDraft();
    expect(getPocMetrics(useDemoStore.getState())).toMatchObject({
      activeRelationCount: 2,
      manualActionCount: 0,
      matchCoverage: 100,
    });

    const line = useDemoStore.getState().drafts[0].lines[0];
    useDemoStore.getState().editSelectedLineField(line.id, "产地", "人工确认产地");
    expect(getPocMetrics(useDemoStore.getState()).manualActionCount).toBe(1);
  });

  it("四阶段耗时只累计真实运行区间，不用动作数估算", () => {
    useDemoStore.setState({ pocPhaseTimings: [{ phase: "查找", elapsedMs: 5000, startedAt: "2026-09-20T00:00:00.000Z" }, { phase: "检查", elapsedMs: 3000, startedAt: null }, { phase: "修改", elapsedMs: 0, startedAt: null }, { phase: "返工", elapsedMs: 0, startedAt: null }] });
    const metrics = getPocMetrics(useDemoStore.getState(), new Date("2026-09-20T00:00:07.000Z").getTime());
    expect(metrics.phaseMetrics.find((item) => item.phase === "查找")).toMatchObject({ activeSeconds: 12, running: true });
    expect(metrics.phaseMetrics.find((item) => item.phase === "检查")).toMatchObject({ activeSeconds: 3, running: false });
  });
});

describe("TASK-0901 本地文件上传预检", () => {
  it("拒绝不支持格式和超过 20MB 的文件", () => {
    useDemoStore.getState().stageLocalFile({ name: "订单.txt", size: 100, type: "text/plain" });
    expect(useDemoStore.getState().toast).toBe("暂支持 PDF、Excel、JPG、PNG 文件");
    useDemoStore.getState().stageLocalFile({ name: "订单.pdf", size: 21 * 1024 * 1024, type: "application/pdf" });
    expect(useDemoStore.getState().toast).toBe("文件大小需大于 0 且不超过 20MB");
  });

  it("接收本地文件但在解析前不进入商品池", () => {
    const before = useDemoStore.getState().files.length;
    useDemoStore.getState().stageLocalFile({ name: "现场查货.pdf", size: 2048, type: "application/pdf" });
    const result = useDemoStore.getState();
    const file = result.files.find((item) => item.name === "现场查货.pdf")!;
    expect(result.files).toHaveLength(before + 1);
    expect(file).toMatchObject({ source: "本地上传", uploadStatus: "待解析", loaded: false, materialType: "待识别" });
    expect(result.events[0]?.type).toBe("接收本地文件");
    result.ingestFile(file.id);
    expect(useDemoStore.getState().toast).toBe("本地文件已接收，等待解析后才能进入商品池");
  });
});

describe("页面返回上一页导航与历史记录栈", () => {
  it("记录页面切换并在调用 goBack 时按顺序返回上一页", () => {
    useDemoStore.setState(useDemoStore.getInitialState(), true);
    expect(useDemoStore.getState().view).toBe("home");
    expect(useDemoStore.getState().historyStack).toHaveLength(0);

    // 1. 进入客户详情
    useDemoStore.getState().setSelectedWorkspaceCustomerId("C-olt");
    expect(useDemoStore.getState().selectedWorkspaceCustomerId).toBe("C-olt");
    expect(useDemoStore.getState().historyStack).toHaveLength(1);

    // 2. 切换到商品池
    useDemoStore.getState().setView("pool");
    expect(useDemoStore.getState().view).toBe("pool");
    expect(useDemoStore.getState().historyStack).toHaveLength(2);

    // 3. 切换到委托草稿
    useDemoStore.getState().setView("drafts");
    expect(useDemoStore.getState().view).toBe("drafts");
    expect(useDemoStore.getState().historyStack).toHaveLength(3);

    // 4. 返回上一页 -> 回到商品池
    useDemoStore.getState().goBack();
    expect(useDemoStore.getState().view).toBe("pool");
    expect(useDemoStore.getState().historyStack).toHaveLength(2);

    // 5. 返回上一页 -> 回到客户详情页 (C-olt)
    useDemoStore.getState().goBack();
    expect(useDemoStore.getState().view).toBe("home");
    expect(useDemoStore.getState().selectedWorkspaceCustomerId).toBe("C-olt");
    expect(useDemoStore.getState().historyStack).toHaveLength(1);

    // 6. 返回上一页 -> 回到全客户首页
    useDemoStore.getState().goBack();
    expect(useDemoStore.getState().view).toBe("home");
    expect(useDemoStore.getState().selectedWorkspaceCustomerId).toBeNull();
    expect(useDemoStore.getState().historyStack).toHaveLength(0);

    // 7. 栈空时再次 goBack 保持在首页安全状态
    useDemoStore.getState().goBack();
    expect(useDemoStore.getState().view).toBe("home");
    expect(useDemoStore.getState().selectedWorkspaceCustomerId).toBeNull();
  });

  it("从草稿进入核对工作台后返回上一页能恢复前置视图和草稿状态", () => {
    useDemoStore.setState(useDemoStore.getInitialState(), true);
    useDemoStore.getState().setSelectedWorkspaceCustomerId("C-yk");
    const draftId = useDemoStore.getState().drafts[0].id;
    useDemoStore.getState().selectDraft(draftId);
    expect(useDemoStore.getState().view).toBe("workbench");
    expect(useDemoStore.getState().selectedDraftId).toBe(draftId);

    // 点击返回上一页回到客户工作台 C-yk
    useDemoStore.getState().goBack();
    expect(useDemoStore.getState().view).toBe("home");
    expect(useDemoStore.getState().selectedWorkspaceCustomerId).toBe("C-yk");
  });
});
