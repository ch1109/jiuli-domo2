"use client";
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  List,
  GitBranch,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from 'lucide-react';
import { useDemoStore } from '@/lib/demo-store';
import {
  getCustomerWorkbench,
  TASK_FILTERS,
  type CustomerModel,
  type WorkbenchModel,
} from '@/lib/customer-workbench-model';
import {
  generateWorkspaceSummary,
  generateCustomerStory,
  DEMO_SCENARIO_SHOWCASES,
  BUSINESS_TERMS,
} from '@/lib/business-translation';
import fixture from '@/demo-generated/mock/real-calibration-sc08.json';
import puyiFixture from '@/demo-generated/mock/real-calibration-26shpyd056.json';
import auditIndex from '@/demo-generated/mock/model-audit-index.json';
import manifest from '@/demo-generated/sample_manifest.json';
import { MaterialPreview } from './material-preview';
import './customer-workspace.css';

const date = (s?: string) =>
  s
    ? new Date(s).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '暂无业务更新';

const tabs = [
  '业务总览',
  '待核对商品与委托材料 (P1)',
  '查货明细与可匹配商品 (P2)',
  '商品自动对应关系 (P3)',
  '需人工处理的问题',
];

const sampleIdByFileId = new Map(
  manifest.samples.flatMap((sample) =>
    sample.fileIds.map((fileId) => [fileId, sample.sampleId] as const)
  )
);
const auditBySampleId = new Map(
  auditIndex.samples.map((audit) => [audit.sampleId, audit] as const)
);
const auditsByCustomerId = new Map<string, (typeof auditIndex.samples)[number][]>();
for (const sample of auditIndex.samples) {
  const list = auditsByCustomerId.get(sample.customerId) ?? [];
  list.push(sample);
  auditsByCustomerId.set(sample.customerId, list);
}

const getCustomerAudits = (custId?: string | null) => {
  if (!custId) return [];
  return auditsByCustomerId.get(custId) ?? [];
};

