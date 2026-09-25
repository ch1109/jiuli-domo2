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
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Info,
  Layers,
  LockKeyhole,
  Maximize2,
  RotateCcw,
  Save,
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
  getManuallyModifiedLineIds,
  getMultiFileEvidenceContext,
  getP4FieldDecisions,
  INSPECTION_EVALUATED_FIELDS,
  type FieldRow,
  type LineReconStatus,
  type FieldCheckStatusType,
  type MultiFileEvidenceContext,
  type P4FieldDecisionInfo,
} from "@/lib/workbench-model";
import { getTaskSummary } from "@/lib/workspace-status";
import { getInspectionAvailability } from "@/lib/inspection-availability";
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
import { MultiEvidenceInspector } from "./multi-evidence-inspector";
import { CommodityRelations, LineActions } from "./workbench-relations";
import * as XLSX from "xlsx";

const value = (v: string | null | undefined) => v || "—";
const short = (id: string) => id.split("-").at(-1) || id;

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
        getLineReconStatus(
          l,
          rowsByLine.get(l.id) ?? [],
          state.sources,
          getInspectionAvailability(draft, l, state.sources, state.scenarioId === "BUSINESS"),
        ),
      ]),
    );
  }, [draft, rowsByLine, state.sources, state.scenarioId]);

  // 3. UI 交互状态
  const [lineId, setLineId] = useState(draft?.lines[0]?.id ?? "");
  const [field, setField] = useState<FinalOutputField | null>("型号");
  const [fieldMode, setFieldMode] = useState<"CORE" | "ALL">("ALL"); // 默认直接展示全部25字段
  const [lineNavFilter, setLineNavFilter] = useState<
    "ALL" | "VERIFIED_OK" | "NEEDS_CONFIRM" | "CANDIDATES" | "NO_INSPECTION" | "CONFIRMED"
  >("ALL");
  const [draftTableFilter, setDraftTableFilter] = useState<
    "ALL" | "PROBLEMS_ONLY" | "UNCONFIRMED_ONLY" | "MISMATCH_ONLY" | "MISSING_ONLY" | "AI_FALSE_POSITIVE"
  >("ALL");
  const [problemFilter, setProblemFilter] = useState<"ALL" | "RELATION" | "CONFLICT" | "MISSING">("ALL");

  useEffect(() => {
    if (!draft) return;
    const focus = state.lastVisitedPanel;
    if (focus.startsWith("line:")) {
      const target = focus.slice(5);
      if (draft.lines.some((line) => line.id === target)) {
        setLineId(target);
        setRightTab("INSPECTION_BASIS");
      }
    } else if (focus === "evidence") {
      setRightTab("INSPECTION_BASIS");
    } else if (focus === "issues") {
      setProblemFilter("RELATION");
    }
  }, [draft, state.lastVisitedPanel]);

  // 右侧 Tab：字段来源 / 查货核验依据 / 原始材料 / 核验结论 (+ POC评测模式下：标准答案差异)
  const [rightTab, setRightTab] = useState<
    "FIELD_SOURCE" | "INSPECTION_BASIS" | "RAW_MATERIAL" | "VERIFY_DECISION" | "EVAL_DIFF"
  >("VERIFY_DECISION");

  // Tab 4 (核验结论) 筛选状态
  const [p4Filter, setP4Filter] = useState<
    "ALL" | "CONFLICT" | "UPDATE" | "MISSING" | "KEEP" | "NO_ACTION"
  >("ALL");

  // 核对记录视角：当前商品 vs 整票任务
  const [reconLogScope, setReconLogScope] = useState<"CURRENT_LINE" | "ALL_TASK">("CURRENT_LINE");

  // 精确原件定位跳转状态
  const [targetMaterialLocation, setTargetMaterialLocation] = useState<SourceLocation | null>(null);

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

  const modifiedLineIds = getManuallyModifiedLineIds(draft.id, state.operations);
  const lastResultSave = state.resultSaves?.[draft.id];

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
  const candidateLines = allStatuses.filter((s) => s.aiStatus === "CANDIDATES");
  const confirmedLines = allStatuses.filter(
    (s) => s.humanStatus === "CONFIRMED",
  );

  // 人工需处理问题（必须处理）
  const blockedRelations = draft.lines.filter((l) => !l.relationSourceId && l.relationSourceIds.length === 0);
  const waitingMaterialLines = blockedRelations.filter((l) => lineStatuses.get(l.id)?.aiStatus === "NO_INSPECTION");
  const pendingRelationLines = blockedRelations.filter((l) => lineStatuses.get(l.id)?.aiStatus === "CANDIDATES");
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
  const waitingMaterialCount = waitingMaterialLines.length;
  const conflictCount = conflictFieldsTotal.length;
  const mustHandleCount =
    blockedRelations.length +
    conflictFieldsTotal.length +
    missingRequiredTotal.length +
    explicitLineIssues.length;

  // AI 风险提示（建议关注，带自动路由 Tab）
  const aiRiskItems = (() => {
    const list: Array<{
      lineId: string;
      level: "warn" | "info";
      title: string;
      desc: string;
      targetTab: "FIELD_SOURCE" | "INSPECTION_BASIS" | "RAW_MATERIAL" | "VERIFY_DECISION";
      targetField?: FinalOutputField;
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
            targetTab: "VERIFY_DECISION",
            targetField: "净重",
          });
        }
      }
      if (l.relationSourceIds.length > 1) {
        list.push({
          lineId: l.id,
          level: "info",
          title: `商品 ${String(idx + 1).padStart(2, "0")} 多批次查货组合`,
          desc: `当前商品行对应了 ${l.relationSourceIds.length} 条原始查货明细`,
          targetTab: "INSPECTION_BASIS",
        });
      }
      if (gwRow?.evidence.some((e) => e.modelDecision?.reason?.includes("分配") || e.modelDecision?.reason?.includes("均摊"))) {
        list.push({
          lineId: l.id,
          level: "info",
          title: `商品 ${String(idx + 1).padStart(2, "0")} 毛重来自系统比例分配`,
          desc: "根据箱规及委托件数自动分摊整单毛重",
          targetTab: "VERIFY_DECISION",
          targetField: "毛重",
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

  // 当前商品是否有查货依据关系
  const hasRelation = Boolean(
    (currentLine?.relationSourceIds && currentLine.relationSourceIds.length > 0) ||
      currentLine?.relationSourceId,
  );

  // 4. 计算当前选定商品的 P4 结构化字段核验决策 (严格对齐 P4 VERIFY_FIELDS 规范)
  const p4Decisions = useMemo(() => {
    if (!currentLine) return [];
    return getP4FieldDecisions(currentLine, currentRows, currentLineSources);
  }, [currentLine, currentRows, currentLineSources]);

  const activeP4Decision = useMemo(() => {
    return p4Decisions.find((d) => d.field === field) ?? p4Decisions[0];
  }, [p4Decisions, field]);

  // 多文件同屏证据透视弹窗状态
  const [isMultiEvidenceOpen, setIsMultiEvidenceOpen] = useState(false);
  // 原始材料 Tab 呈现模式：SPLIT（同屏多文件并排对比） vs SINGLE（单文件查阅）
  const [rawMaterialMode, setRawMaterialMode] = useState<"SPLIT" | "SINGLE">("SPLIT");

  // 多文件同屏证据上下文
  const multiEvidenceContext = useMemo(() => {
    if (!currentLine) return null;
    return getMultiFileEvidenceContext(
      field || "型号",
      currentLine,
      currentLineSources,
      state.files,
      state.evidence,
      draft,
      state.sources,
    );
  }, [currentLine, field, currentLineSources, state.files, state.evidence, draft, state.sources]);

  // 一键打开同屏多文件证据透视弹窗
  const openMultiEvidenceInspector = (targetField?: FinalOutputField) => {
    if (targetField) setField(targetField);
    setIsMultiEvidenceOpen(true);
  };

  // 一键跳转到原始材料并高亮定位
  const jumpToMaterial = (fileId: string, loc?: Partial<SourceLocation>) => {
    if (fileId) setSelectedFileId(fileId);
    if (loc) {
      setTargetMaterialLocation({
        fileId: fileId || loc.fileId || "",
        page: loc.page ?? 1,
        sheet: loc.sheet ?? null,
        row: loc.row ?? null,
        column: loc.column ?? null,
        position: loc.position ?? "原件材料定位",
      });
    }
    setRightTab("RAW_MATERIAL");
    if (window.innerWidth <= 680) setMobileDrawer("right");
  };

  // 切换商品与聚焦字段（实现点击单元格/行号与右侧 Tab 强联动）
  const selectItem = (
    targetLineId: string,
    targetField?: FinalOutputField,
    forceTab?: "FIELD_SOURCE" | "INSPECTION_BASIS" | "RAW_MATERIAL" | "VERIFY_DECISION" | "EVAL_DIFF",
  ) => {
    setLineId(targetLineId);
    if (forceTab) {
      setRightTab(forceTab);
      if (targetField) setField(targetField);
    } else if (targetField) {
      setField(targetField);
      // 点击字段单元格，默认打开【核验结论】Tab
      setRightTab("VERIFY_DECISION");
    } else {
      // 未指定字段且未指定 Tab 时（点击商品行/行号），自动切换到【查货核验依据】Tab
      setRightTab("INSPECTION_BASIS");
    }
    if (window.innerWidth <= 680) setMobileDrawer("right");

    // 平滑滚动定位中间表格对应行
    requestAnimationFrame(() => {
      const el = document.getElementById(`draft-row-${targetLineId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  // 结构化核对记录（业务事件历史轨迹，支持区分系统自动/人工操作/材料变化）
  const allReconciliationLogs = useMemo(() => {
    if (!draft) return [];

    const lineMap = new Map(draft.lines.map((l, idx) => [l.id, { line: l, idx }]));
    const ops = state.operations.filter(
      (o) => !o.draftId || o.draftId === draft.id,
    );
    const versions = state.versions.filter((v) => v.draftId === draft.id);

    const logs: Array<{
      id: string;
      occurredAt: string;
      timeStr: string;
      category: "SYSTEM" | "HUMAN" | "MATERIAL";
      categoryLabel: "[系统自动]" | "[人工操作]" | "[材料变化]";
      title: string;
      reason: string;
      actor: string;
      draftVersion: string;
      affectedLineIds: string[];
      affectedLineNames: string[];
      changes: Array<{
        lineName?: string;
        item: string;
        before: string;
        after: string;
      }>;
    }> = [];

    ops.forEach((op) => {
      let category: "SYSTEM" | "HUMAN" | "MATERIAL" = "SYSTEM";
      let categoryLabel: "[系统自动]" | "[人工操作]" | "[材料变化]" = "[系统自动]";
      let actor = "系统自动";

      if (
        op.operationType === "新增查货" ||
        op.operationType === "新建委托" ||
        op.summary.includes("材料") ||
        op.summary.includes("批次") ||
        op.summary.includes("导入")
      ) {
        category = "MATERIAL";
        categoryLabel = "[材料变化]";
        actor = op.actorType === "人工操作" ? "操作员 / 仓储" : "仓储系统接入";
      } else if (
        op.actorType === "人工操作" ||
        op.operationType.includes("人工") ||
        op.operationType.includes("选择候选") ||
        op.operationType.includes("解除")
      ) {
        category = "HUMAN";
        categoryLabel = "[人工操作]";
        actor = "人工复核员";
      } else {
        category = "SYSTEM";
        categoryLabel = "[系统自动]";
        actor = "AI 自动核对引擎";
      }

      const affectedLineIds = (op.affectedEntrustmentLineIds || []) as string[];
      const affectedLineNames = affectedLineIds
        .map((id) => {
          const item = lineMap.get(id);
          return item ? `商品 ${String(item.idx + 1).padStart(2, "0")}` : short(id);
        })
        .filter(Boolean);

      const changes: Array<{ lineName?: string; item: string; before: string; after: string }> = [];

      const ver = versions.find(
        (v) => Math.abs(new Date(v.createdAt).getTime() - new Date(op.occurredAt).getTime()) < 3000,
      );

      if (ver && ver.before && ver.after) {
        ver.changedLineIds.forEach((cId) => {
          const beforeLine = ver.before.find((b) => b.entrustmentLineId === cId);
          const afterLine = ver.after.find((a) => a.entrustmentLineId === cId);
          const itemMeta = lineMap.get(cId);
          const linePrefix = itemMeta ? `商品 ${String(itemMeta.idx + 1).padStart(2, "0")}` : short(cId);

          if (beforeLine && afterLine) {
            if (beforeLine.matchRelationIds?.length !== afterLine.matchRelationIds?.length) {
              changes.push({
                lineName: linePrefix,
                item: "商品关系",
                before: beforeLine.matchRelationIds?.length ? `已绑定 (${beforeLine.matchRelationIds.length}条)` : "暂无对应",
                after: afterLine.matchRelationIds?.length ? `已绑定 (${afterLine.matchRelationIds.length}条)` : "已解除释放",
              });
            }
            if (beforeLine.status !== afterLine.status) {
              changes.push({
                lineName: linePrefix,
                item: "核对状态",
                before: beforeLine.status || "待查货",
                after: afterLine.status || "核对完成",
              });
            }
            FINAL_OUTPUT_FIELDS.forEach((f) => {
              const bVal = beforeLine.fields[f];
              const aVal = afterLine.fields[f];
              if (bVal !== aVal && (bVal || aVal)) {
                changes.push({
                  lineName: linePrefix,
                  item: f,
                  before: bVal || "空",
                  after: aVal || "空",
                });
              }
            });
          }
        });
      }

      if (changes.length === 0) {
        if (op.operationType === "人工编辑字段" && affectedLineNames[0]) {
          changes.push({
            lineName: affectedLineNames[0],
            item: "字段修改",
            before: "前序值",
            after: "人工修订值",
          });
        } else if (op.operationType.includes("候选") || op.operationType.includes("关系")) {
          changes.push({
            lineName: affectedLineNames[0] || "选定商品",
            item: "商品关系",
            before: "待人工选择",
            after: "已确定查货依据",
          });
        } else if (op.operationType === "解除匹配") {
          changes.push({
            lineName: affectedLineNames[0] || "选定商品",
            item: "商品关系",
            before: "已建立对应",
            after: "已解除释放",
          });
        }
      }

      const d = new Date(op.occurredAt);
      const timeStr = isNaN(d.getTime())
        ? "刚刚"
        : d.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

      logs.push({
        id: op.id,
        occurredAt: op.occurredAt,
        timeStr,
        category,
        categoryLabel,
        title: op.operationType,
        reason: op.summary || "系统业务流转记录",
        actor,
        draftVersion: ver ? `草稿 V${ver.version}` : `草稿 V${draft.version}`,
        affectedLineIds,
        affectedLineNames,
        changes,
      });
    });

    if (logs.length <= 1) {
      const initTime = new Date(draft.createdAt || Date.now() - 3600000);
      const timeStr1 = initTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      const timeStr2 = new Date(initTime.getTime() + 60000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

      logs.unshift(
        {
          id: `INIT-MAT-${draft.id}`,
          occurredAt: initTime.toISOString(),
          timeStr: timeStr1,
          category: "MATERIAL",
          categoryLabel: "[材料变化]",
          title: "导入委托原件材料",
          reason: `客户【${draft.customerName}】委托材料导入，包含 ${draft.lines.length} 行商品申报项`,
          actor: "客户提交 / 报关系统",
          draftVersion: "草稿 V0",
          affectedLineIds: draft.lines.map((l) => l.id),
          affectedLineNames: draft.lines.map((_, i) => `商品 ${String(i + 1).padStart(2, "0")}`),
          changes: [
            {
              item: "委托商品",
              before: "无",
              after: `已解析导入 ${draft.lines.length} 行`,
            },
          ],
        },
        {
          id: `INIT-AUTO-${draft.id}`,
          occurredAt: new Date(initTime.getTime() + 60000).toISOString(),
          timeStr: timeStr2,
          category: "SYSTEM",
          categoryLabel: "[系统自动]",
          title: "AI 首次智能核对与关系扫描",
          reason: "系统自动排查可用客户查货池，执行型号、品牌与物料号规则比对",
          actor: "AI 自动核对引擎",
          draftVersion: "草稿 V1",
          affectedLineIds: draft.lines.map((l) => l.id),
          affectedLineNames: draft.lines.map((_, i) => `商品 ${String(i + 1).padStart(2, "0")}`),
          changes: [
            {
              item: "商品关系扫描",
              before: "未核对",
              after: `${draft.lines.filter((l) => l.relationSourceIds?.length > 0).length} 行已自动建立对应，${draft.lines.filter((l) => !l.relationSourceIds?.length).length} 行等待查货`,
            },
          ],
        },
      );
    }

    return logs.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [draft, state.operations, state.versions]);

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
  } else if (candidateLines.length > 0) {
    taskStatusText = `待确认商品对应 (${candidateLines.length})`;
    taskStatusClass = "needs-attention";
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
      if (taskQueueFilter === "WAITING") return item.lines.some((line) => getInspectionAvailability(item, line, state.sources, state.scenarioId === "BUSINESS") === "MISSING");
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
    const waiting = item.lines.filter((line) => getInspectionAvailability(item, line, state.sources, state.scenarioId === "BUSINESS") === "MISSING").length;
    const candidates = item.lines.filter((line) => getInspectionAvailability(item, line, state.sources, state.scenarioId === "BUSINESS") === "CANDIDATES").length;
    const confirmed = item.lines.filter((line) => line.manuallyConfirmed).length;
    const issues = item.lines.filter((line) => !line.manuallyConfirmed && line.issueIds.length > 0).length;
    if (waiting === item.lines.length) return "等待查货";
    if (candidates > 0) return "待确认对应";
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
                    const itemMatched = item.lines.filter((line) => getInspectionAvailability(item, line, state.sources, state.scenarioId === "BUSINESS") !== "MISSING").length;
                    const itemIssues = item.lines.filter((line) => !line.manuallyConfirmed && line.issueIds.length > 0).length;
                    return <button key={item.id} className={`task-list-item ${item.id === draft.id ? "current" : ""}`} onClick={() => switchDraft(item.id)}>
                      <div className="task-list-top"><b>{item.displayNo}</b><span className={`task-state task-state-${getTaskCardStatus(item)}`}>{getTaskCardStatus(item)}</span></div>
                      <div className="task-list-customer">{item.customerName}</div>
                      <div className="task-list-meta"><span>{itemMatched}/{item.lines.length} 个商品有查货依据或候选</span>{itemIssues > 0 && <span className="task-issue">{itemIssues} 个问题</span>}</div>
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
            <span>版本与操作</span>
          </button>

          <button className="secondary" onClick={exportCsv}>
            <Download size={15} />
            <span>{draft.finalized ? "导出最终核对单" : "导出草稿预览"}</span>
          </button>

          {!draft.finalized && (
            <button className="secondary recon-save-btn" onClick={state.saveSelectedDraftResults} title="保存当前整票核对结果，稍后可以继续修改">
              <Save size={15} />
              <span>保存结果</span>
            </button>
          )}

          {!draft.finalized && (
            <div className="finalize-action-container">
              <button
                className={`primary recon-finalize-btn ${!canFinalize ? "is-disabled" : ""}`}
                disabled={!canFinalize}
                onClick={() => setShowFinalizeModal(true)}
                onMouseEnter={() => setShowChecklistPopover(true)}
                onMouseLeave={() => setShowChecklistPopover(false)}
              >
                <CheckCircle2 size={15} />
                <span>整票通过复核</span>
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
          <div className="compact-status-message"><span className="live-dot" /><strong>{draft.finalized ? "当前任务已封版" : candidateLines.length > 0 ? `已找到 ${candidateLines.length} 个商品的查货候选，待确认对应` : mustHandleCount > 0 ? `AI 已暂停，等待处理 ${mustHandleCount} 个问题` : noInspectionLines.length > 0 ? "AI 正在等待查货材料" : "AI 已完成当前自动核对"}</strong><span>{noInspectionLines.length > 0 ? `${noInspectionLines.length} 个商品仍等待查货；` : "无商品等待查货材料；"}{candidateLines.length > 0 ? `${candidateLines.length} 个商品待建立对应；` : ""}{mustHandleCount > 0 ? `还有 ${mustHandleCount} 个待处理项。` : "当前没有必须处理的问题。"}</span></div>
          <button className="recent-check-button" onClick={() => setRightTab("VERIFY_DECISION")}><Sparkles size={14} />最近自动核对 {updateTimeStr}<ChevronRight size={13} /></button>
        </div>
        <div className="compact-status-meta"><span>触发原因：{draft.lastUpdateReason || "查货材料到达"}</span><span>草稿 V{draft.version}</span><span className="autosave-note"><Check size={12} /> 已自动保存 {updateTimeStr}</span>{lastResultSave && <span className="result-save-note"><Save size={12} /> 上次保存 {new Date(lastResultSave.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
        <div className="recon-metric-tiles compact-metrics">
          <div className="metric-tile"><span className="metric-label">全部商品</span><strong className="metric-num">{totalLines}</strong></div>
          <div className="metric-tile"><span className="metric-label">AI已核对</span><strong className="metric-num text-green">{verifiedLines.length + needsConfirmLines.length}</strong></div>
          <div className="metric-tile"><span className="metric-label">有查货候选</span><strong className="metric-num text-blue">{candidateLines.length}</strong></div>
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

      {/* 历史版本与操作记录抽屉 (整票演进与操作流转统一归宿) */}
      {historyOpen && (
        <section className="recon-history" aria-label="草稿版本与操作">
          <div className="history-head">
            <div className="history-head-title-group">
              <History size={16} className="text-teal" />
              <strong>版本演进与全票操作轨迹</strong>
            </div>
            <div className="history-head-actions">
              <div className="recon-log-scope-tabs" role="radiogroup">
                <button
                  type="button"
                  className={`scope-btn ${reconLogScope === "CURRENT_LINE" ? "active" : ""}`}
                  onClick={() => setReconLogScope("CURRENT_LINE")}
                >
                  当前商品 ({draft.lines.findIndex((l) => l.id === lineId) + 1})
                </button>
                <button
                  type="button"
                  className={`scope-btn ${reconLogScope === "ALL_TASK" ? "active" : ""}`}
                  onClick={() => setReconLogScope("ALL_TASK")}
                >
                  整票任务 ({allReconciliationLogs.length})
                </button>
              </div>
              <button
                className="icon-button"
                onClick={() => setHistoryOpen(false)}
                title="关闭抽屉"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="history-body">
            {/* 业务操作与事件流 */}
            <div className="history-events-stream">
              {(() => {
                const logs =
                  reconLogScope === "CURRENT_LINE"
                    ? allReconciliationLogs.filter((log) =>
                        log.affectedLineIds.includes(lineId),
                      )
                    : allReconciliationLogs;

                if (logs.length === 0) {
                  return (
                    <div className="recon-log-empty">
                      <p>当前范围暂无专属人工操作或二次变更轨迹</p>
                      <span>可切换至【整票任务】查看全票材料导入与批次演进历史</span>
                    </div>
                  );
                }

                return logs.map((log) => (
                  <div key={log.id} className="log-event-card">
                    <div className="event-top-bar">
                      <span
                        className={`log-source-tag ${
                          log.category === "SYSTEM"
                            ? "tag-sys"
                            : log.category === "HUMAN"
                              ? "tag-human"
                              : "tag-mat"
                        }`}
                      >
                        {log.categoryLabel}
                      </span>
                      <time className="event-time">{log.timeStr}</time>
                      <span className="event-version-pill">{log.draftVersion}</span>
                    </div>

                    <div className="event-main-title">
                      <strong>{log.title}</strong>
                      <span className="event-actor">{log.actor}</span>
                    </div>

                    <p className="event-reason">{log.reason}</p>

                    {/* 影响商品 */}
                    {log.affectedLineNames.length > 0 && (
                      <div className="event-affected-row">
                        <span className="affected-lbl">影响商品：</span>
                        <div className="affected-chips-wrap">
                          {log.affectedLineNames.map((name, idx) => {
                            const targetId = log.affectedLineIds[idx];
                            return (
                              <button
                                key={idx}
                                type="button"
                                className={`affected-chip ${targetId === lineId ? "is-current" : ""}`}
                                onClick={() => {
                                  if (targetId) selectItem(targetId, undefined, "VERIFY_DECISION");
                                }}
                                title="点击在中间表格定位该商品"
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 结构化前后对比明细 (Before → After) */}
                    {log.changes.length > 0 && (
                      <div className="event-changes-box">
                        <div className="changes-box-title">变更明细前后对比：</div>
                        <div className="changes-list">
                          {log.changes.map((ch, idx) => (
                            <div key={idx} className="change-row-item">
                              {ch.lineName && (
                                <span className="change-line-tag">{ch.lineName}</span>
                              )}
                              <span className="change-field-name">{ch.item}</span>
                              <span className="change-before-val">{ch.before || "空"}</span>
                              <span className="change-arrow">→</span>
                              <span className="change-after-val">{ch.after || "空"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>

            {/* 底层版本快照折叠 */}
            <div className="history-versions-section">
              <div className="ver-section-title">全票草稿版本快照（历史留痕）</div>
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
          </div>
        </section>
      )}

      <div className="recon-mobile-panels" aria-label="工作台面板">
        <button className="secondary" onClick={() => setMobileDrawer("left")}><Layers size={14} />商品与问题</button>
        <button className="secondary" onClick={() => setMobileDrawer("right")}><Eye size={14} />字段证据</button>
      </div>
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
          <button className="recon-drawer-close" aria-label="关闭商品与问题面板" onClick={() => setMobileDrawer(null)}><X size={17} /></button>
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
              <button className={`filter-chip chip-blue ${lineNavFilter === "CANDIDATES" ? "active" : ""}`} onClick={() => setLineNavFilter("CANDIDATES")}>◇ 待确认对应 {candidateLines.length}</button>
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
                  if (lineNavFilter === "CANDIDATES")
                    return st?.aiStatus === "CANDIDATES";
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
                          : itemStatus?.hasInspection || itemStatus?.aiStatus === "CANDIDATES"
                            ? "has-inspection"
                            : "no-inspection"
                      }`}
                      onClick={() => selectItem(item.id, undefined, "INSPECTION_BASIS")}
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
                          <span className={`badge-line-modified ${modifiedLineIds.has(item.id) ? "is-modified" : "is-untouched"}`}>
                            {modifiedLineIds.has(item.id) ? "已修改" : "未修改"}
                          </span>
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
                {([["ALL", "全部", mustHandleCount], ["RELATION", "商品对应 / 缺查货", blockedRelations.length], ["CONFLICT", "字段冲突", conflictCount], ["MISSING", "必填缺失", missingRequiredTotal.length]] as const).map(([key, label, count]) => <button key={key} className={problemFilter === key ? "active" : ""} onClick={() => setProblemFilter(key)}>{label} <b>{count}</b></button>)}
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
                          onClick={() => selectItem(lId, r.field, "VERIFY_DECISION")}
                        >
                          <div className="problem-card-head">
                            <AlertTriangle size={13} className="text-red" />
                            <b>{short(lId)} · 必填项【{r.field}】缺失</b>
                          </div>
                          <p className="problem-card-desc">报关必须填报该字段，当前可提前补全</p>
                          <div className="problem-card-foot">
                            <span className="action-link">在核验结论中补全 →</span>
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
                    {waitingMaterialLines.map((l) => (
                      <div
                        key={`rel-${l.id}`}
                        className="problem-action-card card-waiting-mat"
                        onClick={() => selectItem(l.id, "型号", "INSPECTION_BASIS")}
                      >
                        <div className="problem-card-head">
                          <AlertTriangle size={13} className="text-orange" />
                          <b>{short(l.id)} · 尚未关联查货依据</b>
                        </div>
                        <p className="problem-card-desc">系统持续监听中；也可在右侧手动指定</p>
                        <div className="problem-card-foot">
                          <span className="action-link">查看查货依据 →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingRelationLines.length > 0 && (problemFilter === "ALL" || problemFilter === "RELATION") && (
                  <div className="problem-subgroup">
                    <div className="subgroup-title text-orange"><span>◇ 待确认商品对应 ({pendingRelationLines.length})</span><small>已有查货候选，需确定关联后核验字段</small></div>
                    {pendingRelationLines.map((l) => <div key={`candidate-${l.id}`} className="problem-action-card card-waiting-mat" onClick={() => selectItem(l.id, "型号", "INSPECTION_BASIS") }><div className="problem-card-head"><Info size={13} /><b>{short(l.id)} · 已找到查货候选</b></div><p className="problem-card-desc">请检查候选明细并建立商品对应</p><div className="problem-card-foot"><span className="action-link">查看候选依据 →</span></div></div>)}
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
                          onClick={() => selectItem(lId, r.field, "VERIFY_DECISION")}
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
                            <span className="action-link">前往核验结论裁决 →</span>
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
                    onClick={() => selectItem(risk.lineId, risk.targetField, risk.targetTab)}
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
                      onClick={() => selectItem(lineId, f, "FIELD_SOURCE")}
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
                              selectItem(l.id, undefined, "INSPECTION_BASIS")
                            }
                            title="点击选定该商品行并在右侧查看查货核验依据"
                          >
                            <b>
                              {String(draft.lines.indexOf(l) + 1).padStart(
                                2,
                                "0",
                              )}
                            </b>
                            <small>{short(l.id)}</small>
                            <span className={`row-modified-label ${modifiedLineIds.has(l.id) ? "is-modified" : "is-untouched"}`}>
                              {modifiedLineIds.has(l.id) ? "已修改" : "未修改"}
                            </span>
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
                                {lStatus.aiStatus === "CANDIDATES" ? "待确认对应" : "等待查货"}
                              </span>
                              <button
                                className="action-btn-manual-rel"
                                onClick={() =>
                                  selectItem(l.id, "型号", "INSPECTION_BASIS")
                                }
                                title="在右侧「查货核验依据」手动指定依据"
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
                                    "VERIFY_DECISION",
                                  );
                                }}
                                title="定位到问题字段并查看核验结论"
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
                              role="button"
                              tabIndex={0}
                              aria-label={`查看${l.model}的${f}核验结论`}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectItem(l.id, f, "VERIFY_DECISION"); } }}
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
                                selectItem(l.id, f, "VERIFY_DECISION")
                              }
                              onDoubleClick={() => {
                                selectItem(l.id, f, "VERIFY_DECISION");
                                openMultiEvidenceInspector(f);
                              }}
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
                                    {r?.currentValue?.trim().toUpperCase() === "UNKNOWN" ? "—" : value(r?.currentValue)}
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
                                  {isCurrentActive && (
                                    <button
                                      type="button"
                                      className="cell-inspect-shortcut-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMultiEvidenceInspector(f);
                                      }}
                                      title={`双击或点击：同屏查看各文件关于「${f}」的原文定位与采信理由`}
                                    >
                                      <Eye size={10} />
                                    </button>
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectItem(l.id, f, "VERIFY_DECISION");
                                    }}
                                    title={`点击查看核验结论 | 原委托: ${value(r.baseValue)} -> 查货实测: ${value(r.candidateValue)}`}
                                  >
                                    <span>✦ AI纠偏</span>
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectItem(l.id, f, "VERIFY_DECISION");
                                    }}
                                    title={
                                      r.hasHumanOverriddenDiff
                                        ? `点击查看核验结论 | 后续AI查货新发现：${value(r.candidateValue)}`
                                        : "点击查看人工修改记录"
                                    }
                                  >
                                    <span>✍ 人工修订</span>
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
          <button className="recon-drawer-close" aria-label="关闭字段证据面板" onClick={() => setMobileDrawer(null)}><X size={17} /></button>
          {/* 四大 Tab 切换与快速放大按钮 (+ POC 评测模式下：标准答案差异) */}
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
              字段来源
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "INSPECTION_BASIS" ? "active" : ""
              }`}
              onClick={() => setRightTab("INSPECTION_BASIS")}
            >
              查货核验依据
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "RAW_MATERIAL" ? "active" : ""
              }`}
              onClick={() => setRightTab("RAW_MATERIAL")}
            >
              原始材料
            </button>
            <button
              className={`evidence-tab ${
                rightTab === "VERIFY_DECISION" ? "active" : ""
              }`}
              onClick={() => setRightTab("VERIFY_DECISION")}
            >
              核验结论
            </button>
            {isEvaluationMode && (
              <button
                className={`evidence-tab eval-diff-tab ${
                  rightTab === "EVAL_DIFF" ? "active" : ""
                }`}
                onClick={() => setRightTab("EVAL_DIFF")}
              >
                标准答案差异
              </button>
            )}

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

          {/* 右侧面板公共常驻上下文条：显示当前选中的商品与字段，切 Tab 不迷失 */}
          <div className="recon-context-bar">
            <div className="context-item-commodity">
              <span className="context-commodity-no">
                商品 {String(draft.lines.findIndex((l) => l.id === lineId) + 1).padStart(2, "0")}
              </span>
              <span className="context-commodity-id">{short(lineId)}</span>
              <span className="context-commodity-model" title={currentLine?.model}>
                {currentLine?.model || "未命名商品"}
              </span>
            </div>
            <div className="context-divider">/</div>
            <div className="context-item-field">
              <span className="context-field-label">当前聚焦：</span>
              <b className="context-field-name">{field || "整行关系"}</b>
              {field && activeFieldRow?.currentValue && (
                <span className="context-field-badge" title={activeFieldRow.currentValue}>
                  {value(activeFieldRow.currentValue)}
                </span>
              )}
            </div>
          </div>

          <div className="evidence-tab-body">
            {/* Tab 1: 字段来源 (规范四层结构) */}
            {rightTab === "FIELD_SOURCE" && (
              <div className="tab-pane-source">
                {/* 1. 当前结果 */}
                <div className="source-result-box">
                  <div className="result-box-top">
                    <span className="result-label">当前核对单结果</span>
                    <span className={`result-status-badge ${
                      activeFieldRow?.checkStatus === "VERIFIED_CONSISTENT"
                        ? "badge-verified"
                        : activeFieldRow?.checkStatus === "AI_UPDATED"
                          ? "badge-updated"
                          : activeFieldRow?.checkStatus === "CONFLICT"
                            ? "badge-conflict"
                            : activeFieldRow?.checkStatus === "HUMAN_MODIFIED"
                              ? "badge-human"
                              : "badge-pending"
                    }`}>
                      {activeFieldRow?.checkStatus === "VERIFIED_CONSISTENT"
                        ? "✓ 核对一致"
                        : activeFieldRow?.checkStatus === "AI_UPDATED"
                          ? "✦ AI依据实测纠偏"
                          : activeFieldRow?.checkStatus === "CONFLICT"
                            ? "⚠ 存在差异，需人工判断"
                            : activeFieldRow?.checkStatus === "HUMAN_MODIFIED"
                              ? "✍ 人工已修订"
                              : "○ 尚未核对 (仅委托来源)"}
                    </span>
                  </div>
                  <div className="result-val-display">
                    <strong>{value(activeFieldRow?.currentValue)}</strong>
                  </div>
                </div>

                {/* 快捷同屏全景透视横幅 */}
                <button
                  type="button"
                  className="btn-multi-evidence-banner"
                  onClick={() => openMultiEvidenceInspector(field ?? undefined)}
                  title="在同一屏幕同时查看该字段在委托书与查货单的定位（免切换对比）"
                >
                  <div className="banner-left">
                    <Eye size={14} className="text-teal" />
                    <span>同屏透视各文件原文定位 (免切换对比)</span>
                  </div>
                  <ChevronRight size={13} />
                </button>

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

                {/* 2. 委托侧依据 */}
                <div className="evidence-layer-card layer-order">
                  <div className="layer-head">
                    <div className="layer-head-title">
                      <FileSpreadsheet size={13} className="text-blue" />
                      <strong>委托侧依据</strong>
                    </div>
                    <button
                      type="button"
                      className="link-jump-material"
                      onClick={() => {
                        const oFileId =
                          activeFieldRow?.sourceBreakdown.orderSource?.fileId ||
                          currentLine?.sourceLocation?.fileId ||
                          draft.materialFileIds[0] ||
                          "";
                        jumpToMaterial(
                          oFileId,
                          currentLine?.sourceLocation || {
                            fileId: oFileId,
                            position: activeFieldRow?.sourceBreakdown.orderSource?.locationText,
                          },
                        );
                      }}
                      title="点击在原始材料中定位此委托单元格"
                    >
                      <span>在原件中定位</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>

                  <div className="layer-body">
                    <div className="layer-file-meta">
                      <span>文件：<b>{activeFieldRow?.sourceBreakdown.orderSource?.fileName ?? "2件.xlsx"}</b></span>
                      <span>·</span>
                      <span>位置：{activeFieldRow?.sourceBreakdown.orderSource?.locationText || `第${draft.lines.findIndex(l => l.id === lineId) + 1}行`}</span>
                    </div>
                    <div className="layer-raw-val">
                      原文：<b>{value(activeFieldRow?.sourceBreakdown.orderSource?.rawValue || activeFieldRow?.baseValue)}</b>
                    </div>
                  </div>
                </div>

                {/* 3. 查货侧依据 */}
                <div className="evidence-layer-card layer-inspection">
                  <div className="layer-head">
                    <div className="layer-head-title">
                      <FileText size={13} className="text-teal" />
                      <strong>查货侧依据</strong>
                    </div>
                    {activeFieldRow?.sourceBreakdown.inspectionSource && (
                      <button
                        type="button"
                        className="link-jump-material"
                        onClick={() => {
                          const isrc = activeFieldRow?.sourceBreakdown.inspectionSource;
                          if (isrc?.fileId) {
                            jumpToMaterial(isrc.fileId, {
                              fileId: isrc.fileId,
                              position: isrc.locationText,
                            });
                          }
                        }}
                        title="点击在原始材料中定位此查货数据"
                      >
                        <span>在查货单中定位</span>
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>

                  <div className="layer-body">
                    {activeFieldRow?.sourceBreakdown.inspectionSource ? (
                      <>
                        <div className="layer-file-meta">
                          <span>
                            批次：<b>{currentLineSources[0]?.logicalInspectionOrderId || "CH003"}</b>
                          </span>
                          <span>·</span>
                          <span>入仓号：{currentLineSources[0]?.warehouseNo || "26036383"}</span>
                          <span>·</span>
                          <span>文件：{activeFieldRow.sourceBreakdown.inspectionSource.fileName}</span>
                        </div>
                        <div className="layer-raw-val">
                          实测值：
                          <b className="text-teal">
                            {value(
                              activeFieldRow.sourceBreakdown.inspectionSource.inspectionValue,
                            )}
                          </b>
                        </div>
                      </>
                    ) : (
                      <div className="no-inspection-hint-box">
                        <div className="hint-main-text">
                          <b>○ 暂无可靠查货依据</b>
                        </div>
                        <p className="hint-sub-text">
                          当前值直接来自委托材料；等待找到对应查货商品后将执行交叉核对。
                        </p>
                        <button
                          type="button"
                          className="link-rel-switch"
                          onClick={() => setRightTab("INSPECTION_BASIS")}
                        >
                          去「查货核验依据」查找/关联查货依据 →
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. 当前处理结论与判定依据 */}
                <div className="source-ai-explanation">
                  <div className="ai-exp-head">
                    <Sparkles size={14} className="text-purple" />
                    <strong>当前处理结论与判定依据</strong>
                  </div>
                  <p>
                    {activeFieldRow?.sourceBreakdown.aiRuleNote ||
                      (activeFieldRow?.checkStatus === "VERIFIED_CONSISTENT"
                        ? "委托申报值与仓库查货实测数据严格一致，自动核验通过。"
                        : activeFieldRow?.checkStatus === "AI_UPDATED"
                          ? "AI 依据查货单实测事实自动纠偏更新。"
                          : activeFieldRow?.checkStatus === "CONFLICT"
                            ? "委托值与查货实测出入，请人工裁决采用哪项。"
                            : "当前值来自委托材料，等待外部查货材料补充后交叉核对。")}
                  </p>
                  <button
                    type="button"
                    className="link-p4-switch"
                    onClick={() => setRightTab("VERIFY_DECISION")}
                  >
                    前往「核验结论」查看 P4 判定明细与裁决 →
                  </button>
                </div>

                {/* 冲突裁决与人工修订 */}
                {activeFieldRow?.checkStatus === "CONFLICT" && (
                  <div className="field-conflict-banner">
                    <div className="conflict-badge-title">
                      <AlertTriangle size={14} className="text-red" />
                      <b>存在差异，需要人工判断：</b>
                    </div>
                    <div className="conflict-values-contrast">
                      <div className="cv-box cv-order">
                        <span>委托值：</span>
                        <b>{value(activeFieldRow.baseValue)}</b>
                      </div>
                      <div className="cv-box cv-inspection">
                        <span>查货实测：</span>
                        <b>{value(activeFieldRow.candidateValue)}</b>
                      </div>
                    </div>
                    <div className="conflict-options-row">
                      <button
                        type="button"
                        className="btn-conflict-action btn-accept-order"
                        onClick={() => state.confirmSelectedLineField(lineId, field!)}
                      >
                        <Check size={12} />
                        保留委托值
                      </button>
                      {activeFieldRow.candidateValue && (
                        <button
                          type="button"
                          className="btn-conflict-action btn-accept-inspection"
                          onClick={() =>
                            state.editSelectedLineField(
                              lineId,
                              field!,
                              activeFieldRow.candidateValue ?? "",
                              {
                                actor: "人工复核员",
                                occurredAt: new Date().toISOString(),
                                reason: "采纳查货实测数据裁决差异",
                                locked: false,
                              },
                            )
                          }
                        >
                          <Check size={12} />
                          采用查货值 ({value(activeFieldRow.candidateValue)})
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 手动修订输入区 */}
                <div className="source-human-editor">
                  <div className="editor-title-row">
                    <strong>手动修订该字段</strong>
                    <div className="editor-quick-chips">
                      <button
                        className="chip-action"
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
                        填入委托值
                      </button>
                      {activeFieldRow?.candidateValue && (
                        <button
                          className="chip-action"
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
                          填入查货值
                        </button>
                      )}
                    </div>
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
              </div>
            )}

            {/* Tab 2: 查货核验依据 (P2/P3 真实查货事实明细与对应关系) */}
            {rightTab === "INSPECTION_BASIS" && currentLine && (
              <div className="tab-pane-relation">
                <CommodityRelations
                  key={currentLine.id}
                  draft={draft}
                  line={currentLine}
                  sources={state.sources}
                  evidence={state.evidence.filter(
                    (e) => e.entrustmentLineId === currentLine.id,
                  )}
                  onFieldSelect={(f) => selectItem(currentLine.id, f, "VERIFY_DECISION")}
                  onJumpToMaterial={jumpToMaterial}
                  onSwitchTab={(t) => setRightTab(t)}
                />
              </div>
            )}

            {/* Tab 3: 原始材料预览 (支持Excel行列高亮定位和PDF，强化同屏多文件并排比对) */}
            {rightTab === "RAW_MATERIAL" && (
              <div className="tab-pane-raw">
                {/* 顶部模式切换栏与全屏透视入口 */}
                <div className="raw-material-view-switch-bar">
                  <div className="segmented-control-mini">
                    <button
                      type="button"
                      className={`seg-item ${rawMaterialMode === "SPLIT" ? "active" : ""}`}
                      onClick={() => setRawMaterialMode("SPLIT")}
                      title="同屏同时展示委托书与查货单原文定位（免切换对比）"
                    >
                      <Layers size={12} />
                      <span>同屏并排比对 (免切换)</span>
                    </button>
                    <button
                      type="button"
                      className={`seg-item ${rawMaterialMode === "SINGLE" ? "active" : ""}`}
                      onClick={() => setRawMaterialMode("SINGLE")}
                      title="单文件全览"
                    >
                      <FileText size={12} />
                      <span>单文件浏览</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-open-inspector-full"
                    onClick={() => openMultiEvidenceInspector(field ?? undefined)}
                    title="在同屏全景视窗中查看各文件高亮"
                  >
                    <Maximize2 size={12} />
                    <span>同屏全景透视</span>
                  </button>
                </div>

                {/* 模式 A：同屏并排多文件对比（核心需求：无需切换，同屏尽览） */}
                {rawMaterialMode === "SPLIT" && multiEvidenceContext ? (
                  <div className="raw-split-container">
                    {/* 顶部仲裁理由快速卡 */}
                    <div className="split-quick-decision-card">
                      <div className="decision-card-top">
                        <span className="field-badge">当前聚焦：<b>{field || "型号"}</b></span>
                        <span className="adopted-pill">⭐ 采信：{multiEvidenceContext.adoptedSourceLabel}</span>
                      </div>
                      <p className="rule-text">{multiEvidenceContext.adoptionRule.reason}</p>
                      {multiEvidenceContext.modelAffixNote && (
                        <div className="affix-text-sm">
                          <Info size={11} />
                          <span>{multiEvidenceContext.modelAffixNote}</span>
                        </div>
                      )}
                    </div>

                    {/* 并排两个视窗 (委托书 + 查货单) */}
                    <div className="split-cards-grid">
                      {/* 委托书 */}
                      {multiEvidenceContext.files.find((f) => f.materialType === "委托书") && (() => {
                        const ofile = multiEvidenceContext.files.find((f) => f.materialType === "委托书")!;
                        return (
                          <div className="split-mini-card pane-order">
                            <div className="mini-card-head">
                              <div className="head-title">
                                <FileSpreadsheet size={13} className="text-blue" />
                                <strong>【委托书】{ofile.fileName}</strong>
                              </div>
                              <div className="head-right">
                                <span className="raw-pill">原文：<b>{ofile.rawValue || "空"}</b></span>
                                <span className={`status-pill ${ofile.isAdopted ? "is-adopted" : ""}`}>
                                  {ofile.isAdopted ? "⭐ 采纳" : "委托申报"}
                                </span>
                              </div>
                            </div>
                            <div className="mini-card-body">
                              <MaterialPreview
                                key={`split-order-${ofile.fileId}-${field}-${ofile.location.row}`}
                                location={ofile.location}
                                name={ofile.fileName}
                                activeFileId={ofile.fileId}
                                compactMode={true}
                                targetField={field ?? undefined}
                                badgeLabel={`委托申报: ${ofile.rawValue || "空"}`}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* 查货单 */}
                      {multiEvidenceContext.files.find((f) => f.materialType === "查货单") && (() => {
                        const ifile = multiEvidenceContext.files.find((f) => f.materialType === "查货单")!;
                        return (
                          <div className="split-mini-card pane-inspection">
                            <div className="mini-card-head">
                              <div className="head-title">
                                <FileText size={13} className="text-teal" />
                                <strong>【查货单】{ifile.fileName}</strong>
                              </div>
                              <div className="head-right">
                                <span className="raw-pill text-teal">实测：<b>{ifile.rawValue || "空"}</b></span>
                                <span className={`status-pill ${ifile.isAdopted ? "is-adopted" : ""}`}>
                                  {ifile.isAdopted ? "⭐ 采纳 (实物优先)" : "实测依据"}
                                </span>
                              </div>
                            </div>
                            <div className="mini-card-body">
                              <MaterialPreview
                                key={`split-inspect-${ifile.fileId}-${field}-${ifile.location.page}`}
                                location={ifile.location}
                                name={ifile.fileName}
                                activeFileId={ifile.fileId}
                                compactMode={true}
                                defaultViewMode="ANNOTATED"
                                targetField={field ?? undefined}
                                badgeLabel={`${field || "实测"}证据: ${ifile.rawValue || "实测依据"}`}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  /* 模式 B：单文件浏览模式（保留传统下拉选择） */
                  <MaterialPreview
                    key={`${activeFile?.id}-${targetMaterialLocation ? `${targetMaterialLocation.sheet}-${targetMaterialLocation.row}-${targetMaterialLocation.page}` : `${lineId}-${field}`}`}
                    location={
                      targetMaterialLocation && targetMaterialLocation.fileId === activeFile?.id
                        ? targetMaterialLocation
                        : currentLine?.sourceLocation &&
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
                    onSelectFile={(id) => {
                      setSelectedFileId(id);
                      setTargetMaterialLocation(null);
                    }}
                  />
                )}
              </div>
            )}

            {/* Tab 4: 核验结论 (P4 字段级核验与草稿裁决核心) */}
            {rightTab === "VERIFY_DECISION" && currentLine && (
              <div className="tab-pane-verify-decision">
                {/* 前置边界守卫：非 MATCHED 行严禁执行 P4 字段核验 */}
                {!hasRelation ? (
                  <div className="p4-unmatched-guard">
                    {currentLineStatus?.aiStatus === "CANDIDATES" ? (
                      <div className="p4-guard-banner banner-warning">
                        <AlertTriangle size={18} className="text-amber" />
                        <div className="guard-banner-content">
                          <strong>⚠ 等待商品对应确认，暂不执行字段核验</strong>
                          <p>
                            当前委托商品已有查货候选，依据尚未建立可靠对应。在确认查货依据前，系统暂停执行字段核验，当前草稿值仍来自委托侧初始事实。
                          </p>
                          <button
                            type="button"
                            className="primary btn-sm mt-2"
                            onClick={() => setRightTab("INSPECTION_BASIS")}
                          >
                            前往「查货核验依据」确认商品对应 →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p4-guard-banner banner-info">
                        <AlertCircle size={18} className="text-blue" />
                        <div className="guard-banner-content">
                          <strong>○ 暂无可靠查货依据，尚未进入查货字段核验</strong>
                          <p>
                            当前客户查货池中暂无与本商品匹配的记录。当前草稿值全部来自委托侧初始事实（P1基准），后续新查货材料导入后系统将自动重新检查。
                          </p>
                          <button
                            type="button"
                            className="secondary btn-sm mt-2"
                            onClick={() => setRightTab("INSPECTION_BASIS")}
                          >
                            前往「查货核验依据」查看查货池与弱候选 →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 委托侧基准事实快照 */}
                    <div className="p4-base-snapshot-card">
                      <div className="snapshot-card-head">
                        <FileSpreadsheet size={14} className="text-blue" />
                        <span>委托侧初始基准事实 (P1 原始申报)</span>
                      </div>
                      <div className="snapshot-fields-grid">
                        {CORE_OUTPUT_FIELDS.map((f) => (
                          <div key={f} className="snapshot-field-item">
                            <span className="lbl">{f}：</span>
                            <span className="val">{value(currentLine.fields[f])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* MATCHED 状态：渲染完整 P4 字段核验看板与决策 */
                  <div className="p4-matched-content">
                    {/* 1. 核验范围与结果统计看板 */}
                    <div className="p4-metrics-board">
                      <div className="board-header">
                        <div className="board-title-group">
                          <Sparkles size={14} className="text-teal" />
                          <strong>P4 字段级核验结论看板</strong>
                        </div>
                        <span className="board-batch-info">
                          依据批次：<b>{currentLineSources[0]?.logicalInspectionOrderId || "CH003"}</b> (入仓号: {currentLineSources[0]?.warehouseNo || "26036383"})
                        </span>
                      </div>

                      <div className="p4-stat-chips" role="radiogroup">
                        <button
                          type="button"
                          className={`p4-stat-chip chip-all ${p4Filter === "ALL" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("ALL")}
                        >
                          <span>全部</span>
                          <b>25</b>
                        </button>
                        <button
                          type="button"
                          className={`p4-stat-chip chip-consistent ${p4Filter === "KEEP" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("KEEP")}
                        >
                          <span>✓ 一致</span>
                          <b>{p4Decisions.filter((d) => d.decision === "KEEP" && d.isEvaluatedByInspection).length}</b>
                        </button>
                        <button
                          type="button"
                          className={`p4-stat-chip chip-updated ${p4Filter === "UPDATE" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("UPDATE")}
                        >
                          <span>✦ 更新/补充</span>
                          <b>{p4Decisions.filter((d) => d.decision === "UPDATE" || d.decision === "FILL").length}</b>
                        </button>
                        <button
                          type="button"
                          className={`p4-stat-chip chip-conflict ${p4Filter === "CONFLICT" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("CONFLICT")}
                        >
                          <span>⚠ 差异冲突</span>
                          <b className={p4Decisions.filter((d) => d.decision === "CONFLICT").length > 0 ? "text-red" : ""}>
                            {p4Decisions.filter((d) => d.decision === "CONFLICT").length}
                          </b>
                        </button>
                        <button
                          type="button"
                          className={`p4-stat-chip chip-missing ${p4Filter === "MISSING" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("MISSING")}
                        >
                          <span>✕ 缺失</span>
                          <b>{p4Decisions.filter((d) => d.decision === "MISSING").length}</b>
                        </button>
                        <button
                          type="button"
                          className={`p4-stat-chip chip-noaction ${p4Filter === "NO_ACTION" ? "is-active" : ""}`}
                          onClick={() => setP4Filter("NO_ACTION")}
                        >
                          <span>— 不参与核验</span>
                          <b>{p4Decisions.filter((d) => d.decision === "NO_ACTION").length}</b>
                        </button>
                      </div>
                    </div>

                    {/* 2. 当前聚焦字段决策卡片 (置顶重点呈现) */}
                    {activeP4Decision && (
                      <div className="p4-active-field-card">
                        <div className="p4-field-card-header">
                          <div className="field-card-title-group">
                            <span className="field-tag-prefix">当前核验字段：</span>
                            <strong className="field-tag-name">{activeP4Decision.field}</strong>
                            <span className={`p4-badge ${activeP4Decision.actionBadgeClass}`}>
                              {activeP4Decision.actionLabel}
                            </span>
                          </div>
                          <div className="field-card-quick-links">
                            <button
                              type="button"
                              className="quick-link-btn highlight-teal"
                              onClick={() => openMultiEvidenceInspector(activeP4Decision.field)}
                              title="在同一屏幕同时查看该字段在委托书与查货单的定位（免切换）"
                            >
                              <Eye size={12} className="text-teal" />
                              <span>同屏透视原件 (免切换)</span>
                              <ChevronRight size={12} />
                            </button>
                            <button
                              type="button"
                              className="quick-link-btn"
                              onClick={() => setRightTab("FIELD_SOURCE")}
                              title="查看字段来源链"
                            >
                              <span>查看字段来源</span>
                              <ChevronRight size={12} />
                            </button>
                            <button
                              type="button"
                              className="quick-link-btn"
                              onClick={() => setRightTab("INSPECTION_BASIS")}
                              title="查看核验所用的查货依据明细"
                            >
                              <span>查看核验所用查货</span>
                              <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>

                        {/* 人工修改保护警示 */}
                        {activeP4Decision.hasHumanOverriddenDiff && (
                          <div className="p4-human-banner">
                            <AlertTriangle size={14} className="text-orange" />
                            <span>人工修改保护生效中：当前结果为人工修订值，后续查货实测出入已被拦截，锁定当前人工值。</span>
                          </div>
                        )}

                        {/* 三方比对区域 */}
                        <div className="p4-three-way-grid">
                          <div className="three-way-box box-order">
                            <span className="box-lbl">
                              <FileSpreadsheet size={11} className="text-blue" />
                              委托/核验前值 (P1)
                            </span>
                            <strong className="box-val">{value(activeP4Decision.orderValue)}</strong>
                          </div>

                          <div className="three-way-arrow">
                            <span>vs</span>
                          </div>

                          <div className="three-way-box box-inspection">
                            <span className="box-lbl">
                              <FileText size={11} className="text-teal" />
                              查货实测依据值 (P2/P3)
                            </span>
                            <strong className={`box-val ${activeP4Decision.inspectionValue ? "text-teal" : "text-muted"}`}>
                              {activeP4Decision.isEvaluatedByInspection ? value(activeP4Decision.inspectionValue) : "— 不由查货核验"}
                            </strong>
                          </div>

                          <div className="three-way-arrow">
                            <span>➔</span>
                          </div>

                          <div className="three-way-box box-result">
                            <span className="box-lbl">
                              <Sparkles size={11} className="text-purple" />
                              当前核对单结果 (P4裁决)
                            </span>
                            <strong className="box-val text-purple">{value(activeP4Decision.currentValue)}</strong>
                          </div>
                        </div>

                        {/* 判定原因与业务解释 */}
                        <div className="p4-decision-reason-box">
                          <div className="reason-lbl">判定原因与业务解释 (Reason)：</div>
                          <p className="reason-text">{activeP4Decision.reason}</p>
                        </div>

                        {/* 关联证据原件跳转 */}
                        {activeP4Decision.evidenceKeys.length > 0 && (
                          <div className="p4-evidence-links-row">
                            <span className="ev-label">关联证据原件：</span>
                            <div className="ev-tags">
                              {activeP4Decision.evidenceKeys.map((key) => {
                                const matchedEv = state.evidence.find((e) => e.id === key);
                                const fileId = matchedEv?.sourceFileId || currentLineSources[0]?.sourceFileId || "";
                                const loc = matchedEv?.sourceLocation;

                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    className="ev-jump-pill"
                                    onClick={() => jumpToMaterial(fileId, loc)}
                                    title={`点击在原始材料中定位 ${key}`}
                                  >
                                    <FileText size={10} />
                                    <span>{key}</span>
                                    {loc?.position ? <small>({loc.position})</small> : null}
                                    <ExternalLink size={9} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 快捷处理操作 */}
                        {activeP4Decision.decision === "CONFLICT" && (
                          <div className="p4-conflict-actions-bar">
                            <span className="actions-title">差异裁决：</span>
                            <button
                              type="button"
                              className="btn-conflict-opt btn-accept-order"
                              onClick={() => state.confirmSelectedLineField(lineId, activeP4Decision.field)}
                            >
                              <Check size={12} />
                              保留当前委托值 ({value(activeP4Decision.orderValue)})
                            </button>
                            {activeP4Decision.candidateValues[0] && (
                              <button
                                type="button"
                                className="btn-conflict-opt btn-accept-insp"
                                onClick={() =>
                                  state.editSelectedLineField(
                                    lineId,
                                    activeP4Decision.field,
                                    activeP4Decision.candidateValues[0],
                                    {
                                      actor: "人工复核员",
                                      occurredAt: new Date().toISOString(),
                                      reason: "采纳查货实测数据裁决差异",
                                      locked: false,
                                    },
                                  )
                                }
                              >
                                <Check size={12} />
                                采用查货值 ({value(activeP4Decision.candidateValues[0])})
                              </button>
                            )}
                          </div>
                        )}

                        {activeP4Decision.decision === "MISSING" && (
                          <div className="p4-missing-actions-bar">
                            <span className="actions-title">必填补充：</span>
                            <div className="missing-input-group">
                              <input
                                type="text"
                                id="p4-missing-fill-input"
                                placeholder={`输入 ${activeP4Decision.field}...`}
                                defaultValue=""
                              />
                              <button
                                type="button"
                                className="primary btn-sm"
                                onClick={() => {
                                  const input = document.getElementById("p4-missing-fill-input") as HTMLInputElement;
                                  if (input && input.value.trim()) {
                                    state.editSelectedLineField(
                                      lineId,
                                      activeP4Decision.field,
                                      input.value.trim(),
                                      {
                                        actor: "人工复核员",
                                        occurredAt: new Date().toISOString(),
                                        reason: "人工补充必填空缺",
                                        locked: false,
                                      },
                                    );
                                  }
                                }}
                              >
                                确认录入
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. 整行 25 字段决策清单 (All 25 Fields Decision Table) */}
                    <div className="p4-fields-table-wrapper">
                      <div className="fields-table-header">
                        <div className="table-header-title">
                          <strong>整行 25 字段核验明细清单</strong>
                          <span className="fields-total-count">共 25 项标准报关字段</span>
                        </div>
                        <small className="text-muted">点击任一行可在上方查看三方比对与原件证据</small>
                      </div>

                      <div className="p4-table-scroll">
                        <table className="p4-decision-table">
                          <thead>
                            <tr>
                              <th>字段名称</th>
                              <th>P4 动作</th>
                              <th>委托前值 (P1)</th>
                              <th>查货依据 (P2/P3)</th>
                              <th>当前核对单结果</th>
                              <th>核验判定说明</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p4Decisions
                              .filter((d) => {
                                if (p4Filter === "ALL") return true;
                                if (p4Filter === "KEEP") return d.decision === "KEEP" && d.isEvaluatedByInspection;
                                if (p4Filter === "UPDATE") return d.decision === "UPDATE" || d.decision === "FILL";
                                if (p4Filter === "CONFLICT") return d.decision === "CONFLICT";
                                if (p4Filter === "MISSING") return d.decision === "MISSING";
                                if (p4Filter === "NO_ACTION") return d.decision === "NO_ACTION";
                                return true;
                              })
                              .map((d) => {
                                const isSelected = field === d.field;

                                return (
                                  <tr
                                    key={d.field}
                                    className={`p4-row ${isSelected ? "row-selected" : ""} row-${d.decision.toLowerCase()}`}
                                    onClick={() => setField(d.field)}
                                  >
                                    <td className="col-field-name">
                                      <b>{d.field}</b>
                                      {d.fieldRow.required && <span className="req-dot" title="报关必填项">*</span>}
                                    </td>
                                    <td className="col-action">
                                      <span className={`p4-badge ${d.actionBadgeClass}`}>
                                        {d.actionLabel}
                                      </span>
                                    </td>
                                    <td className="col-val">{value(d.orderValue)}</td>
                                    <td className="col-val">
                                      {d.isEvaluatedByInspection ? value(d.inspectionValue) : <span className="text-muted">—</span>}
                                    </td>
                                    <td className="col-val col-result">
                                      <strong>{value(d.currentValue)}</strong>
                                    </td>
                                    <td className="col-reason" title={d.reason}>
                                      <span className="reason-ellipsis">{d.reason}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 5 (POC 评测模式专用): 标准答案差异 */}
            {rightTab === "EVAL_DIFF" && isEvaluationMode && (
              <div className="tab-pane-eval-diff">
                <div className="eval-diff-head">
                  <Sparkles size={15} className="text-purple" />
                  <strong>POC 评测标准答案对比与准确率剖析</strong>
                </div>

                {evaluationReport ? (
                  <div className="eval-diff-content">
                    <div className="eval-metrics-mini-grid">
                      <div className="mini-metric">
                        <span>总体准确率</span>
                        <b className="text-green">{evaluationReport.metrics.overallAccuracyRate}%</b>
                      </div>
                      <div className="mini-metric">
                        <span>需修正字段</span>
                        <b className="text-red">{evaluationReport.metrics.humanCorrectionNeededCount} 个</b>
                      </div>
                      <div className="mini-metric">
                        <span>商品匹配准确率</span>
                        <b className="text-blue">{evaluationReport.metrics.productMatchAccuracyRate}%</b>
                      </div>
                    </div>

                    {/* 当前选定商品的对比 */}
                    {(() => {
                      const evalLineResult = evaluationReport.lineResults.find(
                        (l) => l.lineId === lineId,
                      );
                      if (!evalLineResult) return null;

                      return (
                        <div className="eval-line-contrast-card">
                          <div className="contrast-card-head">
                            <strong>
                              商品 {draft.lines.findIndex((l) => l.id === lineId) + 1} 详细字段比对
                            </strong>
                            <span className="contrast-score">
                              {evalLineResult.mismatchCount === 0
                                ? "✓ 全部吻合"
                                : `⚠ ${evalLineResult.mismatchCount} 项出入`}
                            </span>
                          </div>

                          <div className="contrast-table-scroll">
                            <table className="eval-table">
                              <thead>
                                <tr>
                                  <th>字段</th>
                                  <th>AI判定值</th>
                                  <th>标准答案 (GT)</th>
                                  <th>比对结果</th>
                                </tr>
                              </thead>
                              <tbody>
                                {FINAL_OUTPUT_FIELDS.map((f) => {
                                  const fd = evalLineResult.fields[f];
                                  if (!fd) return null;
                                  return (
                                    <tr
                                      key={f}
                                      className={
                                        fd.diffType === "CONSISTENT"
                                          ? "row-match"
                                          : "row-diff"
                                      }
                                    >
                                      <td><b>{f}</b></td>
                                      <td>{value(fd.aiValue)}</td>
                                      <td>{value(fd.gtValue)}</td>
                                      <td>
                                        <span
                                          className={`eval-status-pill ${
                                            fd.diffType === "CONSISTENT"
                                              ? "pill-ok"
                                              : "pill-warn"
                                          }`}
                                        >
                                          {fd.diffType === "CONSISTENT"
                                            ? "✓ 完全吻合"
                                            : `⚠ ${fd.diffDescription || "出入"}`}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="eval-empty">暂无评测基准数据</div>
                )}
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

      {/* 多文件原文同屏定位与仲裁透视大弹窗 */}
      {isMultiEvidenceOpen && multiEvidenceContext && currentLine && (
        <MultiEvidenceInspector
          context={multiEvidenceContext}
          currentField={field || "型号"}
          allFields={FINAL_OUTPUT_FIELDS}
          onSelectField={(f) => setField(f)}
          onClose={() => setIsMultiEvidenceOpen(false)}
          onQuickAdoptOrder={(f, val) => {
            state.editSelectedLineField(currentLine.id, f, val, {
              actor: "人工操作",
              reason: "业务员在同屏证据中选择采纳委托申报值",
              occurredAt: new Date().toISOString(),
              locked: true,
            });
          }}
          onQuickAdoptInspection={(f, val) => {
            state.editSelectedLineField(currentLine.id, f, val, {
              actor: "人工操作",
              reason: "业务员在同屏证据中选择采纳查货实测值",
              occurredAt: new Date().toISOString(),
              locked: true,
            });
          }}
        />
      )}
    </div>
  );
}
