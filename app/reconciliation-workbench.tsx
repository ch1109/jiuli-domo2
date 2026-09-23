"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Info,
  Layers,
  LockKeyhole,
  RotateCcw,
  Search,
  Sparkles,
  Table,
  Upload,
  X,
} from "lucide-react";
import { useDemoStore, type UiDraft, type UiLine } from "@/lib/demo-store";
import {
  FINAL_OUTPUT_FIELDS,
  type FinalOutputField,
  type SourceLocation,
} from "@/lib/domain/types";
import {
  CORE_OUTPUT_FIELDS,
  getFieldRows,
  getLineReconStatus,
  type FieldRow,
  type LineReconStatus,
  type FieldCheckStatusType,
} from "@/lib/workbench-model";
import { getTaskSummary } from "@/lib/workspace-status";
import { calculateFinalOutputTotals } from "@/lib/domain/final-output";
import {
  buildFinalReconciliationCsv,
  finalReconciliationFileName,
} from "@/lib/final-reconciliation-csv";
import {
  evaluateDraftAgainstGt,
  parseBuiltinReference,
  type EvaluationReport,
  type StandardAnswerSheet,
} from "@/lib/domain/evaluation-engine";
import { MaterialPreview } from "./material-preview";
import { LineActions } from "./workbench-relations";
import * as XLSX from "xlsx";
import "./workbench.css";

const value = (v: string | null | undefined) => v || "—";
const short = (id: string) => id.split("-").at(-1);

