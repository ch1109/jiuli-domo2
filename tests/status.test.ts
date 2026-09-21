import { describe, expect, it } from "vitest";
import {
  deriveDraftStatus,
  deriveEntrustmentLineStatus,
  deriveInspectionSourceLineStatus,
} from "../lib/domain/status";

describe("三套业务状态推导", () => {
  it("委托商品行按依据、问题和人工结果推导", () => {
    expect(
      deriveEntrustmentLineStatus({
        activeMatchRelationCount: 0,
        hasBlockingIssue: false,
        awaitingCandidateSelection: false,
        manuallyConfirmed: false,
      }),
    ).toBe("暂无查货依据");

    expect(
      deriveEntrustmentLineStatus({
        activeMatchRelationCount: 1,
        hasBlockingIssue: false,
        awaitingCandidateSelection: false,
        manuallyConfirmed: false,
      }),
    ).toBe("已找到查货依据");

    expect(
      deriveEntrustmentLineStatus({
        activeMatchRelationCount: 1,
        hasBlockingIssue: true,
        awaitingCandidateSelection: false,
        manuallyConfirmed: false,
      }),
    ).toBe("待人工处理");

    expect(
      deriveEntrustmentLineStatus({
        activeMatchRelationCount: 0,
        hasBlockingIssue: false,
        awaitingCandidateSelection: true,
        manuallyConfirmed: false,
      }),
    ).toBe("待人工处理");

    expect(
      deriveEntrustmentLineStatus({
        activeMatchRelationCount: 1,
        hasBlockingIssue: true,
        awaitingCandidateSelection: true,
        manuallyConfirmed: true,
      }),
    ).toBe("人工已确认");
  });

  it("委托书草稿按客户、行依据和确认阶段推导", () => {
    expect(
      deriveDraftStatus({
        customerId: null,
        lineStatuses: ["已找到查货依据"],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("待核对");

    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["暂无查货依据", "已找到查货依据"],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("部分核对");

    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["已找到查货依据", "待人工处理"],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("部分核对");

    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["已找到查货依据"],
        submittedForManualConfirmation: true,
        isFinalized: false,
      }),
    ).toBe("人工确认中");
  });

  it("已完成草稿不可回退，空草稿没有依据时保持待核对", () => {
    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["暂无查货依据"],
        submittedForManualConfirmation: false,
        isFinalized: true,
        currentStatus: "已完成",
      }),
    ).toBe("已完成");

    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: [],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("待核对");
  });

  it("待人工处理不等于已有查货依据，字段冲突但已有关系仍算部分核对", () => {
    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["待人工处理"],
        activeMatchRelationCounts: [0],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("待核对");

    expect(
      deriveDraftStatus({
        customerId: "C-001",
        lineStatuses: ["待人工处理"],
        activeMatchRelationCounts: [1],
        submittedForManualConfirmation: false,
        isFinalized: false,
      }),
    ).toBe("可提交人工确认");
  });

  it("查货原始行的核销优先，AI 匹配本身只形成草稿占用", () => {
    expect(
      deriveInspectionSourceLineStatus({
        hasActiveDraftOccupation: false,
        isWrittenOff: false,
      }),
    ).toBe("可匹配");

    expect(
      deriveInspectionSourceLineStatus({
        hasActiveDraftOccupation: true,
        isWrittenOff: false,
      }),
    ).toBe("草稿占用");

    expect(
      deriveInspectionSourceLineStatus({
        hasActiveDraftOccupation: true,
        isWrittenOff: true,
      }),
    ).toBe("已核销");
  });
});
