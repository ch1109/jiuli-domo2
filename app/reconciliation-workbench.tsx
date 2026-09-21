"use client";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  LockKeyhole,
  Search,
  Sparkles,
  X,
  Upload,
} from "lucide-react";
import { useDemoStore, type UiDraft } from "@/lib/demo-store";
import {
  FINAL_OUTPUT_FIELDS,
  type FinalOutputField,
  type SourceLocation,
} from "@/lib/domain/types";
import { getFieldRows, type FieldRow } from "@/lib/workbench-model";
import { getTaskSummary } from "@/lib/workspace-status";
import {calculateFinalOutputTotals} from '@/lib/domain/final-output';
import {buildFinalReconciliationCsv,finalReconciliationFileName} from '@/lib/final-reconciliation-csv';
import { MaterialPreview } from "./material-preview";
import { LineActions } from "./workbench-relations";
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
  const restored = state.lastVisitedPanel.startsWith('line:') ? state.lastVisitedPanel.slice(5).split('|') : [];
  const [lineId, setLineId] = useState(draft?.lines.some(l=>l.id===restored[0]) ? restored[0] : draft?.lines[0]?.id ?? "");
  const [field, setField] = useState<FinalOutputField | null>(FINAL_OUTPUT_FIELDS.includes(restored[1] as FinalOutputField) ? restored[1] as FinalOutputField : null);
  const [filter, setFilter] = useState<Filter>("全部字段");
  const [view, setView] = useState<"fields" | "results">("results");
  const [history, setHistory] = useState(false);
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [source, setSource] = useState("全部");
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
  const activePreview =
    preview ??
    (uniqueEntries[0]
      ? {
          location: uniqueEntries[0].location,
          name:
            state.files.find((f) => f.id === uniqueEntries[0].location.fileId)
              ?.name ?? uniqueEntries[0].location.fileId,
          key: uniqueEntries[0].key,
        }
      : null);
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
        <div>
          <div className="recon-kicker">核对作业台 / {draft.displayNo}</div>
          <h2>{draft.customerName}</h2>
          <p>
            {draft.id}{" "}
            <span>
              · V{draft.version} · 最近更新{" "}
              {new Date(draft.updatedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
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
                <button
                  className="primary"
                  onClick={state.completeSelectedDraft}
                >
                  <Check size={15} />
                  确认完成
                </button>
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
      <div className="recon-summary">
        <strong>
          <span className="live-dot" />
          {summary.businessStatus}
        </strong>
        <span>
          商品 <b>{draft.lines.length}</b>
        </span>
        <span>
          已匹配{" "}
          <b>
            {summary.matched}/{summary.total}
          </b>
        </span>
        <span>
          已核验{" "}
          <b>
            {all.filter((r) => r.verified).length}/{all.length}
          </b>
        </span>
        <span className="danger-text">
          冲突 <b>{all.filter((r) => r.conflict).length}</b>
        </span>
        <span>
          必填缺失 <b>{all.filter((r) => r.missing && r.required).length}</b>
        </span>
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
                <dt>已匹配商品</dt>
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
                <div className="result-scroll">
                  <table className="recon-result-table">
                    <thead>
                      <tr>
                        <th>商品</th>
                        {FINAL_OUTPUT_FIELDS.map((f) => (
                          <th key={f}>{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((l) => (
                        <tr key={l.id}>
                          <th>{short(l.id)}</th>
                          {FINAL_OUTPUT_FIELDS.map((f) => (
                            <td key={f}>
                              <button onClick={() => select(l.id, f)}>
                                {value(l.fields[f])}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <div className="evidence-related">{draft.lines.flatMap(l=>(rowsByLine.get(l.id)??[]).filter(r=>r.evidence.some(item=>item.id===e.key||item.references?.some(ref=>ref.key===e.key))).map(r=><button key={`${l.id}-${r.field}`} className="text-button" onClick={()=>{select(l.id,r.field);setPreview({location:e.location,name:file?.name??e.location.fileId,key:e.key});}}>{short(l.id)} · {r.field}</button>))}</div>
                </article>
              );
            })}
          {!uniqueEntries.length && (
            <p className="recon-empty">该字段暂无材料证据</p>
          )}
          {activePreview && (
            <MaterialPreview
              key={activePreview.key}
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
