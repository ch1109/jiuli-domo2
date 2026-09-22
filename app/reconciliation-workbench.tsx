"use client";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  Layers,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useDemoStore, type UiDraft } from "@/lib/demo-store";
import {
  FINAL_OUTPUT_FIELDS,
  type FinalOutputField,
  type SourceLocation,
} from "@/lib/domain/types";
import { getFieldRows, getLineReconStatus, type FieldRow, type LineReconStatus } from "@/lib/workbench-model";
import { getTaskSummary } from "@/lib/workspace-status";
import {calculateFinalOutputTotals} from '@/lib/domain/final-output';
import {buildFinalReconciliationCsv,finalReconciliationFileName} from '@/lib/final-reconciliation-csv';
import { MaterialPreview } from "./material-preview";
import { LineActions } from "./workbench-relations";
import { generateTaskProcessStages } from "@/lib/business-translation";
import "./workbench.css";

const filters = ["全部字段", "有变化", "冲突", "缺失", "待人工"] as const;
type Filter = (typeof filters)[number];
const accepts = (row: FieldRow, filter: Filter) =>
  filter === "全部字段" ||
  (filter === "有变化" && row.changed) ||
  (filter === "冲突" && row.conflict) ||
  (filter === "缺失" && row.missing) ||
  (filter === "待人工" && row.needsHuman);
const value = (v: string | null | undefined) => v || "—";
const short = (id: string) => id.split("-").at(-1);

