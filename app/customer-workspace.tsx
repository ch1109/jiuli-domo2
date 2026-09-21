"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Search, Plus, AlertTriangle, FileText } from "lucide-react";
import { getMergedPoolProducts, useDemoStore } from "@/lib/demo-store";
import { getTaskSummary } from "@/lib/workspace-status";

const filters = ["全部任务", "处理中", "待补查货", "待人工处理", "待人工复核", "已完成", "今日完成"];
const date = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const tone = (status: string) => status === "异常" || status === "待人工处理" ? "red" : status.includes("复核") ? "blue" : status === "已完成" ? "green" : "orange";

export function CustomerWorkspace({ onAddMaterial }: { onAddMaterial: (customerId: string | null) => void }) {
  const state = useDemoStore();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tab, setTab] = useState("委托核对任务");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部任务");
  const [poolFilter, setPoolFilter] = useState("全部");
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const customer = state.customers.find(item => item.id === customerId);
  const rows = state.drafts.map(draft => {
    const parsing = state.files.some(file => draft.materialFileIds.includes(file.id) && file.uploadStatus === "解析中");
    const processing = parsing ? "正在解析委托材料" : state.activeTaskId === draft.id && state.taskStage === "matching" ? "正在执行商品匹配" : undefined;
    return { draft, ...getTaskSummary(draft, processing) };
  });
  const products = getMergedPoolProducts(state.sources.filter(source => source.availability !== "未加载"));
  const scopedRows = rows.filter(row => !customerId || row.draft.customerId === customerId);
  const needsEvidence = (row: typeof rows[number]) => row.businessStatus !== "已完成" && row.matched < row.total;
  const needsReview = (row: typeof rows[number]) => row.businessStatus.includes("待人工复核") || row.businessStatus === "人工复核中";
  const metrics = [
    { label: "全部客户", value: state.customers.length, filter: "全部任务" },
    { label: "处理中任务", value: rows.filter(row => row.businessStatus !== "已完成").length, filter: "处理中" },
    { label: "待补查货", value: rows.filter(needsEvidence).length, filter: "待补查货" },
    { label: "待人工复核", value: rows.filter(needsReview).length, filter: "待人工复核" },
    { label: "存在异常", value: rows.filter(row => row.issues || row.businessStatus === "异常").length, filter: "待人工处理" },
    { label: "今日完成", value: rows.filter(row => row.businessStatus === "已完成" && new Date(row.draft.updatedAt).toDateString() === new Date().toDateString()).length, filter: "今日完成" },
  ];
  const matchesFilter = (row: typeof rows[number]) => filter === "全部任务" || (filter === "处理中" ? row.businessStatus !== "已完成" : filter === "待补查货" ? needsEvidence(row) : filter === "待人工复核" ? needsReview(row) : filter === "待人工处理" ? row.issues > 0 || row.businessStatus === "异常" : filter === "今日完成" ? row.businessStatus === "已完成" && new Date(row.draft.updatedAt).toDateString() === new Date().toDateString() : row.businessStatus === "已完成");
  const customerActivity = (id: string) => rows.filter(row => row.draft.customerId === id).length * 1000 + products.filter(product => product.customerId === id).length;
  const visibleCustomers = state.customers.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) || rows.some(row => row.draft.customerId === item.id && row.draft.displayNo.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => customerActivity(b.id) - customerActivity(a.id));
  const visibleRows = scopedRows.filter(matchesFilter).filter(row => `${row.draft.displayNo} ${row.draft.customerName}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(a.businessStatus === "已完成") - Number(b.businessStatus === "已完成") || b.issues - a.issues || b.draft.updatedAt.localeCompare(a.draft.updatedAt));
  const scopedProducts = products.filter(product => product.customerId === customerId);
  const materialIds = new Set(scopedRows.flatMap(row => row.draft.materialFileIds));
  state.sources.filter(source => source.customerId === customerId && source.availability !== "未加载").forEach(source => materialIds.add(source.sourceFileId));
  const materials = state.files.filter(file => materialIds.has(file.id) || (file.customerId === customerId && file.source === "本地上传"));
  const enterCustomer = (id: string) => { setCustomerId(id); setQuery(""); setTab("委托核对任务"); };
  const upload = () => onAddMaterial(customerId);

  return <div className="customer-workspace">
    <div className="cw-heading">
      <div>{customer ? <button className="text-button" onClick={() => { setCustomerId(null); setQuery(""); }}><ArrowLeft size={15} /> 全部客户</button> : null}<h2>{customer?.name ?? "九立智能核对工作台"}</h2></div>
      <button className="primary" onClick={upload}><Plus size={16} />{customer ? "新增材料" : "新建核对"}</button>
    </div>
    {!customer ? <>
      <div className="cw-metrics">{metrics.map(metric => <button key={metric.label} onClick={() => { setFilter(metric.filter); setQuery(""); if (metric.label === "全部客户") setShowAllCustomers(true); else document.getElementById("customer-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={filter !== "全部任务" && metric.filter === filter ? "selected" : ""}><span>{metric.label}</span><strong>{metric.value}</strong></button>)}</div>
      <div className="cw-section-title"><h3>客户工作台 <span>{state.customers.length}</span></h3><label className="cw-search"><Search size={16} /><input aria-label="搜索客户或委托任务" placeholder="搜索客户、委托任务号" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <div className="cw-customers">{visibleCustomers.slice(0, showAllCustomers || query ? undefined : 3).map(item => {
        const tasks = rows.filter(row => row.draft.customerId === item.id);
        const issueCount = tasks.filter(row => row.issues || row.businessStatus === "异常").length;
        const latest = [...tasks.map(row => row.draft.updatedAt), ...state.sources.filter(source => source.customerId === item.id && source.availability !== "未加载").map(source => source.updatedAt)].sort().at(-1);
        return <article className="cw-customer" key={item.id}>
          <div className="cw-customer-name"><Building2 size={19} /><h3>{item.name}</h3></div>
          <div className="cw-customer-counts"><span>委托任务 <b>{tasks.length}</b></span><span>查货商品 <b>{products.filter(product => product.customerId === item.id).length}</b></span></div>
          <div className="cw-distribution">{[["待匹配", tasks.filter(row => row.businessStatus === "待匹配").length], ["部分核对", tasks.filter(row => row.businessStatus === "部分核对").length], ["待复核", tasks.filter(needsReview).length], ["完成", tasks.filter(row => row.businessStatus === "已完成").length]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
          <div className="cw-customer-alert">{issueCount ? <><AlertTriangle size={14} />{issueCount} 票需要人工处理</> : tasks.length ? "暂无待处理冲突" : "暂无委托任务"}</div>
          <footer><small>{latest ? `更新于 ${date(latest)}` : "尚无业务更新"}</small><button className="text-button" onClick={() => enterCustomer(item.id)}>进入客户工作台 <ArrowRight size={15} /></button></footer>
        </article>;
      })}</div>
      {!visibleCustomers.length && <div className="cw-empty">未找到相关客户</div>}
      {!query && visibleCustomers.length > 3 && <button className="text-button cw-show-customers" onClick={() => setShowAllCustomers(!showAllCustomers)}>{showAllCustomers ? "收起客户" : `查看全部 ${visibleCustomers.length} 个客户`}<ArrowRight size={14} /></button>}
    </> : <div className="cw-tabs" role="tablist" aria-label="客户业务池">{["委托核对任务", "查货商品池", "材料记录"].map((name, index) => <button key={name} role="tab" aria-selected={tab === name} onClick={() => { setTab(name); setQuery(""); }} className={tab === name ? "active" : ""}>{name}<span>{[scopedRows.length, scopedProducts.length, materials.length][index]}</span></button>)}</div>}
    {(!customer || tab === "委托核对任务") && <section className="cw-tasks" id="customer-tasks">
      <div className="cw-section-title"><h3>{customer ? "委托核对任务" : "待办与委托任务"} <span>{visibleRows.length}</span></h3>{customer && <label className="cw-search"><Search size={16} /><input aria-label="搜索委托任务" placeholder="搜索委托任务号" value={query} onChange={event => setQuery(event.target.value)} /></label>}</div>
      <div className="cw-filters">{filters.map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
      <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th scope="col">委托任务 / 材料</th><th scope="col">查货匹配</th><th scope="col">问题行</th><th scope="col">业务状态</th><th scope="col">实时状态</th><th scope="col">最近更新</th><th scope="col">下一步</th></tr></thead><tbody>{visibleRows.map(row => {
        const types = [...new Set(state.files.filter(file => row.draft.materialFileIds.includes(file.id)).map(file => file.materialType))];
        return <tr key={row.draft.id}><td><button className="cw-task-link" onClick={() => state.selectDraft(row.draft.id)}>{row.draft.displayNo}</button><small>{!customer ? `${row.draft.customerName} · ` : ""}{types.join(" + ") || "待补材料"} · {row.draft.materialFileIds.length} 份</small></td><td><strong>{row.matched}<span className="muted"> / {row.total}</span></strong><progress aria-label={`${row.draft.displayNo} 查货匹配进度`} value={row.matched} max={row.total || 1} /></td><td className={row.issues ? "cw-issue" : "muted"}>{row.issues}</td><td><span className={`cw-status ${tone(row.businessStatus)}`}>{row.businessStatus}</span></td><td><span className="cw-realtime"><i className={row.realtimeStatus.startsWith("正在") ? "running" : ""} />{row.realtimeStatus}</span></td><td><small>{date(row.draft.updatedAt)}</small></td><td><button className="text-button" onClick={() => state.selectDraft(row.draft.id)}>{row.nextAction}<ArrowRight size={14} /></button></td></tr>;
      })}</tbody></table></div>
      {!visibleRows.length && <div className="cw-empty">暂无符合条件的委托任务</div>}
    </section>}
    {customer && tab === "查货商品池" && <section>
      <div className="cw-filters">{["全部", "可匹配", "草稿占用", "已核销"].map(value => <button key={value} className={poolFilter === value ? "active" : ""} onClick={() => setPoolFilter(value)}>{value} <span>{scopedProducts.filter(product => value === "全部" || product.sourceLineIds.some(id => state.sources.find(source => source.id === id)?.availability === value)).length}</span></button>)}</div>
      <div className="cw-products">{scopedProducts.filter(product => poolFilter === "全部" || product.sourceLineIds.some(id => state.sources.find(source => source.id === id)?.availability === poolFilter)).map(product => {
        const sources = state.sources.filter(source => product.sourceLineIds.includes(source.id));
        return <details key={product.id} className="cw-product"><summary><div><small>入仓号 {sources[0]?.warehouseNo || "未识别"}</small><strong>{product.fields.型号 || "型号待补充"}</strong><span>{product.fields.品牌 || "品牌待补充"} · {product.fields.产地 || "产地待补充"}</span></div><div><strong>{product.fields.数量} {product.fields.单位}</strong><span>{sources.length} 条原始行</span></div><div>{[...new Set(sources.map(source => source.availability))].map(value => <span key={value} className={`cw-status ${value === "可匹配" ? "green" : value === "草稿占用" ? "orange" : "blue"}`}>{value}</span>)}<small>查看原始来源</small></div></summary><div className="cw-sources">{sources.map(source => { const draft = state.drafts.find(item => item.id === source.occupiedDraftId); return <div key={source.id}><FileText size={15} /><span>{state.files.find(file => file.id === source.sourceFileId)?.name ?? source.sourceFileId}<small>页码 {source.sourceLocation.page ?? "—"} · {source.sourceLocation.sheet ?? ""} {source.sourceLocation.position ?? "位置未记录"} · {source.availability}</small></span>{draft && <button className="text-button" onClick={() => state.selectDraft(draft.id)}>{draft.displayNo} / 第 {draft.lines.findIndex(line => line.id === source.occupiedEntrustmentLineId) + 1} 行 <ArrowRight size={14} /></button>}</div>; })}</div></details>;
      })}</div>{!scopedProducts.length && <div className="cw-empty">该客户暂无已接入的查货商品<button className="text-button" onClick={upload}>添加查货材料 <Plus size={14} /></button></div>}
    </section>}
    {customer && tab === "材料记录" && <section><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th scope="col">原始材料</th><th scope="col">用途</th><th scope="col">状态</th><th scope="col">关联委托</th></tr></thead><tbody>{materials.map(file => <tr key={file.id}><td>{file.name}</td><td>{file.materialType}</td><td>{file.uploadStatus ?? (file.loaded ? "已接入" : "待接入")}</td><td>{scopedRows.filter(row => row.draft.materialFileIds.includes(file.id)).map(row => <button key={row.draft.id} className="text-button" onClick={() => state.selectDraft(row.draft.id)}>{row.draft.displayNo}</button>)}</td></tr>)}</tbody></table></div>{!materials.length && <div className="cw-empty">该客户暂无材料记录</div>}</section>}
  </div>;
}
