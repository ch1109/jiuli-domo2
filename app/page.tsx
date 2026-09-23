"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CustomerWorkspace } from "./customer-workspace";
import { ReconciliationWorkbench } from "./reconciliation-workbench";
import {
  Archive,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileInput,
  History,
  LayoutDashboard,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  X,
  Home,
  ListTodo,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import {
  getMergedPoolProducts,
  getPocMetrics,
  getScenarioAcceptanceReport,
  useDemoStore,
  type ViewKey,
} from "@/lib/demo-store";
import scenarios from "@/demo-generated/mock/scenarios.json";
import {
  FINAL_OUTPUT_FIELDS,
  type MaterialType,
} from "@/lib/domain/types";
import type { ParsedFactRow } from "@/lib/intake/parse-contract";

const navItems: Array<{
  key: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "home", label: "客户工作台", icon: Home },
  { key: "workbench", label: "当前核对任务", icon: ListTodo },
  { key: "history", label: "历史任务", icon: History },
];

function businessStatus(value: string) {
  if (value === "已找到查货依据") return "AI 已找到依据，等待人工确认";
  if (value === "已完成") return "已完成并封版";
  if (value === "草稿占用") return "已用于当前核对";
  return value;
}

const statusClass: Record<string, string> = {
  可匹配: "status-green",
  已找到查货依据: "status-green",
  可提交人工确认: "status-blue",
  人工确认中: "status-orange",
  人工已确认: "status-blue",
  草稿占用: "status-orange",
  已核销: "status-gray",
  暂无查货依据: "status-gray",
  待人工处理: "status-red",
  部分核对: "status-orange",
  待核对: "status-gray",
  已完成: "status-green",
};