const auditForFiles = (fileIds: string[]) => {
  const sampleIds = [
    ...new Set(
      fileIds
        .map((fileId) => sampleIdByFileId.get(fileId))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  return sampleIds.length === 1 ? auditBySampleId.get(sampleIds[0]) : undefined;
};
const auditStatus = (status?: string) =>
  ({
    SUCCESS: '已完成',
    NEEDS_REVIEW: '需人工复核',
    PARTIAL: '部分完成',
    INVALID_INPUT: '因输入条件不足被阻断',
  }[status ?? ''] ?? status ?? '未执行');

export function CustomerWorkspace({
  onAddMaterial,
}: {
  onAddMaterial: (id: string | null) => void;
}) {
  const state = useDemoStore();
  const scenarioId = useDemoStore((s) => s.scenarioId);
  const previousScenarioWorkspace = useDemoStore(
    (s) => s.previousScenarioWorkspace
  );
  const model = useMemo(() => getCustomerWorkbench(state), [state]);
  const summary = useMemo(() => generateWorkspaceSummary(model), [model]);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tab, setTab] = useState(tabs[0]);
  const [filter, setFilter] = useState('全部任务');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const customer = model.customers.find((c) => c.id === customerId);

  const tasks = model.tasks
    .filter((t) =>
      `${t.draft.displayNo} ${t.draft.customerName}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
    .filter((t) =>
      filter === '全部任务'
        ? true
        : filter === '处理中'
        ? t.businessStatus !== '已完成'
        : filter === '今日新增材料'
        ? t.draft.materialFileIds.some((id) => model.todayFileIds.has(id))
        : t.businessStatus ===
          (filter === '待人工复核' ? 'AI核对完成 · 待人工复核' : filter)
    );

  return (
    <div className="customer-workspace cw-v2">
      <header className="cw-heading">
        <div>
          {customer && (
            <button className="text-button" onClick={() => setCustomerId(null)}>
              <ArrowLeft size={15} />
              返回客户工作台
            </button>
          )}
          <h2>{customer?.name ?? '客户工作台'}</h2>
          {customer && <small>{customer.id}</small>}
        </div>
        <button className="primary" onClick={() => onAddMaterial(customerId)}>
          <Plus size={16} />
          {customer ? '新增材料' : '新建核对任务'}
        </button>
      </header>

      <div className="cw-section-title">
        <span>
          {scenarioId === 'BUSINESS'
            ? '完整客户业务 · 已整理事实'
            : `演示场景 ${scenarioId}`}
        </span>
        {scenarioId !== 'BUSINESS' ? (
          <button
            className="text-button"
            onClick={() => state.openBusinessWorkspace()}
          >
            返回完整客户业务
            <ArrowRight size={14} />
          </button>
        ) : (
          previousScenarioWorkspace && (
            <button
              className="text-button"
              onClick={() => state.restorePreviousScenario()}
            >
              继续之前的演示场景
              <ArrowRight size={14} />
            </button>
          )
        )}
      </div>

      {!customer ? (
        <>
          {state.scenarioId === 'BUSINESS' && (
            <p className="cw-provenance">
              已整理 {state.files.length} 份材料 ·{' '}
              {state.drafts.reduce((n, d) => n + d.lines.length, 0)} 条
              {BUSINESS_TERMS.entrustmentProduct} · {state.sources.length} 条
              {BUSINESS_TERMS.inspectionRawRow}，其中{' '}
              {state.sources.filter((s) => !s.customerId).length}{' '}
              条待确认客户，未计入客户商品池。模型核对结果请进入对应演示场景查看。
            </p>
          )}

          {/* 首页业务进度面板：先讲一句人话，再给分类数字 */}
          <div className="cw-summary-banner">
            <div className="cw-summary-lead">
              <div className="cw-summary-title">
                <Sparkles size={17} />
                <h3>{summary.headline}</h3>
              </div>
              <p className="cw-summary-text">
                <strong>{summary.storyLead}</strong>
                <span>{summary.storyDetail}</span>
              </p>
            </div>
            <div className="cw-metrics">
              {summary.metrics.map((m) => (
                <button
                  key={m.key}
                  className={filter === m.filter ? 'selected' : ''}
                  onClick={() => {
                    setFilter(m.filter);
                    document
                      .getElementById('customer-tasks')
                      ?.scrollIntoView({ block: 'start' });
                  }}
                >
                  <span>{m.label}</span>
                  <strong>{m.count}</strong>
                  <small>{m.subtext}</small>
                </button>
              ))}
            </div>
          </div>

          <RealAuditsShowcase
            onSelectCustomer={(id) => {
              setCustomerId(id);
              setTab(tabs[0]);
            }}
          />

          <div className="cw-section-title">
            <h3>
              客户业务概览 <span>{model.customers.length} 家客户</span>
            </h3>
            <label className="cw-search">
              <Search size={16} />
              <input
                aria-label="搜索客户或委托任务"
                placeholder="搜索客户、委托任务号"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {/* 客户卡片：从统计卡重构为故事卡 */}
          <div className="cw-customers">
            {model.customers
              .filter(
                (c) =>
                  !query ||
                  `${c.name} ${c.id} ${c.tasks
                    .map((t) => t.draft.displayNo)
                    .join(' ')}`
                    .toLowerCase()
                    .includes(query.toLowerCase())
              )
              .sort(
                (a, b) =>
                  b.issues.length - a.issues.length ||
                  b.counts.tasks - a.counts.tasks
              )
              .map((c) => {
                const story = generateCustomerStory(c);
                return (
                  <article className="cw-customer cw-story-card" key={c.id}>
                    <div className="cw-story-head">
                      <div className="cw-story-title-group">
                        <h3>{story.name}</h3>
                        <small>
                          {c.id} · 最近更新：{story.updatedAtText}
                        </small>
                      </div>
                      <span className={`cw-story-badge ${story.badge.variant}`}>
                        {story.badge.label}
                      </span>
                    </div>

                    <div className="cw-story-body">
                      <div className="cw-story-status-line">
                        {story.currentStatusText}
                      </div>

                      <div className="cw-story-section">
                        <span className="cw-story-label">本次材料</span>
                        <span className="cw-story-content">
                          {story.materialsSummary}
                        </span>
                      </div>

                      <div className="cw-story-section">
                        <span className="cw-story-label">AI 已完成整理</span>
                        <ul className="cw-story-list">
                          <li>{story.aiOrderSummary}</li>
                          <li>{story.aiInspectionSummary}</li>
                        </ul>
                      </div>

                      <div className="cw-story-section">
                        <span className="cw-story-label">当前进度</span>
                        <div className="cw-story-progress-box">
                          <div className="cw-story-progress-text">
                            <span>{story.progressText}</span>
                            <span>
                              {story.progressTotal > 0
                                ? Math.round(
                                    (story.progressMatched /
                                      story.progressTotal) *
                                      100
                                  )
                                : 0}
                              %
                            </span>
                          </div>
                          <div className="cw-story-progress-bar">
                            <div
                              className="cw-story-progress-fill"
                              style={{
                                width: `${
                                  story.progressTotal > 0
                                    ? (story.progressMatched /
                                        story.progressTotal) *
                                      100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="cw-story-section">
                        <span className="cw-story-label">下一步</span>
                        <div className="cw-story-next">
                          {story.nextStepText}
                        </div>
                      </div>
                    </div>

                    <div className="cw-story-actions">
                      {story.primaryTaskId ? (
                        <button
                          className="text-button"
                          style={{
                            fontWeight: 600,
                            color: '#1b6e46',
                            padding: '4px 0',
                          }}
                          onClick={() => {
                            state.selectDraft(story.primaryTaskId!);
                          }}
                        >
                          查看这票委托
                          <ArrowRight size={14} />
                        </button>
                      ) : (() => {
                        const cAudits = getCustomerAudits(c.id);
                        if (cAudits.length > 0) {
                          return (
                            <button
                              className="text-button"
                              style={{
                                fontWeight: 600,
                                color: '#1b6e46',
                                padding: '4px 0',
                              }}
                              onClick={() => {
                                setCustomerId(c.id);
                                setTab(tabs[1]);
                              }}
                            >
                              查看整单档案 ({cAudits[0].counts.orderRows}行商品)
                              <ArrowRight size={14} />
                            </button>
                          );
                        }
                        return (
                          <span style={{ fontSize: 12, color: '#889e92' }}>
                            暂无委托任务
                          </span>
                        );
                      })()}
                      <button
                        className="text-button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setTab(tabs[0]);
                        }}
                      >
                        进入客户工作台
                        <ArrowRight size={14} />
                      </button>
                    </div>

                    {/* 渐进式披露：底层对账与技术指标（P1/P2/P3） */}
                    <details className="cw-story-card-tech">
                      <summary>技术详情（供对账核验）</summary>
                      <dl>
                        <dt>材料详情</dt>
                        <dd>
                          委托 {c.counts.orderFiles} · 发票{' '}
                          {c.counts.invoiceFiles} · 箱单{' '}
                          {c.counts.packingFiles} · 查货{' '}
                          {c.counts.inspectionFiles}
                        </dd>
                        <dt>商品数据</dt>
                        <dd>
                          待核对商品 {c.counts.lines} · 查货明细{' '}
                          {c.counts.raw} · 可匹配商品 {c.counts.merged}
                        </dd>
                        <dt>业务归属</dt>
                        <dd>
                          委托任务 {c.counts.tasks} · 查货单/批次{' '}
                          {c.counts.orders}
                        </dd>
                      </dl>
                    </details>
                  </article>
                );
              })}
          </div>

          <div className="cw-bottom">
            <section id="customer-tasks">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <h3 style={{ margin: 0 }}>待办任务中心 · {tasks.length}</h3>
                <small style={{ color: '#7a8e83' }}>
                  点击任意行展开渐进式专业详情
                </small>
              </div>
              <div className="cw-filters">
                {TASK_FILTERS.map((s) => (
                  <button
                    key={s}
                    className={filter === s ? 'active' : ''}
                    onClick={() => setFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <TaskTable tasks={tasks} />
            </section>

            <aside>
              <h3>最近业务动态</h3>
              {model.events.slice(0, 6).map((e) => (
                <div className="cw-event" key={e.id}>
                  <time>{date(e.occurredAt)}</time>
                  <p>{e.summary}</p>
                  {e.draftId && (
                    <button
                      className="text-button"
                      onClick={() => state.selectDraft(e.draftId!)}
                    >
                      查看任务
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              ))}
              {!model.events.length && <p>暂无业务动态</p>}

              {/* 改造后的「可体验场景」 */}
              <div className="cw-scenarios-guide">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#1e6a4b',
                    }}
                  >
                    <FlaskConical size={16} />
                    <h3 style={{ margin: 0 }}>可体验场景</h3>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => state.setView('console')}
                  >
                    查看全部场景 →
                  </button>
                </div>
                <p className="cw-scenarios-intro">
                  当前 Demo 已准备真实业务样本，可点击切换体验：
                </p>
                <div>
                  {DEMO_SCENARIO_SHOWCASES.slice(0, 5).map((sc) => (
                    <button
                      key={sc.id}
                      className="cw-scenario-item"
                      onClick={() => {
                        state.loadScenario(sc.id);
                      }}
                      title={`切换到 ${sc.title}`}
                    >
                      <div className="cw-scenario-item-head">
                        <strong>{sc.title}</strong>
                        <span className="cw-scenario-item-badge">
                          {sc.highlight}
                        </span>
                      </div>
                      <p>{sc.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          {(() => {
            const customerAudits = getCustomerAudits(customer.id);
            const totalArchivedRows = customerAudits.reduce((n, a) => n + a.counts.orderRows, 0);
            const totalArchivedRaw = customerAudits.reduce((n, a) => n + a.counts.rawRows, 0);
            const tasksVal = customer.counts.tasks > 0 ? customer.counts.tasks : (customerAudits.length > 0 ? customerAudits.length : 0);
            const tasksBadge = customer.counts.tasks > 0 ? '进行中' : (customerAudits.length > 0 ? '整单归档' : '0 任务');
            
            const linesVal = customer.counts.lines > 0 ? customer.counts.lines : (totalArchivedRows > 0 ? totalArchivedRows : 0);
            const linesBadge = customer.counts.lines > 0 ? '草稿行' : (totalArchivedRows > 0 ? '模型全量识别' : '暂无商品');

            const ordersVal = customer.counts.orders > 0 ? customer.counts.orders : customerAudits.length;
            const rawVal = customer.counts.raw > 0 ? customer.counts.raw : (totalArchivedRaw > 0 ? totalArchivedRaw : 0);

            const issuesVal = customer.issues.length > 0
              ? customer.issues.length
              : (customerAudits[0]?.counts.multipleCandidates ?? (customerAudits[0]?.blockedReason ? 1 : 0));
            const issuesBadge = customer.issues.length > 0
              ? '需人工干预'
              : (customerAudits[0]?.counts.multipleCandidates
                ? '多候选需确认'
                : (customerAudits[0]?.blockedReason ? '输入阻断' : '无阻断'));

            return (
              <div className="cw-detail-metrics">
                <div className="cw-detail-metric-card accent-emerald">
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">委托任务</span>
                    <span className={`cw-metric-badge ${customer.counts.tasks > 0 ? 'green' : 'blue'}`}>{tasksBadge}</span>
                  </div>
                  <strong className="cw-metric-card-val">{tasksVal}</strong>
                  <p className="cw-metric-card-sub">{customerAudits.length > 0 ? `样本 ${customerAudits[0].sampleId}` : '已接入业务事实'}</p>
                </div>

                <div className="cw-detail-metric-card accent-blue">
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">待核对商品</span>
                    <span className="cw-metric-badge green">{linesBadge}</span>
                  </div>
                  <strong className="cw-metric-card-val">{linesVal}</strong>
                  <p className="cw-metric-card-sub">P1 结构化商品清单</p>
                </div>

                <div className="cw-detail-metric-card accent-slate">
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">查货批次</span>
                    <span className="cw-metric-badge">{customerAudits.length > 0 ? '入仓就绪' : '单据'}</span>
                  </div>
                  <strong className="cw-metric-card-val">{ordersVal}</strong>
                  <p className="cw-metric-card-sub">仓储进仓单据</p>
                </div>

                <div className="cw-detail-metric-card accent-slate">
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">查货明细</span>
                    <span className="cw-metric-badge">原始条目</span>
                  </div>
                  <strong className="cw-metric-card-val">{rawVal}</strong>
                  <p className="cw-metric-card-sub">P2 提取原始明细行</p>
                </div>

                <div className="cw-detail-metric-card accent-emerald">
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">可匹配商品</span>
                    <span className="cw-metric-badge">{customer.counts.merged > 0 ? '已聚类' : '待对齐'}</span>
                  </div>
                  <strong className="cw-metric-card-val">{customer.counts.merged}</strong>
                  <p className="cw-metric-card-sub">跨单归一合并库</p>
                </div>

                <div className={`cw-detail-metric-card ${issuesVal > 0 ? 'accent-amber' : 'accent-emerald'}`}>
                  <div className="cw-metric-card-head">
                    <span className="cw-metric-card-title">待处理问题</span>
                    <span className={`cw-metric-badge ${issuesVal > 0 ? 'orange' : 'green'}`}>{issuesBadge}</span>
                  </div>
                  <strong className={`cw-metric-card-val ${issuesVal > 0 ? 'highlight-orange' : ''}`}>{issuesVal}</strong>
                  <p className="cw-metric-card-sub">{issuesVal > 0 ? `${issuesVal} 项需业务裁决` : '核对流程通畅'}</p>
                </div>
              </div>
            );
          })()}

          <div className="cw-tabs" role="tablist" aria-label="客户业务池">
            {tabs.map((t) => (
              <button
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'active' : ''}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {(tab === tabs[0] || tab === tabs[1] || tab === tabs[2]) && (
            <div className={tab === tabs[0] ? 'cw-dual' : 'cw-single'}>
              {(tab === tabs[0] || tab === tabs[1]) && (
                <section>
                  <h3>
                    待核对商品与委托材料池
                    <span className="cw-tag-code">P1 · 委托解析</span>
                  </h3>
                  <EntrustmentPool
                    customer={customer}
                    openFile={setPreview}
                  />
                </section>
              )}
              {(tab === tabs[0] || tab === tabs[2]) && (
                <section>
                  <h3>
                    查货明细与商品池
                    <span className="cw-tag-code">P2 · 查货整理</span>
                  </h3>
                  <InspectionPool
                    customer={customer}
                    openFile={setPreview}
                  />
                </section>
              )}
            </div>
          )}

          {(tab === tabs[0] || tab === tabs[3]) && (
            <RelationList customer={customer} />
          )}

          {(tab === tabs[0] || tab === tabs[4]) && (
            <section>
              <h3>需人工处理的问题队列 · {customer.issues.length}</h3>
              {customer.issues.map((i) => (
                <div className="cw-queue" key={i.id}>
                  <span className="cw-status orange">{i.kind}</span>
                  <strong>
                    {i.task.draft.displayNo} / 商品 {i.line.sourceOrder}
                  </strong>
                  <span>{i.message}</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      state.selectDraft(i.task.draft.id);
                      state.setLastVisitedPanel(
                        `line:${i.line.id}${i.field ? `|${i.field}` : ''}`
                      );
                    }}
                  >
                    去处理
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
              {!customer.issues.length && (() => {
                const customerAudits = getCustomerAudits(customer.id);
                const firstAudit = customerAudits[0];
                if (firstAudit) {
                  const draftId = firstAudit.sampleId === '26SHPYD056' ? 'D-df72916dc019' : state.drafts.find((d) => d.customerId === firstAudit.customerId)?.id;
                  if (firstAudit.blockedReason) {
                    return (
                      <div className="cw-queue" style={{ background: '#fff9f0', borderLeft: '3px solid #e08e24', padding: '12px 14px' }}>
                        <span className="cw-status orange">材料阻断</span>
                        <strong>{firstAudit.sampleId} · {firstAudit.customerName}</strong>
                        <span>{firstAudit.blockedReason}</span>
                        {draftId && (
                          <button className="text-button" onClick={() => state.selectDraft(draftId)}>
                            查看草稿 <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (firstAudit.counts.multipleCandidates > 0) {
                    return (
                      <div className="cw-queue" style={{ background: '#fff9f0', borderLeft: '3px solid #e08e24', padding: '12px 14px' }}>
                        <span className="cw-status orange">多候选待裁决</span>
                        <strong>{firstAudit.sampleId} · {firstAudit.customerName}</strong>
                        <span>模型在 P3 关系识别中发现 {firstAudit.counts.multipleCandidates} 处商品存在同型号多批次查货记录，需人工选择指定批次。</span>
                        {draftId && (
                          <button className="text-button" onClick={() => state.selectDraft(draftId)}>
                            进入草稿核对 <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    );
                  }
                }
                return <p className="cw-empty">暂无待处理问题</p>;
              })()}
            </section>
          )}
        </>
      )}

      {preview && (
        <div className="intake-modal-backdrop">
          <div
            className="intake-modal"
            role="dialog"
            aria-modal="true"
            aria-label="材料来源"
          >
            <button className="text-button" onClick={() => setPreview(null)}>
              关闭材料
            </button>
            <MaterialPreview
              location={{
                fileId: preview,
                page: 1,
                sheet: null,
                position: null,
              }}
              name={
                state.files.find((f) => f.id === preview)?.name ?? preview
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 待办任务表格：业务视角表头 + 渐进式披露展开
 */
function TaskTable({ tasks }: { tasks: WorkbenchModel['tasks'] }) {
  const select = useDemoStore((s) => s.selectDraft);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getAiResult = (t: WorkbenchModel['tasks'][number]) => {
    if (!t.draft.customerId) {
      return { label: '客户无法识别', code: 'P1 · 需确认客户' };
    }
    if (t.matched === t.total && t.total > 0) {
      return { label: '已自动找到全部对应', code: 'P3 · 全部对应' };
    }
    const hasMultiple = t.draft.lines.some((l) =>
      l.issueIds.some((i) => i.includes('多候选'))
    );
    if (hasMultiple) {
      return { label: '存在多个可能对应', code: 'P3 · 需人工选择' };
    }
    if (!t.matched) {
      return t.draft.materialFileIds.length > 1
        ? { label: '暂无可靠查货对应', code: 'P3 · 待匹配' }
        : { label: '暂无查货材料', code: '等待查货' };
    }
    return { label: `已匹配 ${t.matched} 行依据`, code: 'P3 · 部分对应' };
  };

  const getAttention = (t: WorkbenchModel['tasks'][number]) => {
    if (!t.draft.customerId) return '需补充客户信息';
    if (t.issues > 0) return `${t.issues} 处需人工关注`;
    return '无';
  };

  return (
    <div className="cw-table-wrap">
      <table className="cw-table">
        <thead>
          <tr>
            <th scope="col">委托任务</th>
            <th scope="col">当前进度</th>
            <th scope="col">AI处理结果</th>
            <th scope="col">需要关注</th>
            <th scope="col">当前状态</th>
            <th scope="col">下一步</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const ai = getAiResult(t);
            const attention = getAttention(t);
            const isExpanded = expandedId === t.draft.id;

            return (
              <tr key={t.draft.id} className={isExpanded ? 'cw-table-row-active' : ''}>
                <td>
                  <button
                    className="cw-task-link"
                    onClick={() => select(t.draft.id)}
                  >
                    {t.draft.displayNo}
                  </button>
                  <small>{t.draft.customerName}</small>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#1a4d36' }}>
                    {t.matched}/{t.total} 商品已对应
                  </span>
                </td>
                <td>
                  <div>
                    <span>{ai.label}</span>
                    <span className="cw-tag-code">{ai.code}</span>
                  </div>
                </td>
                <td>
                  <span
                    style={{
                      color: attention === '无' ? '#788d82' : '#b25e00',
                      fontWeight: attention === '无' ? 'normal' : 600,
                    }}
                  >
                    {attention}
                  </span>
                </td>
                <td>
                  <span className="cw-status blue">{t.businessStatus}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="text-button"
                      onClick={() => select(t.draft.id)}
                    >
                      {t.nextAction}
                      <ArrowRight size={13} />
                    </button>
                    <button
                      className="icon-button"
                      style={{
                        width: 20,
                        height: 20,
                        padding: 0,
                        borderRadius: 3,
                        color: '#60796c',
                      }}
                      title={isExpanded ? '收起专业详情' : '展开专业详情'}
                      aria-label={isExpanded ? '收起专业详情' : '展开专业详情'}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : t.draft.id)
                      }
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!tasks.length && <p className="cw-empty">暂无符合条件的任务</p>}

      {/* 展开的渐进式专业详情（供点击查看） */}
      {expandedId && (
        (() => {
          const t = tasks.find((item) => item.draft.id === expandedId);
          if (!t) return null;
          return (
            <div className="cw-table-expand-detail">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: 13, color: '#184935' }}>
                  {t.draft.displayNo} · 专业追溯数据（渐进式披露）
                </strong>
                <button
                  className="text-button"
                  onClick={() => setExpandedId(null)}
                >
                  收起详情
                </button>
              </div>
              <div className="cw-table-expand-grid">
                <div>
                  <dt>待核对商品总数</dt>
                  <dd>{t.total} 行 (草稿 V{t.draft.version})</dd>
                </div>
                <div>
                  <dt>查货依据覆盖</dt>
                  <dd>{t.matched}/{t.total} 行已匹配依据</dd>
                </div>
                <div>
                  <dt>商品自动对应 (P3)</dt>
                  <dd>
                    {!t.matched
                      ? 'UNMATCHED (尚未建立)'
                      : t.matched < t.total
                      ? 'PARTIAL (部分建立)'
                      : 'MATCHED (完全建立)'}
                  </dd>
                </div>
                <div>
                  <dt>输入材料与单号</dt>
                  <dd>
                    {t.draft.materialFileIds.length} 份材料 · {t.realtimeStatus}
                  </dd>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function EntrustmentPool({
  customer,
  openFile,
}: {
  customer: CustomerModel;
  openFile: (id: string) => void;
}) {
  const state = useDemoStore();
  return (
    <>
      {customer.tasks.map((t) => {
        const isPuyi = t.draft.id === puyiFixture.draftId;
        const isSc08 =
          t.draft.id === fixture.draftId &&
          state.scenarioId === fixture.scenarioId;
        const hasFullStages = isPuyi || isSc08;
        const currentFixture = isPuyi ? puyiFixture : fixture;
        const files = state.files.filter((f) =>
          t.draft.materialFileIds.includes(f.id)
        );
        const audit = isPuyi
          ? auditBySampleId.get('26SHPYD056')
          : auditForFiles(t.draft.materialFileIds);
        return (
          <article className="cw-batch" key={t.draft.id}>
            <div className="cw-card-title">
              <strong>{t.draft.displayNo}</strong>
              <span className="cw-status blue">{t.businessStatus}</span>
            </div>
            <p className="cw-provenance">
              {hasFullStages
                ? `${currentFixture.model} · 真实整单四步核对全流程贯通 (P1~P4)`
                : audit
                ? `${audit.model} · 委托材料识别${auditStatus(
                    audit.stageStatus.P1
                  )}`
                : '已接入事实 · 尚无模型审计'}
            </p>
            <dl className="cw-facts">
              <dt>输入材料</dt>
              <dd>{files.length} 份材料</dd>
              <dt>待核对商品</dt>
              <dd>
                {t.total} 行 → {t.total} 条草稿行
              </dd>
              <dt>当前草稿</dt>
              <dd>
                {t.draft.version > 0 ? `V${t.draft.version}` : '尚未生成'}
              </dd>
            </dl>
            <details open>
              <summary>查看材料文件 ({files.length})</summary>
              {files.map((f) => (
                <button
                  className="cw-file"
                  key={f.id}
                  onClick={() => openFile(f.id)}
                >
                  {f.name}
                  <small>{f.materialType}</small>
                </button>
              ))}
            </details>
            <details open>
              <summary>查看委托材料识别详情 (P1 · 模型结构化事实)</summary>
              {hasFullStages ? (
                <>
                  <p>
                    识别客户：
                    <b>{(currentFixture as any).stageOutputs.P1.customer_resolution.recognized_name}</b>
                  </p>
                  <p>识别前置问题：{(currentFixture as any).stageOutputs.P1.issues.length} 处</p>
                  {(currentFixture as any).stageOutputs.P1.read_status.map((r: any) => (
                    <p key={r.file_id}>
                      {files.find((f) => f.id === r.file_id)?.name ?? r.file_id}{' '}
                      · {r.status === 'COMPLETE' ? '读取完整 (COMPLETE)' : r.status}
                    </p>
                  ))}
                </>
              ) : audit ? (
                <>
                  <p>执行状态：{auditStatus(audit.stageStatus.P1)}</p>
                  <p>
                    识别客户：<b>{audit.p1.recognizedName}</b> · 共识别 <b>{audit.p1.rowsCount}</b> 条委托商品
                  </p>
                </>
              ) : (
                <p>尚无模型审计，以下为已接入待核对商品行：</p>
              )}
              <div className="cw-table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>商品行</th>
                      <th style={{ minWidth: '130px' }}>型号</th>
                      <th style={{ minWidth: '80px' }}>品牌</th>
                      <th style={{ minWidth: '70px' }}>数量</th>
                      <th style={{ minWidth: '70px' }}>原产地</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.draft.lines.map((l) => (
                      <tr key={l.id}>
                        <td>第 {l.sourceOrder} 行</td>
                        <td><strong style={{ color: '#163829' }}>{l.model}</strong></td>
                        <td>{l.brand}</td>
                        <td>{l.quantity}</td>
                        <td>{l.origin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: '#7a8e82', marginTop: 4 }}>
                保留原始商品结构和顺序，未做跨行合并。
              </p>
            </details>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="text-button"
                style={{ fontWeight: 600, color: '#1b6e46' }}
                onClick={() => state.selectDraft(t.draft.id)}
              >
                在核对工作台打开草稿
                <ArrowRight size={14} />
              </button>
            </div>
          </article>
        );
      })}
      {!customer.tasks.length && (() => {
        const customerAudits = getCustomerAudits(customer.id);
        if (customerAudits.length > 0) {
          return (
            <div>
              <div className="cw-archived-banner">
                <span style={{ fontSize: 16 }}>📌</span>
                <div>
                  <strong>当前演示场景未加载该客户的演示草稿（场景：{state.scenarioId}）</strong>
                  <p style={{ margin: '4px 0 0', color: '#415e4f' }}>
                    真实整单样本库中该客户的委托文件已全量就绪，并通过 <b>{customerAudits[0].model}</b> 模型完成识别解析，共有 <b>{customerAudits.reduce((s, a) => s + a.counts.orderRows, 0)}</b> 行商品：
                  </p>
                </div>
              </div>
              {customerAudits.map((audit) => {
                const draftId = audit.sampleId === '26SHPYD056' ? 'D-df72916dc019' : state.drafts.find((d) => d.customerId === audit.customerId)?.id;
                return (
                  <article className="cw-archived-card" key={audit.sampleId}>
                    <h4>
                      <span>真实整单样本：{audit.sampleId}</span>
                      <span className="cw-tag-code">{audit.model} 真实核对结果</span>
                      <span className="cw-status green">P1 委托解析完成</span>
                    </h4>
                    <p>
                      <strong>客户名称：</strong>{audit.customerName}（{audit.customerId}）
                    </p>
                    <dl className="cw-facts">
                      <dt>委托材料</dt>
                      <dd>{audit.entrustmentFiles.join('、')}</dd>
                      <dt>查货材料</dt>
                      <dd>{audit.inspectionFiles.join('、')}</dd>
                      <dt>识别商品</dt>
                      <dd><b>{audit.counts.orderRows}</b> 行商品已提取</dd>
                      <dt>查货明细</dt>
                      <dd><b>{audit.counts.rawRows}</b> 条查货记录已就绪</dd>
                    </dl>

                    <details open style={{ margin: '12px 0' }}>
                      <summary style={{ fontWeight: 600, color: '#1f6445', cursor: 'pointer' }}>
                        查看真实委托材料文件 ({audit.entrustmentFiles.length})
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {audit.entrustmentFiles.map((fname) => {
                          const foundFile = state.files.find((f) => f.name === fname || fname.includes(f.id));
                          return (
                            <div key={fname} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
                              <span style={{ fontSize: 13, color: '#1d3f2e' }}>📄 {fname}</span>
                              <span className="cw-status blue">主委托材料</span>
                              {foundFile && (
                                <button className="text-button" onClick={() => openFile(foundFile.id)}>
                                  预览文件内容
                                  <ArrowRight size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>

                    <details open style={{ margin: '12px 0' }}>
                      <summary style={{ fontWeight: 600, color: '#1f6445', cursor: 'pointer' }}>
                        查看模型 P1 识别提取的商品行 ({audit.p1.rowsCount} 行)
                      </summary>
                      <div className="cw-table-responsive">
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: '50px' }}>序号</th>
                              <th style={{ minWidth: '80px' }}>品牌</th>
                              <th style={{ minWidth: '130px' }}>型号</th>
                              <th style={{ minWidth: '60px' }}>数量</th>
                              <th style={{ minWidth: '50px' }}>单位</th>
                              <th style={{ minWidth: '60px' }}>原产地</th>
                              <th style={{ minWidth: '90px' }}>净重 / 毛重</th>
                            </tr>
                          </thead>
                          <tbody>
                            {audit.p1.sampleRows.map((row) => (
                              <tr key={row.rowNo}>
                                <td>{row.rowNo}</td>
                                <td>{row.brand || '—'}</td>
                                <td><strong style={{ color: '#163829' }}>{row.model}</strong></td>
                                <td>{row.quantity || '—'}</td>
                                <td>{row.unit || '—'}</td>
                                <td>{row.origin || '—'}</td>
                                <td>{row.netWeight || '—'} / {row.grossWeight || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>

                    {audit.blockedReason ? (
                      <div className="cw-audit-blocked-tip">
                        <strong>⚠️ 模型审计阻断分析：</strong>{audit.blockedReason}
                      </div>
                    ) : (
                      <div style={{ background: '#f2f8f5', padding: '10px 12px', borderRadius: 4, fontSize: 12, color: '#255e42' }}>
                        <strong>✓ 四步核对结论：</strong>
                        P3 关系判定已完成（明确对应 {audit.counts.matched} 行，多候选待确认 {audit.counts.multipleCandidates} 行，未匹配 {audit.counts.unmatched} 行），已生成 {audit.counts.fieldDecisions} 项字段裁决。
                      </div>
                    )}

                    <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                      {state.scenarioId !== 'BUSINESS' && (
                        <button className="primary" onClick={() => state.openBusinessWorkspace()}>
                          切换到完整业务查看
                          <ArrowRight size={14} />
                        </button>
                      )}
                      {draftId && (
                        <button
                          className="text-button"
                          style={{ fontWeight: 600, color: '#1e6a4b' }}
                          onClick={() => state.selectDraft(draftId)}
                        >
                          在核对工作台打开此草稿
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        }
        return <p className="cw-empty">暂无委托任务</p>;
      })()}
    </>
  );
}

function InspectionPool({
  customer,
  openFile,
}: {
  customer: CustomerModel;
  openFile: (id: string) => void;
}) {
  const state = useDemoStore();
  const [filter, setFilter] = useState('全部');
  return (
    <>
      <div className="cw-filters">
        {['全部', '可匹配', '草稿占用', '已核销'].map((s) => (
          <button
            key={s}
            className={filter === s ? 'active' : ''}
            onClick={() => setFilter(s)}
          >
            {s === '草稿占用'
              ? '已用于当前委托'
              : s === '已核销'
              ? '已完成使用'
              : s}{' '}
            {s === '全部'
              ? customer.sources.length
              : customer.sources.filter((r) => r.availability === s).length}{' '}
            条明细
          </button>
        ))}
      </div>
      {customer.inspectionBatches.map((b) => {
        const audit = auditForFiles([
          ...new Set(b.sources.map((source) => source.sourceFileId)),
        ]);
        return (
        <article className="cw-batch" key={b.id}>
          <strong>入仓批次 / 查货单：{b.id}</strong>
          <p>
            {b.files.length} 份查货文件 · {b.orders.length} 个查货单号
          </p>
          <p>
            {b.sources.length} 条查货明细 → {b.products.length} 个可匹配商品
          </p>
          <details>
            <summary>查看查货文件与识别详情 (P2)</summary>
            {b.files.map((f) => (
              <div key={f.id}>
                <button className="cw-file" onClick={() => openFile(f.id)}>
                  {f.name}
                </button>
                {[
                  ...new Set(
                    b.sources
                      .filter((s) => s.sourceFileId === f.id)
                      .map((s) => s.warehouseNo)
                  ),
                ].map((no) => (
                  <p key={no}>
                    入仓号 {no || '待确认'} · 查货明细{' '}
                    {
                      b.sources.filter(
                        (s) => s.sourceFileId === f.id && s.warehouseNo === no
                      ).length
                    }{' '}
                    条
                  </p>
                ))}
              </div>
            ))}
            <p>
              {audit
                ? `${audit.model} · 查货材料识别${auditStatus(
                    audit.stageStatus.P2
                  )} · 全样本共 ${audit.counts.rawRows} 条查货明细`
                : '已接入事实明细 · 尚无模型审计'}
            </p>
          </details>
          <details>
            <summary>查看可匹配商品池 ({b.products.length})</summary>
            {b.products
              .filter(
                (p) =>
                  filter === '全部' ||
                  p.sourceLineIds.some((id) =>
                    b.sources.some(
                      (s) => s.id === id && s.availability === filter
                    )
                  )
              )
              .map((p) => (
                <details className="cw-product" key={p.id}>
                  <summary>
                    <div>
                      <strong>{p.fields.型号}</strong>
                      <span>
                        {p.fields.品牌} · {p.fields.产地}
                      </span>
                      <span>
                        数量 {p.fields.数量 ?? '—'} NW {p.fields.净重 ?? '—'}{' '}
                        GW {p.fields.毛重 ?? '—'}
                      </span>
                    </div>
                    <small>由 {p.sourceLineIds.length} 条查货明细合并</small>
                  </summary>
                  {b.sources
                    .filter((s) => p.sourceLineIds.includes(s.id))
                    .map((s) => (
                      <div className="cw-raw" key={s.id}>
                        <span>
                          {s.sourceLocation.position || s.id} · 数量{' '}
                          {s.quantity}
                        </span>
                        <span className="cw-status blue">
                          {s.availability === '草稿占用'
                            ? '已用于当前委托'
                            : s.availability}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => openFile(s.sourceFileId)}
                        >
                          来源 · 第 {s.sourceLocation.page ?? '—'} 页
                        </button>
                        {s.occupiedDraftId && (
                          <button
                            className="text-button"
                            onClick={() =>
                              state.selectDraft(s.occupiedDraftId!)
                            }
                          >
                            {
                              state.drafts.find(
                                (d) => d.id === s.occupiedDraftId
                              )?.displayNo
                            }{' '}
                            / {s.occupiedEntrustmentLineId}
                          </button>
                        )}
                      </div>
                    ))}
                </details>
              ))}
          </details>
        </article>
        );
      })}
      {!customer.inspectionBatches.length && (() => {
        const customerAudits = getCustomerAudits(customer.id);
        if (customerAudits.length > 0 && customerAudits.some((a) => a.p2)) {
          return (
            <div>
              <div className="cw-archived-banner">
                <span style={{ fontSize: 16 }}>📦</span>
                <div>
                  <strong>当前演示场景未加载该客户的查货批次</strong>
                  <p style={{ margin: '4px 0 0', color: '#415e4f' }}>
                    系统档案库中包含该客户的真实查货材料，已通过模型完成 P2 提取整理：
                  </p>
                </div>
              </div>
              {customerAudits.map((a) => (
                <article className="cw-archived-card" key={a.sampleId}>
                  <h4>
                    <span>样本 {a.sampleId} · 真实查货记录 ({a.p2?.rawRowsCount ?? 0} 条)</span>
                    <span className="cw-tag-code">{a.model} P2 查货明细提取</span>
                  </h4>
                  <p>
                    入仓号：<b>{a.p2?.warehouseNos?.join('、') || '待确认'}</b> · 查货单文件：{a.inspectionFiles.join('、')}
                  </p>
                  <div className="cw-table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '60px' }}>记录号</th>
                          <th style={{ minWidth: '100px' }}>入仓号</th>
                          <th style={{ minWidth: '80px' }}>品牌</th>
                          <th style={{ minWidth: '130px' }}>型号</th>
                          <th style={{ minWidth: '60px' }}>数量</th>
                          <th style={{ minWidth: '50px' }}>单位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.p2?.sampleRows?.map((r) => (
                          <tr key={r.recordNo}>
                            <td>{r.recordNo}</td>
                            <td><span className="cw-tag-code">{r.warehouseNo}</span></td>
                            <td>{r.brand || '—'}</td>
                            <td><strong style={{ color: '#163829' }}>{r.model}</strong></td>
                            <td>{r.quantity}</td>
                            <td>{r.unit || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          );
        }
        return <p className="cw-empty">暂无已接入查货材料</p>;
      })()}
    </>
  );
}

function RelationList({ customer }: { customer: CustomerModel }) {
  const state = useDemoStore();
  const [graph, setGraph] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCHED' | 'MULTIPLE' | 'UNMATCHED' | 'PARTIAL'>('ALL');

  const customerAudits = getCustomerAudits(customer.id);
  const fileAudit = auditForFiles(customer.files.map((file) => file.id));
  const primaryAudit = fileAudit ?? customerAudits[0];

  const hasLiveRelations = customer.relations.length > 0;
  const hasArchivedP3 = !hasLiveRelations && Boolean(primaryAudit?.p3);

  const stats = useMemo(() => {
    if (hasLiveRelations) {
      return {
        total: customer.relations.length,
        matched: customer.relations.filter((r) => r.status === 'MATCHED').length,
        multiple: customer.relations.filter((r) => r.status === 'MULTIPLE_CANDIDATES').length,
        unmatched: customer.relations.filter((r) => r.status === 'PENDING').length,
        partial: customer.relations.filter((r) => r.coverage === 'PARTIAL').length,
      };
    }
    if (primaryAudit?.p3) {
      return {
        total: primaryAudit.counts.orderRows,
        matched: primaryAudit.counts.matched,
        multiple: primaryAudit.counts.multipleCandidates,
        unmatched: primaryAudit.counts.unmatched,
        partial: 0,
      };
    }
    return { total: 0, matched: 0, multiple: 0, unmatched: 0, partial: 0 };
  }, [hasLiveRelations, customer.relations, primaryAudit]);

  const filteredLiveRelations = useMemo(() => {
    if (statusFilter === 'ALL') return customer.relations;
    if (statusFilter === 'MATCHED') return customer.relations.filter((r) => r.status === 'MATCHED');
    if (statusFilter === 'MULTIPLE') return customer.relations.filter((r) => r.status === 'MULTIPLE_CANDIDATES');
    if (statusFilter === 'UNMATCHED') return customer.relations.filter((r) => r.status === 'PENDING');
    if (statusFilter === 'PARTIAL') return customer.relations.filter((r) => r.coverage === 'PARTIAL');
    return customer.relations;
  }, [customer.relations, statusFilter]);

  const filteredArchivedRelations = useMemo(() => {
    const rels = primaryAudit?.p3?.relations ?? [];
    if (statusFilter === 'ALL') return rels;
    if (statusFilter === 'MATCHED') return rels.filter((r: any) => r.matchStatus === 'MATCHED');
    if (statusFilter === 'MULTIPLE') return rels.filter((r: any) => r.matchStatus === 'MULTIPLE_CANDIDATES');
    if (statusFilter === 'UNMATCHED') return rels.filter((r: any) => r.matchStatus === 'UNMATCHED' || r.matchStatus === 'PENDING');
    return rels;
  }, [primaryAudit, statusFilter]);

  const selected = customer.relations.find((r) => r.line.id === active);
  const open = (r: CustomerModel['relations'][number]) => {
    state.selectDraft(r.task.draft.id);
    state.setLastVisitedPanel(`line:${r.line.id}`);
  };

  return (
    <section>
      <div className="cw-section-title">
        <h3>
          待核对商品 ↔ 查货商品自动对应
          <span className="cw-tag-code">P3 · 关系裁决</span>
        </h3>
        {hasLiveRelations && (
          <div className="cw-filters">
            <button
              title="列表视图"
              aria-label="列表视图"
              className={!graph ? 'active' : ''}
              onClick={() => setGraph(false)}
            >
              <List size={15} />
            </button>
            <button
              title="关系图"
              aria-label="关系图"
              className={graph ? 'active' : ''}
              onClick={() => setGraph(true)}
            >
              <GitBranch size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="cw-relation-pills">
        <button
          type="button"
          className={`cw-filter-pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => setStatusFilter('ALL')}
        >
          <span>全部商品</span>
          <b>{stats.total}</b>
        </button>
        <button
          type="button"
          className={`cw-filter-pill-btn ${statusFilter === 'MATCHED' ? 'active' : ''}`}
          onClick={() => setStatusFilter('MATCHED')}
        >
          <span>明确对应</span>
          <b>{stats.matched}</b>
        </button>
        {stats.partial > 0 && (
          <button
            type="button"
            className={`cw-filter-pill-btn ${statusFilter === 'PARTIAL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PARTIAL')}
          >
            <span>依据不完整</span>
            <b>{stats.partial}</b>
          </button>
        )}
        <button
          type="button"
          className={`cw-filter-pill-btn ${statusFilter === 'MULTIPLE' ? 'active' : ''}`}
          onClick={() => setStatusFilter('MULTIPLE')}
        >
          <span>多个候选需人工选择</span>
          <b>{stats.multiple}</b>
        </button>
        <button
          type="button"
          className={`cw-filter-pill-btn ${statusFilter === 'UNMATCHED' ? 'active' : ''}`}
          onClick={() => setStatusFilter('UNMATCHED')}
        >
          <span>暂未找到对应</span>
          <b>{stats.unmatched}</b>
        </button>
      </div>

      {primaryAudit && !hasLiveRelations && (
        <p className="cw-provenance">
          真实整单模型核对审计：商品自动对应{auditStatus(primaryAudit.stageStatus.P3)}；
          明确对应 {primaryAudit.counts.matched} 行，多个候选{' '}
          {primaryAudit.counts.multipleCandidates} 行，未匹配 {primaryAudit.counts.unmatched} 行。
          字段自动核对{auditStatus(primaryAudit.stageStatus.P4)}，产生{' '}
          {primaryAudit.counts.fieldDecisions} 项决策。
        </p>
      )}

      {hasLiveRelations ? (
        graph ? (
          <div className="cw-graph">
            {filteredLiveRelations.map((r) => (
              <button key={r.line.id} onClick={() => setActive(r.line.id)}>
                <span>
                  {r.task.draft.displayNo} / 商品 {r.line.sourceOrder}
                  <b>{r.line.model}</b>
                </span>
                <span className="cw-edge">
                  {r.status === 'MATCHED'
                    ? '已找到对应'
                    : r.status === 'MULTIPLE_CANDIDATES'
                    ? '多个候选'
                    : '暂无对应'}
                  <ArrowRight size={18} />
                </span>
                <span>
                  {r.sources
                    .map(
                      (s) =>
                        `${s.warehouseNo} / ${s.sourceLocation.position || s.id}`
                    )
                    .join('、') || '暂无已确定查货依据'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cw-table-responsive">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: '150px' }}>待核对商品</th>
                  <th style={{ minWidth: '130px' }}>委托任务</th>
                  <th style={{ minWidth: '130px' }}>AI裁决结果</th>
                  <th style={{ minWidth: '180px' }}>查货依据 (入仓号/明细)</th>
                  <th style={{ minWidth: '110px' }}>覆盖状态</th>
                  <th style={{ minWidth: '110px' }}>当前动作</th>
                </tr>
              </thead>
              <tbody>
                {filteredLiveRelations.map((r) => (
                  <tr key={r.line.id}>
                    <td>
                      <button
                        className="cw-task-link"
                        onClick={() => setActive(r.line.id)}
                      >
                        行 {r.line.sourceOrder} · {r.line.model}
                      </button>
                    </td>
                    <td>{r.task.draft.displayNo}</td>
                    <td>
                      <span
                        className={`cw-status-pill ${
                          r.status === 'MATCHED'
                            ? 'green'
                            : r.status === 'MULTIPLE_CANDIDATES'
                            ? 'orange'
                            : 'gray'
                        }`}
                      >
                        {r.status === 'MATCHED'
                          ? '已找到对应'
                          : r.status === 'MULTIPLE_CANDIDATES'
                          ? '多个候选需选择'
                          : '暂无对应'}
                      </span>
                      <small style={{ display: 'block', color: '#668072', marginTop: 4 }}>
                        {r.origin}
                      </small>
                    </td>
                    <td>
                      {r.sources
                        .map(
                          (s) =>
                            `${s.warehouseNo} / ${
                              s.sourceLocation.position || s.id
                            }`
                        )
                        .join('、') || '—'}
                    </td>
                    <td>
                      <span
                        className={`cw-status-pill ${
                          r.coverage === 'COMPLETE'
                            ? 'green'
                            : r.coverage === 'PARTIAL'
                            ? 'orange'
                            : 'gray'
                        }`}
                      >
                        {r.coverage === 'COMPLETE'
                          ? '依据完整'
                          : r.coverage === 'PARTIAL'
                          ? '依据不完整'
                          : '待确认'}
                      </span>
                    </td>
                    <td>
                      <button className="text-button" onClick={() => open(r)}>
                        {r.status === 'MATCHED' ? '进入核对' : '处理对应关系'}
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : hasArchivedP3 ? (
        <div style={{ marginTop: 12 }}>
          <div className="cw-archived-banner">
            <Sparkles size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ fontSize: '14px', color: '#14532d' }}>
                真实整单样本模型核对结论（样本 {primaryAudit.sampleId} · {primaryAudit.model}）
              </strong>
              <p style={{ margin: '4px 0 0', color: '#166534', fontSize: '12px' }}>
                共完成 <b>{stats.total}</b> 行商品的自动对应裁决：明确对应 <b>{stats.matched}</b> 行，多候选需人工确认 <b>{stats.multiple}</b> 行，未匹配 <b>{stats.unmatched}</b> 行。
              </p>
            </div>
          </div>

          <article className="cw-archived-card">
            <h4>
              <span>样本 {primaryAudit.sampleId} · 真实整单模型 P3 关系裁决表</span>
              <span className="cw-tag-code">{primaryAudit.model}</span>
              <span className="cw-status-pill green">P3 裁决完成</span>
            </h4>

            <div className="cw-table-responsive">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: '160px' }}>委托商品行</th>
                    <th style={{ minWidth: '140px' }}>AI 裁决状态</th>
                    <th style={{ minWidth: '180px' }}>查货单依据</th>
                    <th style={{ minWidth: '240px' }}>模型置信与判定依据</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArchivedRelations.map((rel: any, idx: number) => {
                    const originalIdx = (primaryAudit.p3?.relations as any[])?.indexOf(rel) ?? idx;
                    const row = primaryAudit.p1?.sampleRows?.[originalIdx];
                    return (
                      <tr key={rel.orderRowId || idx}>
                        <td>
                          <strong style={{ color: '#163829', fontSize: '13px' }}>{row?.model || rel.orderRowId}</strong>
                          <br />
                          <small style={{ color: '#687e72' }}>
                            {row?.brand ? `${row.brand} · ` : ''}数量 {row?.quantity || '—'} {row?.unit || ''}
                            {row?.origin ? ` · 产地: ${row.origin}` : ''}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`cw-status-pill ${
                              rel.matchStatus === 'MATCHED'
                                ? 'green'
                                : rel.matchStatus === 'MULTIPLE_CANDIDATES'
                                ? 'orange'
                                : 'gray'
                            }`}
                          >
                            {rel.matchStatus === 'MATCHED'
                              ? '明确匹配依据'
                              : rel.matchStatus === 'MULTIPLE_CANDIDATES'
                              ? '存在多个候选'
                              : '暂无对应'}
                          </span>
                        </td>
                        <td>
                          {rel.selectedRawRowIds?.length > 0 ? (
                            <span style={{ fontWeight: 600, color: '#15803d' }}>
                              {rel.selectedRawRowIds.join('、')}
                            </span>
                          ) : rel.candidateRawRowIds?.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ color: '#b45309', fontSize: '11px', fontWeight: 600 }}>候选明细:</span>
                              <span style={{ color: '#78350f' }}>{rel.candidateRawRowIds.join('、')}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>— 暂无入仓记录</span>
                          )}
                        </td>
                        <td style={{ wordBreak: 'break-word', color: '#334155' }}>
                          <span>
                            {rel.reason ||
                              (rel.matchStatus === 'MATCHED'
                                ? '型号与数量一致，查货范围覆盖完整。'
                                : rel.matchStatus === 'MULTIPLE_CANDIDATES'
                                ? '查货记录中存在同型号多批次入仓记录，需人工选择确认对应批次。'
                                : '查货记录中暂未找到相匹配的型号依据。')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              {state.scenarioId !== 'BUSINESS' && (
                <button className="primary" onClick={() => state.openBusinessWorkspace()}>
                  切换到完整业务查看
                  <ArrowRight size={14} />
                </button>
              )}
              {(() => {
                const draftId = primaryAudit.sampleId === '26SHPYD056'
                  ? 'D-df72916dc019'
                  : state.drafts.find((d) => d.customerId === primaryAudit.customerId)?.id;
                if (draftId) {
                  return (
                    <button
                      className="text-button"
                      style={{ fontWeight: 600, color: '#166534' }}
                      onClick={() => state.selectDraft(draftId)}
                    >
                      打开委托草稿执行回放
                      <ArrowRight size={14} />
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          </article>
        </div>
      ) : (
        <p className="cw-empty">暂无待核对商品对应关系</p>
      )}

      {selected && (
        <div className="cw-relation-detail">
          <button className="text-button" onClick={() => setActive(null)}>
            收起关系详情
          </button>
          <h4>
            {selected.line.model} · {selected.line.brand}
          </h4>
          <p>{selected.reason}</p>
          <p>
            物料号：{selected.line.fields.物料号码 || '—'} · {selected.origin}
          </p>
          <button className="text-button" onClick={() => open(selected)}>
            打开任务处理对应关系
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </section>
  );
}

function RealAuditsShowcase({
  onSelectCustomer,
}: {
  onSelectCustomer: (customerId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="cw-real-audits-box">
      <div
        className="cw-real-audits-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3>
            <Sparkles size={16} />
            11 套真实整单样本 · GPT-5.6 模型核对全景档案库
            <span className="cw-tag-code">
              {auditIndex.samples.length} 套真实样本全量就绪
            </span>
          </h3>
          <small>
            包含 GPT-5.6-Luna (10套) 与 GPT-5.6-Sol (1套) 真实四步核对报告 · 2套四步全通可交互回放 · 9套深度审计归档
          </small>
        </div>
        <button
          className="text-button"
          style={{ fontSize: 13, color: '#1b6e46', fontWeight: 600 }}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '收起档案库' : '展开查看 11 套模型核对结果'}
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="cw-real-audits-grid">
          {auditIndex.samples.map((s) => {
            const isFullPass =
              s.stageStatus.P1 === 'SUCCESS' &&
              s.stageStatus.P2 === 'SUCCESS' &&
              s.stageStatus.P3 === 'SUCCESS' &&
              s.stageStatus.P4 === 'SUCCESS';
            return (
              <div
                key={s.sampleId}
                className="cw-audit-card"
                onClick={() => onSelectCustomer(s.customerId)}
                style={{ cursor: 'pointer' }}
                title={`点击进入 ${s.customerName} 业务工作台`}
              >
                <div className="cw-audit-card-top">
                  <strong>{s.sampleId}</strong>
                  <span className="cw-tag-code">{s.model}</span>
                </div>
                <div className="cw-audit-card-customer">
                  {s.customerName}
                </div>
                <div className="cw-audit-stages">
                  <span className={`cw-stage-badge ${s.stageStatus.P1 === 'SUCCESS' ? 'pass' : 'neutral'}`}>
                    P1: {auditStatus(s.stageStatus.P1)}
                  </span>
                  <span className={`cw-stage-badge ${s.stageStatus.P2 === 'SUCCESS' ? 'pass' : 'neutral'}`}>
                    P2: {auditStatus(s.stageStatus.P2)}
                  </span>
                  <span className={`cw-stage-badge ${s.stageStatus.P3 === 'SUCCESS' ? 'pass' : s.stageStatus.P3 === 'INVALID_INPUT' ? 'blocked' : 'review'}`}>
                    P3: {auditStatus(s.stageStatus.P3)}
                  </span>
                  <span className={`cw-stage-badge ${s.stageStatus.P4 === 'SUCCESS' ? 'pass' : s.stageStatus.P4 === 'INVALID_INPUT' ? 'blocked' : 'review'}`}>
                    P4: {auditStatus(s.stageStatus.P4)}
                  </span>
                </div>
                <div className="cw-audit-card-meta">
                  <span>委托商品 {s.counts.orderRows} 行 · 查货明细 {s.counts.rawRows} 条</span>
                  <br />
                  <span>
                    匹配 {s.counts.matched} · 多候选 {s.counts.multipleCandidates} · 字段决策 {s.counts.fieldDecisions}
                  </span>
                </div>
                {s.blockedReason ? (
                  <div className="cw-audit-blocked-tip">
                    {s.blockedReason}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#1f6e47' }}>
                    {isFullPass ? '✓ 四步全流程贯通，支持真实回放' : '待人工介入选择候选'}
                  </div>
                )}
                <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <span className="text-button" style={{ fontSize: 12, padding: 0 }}>
                    进入客户档案 <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
