import type {
  FieldValue,
  InspectionMergeField,
  InspectionMergedProduct,
  InspectionSourceFields,
  InspectionSourceLine,
  InspectionSourceLineId,
  IsoDateTime,
} from "./types";

const UNKNOWN = "UNKNOWN";
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const MERGE_KEY_FIELDS = ["品牌", "型号", "产地"] as const;
const SUM_FIELDS = ["数量", "净重", "毛重"] as const;


interface ParsedDecimal {
  readonly unscaled: bigint;
  readonly scale: number;
}

export interface InspectionMergeOptions {
  readonly now?: IsoDateTime;
  readonly createId?: (sourceLineIds: readonly InspectionSourceLineId[], groupIndex: number) => string;
}

function isKnownMergeKey(value: FieldValue): value is string {
  return value !== null && value.trim() !== "" && value !== UNKNOWN;
}

function parseDecimal(value: FieldValue): ParsedDecimal | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) return null;

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

function sumDecimalValues(values: readonly FieldValue[]): FieldValue {
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

function distinctValues(values: readonly FieldValue[]): FieldValue[] {
  return [...new Set(values)];
}

function mergeNonSummedField(
  field: InspectionMergeField,
  sourceLines: readonly InspectionSourceLine[],
  conflictingFields: Partial<Record<InspectionMergeField, readonly FieldValue[]>>,
  warnings: string[],
): FieldValue {
  const values = distinctValues(sourceLines.map((line) => line.fields[field]));
  if (values.length === 1) return values[0];

  conflictingFields[field] = values;
  warnings.push(`${field}存在多值，待人工处理`);
  return UNKNOWN;
}

function mergeOtherFields(
  sourceLines: readonly InspectionSourceLine[],
  warnings: string[],
): {
  readonly values: Readonly<Record<string, FieldValue>>;
  readonly conflicts: Readonly<Record<string, readonly FieldValue[]>>;
} {
  const fieldNames = new Set(sourceLines.flatMap((line) => Object.keys(line.otherFields)));
  const values: Record<string, FieldValue> = {};
  const conflicts: Record<string, readonly FieldValue[]> = {};

  for (const fieldName of fieldNames) {
    const fieldValues = distinctValues(sourceLines.map((line) => line.otherFields[fieldName] ?? null));
    if (fieldValues.length === 1) {
      values[fieldName] = fieldValues[0];
      continue;
    }

    values[fieldName] = UNKNOWN;
    conflicts[fieldName] = fieldValues;
    warnings.push(`${fieldName}存在多值，待人工处理`);
  }

  return { values, conflicts };
}

function buildGroupKey(line: InspectionSourceLine, canMergeByKey: boolean): string {
  const { 品牌, 型号, 产地 } = line.fields;
  const base = [line.logicalInspectionOrderId, line.customerId ?? "UNKNOWN", 品牌, 型号, 产地].join("\u0000");
  return canMergeByKey ? base : `${base}\u0000${line.id}`;
}

function createDefaultId(sourceLineIds: readonly InspectionSourceLineId[]): string {
  return `G-${sourceLineIds.join("~")}`;
}

/**
 * 在同一逻辑查货单内按品牌、型号、产地合并查货原始行。
 * 原始行永远只读保留，返回值仅是合并展示对象。
 */
export function mergeInspectionSourceLines(
  sourceLines: readonly InspectionSourceLine[],
  options: InspectionMergeOptions = {},
): InspectionMergedProduct[] {
  const groups = new Map<string, InspectionSourceLine[]>();

  for (const sourceLine of sourceLines) {
    const canMergeByKey = MERGE_KEY_FIELDS.every((field) => isKnownMergeKey(sourceLine.fields[field]));
    const key = buildGroupKey(sourceLine, canMergeByKey);
    const group = groups.get(key);
    if (group) group.push(sourceLine);
    else groups.set(key, [sourceLine]);
  }

  const now = options.now ?? new Date().toISOString();

  return [...groups.values()].map((group, groupIndex) => {
    const first = group[0];
    const conflictingFields: Partial<Record<InspectionMergeField, readonly FieldValue[]>> = {};
    const warnings: string[] = [];
    const fields = {
      品牌: first.fields.品牌,
      型号: first.fields.型号,
      产地: first.fields.产地,
      数量: sumDecimalValues(group.map((line) => line.fields.数量)),
      单位: mergeNonSummedField("单位", group, conflictingFields, warnings),
      件数: mergeNonSummedField("件数", group, conflictingFields, warnings),
      净重: sumDecimalValues(group.map((line) => line.fields.净重)),
      毛重: sumDecimalValues(group.map((line) => line.fields.毛重)),
    } satisfies InspectionSourceFields;

    for (const field of SUM_FIELDS) {
      if (fields[field] === UNKNOWN) warnings.push(`${field}不可计算，合并结果不完整`);
    }

    const otherFields = mergeOtherFields(group, warnings);
    const sourceLineIds = group.map((line) => line.id);
    const id = options.createId?.(sourceLineIds, groupIndex) ?? createDefaultId(sourceLineIds);

    return {
      id,
      customerId: first.customerId,
      logicalInspectionOrderId: first.logicalInspectionOrderId,
      mergeKey: {
        品牌: first.fields.品牌,
        型号: first.fields.型号,
        产地: first.fields.产地,
      },
      fields,
      otherFields: otherFields.values,
      sourceLineIds,
      conflictingFields,
      conflictingOtherFields: otherFields.conflicts,
      aggregationWarnings: warnings,
      createdAt: now,
      updatedAt: now,
    } satisfies InspectionMergedProduct;
  });
}
