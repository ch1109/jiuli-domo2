import {
  FINAL_OUTPUT_FIELDS,
  FINAL_OUTPUT_TOTAL_FIELDS,
  type FieldValue,
  type FinalOutputField,
  type FinalOutputRow,
} from "./types";

export type FinalOutputFieldRequirement = "必填" | "选填" | "随模板";

/** 25 列各自的来源要求，页面和导出逻辑共用这份规则。 */
export const FINAL_OUTPUT_FIELD_REQUIREMENTS = {
  客户名: "必填",
  品牌: "必填",
  型号: "必填",
  商品描述: "选填",
  品名: "必填",
  产地: "必填",
  单位: "必填",
  数量: "必填",
  报关单价: "必填",
  总价: "必填",
  币种: "必填",
  件数: "必填",
  净重: "必填",
  毛重: "必填",
  sku: "随模板",
  对应的采购: "随模板",
  供应商号码: "随模板",
  供应商: "随模板",
  期票天数: "随模板",
  采购订单号: "随模板",
  物料号码: "随模板",
  托盘数: "随模板",
  入仓号: "随模板",
  产线: "随模板",
  备注: "选填",
} as const satisfies Record<FinalOutputField, FinalOutputFieldRequirement>;

export type FinalOutputValidationIssueCode =
  | "缺少列"
  | "多余列"
  | "列顺序错误"
  | "必填值缺失";

export interface FinalOutputValidationIssue {
  readonly code: FinalOutputValidationIssueCode;
  readonly field: string | null;
  readonly message: string;
}

export type FinalOutputTotals = Readonly<Pick<FinalOutputRow, (typeof FINAL_OUTPUT_TOTAL_FIELDS)[number]>>;

const UNKNOWN = "UNKNOWN";
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

interface ParsedDecimal {
  readonly unscaled: bigint;
  readonly scale: number;
}

function parseDecimal(value: FieldValue): ParsedDecimal | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized === UNKNOWN || !DECIMAL_PATTERN.test(normalized)) return null;

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "") || "0";

  return {
    unscaled: BigInt(`${negative ? "-" : ""}${digits}`),
    scale: fractionPart.length,
  };
}

function formatDecimal(unscaled: bigint, scale: number): string {
  const negative = unscaled < BigInt(0);
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;

  const splitAt = digits.length - scale;
  return `${negative ? "-" : ""}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
}

function sumField(rows: readonly FinalOutputRow[], field: FinalOutputField): FieldValue {
  const values = rows.map((row) => row[field]);
  if (values.length === 0) return "0";

  const parsed = values.map(parseDecimal);
  if (parsed.some((value) => value === null)) return UNKNOWN;

  const decimals = parsed as ParsedDecimal[];
  const scale = Math.max(...decimals.map((value) => value.scale));
  const total = decimals.reduce(
    (sum, value) => sum + value.unscaled * BigInt(10) ** BigInt(scale - value.scale),
    BigInt(0),
  );

  return formatDecimal(total, scale);
}

/** 将部分字段投影成完整 25 列；没有来源时保持空值，不猜测、不补 0。 */
export function createFinalOutputRow(
  values: Partial<Record<FinalOutputField, FieldValue>>,
): FinalOutputRow {
  const row = {} as Record<FinalOutputField, FieldValue>;
  for (const field of FINAL_OUTPUT_FIELDS) {
    row[field] = values[field] ?? null;
  }
  return row;
}

/** 返回可直接按模板写出的 25 列值，顺序永远由契约决定。 */
export function serializeFinalOutputRow(row: FinalOutputRow): readonly FieldValue[] {
  return FINAL_OUTPUT_FIELDS.map((field) => row[field]);
}

/** 校验列集合、列顺序和必填值；选填/随模板为空不产生必填错误。 */
export function validateFinalOutputRow(
  row: Readonly<Record<string, FieldValue | undefined>>,
): readonly FinalOutputValidationIssue[] {
  const actualFields = Object.keys(row);
  const expectedFields = [...FINAL_OUTPUT_FIELDS];
  const issues: FinalOutputValidationIssue[] = [];
  const expectedSet = new Set<string>(expectedFields);

  for (const field of expectedFields) {
    if (!(field in row)) {
      issues.push({ code: "缺少列", field, message: `缺少最终输出列：${field}` });
    }
  }

  for (const field of actualFields) {
    if (!expectedSet.has(field)) {
      issues.push({ code: "多余列", field, message: `存在未定义的最终输出列：${field}` });
    }
  }

  const knownActualFields = actualFields.filter((field) => expectedSet.has(field));
  if (
    knownActualFields.length === expectedFields.length &&
    knownActualFields.some((field, index) => field !== expectedFields[index])
  ) {
    issues.push({ code: "列顺序错误", field: null, message: "最终输出列顺序必须严格跟随模板" });
  }

  for (const field of FINAL_OUTPUT_FIELDS) {
    if (FINAL_OUTPUT_FIELD_REQUIREMENTS[field] !== "必填") continue;
    const value = row[field];
    if (value === undefined || value === null || value.trim() === "" || value.trim().toUpperCase() === UNKNOWN) {
      issues.push({ code: "必填值缺失", field, message: `必填字段缺失：${field}` });
    }
  }

  return issues;
}

/** 精确计算数量、件数、净重、毛重；任一组成值未知时保留 UNKNOWN。 */
export function calculateFinalOutputTotals(rows: readonly FinalOutputRow[]): FinalOutputTotals {
  return {
    数量: sumField(rows, "数量"),
    件数: sumField(rows, "件数"),
    净重: sumField(rows, "净重"),
    毛重: sumField(rows, "毛重"),
  };
}
