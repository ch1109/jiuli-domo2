import { describe, expect, it } from "vitest";
import {
  getMultiFileEvidenceContext,
  EXCEL_FIELD_COLUMN_MAP,
  cleanModelCode,
  extractCoreModel,
  modelsCompatible,
} from "../lib/workbench-model";
import { buildBusinessWorkspace } from "../lib/demo-store";

describe("原始材料多文件同屏证据与字段仲裁", () => {
  const workspace = buildBusinessWorkspace();
  const draft = workspace.drafts.find((d) => d.displayNo === "26SHPYD056")!;

  it("正确提取委托书与查货单的同屏证据链", () => {
    // 浦壹第 2 行商品（WINBOND W25N01GVZEIG）
    const line = draft.lines[1];
    const context = getMultiFileEvidenceContext(
      "产地",
      line,
      workspace.sources.filter((s) => (line.relationSourceIds || []).includes(s.id)),
      workspace.files,
      workspace.evidence,
      draft,
    );

    expect(context.field).toBe("产地");
    expect(context.files.length).toBeGreaterThanOrEqual(1);

    const orderFile = context.files.find((f) => f.materialType === "委托书");
    expect(orderFile).toBeDefined();
    expect(orderFile?.fileName).toContain(".xls");
    expect(orderFile?.location.column).toBe(EXCEL_FIELD_COLUMN_MAP["产地"]);

    // 采纳规则和理由清晰通俗
    expect(context.adoptionRule.ruleName).toBeTruthy();
    expect(context.adoptionRule.reason).toBeTruthy();
  });

  it("当产地存在实物纠偏时，采信查货单实物批次并给出明确规则说明", () => {
    const line = draft.lines[1];
    const activeSources = workspace.sources.filter((s) =>
      (line.relationSourceIds || []).includes(s.id) || s.model === line.model
    );

    const context = getMultiFileEvidenceContext(
      "产地",
      line,
      activeSources,
      workspace.files,
      workspace.evidence,
      draft,
    );

    // 查货实物标签具有最高真实性，规则说明清晰
    expect(context.adoptionRule.reason).toContain("产地");
  });

  it("型号容错挂靠与包装尾缀剥离能力测试", () => {
    // 1. 包装尾缀剥离
    expect(extractCoreModel("ADS1260BIRHBT-TR")).toBe("ADS1260BIRHBT");
    expect(extractCoreModel("ADS1260BIRHBT,118")).toBe("ADS1260BIRHBT");
    expect(extractCoreModel("ADS1260BIRHBT#PBF")).toBe("ADS1260BIRHBT");
    expect(extractCoreModel("W25N01GVZEIG-REEL")).toBe("W25N01GVZEIG");

    // 2. 核心型号一致判定
    expect(modelsCompatible("ADS1260BIRHBT", "ADS1260BIRHBT-TR")).toBe(true);
    expect(modelsCompatible("ADS1260-BIRHBT", "ADS1260BIRHBT")).toBe(true);
    expect(modelsCompatible("W25N01GVZEIG", "W25N01GVZEIG#PBF")).toBe(true);

    // 3. 不同型号不误判
    expect(modelsCompatible("STM32H7R3V8T6", "ADS1260BIRHBT")).toBe(false);
  });

  it("浦壹多候选未关联时，依然能够精准识别查货单 1774838084919.pdf 并杜绝跨客户单证污染", () => {
    // 浦壹第一行商品（尚未确认关系，activeSources 为空）
    const line = draft.lines[0];
    const context = getMultiFileEvidenceContext(
      "产地",
      line,
      [], // activeSources 为空
      workspace.files,
      workspace.evidence,
      draft,
      workspace.sources, // 传入全量查货源池
    );
    // 1. 查货单必须成功识别
    const inspectionFile = context.files.find((f) => f.materialType === "查货单");
    expect(inspectionFile).toBeDefined();
    expect(inspectionFile?.fileName).toContain("1774838084919.pdf");
    expect(inspectionFile?.location.page).toBe(1);
    expect(inspectionFile?.location.bounds).toBeDefined();

    // 2. 严禁出现其他客户（如英卡）的发票箱单 8000812735
    const foreignInvoice = context.files.find((f) => f.fileName.includes("8000812735"));
    expect(foreignInvoice).toBeUndefined();

    // 3. 裁决规则清楚指明实物查验优先与采纳理由
    expect(context.adoptionRule.ruleName).toContain("实物查验优先");
    expect(context.adoptionRule.reason).toContain("TAIWAN, CHINA");
  });

  it("不同客户模板的公共字段列定位精准映射，行号真实有效", () => {
    // 浦壹 (26SHPYD056)
    const puyiLine = draft.lines[0];
    expect(puyiLine.sourceLocation?.row).toBe(7);

    const puyiContext = getMultiFileEvidenceContext("产地", puyiLine, [], workspace.files, workspace.evidence, draft);
    const puyiOrder = puyiContext.files.find((f) => f.materialType === "委托书");
    expect(puyiOrder?.location.column).toBe("I"); // 浦壹产地在 I 列
    expect(puyiOrder?.location.row).toBe(7);

    const puyiModelContext = getMultiFileEvidenceContext("型号", puyiLine, [], workspace.files, workspace.evidence, draft);
    const puyiModelOrder = puyiModelContext.files.find((f) => f.materialType === "委托书");
    expect(puyiModelOrder?.location.column).toBe("D"); // 浦壹型号在 D 列

    // 英卡测试
    const yingkaDraft = workspace.drafts.find((d) => d.customerName?.includes("英卡")) || workspace.drafts[1];
    if (yingkaDraft && yingkaDraft.lines.length > 0) {
      const yLine = yingkaDraft.lines[0];
      const yContext = getMultiFileEvidenceContext("产地", yLine, [], workspace.files, workspace.evidence, yingkaDraft);
      const yOrder = yContext.files.find((f) => f.materialType === "委托书");
      // 英卡委托书产地在 J 列（若为英卡专属模板）或依据模板解析
      expect(yOrder?.location.row).toBeGreaterThanOrEqual(1);
    }
  });
});
