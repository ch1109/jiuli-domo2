import { getMergedPoolProducts, type DemoState } from './demo-store';
import { getTaskSummary } from './workspace-status';
import { getFieldRows } from './workbench-model';
import baselineFiles from '../demo-generated/mock/source-files.json';
import batches from '../demo-generated/mock/material-batches.json';
import fixture from '../demo-generated/mock/real-calibration-sc08.json';
import puyiFixture from '../demo-generated/mock/real-calibration-26shpyd056.json';

import auditIndex from '../demo-generated/mock/model-audit-index.json';

export const TASK_FILTERS = ['全部任务', '处理中', '待解析', '待匹配', '部分核对', '待人工处理', '待人工复核', '人工复核中', '已完成', '异常'] as const;

export function getCustomerWorkbench(state: DemoState, today = new Date()) {
  const sources = state.sources.filter(s => s.availability !== '未加载');
  const products = getMergedPoolProducts(sources);
  const tasks = state.drafts.map(draft => ({ draft, ...getTaskSummary(draft) }));
  const relations = tasks.flatMap(task => task.draft.lines.map(line => {
    const active = state.relations.filter(r => r.active && r.entrustmentLineId === line.id);
    const rawIds = [...new Set(active.flatMap(r => r.inspectionSourceLineIds))];
    const matchedSources = sources.filter(s => rawIds.includes(s.id));
    const modelRelations = active.some(r => r.modelCoverage);
    const currentFixture = line.id.startsWith('D-df72916dc019') ? puyiFixture : fixture;
    const saved = modelRelations ? (currentFixture as any).stageOutputs?.P3?.row_relations?.find((r: any) => r.order_row_id === line.id) : undefined;
    const multiple = line.issueIds.some(i => i.includes('多候选')) || !!line.issue?.includes('多候选');
    const status = active.length ? 'MATCHED' : multiple ? 'MULTIPLE_CANDIDATES' : 'PENDING';
    const coverage = active.length ? active.every(r => r.modelCoverage?.status === 'COMPLETE') ? 'COMPLETE' : active.some(r => r.modelCoverage?.status === 'PARTIAL') ? 'PARTIAL' : 'UNCERTAIN' : null;
    return { task, line, active, sources: matchedSources, status, coverage, saved,
      label: status === 'MATCHED' ? '已匹配' : status === 'MULTIPLE_CANDIDATES' ? '多候选' : '尚无可靠关系',
      reason: active.map(r => r.evidenceSummary).join('；') || line.issue || '尚未形成可用关系，需执行匹配或补充查货。',
      origin: modelRelations ? '真实 P3 结果' : active.some(r => r.establishedBy === '人工') ? '人工建立' : active.length ? '演示场景关系' : '待处理',
    };
  }));
  const issues = tasks.filter(t => !t.draft.finalized).flatMap(task => task.draft.lines.flatMap(line => {
    const items = getFieldRows(line, state.evidence).filter(f => f.needsHuman).map(f => ({ id: `${line.id}:${f.field}`, task, line, field: f.field, kind: '字段问题', message: `${f.field} · ${f.status}` }));
    return [...items, ...(!line.relationSourceIds.length ? [{ id: `${line.id}:relation`, task, line, field: null, kind: '关系问题', message: line.issue || '暂无查货依据' }] : [])];
  }));
  const customers = state.customers.map(customer => {
    const customerTasks = tasks.filter(t => t.draft.customerId === customer.id);
    const customerSources = sources.filter(s => s.customerId === customer.id);
    const customerAudits = auditIndex.samples.filter(s => s.customerId === customer.id);

    // 活跃任务草稿引用的委托材料
    const taskFileIds = new Set(customerTasks.flatMap(t => t.draft.materialFileIds));
    // 活跃查货明细引用的查货材料
    const sourceFileIds = new Set(customerSources.map(s => s.sourceFileId));

    // 客户有效文件：包含任务与查货实际消费的文件，以及本地上传文件
    const activeFileIds = new Set([...taskFileIds, ...sourceFileIds]);
    const files = state.files.filter(f => 
      activeFileIds.has(f.id) || 
      (f.customerId === customer.id && f.source === '本地上传' && f.materialType !== '参考结果' && !f.duplicate)
    );

    const customerProducts = products.filter(p => p.customerId === customer.id);
    const customerRelations = relations.filter(r => r.task.draft.customerId === customer.id);
    const customerIssues = issues.filter(i => i.task.draft.customerId === customer.id);
    const inspectionBatches = [...new Set(customerSources.map(s => state.files.find(f => f.id === s.sourceFileId)?.batchId || batches.find(b => b.fileIds.includes(s.sourceFileId) && b.kind === 'inspection')?.id || s.sourceFileId))].map(id => {
      const members = customerSources.filter(s => (state.files.find(f => f.id === s.sourceFileId)?.batchId || batches.find(b => b.fileIds.includes(s.sourceFileId) && b.kind === 'inspection')?.id || s.sourceFileId) === id);
      return { id, sources: members, files: files.filter(f => members.some(s => s.sourceFileId === f.id)), products: customerProducts.filter(p => p.sourceLineIds.some(id => members.some(s => s.id === id))), orders: [...new Set(members.map(s => s.logicalInspectionOrderId))] };
    });
    const latest = [...customerTasks.map(t => t.draft.updatedAt), ...customerSources.map(s => s.updatedAt)].sort().at(-1);
    const events = state.operations.filter(o => o.customerId === customer.id).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt));

    // 1. 委托材料文件数：有活跃任务时统计任务实际引用的文件数；无活跃任务时采用归档样本库中的委托材料数
    const orderFilesCount = customerTasks.length > 0
      ? taskFileIds.size
      : new Set(customerAudits.flatMap(a => a.entrustmentFiles)).size;

    // 2. 查货材料文件数：有活跃查货批次时统计批次查货文件数；无活跃批次时采用归档样本库中的查货材料数
    const inspectionFilesCount = sourceFileIds.size > 0
      ? sourceFileIds.size
      : new Set(customerAudits.flatMap(a => a.inspectionFiles)).size;

    // 3. 独立箱单文件数：仅统计独立作为箱单且非查货/非委托的文件
    const packingFilesCount = files.filter(f => f.materialType === '箱单' && !taskFileIds.has(f.id) && !sourceFileIds.has(f.id)).length;

    // 4. 独立发票文件数：仅统计独立作为发票且非查货/非委托的文件
    const invoiceFilesCount = files.filter(f => f.materialType === '发票' && !taskFileIds.has(f.id) && !sourceFileIds.has(f.id)).length;

    // 业务指标（融合归档样本事实，与客户工作台内部完全一致）
    const totalArchivedRows = customerAudits.reduce((n, a) => n + a.counts.orderRows, 0);
    const totalArchivedRaw = customerAudits.reduce((n, a) => n + a.counts.rawRows, 0);

    const tasksCount = customerTasks.length > 0 ? customerTasks.length : customerAudits.length;
    const linesCount = customerTasks.length > 0 ? customerTasks.reduce((n, t) => n + t.total, 0) : totalArchivedRows;
    const ordersCount = customerSources.length > 0 ? new Set(customerSources.map(s => s.logicalInspectionOrderId)).size : customerAudits.length;
    const rawCount = customerSources.length > 0 ? customerSources.length : totalArchivedRaw;
    const mergedCount = customerProducts.length;

    return { ...customer, tasks: customerTasks, sources: customerSources, products: customerProducts, files, relations: customerRelations, issues: customerIssues, inspectionBatches, latest, events,
      counts: { tasks: tasksCount, lines: linesCount, orders: ordersCount, raw: rawCount, merged: mergedCount, orderFiles: orderFilesCount, invoiceFiles: invoiceFilesCount, packingFiles: packingFilesCount, inspectionFiles: inspectionFilesCount },
    };
  });
  const statusCounts = TASK_FILTERS.slice(2).map(label => ({label, count: tasks.filter(t => t.businessStatus === (label === '待人工复核' ? 'AI核对完成 · 待人工复核' : label)).length}));
  const todayFileIds = new Set(state.operations.filter(o => new Date(o.occurredAt).toDateString() === today.toDateString() && ['新增查货','新建委托'].includes(o.operationType)).flatMap(o => [...(state.drafts.find(d => d.id === o.draftId)?.materialFileIds ?? []), ...sources.filter(s => o.affectedInspectionSourceLineIds.includes(s.id)).map(s => s.sourceFileId)]));
  return { customers, tasks, sources, products, relations, issues, statusCounts, todayFileIds,
    events: [...state.operations].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)),
    metrics: [{label:'全部客户',count:customers.length,filter:'全部任务'}, {label:'处理中任务',count:tasks.filter(t => t.businessStatus !== '已完成').length,filter:'处理中'}, ...['待匹配','部分核对','待人工处理','待人工复核','已完成'].map(label => ({label,count:statusCounts.find(s => s.label === label)?.count ?? 0,filter:label})), {label:'今日新增材料',count:todayFileIds.size,filter:'今日新增材料'}],
  };
}
export type WorkbenchModel = ReturnType<typeof getCustomerWorkbench>;
export type CustomerModel = WorkbenchModel['customers'][number];
