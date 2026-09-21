"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { CustomerWorkspace } from "./customer-workspace";
import { ReconciliationWorkbench } from "./reconciliation-workbench";
import {
  Archive,
  Boxes,
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
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import {
  buildScenarioState,
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

const utilityNavItems: Array<{
  key: ViewKey;
  label: string;
  accessibleLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "intake", label: "材料管理", accessibleLabel: "材料接入", icon: FileInput },
  { key: "pool", label: "商品池", accessibleLabel: "客户商品池", icon: Boxes },
  { key: "drafts", label: "草稿管理", accessibleLabel: "委托草稿", icon: ClipboardCheck },
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
  const scenarioId = useDemoStore((state) => state.scenarioId);
  const loadScenario = useDemoStore((state) => state.loadScenario);
  const customers = useDemoStore((state) => state.customers);
  const selectedDraft = selectedDraftId
    ? drafts.find((draft) => draft.id === selectedDraftId)
    : undefined;
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
        <div className="brand">
          <div className="brand-mark">九</div>
          <div>
            <strong>九立</strong>
            <span>智能核对工作台</span>
          </div>
        </div>
        <div className="workspace-label utility-label">辅助工具</div>
        <nav className="nav-list utility-nav" aria-label="辅助工具">
          {utilityNavItems.map(({ key, label, accessibleLabel, icon: Icon }) => (
            <button
              key={key}
              className={view === key ? "nav-item active" : "nav-item"}
              aria-label={accessibleLabel}
              onClick={() => {
                setView(key);
                setScenarioOpen(false);
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
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
                      : ([...navItems, ...utilityNavItems].find((item) => item.key === view)
                          ?.label ?? (view === "console" ? "演示数据" : "核对任务"))
            }</h1>
          </div>
          <div className="top-actions">
            <button
              className="secondary demo-data-button"
              aria-label="Demo 控制台"
              aria-expanded={scenarioOpen}
              aria-controls="scenario-drawer"
              onClick={() => setScenarioOpen(true)}
            >
              <FlaskConical size={15} />
              演示数据
            </button>
            <button
              className="icon-button"
              title="恢复当前场景"
              aria-label="恢复当前场景"
              onClick={() => loadScenario(scenarioId)}
            >
              <RotateCcw size={17} />
            </button>
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
            <CustomerWorkspace onAddMaterial={(customerId) => { useDemoStore.getState().setIntakeCustomer(customerId ?? ""); setIntakeOpen(true); }} />
            {intakeOpen ? <div className="intake-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIntakeOpen(false); }}><div className="intake-modal" role="dialog" aria-modal="true" aria-label="新增材料"><div className="intake-modal-head"><strong>新增材料</strong><button className="icon-button" aria-label="关闭新增材料" onClick={() => setIntakeOpen(false)}><X size={16} /></button></div><IntakeView files={files} customers={customers} drafts={drafts} embedded /></div></div> : null}
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
  drafts,
  embedded = false,
}: {
  files: ReturnType<typeof useDemoStore.getState>["files"];
  customers: ReturnType<typeof useDemoStore.getState>["customers"];
  drafts: ReturnType<typeof useDemoStore.getState>["drafts"];
  embedded?: boolean;
}) {
  const [uploadMaterialType, setUploadMaterialType] = useState<
    MaterialType | ""
  >("");
  const [entrustmentCustomerId, setEntrustmentCustomerId] = useState("");
  const uploadMaterialTypeRef = useRef<MaterialType | "">("");
  const selectedCustomerRef = useRef<string | null>(null);
  const scenarioId = useDemoStore((state) => state.scenarioId);
  const baselineDraftFiles = useMemo(
    () =>
      new Set(
        buildScenarioState(scenarioId).availableDrafts.flatMap(
          (draft) => draft.materialFileIds,
        ),
      ),
    [scenarioId],
  );
  const ingestFile = useDemoStore((state) => state.ingestFile);
  const stageLocalFile = useDemoStore((state) => state.stageLocalFile);
  const parseLocalFile = useDemoStore((state) => state.parseLocalFile);
  const startParse = useDemoStore((state) => state.startParse);
  const flagParseReview = useDemoStore((state) => state.flagParseReview);
  const resolveParseReview = useDemoStore((state) => state.resolveParseReview);
  const setView = useDemoStore((state) => state.setView);
  const selectedCustomerId = useDemoStore(
    (state) => state.selectedIntakeCustomerId,
  );
  const setIntakeCustomer = useDemoStore((state) => state.setIntakeCustomer);
  const parseJobs = useDemoStore((state) => state.parseJobs);
  const parseResults = useDemoStore((state) => state.parseResults);
  const convertedEntrustments = useDemoStore(
    (state) => state.convertedEntrustments,
  );
  const convertedAuxiliaryMaterials = useDemoStore(
    (state) => state.convertedAuxiliaryMaterials,
  );
  const materialBindings = useDemoStore((state) => state.materialBindings);
  const sources = useDemoStore((state) => state.sources);
  const createDraftFromEntrustmentFile = useDemoStore(
    (state) => state.createDraftFromEntrustmentFile,
  );
  const bindMaterialToDraft = useDemoStore(
    (state) => state.bindMaterialToDraft,
  );
  const reviseDraftWithEntrustmentFile = useDemoStore(
    (state) => state.reviseDraftWithEntrustmentFile,
  );
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const localFiles = files.filter((file) => file.source === "本地上传");
  const parseProblems = localFiles.filter(
    (file) =>
      file.uploadStatus === "解析失败" ||
      file.uploadStatus === "待人工复核",
  );
  const inspectionFiles = files.filter((file) => file.materialType === "查货");
  const entrustmentFiles = files.filter((file) => file.materialType === "委托书");
  const auxiliaryFiles = files.filter(
    (file) => file.materialType === "发票" || file.materialType === "箱单",
  );
  const uploadFor = (materialType: MaterialType, selectedFiles: FileList | null) => {
    const inspectionCustomerId = selectedCustomerRef.current ?? selectedCustomerId;
    if (materialType === "查货" && !inspectionCustomerId) {
      useDemoStore.setState({ toast: "请先填写查货单所属客户，再上传查货材料" });
      return;
    }
    const batchId = `UPLOAD-BATCH-${Date.now()}`;
    const customerId = materialType === "委托书"
      ? entrustmentCustomerId || inspectionCustomerId
      : inspectionCustomerId;
    for (const file of Array.from(selectedFiles ?? []))
      stageLocalFile({
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        materialType,
        customerId: customerId ?? undefined,
        batchId,
      });
  };
  const customerPendingFiles = localFiles.filter(
    (file) =>
      (file.materialType === "委托书" || file.materialType === "查货") &&
      file.uploadStatus === "解析成功" &&
      !file.customerId,
  );
  const resolvedCustomerNames = [
    ...new Set(
      localFiles
        .map((file) => customers.find((customer) => customer.id === file.customerId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  return (
    <div className="view-stack">
      {!embedded ? <div className="section-heading">
        <div>
          <h2>新建核对任务</h2>
          <p>按业务顺序准备材料，系统会在当前任务内完成解析、核对和确认。</p>
        </div>
        <button className="secondary" onClick={() => setView("home")}>
          <Home size={16} />
          返回任务首页
        </button>
      </div> : null}
      <div className="task-stepper" aria-label="新建核对进度">
        {[
          ["1", "上传材料", files.length > 0],
          ["2", "解析材料", localFiles.length > 0 && parseProblems.length === 0],
          ["3", "补充客户信息", localFiles.length > 0 && customerPendingFiles.length === 0],
          ["4", "开始核对", drafts.length > 0],
        ].map(([number, label, done]) => (
          <div className={done ? "task-step done" : "task-step"} key={String(number)}>
            <b>{done ? <Check size={14} /> : number}</b><span>{label}</span>
          </div>
        ))}
      </div>
      <div className="panel customer-step">
        <div><span className="step-kicker">第 1 步</span><strong>先上传本次核对材料</strong><small>委托书客户从左上角“委托方”自动识别；查货单上传前必须填写所属客户。</small></div>
        <span className="status status-blue"><i />客户按材料分别归属商品池</span>
      </div>
      <div className="material-section">
        <div className="material-section-heading"><div><span className="step-kicker">第 2 步</span><strong>按材料用途上传</strong><small>PDF、Excel、JPG、PNG 均可；单个文件不超过 20MB。</small></div><div className="material-customer-fields"><label className="inspection-customer-field"><span>查货单所属客户 <em>必填</em></span><select aria-label="选择查货客户" value={selectedCustomerId ?? ""} onChange={(event) => { selectedCustomerRef.current = event.target.value; setIntakeCustomer(event.target.value); }}><option value="">上传查货单前请选择</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="inspection-customer-field"><span>委托书客户 <em className="optional-label">选填</em></span><select aria-label="选择委托书客户（选填）" value={entrustmentCustomerId} onChange={(event) => setEntrustmentCustomerId(event.target.value)}><option value="">由委托方自动识别</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label></div></div>
        <div className="material-zone-grid">
          <MaterialUploadZone title="查货材料" detail="必填 · 可上传多份查货单" count={inspectionFiles.length} required onFiles={(value) => uploadFor("查货", value)} />
          <MaterialUploadZone title="委托材料" detail="必填 · 主体委托书" count={entrustmentFiles.length} required onFiles={(value) => uploadFor("委托书", value)} />
          <div className="material-zone"><div className="material-zone-icon"><Upload size={19} /></div><strong>辅助材料</strong><span>选填 · 发票、箱单或补充文件</span><small>{auxiliaryFiles.length ? `已添加 ${auxiliaryFiles.length} 份` : "暂未添加"}</small><div className="auxiliary-upload-actions"><label className="secondary">上传发票<input type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" hidden onChange={(event) => { uploadFor("发票", event.currentTarget.files); event.currentTarget.value = ""; }} /></label><label className="secondary">上传箱单<input type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" hidden onChange={(event) => { uploadFor("箱单", event.currentTarget.files); event.currentTarget.value = ""; }} /></label></div></div>
        </div>
      </div>
      <details className="legacy-upload panel" open>
        <summary>无法判断材料用途？使用手动分类</summary>
        <div className="legacy-upload-controls">
          <label><span className="muted">材料类型</span><select aria-label="选择材料类型" value={uploadMaterialType} onChange={(event) => { const value = event.target.value as MaterialType | ""; uploadMaterialTypeRef.current = value; setUploadMaterialType(value); }}><option value="">待人工识别</option>{["委托书", "发票", "箱单", "查货"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="secondary">上传本地材料<input aria-label="上传本地材料" type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" hidden onChange={(event) => { uploadFor((uploadMaterialTypeRef.current || "委托书") as MaterialType, event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
        </div>
      </details>
      <div className="parse-summary panel">
        <div className="panel-head"><div><strong>解析确认</strong><span>先看懂系统识别了什么，再开始核对</span></div>{parseProblems.length ? <span className="status status-red"><i />{parseProblems.length} 份材料需要处理</span> : <span className="status status-green"><i />当前无解析问题</span>}</div>
        <div className="parse-summary-grid"><div><span>已识别客户</span><strong>{resolvedCustomerNames.length ? resolvedCustomerNames.join("、") : "等待解析委托方"}</strong></div><div><span>查货材料</span><strong>{inspectionFiles.length} 份 · {selectedCustomerId ? sources.filter((source) => source.customerId === selectedCustomerId).length : 0} 条商品事实</strong></div><div><span>委托材料</span><strong>{entrustmentFiles.length} 份 · {convertedEntrustments.reduce((sum, item) => sum + item.lines.length, 0)} 条商品行</strong></div><div><span>辅助材料</span><strong>{auxiliaryFiles.length} 份</strong></div></div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <strong>材料队列</strong>
            <span>{files.length} 份材料</span>
          </div>
          <span className="muted">失败和待复核材料不会进入商品池</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>类型</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const convertedEntrustment = convertedEntrustments.some(
                  (item) => item.sourceFileId === file.id,
                );
                const convertedAuxiliary = convertedAuxiliaryMaterials.some(
                  (item) => item.sourceFileId === file.id,
                );
                const bound = materialBindings.find(
                  (item) => item.fileId === file.id,
                );
                const parseResult = parseResults.find(
                  (item) => item.sourceFileId === file.id,
                );
                const target = targetDrafts[file.id] ?? "";
                return (
                  <tr key={file.id}>
                    <td>
                      <div className="file-cell">
                        <div className="file-icon">
                          <FileInput size={15} />
                        </div>
                        <div>
                          <strong>{file.name}</strong>
                          <small>
                            {file.id}
                            {file.batchId ? ` · ${file.batchId}` : ""}
                            {file.sizeBytes
                              ? ` · ${(file.sizeBytes / 1024).toFixed(1)}KB`
                              : ""}
                          </small>
                          <ParseFeedback fileId={file.id} jobs={parseJobs} />
                        </div>
                      </div>
                    </td>
                    <td>{file.materialType}</td>
                    <td>
                      {file.duplicate ? (
                        <span className="status status-orange">
                          <i />
                          重复材料
                        </span>
                      ) : file.source === "本地上传" && parseResult && !parseResult.customerId ? (
                        <span className="status status-red">
                          <i />
                          解析成功 · 待补客户信息
                        </span>
                      ) : file.source === "本地上传" ? (
                        <span className="status status-orange">
                          <i />
                          {file.uploadStatus ?? "待解析"}
                        </span>
                      ) : file.loaded ? (
                        <Status value="可匹配" />
                      ) : (
                        <Status value="待核对" />
                      )}
                    </td>
                    <td>
                      {file.duplicate ? (
                        <span className="muted">未重复接入</span>
                      ) : file.source === "本地上传" ? (
                        <>
                          <ParseTaskAction
                            fileId={file.id}
                            jobs={parseJobs}
                            onStart={startParse}
                            onParse={parseLocalFile}
                            onReview={flagParseReview}
                            onResolve={resolveParseReview}
                          />
                          {convertedEntrustment && drafts.length ? (
                            <>
                              <select
                                aria-label={`修订目标 ${file.id}`}
                                value={target}
                                onChange={(event) =>
                                  setTargetDrafts({
                                    ...targetDrafts,
                                    [file.id]: event.target.value,
                                  })
                                }
                              >
                                <option value="">选择修订草稿</option>
                                {drafts
                                  .filter(
                                    (draft) =>
                                      draft.customerId === file.customerId &&
                                      !draft.finalized,
                                  )
                                  .map((draft) => (
                                    <option key={draft.id} value={draft.id}>
                                      {draft.displayNo}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="text-button"
                                disabled={!target}
                                onClick={() =>
                                  reviseDraftWithEntrustmentFile(
                                    file.id,
                                    target,
                                  )
                                }
                              >
                                更新原草稿
                              </button>
                            </>
                          ) : null}
                          {convertedAuxiliary && drafts.length && !bound ? (
                            <>
                              <select
                                aria-label={`绑定目标 ${file.id}`}
                                value={target}
                                onChange={(event) =>
                                  setTargetDrafts({
                                    ...targetDrafts,
                                    [file.id]: event.target.value,
                                  })
                                }
                              >
                                <option value="">选择绑定草稿</option>
                                {drafts
                                  .filter(
                                    (draft) =>
                                      draft.customerId === file.customerId &&
                                      !draft.finalized,
                                  )
                                  .map((draft) => (
                                    <option key={draft.id} value={draft.id}>
                                      {draft.displayNo}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="text-button"
                                disabled={!target}
                                onClick={() =>
                                  bindMaterialToDraft(file.id, target)
                                }
                              >
                                绑定到草稿
                              </button>
                            </>
                          ) : bound ? (
                            <span className="muted">
                              已绑定 {bound.draftId}
                            </span>
                          ) : null}
                        </>
                      ) : file.loaded ? (
                        <span className="muted">已接入</span>
                      ) : (
                        <button
                          className="text-button"
                          onClick={() => ingestFile(file.id)}
                        >
                          接入商品池 <ChevronRight size={14} />
                        </button>
                      )}
                      {!file.duplicate &&
                      file.materialType === "委托书" &&
                      (convertedEntrustment ||
                        baselineDraftFiles.has(file.id)) ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            createDraftFromEntrustmentFile(file.id)
                          }
                        >
                          生成委托草稿 <ChevronRight size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
                ? "请先在材料接入页上传查货材料，并填写所属客户后接入商品池。"
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
        <button className="primary" onClick={() => setView("intake")}>
          <LayoutDashboard size={16} />
          回到工作区
        </button>
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
