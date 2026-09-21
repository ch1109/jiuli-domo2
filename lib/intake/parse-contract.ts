import type { CustomerId, FileType, MaterialBatchId, MaterialType, SourceFileId } from "../domain/types";

/**
 * 真实文件接入的最小状态机。
 * 解析前只有文件元数据，不能生成逻辑查货单、商品行或匹配关系。
 */
export const PARSE_JOB_STATUSES = ["待解析", "解析中", "解析成功", "解析失败", "待人工复核"] as const;
export type ParseJobStatus = (typeof PARSE_JOB_STATUSES)[number];

export interface ParseJob {
  readonly id: string;
  readonly sourceFileId: SourceFileId;
  readonly status: ParseJobStatus;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly reviewReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ParseRequest {
  readonly jobId: string;
  readonly sourceFileId: SourceFileId;
  readonly fileName: string;
  readonly fileType: FileType;
  readonly materialType: MaterialType | null;
  readonly customerId: CustomerId | null;
}

export interface ParsedMaterialResult {
  readonly jobId: string;
  readonly sourceFileId: SourceFileId;
  readonly contentSha256: string;
  readonly batchId: MaterialBatchId;
  readonly materialType: MaterialType;
  readonly customerId: CustomerId | null;
  readonly customerResolution: "已识别" | "待补客户信息";
  readonly factCount: number;
  readonly sourceLocations: readonly string[];
  readonly parsedAt: string;
}

export interface ParsedSourceLocation {
  readonly page: number | null;
  readonly sheet: string | null;
  readonly row: number | null;
  readonly position: string | null;
}

export interface ParsedFactRow {
  readonly id: string;
  readonly fields: Readonly<Record<string, string | null>>;
  readonly sourceLocation: ParsedSourceLocation;
  readonly confidence: number | null;
  readonly warnings: readonly string[];
}

export interface ParseAdapterInput {
  readonly sourceFileId: SourceFileId;
  readonly fileName: string;
  readonly fileType: FileType;
  readonly materialType: MaterialType | null;
  readonly customerId: CustomerId | null;
  readonly contentSha256: string;
  readonly content: Uint8Array;
}

export interface ParseAdapterResult {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceFileId: SourceFileId;
  readonly contentSha256: string;
  readonly materialType: MaterialType | null;
  readonly customerId: CustomerId | null;
  readonly customerResolution: "已识别" | "待补客户信息";
  readonly facts: readonly ParsedFactRow[];
  readonly warnings: readonly string[];
}

export type ParseAdapterErrorCode = "UNSUPPORTED_FILE_TYPE" | "CONTENT_CHANGED" | "ADAPTER_FAILED" | "INVALID_RESULT";

export class ParseAdapterError extends Error {
  readonly code: ParseAdapterErrorCode;

  constructor(code: ParseAdapterErrorCode, message: string) {
    super(message);
    this.name = "ParseAdapterError";
    this.code = code;
  }
}

export interface MaterialParserAdapter {
  readonly id: string;
  readonly version: string;
  supports(input: ParseAdapterInput): boolean;
  parse(input: ParseAdapterInput): Promise<ParseAdapterResult>;
}

export function createParseIdempotencyKey(input: Pick<ParseAdapterInput, "sourceFileId" | "contentSha256">, adapter: Pick<MaterialParserAdapter, "id" | "version">): string {
  return [input.sourceFileId, input.contentSha256, adapter.id, adapter.version].join(":");
}

function validateAdapterResult(input: ParseAdapterInput, adapter: MaterialParserAdapter, result: ParseAdapterResult): ParseAdapterResult {
  if (result.adapterId !== adapter.id || result.adapterVersion !== adapter.version || result.sourceFileId !== input.sourceFileId) {
    throw new ParseAdapterError("INVALID_RESULT", "解析器返回的任务或版本信息不一致");
  }
  if (result.contentSha256 !== input.contentSha256) {
    throw new ParseAdapterError("CONTENT_CHANGED", "解析结果对应的文件内容指纹已变化");
  }
  const factIds = new Set<string>();
  for (const fact of result.facts) {
    if (!fact.id || factIds.has(fact.id) || !fact.sourceLocation) {
      throw new ParseAdapterError("INVALID_RESULT", "解析事实缺少唯一标识或来源位置");
    }
    factIds.add(fact.id);
  }
  return result;
}

export function createCachedParser(adapter: MaterialParserAdapter, cache = new Map<string, ParseAdapterResult>()) {
  return {
    async parse(input: ParseAdapterInput): Promise<ParseAdapterResult> {
      if (!adapter.supports(input)) {
        throw new ParseAdapterError("UNSUPPORTED_FILE_TYPE", `解析器 ${adapter.id} 不支持 ${input.fileType}`);
      }
      const key = createParseIdempotencyKey(input, adapter);
      const cached = cache.get(key);
      if (cached) return cached;
      let result: ParseAdapterResult;
      try {
        result = await adapter.parse(input);
      } catch (error) {
        if (error instanceof ParseAdapterError) throw error;
        throw new ParseAdapterError("ADAPTER_FAILED", error instanceof Error ? error.message : "解析器执行失败");
      }
      const validated = validateAdapterResult(input, adapter, result);
      cache.set(key, validated);
      return validated;
    },
    cache,
  };
}

export function createParseJob(input: { id: string; sourceFileId: SourceFileId; now: string }): ParseJob {
  return {
    id: input.id,
    sourceFileId: input.sourceFileId,
    status: "待解析",
    attempt: 0,
    errorCode: null,
    errorMessage: null,
    reviewReason: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function startParseJob(job: ParseJob, now: string): ParseJob {
  if (job.status !== "待解析" && job.status !== "解析失败") {
    throw new Error("只有待解析或解析失败的任务可以启动");
  }
  return { ...job, status: "解析中", attempt: job.attempt + 1, errorCode: null, errorMessage: null, reviewReason: null, updatedAt: now };
}

export function failParseJob(job: ParseJob, input: { now: string; code: string; message: string }): ParseJob {
  if (job.status !== "解析中") throw new Error("只有解析中的任务可以记录失败");
  return { ...job, status: "解析失败", errorCode: input.code, errorMessage: input.message, updatedAt: input.now };
}

export function completeParseJob(job: ParseJob, now: string): ParseJob {
  if (job.status !== "解析中") throw new Error("只有解析中的任务可以完成");
  return { ...job, status: "解析成功", errorCode: null, errorMessage: null, reviewReason: null, updatedAt: now };
}

export function flagParseJobForReview(job: ParseJob, reason: string, now: string): ParseJob {
  if (job.status !== "解析中") throw new Error("只有解析中的任务可以进入人工复核");
  if (!reason.trim()) throw new Error("人工复核必须记录原因");
  return { ...job, status: "待人工复核", reviewReason: reason.trim(), errorCode: null, errorMessage: null, updatedAt: now };
}

export function resolveParseReview(job: ParseJob, now: string): ParseJob {
  if (job.status !== "待人工复核") throw new Error("只有待人工复核的任务可以继续");
  return { ...job, status: "解析失败", reviewReason: null, errorCode: "REVIEW_REQUIRED_RETRY", errorMessage: "人工复核后需要重新解析", updatedAt: now };
}

export function canEnterProductPool(job: ParseJob, result: ParsedMaterialResult | null): boolean {
  return job.status === "解析成功" && result !== null && result.jobId === job.id && result.factCount > 0 && result.customerId !== null && result.customerResolution === "已识别";
}
