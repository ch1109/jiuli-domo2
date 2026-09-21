import type { MaterialParserAdapter, ParseAdapterInput, ParseAdapterResult } from "../../lib/intake/parse-contract";

export const textPdfFixtureInput: ParseAdapterInput = {
  sourceFileId: "FILE-FIXTURE-PDF",
  fileName: "fixture-inspection.pdf",
  fileType: "pdf",
  materialType: "查货",
  customerId: "C-FIXTURE",
  contentSha256: "sha256-fixture-pdf",
  content: new TextEncoder().encode("fixture only; not a production parser"),
};

export const textPdfFixtureResult: ParseAdapterResult = {
  adapterId: "fixture-text-pdf",
  adapterVersion: "0.1.0",
  sourceFileId: textPdfFixtureInput.sourceFileId,
  contentSha256: textPdfFixtureInput.contentSha256,
  materialType: "查货",
  customerId: "C-FIXTURE",
  customerResolution: "已识别",
  warnings: [],
  facts: [{
    id: "FACT-FIXTURE-001",
    fields: { 品牌: "FIXTURE", 型号: "MODEL-001", 产地: "UNKNOWN", 数量: "2" },
    sourceLocation: { page: 1, sheet: null, row: null, position: "表格第1行" },
    confidence: null,
    warnings: ["仅用于解析适配器契约测试"],
  }],
};

export const fixtureTextPdfAdapter: MaterialParserAdapter = {
  id: "fixture-text-pdf",
  version: "0.1.0",
  supports: (input) => input.fileType === "pdf",
  parse: async (): Promise<ParseAdapterResult> => textPdfFixtureResult,
};