export function ReconciliationWorkbench({
  draft,
}: {
  draft: UiDraft | undefined;
}) {
  const state = useDemoStore();

  // 1. 每行商品字段解析映射
  const rowsByLine = useMemo(
    () =>
      new Map(
        draft?.lines.map((line) => [
          line.id,
          getFieldRows(line, state.evidence),
        ]),
      ),
    [draft, state.evidence],
  );

  // 2. 每行商品综合核对状态映射
  const lineStatuses = useMemo(() => {
    if (!draft) return new Map<string, LineReconStatus>();
    return new Map(
      draft.lines.map((l) => [
        l.id,
        getLineReconStatus(l, rowsByLine.get(l.id) ?? [], state.sources),
      ]),
    );
  }, [draft, rowsByLine, state.sources]);

  // 3. UI 交互状态
  const [lineId, setLineId] = useState(draft?.lines[0]?.id ?? "");
  const [field, setField] = useState<FinalOutputField | null>("型号");
  const [fieldMode, setFieldMode] = useState<"CORE" | "ALL">("ALL"); // 默认直接展示全部25字段
  const [lineNavFilter, setLineNavFilter] = useState<
    "ALL" | "VERIFIED_OK" | "NEEDS_CONFIRM" | "NO_INSPECTION" | "CONFIRMED"
  >("ALL");
  const [draftTableFilter, setDraftTableFilter] = useState<
    "ALL" | "PROBLEMS_ONLY" | "UNCONFIRMED_ONLY" | "MISMATCH_ONLY" | "MISSING_ONLY" | "AI_FALSE_POSITIVE"
  >("ALL");
  const [problemFilter, setProblemFilter] = useState<"ALL" | "RELATION" | "CONFLICT" | "MISSING">("ALL");

  // 右侧 Tab：字段来源 / 商品对应 / 原始材料 / AI记录
  const [rightTab, setRightTab] = useState<
    "RAW_MATERIAL" | "FIELD_SOURCE" | "RELATION" | "AI_LOG"
  >("FIELD_SOURCE");

  // 右侧溯源面板拖拽缩放宽度（支持向左拖拽放大）
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(400);
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRightPanel(true);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      // 向左拖拽 (ev.clientX < startX) 时，delta > 0，右侧面板变宽
      const delta = startX - ev.clientX;
      const minW = 340;
      const maxW = Math.max(minW, Math.min(window.innerWidth - 480, 960));
      const targetW = Math.max(minW, Math.min(maxW, startWidth + delta));
      setRightPanelWidth(targetW);
    };

    const handleMouseUp = () => {
      setIsDraggingRightPanel(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 顶部任务切换面板
  const [taskSwitcherOpen, setTaskSwitcherOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskQueueFilter, setTaskQueueFilter] = useState<"MY_TODO" | "ALL" | "WAITING" | "MANUAL">("MY_TODO");

  // 表格横向滚动控制
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const scrollTable = (offset: number) => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  // 评测模式 (Demo / POC)
  const isEvaluationMode = state.isEvaluationMode;
  const setEvaluationMode = state.setEvaluationMode;
  const [customGtSheet, setCustomGtSheet] = useState<StandardAnswerSheet | null>(
    null,
  );
  const [evaluationReport, setEvaluationReport] = useState<EvaluationReport | null>(
    null,
  );

  // 历史版本抽屉
  const [historyOpen, setHistoryOpen] = useState(false);

  // 结案核销确认弹窗与条件面板
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showChecklistPopover, setShowChecklistPopover] = useState(false);
  const [writeoffFeedbackOpen, setWriteoffFeedbackOpen] = useState(false);

  // 快捷编辑气泡
  const [quickEditField, setQuickEditField] = useState<{
    lineId: string;
    field: FinalOutputField;
  } | null>(null);

  // 移动端抽屉
  const [mobileDrawer, setMobileDrawer] = useState<"left" | "right" | null>(
    null,
  );

  // 原材料预览联动状态
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    location: SourceLocation;
    name: string;
    key: string;
  } | null>(null);

  // 4. 初始化评测标准答案 (评测模式)
  useEffect(() => {
    if (isEvaluationMode && draft) {
      const gt = customGtSheet ?? parseBuiltinReference();
      const report = evaluateDraftAgainstGt(draft, gt);
      setEvaluationReport(report);
    } else {
      setEvaluationReport(null);
    }
  }, [isEvaluationMode, customGtSheet, draft]);

  if (!draft) {
    return (
      <div className="recon-empty-page">
        <AlertCircle size={32} />
        <p>请选择一票委托书草稿进入人工复核工作台</p>
        <button
          className="primary"
          onClick={() => state.setView("drafts")}
        >
          选择委托草稿
        </button>
      </div>
    );
  }

  const currentLine =
    draft.lines.find((l) => l.id === lineId) ?? draft.lines[0];
  const currentRows = currentLine ? rowsByLine.get(currentLine.id) ?? [] : [];
  const activeFieldRow =
    currentRows.find((r) => r.field === field) ?? currentRows[0];
  const currentLineStatus = currentLine
    ? lineStatuses.get(currentLine.id)
    : undefined;

  // 统计指标
  const totalLines = draft.lines.length;
  const allFieldRows = [...rowsByLine.values()].flat();
  const allStatuses = draft.lines.map((l) => lineStatuses.get(l.id)!);

  const verifiedLines = allStatuses.filter((s) => s.aiStatus === "VERIFIED_OK");
  const needsConfirmLines = allStatuses.filter(
    (s) => s.aiStatus === "NEEDS_CONFIRM",
  );
  const noInspectionLines = allStatuses.filter(
    (s) => s.aiStatus === "NO_INSPECTION",
  );
  const confirmedLines = allStatuses.filter(
    (s) => s.humanStatus === "CONFIRMED",
  );

  // 人工需处理问题（必须处理）
  const blockedRelations = draft.lines.filter((l) => !l.relationSourceId);
  const conflictFieldsTotal = allFieldRows.filter((r) => r.conflict);
  const missingRequiredTotal = allFieldRows.filter(
    (r) => r.missing && r.required,
  );
  const explicitLineIssues = draft.lines.flatMap((l) =>
    l.issueIds
      .filter(
        (id) => !id.startsWith("字段冲突:") && !id.startsWith("必填缺失:"),
      )
      .map((msg) => ({ lineId: l.id, message: msg })),
  );

  // 细分问题中心：现在可处理 vs 等待材料 vs 需人工裁决
  const actionableNowCount = missingRequiredTotal.length + explicitLineIssues.length;
  const waitingMaterialCount = blockedRelations.length;
  const conflictCount = conflictFieldsTotal.length;
  const mustHandleCount =
    blockedRelations.length +
    conflictFieldsTotal.length +
    missingRequiredTotal.length +
    explicitLineIssues.length;

  // AI 风险提示（建议关注）
  const aiRiskItems = (() => {
    const list: Array<{
      lineId: string;
      level: "warn" | "info";
      title: string;
      desc: string;
    }> = [];
    draft.lines.forEach((l, idx) => {
      const rows = rowsByLine.get(l.id) ?? [];
      const gwRow = rows.find((r) => r.field === "毛重");
      const nwRow = rows.find((r) => r.field === "净重");

      if (gwRow?.currentValue && nwRow?.currentValue) {
        const gw = parseFloat(gwRow.currentValue);
        const nw = parseFloat(nwRow.currentValue);
        if (!isNaN(gw) && !isNaN(nw) && nw > gw) {
          list.push({
            lineId: l.id,
            level: "warn",
            title: `商品 ${String(idx + 1).padStart(2, "0")} 重量逻辑需关注`,
            desc: `净重 (${nw}) 大于毛重 (${gw})，建议核实`,
          });
        }
      }
      if (l.relationSourceIds.length > 1) {
        list.push({
          lineId: l.id,
          level: "info",
          title: `商品 ${String(idx + 1).padStart(2, "0")} 多批次查货组合`,
          desc: `当前商品行对应了 ${l.relationSourceIds.length} 条原始查货明细`,
        });
      }
      if (gwRow?.evidence.some((e) => e.modelDecision?.reason?.includes("分配") || e.modelDecision?.reason?.includes("均摊"))) {
        list.push({
          lineId: l.id,
          level: "info",
          title: `商品 ${String(idx + 1).padStart(2, "0")} 毛重来自系统比例分配`,
          desc: "根据箱规及委托件数自动分摊整单毛重",
        });
      }
    });
    return list;
  })();

  // 原始材料文件与证据提取
  const currentLineSources = state.sources.filter(
    (s) =>
      (currentLine?.relationSourceIds ?? []).includes(s.id) ||
      currentLine?.relationSourceId === s.id,
  );
  const taskFiles = state.files.filter(
    (f) =>
      draft.materialFileIds.includes(f.id) ||
      currentLineSources.some((s) => s.sourceFileId === f.id) ||
      f.customerId === draft.customerId,
  );

  const activeFile =
    taskFiles.find((f) => f.id === selectedFileId) ?? taskFiles[0];

  // 切换商品与聚焦字段（实现点击单元格与右侧字段来源强联动）
  const selectItem = (
    targetLineId: string,
    targetField?: FinalOutputField,
    forceTab?: "RAW_MATERIAL" | "FIELD_SOURCE" | "RELATION" | "AI_LOG",
  ) => {
    setLineId(targetLineId);
    if (targetField) {
      setField(targetField);
      // 强联动：只要选定具体字段，自动切换到字段来源 Tab
      setRightTab(forceTab ?? "FIELD_SOURCE");
    } else if (forceTab) {
      setRightTab(forceTab);
    }
    // 平滑滚动定位中间表格对应行
    requestAnimationFrame(() => {
      const el = document.getElementById(`draft-row-${targetLineId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  // 确认当前商品并自动跳到下一个未确认商品
  const handleConfirmCurrentAndNext = (targetLineId: string) => {
    state.confirmLine(targetLineId);
    const unconfirmed = draft.lines.find(
      (l) => l.id !== targetLineId && !l.manuallyConfirmed,
    );
    if (unconfirmed) {
      selectItem(unconfirmed.id, field ?? undefined);
    }
  };

  // 导出 CSV / 最终核对单
  const exportCsv = () => {
    const final = state.finalReconciliations.find(
      (s) => s.sourceDraftId === draft.id,
    );
    const rows = draft.lines.map((l) => l.fields);
    const csv = buildFinalReconciliationCsv(
      final ?? { rows, totals: calculateFinalOutputTotals(rows) },
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = final
      ? finalReconciliationFileName(draft.displayNo, final.sourceVersion)
      : `草稿预览-${draft.displayNo}-V${draft.version}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 用户上传自定义标准答案文件 (评测模式)
  const handleGtFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows: Array<Record<string, any>> = XLSX.utils.sheet_to_json(sheet);

      const parsedRows: StandardAnswerSheet["rows"] = jsonRows.map((row, idx) => {
        const fields: Partial<Record<FinalOutputField, string>> = {};
        for (const [colName, val] of Object.entries(row)) {
          const clean = colName.trim();
          const matched = FINAL_OUTPUT_FIELDS.find(
            (f) => f === clean || clean.includes(f),
          );
          if (matched) fields[matched] = String(val);
        }
        return {
          rowIndex: idx + 1,
          fields,
          rawFields: Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k, String(v)]),
          ),
        };
      });

      const customSheet: StandardAnswerSheet = {
        name: file.name,
        rows: parsedRows,
      };
      setCustomGtSheet(customSheet);
      state.clearToast();
    } catch {
      alert("解析标准答案文件失败，请确保是有效 Excel 文件");
    }
  };

  // 显示的核心字段列表
  const displayedFields =
    fieldMode === "CORE" ? CORE_OUTPUT_FIELDS : FINAL_OUTPUT_FIELDS;

  // 结案核销检查项状态
  const finalizeChecklist = {
    allLinesConfirmed: confirmedLines.length === draft.lines.length,
    confirmedCount: confirmedLines.length,
    totalLines: draft.lines.length,
    zeroConflicts: conflictFieldsTotal.length === 0,
    conflictCount: conflictFieldsTotal.length,
    zeroMissingRequired: missingRequiredTotal.length === 0,
    missingCount: missingRequiredTotal.length,
    zeroBlockedRelations: blockedRelations.length === 0,
    blockedCount: blockedRelations.length,
  };
  const canFinalize =
    finalizeChecklist.allLinesConfirmed &&
    finalizeChecklist.zeroConflicts &&
    finalizeChecklist.zeroMissingRequired &&
    finalizeChecklist.zeroBlockedRelations;

  // 任务状态业务语义判断
  let taskStatusText = "待人工复核";
  let taskStatusClass = "ready-confirm";
  if (draft.finalized) {
    taskStatusText = "已封版归档";
    taskStatusClass = "final";
  } else if (noInspectionLines.length === totalLines) {
    taskStatusText = "等待查货材料";
    taskStatusClass = "waiting-inspection";
  } else if (noInspectionLines.length > 0) {
    taskStatusText = `部分核对 (${verifiedLines.length + needsConfirmLines.length}/${totalLines})`;
    taskStatusClass = "partial-recon";
  } else if (mustHandleCount > 0) {
    taskStatusText = `待人工处理 (${mustHandleCount})`;
    taskStatusClass = "needs-attention";
  } else {
    taskStatusText = `待人工复核 (${confirmedLines.length}/${totalLines})`;
    taskStatusClass = "ready-confirm";
  }

  const updateTimeStr = new Date(draft.updatedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const query = taskSearch.trim().toLowerCase();
  const taskQueue = state.drafts.filter((item) => {
      const matched = !query || `${item.displayNo} ${item.customerName}`.toLowerCase().includes(query);
      if (!matched) return false;
      if (taskQueueFilter === "WAITING") return item.lines.every((line) => !line.relationSourceId);
      if (taskQueueFilter === "MANUAL") return !item.finalized && item.lines.some((line) => !line.manuallyConfirmed && (line.issueIds.length > 0 || !line.relationSourceId));
      if (taskQueueFilter === "MY_TODO") return !item.finalized;
      return true;
  });
  const taskIndex = Math.max(0, state.drafts.findIndex((item) => item.id === draft.id));
  const remainingTaskCount = state.drafts.filter((item) => !item.finalized && item.id !== draft.id).length;
  const nextPendingTask = [
    ...state.drafts.slice(taskIndex + 1),
    ...state.drafts.slice(0, taskIndex),
  ].find((item) => !item.finalized);
  const switchDraft = (draftId: string) => {
    state.selectDraft(draftId);
    setTaskSwitcherOpen(false);
    setTaskSearch("");
  };
  const switchAdjacentDraft = (offset: number) => {
    const next = state.drafts[taskIndex + offset];
    if (next) switchDraft(next.id);
  };
  const getTaskCardStatus = (item: UiDraft) => {
    if (item.finalized) return "可完成整票";
    const waiting = item.lines.filter((line) => !line.relationSourceId).length;
    const confirmed = item.lines.filter((line) => line.manuallyConfirmed).length;
    const issues = item.lines.filter((line) => !line.manuallyConfirmed && line.issueIds.length > 0).length;
    if (waiting === item.lines.length) return "等待查货";
    if (issues > 0) return "需人工处理";
    if (confirmed > 0 && confirmed === item.lines.length) return "待封版";
    return "部分核对";
  };

  return (
    <div className="recon-workbench recon-workspace-v2">
      {/* 顶部 Header：当前任务、队列位置与状态 */}
      <header className="recon-heading compact-heading">
        <div className="recon-heading-left">
          <div className="task-switcher-wrap">
            <button className="task-switcher-trigger" onClick={() => setTaskSwitcherOpen((open) => !open)} aria-expanded={taskSwitcherOpen}>
              <span className="task-switcher-label">核对任务</span>
              <span className="task-switcher-main"><b>{draft.displayNo}</b><span>·</span>{draft.customerName}</span>
              <span className="task-switcher-progress">{verifiedLines.length + needsConfirmLines.length}/{totalLines} 已核对 · {mustHandleCount} 个问题</span>
              <ChevronDown size={15} className={taskSwitcherOpen ? "rotate-180" : ""} />
            </button>
            {taskSwitcherOpen && (
              <div className="task-switcher-popover">
                <div className="task-switcher-popover-head"><strong>切换核对任务</strong><span>{state.drafts.filter((item) => !item.finalized).length} 票待处理</span></div>
                <div className="task-search"><Search size={14} /><input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="搜索任务号 / 客户" autoFocus /></div>
                <div className="task-queue-tabs">
                  {([["MY_TODO", "我的待办"], ["ALL", "全部处理中"], ["WAITING", "等待材料"], ["MANUAL", "需人工处理"]] as const).map(([key, label]) => <button key={key} className={taskQueueFilter === key ? "active" : ""} onClick={() => setTaskQueueFilter(key)}>{label}</button>)}
                </div>
                <div className="task-list">
                  {taskQueue.map((item) => {
                    const itemMatched = item.lines.filter((line) => line.relationSourceId).length;
                    const itemIssues = item.lines.filter((line) => !line.manuallyConfirmed && line.issueIds.length > 0).length;
                    return <button key={item.id} className={`task-list-item ${item.id === draft.id ? "current" : ""}`} onClick={() => switchDraft(item.id)}>
                      <div className="task-list-top"><b>{item.displayNo}</b><span className={`task-state task-state-${getTaskCardStatus(item)}`}>{getTaskCardStatus(item)}</span></div>
                      <div className="task-list-customer">{item.customerName}</div>
                      <div className="task-list-meta"><span>{itemMatched}/{item.lines.length} 个商品已有查货依据</span>{itemIssues > 0 && <span className="task-issue">{itemIssues} 个问题</span>}</div>
                    </button>;
                  })}
                  {taskQueue.length === 0 && <div className="task-empty">没有符合条件的待处理任务</div>}
                </div>
                <button className="task-view-all" onClick={() => { state.setView("drafts"); setTaskSwitcherOpen(false); }}>查看全部任务 <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
          <div className="task-adjacent-nav">
            <button className="icon-button" onClick={() => switchAdjacentDraft(-1)} disabled={taskIndex <= 0} title="上一票"><ChevronLeft size={16} /></button>
            <span>第 {taskIndex + 1} / {state.drafts.length} 票</span>
            <button className="icon-button" onClick={() => switchAdjacentDraft(1)} disabled={taskIndex >= state.drafts.length - 1} title="下一票"><ChevronRight size={16} /></button>
            <span className={`recon-status-pill ${taskStatusClass}`}>{taskStatusText}</span>
          </div>
        </div>

        <div className="recon-top-actions">
          {/* 模式切换：正常业务核对 vs 评测模式 (Demo) */}
          <div
            className="mode-toggle-group"
            role="radiogroup"
            aria-label="工作台模式切换"
          >
            <button
              className={`mode-toggle-btn ${!isEvaluationMode ? "active" : ""}`}
              onClick={() => setEvaluationMode(false)}
            >
              <FileCheck2 size={14} />
              正常业务核对
            </button>
            <button
              className={`mode-toggle-btn eval-btn ${
                isEvaluationMode ? "active" : ""
              }`}
              onClick={() => setEvaluationMode(true)}
            >
              <Sparkles size={14} />
              评测模式 (POC)
            </button>
          </div>

          <button className="secondary" onClick={() => setHistoryOpen(!historyOpen)} title="查看草稿版本变更历史">
            <History size={15} />
            版本与操作
          </button>

          <button className="secondary" onClick={exportCsv}>
            <Download size={15} />
            {draft.finalized ? "导出最终核对单" : "导出草稿预览"}
          </button>

          {!draft.finalized && (
            <div className="finalize-action-container">
              <button
                className={`primary recon-finalize-btn ${!canFinalize ? "is-disabled" : ""}`}
                disabled={!canFinalize}
                onClick={() => setShowFinalizeModal(true)}
                onMouseEnter={() => setShowChecklistPopover(true)}
                onMouseLeave={() => setShowChecklistPopover(false)}
              >
                <CheckCircle2 size={16} />
                {canFinalize ? "完成整票复核" : "整票复核 (未满足条件)"}
              </button>

              {/* 未达标时的条件提示面板 */}
              {!canFinalize && showChecklistPopover && (
                <div
                  className="finalize-condition-popover"
                  onMouseEnter={() => setShowChecklistPopover(true)}
                  onMouseLeave={() => setShowChecklistPopover(false)}
                >
                  <div className="popover-head">
                    <strong>还不能完成整票复核</strong>
                    <span className="popover-badge-warn">尚未达标</span>
                  </div>
                  <ul className="popover-checklist">
                    <li className={noInspectionLines.length === 0 ? "is-ok" : "is-fail"}>
                      <span className="chk-icon">{noInspectionLines.length === 0 ? "✓" : "✕"}</span>
                      <span>
                        {noInspectionLines.length === 0
                          ? "全部商品已有可靠查货依据"
                          : `${noInspectionLines.length} 个商品暂无可靠查货依据`}
                      </span>
                    </li>
                    <li className={mustHandleCount === 0 ? "is-ok" : "is-fail"}>
                      <span className="chk-icon">{mustHandleCount === 0 ? "✓" : "✕"}</span>
                      <span>
                        {mustHandleCount === 0
                          ? "0 个未决冲突与必填缺失"
                          : `${mustHandleCount} 个必须问题未处理`}
                      </span>
                    </li>
                    <li className={confirmedLines.length === totalLines ? "is-ok" : "is-fail"}>
                      <span className="chk-icon">{confirmedLines.length === totalLines ? "✓" : "○"}</span>
                      <span>
                        人工已复核 {confirmedLines.length} / {totalLines}
                      </span>
                    </li>
                    <li className="is-ok">
                      <span className="chk-icon">✓</span>
                      <span>客户信息已确认</span>
                    </li>
                    <li className="is-ok">
                      <span className="chk-icon">✓</span>
                      <span>委托材料读取完整</span>
                    </li>
                  </ul>
                  <p className="popover-foot-tip">满足全部条件后即可生成最终核对单并执行核销</p>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 紧凑任务状态：只回答当前状态、最近一次自动核对和人工待办 */}
      <section className="recon-status-overview compact-status-overview">
        <div className="compact-status-topline">
          <div className="compact-status-message"><span className="live-dot" /><strong>{draft.finalized ? "当前任务已封版" : noInspectionLines.length > 0 ? "AI 已完成当前可处理内容" : "AI 已完成当前自动核对"}</strong><span>{noInspectionLines.length > 0 ? `${noInspectionLines.length} 个商品仍等待查货；` : "全部商品已有可靠查货依据；"}{mustHandleCount > 0 ? `当前有 ${mustHandleCount} 个问题需要人工处理。` : "当前没有必须处理的问题。"}</span></div>
          <button className="recent-check-button" onClick={() => setRightTab("AI_LOG")}><Sparkles size={14} />最近自动核对 {updateTimeStr}<ChevronRight size={13} /></button>
        </div>
        <div className="compact-status-meta"><span>触发原因：{draft.lastUpdateReason || "查货材料到达"}</span><span>草稿 V{draft.version}</span><span className="autosave-note"><Check size={12} /> 已自动保存 {updateTimeStr}</span></div>
        <div className="recon-metric-tiles compact-metrics">
          <div className="metric-tile"><span className="metric-label">全部商品</span><strong className="metric-num">{totalLines}</strong></div>
          <div className="metric-tile"><span className="metric-label">AI已核对</span><strong className="metric-num text-green">{verifiedLines.length + needsConfirmLines.length}</strong></div>
          <div className="metric-tile"><span className="metric-label">等待查货</span><strong className={`metric-num ${noInspectionLines.length ? "text-orange" : "text-muted"}`}>{noInspectionLines.length}</strong></div>
          <div className="metric-tile"><span className="metric-label">人工待办</span><strong className={`metric-num ${mustHandleCount ? "text-red" : "text-muted"}`}>{mustHandleCount}</strong></div>
          <div className="metric-tile metric-tile-accent"><span className="metric-label">人工已确认</span><strong className="metric-num text-blue">{confirmedLines.length}<small> / {totalLines}</small></strong></div>
        </div>
      </section>

      {/* 评测模式专用 Dashboard：标准答案指标与对比控制器 */}
      {isEvaluationMode && evaluationReport && (
        <section className="recon-evaluation-dashboard">
          <div className="eval-dash-head">
            <div className="eval-dash-title">
              <Sparkles size={16} className="text-purple" />
              <strong>POC 标准答案自动化评测看板</strong>
              <span className="eval-dataset-tag">
                评测基准：{evaluationReport.datasetName}
              </span>
            </div>
            <div className="eval-dash-tools">
              <label className="secondary eval-upload-btn">
                <Upload size={13} />
                导入标准答案.xlsx
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleGtFileUpload}
                  style={{ display: "none" }}
                />
              </label>
              {customGtSheet && (
                <button
                  className="text-button"
                  onClick={() => setCustomGtSheet(null)}
                >
                  恢复内置标准答案
                </button>
              )}
            </div>
          </div>

          <div className="eval-metric-grid">
            <div className="eval-metric-card">
              <span>整体字段准确率</span>
              <strong className="eval-score">
                {evaluationReport.metrics.overallAccuracyRate}%
              </strong>
              <small>
                {evaluationReport.metrics.consistentFieldsCount} /{" "}
                {evaluationReport.metrics.totalFieldsCompared} 字段一致
              </small>
            </div>
            <div className="eval-metric-card">
              <span>必填字段准确率</span>
              <strong className="eval-score text-green">
                {evaluationReport.metrics.requiredAccuracyRate}%
              </strong>
              <small>核心报关必填项</small>
            </div>
            <div className="eval-metric-card">
              <span>商品匹配正确率</span>
              <strong className="eval-score text-blue">
                {evaluationReport.metrics.productMatchAccuracyRate}%
              </strong>
              <small>
                {evaluationReport.metrics.matchedLineCount} /{" "}
                {evaluationReport.metrics.totalLineCount} 行有效建立对应
              </small>
            </div>
            <div className="eval-metric-card">
              <span>人工需修正字段</span>
              <strong className="eval-score text-red">
                {evaluationReport.metrics.humanCorrectionNeededCount}
              </strong>
              <small>与标准答案存在差异</small>
            </div>
            <div className="eval-metric-card">
              <span>AI判一致但实际错误</span>
              <strong className="eval-score text-orange">
                {evaluationReport.metrics.aiConsistentButIncorrectCount}
              </strong>
              <small>模型置信但GT不同</small>
            </div>
          </div>

          {/* 评测模式专属过滤条 */}
          <div className="eval-filter-bar">
            <span className="filter-title">评测差异速查：</span>
            <button
              className={`chip ${
                draftTableFilter === "ALL" ? "active" : ""
              }`}
              onClick={() => setDraftTableFilter("ALL")}
            >
              全部字段
            </button>
            <button
              className={`chip chip-red ${
                draftTableFilter === "MISMATCH_ONLY" ? "active" : ""
              }`}
              onClick={() => setDraftTableFilter("MISMATCH_ONLY")}
            >
              仅看不一致 ({evaluationReport.metrics.mismatchFieldsCount})
            </button>
            <button
              className={`chip chip-orange ${
                draftTableFilter === "MISSING_ONLY" ? "active" : ""
              }`}
              onClick={() => setDraftTableFilter("MISSING_ONLY")}
            >
              仅看缺失 ({evaluationReport.metrics.aiMissingFieldsCount})
            </button>
            <button
              className={`chip chip-purple ${
                draftTableFilter === "AI_FALSE_POSITIVE" ? "active" : ""
              }`}
              onClick={() => setDraftTableFilter("AI_FALSE_POSITIVE")}
            >
              仅看AI判一致但实际错误 ({evaluationReport.metrics.aiConsistentButIncorrectCount})
            </button>
            <span className="eval-hint">
              💡 评测模式下，每个单元格直接显示：【AI当前值】与【标准答案 GT
              值】对比，点击差异可查看 AI 判断原因。
            </span>
          </div>
        </section>
      )}

      {/* 历史版本与操作记录抽屉 */}
      {historyOpen && (
        <section className="recon-history" aria-label="草稿版本与操作">
          <div className="history-head">
            <strong>草稿版本演化与操作记录</strong>
            <button
              className="icon-button"
              onClick={() => setHistoryOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="history-body">
            {state.versions
              .filter((v) => v.draftId === draft.id)
              .slice()
              .reverse()
              .map((v) => (
                <details key={v.id} className="history-ver-item">
                  <summary>
                    <b>V{v.version}</b> · {v.triggerReason} ·{" "}
                    {new Date(v.createdAt).toLocaleString("zh-CN")}
                  </summary>
                  <div className="ver-diff-content">
                    {v.after.map((after) => (
                      <div key={after.entrustmentLineId}>
                        {FINAL_OUTPUT_FIELDS.filter(
                          (f) =>
                            v.before.find(
                              (b) =>
                                b.entrustmentLineId === after.entrustmentLineId,
                            )?.fields[f] !== after.fields[f],
                        ).map((f) => (
                          <p key={f} className="ver-diff-line">
                            <span>
                              {short(after.entrustmentLineId)} · {f}：
                            </span>
                            <span className="diff-old">
                              {value(
                                v.before.find(
                                  (b) =>
                                    b.entrustmentLineId ===
                                    after.entrustmentLineId,
                                )?.fields[f],
                              )}
                            </span>
                            <span className="diff-arrow">→</span>
                            <span className="diff-new">
                              {value(after.fields[f])}
                            </span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
          </div>
        </section>
      )}

      {/* 工作台三栏主体 */}
      <div
        className="recon-columns-v2"
        style={{
          gridTemplateColumns: `250px minmax(0, 1fr) ${rightPanelCollapsed ? "0 44px" : `8px ${rightPanelWidth}px`}`,
        }}
      >
        {/* 左侧：人工工作队列 (商品行导航 + 必须处理问题 + AI风险) */}
        <aside
          className={`recon-left-queue ${
            mobileDrawer === "left" ? "drawer-open" : ""
          }`}
        >
          {/* 区域 1：商品行状态导航 */}
          <section className="queue-section queue-nav">
            <div className="queue-section-header">
              <h3>
                商品核对清单 <span>{totalLines}</span>
              </h3>
            </div>
            {/* 分组统计芯片 */}
            <div className="nav-filter-chips">
              <button
                className={`filter-chip ${
                  lineNavFilter === "ALL" ? "active" : ""
                }`}
                onClick={() => setLineNavFilter("ALL")}
              >
                全部 {totalLines}
              </button>
              <button
                className={`filter-chip chip-green ${
                  lineNavFilter === "VERIFIED_OK" ? "active" : ""
                }`}
                onClick={() => setLineNavFilter("VERIFIED_OK")}
              >
                ✓ 无问题 {verifiedLines.length}
              </button>
              <button
                className={`filter-chip chip-red ${
                  lineNavFilter === "NEEDS_CONFIRM" ? "active" : ""
                }`}
                onClick={() => setLineNavFilter("NEEDS_CONFIRM")}
              >
                ⚠ 需确认 {needsConfirmLines.length}
              </button>
              <button
                className={`filter-chip chip-orange ${
                  lineNavFilter === "NO_INSPECTION" ? "active" : ""
                }`}
                onClick={() => setLineNavFilter("NO_INSPECTION")}
              >
                ○ 缺查货 {noInspectionLines.length}
              </button>
              <button
                className={`filter-chip chip-blue ${
                  lineNavFilter === "CONFIRMED" ? "active" : ""
                }`}
                onClick={() => setLineNavFilter("CONFIRMED")}
              >
                ● 已复核 {confirmedLines.length}
              </button>
            </div>

            {/* 商品卡片列表 */}
            <div className="line-cards-scroll">
              {draft.lines
                .filter((l) => {
                  const st = lineStatuses.get(l.id);
                  if (lineNavFilter === "VERIFIED_OK")
                    return st?.aiStatus === "VERIFIED_OK";
                  if (lineNavFilter === "NEEDS_CONFIRM")
                    return st?.aiStatus === "NEEDS_CONFIRM";
                  if (lineNavFilter === "NO_INSPECTION")
                    return st?.aiStatus === "NO_INSPECTION";
                  if (lineNavFilter === "CONFIRMED")
                    return st?.humanStatus === "CONFIRMED";
                  return true;
                })
                .map((item, index) => {
                  const itemStatus = lineStatuses.get(item.id);
                  const isSelected = item.id === lineId;
                  const originalIndex = draft.lines.indexOf(item);

                  return (
                    <button
                      key={item.id}
                      id={`nav-item-${item.id}`}
                      className={`line-queue-card ${
                        isSelected ? "is-selected" : ""
                      } ${
                        itemStatus?.hasConflict
                          ? "has-conflict"
                          : itemStatus?.hasInspection
                            ? "has-inspection"
                            : "no-inspection"
                      }`}
                      onClick={() => selectItem(item.id, field ?? undefined)}
                    >
                      <div className="card-top-row">
                        <div className="card-num-code">
                          <b>
                            商品 {String(originalIndex + 1).padStart(2, "0")}
                          </b>
                          <span className="card-code">{short(item.id)}</span>
                        </div>
                        {/* 双状态微标：AI状态 + 人工状态 */}
                        <div className="card-status-badges">
                          <span
                            className={`badge-ai ${
                              itemStatus?.aiStatus === "VERIFIED_OK"
                                ? "tag-green"
                                : itemStatus?.aiStatus === "NEEDS_CONFIRM"
                                  ? "tag-red"
                                  : "tag-orange"
                            }`}
                          >
                            {itemStatus?.aiStatusText}
                          </span>
                        </div>
                      </div>

                      <div className="card-model-row" title={item.model}>
                        {item.model || "型号待补充"}
                      </div>

                      <div className="card-foot-row">
                        <span className="card-inspection-summary">
                          {itemStatus?.inspectionSummary}
                        </span>
                        <span
                          className={`badge-human ${
                            item.manuallyConfirmed ? "is-confirmed" : "is-pending"
                          }`}
                        >
                          {item.manuallyConfirmed
                            ? "● 人工已确认"
                            : "○ 待人工复核"}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>

          {/* 区域 2：人工问题中心 (拆解：现在可处理 vs 等待材料 vs 需裁决) */}
          <section className="queue-section queue-problems">
            <div className="queue-section-header">
              <h3>
                人工问题中心{" "}
                <span className="badge-count-red">{actionableNowCount} 可处理</span>
                {waitingMaterialCount > 0 && (
                  <span className="badge-count-orange">{waitingMaterialCount} 待材料</span>
                )}
              </h3>
            </div>
            <div className="problem-filter-chips">
              {([["ALL", "全部", mustHandleCount], ["RELATION", "商品关系", waitingMaterialCount], ["CONFLICT", "字段冲突", conflictCount], ["MISSING", "必填缺失", missingRequiredTotal.length]] as const).map(([key, label, count]) => <button key={key} className={problemFilter === key ? "active" : ""} onClick={() => setProblemFilter(key)}>{label} <b>{count}</b></button>)}
            </div>
            {mustHandleCount === 0 ? (
              <div className="queue-empty-clean">
                <Check size={16} />
                <span>整票无未决冲突与必填缺失，可随时完成复核</span>
              </div>
            ) : (
              <div className="problem-items-list">
                {/* 1. 现在可以处理：委托侧必填缺失 */}
                {actionableNowCount > 0 && problemFilter !== "RELATION" && (
                  <div className="problem-subgroup">
                    <div className="subgroup-title text-red">
                      <span>● 现在可以处理 ({actionableNowCount})</span>
                      <small>委托侧字段缺失 · 立即录入</small>
                    </div>
                    {missingRequiredTotal.map((r) => {
                      const lineOfField = draft.lines.find((l) =>
                        rowsByLine.get(l.id)?.some((item) => item === r),
                      );
                      const lId = lineOfField?.id ?? draft.lines[0].id;
                      return (
                        <div
                          key={`miss-${lId}-${r.field}`}
                          className="problem-action-card card-missing"
                          onClick={() => selectItem(lId, r.field, "FIELD_SOURCE")}
                        >
                          <div className="problem-card-head">
                            <AlertTriangle size={13} className="text-red" />
                            <b>{short(lId)} · 必填项【{r.field}】缺失</b>
                          </div>
                          <p className="problem-card-desc">报关必须填报该字段，当前可提前补全</p>
                          <div className="problem-card-foot">
                            <span className="action-link">点击补全字段 →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. 等待材料：尚无查货依据商品 */}
                {waitingMaterialCount > 0 && (problemFilter === "ALL" || problemFilter === "RELATION") && (
                  <div className="problem-subgroup">
                    <div className="subgroup-title text-orange">
                      <span>○ 等待查货材料 ({waitingMaterialCount})</span>
                      <small>新查货到达后自动核对</small>
                    </div>
                    {blockedRelations.map((l) => (
                      <div
                        key={`rel-${l.id}`}
                        className="problem-action-card card-waiting-mat"
                        onClick={() => selectItem(l.id, "型号", "RELATION")}
                      >
                        <div className="problem-card-head">
                          <AlertTriangle size={13} className="text-orange" />
                          <b>{short(l.id)} · 尚未关联查货依据</b>
                        </div>
                        <p className="problem-card-desc">系统持续监听中；也可在右侧手动指定</p>
                        <div className="problem-card-foot">
                          <span className="action-link">手动指定依据 →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. 需要人工裁决：字段差异冲突 */}
                {conflictCount > 0 && problemFilter !== "RELATION" && problemFilter !== "MISSING" && (
                  <div className="problem-subgroup">
                    <div className="subgroup-title text-red">
                      <span>⚠ 需人工判断差异 ({conflictCount})</span>
                      <small>委托与查货实测出入</small>
                    </div>
                    {conflictFieldsTotal.map((r) => {
                      const lineOfField = draft.lines.find((l) =>
                        rowsByLine.get(l.id)?.some((item) => item === r),
                      );
                      const lId = lineOfField?.id ?? draft.lines[0].id;
                      return (
                        <div
                          key={`conf-${lId}-${r.field}`}
                          className="problem-action-card card-conflict"
                          onClick={() => selectItem(lId, r.field, "FIELD_SOURCE")}
                        >
                          <div className="problem-card-head">
                            <AlertCircle size={13} className="text-red" />
                            <b>{short(lId)} · {r.field} 存在差异</b>
                          </div>
                          <div className="conflict-contrast">
                            <span>委托：{value(r.baseValue)}</span>
                            <span>查货：{value(r.candidateValue)}</span>
                          </div>
                          <div className="problem-card-foot">
                            <span className="action-link">点击快速裁决 →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 区域 3：AI风险与报警 (建议关注) */}
          <section className={`queue-section queue-risks ${aiRiskItems.length === 0 ? "is-empty" : ""}`}>
            <div className="queue-section-header">
              <h3>
                AI风险预警 {aiRiskItems.length > 0 && <span>{aiRiskItems.length} 建议关注</span>}
              </h3>
            </div>
            {aiRiskItems.length === 0 ? (
              <div className="queue-empty-clean">
                <Check size={16} />
                <span>暂无额外风险</span>
              </div>
            ) : (
              <div className="risk-items-list">
                {aiRiskItems.map((risk, i) => (
                  <div
                    key={i}
                    className={`risk-card ${
                      risk.level === "warn" ? "risk-warn" : "risk-info"
                    }`}
                    onClick={() => selectItem(risk.lineId, field ?? undefined)}
                  >
                    <div className="risk-card-head">
                      {risk.level === "warn" ? (
                        <AlertTriangle size={13} className="text-orange" />
                      ) : (
                        <Info size={13} className="text-blue" />
                      )}
                      <b>{risk.title}</b>
                    </div>
                    <p className="risk-card-desc">{risk.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* 中间核心：真正的「核对单草稿」 */}
        <main className="recon-center-draft">
          {/* 中间顶部工具栏 */}
          <div className="draft-control-bar">
            <div className="draft-control-left">
              <div
                className="view-columns-toggle"
                role="radiogroup"
                aria-label="草稿显示列切换"
              >
                <button
                  className={`col-toggle-btn ${
                    fieldMode === "ALL" ? "active" : ""
                  }`}
                  onClick={() => setFieldMode("ALL")}
                  title="展示海关申报规范全部25列字段（包含未填报项）"
                >
                  <Layers size={13} />
                  全部25字段
                </button>
                <button
                  className={`col-toggle-btn ${
                    fieldMode === "CORE" ? "active" : ""
                  }`}
                  onClick={() => setFieldMode("CORE")}
                  title="精简展示高频核验的11个核心字段"
                >
                  <Table size={13} />
                  核心字段
                </button>
              </div>

              {/* 筛选切片 */}
              <div className="draft-quick-filters">
                <button
                  className={`filter-btn ${
                    draftTableFilter === "ALL" ? "active" : ""
                  }`}
                  onClick={() => setDraftTableFilter("ALL")}
                >
                  全部
                </button>
                <button
                  className={`filter-btn ${
                    draftTableFilter === "PROBLEMS_ONLY" ? "active" : ""
                  }`}
                  onClick={() => setDraftTableFilter("PROBLEMS_ONLY")}
                >
                  问题 {needsConfirmLines.length}
                </button>
                <button
                  className={`filter-btn ${
                    draftTableFilter === "UNCONFIRMED_ONLY" ? "active" : ""
                  }`}
                  onClick={() => setDraftTableFilter("UNCONFIRMED_ONLY")}
                >
                  未复核 {totalLines - confirmedLines.length}
                </button>
              </div>
            </div>

          </div>

          {/* 25 字段草稿核对状态图例与横向滑动控制 */}
          <div className="draft-legend-bar">
            <div className="legend-items-left">
              <span className="legend-label">字段核对状态图例：</span>
              <span className="legend-item"><i className="legend-icon icon-verified">✓</i> 核对一致</span>
              <span className="legend-item"><i className="legend-icon icon-updated">↑</i> AI更新</span>
              <span className="legend-item"><i className="legend-icon icon-conflict">⚠</i> 查货差异</span>
              <span className="legend-item"><i className="legend-icon icon-human">●</i> 人工修改</span>
              <span className="legend-item"><i className="legend-item icon-missing">!</i> 必填缺失</span>
              <span className="legend-tip-clean">（未核对商品默认展示委托书初始草稿）</span>
            </div>
            <div className="table-scroll-controller">
              <span className="scroll-tip-label">右滑浏览25字段:</span>
              <button
                type="button"
                className="btn-scroll-nav"
                onClick={() => scrollTable(-380)}
                title="向左滚动查看前面的字段"
              >
                <ChevronLeft size={13} /> 向左
              </button>
              <button
                type="button"
                className="btn-scroll-nav"
                onClick={() => scrollTable(380)}
                title="向右滚动查看更多海关申报字段"
              >
                向右 <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* 核对单草稿主表格 */}
          <div className="draft-table-wrapper" ref={tableWrapperRef}>
            <table className="draft-master-table">
              <thead>
                <tr>
                  <th className="th-sticky th-no">序号</th>
                  <th className="th-sticky th-status">AI核对状态</th>
                  <th className="th-sticky th-review">人工复核</th>
                  <th className="th-sticky th-action">操作</th>
                  {displayedFields.map((f) => (
                    <th
                      key={f}
                      className={field === f ? "th-active-field" : ""}
                      onClick={() => setField(f)}
                    >
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.lines
                  .filter((l) => {
                    const st = lineStatuses.get(l.id);
                    const evalLine = evaluationReport?.lineResults.find(
                      (res) => res.lineId === l.id,
                    );
                    if (draftTableFilter === "PROBLEMS_ONLY") {
                      return (
                        st?.aiStatus === "NEEDS_CONFIRM" ||
                        st?.hasConflict ||
                        !st?.hasInspection
                      );
                    }
                    if (draftTableFilter === "UNCONFIRMED_ONLY") {
                      return !l.manuallyConfirmed;
                    }
                    if (draftTableFilter === "AI_FALSE_POSITIVE") {
                      return (
                        !!evalLine &&
                        Object.values(evalLine.fields).some(
                          (f) =>
                            f.diffType === "VALUE_MISMATCH" &&
                            !!f.aiValue &&
                            f.aiValue !== f.gtValue,
                        )
                      );
                    }
                    return true;
                  })
                  .map((l) => {
                    const lStatus = lineStatuses.get(l.id);
                    const lRows = rowsByLine.get(l.id) ?? [];
                    const isSelected = l.id === lineId;
                    const evalLine = evaluationReport?.lineResults.find(
                      (res) => res.lineId === l.id,
                    );

                    return (
                      <tr
                        key={l.id}
                        id={`draft-row-${l.id}`}
                        className={`draft-line-row ${
                          isSelected ? "row-selected" : ""
                        } ${
                          l.manuallyConfirmed
                            ? "row-confirmed"
                            : lStatus?.hasConflict
                              ? "row-has-conflict"
                              : ""
                        }`}
                      >
                        {/* 序号与定位 */}
                        <td className="td-sticky td-no">
                          <button
                            className="row-anchor-btn"
                            onClick={() =>
                              selectItem(l.id, field ?? undefined)
                            }
                            title="点击选定该商品行"
                          >
                            <b>
                              {String(draft.lines.indexOf(l) + 1).padStart(
                                2,
                                "0",
                              )}
                            </b>
                            <small>{short(l.id)}</small>
                          </button>
                        </td>

                        {/* AI核对状态 */}
                        <td className="td-sticky td-status">
                          <span
                            className={`badge-status-pill ${
                              lStatus?.aiStatus === "VERIFIED_OK"
                                ? "pill-green"
                                : lStatus?.aiStatus === "NEEDS_CONFIRM"
                                  ? "pill-red"
                                  : "pill-orange"
                            }`}
                          >
                            {lStatus?.aiStatusText}
                          </span>
                        </td>

                        {/* 人工复核状态 */}
                        <td className="td-sticky td-review">
                          {l.manuallyConfirmed ? (
                            <span className="badge-review confirmed">
                              <Check size={11} /> 人工已复核
                            </span>
                          ) : (
                            <span className="badge-review pending">
                              ○ 待人工确认
                            </span>
                          )}
                        </td>

                        {/* 行操作：根据查货与问题状态实施严谨权限与动作分流 */}
                        <td className="td-sticky td-action">
                          {l.manuallyConfirmed ? (
                            <button
                              className="action-btn-unconfirm"
                              onClick={() => state.unconfirmLine(l.id)}
                              title="点击取消人工复核标记"
                            >
                              ● 已复核 (取消)
                            </button>
                          ) : lStatus?.actionType === "NO_INSPECTION" ? (
                            <div className="action-btn-no-inspection-group">
                              <span
                                className="action-tag-waiting"
                                title="未建立可靠查货关系前，禁止人工确认本行"
                              >
                                等待查货
                              </span>
                              <button
                                className="action-btn-manual-rel"
                                onClick={() =>
                                  selectItem(l.id, "型号", "RELATION")
                                }
                                title="在右侧商品对应Tab手动指定查货依据"
                              >
                                手动关联
                              </button>
                            </div>
                          ) : lStatus?.actionType === "NEEDS_RESOLVE" ? (
                            <div className="action-btn-needs-resolve-group">
                              <button
                                className="action-btn-resolve"
                                onClick={() => {
                                  const firstIssue = lRows.find(
                                    (r) =>
                                      r.conflict || (r.missing && r.required),
                                  );
                                  selectItem(
                                    l.id,
                                    firstIssue?.field ?? "型号",
                                    "FIELD_SOURCE",
                                  );
                                }}
                                title="定位到问题字段并展开处理"
                              >
                                处理问题
                              </button>
                              <button
                                className="action-btn-confirm-secondary"
                                onClick={() =>
                                  handleConfirmCurrentAndNext(l.id)
                                }
                                title="确认当前商品"
                              >
                                确认商品
                              </button>
                            </div>
                          ) : (
                            <button
                              className="action-btn-confirm"
                              onClick={() =>
                                handleConfirmCurrentAndNext(l.id)
                              }
                              title="AI已核对无阻断问题，确认本行"
                            >
                              确认当前商品
                            </button>
                          )}
                        </td>

                        {/* 字段单元格渲染 (含轻量明确的状态与注脚，支持强联动) */}
                        {displayedFields.map((f) => {
                          const r = lRows.find((item) => item.field === f);
                          const isCurrentActive =
                            isSelected && field === f;
                          const evalField = evalLine?.fields[f];

                          return (
                            <td
                              key={f}
                              className={`draft-cell ${
                                isCurrentActive ? "cell-selected" : ""
                              } ${
                                r?.checkStatus === "CONFLICT"
                                  ? "cell-conflict"
                                  : r?.checkStatus === "AI_UPDATED"
                                    ? "cell-ai-updated"
                                    : r?.checkStatus === "HUMAN_MODIFIED"
                                      ? "cell-human-modified"
                                      : r?.checkStatus === "NO_INSPECTION"
                                        ? "cell-no-inspection"
                                        : r?.checkStatus === "MISSING_REQUIRED"
                                          ? "cell-missing-required"
                                          : "cell-verified-ok"
                              }`}
                              onClick={() =>
                                selectItem(l.id, f, "FIELD_SOURCE")
                              }
                            >
                              <div className="cell-inner">
                                <div className="cell-top-val-row">
                                  <span
                                    className={`cell-val ${
                                      !r?.currentValue ||
                                      r.currentValue.trim() === "" ||
                                      r.currentValue.toUpperCase() === "UNKNOWN"
                                        ? "cell-val-empty"
                                        : ""
                                    }`}
                                  >
                                    {value(r?.currentValue)}
                                  </span>
                                  {(!r?.currentValue ||
                                    r.currentValue.trim() === "" ||
                                    r.currentValue.toUpperCase() ===
                                      "UNKNOWN") && (
                                    <span
                                      className="cell-badge-empty"
                                      title="该商品未填报此项"
                                    >
                                      未填
                                    </span>
                                  )}
                                </div>

                                {/* 状态微注脚 (仅在有查货核对事件或必填缺失时展示，无依据默认保持初始草稿干净展示) */}
                                {r?.checkStatus === "VERIFIED_CONSISTENT" && (
                                  <div className="cell-status-subnote note-verified">
                                    <span>✓ 核对一致</span>
                                  </div>
                                )}
                                {r?.checkStatus === "AI_UPDATED" && (
                                  <div
                                    className="cell-status-subnote note-updated"
                                    title={`原委托: ${value(r.baseValue)} | 查货: ${value(r.candidateValue)}`}
                                  >
                                    <span>↑ AI更新</span>
                                  </div>
                                )}
                                {r?.checkStatus === "CONFLICT" && (
                                  <div
                                    className="cell-status-subnote note-conflict"
                                    title={`查货实测出入：${value(r.candidateValue)}`}
                                  >
                                    <span>⚠ 冲突</span>
                                  </div>
                                )}
                                {r?.checkStatus === "HUMAN_MODIFIED" && (
                                  <div
                                    className="cell-status-subnote note-human"
                                    title={
                                      r.hasHumanOverriddenDiff
                                        ? `后续AI查货新发现：${value(r.candidateValue)}`
                                        : "人工已修改"
                                    }
                                  >
                                    <span>● 人工修改</span>
                                    {r.hasHumanOverriddenDiff && (
                                      <b className="warn-marker">! 差异</b>
                                    )}
                                  </div>
                                )}
                                {r?.checkStatus === "MISSING_REQUIRED" && (
                                  <div
                                    className="cell-status-subnote note-missing"
                                    title="报关核心必填字段缺失"
                                  >
                                    <span>! 必填缺失</span>
                                  </div>
                                )}

                                {/* 评测模式下：直观叠加标准答案与差异标识 */}
                                {isEvaluationMode && evalField && (
                                  <div
                                    className={`eval-cell-diff-box ${
                                      evalField.diffType === "CONSISTENT"
                                        ? "eval-ok"
                                        : "eval-mismatch"
                                    }`}
                                    title={evalField.diffDescription}
                                  >
                                    <small className="eval-gt-val">
                                      GT: {value(evalField.gtValue)}
                                    </small>
                                    <span className="eval-diff-tag">
                                      {evalField.diffType === "CONSISTENT"
                                        ? "✓"
                                        : evalField.diffType === "VALUE_MISMATCH"
                                          ? "✕ 不一致"
                                          : evalField.diffType === "AI_MISSING"
                                            ? "✕ 缺失"
                                            : "✕ 差异"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </main>

        {/* 拖拽分割条：支持向左拖拽放大 */}
        <div
          className={`recon-splitter-handle ${
            isDraggingRightPanel ? "dragging" : ""
          }`}
          onMouseDown={handleSplitterMouseDown}
          title="按住向左拖拽放大右侧溯源面板，向右拖拽缩小"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="splitter-grip" />
        </div>

        {/* 右侧：“为什么这个值是这样”溯源与证据 */}
        <aside
          className={`recon-right-evidence ${
            mobileDrawer === "right" ? "drawer-open" : ""
          }`}
          style={{ width: rightPanelCollapsed ? "44px" : `${rightPanelWidth}px` }}
        >
          {/* 四大 Tab 切换与快速放大按钮 */}
          <div
            className="evidence-tabs-bar"
            role="tablist"
            aria-label="溯源信息选项卡"
          >
            <button
              className={`evidence-tab ${
                rightTab === "FIELD_SOURCE" ? "active" : ""
              }`}
              onClick={() => setRightTab("FIELD_SOURCE")}
            >
              [字段来源]
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "RELATION" ? "active" : ""
              }`}
              onClick={() => setRightTab("RELATION")}
            >
              [商品对应]
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "RAW_MATERIAL" ? "active" : ""
              }`}
              onClick={() => setRightTab("RAW_MATERIAL")}
            >
              [原始材料]
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "AI_LOG" ? "active" : ""
              }`}
              onClick={() => setRightTab("AI_LOG")}
            >
              [AI记录]
            </button>

            <button type="button" className="tab-action-collapse" onClick={() => setRightPanelCollapsed((value) => !value)} title={rightPanelCollapsed ? "展开证据" : "收起证据"}>
              {rightPanelCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
            {/* 快速放大/还原按钮 */}
            <button
              type="button"
              className="tab-action-expand"
              onClick={() => setRightPanelWidth((w) => (w >= 650 ? 400 : 720))}
              disabled={rightPanelCollapsed}
              title={
                rightPanelWidth >= 650
                  ? "恢复标准宽度 (460px)"
                  : "向左展开大宽屏查阅 (720px)"
              }
            >
              {rightPanelWidth >= 650 ? (
                <>
                  <ChevronRight size={12} />
                  <span>还原</span>
                </>
              ) : (
                <>
                  <ChevronLeft size={12} />
                  <span>放大</span>
                </>
              )}
            </button>
          </div>

          <div className="evidence-tab-body">
            {/* Tab 1: 字段来源 */}
            {rightTab === "FIELD_SOURCE" && (
              <div className="tab-pane-source">
                <div className="source-context-head">
                  <div className="context-sub">
                    商品 {draft.lines.findIndex((l) => l.id === lineId) + 1} ·{" "}
                    {short(lineId)}
                  </div>
                  <div className="context-field-name">
                    <span>当前字段：</span>
                    <b>{field ?? "未选中"}</b>
                  </div>
                  <div className="context-current-val">
                    当前值：<strong>{value(activeFieldRow?.currentValue)}</strong>
                  </div>
                </div>

                {/* 人工修改保护规则提醒 */}
                {activeFieldRow?.hasHumanOverriddenDiff && (
                  <div className="human-protection-banner">
                    <AlertTriangle size={15} className="text-orange" />
                    <div>
                      <b>人工修改保护生效中：</b>当前值为人工修订值 [{activeFieldRow.currentValue}]。
                      后续AI发现新查货证据 [{activeFieldRow.candidateValue}]，系统已保留人工值，不静默覆盖。
                    </div>
                  </div>
                )}

                {/* 委托书 vs 查货单 多源对照卡片 */}
                <div className="source-compare-card">
                  <div className="compare-block order-block">
                    <span className="block-title">委托书申报原件</span>
                    <div className="source-file-info">
                      <FileSpreadsheet size={13} />
                      <span>
                        {activeFieldRow?.sourceBreakdown.orderSource?.fileName ??
                          "委托Excel原件"}
                      </span>
                    </div>
                    <div className="source-loc-tag">
                      位置：
                      {activeFieldRow?.sourceBreakdown.orderSource?.locationText}
                    </div>
                    <div className="source-val-box">
                      原值：
                      <b>{value(activeFieldRow?.sourceBreakdown.orderSource?.rawValue)}</b>
                    </div>
                  </div>

                  <div className="compare-block inspection-block">
                    <span className="block-title">仓库查货资料</span>
                    {activeFieldRow?.sourceBreakdown.inspectionSource ? (
                      <>
                        <div className="source-file-info">
                          <FileText size={13} />
                          <span>
                            {activeFieldRow.sourceBreakdown.inspectionSource
                              .fileName}
                          </span>
                        </div>
                        <div className="source-loc-tag">
                          批次/位置：
                          {activeFieldRow.sourceBreakdown.inspectionSource
                            .locationText}
                        </div>
                        <div className="source-val-box">
                          实测值：
                          <b>
                            {value(
                              activeFieldRow.sourceBreakdown.inspectionSource
                                .inspectionValue,
                            )}
                          </b>
                        </div>
                      </>
                    ) : (
                      <div className="no-source-hint">
                        <p><b>○ 暂无查货依据</b></p>
                        <span>原因：该商品当前没有可靠查货关系，等待仓储查货材料到达</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI 处理说明 */}
                <div className="source-ai-explanation">
                  <div className="ai-exp-head">
                    <Sparkles size={14} className="text-purple" />
                    <strong>AI 处理依据与判定规则</strong>
                  </div>
                  <p>
                    {activeFieldRow?.sourceBreakdown.aiRuleNote ||
                      (activeFieldRow?.checkStatus === "VERIFIED_CONSISTENT"
                        ? "委托申报值与仓库查货实测数据严格一致，自动核验通过。"
                        : activeFieldRow?.checkStatus === "AI_UPDATED"
                          ? "AI 依据查货单实测事实自动纠偏更新。"
                          : activeFieldRow?.checkStatus === "CONFLICT"
                            ? "委托值与查货值存在出入，请人工裁决采用哪项。"
                            : "等待外部材料补充。")}
                  </p>
                </div>

                {/* 人工修订与快捷处理 */}
                <div className="source-human-editor">
                  <strong>人工修订该字段</strong>
                  <div className="editor-quick-buttons">
                    <button
                      className="secondary btn-sm"
                      onClick={() =>
                        state.editSelectedLineField(
                          lineId,
                          field!,
                          activeFieldRow?.baseValue ?? "",
                          {
                            actor: "人工复核员",
                            occurredAt: new Date().toISOString(),
                            reason: "采纳委托原件数值",
                            locked: false,
                          },
                        )
                      }
                    >
                      采用委托值
                    </button>
                    {activeFieldRow?.candidateValue && (
                      <button
                        className="secondary btn-sm"
                        onClick={() =>
                          state.editSelectedLineField(
                            lineId,
                            field!,
                            activeFieldRow.candidateValue ?? "",
                            {
                              actor: "人工复核员",
                              occurredAt: new Date().toISOString(),
                              reason: "采纳查货实测数值",
                              locked: false,
                            },
                          )
                        }
                      >
                        采用查货值 ({activeFieldRow.candidateValue})
                      </button>
                    )}
                  </div>

                  <div className="editor-input-row">
                    <input
                      type="text"
                      aria-label="修订字段值"
                      defaultValue={activeFieldRow?.currentValue ?? ""}
                      key={`${lineId}-${field}-${activeFieldRow?.currentValue}`}
                      id="manual-field-input"
                    />
                    <button
                      className="primary btn-sm"
                      onClick={() => {
                        const val = (
                          document.getElementById(
                            "manual-field-input",
                          ) as HTMLInputElement
                        )?.value;
                        if (val !== undefined && field) {
                          state.editSelectedLineField(lineId, field, val, {
                            actor: "人工复核员",
                            occurredAt: new Date().toISOString(),
                            reason: "手工录入纠偏",
                            locked: false,
                          });
                        }
                      }}
                    >
                      保存修改
                    </button>
                  </div>
                </div>

                {/* 评测模式下：额外对比分析 */}
                {isEvaluationMode && (
                  <div className="source-eval-compare">
                    <strong>POC 评测基准差异原因剖析</strong>
                    {(() => {
                      const evalF = evaluationReport?.lineResults
                        .find((l) => l.lineId === lineId)
                        ?.fields[field!];
                      if (!evalF) return null;
                      return (
                        <div className="eval-detail-note">
                          <div>
                            AI 判定结果：<b>{value(evalF.aiValue)}</b>
                          </div>
                          <div>
                            标准答案 (GT)：<b>{value(evalF.gtValue)}</b>
                          </div>
                          <div>
                            差异判定：
                            <span className="diff-desc">
                              {evalF.diffDescription}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: 商品对应 (含商品对应概要) */}
            {rightTab === "RELATION" && currentLine && (
              <div className="tab-pane-relation">
                {/* 商品对应概要统计卡片 */}
                <div className="relation-summary-card">
                  <div className="rel-card-title">
                    <strong>商品对应概要</strong>
                    <span className="rel-card-tag">材料商品行匹配概要</span>
                  </div>
                  <div className="rel-stats-grid">
                    <div className="rel-stat-item">
                      <span>委托商品</span>
                      <b>{totalLines}</b>
                    </div>
                    <div className="rel-stat-item">
                      <span>已确定对应</span>
                      <b className="text-green">
                        {verifiedLines.length + needsConfirmLines.length}
                      </b>
                    </div>
                    <div className="rel-stat-item">
                      <span>多个候选</span>
                      <b>0</b>
                    </div>
                    <div className="rel-stat-item">
                      <span>暂无对应</span>
                      <b className={noInspectionLines.length > 0 ? "text-orange" : "text-muted"}>
                        {noInspectionLines.length}
                      </b>
                    </div>
                    <div className="rel-stat-item">
                      <span>涉及查货批次</span>
                      <b>{currentLineSources.length > 0 ? new Set(currentLineSources.map(s => s.warehouseNo)).size : 0}</b>
                    </div>
                    <div className="rel-stat-item">
                      <span>涉及入仓号</span>
                      <b>{currentLineSources.length > 0 ? new Set(currentLineSources.map(s => s.warehouseNo)).size : 0}</b>
                    </div>
                    <div className="rel-stat-item">
                      <span>使用原始行</span>
                      <b>{currentLineSources.length}</b>
                    </div>
                  </div>
                </div>

                <LineActions
                  key={currentLine.id}
                  draft={draft}
                  line={currentLine}
                  sources={state.sources}
                  evidence={state.evidence.filter(
                    (e) => e.entrustmentLineId === currentLine.id,
                  )}
                  onFieldSelect={(f) => selectItem(currentLine.id, f, "FIELD_SOURCE")}
                />
              </div>
            )}

            {/* Tab 3: 原始材料预览 (支持Excel单元格定位和PDF) */}
            {rightTab === "RAW_MATERIAL" && (
              <div className="tab-pane-raw">
                <MaterialPreview
                  key={`${activeFile?.id}-${lineId}-${field}`}
                  location={
                    currentLine?.sourceLocation &&
                    currentLine.sourceLocation.fileId === activeFile?.id
                      ? currentLine.sourceLocation
                      : {
                          fileId: activeFile?.id ?? "",
                          page: 1,
                          sheet: null,
                          position: "原件材料定位",
                        }
                  }
                  name={activeFile?.name ?? "原件"}
                  files={taskFiles}
                  activeFileId={activeFile?.id}
                  onSelectFile={(id) => setSelectedFileId(id)}
                />
              </div>
            )}

            {/* Tab 4: AI 变更轨迹与事件历史 */}
            {rightTab === "AI_LOG" && (
              <div className="tab-pane-ailog">
                <strong>本票 AI 增量推理与事件历史</strong>
                <div className="ailog-timeline">
                  {/* 最新的事件驱动状态展示 */}
                  <div className="timeline-event">
                    <time>{updateTimeStr}</time>
                    <div className="event-type">持续事件监听</div>
                    <p>
                      {draft.lastUpdateReason
                        ? `${draft.lastUpdateReason} · 触发系统增量核对`
                        : "系统持续监听材料事件，并已完成当前材料比对"}
                    </p>
                    <div className="event-summary-note">
                      <span>• 委托商品：共 {totalLines} 行</span>
                      <span>
                        • 已建立依据：
                        {verifiedLines.length + needsConfirmLines.length} 行
                      </span>
                      {noInspectionLines.length > 0 && (
                        <span>• 仍等待查货：{noInspectionLines.length} 行</span>
                      )}
                      <span>• 当前草稿：V{draft.version}</span>
                    </div>
                  </div>

                  {state.operations
                    .filter((o) => o.draftId === draft.id)
                    .slice()
                    .reverse()
                    .map((op) => (
                      <div key={op.id} className="timeline-event">
                        <time>
                          {new Date(op.occurredAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </time>
                        <div className="event-type">{op.operationType}</div>
                        <p>{op.summary}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 完成整票复核检查与核销确认弹窗 */}
      {showFinalizeModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowFinalizeModal(false)}
        >
          <div
            className="finalize-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="整票复核检查与封版核销"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <FileCheck2 size={20} className="text-green" />
                <strong>整票人工复核终审检查</strong>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowFinalizeModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* Checklist 检查表 */}
              <div className="checklist-box">
                <div
                  className={`checklist-item ${
                    finalizeChecklist.allLinesConfirmed
                      ? "is-pass"
                      : "is-blocked"
                  }`}
                >
                  <span className="chk-icon">
                    {finalizeChecklist.allLinesConfirmed ? "✓" : "✕"}
                  </span>
                  <div className="chk-text">
                    <b>商品行逐行确认</b>：
                    <span>
                      {finalizeChecklist.confirmedCount} /{" "}
                      {finalizeChecklist.totalLines} 商品已人工确认
                    </span>
                  </div>
                </div>

                <div
                  className={`checklist-item ${
                    finalizeChecklist.zeroBlockedRelations
                      ? "is-pass"
                      : "is-blocked"
                  }`}
                >
                  <span className="chk-icon">
                    {finalizeChecklist.zeroBlockedRelations ? "✓" : "✕"}
                  </span>
                  <div className="chk-text">
                    <b>商品匹配关系确定</b>：
                    <span>
                      {finalizeChecklist.blockedCount} 个商品缺少查货依据
                    </span>
                  </div>
                </div>

                <div
                  className={`checklist-item ${
                    finalizeChecklist.zeroConflicts ? "is-pass" : "is-blocked"
                  }`}
                >
                  <span className="chk-icon">
                    {finalizeChecklist.zeroConflicts ? "✓" : "✕"}
                  </span>
                  <div className="chk-text">
                    <b>字段冲突清零</b>：
                    <span>
                      {finalizeChecklist.conflictCount} 个未决字段差异
                    </span>
                  </div>
                </div>

                <div
                  className={`checklist-item ${
                    finalizeChecklist.zeroMissingRequired
                      ? "is-pass"
                      : "is-blocked"
                  }`}
                >
                  <span className="chk-icon">
                    {finalizeChecklist.zeroMissingRequired ? "✓" : "✕"}
                  </span>
                  <div className="chk-text">
                    <b>必填字段完整性</b>：
                    <span>
                      {finalizeChecklist.missingCount} 个必填缺失字段
                    </span>
                  </div>
                </div>
              </div>

              {/* 执行核销说明 */}
              <div className="writeoff-explanation-box">
                <strong>确认完成后将正式执行：</strong>
                <ul>
                  <li>✓ 封版当前草稿并生成最终只读核对单（25列标准报关格式）</li>
                  <li>
                    ✓ <b>正式完成使用（正式核销）</b>
                    本次实际匹配关联的原始查货行明细
                  </li>
                  <li>
                    ✓ 这些查货明细将从该客户后续任务的候选匹配池中安全移出
                  </li>
                  <li>✓ 永久保留所有历史材料、对应关系、来源证据与人工修订记录</li>
                </ul>

                <div className="writeoff-simulation">
                  <b>查货池动态核销结果预估：</b>
                  <p>
                    客户：{draft.customerName} · 本次使用原始查货行{" "}
                    <b>{verifiedLines.length + needsConfirmLines.length}</b> 条 · 已核验查货行将正式核销 ·
                    历史可追溯。
                  </p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="secondary"
                onClick={() => setShowFinalizeModal(false)}
              >
                返回继续复核
              </button>
              <button
                className="primary"
                disabled={!canFinalize}
                onClick={() => {
                  state.completeSelectedDraft();
                  setShowFinalizeModal(false);
                  setWriteoffFeedbackOpen(true);
                }}
              >
                {canFinalize ? "确认完成并正式核销封版" : "仍有阻塞项未完成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完成整票复核后的核销反馈结果弹窗 */}
      {writeoffFeedbackOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setWriteoffFeedbackOpen(false)}
        >
          <div
            className="writeoff-result-modal"
            role="dialog"
            aria-modal="true"
            aria-label="整票复核完成与核销反馈"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="result-head">
              <div className="result-icon-badge">
                <CheckCircle2 size={36} className="text-green" />
              </div>
              <h3>整票复核完成</h3>
              <p className="result-sub">
                最终核对单已生成并封版，当前队列还有 {remainingTaskCount} 票待处理
              </p>
            </div>

            <div className="result-details-grid">
              <div className="result-item">
                <span className="item-label">最终核对单</span>
                <strong className="item-val">
                  {finalReconciliationFileName(draft.displayNo, draft.version)}
                </strong>
                <span className="item-tag tag-green">已生成 (只读)</span>
              </div>
              <div className="result-item">
                <span className="item-label">本次实际使用查货明细</span>
                <strong className="item-val">
                  {verifiedLines.length + needsConfirmLines.length} 条
                </strong>
                <span className="item-tag">已完成使用</span>
              </div>
              <div className="result-item">
                <span className="item-label">客户查货池动态</span>
                <strong className="item-val">
                  原可匹配 {state.sources.filter((s) => s.customerId === draft.customerId).length + (verifiedLines.length + needsConfirmLines.length)} 条 → 剩余 {state.sources.filter((s) => s.customerId === draft.customerId && s.availability === "可匹配").length} 条
                </strong>
                <span className="item-tag tag-blue">完成核销</span>
              </div>
              <div className="result-item full-width">
                <span className="item-label">历史追溯与合规留痕</span>
                <p className="item-desc">
                  原始委托材料、查货单原件、AI核对记录、商品对应关系及人工修改历史均已全量保留归档。本次使用的查货明细已正式移出该客户后续任务的候选匹配池，不可重复占用。
                </p>
              </div>
            </div>

            <div className="result-actions">
              <button className="secondary" onClick={exportCsv}>
                <Download size={14} /> 导出最终核对单
              </button>
              <button className="secondary" onClick={() => { setWriteoffFeedbackOpen(false); state.setView("home"); }}>返回客户工作台</button>
              {nextPendingTask && <button className="primary" onClick={() => { setWriteoffFeedbackOpen(false); switchDraft(nextPendingTask.id); }}>进入下一票 <ChevronRight size={14} /></button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
