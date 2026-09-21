import { describe, expect, it } from "vitest";
import { canEnterProductPool, completeParseJob, createCachedParser, createParseIdempotencyKey, createParseJob, failParseJob, flagParseJobForReview, ParseAdapterError, resolveParseReview, startParseJob } from "../lib/intake/parse-contract";
import { fixtureTextPdfAdapter, textPdfFixtureInput } from "./fixtures/parse-fixtures";

describe("TASK-0902 解析适配契约", () => {
  it("解析任务按待解析→解析中→成功流转，成功前不能进入商品池", () => {
    const created = createParseJob({ id: "JOB-1", sourceFileId: "FILE-1", now: "2026-09-18T00:00:00Z" });
    expect(canEnterProductPool(created, null)).toBe(false);
    const running = startParseJob(created, "2026-09-18T00:01:00Z");
    expect(canEnterProductPool(running, null)).toBe(false);
    const completed = completeParseJob(running, "2026-09-18T00:02:00Z");
    expect(canEnterProductPool(completed, { jobId: "JOB-1", sourceFileId: "FILE-1", contentSha256: "sha256-file-1", batchId: "B-1", materialType: "查货", customerId: null, customerResolution: "待补客户信息", factCount: 1, sourceLocations: ["第1页"], parsedAt: "2026-09-18T00:02:00Z" })).toBe(false);
    expect(canEnterProductPool(completed, { jobId: "JOB-1", sourceFileId: "FILE-1", contentSha256: "sha256-file-1", batchId: "B-1", materialType: "查货", customerId: "C-1", customerResolution: "已识别", factCount: 1, sourceLocations: ["第1页"], parsedAt: "2026-09-18T00:02:00Z" })).toBe(true);
  });

  it("解析失败可重试，但失败状态不产生事实行", () => {
    const created = createParseJob({ id: "JOB-2", sourceFileId: "FILE-2", now: "2026-09-18T00:00:00Z" });
    const failed = failParseJob(startParseJob(created, "2026-09-18T00:01:00Z"), { now: "2026-09-18T00:02:00Z", code: "OCR_TIMEOUT", message: "解析服务超时" });
    expect(failed).toMatchObject({ status: "解析失败", attempt: 1, errorCode: "OCR_TIMEOUT" });
    expect(canEnterProductPool(failed, null)).toBe(false);
    expect(startParseJob(failed, "2026-09-18T00:03:00Z").attempt).toBe(2);
  });

  it("解析适配器保留来源位置，并以文件指纹和适配器版本幂等", async () => {
    const parser = createCachedParser(fixtureTextPdfAdapter);
    const first = await parser.parse(textPdfFixtureInput);
    const second = await parser.parse(textPdfFixtureInput);

    expect(first).toBe(second);
    expect(first.facts[0]).toMatchObject({ id: "FACT-FIXTURE-001", sourceLocation: { page: 1, position: "表格第1行" } });
    expect(createParseIdempotencyKey(textPdfFixtureInput, fixtureTextPdfAdapter)).toBe("FILE-FIXTURE-PDF:sha256-fixture-pdf:fixture-text-pdf:0.1.0");
    expect(parser.cache.size).toBe(1);
  });

  it("不支持的格式、内容指纹变化和重复事实会被拒绝", async () => {
    const parser = createCachedParser(fixtureTextPdfAdapter);
    await expect(parser.parse({ ...textPdfFixtureInput, fileType: "xlsx" })).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" } satisfies Partial<ParseAdapterError>);
    await expect(parser.parse({ ...textPdfFixtureInput, contentSha256: "sha256-changed" })).rejects.toMatchObject({ code: "CONTENT_CHANGED" } satisfies Partial<ParseAdapterError>);
  });

  it("扫描件或低置信度结果必须进入人工复核，复核后只能重新解析", () => {
    const created = createParseJob({ id: "JOB-3", sourceFileId: "FILE-3", now: "2026-09-18T00:00:00Z" });
    const review = flagParseJobForReview(startParseJob(created, "2026-09-18T00:01:00Z"), "PDF 无文本，需要人工确认客户和商品行", "2026-09-18T00:02:00Z");
    expect(review).toMatchObject({ status: "待人工复核", reviewReason: "PDF 无文本，需要人工确认客户和商品行" });
    expect(canEnterProductPool(review, null)).toBe(false);
    const retryable = resolveParseReview(review, "2026-09-18T00:03:00Z");
    expect(retryable).toMatchObject({ status: "解析失败", errorCode: "REVIEW_REQUIRED_RETRY" });
    expect(startParseJob(retryable, "2026-09-18T00:04:00Z").attempt).toBe(2);
  });
});