function Status({ value }: { value: string }) {
  return (
    <span className={`status ${statusClass[value] ?? "status-gray"}`}>
      <i />
      {businessStatus(value)}
    </span>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Archive size={20} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export default function HomePage() {
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeKind, setIntakeKind] = useState<"entrustment" | "inspection">("entrustment");
  const view = useDemoStore((state) => state.view);
  const setView = useDemoStore((state) => state.setView);
  const toast = useDemoStore((state) => state.toast);
  const clearToast = useDemoStore((state) => state.clearToast);
  const drafts = useDemoStore((state) => state.drafts);
  const sources = useDemoStore((state) => state.sources);
  const files = useDemoStore((state) => state.files);
  const events = useDemoStore((state) => state.events);
  const versions = useDemoStore((state) => state.versions);
  const selectedDraftId = useDemoStore((state) => state.selectedDraftId);
  const customers = useDemoStore((state) => state.customers);
  const selectedDraft = selectedDraftId
    ? drafts.find((draft) => draft.id === selectedDraftId)
    : undefined;
  const goBack = useDemoStore((state) => state.goBack);
  const selectedWorkspaceCustomerId = useDemoStore(
    (state) => state.selectedWorkspaceCustomerId,
  );
  const historyStack = useDemoStore((state) => state.historyStack);
  const canGoBack =
    historyStack.length > 0 || view !== "home" || Boolean(selectedWorkspaceCustomerId);
  const counts = useMemo(
    () => ({
      ready: sources.filter((source) => source.availability === "可匹配")
        .length,
      occupied: sources.filter((source) => source.availability === "草稿占用")
        .length,
      waiting: drafts.filter(
        (draft) => draft.status === "待核对" || draft.status === "部分核对",
      ).length,
    }),
    [drafts, sources],
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand" role="heading" aria-level={2} aria-label="九立智能核对工作台">
          <div className="brand-mark">九</div>
          <div>
            <strong>九立</strong>
            <span>智能核对工作台</span>
          </div>
        </div>
        <div className="workspace-label primary-label">工作区</div>
        <nav className="nav-list primary-nav" aria-label="主导航">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={view === key ? "nav-item active" : "nav-item"}
              aria-label={
                key === "history"
                  ? "版本与操作"
                  : key === "workbench"
                    ? "当前核对任务"
                    : label
              }
              onClick={() => {
                setView(key);
                setScenarioOpen(false);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-dot" />
          <span>本地状态已保存</span>
          <span className="version">v0.2</span>
        </div>
      </aside>
      <section className="content" aria-hidden={scenarioOpen || undefined}>
        <header className="topbar">
          <div className="topbar-left">
            {canGoBack && (
              <button
                className="page-back-button topbar-back-btn"
                onClick={goBack}
                title="返回上一页"
                aria-label="返回上一页"
              >
                <ArrowLeft size={15} />
                <span>返回上一页</span>
              </button>
            )}
            <div>
              <div className="eyebrow">九立新流程 Demo</div>
              <h1>{
                view === "workbench"
                  ? "核对工作台"
                  : view === "history"
                    ? "版本与操作"
                    : view === "intake"
                      ? "材料接入"
                      : view === "drafts"
                        ? "委托草稿"
                        : (navItems.find((item) => item.key === view)
                            ?.label ?? (view === "console" ? "演示数据" : "核对任务"))
              }</h1>
            </div>
          </div>
          <div className="top-actions">
            <div className="avatar" aria-label="当前用户：PM">
              PM
            </div>
          </div>
        </header>
        {view !== "home" && view !== "workbench" && <div className="metric-row">
          <div className="metric">
            <span>可匹配商品</span>
            <strong>{counts.ready}</strong>
            <small>客户池原始行</small>
          </div>
          <div className="metric">
            <span>草稿占用</span>
            <strong>{counts.occupied}</strong>
            <small>尚未核销</small>
          </div>
          <div className="metric">
            <span>待处理草稿</span>
            <strong>{counts.waiting}</strong>
            <small>需要关注</small>
          </div>
          <div className="metric metric-accent">
            <span>本轮操作</span>
            <strong>{events.length}</strong>
            <small>可追溯事件</small>
          </div>
        </div>
        }
        {toast ? (
          <div className="toast" role="status" aria-live="polite">
            <Check size={16} />
            {toast}
            <button onClick={clearToast} aria-label="关闭提示">
              <X size={15} />
            </button>
          </div>
        ) : null}
        {view === "home" ? (
          <>
            <CustomerWorkspace onAddMaterial={(customerId) => { useDemoStore.getState().setIntakeCustomer(customerId ?? ""); setIntakeKind(customerId ? "inspection" : "entrustment"); setIntakeOpen(true); }} />
            {intakeOpen ? <div className="intake-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIntakeOpen(false); }}><div className="intake-modal" role="dialog" aria-modal="true" aria-label="上传客户材料"><div className="intake-modal-head"><div><strong>上传客户材料</strong><span>Demo 材料接入入口，用于模拟委托材料接口与查货材料接口</span></div><button className="icon-button" aria-label="关闭上传客户材料窗口" onClick={() => setIntakeOpen(false)}><X size={16} /></button></div><IntakeView files={files} customers={customers} drafts={drafts} embedded initialKind={intakeKind} onClose={() => setIntakeOpen(false)} /></div></div> : null}
          </>
        ) : null}
        {view === "intake" ? (
          <IntakeView files={files} customers={customers} drafts={drafts} />
        ) : null}
        {view === "pool" ? (
          <PoolView sources={sources} customers={customers} />
        ) : null}
        {view === "drafts" ? <DraftListView drafts={drafts} /> : null}
        {view === "workbench" ? (
          <ReconciliationWorkbench
            key={selectedDraft?.id ?? "empty-task"}
            draft={selectedDraft}
          />
        ) : null}
        {view === "history" ? (
          <HistoryView events={events} drafts={drafts} versions={versions} />
        ) : null}
        {view === "console" ? <ConsoleView /> : null}
      </section>
      {scenarioOpen ? (
        <ScenarioDrawer onClose={() => setScenarioOpen(false)} />
      ) : null}
    </main>
  );
}


function ScenarioDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside
      id="scenario-drawer"
      className="scenario-drawer"
      role="dialog"
      aria-label="演示数据"
    >
      <div className="scenario-drawer-head">
        <div>
          <strong>演示数据</strong>
          <span>仅用于切换验收场景，不影响正式任务入口</span>
        </div>
        <button
          className="icon-button"
          aria-label="关闭演示数据"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <p className="scenario-drawer-note">
        <AlertTriangle size={14} />
        恢复场景会清空当前演示操作并回到该场景的初始状态。
      </p>
      <ConsoleView embedded />
    </aside>
  );
}

function IntakeView({
  files,
  customers,
  embedded = false,
  initialKind = "entrustment",
  onClose,
}: {
  files: ReturnType<typeof useDemoStore.getState>["files"];
  customers: ReturnType<typeof useDemoStore.getState>["customers"];
  drafts: ReturnType<typeof useDemoStore.getState>["drafts"];
  embedded?: boolean;
  initialKind?: "entrustment" | "inspection";
  onClose?: () => void;
}) {
  type UploadKind = "entrustment" | "inspection";
  type IntakePhase = "ready" | "processing" | "result";
  const [kind, setKind] = useState<UploadKind>(initialKind);
  const [phase, setPhase] = useState<IntakePhase>("ready");
  const [customerId, setCustomerId] = useState("");
  const [inspectionFiles, setInspectionFiles] = useState<File[]>([]);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [auxiliaryFiles, setAuxiliaryFiles] = useState<File[]>([]);
  const [auxiliaryTypes, setAuxiliaryTypes] = useState<Record<string, "发票" | "箱单">>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [error, setError] = useState("");
  const selectedCustomerId = useDemoStore((state) => state.selectedIntakeCustomerId);
  const setIntakeCustomer = useDemoStore((state) => state.setIntakeCustomer);
  const stageLocalFile = useDemoStore((state) => state.stageLocalFile);
  const parseLocalFile = useDemoStore((state) => state.parseLocalFile);
  const createDraftFromEntrustmentFile = useDemoStore((state) => state.createDraftFromEntrustmentFile);
  const setView = useDemoStore((state) => state.setView);
  const convertedEntrustments = useDemoStore((state) => state.convertedEntrustments);
  const convertedInspections = useDemoStore((state) => state.convertedInspections);
  const sources = useDemoStore((state) => state.sources);
  const intakeFiles = batchId ? files.filter((file) => file.batchId === batchId) : [];
  const effectiveCustomerId = customerId || selectedCustomerId || "";
  const resolvedCustomer = intakeFiles.map((file) => file.customerId).find(Boolean) ?? effectiveCustomerId;
  const resolvedCustomerName = customers.find((customer) => customer.id === resolvedCustomer)?.name;

  useEffect(() => {
    if (phase !== "processing") return;
    const timer = window.setInterval(() => setProcessingStep((step) => Math.min(step + 1, 3)), 850);
    const finish = window.setTimeout(() => setPhase("result"), 3200);
    return () => { window.clearInterval(timer); window.clearTimeout(finish); };
  }, [phase]);

  const acceptFiles = (incoming: FileList | null, setter: (files: File[]) => void, multiple = true) => {
    const next = Array.from(incoming ?? []);
    setter(multiple ? next : next.slice(0, 1));
    setError("");
  };
  const detectAuxiliaryType = (fileName: string): "发票" | "箱单" | "" => {
    const normalized = fileName.toLowerCase();
    if (normalized.includes("packing") || normalized.includes("pack") || normalized.includes("箱单")) return "箱单";
    if (normalized.includes("invoice") || normalized.includes("inv") || normalized.includes("发票")) return "发票";
    return "";
  };
  const selectAuxiliaryFiles = (incoming: FileList | null) => {
    const next = Array.from(incoming ?? []);
    setAuxiliaryFiles(next);
    setAuxiliaryTypes(Object.fromEntries(next.map((file) => [file.name, detectAuxiliaryType(file.name)]).filter((entry): entry is [string, "发票" | "箱单"] => Boolean(entry[1]))));
    setError("");
  };

  const handleSubmit = () => {
    const filesToUpload = kind === "inspection" ? inspectionFiles : [mainFile, ...auxiliaryFiles].filter((file): file is File => Boolean(file));
    if (kind === "inspection" && !effectiveCustomerId) { setError("查货资料必须先指定所属客户"); return; }
    if (kind === "inspection" && !inspectionFiles.length) { setError("请先选择查货 PDF"); return; }
    if (kind === "entrustment" && !mainFile) { setError("请先上传 1 份主体委托书"); return; }
    const nextBatchId = `UPLOAD-BATCH-${Date.now()}`;
    setBatchId(nextBatchId);
    setPhase("processing");
    setProcessingStep(0);
    filesToUpload.forEach((file, index) => {
      const auxiliaryFile = auxiliaryFiles[index - 1];
      const materialType: MaterialType | undefined = kind === "inspection" ? "查货" : index === 0 ? "委托书" : auxiliaryTypes[auxiliaryFile?.name] || detectAuxiliaryType(auxiliaryFile?.name ?? "") || undefined;
      stageLocalFile({ name: file.name, size: file.size, type: file.type, file, materialType, customerId: effectiveCustomerId || undefined, batchId: nextBatchId });
    });
    window.setTimeout(() => {
      const staged = useDemoStore.getState().files.filter((file) => file.batchId === nextBatchId);
      staged.forEach((file) => { void parseLocalFile(file.id); });
    }, 0);
  };

  const resetForNext = () => { setPhase("ready"); setBatchId(null); setProcessingStep(0); setInspectionFiles([]); setMainFile(null); setAuxiliaryFiles([]); setAuxiliaryTypes({}); setError(""); };
  const cancel = () => { if (onClose) onClose(); else setView("home"); };
  const openTask = () => {
    const file = intakeFiles.find((item) => item.materialType === "委托书" && convertedEntrustments.some((entry) => entry.sourceFileId === item.id));
    if (file) createDraftFromEntrustmentFile(file.id);
    setView(embedded ? "home" : "workbench");
    onClose?.();
  };
  const openInspectionImpact = () => { setView("home"); onClose?.(); };
  const resultCount = kind === "inspection"
    ? convertedInspections.filter((item) => intakeFiles.some((file) => file.id === item.sourceFileId)).reduce((sum, item) => sum + item.lines.length, 0)
    : convertedEntrustments.filter((item) => intakeFiles.some((file) => file.id === item.sourceFileId)).reduce((sum, item) => sum + item.lines.length, 0);
  const affectedCount = kind === "inspection" && resolvedCustomer ? sources.filter((source) => source.customerId === resolvedCustomer).length : 0;

  if (phase === "processing") {
    const steps = kind === "inspection" ? ["文件上传完成", "正在识别查货内容", "正在整理查货商品", "正在检查受影响的委托任务"] : ["文件上传完成", "正在识别客户与商品", "正在生成委托草稿", "正在寻找已有查货依据"];
    return <div className="intake-content"><div className="intake-processing"><span className="intake-processing-icon"><Upload size={20} /></span><h2>材料处理中</h2><p>系统正在自动完成材料识别和业务接入</p><div className="intake-progress-list">{steps.map((step, index) => <div className={index < processingStep ? "complete" : index === processingStep ? "active" : ""} key={step}><b>{index < processingStep ? <Check size={14} /> : index === processingStep ? <span className="progress-dot" /> : index + 1}</b><span>{step}</span></div>)}</div></div></div>;
  }

  if (phase === "result") {
    const needsCustomer = kind === "entrustment" && !resolvedCustomer;
    return <div className="intake-content"><div className={needsCustomer ? "intake-result warning" : "intake-result"}><div className="result-title"><span className="result-icon">{needsCustomer ? <AlertTriangle size={19} /> : <Check size={19} />}</span><div><h2>{needsCustomer ? "材料已接收，客户待确认" : kind === "inspection" ? "查货资料处理完成" : "材料处理完成"}</h2><p>{needsCustomer ? "识别不到唯一客户，商品匹配将在确认后开始" : "系统已完成本批材料的自动识别和接入"}</p></div></div>{resolvedCustomerName ? <div className="result-customer"><span>客户</span><strong>{resolvedCustomerName}</strong></div> : null}<div className="result-summary"><div><span>本次上传</span><strong>{intakeFiles.length} 份文件</strong></div><div><span>{kind === "inspection" ? "整理结果" : "识别结果"}</span><strong>{resultCount ? `${resultCount} ${kind === "inspection" ? "条查货明细" : "个待核对商品"}` : kind === "inspection" ? "查货批次已建立" : "待核对商品已记录"}</strong></div>{kind === "inspection" ? <div><span>可能受影响的委托</span><strong>{affectedCount ? `${affectedCount} 条依据` : "暂无"}</strong></div> : null}</div><div className="result-system"><span>系统已</span><div><Check size={14} />{kind === "inspection" ? "将资料加入客户查货池" : needsCustomer ? "保存材料并生成客户待确认待办" : "生成委托草稿并开始寻找已有查货依据"}</div></div><div className="intake-actions"><button className="secondary" onClick={resetForNext}>继续上传</button><button className="primary" onClick={needsCustomer ? resetForNext : kind === "inspection" ? openInspectionImpact : openTask}>{needsCustomer ? "确认客户" : kind === "inspection" ? "查看本次影响" : "查看委托任务"}<ChevronRight size={15} /></button></div></div></div>;
  }

  const selectedFiles = kind === "inspection" ? inspectionFiles : [mainFile, ...auxiliaryFiles].filter((file): file is File => Boolean(file));
  return <div className="intake-content"><div className="intake-intro">{!embedded ? <div><span className="eyebrow">材料接入</span><h1>上传客户材料</h1><p>Demo 材料接入入口，用于模拟委托材料接口与查货材料接口</p></div> : null}<div className="intake-tabs" role="tablist"><button role="tab" aria-selected={kind === "entrustment"} className={kind === "entrustment" ? "active" : ""} onClick={() => { setKind("entrustment"); setError(""); }}>委托材料</button><button role="tab" aria-selected={kind === "inspection"} className={kind === "inspection" ? "active" : ""} onClick={() => { setKind("inspection"); setError(""); }}>查货材料</button></div></div>{kind === "inspection" ? <div className="intake-form"><label className="intake-field"><span>所属客户 <em>必填</em></span><select aria-label="选择查货客户" value={effectiveCustomerId} onChange={(event) => { setCustomerId(event.target.value); setIntakeCustomer(event.target.value); }}><option value="">搜索并选择客户</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><small>查货资料必须先指定客户，上传后进入该客户的查货资料池。</small></label><FileDrop title="查货资料" detail="拖拽或点击上传 PDF，支持一次上传多份" files={inspectionFiles} onFiles={(incoming) => acceptFiles(incoming, setInspectionFiles)} accept=".pdf" multiple required /></div> : <div className="intake-form"><label className="intake-field"><span>所属客户 <em className="optional-label">选填</em></span><select aria-label="选择委托客户（选填）" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setIntakeCustomer(event.target.value); }}><option value="">由委托书自动识别</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><small>不填写时，系统会从委托书中识别客户；识别失败时材料仍会保存。</small></label><FileDrop title="主体委托书" detail="拖入或选择 1 份委托书，支持 PDF / Excel" files={mainFile ? [mainFile] : []} onFiles={(incoming) => acceptFiles(incoming, (next) => setMainFile(next[0] ?? null), false)} accept=".pdf,.xlsx,.xls" multiple={false} required /><FileDrop title="辅助材料" detail="发票、箱单，可上传多份" files={auxiliaryFiles} onFiles={selectAuxiliaryFiles} accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" /></div>}{error ? <div className="intake-error" role="alert"><AlertTriangle size={15} />{error}</div> : null}{selectedFiles.length ? <div className="intake-file-list"><strong>本次文件</strong>{selectedFiles.map((file, index) => { const auxiliary = kind === "entrustment" && index > 0; const identifiedType = auxiliary ? auxiliaryTypes[file.name] || detectAuxiliaryType(file.name) : ""; return <div key={`${file.name}-${index}`}><FileInput size={15} /><span>{file.name}</span>{auxiliary && !identifiedType ? <select aria-label={`选择 ${file.name} 类型`} value={auxiliaryTypes[file.name] ?? ""} onChange={(event) => setAuxiliaryTypes({ ...auxiliaryTypes, [file.name]: event.target.value as "发票" | "箱单" })}><option value="">无法识别类型</option><option value="发票">发票</option><option value="箱单">箱单</option></select> : <small>{kind === "inspection" ? "查货资料" : index === 0 ? "委托书" : identifiedType}</small>}</div>; })}</div> : null}<div className="intake-footer"><button className="secondary" onClick={cancel}>取消</button><button className="primary" onClick={handleSubmit}>上传并处理<ChevronRight size={15} /></button></div></div>;
}

function FileDrop({ title, detail, files, onFiles, accept, multiple = true, required = false }: { title: string; detail: string; files: File[]; onFiles: (files: FileList | null) => void; accept: string; multiple?: boolean; required?: boolean }) {
  return <label className="intake-drop"><div className="intake-drop-icon"><Upload size={19} /></div><strong>{title} {required ? <em>必填</em> : <small>选填</small>}</strong><span>{detail}</span>{files.length ? <div className="drop-file-count">已选择 {files.length} 个文件</div> : <div className="drop-placeholder">点击选择文件</div>}<input type="file" hidden multiple={multiple} accept={accept} onChange={(event) => { onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>;
}

function MaterialUploadZone({
  title,
  detail,
  count,
  required,
  onFiles,
}: {
  title: string;
  detail: string;
  count: number;
  required?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className="material-zone">
      <div className="material-zone-icon"><Upload size={19} /></div>
      <strong>{title}{required ? <em>必填</em> : null}</strong>
      <span>{detail}</span>
      <small>{count ? `已添加 ${count} 份` : "点击选择或拖入文件"}</small>
      <input
        type="file"
        multiple
        accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
        hidden
        aria-label={`上传${title}`}
        onChange={(event) => {
          onFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function ParseFeedback({
  fileId,
  jobs,
}: {
  fileId: string;
  jobs: ReturnType<typeof useDemoStore.getState>["parseJobs"];
}) {
  const job = jobs.find((item) => item.sourceFileId === fileId);
  if (job?.errorMessage)
    return <small className="issue">{job.errorMessage}</small>;
  if (job?.reviewReason)
    return <small className="issue">复核原因：{job.reviewReason}</small>;
  return null;
}

function ParseTaskAction({
  fileId,
  jobs,
  onParse,
  onReview,
  onResolve,
}: {
  fileId: string;
  jobs: ReturnType<typeof useDemoStore.getState>["parseJobs"];
  onStart: (fileId: string) => void;
  onParse: (fileId: string) => Promise<void>;
  onReview: (fileId: string, reason: string) => void;
  onResolve: (fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const parseResult = useDemoStore((state) =>
    state.parseResults.find((item) => item.sourceFileId === fileId),
  );
  const stagedFile = useDemoStore((state) =>
    state.files.find((item) => item.id === fileId),
  );
  const customers = useDemoStore((state) => state.customers);
  const resolveCustomer = useDemoStore(
    (state) => state.resolveParsedFileCustomer,
  );
  const job = jobs.find((item) => item.sourceFileId === fileId);
  const completeManualParse = useDemoStore(
    (state) => state.completeManualParse,
  );
  const rebindLocalFile = useDemoStore((state) => state.rebindLocalFile);
  if (!job || job.status === "待解析" || job.status === "解析失败")
    return (
      <>
        <button className="text-button" onClick={() => onParse(fileId)}>
          {job?.status === "解析失败" ? "重试解析" : "开始解析"}{" "}
          <ChevronRight size={14} />
        </button>
        {job?.status === "解析失败" ? (
          <label className="text-button">
            重新选择原文件
            <input
              aria-label={"重新选择 " + fileId + " 原文件"}
              type="file"
              accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void rebindLocalFile(fileId, file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
      </>
    );
  if (job.status === "解析中")
    return (
      <button
        className="text-button"
        onClick={() => onReview(fileId, "解析器尚未返回结果，需人工确认")}
      >
        转人工复核
      </button>
    );
  if (job.status === "待人工复核")
    return (
      <div className="parse-review-action">
        <button className="text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起复核信息" : "查看复核信息"}
        </button>
        {expanded ? (
          <div className="source-detail-list">
            <strong>需要人工复核</strong>
            <span>
              {job.reviewReason ?? job.errorMessage ?? "解析结果不完整"}
            </span>
            <span>
              材料类型：
              {parseResult?.materialType ??
                stagedFile?.materialType ??
                "待识别"}{" "}
              · 已保存事实：{parseResult?.factCount ?? 0} 行
            </span>
            <ManualFactForm
              fileId={fileId}
              materialType={
                (parseResult?.materialType ??
                  stagedFile?.materialType ??
                  "委托书") as MaterialType
              }
              initialCustomerId={stagedFile?.customerId ?? null}
              customers={customers}
              onSave={(facts, type, customerId) =>
                completeManualParse(fileId, facts, type, customerId)
              }
            />
            <button className="text-button" onClick={() => onResolve(fileId)}>
              确认复核并重试 <RotateCcw size={14} />
            </button>
          </div>
        ) : null}
      </div>
    );
  if (!parseResult?.customerId)
    return (
      <div className="customer-resolution-action">
        <span className="issue">
          {stagedFile?.materialType === "委托书"
            ? "未识别到左上角委托方，请补充客户信息"
            : "尚未确定材料客户，请补充客户信息"}
        </span>
        <select
          aria-label={`补充 ${fileId} 客户`}
          defaultValue=""
          onChange={(event) => resolveCustomer(fileId, event.target.value)}
        >
          <option value="" disabled>
            选择客户
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>
    );
  return <span className="muted">客户已确认，等待事实转换</span>;
}

function ManualFactForm({
  fileId,
  materialType,
  initialCustomerId,
  customers,
  onSave,
}: {
  fileId: string;
  materialType: MaterialType;
  initialCustomerId: string | null;
  customers: Array<{ id: string; name: string }>;
  onSave: (
    facts: ParsedFactRow[],
    type: MaterialType,
    customerId: string | null,
  ) => void;
}) {
  const [values, setValues] = useState({
    model: "",
    brand: "",
    quantity: "",
    origin: "",
    warehouseNo: "",
    customerId: initialCustomerId ?? customers[0]?.id ?? "",
  });
  return (
    <div className="source-detail-list" aria-label={`人工录入 ${fileId}`}>
      <label>
        客户
        <select
          value={values.customerId}
          onChange={(e) => setValues({ ...values, customerId: e.target.value })}
        >
          <option value="">待补客户</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        入仓号
        <input
          aria-label="人工录入入仓号"
          value={values.warehouseNo}
          onChange={(e) =>
            setValues({ ...values, warehouseNo: e.target.value })
          }
        />
      </label>
      <label>
        品牌
        <input
          aria-label="人工录入品牌"
          value={values.brand}
          onChange={(e) => setValues({ ...values, brand: e.target.value })}
        />
      </label>
      <label>
        型号
        <input
          aria-label="人工录入型号"
          value={values.model}
          onChange={(e) => setValues({ ...values, model: e.target.value })}
        />
      </label>
      <label>
        数量
        <input
          aria-label="人工录入数量"
          value={values.quantity}
          onChange={(e) => setValues({ ...values, quantity: e.target.value })}
        />
      </label>
      <label>
        产地
        <input
          aria-label="人工录入产地"
          value={values.origin}
          onChange={(e) => setValues({ ...values, origin: e.target.value })}
        />
      </label>
      <button
        className="text-button"
        disabled={
          !values.model.trim() ||
          !values.brand.trim() ||
          !values.quantity.trim() ||
          !values.warehouseNo.trim()
        }
        onClick={() =>
          onSave(
            [
              {
                id: `MANUAL-${fileId}`,
                fields: {
                  品牌: values.brand,
                  型号: values.model,
                  数量: values.quantity,
                  产地: values.origin || "UNKNOWN",
                  入仓号: values.warehouseNo,
                },
                sourceLocation: {
                  page: null,
                  sheet: null,
                  row: null,
                  position: "人工录入",
                },
                confidence: 1,
                warnings: [],
              },
            ],
            materialType,
            values.customerId || null,
          )
        }
      >
        保存人工事实
      </button>
    </div>
  );
}

function PoolView({
  sources,
  customers,
}: {
  sources: ReturnType<typeof useDemoStore.getState>["sources"];
  customers: ReturnType<typeof useDemoStore.getState>["customers"];
}) {
  const [filter, setFilter] = useState("全部");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("全部");
  const scopedSources = sources.filter(
    (source) => customerId === "全部" || source.customerId === customerId,
  );
  const loadedSources = scopedSources.filter(
    (source) => source.availability !== "未加载",
  );
  const merged = getMergedPoolProducts(scopedSources).filter(
    (product) =>
      filter === "全部" ||
      product.sourceLineIds.some(
        (id) =>
          scopedSources.find((source) => source.id === id)?.availability ===
          filter,
      ),
  );
  return (
    <div className="view-stack">
      <div className="section-heading">
        <div>
          <h2>客户商品池</h2>
          <p>
            主视图按同一逻辑查货单的品牌、型号、产地合并，原始事实可随时展开。
          </p>
        </div>
        <div className="pool-filters">
            <select
              aria-label="商品池客户筛选"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="全部">全部客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <div className="segmented" aria-label="商品状态筛选">
              {["全部", "可匹配", "草稿占用", "已核销"].map((item) => (
                <button
                  key={item}
                  className={filter === item ? "selected" : ""}
                  aria-pressed={filter === item}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      <div className="pool-summary">
        <div>
          <strong>{merged.length}</strong>
          <span>合并商品</span>
        </div>
        <div>
          <strong>{loadedSources.length}</strong>
          <span>原始商品行</span>
        </div>
        <div>
          <strong>
            {
              new Set(
                loadedSources.map((item) => item.logicalInspectionOrderId),
              ).size
            }
          </strong>
          <span>逻辑查货单</span>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <strong>查货合并商品</strong>
            <span>展开查看原始组成行、来源和占用关系</span>
          </div>
          <SlidersHorizontal size={16} aria-hidden="true" />
        </div>
        {merged.length === 0 ? (
          <Empty
            title="当前没有可展示的商品"
            detail={
              loadedSources.length === 0
                ? "请先从客户工作台的新建核对任务入口上传查货材料，并填写所属客户。"
                : "当前筛选条件下没有商品，请切换其他状态。"
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>型号</th>
                  <th>品牌</th>
                  <th>产地</th>
                  <th>数量</th>
                  <th>逻辑查货单</th>
                  <th>组成行</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((product) => {
                  const members = product.sourceLineIds
                    .map((id) => sources.find((source) => source.id === id))
                    .filter((source): source is NonNullable<typeof source> =>
                      Boolean(source),
                    );
                  const states = [
                    ...new Set(members.map((source) => source.availability)),
                  ];
                  const status = states.length === 1 ? states[0] : "部分占用";
                  return (
                    <Fragment key={product.id}>
                      <tr>
                        <td>
                          <strong>{product.fields.型号}</strong>
                          <small>{product.id}</small>
                        </td>
                        <td>{product.fields.品牌}</td>
                        <td>{product.fields.产地}</td>
                        <td className="number">{product.fields.数量}</td>
                        <td>{product.logicalInspectionOrderId}</td>
                        <td>{members.length}</td>
                        <td>
                          <Status value={status} />
                        </td>
                        <td>
                          <button
                            className="text-button"
                            aria-label={`${expanded === product.id ? "收起" : "展开"} ${product.id} 来源`}
                            aria-expanded={expanded === product.id}
                            onClick={() =>
                              setExpanded(
                                expanded === product.id ? null : product.id,
                              )
                            }
                          >
                            {expanded === product.id ? "收起" : "展开来源"}
                          </button>
                        </td>
                      </tr>
                      {expanded === product.id ? (
                        <tr className="source-detail-row">
                          <td colSpan={8}>
                            <div className="source-detail-list">
                              {members.map((source) => (
                                <div key={source.id}>
                                  <strong>{source.id}</strong>
                                  <span>
                                    {source.quantity} · {source.sourceFileId} ·{" "}
                                    {source.sourceLocation.position ??
                                      "位置未知"}
                                  </span>
                                  <Status value={source.availability} />
                                  {source.occupiedDraftId ? (
                                    <small>
                                      占用：{source.occupiedDraftId} /{" "}
                                      {source.occupiedEntrustmentLineId}
                                    </small>
                                  ) : (
                                    <small>尚未被草稿使用</small>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftListView({
  drafts,
}: {
  drafts: ReturnType<typeof useDemoStore.getState>["drafts"];
}) {
  const selectDraft = useDemoStore((state) => state.selectDraft);
  const [statusFilter, setStatusFilter] = useState("全部");
  const visibleDrafts = drafts.filter(
    (draft) => statusFilter === "全部" || draft.status === statusFilter,
  );
  return (
    <div className="view-stack">
      <div className="section-heading">
        <div>
          <h2>委托草稿</h2>
          <p>每张草稿有独立版本，状态由商品行和业务动作推导。</p>
        </div>
        <div className="pool-filters">
          <select
            aria-label="草稿状态筛选"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="全部">全部状态</option>
            {[
              "待核对",
              "部分核对",
              "可提交人工确认",
              "人工确认中",
              "已完成",
            ].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={() => useDemoStore.getState().createDraft()}
          >
            <ClipboardCheck size={16} />
            新建 / 打开草稿
          </button>
        </div>
      </div>
      <div className="draft-grid">
        {visibleDrafts.map((draft) => {
          const basisCount = draft.lines.filter(
            (line) => line.relationSourceIds.length > 0,
          ).length;
          const issueCount = draft.lines.filter(
            (line) => line.issueIds.length > 0,
          ).length;
          return (
            <button
              className="draft-card"
              key={draft.id}
              onClick={() => selectDraft(draft.id)}
            >
              <div className="draft-card-top">
                <span className="draft-no">{draft.displayNo}</span>
                <Status value={draft.status} />
              </div>
              <strong>{draft.customerName}</strong>
              <span className="draft-meta">
                {draft.lines.length} 行 · 依据 {basisCount} · 待处理{" "}
                {issueCount} · v{draft.version}
              </span>
              <div className="progress">
                <i
                  style={{
                    width: `${draft.lines.length ? Math.round((basisCount / draft.lines.length) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="draft-card-foot">
                <span>
                  {draft.lastUpdateReason ??
                    (draft.finalized ? "已封版" : "尚无更新原因")}
                </span>
                <ChevronRight size={15} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


function HistoryView({
  events,
  drafts,
  versions,
}: {
  events: ReturnType<typeof useDemoStore.getState>["events"];
  drafts: ReturnType<typeof useDemoStore.getState>["drafts"];
  versions: ReturnType<typeof useDemoStore.getState>["versions"];
}) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const selected = versions.find((version) => version.id === selectedVersionId);
  return (
    <div className="view-stack">
      <div className="section-heading">
        <div>
          <h2>版本与操作</h2>
          <p>这里展示业务事件和真实版本前后差异。</p>
        </div>
        <div className="history-stat">
          <strong>{events.length}</strong>
          <span>条操作记录</span>
        </div>
      </div>
      <div className="history-layout">
        <div className="panel">
          <div className="panel-head">
            <div>
              <strong>操作时间线</strong>
              <span>最新操作在前</span>
            </div>
          </div>
          {events.length === 0 ? (
            <Empty title="还没有操作记录" detail="从材料接入或草稿匹配开始。" />
          ) : (
            <div className="timeline">
              {events.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <div className="timeline-dot" />
                  <div>
                    <div className="timeline-top">
                      <strong>{event.type}</strong>
                      <time>
                        {new Date(event.time).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <span>{event.summary}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <strong>草稿版本</strong>
              <span>点击版本查看前后差异</span>
            </div>
          </div>
          <div className="version-list">
            {drafts.flatMap((draft) =>
              versions
                .filter((version) => version.draftId === draft.id)
                .map((version) => (
                  <button
                    className="version-row version-button"
                    key={version.id}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    <div>
                      <strong>
                        {draft.displayNo} · v{version.version}
                      </strong>
                      <span>
                        {version.triggerReason} ·{" "}
                        {new Date(version.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                    <b>{version.changedLineIds.length} 行</b>
                    <Status value={draft.status} />
                  </button>
                )),
            )}
          </div>
        </div>
      </div>
      {selected ? <VersionDiff version={selected} /> : null}
    </div>
  );
}

function VersionDiff({
  version,
}: {
  version: ReturnType<typeof useDemoStore.getState>["versions"][number];
}) {
  const before = new Map(
    version.before.map((line) => [line.entrustmentLineId, line]),
  );
  const after = new Map(
    version.after.map((line) => [line.entrustmentLineId, line]),
  );
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  return (
    <div className="panel version-diff">
      <div className="panel-head">
        <div>
          <strong>
            v{version.version} · {version.triggerReason}
          </strong>
          <span>
            {new Date(version.createdAt).toLocaleString("zh-CN")} ·{" "}
            {version.actorType}
          </span>
        </div>
        <span>
          新增关系 {version.addedRelationIds.length} · 失效关系{" "}
          {version.invalidatedRelationIds.length}
        </span>
      </div>
      {ids.map((id) => {
        const oldLine = before.get(id);
        const newLine = after.get(id);
        const changes = FINAL_OUTPUT_FIELDS.filter(
          (field) => oldLine?.fields[field] !== newLine?.fields[field],
        );
        return (
          <div className="diff-row" key={id}>
            <strong>{id}</strong>
            <span>
              {changes.length
                ? changes
                    .map(
                      (field) =>
                        field +
                        "：" +
                        (oldLine?.fields[field] ?? "空") +
                        " → " +
                        (newLine?.fields[field] ?? "空"),
                    )
                    .join("；")
                : "字段无变化"}
            </span>
            <small>
              关系：{oldLine?.matchRelationIds.length ?? 0} →{" "}
              {newLine?.matchRelationIds.length ?? 0} · 状态：
              {oldLine?.status ?? "新增"} → {newLine?.status ?? "删除"}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function ConsoleView({ embedded = false }: { embedded?: boolean }) {
  const scenarioId = useDemoStore((state) => state.scenarioId);
  const loadScenario = useDemoStore((state) => state.loadScenario);
  const setView = useDemoStore((state) => state.setView);
  const files = useDemoStore((state) => state.files);
  const drafts = useDemoStore((state) => state.drafts);
  const relations = useDemoStore((state) => state.relations);
  const operations = useDemoStore((state) => state.operations);
  const metrics = useMemo(
    () => getPocMetrics({ files, drafts, relations, operations }),
    [files, drafts, relations, operations],
  );
  const acceptance = useMemo(
    () => new Map(getScenarioAcceptanceReport().map((item) => [item.id, item])),
    [],
  );
  const allScenarios = scenarios as Array<{
    id: string;
    name: string;
    caseIds: string[];
    coverageStatus: string;
    steps: Array<{ action: string; expect?: string }>;
    expectedChecks: string[];
  }>;
  const selected = allScenarios.find((scenario) => scenario.id === scenarioId);
  return (
    <div className="view-stack">
      {!embedded ? <div className="section-heading">
        <div>
          <h2>Demo 控制台</h2>
          <p>只展示业务验收状态；场景能打开不代表已经通过。</p>
        </div>
      </div> : null}
      <div className="scenario-grid">
        {allScenarios.map((scenario) => {
          const item = acceptance.get(scenario.id);
          return (
            <button
              className={
                scenario.id === scenarioId
                  ? "scenario-card selected"
                  : "scenario-card"
              }
              aria-pressed={scenario.id === scenarioId}
              key={scenario.id}
              onClick={() => loadScenario(scenario.id)}
            >
              <div>
                <span>{scenario.id}</span>
                <span
                  className={`acceptance-badge acceptance-${item?.status === "已通过" ? "passed" : item?.status === "被真实材料缺口阻断" ? "blocked" : "pending"}`}
                >
                  {item?.status ?? "未执行"}
                </span>
              </div>
              <strong>{scenario.name}</strong>
              <small>{scenario.caseIds.join(" · ")}</small>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="panel scenario-guide">
          <div className="panel-head">
            <div>
              <strong>
                {selected.id} · {selected.name}
              </strong>
              <span>{acceptance.get(selected.id)?.reason}</span>
            </div>
          </div>
          <div className="scenario-guide-body">
            <ol>
              {selected.steps.map((step, index) => (
                <li key={`${step.action}-${index}`}>
                  <strong>{step.action}</strong>
                  {step.expect ? <span>{step.expect}</span> : null}
                </li>
              ))}
            </ol>
            <ul>
              {selected.expectedChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="panel poc-panel">
        <div className="panel-head">
          <div>
            <strong>本场景业务结果</strong>
            <span>只保留现场容易解释的 4 个数字</span>
          </div>
        </div>
        <div className="poc-grid">
          <div>
            <span>已接入材料</span>
            <strong data-testid="metric-loaded-files">
              {metrics.loadedFileCount}
            </strong>
            <small>当前场景文件</small>
          </div>
          <div>
            <span>有效商品关系</span>
            <strong data-testid="metric-active-relations">
              {metrics.activeRelationCount}
            </strong>
            <small>当前有效关系</small>
          </div>
          <div>
            <span>人工业务动作</span>
            <strong data-testid="metric-manual-actions">
              {metrics.manualActionCount}
            </strong>
            <small>来自操作记录</small>
          </div>
          <div>
            <span>商品行覆盖率</span>
            <strong data-testid="metric-match-coverage">
              {metrics.matchCoverage}%
            </strong>
            <small>有依据行 / 全部行</small>
          </div>
        </div>
      </div>
    </div>
  );
}