export function ReconciliationWorkbench({
  draft,
}: {
  draft: UiDraft | undefined;
}) {
  const state = useDemoStore();
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
  const lineStatuses = useMemo(() => {
    if (!draft) return new Map<string, LineReconStatus>();
    return new Map(
      draft.lines.map((l) => [
        l.id,
        getLineReconStatus(l, rowsByLine.get(l.id) ?? [], state.sources),
      ]),
    );
  }, [draft, rowsByLine, state.sources]);

  const restored = state.lastVisitedPanel.startsWith('line:') ? state.lastVisitedPanel.slice(5).split('|') : [];
  const [lineId, setLineId] = useState(draft?.lines.some(l=>l.id===restored[0]) ? restored[0] : draft?.lines[0]?.id ?? "");
  const [field, setField] = useState<FinalOutputField | null>(FINAL_OUTPUT_FIELDS.includes(restored[1] as FinalOutputField) ? restored[1] as FinalOutputField : null);
  const [filter, setFilter] = useState<Filter>("全部字段");
  const [view, setView] = useState<"fields" | "results">("results");
  const [resultFilter, setResultFilter] = useState<"ALL" | "RECONCILED" | "UNCHECKED" | "MODIFIED" | "CONFLICT">("ALL");
  const [tableMode, setTableMode] = useState<"LATEST" | "ORIGINAL" | "DIFF">("LATEST");
  const [history, setHistory] = useState(false);
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [source, setSource] = useState("全部");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    location: SourceLocation;
    name: string;
    key: string;
  } | null>(null);
  if (!draft)
    return (
      <div className="empty">
        <p>请选择一票委托草稿</p>
        <button onClick={() => state.setView("drafts")}>选择委托草稿</button>
      </div>
    );
  const line = draft.lines.find((l) => l.id === lineId) ?? draft.lines[0];
  const rows = line ? rowsByLine.get(line.id)! : [];
  const all = [...rowsByLine.values()].flat();
  const active =
    rows.find((row) => row.field === field) ??
    rows.find((row) => accepts(row, filter)) ??
    rows[0];
  const summary = getTaskSummary(draft);
  const blockedLines = draft.lines.filter((l) => !l.relationSourceId);
  const lineProblems=draft.lines.flatMap(l=>l.relationSourceId ? l.issueIds.filter(id=>!id.startsWith('字段冲突:')&&!id.startsWith('必填缺失:')).map(message=>({lineId:l.id,message})) : []);
  const blocking =
    all.filter((row) => row.needsHuman).length + blockedLines.length + lineProblems.length;
  const materialIds = new Set([
    ...draft.materialFileIds,
    ...state.files.filter(f=>f.batchId===`WORKBENCH-${draft.id}`).map(f=>f.id),
    ...state.evidence
      .filter((e) => e.draftId === draft.id)
      .map((e) => e.sourceFileId),
    ...state.sources
      .filter((s) =>
        draft.lines.some((l) => l.relationSourceIds.includes(s.id)),
      )
      .map((s) => s.sourceFileId),
  ]);
  const files = state.files.filter((f) => materialIds.has(f.id));
  const customerSources = state.sources.filter(
    (s) => s.customerId === draft.customerId && s.availability !== "未加载"
  );
  const mergedProductCount = Math.max(
    1,
    new Set(
      customerSources.map((s) => `${s.brand}-${s.model}-${s.origin}`)
    ).size
  );
  const stages = generateTaskProcessStages(
    draft,
    state.sources.filter((s) =>
      draft.lines.some((l) => l.relationSourceIds.includes(s.id))
    ),
    customerSources.length,
    mergedProductCount
  );
  const isReconciled =
    draft.hasAiUpdate ||
    draft.version > 0 ||
    draft.lines.some((l) => l.relationSourceIds.length > 0) ||
    draft.status !== "待核对";

  const allLineStatuses = draft.lines.map((l) => lineStatuses.get(l.id)!);
  const reconciledLines = allLineStatuses.filter((s) => s.hasInspection);
  const unreconciledLines = allLineStatuses.filter((s) => !s.hasInspection);
  const userModifiedLines = allLineStatuses.filter((s) => s.isHumanModified);
  const conflictLines = allLineStatuses.filter((s) => s.hasConflict);

  const sourceNotes = [...new Set(state.sources.filter(s=>s.customerId===draft.customerId && s.availability!=='未加载').flatMap(s=>{
    try { return (JSON.parse(s.otherFields['来源问题']??'[]') as {message:string}[]).map(i=>i.message); } catch { return []; }
  }))];
  const select = (id: string, f: FinalOutputField | null) => {
    setLineId(id);
    setField(f);
    setView("fields");
    setPreview(null);
    setSource("全部");
    const row = rowsByLine.get(id)?.find((r) => r.field === f);
    if (row && !accepts(row, filter)) setFilter("全部字段");
    state.setLastVisitedPanel(`line:${id}|${f ?? ""}`);
    requestAnimationFrame(() =>
      document
        .getElementById(`field-${id}-${f}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  const entries =
    active?.evidence
      .filter((e) => !e.isManuallyEdited)
      .flatMap((e) =>
        e.references
          ? e.references.map((ref) => ({
              key: ref.key,
              location: ref.location,
              raw: ref.rawValue,
              normalized: ref.normalizedValue,
              evidenceId: e.id,
            }))
          : [
              {
                key: e.id,
                location: e.sourceLocation,
              raw: e.sourceMaterialType === '委托书' ? e.originalValue : e.candidateValues[0] ?? null,
              normalized: e.sourceMaterialType === '委托书' ? e.originalValue : e.candidateValues[0] ?? null,
                evidenceId: e.id,
              },
            ],
      ) ?? [];
  const uniqueEntries = entries.filter(
    (entry, i) => entries.findIndex((e) => e.key === entry.key) === i,
  );
  const currentLineSources = state.sources.filter(
    (s) => (line?.relationSourceIds ?? []).includes(s.id) || line?.relationSourceId === s.id
  );
  const entrustFileIds = new Set([
    ...draft.materialFileIds,
    ...(line?.sourceLocation?.fileId ? [line.sourceLocation.fileId] : []),
  ]);
  const inspectionFileIds = new Set([
    ...currentLineSources.map((s) => s.sourceFileId),
    ...customerSources.map((s) => s.sourceFileId),
  ]);
  const boundFileIds = new Set(
    state.materialBindings.filter((b) => b.draftId === draft.id).map((b) => b.fileId)
  );
  const taskFileIdSet = new Set([
    ...entrustFileIds,
    ...inspectionFileIds,
    ...boundFileIds,
    ...state.files.filter((f) => f.batchId === `WORKBENCH-${draft.id}` || f.customerId === draft.customerId).map((f) => f.id),
    ...uniqueEntries.map((e) => e.location.fileId),
  ]);
  let taskFiles = state.files.filter((f) => taskFileIdSet.has(f.id));
  if (taskFiles.length === 0 && draft.materialFileIds.length > 0) {
    taskFiles = draft.materialFileIds.map((fid) => ({
      id: fid,
      name: fid,
      materialType: "委托书",
      loaded: true,
      duplicate: false,
      source: "基线" as const,
    }));
  }

  const activeFileId =
    preview && taskFiles.some((f) => f.id === preview.location.fileId)
      ? preview.location.fileId
      : selectedFileId && taskFiles.some((f) => f.id === selectedFileId)
        ? selectedFileId
        : uniqueEntries[0] && taskFiles.some((f) => f.id === uniqueEntries[0].location.fileId)
          ? uniqueEntries[0].location.fileId
          : taskFiles.find((f) => entrustFileIds.has(f.id))?.id ?? taskFiles[0]?.id ?? "";

  const currentFile = taskFiles.find((f) => f.id === activeFileId) ?? taskFiles[0];

  const effectivePreview = useMemo(() => {
    if (!currentFile) return null;
    if (preview && preview.location.fileId === currentFile.id) {
      return preview;
    }
    const matchingEntry = uniqueEntries.find((e) => e.location.fileId === currentFile.id);
    if (matchingEntry) {
      return {
        location: matchingEntry.location,
        name: currentFile.name ?? matchingEntry.location.fileId,
        key: matchingEntry.key,
      };
    }
    // 非 OCR 字段级定位（直接定位到具体文件和已有结构化行号/页码）
    if (currentFile.materialType === "委托书") {
      const row = line?.sourceLocation?.row ?? null;
      const sheet = line?.sourceLocation?.sheet ?? null;
      return {
        location: {
          fileId: currentFile.id,
          page: line?.sourceLocation?.page ?? null,
          row,
          sheet,
          position: row ? `第 ${row} 行` : "整单委托材料",
        },
        name: currentFile.name,
        key: `${currentFile.id}-entrust-${line?.id ?? ""}`,
      };
    }
    if (currentFile.materialType === "查货") {
      const page = currentLineSources[0]?.sourceLocation?.page ?? 1;
      return {
        location: {
          fileId: currentFile.id,
          page,
          sheet: null,
          position: `第 ${page} 页`,
        },
        name: currentFile.name,
        key: `${currentFile.id}-inspect-${line?.id ?? ""}`,
      };
    }
    return {
      location: {
        fileId: currentFile.id,
        page: 1,
        sheet: null,
        position: null,
      },
      name: currentFile.name,
      key: `${currentFile.id}-other`,
    };
  }, [currentFile, preview, uniqueEntries, line, currentLineSources]);

  const activePreview = effectivePreview;
  const exportCsv = () => {
    const final=state.finalReconciliations.find(s=>s.sourceDraftId===draft.id);
    const rows=draft.lines.map(l=>l.fields);
    const csv=buildFinalReconciliationCsv(final ?? {rows,totals:calculateFinalOutputTotals(rows)});
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = final ? finalReconciliationFileName(draft.displayNo,final.sourceVersion) : `草稿预览-${draft.displayNo}-V${draft.version}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="recon-workbench">
      <header className="recon-heading">
        <div className="recon-heading-left">
          <button
            className="recon-back-button"
            onClick={() => state.setView("home")}
            title="返回客户工作台"
            aria-label="返回客户工作台"
          >
            <ArrowLeft size={16} />
            <span>返回客户工作台</span>
          </button>
          <div className="recon-heading-titles">
            <div className="recon-kicker">
              <span>核对作业台</span>
              <span className="sep">/</span>
              <b>{draft.displayNo}</b>
            </div>
            <div className="recon-title-row">
              <h2>{draft.customerName}</h2>
              <span className={`recon-status-pill ${draft.finalized ? "final" : draft.status === "人工确认中" ? "confirming" : isReconciled ? "reconciled" : "draft"}`}>
                {draft.finalized ? "已封版归档" : draft.status === "人工确认中" ? "人工确认中" : isReconciled ? `AI核对版 (V${draft.version})` : `原始委托草稿 (V0)`}
              </span>
            </div>
            <p>
              单号：{draft.id} · 版本 V{draft.version} · 最近更新{" "}
              {new Date(draft.updatedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {draft.lastUpdateReason ? ` · ${draft.lastUpdateReason}` : ""}
            </p>
          </div>
        </div>
        <div className="action-row">
          <button className="secondary" onClick={() => setHistory(!history)}>
            <History size={15} />
            历史
          </button>
          <button className="secondary" onClick={exportCsv}>
            <Download size={15} />
            {draft.finalized?'导出最终核对单':'导出预览'}
          </button>
          {!draft.finalized && (
            <>
              {blockedLines.length > 0 && (
                <button
                  className="secondary"
                  aria-label="开始核对（执行首次匹配）"
                  onClick={state.matchSelectedDraft}
                >
                  <Sparkles size={15} />
                  开始核对
                </button>
              )}
              {draft.status === "人工确认中" ? (
                <>
                  <button
                    className="secondary recon-revert-btn"
                    title="撤销人工确认状态，返回工作台继续修改"
                    onClick={state.revertDraftToReview}
                  >
                    <RotateCcw size={15} />
                    退回修改 (返回上一步)
                  </button>
                  <button
                    className="primary"
                    onClick={state.completeSelectedDraft}
                  >
                    <Check size={15} />
                    确认完成
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={blocking > 0 || !line || !draft.customerId}
                  onClick={state.submitSelectedDraft}
                >
                  提交人工复核
                  <ChevronRight size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {/* 五阶段业务处理全流程步进器 */}
      <div className="recon-workflow-container">
        <div className="recon-workflow-title">
          <div className="recon-workflow-title-left">
            <Sparkles size={15} className="workflow-title-icon" />
            <span>AI 报关智能核对流程（五阶段实时流转）</span>
          </div>
          <div className="recon-workflow-active-badge">
            <span>当前流转环节：</span>
            <b className="active-phase-tag">
              {(() => {
                const act = stages.find((s) => s.isActive) ?? stages[0];
                return `第 ${act.step} 阶段 · ${act.title}（${act.statusText}）`;
              })()}
            </b>
          </div>
        </div>
        <div className="recon-workflow-steps">
          {stages.map((stage, idx) => {
            const isActive = stage.isActive;
            return (
              <Fragment key={stage.step}>
                <div className={`recon-workflow-step ${stage.status} ${isActive ? "active-step" : ""}`}>
                  <div className="recon-step-head">
                    <div className="recon-step-number-title">
                      <span className={`recon-step-num-badge ${stage.status}`}>
                        {stage.status === "completed" ? "✓" : stage.step}
                      </span>
                      <span className="recon-step-title">{stage.step}. {stage.title}</span>
                    </div>
                    <span className={`recon-step-status ${stage.status}`}>
                      {stage.statusText}
                    </span>
                  </div>
                  <div className="recon-step-product" title={stage.productSummary}>
                    {stage.productSummary}
                  </div>
                  <div className="recon-step-foot">
                    <span>{stage.actionNote}</span>
                    <span className="recon-step-code">{stage.code}</span>
                  </div>
                  {isActive && <div className="recon-step-active-indicator">当前处理环节</div>}
                </div>
                {idx < stages.length - 1 && (
                  <div className="recon-workflow-arrow">
                    <ChevronRight size={16} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="recon-summary">
        <strong>
          <span className="live-dot" />
          {summary.businessStatus}
        </strong>
        <span>
          待核对商品 <b>{draft.lines.length}</b>
        </span>
        <span>
          已找到对应（已匹配）{" "}
          <b>
            {summary.matched}/{summary.total}
          </b>
        </span>
        <span>
          字段已核验{" "}
          <b>
            {all.filter((r) => r.verified).length}/{all.length}
          </b>
        </span>
        <span className="danger-text">
          字段冲突 <b>{all.filter((r) => r.conflict).length}</b>
        </span>
        <span>
          必填缺失 <b>{all.filter((r) => r.missing && r.required).length}</b>
        </span>
      </div>
      {/* 单据数据版本与核对状态横幅：明确区分草稿单 vs 核对结果 */}
      <div className={`recon-data-banner ${isReconciled ? "is-reconciled" : "is-draft"}`}>
        <div className="banner-left">
          <div className="banner-icon-box">
            {isReconciled ? <Sparkles size={20} /> : <FileText size={20} />}
          </div>
          <div className="banner-text">
            <div className="banner-heading">
              <strong>
                {isReconciled ? `AI 智能核对结果单 (V${draft.version})` : `原始委托书申报草稿单 (V0)`}
              </strong>
              <span className="banner-mode-tag">
                {isReconciled ? "✓ 已基于查货资料自动比对完成" : "○ 尚未执行查货资料比对 · 原始填报值"}
              </span>
            </div>
            <p className="banner-desc">
              {isReconciled ? (
                <>
                  整单共 <b>{draft.lines.length}</b> 个商品行：
                  已基于查货核对 <b className="stat-green">{reconciledLines.length}</b> 行，
                  未核对/缺依据 <b className={unreconciledLines.length ? "stat-orange" : ""}>{unreconciledLines.length}</b> 行，
                  用户手动修正 <b className="stat-blue">{userModifiedLines.length}</b> 行，
                  字段冲突 <b className={all.filter((r) => r.conflict).length ? "stat-red" : ""}>{all.filter((r) => r.conflict).length}</b> 项。
                </>
              ) : (
                <>
                  当前工作台数据为客户委托申报原稿，尚未与仓库查货资料建立商品行映射和字段比对。请点击右侧【开始核对】执行自动关联。
                </>
              )}
            </p>
          </div>
        </div>
        <div className="banner-right">
          {!isReconciled && !draft.finalized && (
            <button className="primary banner-action-btn" onClick={state.matchSelectedDraft}>
              <Sparkles size={14} />
              立即开始 AI 核对
            </button>
          )}
          {isReconciled && draft.status === "人工确认中" && (
            <button className="secondary banner-action-btn" onClick={state.revertDraftToReview}>
              <RotateCcw size={14} />
              退回修改
            </button>
          )}
        </div>
      </div>
      {history && (
        <section className="recon-history" aria-label="当前草稿版本与操作">
          <button
            className="icon-button"
            aria-label="关闭历史"
            onClick={() => setHistory(false)}
          >
            <X size={16} />
          </button>
          {state.versions
            .filter((v) => v.draftId === draft.id)
            .slice()
            .reverse()
            .map((v) => (
              <details key={v.id}>
                <summary>
                  V{v.version} · {v.triggerReason} ·{" "}
                  {new Date(v.createdAt).toLocaleString("zh-CN")}
                </summary>
                {v.after.map((after) => (
                  <div key={after.entrustmentLineId}>
                    {FINAL_OUTPUT_FIELDS.filter(
                      (f) =>
                        v.before.find(
                          (b) =>
                            b.entrustmentLineId === after.entrustmentLineId,
                        )?.fields[f] !== after.fields[f],
                    ).map((f) => (
                      <p key={f}>
                        {short(after.entrustmentLineId)} · {f}：
                        {value(
                          v.before.find(
                            (b) =>
                              b.entrustmentLineId === after.entrustmentLineId,
                          )?.fields[f],
                        )}{" "}
                        → {value(after.fields[f])}
                      </p>
                    ))}
                  </div>
                ))}
              </details>
            ))}
          {state.operations
            .filter((o) => o.draftId === draft.id)
            .slice()
            .reverse()
            .map((o) => (
              <p key={o.id}>{o.summary}</p>
            ))}
        </section>
      )}
      <div className="recon-mobile">
        <button onClick={() => setDrawer("left")}>处理与问题 {blocking}</button>
        <button onClick={() => setDrawer("right")}>原文与证据</button>
      </div>
      <div className="recon-columns">
        <aside
          className={`recon-left ${drawer === "left" ? "drawer-open" : ""}`}
        >
          <button
            className="drawer-close icon-button"
            aria-label="关闭处理与问题"
            onClick={() => setDrawer(null)}
          >
            <X size={18} />
          </button>
          <section>
            <h3>当前处理</h3>
            <strong>{summary.businessStatus}</strong>
            <p className="muted">{summary.realtimeStatus}</p>
            <dl>
              <div>
                <dt>已找到对应商品</dt>
                <dd>
                  {summary.matched} / {summary.total}
                </dd>
              </div>
              <div>
                <dt>已核验字段</dt>
                <dd>
                  {all.filter((r) => r.verified).length} / {all.length}
                </dd>
              </div>
              <div>
                <dt>待人工字段</dt>
                <dd>{all.filter((r) => r.needsHuman).length}</dd>
              </div>
            </dl>
            {blocking > 0 && (
              <p className="recon-blocker">
                <AlertTriangle size={14} />
                还有 {blocking} 项必须处理
              </p>
            )}
          </section>
          <section className="line-navigation">
            <div className="line-nav-header">
              <h3>商品核对清单 <span>{draft.lines.length}</span></h3>
            </div>
            <div className="line-card-list">
              {draft.lines.map((item, index) => {
                const itemStatus = lineStatuses.get(item.id);
                const isSelected = item.id === line?.id;
                return (
                  <button
                    key={item.id}
                    className={`line-card-item ${isSelected ? "selected" : ""} ${itemStatus?.hasInspection ? "has-inspection" : "no-inspection"}`}
                    onClick={() => select(item.id, null)}
                  >
                    <div className="line-card-head">
                      <div className="line-card-title">
                        <b>商品 {String(index + 1).padStart(2, "0")}</b>
                        <span className="line-card-code">{short(item.id)}</span>
                      </div>
                      <span className={`line-recon-tag ${itemStatus?.hasInspection ? "tag-green" : "tag-orange"}`}>
                        {itemStatus?.hasInspection ? "✓ 查货已核对" : "○ 缺查货依据"}
                      </span>
                    </div>
                    <div className="line-card-model" title={item.model}>
                      {item.model || "型号待补充"}
                    </div>
                    <div className="line-card-footer">
                      {itemStatus?.isHumanModified && (
                        <span className="line-pill pill-blue" title={`用户人工修改了 ${itemStatus.humanModifiedFields.join("、")}`}>
                          <Pencil size={10} /> 已修正 {itemStatus.humanModifiedFields.length} 项
                        </span>
                      )}
                      {itemStatus?.hasConflict && (
                        <span className="line-pill pill-red" title={`查货数据存在差异：${itemStatus.conflictFields.join("、")}`}>
                          <AlertTriangle size={10} /> 差异 {itemStatus.conflictFields.length} 项
                        </span>
                      )}
                      {!itemStatus?.isHumanModified && !itemStatus?.hasConflict && itemStatus?.hasInspection && (
                        <span className="line-pill pill-ok">
                          <Check size={10} /> 字段核对一致
                        </span>
                      )}
                      {!itemStatus?.hasInspection && (
                        <span className="line-pill pill-muted">
                          等待匹配查货单
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="problem-center">
            <h3>
              问题中心 <span>{blocking} 必须处理</span>
            </h3>
            {(["必须处理", "建议检查", "信息提示"] as const).map((group, g) => (
              <div key={group}>
                <h4 className={`severity-${g}`}>{group}</h4>
                {g===0 && lineProblems.map(p=><button key={`${p.lineId}-${p.message}`} onClick={()=>select(p.lineId,null)}><b>{short(p.lineId)} · 商品问题</b><span>{p.message}</span></button>)}
                {g===1 && sourceNotes.map(note=><button key={note} onClick={()=>select(line?.id??'', '毛重')}><b>材料范围提醒</b><span>{note}</span></button>)}
                {g === 0 &&
                  blockedLines.map((l) => (
                    <button
                      className={l.id === line?.id ? "selected" : ""}
                      key={l.id}
                      onClick={() => select(l.id, null)}
                    >
                      <b>{short(l.id)} · 缺少查货依据</b>
                      <span>选择查货商品，建立匹配关系</span>
                    </button>
                  ))}
                {draft.lines.flatMap((l) =>
                  (rowsByLine.get(l.id) ?? [])
                    .filter((r) =>
                      g === 0
                        ? r.needsHuman
                        : g === 1
                          ? !r.needsHuman && !r.verified && !r.missing
                          : r.missing && !r.required,
                    )
                    .map((r) => (
                      <button
                        key={`${l.id}-${r.field}`}
                        className={
                          l.id === line?.id && r.field === active?.field
                            ? "selected"
                            : ""
                        }
                        onClick={() => select(l.id, r.field)}
                      >
                        <b>
                          {short(l.id)} · {r.field}
                        </b>
                        <span>
                          {g === 0
                            ? r.status
                            : g === 1
                              ? "尚未核验"
                              : "暂无来源值"}
                          {r.conflict ? ` · 当前 ${value(r.currentValue)}` : ""}
                        </span>
                      </button>
                    )),
                )}
              </div>
            ))}
          </section>
          <section>
            <h3>材料状态</h3>
            {files.map((f) => (
              <div className="recon-file" key={f.id}>
                <FileText size={15} />
                <span>
                  {f.name}
                  <small>
                    {f.materialType} ·{" "}
                    {f.uploadStatus ?? (f.loaded ? "已接入" : "已关联")}
                  </small>
                </span>
              </div>
            ))}
            <label className="secondary upload-material">
              <Upload size={14} />
              接入新材料
              <input
                type="file"
                aria-label="为当前草稿上传材料"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    state.stageLocalFile({
                      name: f.name,
                      size: f.size,
                      type: f.type,
                      file: f,
                      customerId: draft.customerId ?? undefined,
                      batchId:`WORKBENCH-${draft.id}`,
                    });
                    const staged = useDemoStore.getState().files.find(f=>!state.files.some(old=>old.id===f.id));
                    if (staged?.source === "本地上传") {
                      await state.parseLocalFile(staged.id);
                      const parsed=useDemoStore.getState().files.find(f=>f.id===staged.id);
                      if(parsed && ['发票','箱单'].includes(parsed.materialType) && parsed.uploadStatus==='解析成功') state.bindMaterialToDraft(parsed.id,draft.id);
                    }
                  }
                }}
              />
            </label>
            <button
              className="text-button"
              onClick={() => state.setView("intake")}
            >
              查看全部材料
            </button>
          </section>
          <section>
            <h3>处理记录</h3>
            {state.operations
              .filter((o) => o.draftId === draft.id)
              .slice(-5)
              .reverse()
              .map((o) => (
                <p className="recon-record" key={o.id}>
                  <time>
                    {new Date(o.occurredAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {o.summary}
                </p>
              ))}
          </section>
        </aside>
        <section className="recon-center">
          {line ? (
            <>
              <div className="product-navigation">
                <button
                  className="icon-button"
                  aria-label="上一个商品"
                  disabled={draft.lines.indexOf(line) === 0}
                  onClick={() =>
                    select(draft.lines[draft.lines.indexOf(line) - 1].id, null)
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <small>
                    商品 {draft.lines.indexOf(line) + 1} / {draft.lines.length}
                  </small>
                  <select
                    aria-label="选择商品"
                    value={line.id}
                    onChange={(e) => select(e.target.value, null)}
                  >
                    {draft.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {short(l.id)} · {l.model}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="icon-button"
                  aria-label="下一个商品"
                  disabled={
                    draft.lines.indexOf(line) === draft.lines.length - 1
                  }
                  onClick={() =>
                    select(draft.lines[draft.lines.indexOf(line) + 1].id, null)
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              {/* 当前选中商品行的查货核对状态横幅 */}
              {(() => {
                const curStatus = lineStatuses.get(line.id);
                return (
                  <div className="line-context-banner">
                    <div className="line-context-tags">
                      <span className={`line-context-status-pill ${curStatus?.badgeClass}`}>
                        {curStatus?.badgeText}
                      </span>
                      <span className="line-context-src">
                        查货依据：<b>{curStatus?.inspectionSummary}</b>
                      </span>
                    </div>
                    {curStatus?.isHumanModified && (
                      <span className="line-context-modified">
                        <Pencil size={12} /> 本行已人工修正 {curStatus.humanModifiedFields.length} 个字段
                      </span>
                    )}
                  </div>
                );
              })()}
              {!draft.customerId && (
                <select
                  aria-label="补充委托客户"
                  onChange={(e) =>
                    state.resolveSelectedDraftCustomer(e.target.value)
                  }
                  defaultValue=""
                >
                  <option value="" disabled>
                    选择客户
                  </option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {!line.relationSourceId && !draft.finalized && (
                <div className="relation-picker">
                  <label>
                    查货依据
                    <select
                      aria-label={`为 ${short(line.id)} 选择查货依据`}
                      value=""
                      onChange={(e) =>
                        state.selectLineSource(line.id, e.target.value)
                      }
                    >
                      <option value="">人工选择同客户查货行</option>
                      {state.sources
                        .filter(
                          (s) =>
                            s.customerId === draft.customerId &&
                            s.availability === "可匹配",
                        )
                        .map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.model} · {s.quantity}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="recon-tabs">
                <button
                  className={view === "fields" ? "active" : ""}
                  onClick={() => setView("fields")}
                >
                  字段核对
                </button>
                <button
                  className={view === "results" ? "active" : ""}
                  onClick={() => setView("results")}
                >
                  25 列结果
                </button>
                <span>{draft.finalized ? "最终 25 列核对单" : "AI 核对结果"}</span>
              </div>
              {view === "fields" ? (
                <>
                  <div className="recon-filters">
            {filters.map((f) => (
                      <button
                        key={f}
                        aria-pressed={filter === f}
                        className={filter === f ? "active" : ""}
                        onClick={() => {
                          setFilter(f);
                          setField(null);
                          setPreview(null);
                        }}
                      >
                        {f} <b>{rows.filter((r) => accepts(r, f)).length}</b>
                      </button>
                    ))}
                  </div>
                  <div className="field-scroll">
                    <table className="recon-field-table">
                      <thead>
                        <tr>
                          <th>字段</th>
                          <th>当前结果</th>
                          <th>核验状态</th>
                          <th>来源 / 证据</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .filter((r) => accepts(r, filter))
                          .map((r) => (
                            <Fragment key={r.field}>
                              <tr
                                id={`field-${line.id}-${r.field}`}
                                className={
                                  r.field === active?.field
                                    ? "active-field"
                                    : ""
                                }
                                onClick={() => select(line.id, r.field)}
                              >
                                <th>
                                  <button
                                    onClick={() => select(line.id, r.field)}
                                  >
                                    {r.field}
                                  </button>
                                </th>
                                <td>{value(r.currentValue)}</td>
                                <td>
                                  <span
                                    className={`field-status ${r.conflict ? "conflict" : r.missing && r.required ? "missing" : r.verified ? "verified" : ""}`}
                                  >
                                    {r.status}
                                  </span>
                                  {r.locked && (
                                    <LockKeyhole
                                      size={12}
                                      aria-label="人工锁定"
                                    />
                                  )}
                                </td>
                                <td>
                                  <small>
                                    {r.valueOrigin === "HUMAN"
                                      ? "人工"
                                      : r.valueOrigin === "EMPTY"
                                        ? "无来源"
                                        : [
                                            ...new Set(
                                              r.evidence.map(
                                                (e) => e.sourceMaterialType,
                                              ),
                                            ),
                                          ].join(" + ") || "委托"}{" "}
                                    · {r.evidenceCount}
                                  </small>
                                </td>
                              </tr>
                              {r.field === active?.field && (
                                <tr className="field-expanded">
                                  <td colSpan={4}>
                                    <FieldEditor
                                      key={`${line.id}-${r.field}-${draft.version}`}
                                      row={r}
                                      lineId={line.id}
                                      finalized={draft.finalized}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                      </tbody>
                    </table>
                    {!rows.some((r) => accepts(r, filter)) && (
                      <div className="recon-empty">
                        <Check size={24} />
                        <p>当前商品没有{filter}项</p>
                        <button onClick={() => setFilter("全部字段")}>
                          查看全部 25 字段
                        </button>
                      </div>
                    )}
                  </div>
                  <details className="relation-tools">
                    <summary>商品关系与确认</summary>
                <LineActions
                  key={line.id}
                      draft={draft}
                      line={line}
                      sources={state.sources}
                      evidence={state.evidence.filter(
                        (e) => e.entrustmentLineId === line.id,
                      )}
                      onFieldSelect={(f) => select(line.id, f)}
                    />
                  </details>
                </>
              ) : (
                <div className="recon-overview-wrapper">
                  {/* 表格顶层控制栏：商品筛选切片 + 模式切换器 */}
                  <div className="table-controls-bar">
                    <div className="filter-chips" role="tablist" aria-label="商品行分类筛选">
                      <button
                        className={`chip ${resultFilter === "ALL" ? "active" : ""}`}
                        onClick={() => setResultFilter("ALL")}
                      >
                        全部商品 ({draft.lines.length})
                      </button>
                      <button
                        className={`chip chip-green ${resultFilter === "RECONCILED" ? "active" : ""}`}
                        onClick={() => setResultFilter("RECONCILED")}
                      >
                        ✓ 已基于查货核对 ({reconciledLines.length})
                      </button>
                      {unreconciledLines.length > 0 && (
                        <button
                          className={`chip chip-orange ${resultFilter === "UNCHECKED" ? "active" : ""}`}
                          onClick={() => setResultFilter("UNCHECKED")}
                        >
                          ○ 缺少查货资料 ({unreconciledLines.length})
                        </button>
                      )}
                      {userModifiedLines.length > 0 && (
                        <button
                          className={`chip chip-blue ${resultFilter === "MODIFIED" ? "active" : ""}`}
                          onClick={() => setResultFilter("MODIFIED")}
                        >
                          ✏️ 用户已修正 ({userModifiedLines.length})
                        </button>
                      )}
                      {conflictLines.length > 0 && (
                        <button
                          className={`chip chip-red ${resultFilter === "CONFLICT" ? "active" : ""}`}
                          onClick={() => setResultFilter("CONFLICT")}
                        >
                          ⚠️ 查货差异 ({conflictLines.length})
                        </button>
                      )}
                    </div>
                    <div className="table-mode-switch">
                      <span className="mode-switch-label">数据对照模式：</span>
                      <div className="mode-button-group">
                        <button
                          className={`mode-btn ${tableMode === "LATEST" ? "active" : ""}`}
                          onClick={() => setTableMode("LATEST")}
                          title="展示 AI 核对与人工修正后的最新推荐结果"
                        >
                          最新核对结果
                        </button>
                        <button
                          className={`mode-btn ${tableMode === "ORIGINAL" ? "active" : ""}`}
                          onClick={() => setTableMode("ORIGINAL")}
                          title="展示客户导入的原始委托申报值"
                        >
                          原始委托原值
                        </button>
                        <button
                          className={`mode-btn ${tableMode === "DIFF" ? "active" : ""}`}
                          onClick={() => setTableMode("DIFF")}
                          title="对比原始委托申报值与最新核对值的变动（原值 → 现值）"
                        >
                          差异对比
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 模式说明小提示 */}
                  <div className="table-mode-hint">
                    {tableMode === "LATEST" && (
                      <span>
                        当前展示<b>【最新核对结果】</b>：融合查货资料后的申报值，带有 <span className="sample-pill-blue">✏️ 蓝色角标</span> 的单元格为<b>用户手动修正项</b>，带有 <span className="sample-pill-red">⚠️ 红色角标</span> 为<b>冲突差异项</b>。
                      </span>
                    )}
                    {tableMode === "ORIGINAL" && (
                      <span>
                        当前展示<b>【原始委托原值】</b>：纯客户委托草稿原件填报数值，尚未融合查货单数据，用于与核对结果对照查证。
                      </span>
                    )}
                    {tableMode === "DIFF" && (
                      <span>
                        当前展示<b>【差异对比】</b>：高亮显示经查货核对或人工修正后发生变动的字段（格式为：<b>原值 → 现值</b>）。
                      </span>
                    )}
                  </div>

                  <div className="result-scroll">
                    <table className="recon-result-table enhanced-table">
                      <thead>
                        <tr>
                          <th className="th-fixed th-index">商品序号</th>
                          <th className="th-fixed th-status">查货核对状态</th>
                          <th className="th-fixed th-evidence">查货依据来源</th>
                          {FINAL_OUTPUT_FIELDS.map((f) => (
                            <th key={f}>{f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {draft.lines
                          .filter((l) => {
                            const st = lineStatuses.get(l.id);
                            if (resultFilter === "RECONCILED") return st?.hasInspection;
                            if (resultFilter === "UNCHECKED") return !st?.hasInspection;
                            if (resultFilter === "MODIFIED") return st?.isHumanModified;
                            if (resultFilter === "CONFLICT") return st?.hasConflict;
                            return true;
                          })
                          .map((l) => {
                            const st = lineStatuses.get(l.id);
                            const lRows = rowsByLine.get(l.id) ?? [];
                            const isSelectedLine = l.id === line.id;
                            return (
                              <tr
                                key={l.id}
                                className={`${isSelectedLine ? "row-selected" : ""} ${!st?.hasInspection ? "row-unchecked" : ""}`}
                              >
                                <th className="td-fixed td-index">
                                  <button
                                    onClick={() => select(l.id, null)}
                                    aria-label={`行 ${String(draft.lines.indexOf(l) + 1).padStart(2, "0")}`}
                                    title="点击聚焦查看该商品详情与字段"
                                  >
                                    <b>商品 {String(draft.lines.indexOf(l) + 1).padStart(2, "0")}</b>
                                    <small>{short(l.id)} · {l.model || "—"}</small>
                                  </button>
                                </th>
                                <td className="td-fixed td-status">
                                  <span className={`table-status-badge ${st?.badgeClass ?? ""}`}>
                                    {st?.badgeText ?? "核对中"}
                                  </span>
                                </td>
                                <td className="td-fixed td-evidence" title={st?.inspectionSummary}>
                                  <span className="evidence-text">
                                    {st?.hasInspection ? st.inspectionSummary : "○ 暂无查货单"}
                                  </span>
                                </td>
                                {FINAL_OUTPUT_FIELDS.map((f) => {
                                  const r = lRows.find((item) => item.field === f);
                                  const baseVal = r?.baseValue ?? l.fields[f];
                                  const currentVal = l.fields[f];
                                  const isHuman = r?.human;
                                  const isConflict = r?.conflict;
                                  const isChanged = r?.changed;

                                  let cellContent = value(currentVal);
                                  let cellClass = "";
                                  let cellTitle = `${f}: ${value(currentVal)}`;

                                  if (tableMode === "ORIGINAL") {
                                    cellContent = value(baseVal);
                                    cellTitle = `原始委托值: ${value(baseVal)}`;
                                  } else if (tableMode === "DIFF") {
                                    if (isChanged) {
                                      cellClass = "diff-cell-changed";
                                      cellTitle = `变动字段：原值 ${value(baseVal)} → 现值 ${value(currentVal)}`;
                                      cellContent = `${value(baseVal)} → ${value(currentVal)}`;
                                    } else {
                                      cellContent = value(currentVal);
                                      cellTitle = `一致无变动: ${value(currentVal)}`;
                                    }
                                  } else {
                                    // LATEST mode
                                    if (isHuman) {
                                      cellClass = "cell-human-modified";
                                      cellTitle = `用户手动修改（原委托值: ${value(baseVal)} → 修改为: ${value(currentVal)}）`;
                                    } else if (isConflict) {
                                      cellClass = "cell-conflict";
                                      cellTitle = `存在冲突：当前值 ${value(currentVal)}`;
                                    } else if (isChanged) {
                                      cellClass = "cell-ai-updated";
                                      cellTitle = `AI 基于查货资料调整（原值: ${value(baseVal)} → 现值: ${value(currentVal)}）`;
                                    }
                                  }

                                  return (
                                    <td key={f} className={cellClass}>
                                      <button
                                        onClick={() => select(l.id, f)}
                                        title={cellTitle}
                                      >
                                        {tableMode === "LATEST" && isHuman && (
                                          <Pencil size={11} className="cell-pencil-icon" />
                                        )}
                                        {tableMode === "LATEST" && isConflict && (
                                          <AlertTriangle size={11} className="cell-conflict-icon" />
                                        )}
                                        {tableMode === "DIFF" && isChanged ? (
                                          <span className="diff-inline">
                                            <span className="diff-old">{value(baseVal)}</span>
                                            <span className="diff-arrow">→</span>
                                            <span className="diff-new">{value(currentVal)}</span>
                                          </span>
                                        ) : (
                                          <span>{cellContent}</span>
                                        )}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {draft.lines.filter((l) => {
                      const st = lineStatuses.get(l.id);
                      if (resultFilter === "RECONCILED") return st?.hasInspection;
                      if (resultFilter === "UNCHECKED") return !st?.hasInspection;
                      if (resultFilter === "MODIFIED") return st?.isHumanModified;
                      if (resultFilter === "CONFLICT") return st?.hasConflict;
                      return true;
                    }).length === 0 && (
                      <div className="recon-empty-filter">
                        <Filter size={20} />
                        <p>没有符合当前筛选条件的商品行</p>
                        <button onClick={() => setResultFilter("ALL")}>查看全部商品</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="recon-empty">暂无商品行</div>
          )}
        </section>
        <aside
          className={`recon-right ${drawer === "right" ? "drawer-open" : ""}`}
        >
          <button
            className="drawer-close icon-button"
            aria-label="关闭证据"
            onClick={() => setDrawer(null)}
          >
            <X size={18} />
          </button>
          <h3>
            <Search size={16} />
            原文与证据
          </h3>
          <div className="evidence-context">
            <small>
              {short(line?.id ?? "")} / 当前字段：{active?.field ?? "—"}
            </small>
            <strong>{value(active?.currentValue)}</strong>
            <span>证据 {uniqueEntries.length} 条</span>
          </div>
          <div className="material-file-tabs" role="tablist" aria-label="相关材料原文件">
            {taskFiles.map((f) => {
              const isSelected = f.id === currentFile?.id;
              const isLineDirect = currentLineSources.some((s) => s.sourceFileId === f.id) || entrustFileIds.has(f.id);
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={isSelected}
                  className={`material-file-tab ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    setSelectedFileId(f.id);
                    setPreview(null);
                  }}
                  title={f.name}
                >
                  <span className="material-tab-badge">{f.materialType}</span>
                  <span className="material-tab-name">{f.name}</span>
                  {isLineDirect && <span className="material-tab-dot" title="当前商品行关联原件" />}
                </button>
              );
            })}
          </div>
          {uniqueEntries.length > 0 ? (
            <>
              <div className="evidence-source-tabs">
                {[
                  "全部",
                  ...new Set(
                    uniqueEntries.map(
                      (e) =>
                        state.files.find((f) => f.id === e.location.fileId)
                          ?.materialType ?? "其他",
                    ),
                  ),
                ].map((s) => (
                  <button
                    className={source === s ? "active" : ""}
                    key={s}
                    onClick={() => setSource(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {uniqueEntries
                .filter(
                  (e) =>
                    source === "全部" ||
                    state.files.find((f) => f.id === e.location.fileId)
                      ?.materialType === source,
                )
                .map((e) => {
                  const file = state.files.find((f) => f.id === e.location.fileId);
                  return (
                    <article
                      className={`evidence-entry ${activePreview?.key === e.key ? "selected" : ""}`}
                      key={e.key}
                    >
                      <button
                        className="evidence-entry-title"
                        onClick={() => {
                          setField(active.field);
                          setSelectedFileId(e.location.fileId);
                          setPreview({
                            location: e.location,
                            name: file?.name ?? e.location.fileId,
                            key: e.key,
                          });
                        }}
                      >
                        <FileText size={14} />
                        {file?.name ?? e.location.fileId}
                      </button>
                      <small>
                        {e.location.sheet
                          ? `Sheet ${e.location.sheet} · ${e.location.column ?? ""}${e.location.row ?? ""}`
                          : e.location.page
                            ? `第 ${e.location.page} 页`
                            : (e.location.position ?? "位置未记录")}
                      </small>
                      <blockquote>
                        {e.location.rawText || "原文未记录，可查看原文件"}
                      </blockquote>
                      <dl>
                        <div>
                          <dt>原始值</dt>
                          <dd>{value(e.raw)}</dd>
                        </div>
                        <div>
                          <dt>标准化值</dt>
                          <dd>{value(e.normalized)}</dd>
                        </div>
                      </dl>
                      <button
                        className="text-button"
                        onClick={() => {
                          setField(active.field);
                          setSelectedFileId(e.location.fileId);
                          setPreview({
                            location: e.location,
                            name: file?.name ?? e.location.fileId,
                            key: e.key,
                          });
                        }}
                      >
                        定位到原文
                        <ChevronRight size={13} />
                      </button>
                      <div className="evidence-related">
                        {draft.lines
                          .flatMap((l) =>
                            (rowsByLine.get(l.id) ?? []).filter((r) =>
                              r.evidence.some(
                                (item) =>
                                  item.id === e.key ||
                                  item.references?.some((ref) => ref.key === e.key),
                              ),
                            ),
                          )
                          .map((r) => (
                            <button
                              key={`${r.field}-${e.key}`}
                              className="text-button"
                              onClick={() => {
                                select(line.id, r.field);
                                setSelectedFileId(e.location.fileId);
                                setPreview({
                                  location: e.location,
                                  name: file?.name ?? e.location.fileId,
                                  key: e.key,
                                });
                              }}
                            >
                              {short(line.id)} · {r.field}
                            </button>
                          ))}
                      </div>
                    </article>
                  );
                })}
            </>
          ) : (
            <div className="evidence-direct-note">
              <FileText size={14} />
              <div>
                <strong>已定位到具体原文件对照</strong>
                <span>无需 OCR 字段级坐标，可直接在下方查看原件内容。</span>
              </div>
            </div>
          )}
          {activePreview && (
            <MaterialPreview
              key={`${activePreview.key}-${activePreview.location.fileId}`}
              location={activePreview.location}
              name={activePreview.name}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function FieldEditor({
  row,
  lineId,
  finalized,
}: {
  row: FieldRow;
  lineId: string;
  finalized: boolean;
}) {
  const edit = useDemoStore((s) => s.editSelectedLineField);
  const updateMaterial = useDemoStore(s=>s.updateSelectedDraftMaterial);
  const [input, setInput] = useState(row.currentValue ?? "");
  const [reason, setReason] = useState("");
  const [locked, setLocked] = useState(row.locked);
  const candidates = row.evidence
    .flatMap((e) =>
      (e.isManuallyEdited ? [] : e.candidateValues.length ? e.candidateValues : e.references?.length===1 ? [e.references[0].normalizedValue] : []).map((v) => ({
        value: v,
        id: e.id,
        source: e.sourceMaterialType,
      })),
    )
    .filter(
      (c, i, a) =>
        c.value !== null && a.findIndex((x) => x.value === c.value) === i,
    );
  const save = (v: string, id?: string) =>
    edit(lineId, row.field, v, {
      actor: "Demo 当前用户",
      reason,
      occurredAt: new Date().toISOString(),
      sourceEvidenceId: id,
      locked,
    });
  return (
    <div className="field-editor">
      <div className="field-comparison">
        <div>
          <small>原始委托</small>
          <strong>{value(row.baseValue)}</strong>
        </div>
        <div>
          <small>当前结果</small>
          <strong>{value(row.currentValue)}</strong>
        </div>
        <div>
          <small>AI 动作</small>
          <strong>
            {(
              {
                KEEP: "保留",
                FILL: "补全",
                UPDATE: "更新",
                CONFLICT: "存在冲突",
                MISSING: "缺失",
                NO_ACTION: "未调整",
              } as Record<string, string>
            )[row.action] ?? row.action}
          </strong>
        </div>
      </div>
      {row.decision?.reason && (
        <p className="decision-reason">{row.decision.reason}</p>
      )}
      {row.review && (
        <p className="human-record">
          {row.review.actor} ·{" "}
          {new Date(row.review.occurredAt).toLocaleString("zh-CN")}
          <br />
          {row.review.reason || "确认当前值"}
        </p>
      )}
      {!finalized && (
        <>
          <label className="review-reason">
            处理原因{row.conflict ? "（必填）" : ""}
            <input
              aria-label="处理原因"
              placeholder="填写判断依据"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="candidate-actions">
            <button
              disabled={row.conflict && !reason.trim()}
              onClick={() => save(row.baseValue ?? "", row.evidence.find(e=>e.sourceMaterialType==='委托书'&&!e.isManuallyEdited)?.id)}
            >
              采用委托值
            </button>
            {candidates.map((c) => (
              <button
                disabled={row.conflict && !reason.trim()}
                key={c.value}
                onClick={() => save(c.value ?? "", c.id)}
              >
                采用{c.source}：{c.value}
              </button>
            ))}
          </div>
          <div className="manual-input">
            <input
              aria-label={`手动修改 ${row.field}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              disabled={row.conflict && !reason.trim()}
              onClick={() => save(input)}
            >
              保存修改
            </button>
            <button
              disabled={row.conflict && !reason.trim()}
              onClick={() => save(row.currentValue ?? "")}
            >
              确认当前值
            </button>
          </div>
          <div className="lock-setting">
            <button type="button" role="switch" aria-label="保存后人工锁定" aria-checked={locked} className="lock-switch" onClick={() => setLocked(!locked)}><span /></button>
            <span>保存后人工锁定</span>
            {locked && <LockKeyhole size={13} aria-hidden="true" />}
          </div>
          <details className="revise-order"><summary>原始委托有误</summary><button onClick={()=>updateMaterial(lineId,row.field,input)}>修订原始委托并重新核对</button></details>
        </>
      )}
    </div>
  );
}
