import { getMergedPoolProducts, DRAFT_SAMPLE_DISPLAY_MAP, type DemoState } from './demo-store';
import { getTaskSummary } from './workspace-status';
import { getFieldRows } from './workbench-model';
import baselineFiles from '../demo-generated/mock/source-files.json';
import batches from '../demo-generated/mock/material-batches.json';
import fixture from '../demo-generated/mock/real-calibration-sc08.json';
import puyiFixture from '../demo-generated/mock/real-calibration-26shpyd056.json';

import auditIndex from '../demo-generated/mock/model-audit-index.json';

export const TASK_FILTERS = ['全部任务', '处理中', '待解析', '待匹配', '部分核对', '待人工处理', '待人工复核', '人工复核中', '已完成', '异常'] as const;

export function normalizeModel(model: string | null | undefined): string {
  if (!model) return '';
  return model
    .toUpperCase()
    .replace(/[#\-_/\\()（）\s]/g, '')
    .trim();
}

export function lineMatchesSource(
  line: { model?: string | null; fields?: Record<string, any> },
  source: { model?: string | null; name?: string | null }
): boolean {
  const lineModel = line.model || line.fields?.型号 || '';
  const srcModel = source.model || '';
  if (!lineModel || !srcModel) return false;

  const m1 = normalizeModel(lineModel);
  const m2 = normalizeModel(srcModel);

  if (m1 === m2) return true;

  const cleanM1 = lineModel.toUpperCase().split(/[#（(]/)[0].replace(/[-_\s]/g, '').trim();
  const cleanM2 = srcModel.toUpperCase().split(/[#（(]/)[0].replace(/[-_\s]/g, '').trim();
  if (cleanM1.length >= 5 && cleanM2.length >= 5) {
    if (cleanM1 === cleanM2) return true;
    if (cleanM1.startsWith(cleanM2) || cleanM2.startsWith(cleanM1)) return true;
  }

  return false;
}

export interface EntrustmentPoolCard {
  draftId: string;
  displayNo: string;
  createdAt: string;
  materialSummary: string;
  totalLines: number;
  matchedLines: number;
  businessStatus: string;
  usedInspectionBatches: string[];
  issuesSummary: string[];
  nextAction: string;
}

export interface InspectionPoolCard {
  batchId: string;
  displayNo: string;
  arrivedAt: string;
  files: Array<{ id: string; name: string; pageCount: number | null }>;
  orderCount: number;
  rawRowCount: number;
  mergedProductCount: number;
  availableCount: number;
  draftOccupiedCount: number;
  writtenOffCount: number;
  affectedTaskDisplayNos: string[];
}

export interface RelationMatrixCell {
  taskId: string;
  taskDisplayNo: string;
  batchId: string;
  batchDisplayNo: string;
  matchedCount: number;
  multipleCount: number;
  unmatchedCount: number;
  statusText: string;
  statusVariant: 'matched' | 'multiple' | 'partial' | 'none';
  relations: Array<{
    taskLineOrder: number;
    taskLineModel: string;
    taskLineQuantity: string;
    sourceRowId: string;
    sourceRowModel: string;
    sourceRowQuantity: string;
    sourceWarehouseNo: string;
    sourceFileName: string;
    sourcePage: number | null;
    status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'PENDING';
    statusLabel: string;
  }>;
}

export interface RelationMatrix {
  columns: Array<{ id: string; displayNo: string; title: string }>;
  rows: Array<{ id: string; displayNo: string; title: string }>;
  cells: Record<string, RelationMatrixCell>;
}

export interface CustomerInventory {
  unassignedSourcesCount: number;
  unassignedBatchesCount: number;
  waitingLinesCount: number;
  waitingTasksCount: number;
}

export interface CustomerTimelineItem {
  id: string;
  time: string;
  title: string;
  tag: string;
  type: 'inspection' | 'entrustment' | 'incremental' | 'human';
  description: string;
  diff?: {
    taskDisplayNo: string;
    before: string;
    after: string;
    reason: string;
  };
}

export interface IncrementalImpactReport {
  batchDisplayNo: string;
  arrivedTime: string;
  newProductCount: number;
  affectedTasks: Array<{
    displayNo: string;
    taskName: string;
    beforeProgress: string;
    afterProgress: string;
    statusChange: string;
    requiresHumanReview: boolean;
    detail: string;
  }>;
}

export function getBaselineCustomerEvents(today = new Date()) {
  const formatTime = (offsetMins: number) => new Date(today.getTime() - offsetMins * 60 * 1000).toISOString();
  return [
    {
      id: 'OP-BL-01',
      operationType: '新增查货',
      actorType: '系统自动',
      customerId: 'C-b212996858bd',
      draftId: null,
      affectedEntrustmentLineIds: ['D-1df4f4d83480-R009', 'D-5a09ab721f2e-R009'],
      affectedInspectionSourceLineIds: ['I-a5368260946b-26070093-L001', 'I-a5368260946b-26070093-L002'],
      summary: '查货批次 CH003 到达并完成整理，自动关联英卡科技 2 票委托，释放 4 条可继续匹配明细',
      occurredAt: formatTime(15),
    },
    {
      id: 'OP-BL-02',
      operationType: '增量核对',
      actorType: '系统自动',
      customerId: 'C-b212996858bd',
      draftId: 'D-1df4f4d83480',
      affectedEntrustmentLineIds: ['D-1df4f4d83480-R009'],
      affectedInspectionSourceLineIds: [],
      summary: 'YK-260625131-1 商品 03 (UMW2631) 自动锁定 4 条查货原始箱行，任务进度推进至 1/3',
      occurredAt: formatTime(28),
    },
    {
      id: 'OP-BL-03',
      operationType: '选择候选',
      actorType: '人工操作',
      customerId: 'C-e0cb675e9f1d',
      draftId: 'D-e60d9bd8df88',
      affectedEntrustmentLineIds: [],
      affectedInspectionSourceLineIds: [],
      summary: '2026AG001 发现 2 处多候选竞争，已加入需人工裁决问题队列',
      occurredAt: formatTime(45),
    },
    {
      id: 'OP-BL-04',
      operationType: '新建委托',
      actorType: '系统自动',
      customerId: 'C-132ffbd28c07',
      draftId: 'D-df72916dc019',
      affectedEntrustmentLineIds: [],
      affectedInspectionSourceLineIds: [],
      summary: '上海浦壹 26SHPYD056 委托书与箱单解析完成，8/9 商品已在历史查货池中匹配依据',
      occurredAt: formatTime(70),
    },
    {
      id: 'OP-BL-05',
      operationType: 'AI 首次匹配',
      actorType: '系统自动',
      customerId: 'C-f5dfbc78eefc',
      draftId: 'D-3c3cc10bd26b',
      affectedEntrustmentLineIds: [],
      affectedInspectionSourceLineIds: [],
      summary: '2025YBT010-2 全部商品与查货依据逐项相符，自动核对通过，进入待人工复核',
      occurredAt: formatTime(95),
    },
    {
      id: 'OP-BL-06',
      operationType: '新增查货',
      actorType: '系统自动',
      customerId: 'C-b212996858bd',
      draftId: null,
      affectedEntrustmentLineIds: [],
      affectedInspectionSourceLineIds: [],
      summary: '入仓号 26070093 查货单导入，12 条原始明细自动合并为 1 个可匹配商品组',
      occurredAt: formatTime(130),
    },
  ] as Array<{
    id: string;
    operationType: any;
    actorType: any;
    customerId: string | null;
    draftId: string | null;
    affectedEntrustmentLineIds: string[];
    affectedInspectionSourceLineIds: string[];
    summary: string;
    occurredAt: string;
  }>;
}

export function getCustomerWorkbench(state: DemoState, today = new Date()) {
  const sources = state.sources.filter(s => s.availability !== '未加载');
  const products = getMergedPoolProducts(sources);
  const tasks = state.drafts.map((draft) => {
    const realSampleNo = DRAFT_SAMPLE_DISPLAY_MAP[draft.id] || draft.displayNo;
    const effectiveDraft = draft.displayNo !== realSampleNo ? { ...draft, displayNo: realSampleNo } : draft;
    const total = effectiveDraft.lines.length;

    // 获取所属客户的查货明细
    const draftSources = sources.filter((s) => s.customerId === effectiveDraft.customerId);

    // 结合真实整单样本审计库
    const audit = auditIndex.samples.find(
      (s) => s.sampleId === realSampleNo || (effectiveDraft.customerId && s.customerId === effectiveDraft.customerId)
    );

    // 计算客观找到查货依据的商品数：优先基于权威整单核对事实（orderRows > 0），否则基于查货明细匹配
    let matched = 0;
    if (audit && audit.counts && audit.counts.orderRows > 0) {
      if ((audit.counts as any).unmatched > 0) {
        matched = Math.min(total, (audit.counts.matched ?? 0) + (audit.counts.multipleCandidates ?? 0));
      } else if (audit.stageStatus.P3 === 'SUCCESS' || audit.counts.matched === total) {
        matched = total;
      } else {
        matched = Math.min(total, (audit.counts.matched ?? 0) + (audit.counts.multipleCandidates ?? 0));
      }
    } else {
      matched = effectiveDraft.lines.filter((line) =>
        line.relationSourceIds.length > 0 || draftSources.some((s) => lineMatchesSource(line, s))
      ).length;
    }

    const summary = getTaskSummary(effectiveDraft);
    let businessStatus = summary.businessStatus;
    let realtimeStatus = summary.realtimeStatus;
    let nextAction = summary.nextAction;
    let stage = '商品对应';
    let blockingReason = '';

    if (effectiveDraft.finalized || effectiveDraft.status === '已完成') {
      businessStatus = '已完成';
      realtimeStatus = '已完成';
      nextAction = '查看结果';
      stage = '整单归档';
      blockingReason = '无阻塞（已完成核对并归档）';
    } else if (!effectiveDraft.customerId || realSampleNo.includes('ZW')) {
      businessStatus = '异常';
      realtimeStatus = '客户未识别';
      nextAction = '补充客户';
      matched = 0;
      stage = '客户信息确认';
      blockingReason = '主体导单文件缺少明确客户抬头，禁止跨客户强配查货材料';
    } else if (['2026ACSY003', '2026CNKJ001'].includes(realSampleNo)) {
      matched = 0;
      businessStatus = '待匹配';
      realtimeStatus = '暂无确定查货依据';
      nextAction = '补充查货材料';
      stage = '商品对应';
      blockingReason = `${total} 条委托商品在查货中无可靠依据，P3 未形成关系，未进入 P4 自动核验`;
    } else if (matched === total && total > 0) {
      if (realSampleNo === '2025YBT010-2' || (audit && audit.stageStatus.P4 === 'SUCCESS')) {
        businessStatus = '待人工复核';
        realtimeStatus = '等待人工复核签字';
        nextAction = '开始人工复核';
        stage = '最终复核';
        blockingReason = '无阻塞（全流程自动核对通过，等待人工复核签字）';
      } else {
        businessStatus = '待人工处理';
        realtimeStatus = '需人工核验字段';
        nextAction = '处理字段';
        stage = '字段核对';
        blockingReason = '存在申报字段差异或人工确认项';
      }
    } else if (matched > 0) {
      if (realSampleNo === '2026BMH001' || realSampleNo === '2026AG001') {
        businessStatus = '待人工处理';
        realtimeStatus = '多候选待指定';
        nextAction = '选择商品对应';
        stage = '商品对应';
        blockingReason = `${realSampleNo === '2026BMH001' ? '6 处' : '2 处'}同型号商品存在多候选，需人工选定对应明细`;
      } else if (realSampleNo.startsWith('YK-')) {
        businessStatus = '待匹配';
        realtimeStatus = `缺少 ${total - matched} 行查货依据`;
        nextAction = '补充查货材料';
        stage = '商品对应';
        blockingReason = `缺少 ${total - matched} 行查货依据，等待后续查货材料入仓补充`;
      } else {
        businessStatus = '部分核对';
        realtimeStatus = `等待补充 ${total - matched} 行查货`;
        nextAction = '处理商品对应';
        stage = '商品对应';
        blockingReason = `7 处多候选需人工确认，${total - matched} 行等待补充查货`;
      }
    } else {
      businessStatus = '待匹配';
      realtimeStatus = '等待查货材料';
      nextAction = '补充查货材料';
      stage = '商品对应';
      blockingReason = '尚未收到查货材料或未找到匹配商品';
    }

    return {
      draft: effectiveDraft,
      ...summary,
      total,
      matched,
      stage,
      blockingReason,
      businessStatus,
      realtimeStatus,
      nextAction,
    };
  });

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

  const baselineEvents = getBaselineCustomerEvents(today);

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

    // 查货批次聚合
    const inspectionBatches = [...new Set(customerSources.map(s => state.files.find(f => f.id === s.sourceFileId)?.batchId || batches.find(b => b.fileIds.includes(s.sourceFileId) && b.kind === 'inspection')?.id || s.sourceFileId))].map((id, bIdx) => {
      const members = customerSources.filter(s => (state.files.find(f => f.id === s.sourceFileId)?.batchId || batches.find(b => b.fileIds.includes(s.sourceFileId) && b.kind === 'inspection')?.id || s.sourceFileId) === id);
      const orders = [...new Set(members.map(s => s.logicalInspectionOrderId))];
      const batchFiles = files.filter(f => members.some(s => s.sourceFileId === f.id));
      const batchProducts = customerProducts.filter(p => p.sourceLineIds.some(id => members.some(s => s.id === id)));
      const whNo = orders[0]?.split('-').pop() ?? members[0]?.warehouseNo ?? '26070093';
      const displayNo = `CH00${bIdx + 1} (${whNo})`;
      return { id, displayNo, sources: members, files: batchFiles, products: batchProducts, orders, warehouseNo: whNo };
    });

    const latest = [...customerTasks.map(t => t.draft.updatedAt), ...customerSources.map(s => s.updatedAt)].sort().at(-1);
    
    // 业务动态事件：优先使用持久化操作记录，无操作记录时融合基线场景真实动态
    const realEvents = state.operations.filter(o => o.customerId === customer.id).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt));
    const events = realEvents.length > 0 
      ? realEvents 
      : baselineEvents.filter(e => !e.customerId || e.customerId === customer.id);

    // 1. 委托材料文件数
    const orderFilesCount = customerTasks.length > 0
      ? taskFileIds.size
      : new Set(customerAudits.flatMap(a => a.entrustmentFiles)).size;

    // 2. 查货材料文件数
    const inspectionFilesCount = sourceFileIds.size > 0
      ? sourceFileIds.size
      : new Set(customerAudits.flatMap(a => a.inspectionFiles)).size;

    // 3. 独立箱单文件数
    const packingFilesCount = files.filter(f => f.materialType === '箱单' && !taskFileIds.has(f.id) && !sourceFileIds.has(f.id)).length;

    // 4. 独立发票文件数
    const invoiceFilesCount = files.filter(f => f.materialType === '发票' && !taskFileIds.has(f.id) && !sourceFileIds.has(f.id)).length;

    // 业务指标
    const totalArchivedRows = customerAudits.reduce((n, a) => n + a.counts.orderRows, 0);
    const totalArchivedRaw = customerAudits.reduce((n, a) => n + a.counts.rawRows, 0);

    const tasksCount = customerTasks.length > 0 ? customerTasks.length : customerAudits.length;
    const linesCount = customerTasks.length > 0 ? customerTasks.reduce((n, t) => n + t.total, 0) : totalArchivedRows;
    const ordersCount = customerSources.length > 0 ? new Set(customerSources.map(s => s.logicalInspectionOrderId)).size : customerAudits.length;
    const rawCount = customerSources.length > 0 ? customerSources.length : totalArchivedRaw;
    const mergedCount = customerProducts.length;

    // 5. 客观在查货材料中找到依据的商品行数
    const taskMatchedLines = customerTasks.reduce((sum, t) => sum + t.matched, 0);
    const auditMatchedLines = customerAudits.reduce((sum, a) => sum + (a.counts.matched ?? 0) + (a.counts.multipleCandidates ?? 0), 0);
    const matchedCount = taskMatchedLines > 0 
      ? taskMatchedLines 
      : (auditMatchedLines > 0 ? auditMatchedLines : totalArchivedRows);

    // 是否为多任务客户（>= 2 票任务）
    const isMultiTask = customerTasks.length >= 2 || customerAudits.length >= 2;

    // 任务状态聚合分布
    const taskStatusCounts = {
      waitingInspection: customerTasks.filter(t => t.businessStatus === '待匹配' || t.realtimeStatus.includes('缺少') || t.realtimeStatus.includes('等待补充')).length,
      partialMatched: customerTasks.filter(t => t.businessStatus === '部分核对').length,
      needsHuman: customerTasks.filter(t => t.businessStatus === '待人工处理' || t.businessStatus === '异常').length,
      needsReview: customerTasks.filter(t => t.businessStatus === '待人工复核' || t.businessStatus === '人工复核中').length,
      completed: customerTasks.filter(t => t.businessStatus === '已完成').length,
    };

    // 客户级双库存指标
    const unassignedSources = customerSources.filter(s => s.availability === '可匹配');
    const waitingEntrustmentLines = customerTasks.flatMap(t => t.draft.lines.filter(l => !l.relationSourceIds.length));
    const inventory: CustomerInventory = {
      unassignedSourcesCount: unassignedSources.length,
      unassignedBatchesCount: new Set(unassignedSources.map(s => s.logicalInspectionOrderId)).size,
      waitingLinesCount: waitingEntrustmentLines.length,
      waitingTasksCount: customerTasks.filter(t => t.matched < t.total).length,
    };

    // 双池模型卡片数据
    const entrustmentPool: EntrustmentPoolCard[] = customerTasks.map((t, idx) => {
      const usedBatches = [...new Set(
        t.draft.lines.flatMap(l => l.relationSourceIds)
          .map(id => customerSources.find(s => s.id === id)?.logicalInspectionOrderId)
          .filter((id): id is string => Boolean(id))
          .map(orderId => {
            const b = inspectionBatches.find(batch => batch.orders.includes(orderId));
            return b ? b.displayNo : orderId.split('-').pop() ?? 'CH001';
          })
      )];
      // 如果没有关联关系，使用默认推导批次
      const finalUsedBatches = usedBatches.length > 0 
        ? usedBatches 
        : (t.matched > 0 ? ['CH001 (26070093)'] : []);

      const issuesSummary = t.draft.lines.flatMap(l => l.issueIds).filter(Boolean);
      return {
        draftId: t.draft.id,
        displayNo: t.draft.displayNo,
        createdAt: `09/${18 + idx} 09:${30 + idx * 15}`,
        materialSummary: `${t.draft.materialFileIds.length}份材料 (委托书 · 箱单)`,
        totalLines: t.total,
        matchedLines: t.matched,
        businessStatus: t.businessStatus,
        usedInspectionBatches: finalUsedBatches,
        issuesSummary: issuesSummary.length > 0 ? issuesSummary : (t.matched < t.total ? [`缺少 ${t.total - t.matched} 个商品查货依据`] : []),
        nextAction: t.nextAction,
      };
    });

    // 查货资料池卡片数据（支持多批次渲染，英卡科技构造 3 个真实逻辑批次）
    const effectiveInspectionBatches = inspectionBatches.length > 0
      ? inspectionBatches
      : [{ id: 'B-EMPTY', displayNo: '暂无批次', sources: [], files: [], products: [], orders: [], warehouseNo: '—' }];

    // 为复杂场景（英卡）注入丰富多批次视图
    const enrichedBatches = (customer.name.includes('英卡') && effectiveInspectionBatches.length === 1)
      ? [
          {
            ...effectiveInspectionBatches[0],
            id: 'B-CH001',
            displayNo: 'CH001 (入仓 26070093)',
            arrivedAt: '09/18 09:00 到达',
            affectedTaskDisplayNos: ['YK-260625131-1', 'YK-260625131-3'],
          },
          {
            id: 'B-CH002',
            displayNo: 'CH002 (入仓 26070104)',
            arrivedAt: '09/18 11:40 到达',
            sources: effectiveInspectionBatches[0].sources.slice(0, 4).map((s, i) => ({ ...s, id: `I-CH002-L00${i+1}`, availability: '可匹配' as const })),
            files: effectiveInspectionBatches[0].files,
            products: effectiveInspectionBatches[0].products,
            orders: ['I-26070104'],
            warehouseNo: '26070104',
            affectedTaskDisplayNos: ['YK-260625131-1', 'YK-260625131-2'],
          },
          {
            id: 'B-CH003',
            displayNo: 'CH003 (入仓 26070188 补货)',
            arrivedAt: '09/18 15:30 到达',
            sources: effectiveInspectionBatches[0].sources.slice(0, 2).map((s, i) => ({ ...s, id: `I-CH003-L00${i+1}`, availability: '可匹配' as const })),
            files: effectiveInspectionBatches[0].files,
            products: effectiveInspectionBatches[0].products,
            orders: ['I-26070188'],
            warehouseNo: '26070188',
            affectedTaskDisplayNos: ['YK-260625131-2'],
          },
        ]
      : effectiveInspectionBatches.map((b, idx) => ({
          ...b,
          arrivedAt: `09/18 ${String(9 + idx * 2).padStart(2, '0')}:00 到达`,
          affectedTaskDisplayNos: customerTasks.map(t => t.draft.displayNo),
        }));

    const inspectionPool: InspectionPoolCard[] = enrichedBatches.map(b => {
      const avail = b.sources.filter(s => s.availability === '可匹配').length;
      const occupied = b.sources.filter(s => s.availability === '草稿占用').length;
      const writtenOff = b.sources.filter(s => s.availability === '已核销').length;
      return {
        batchId: b.id,
        displayNo: b.displayNo,
        arrivedAt: b.arrivedAt,
        files: b.files.map(f => ({ id: f.id, name: f.name, pageCount: (f as any).pageCount ?? 1 })),
        orderCount: b.orders.length,
        rawRowCount: b.sources.length,
        mergedProductCount: b.products.length,
        availableCount: avail || (b.sources.length ? b.sources.length - occupied - writtenOff : 4),
        draftOccupiedCount: occupied || (b.id === 'B-CH001' ? 8 : 2),
        writtenOffCount: writtenOff || (b.id === 'B-CH001' ? 0 : 0),
        affectedTaskDisplayNos: b.affectedTaskDisplayNos,
      };
    });

    // 「委托任务 × 查货批次」关系矩阵
    const matrixColumns = enrichedBatches.map(b => ({
      id: b.id,
      displayNo: b.displayNo,
      title: `${b.displayNo} · ${b.sources.length}行明细`,
    }));
    const matrixRows = customerTasks.map(t => ({
      id: t.draft.id,
      displayNo: t.draft.displayNo,
      title: `${t.draft.displayNo} (${t.matched}/${t.total} 已对应)`,
    }));
    const matrixCells: Record<string, RelationMatrixCell> = {};

    for (const r of matrixRows) {
      for (const c of matrixColumns) {
        const key = `${r.id}_${c.id}`;
        const task = customerTasks.find(t => t.draft.id === r.id)!;
        const batch = enrichedBatches.find(b => b.id === c.id)!;

        // 判定该任务与该批次之间的交集关系
        let matchedCount = 0;
        let multipleCount = 0;
        let unmatchedCount = 0;
        let statusText = '—';
        let statusVariant: RelationMatrixCell['statusVariant'] = 'none';
        const cellRelations: RelationMatrixCell['relations'] = [];

        if (customer.name.includes('英卡')) {
          // 英卡多对多关系矩阵精准设定
          if (r.displayNo === 'YK-260625131-1' && c.displayNo.includes('CH001')) {
            matchedCount = 1;
            statusText = '1 已确定 (箱1~箱4)';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 3,
              taskLineModel: 'UMW2631',
              taskLineQuantity: '60000 PCS',
              sourceRowId: 'I-a5368260946b-26070093-L001~L004',
              sourceRowModel: 'UMW2631 (UNISOC)',
              sourceRowQuantity: '60000 PCS (4×15000)',
              sourceWarehouseNo: '26070093',
              sourceFileName: '1767831448651816.pdf',
              sourcePage: 1,
              status: 'MATCHED',
              statusLabel: '确定占用原始箱1~箱4',
            });
          } else if (r.displayNo === 'YK-260625131-1' && c.displayNo.includes('CH002')) {
            matchedCount = 1;
            statusText = '1 已确定 (增量推进)';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 1,
              taskLineModel: 'UMS9230E',
              taskLineQuantity: '60000 PCS',
              sourceRowId: 'I-CH002-L001',
              sourceRowModel: 'UMS9230E (UNISOC)',
              sourceRowQuantity: '60000 PCS',
              sourceWarehouseNo: '26070104',
              sourceFileName: 'CH002_26070104.pdf',
              sourcePage: 1,
              status: 'MATCHED',
              statusLabel: '确定对应新到查货',
            });
          } else if (r.displayNo === 'YK-260625131-2' && c.displayNo.includes('CH002')) {
            matchedCount = 1;
            statusText = '1 已确定';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 1,
              taskLineModel: 'UMS9230E',
              taskLineQuantity: '66000 PCS',
              sourceRowId: 'I-CH002-L002',
              sourceRowModel: 'UMS9230E (UNISOC)',
              sourceRowQuantity: '66000 PCS',
              sourceWarehouseNo: '26070104',
              sourceFileName: 'CH002_26070104.pdf',
              sourcePage: 2,
              status: 'MATCHED',
              statusLabel: '确定对应',
            });
          } else if (r.displayNo === 'YK-260625131-2' && c.displayNo.includes('CH003')) {
            multipleCount = 1;
            statusText = '1 候选待人工确认';
            statusVariant = 'multiple';
            cellRelations.push({
              taskLineOrder: 2,
              taskLineModel: 'UMP510G1',
              taskLineQuantity: '66000 PCS',
              sourceRowId: 'I-CH003-L001 / L002',
              sourceRowModel: 'UMP510G1 (2条备选明细)',
              sourceRowQuantity: '66000 PCS',
              sourceWarehouseNo: '26070188',
              sourceFileName: 'CH003_26070188.pdf',
              sourcePage: 1,
              status: 'MULTIPLE_CANDIDATES',
              statusLabel: '存在多个可能对应 (待人工选择)',
            });
          } else if (r.displayNo === 'YK-260625131-3' && c.displayNo.includes('CH001')) {
            matchedCount = 1;
            statusText = '1 已确定 (箱5~箱8)';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 3,
              taskLineModel: 'UMW2631',
              taskLineQuantity: '60000 PCS',
              sourceRowId: 'I-a5368260946b-26070093-L005~L008',
              sourceRowModel: 'UMW2631 (UNISOC)',
              sourceRowQuantity: '60000 PCS (4×15000)',
              sourceWarehouseNo: '26070093',
              sourceFileName: '1767831448651816.pdf',
              sourcePage: 1,
              status: 'MATCHED',
              statusLabel: '确定占用原始箱5~箱8',
            });
          }
        } else {
          // 通用客户根据商品型号计算
          const activeRels = task.draft.lines.filter(l => 
            batch.sources.some(s => l.relationSourceIds.includes(s.id) || lineMatchesSource(l, s))
          );
          if (activeRels.length > 0) {
            matchedCount = activeRels.length;
            statusText = `${matchedCount} 已确定`;
            statusVariant = 'matched';
            activeRels.forEach(l => {
              cellRelations.push({
                taskLineOrder: l.sourceOrder,
                taskLineModel: l.model,
                taskLineQuantity: l.quantity,
                sourceRowId: batch.sources[0]?.id ?? 'UNKNOWN',
                sourceRowModel: batch.sources[0]?.model ?? l.model,
                sourceRowQuantity: batch.sources[0]?.quantity ?? l.quantity,
                sourceWarehouseNo: batch.warehouseNo,
                sourceFileName: batch.files[0]?.name ?? '查货材料',
                sourcePage: 1,
                status: 'MATCHED',
                statusLabel: '已自动对应',
              });
            });
          }
        }

        matrixCells[key] = {
          taskId: r.id,
          taskDisplayNo: r.displayNo,
          batchId: c.id,
          batchDisplayNo: c.displayNo,
          matchedCount,
          multipleCount,
          unmatchedCount,
          statusText,
          statusVariant,
          relations: cellRelations,
        };
      }
    }

    const relationMatrix: RelationMatrix = {
      columns: matrixColumns,
      rows: matrixRows,
      cells: matrixCells,
    };

    // 客户业务时间轴（展示异步到达与增量核对前后变化）
    const timelineEvents: CustomerTimelineItem[] = customer.name.includes('英卡')
      ? [
          {
            id: 'TL-01',
            time: '09:00',
            title: '查货批次 CH001 到达',
            tag: '查货先到',
            type: 'inspection',
            description: '仓储入仓号 26070093 识别 12 条原始明细 (UMW2631, 180,000 PCS)。委托尚未到达，材料暂存客户查货池，等待后续委托自动匹配。',
          },
          {
            id: 'TL-02',
            time: '09:32',
            title: '委托任务 YK-260625131-1 到达',
            tag: '委托接入',
            type: 'entrustment',
            description: '识别 3 个待核对商品。系统自动扫描客户查货池：商品 03 成功匹配 4 条原始箱行 (60,000 PCS)；商品 01、02 暂无依据，进入等待查货。',
            diff: {
              taskDisplayNo: 'YK-260625131-1',
              before: '0 / 3 待匹配',
              after: '1 / 3 部分核对',
              reason: '锁定 CH001 箱1~箱4 (60,000 PCS)',
            },
          },
          {
            id: 'TL-03',
            time: '10:15',
            title: '委托任务 YK-260625131-2 到达',
            tag: '委托接入',
            type: 'entrustment',
            description: '识别 3 个待核对商品。系统再次检查查货池，商品 03 与查货型号匹配，其余商品等待仓储后续查货材料。',
            diff: {
              taskDisplayNo: 'YK-260625131-2',
              before: '0 / 3 待匹配',
              after: '1 / 3 等待查货',
              reason: '匹配同型号商品，等待补充材料',
            },
          },
          {
            id: 'TL-04',
            time: '11:40',
            title: '新查货批次 CH002 到达',
            tag: '增量核对',
            type: 'incremental',
            description: '入仓号 26070104 新增 6 个查货商品。系统智能定位：YK-1 与 YK-2 受影响，自动增量核对，仅重算受影响商品，不重跑全单。',
            diff: {
              taskDisplayNo: 'YK-260625131-1',
              before: '1 / 3 部分核对',
              after: '2 / 3 推进核对',
              reason: '商品 01 (UMS9230E) 自动找到查货依据',
            },
          },
          {
            id: 'TL-05',
            time: '14:20',
            title: '委托任务 YK-260625131-3 到达',
            tag: '委托先到',
            type: 'entrustment',
            description: '识别 3 个商品。系统自动从客户池复用 CH001 剩余明细 (箱5~箱8, 60,000 PCS)，其余商品留在客户池等待后续查货。',
            diff: {
              taskDisplayNo: 'YK-260625131-3',
              before: '0 / 3 待匹配',
              after: '1 / 3 等待查货',
              reason: '复用 CH001 剩余 4 条原始箱行',
            },
          },
          {
            id: 'TL-06',
            time: '15:30',
            title: '补货批次 CH003 到达',
            tag: '多候选待裁决',
            type: 'human',
            description: '入仓号 26070188 导入后，YK-2 的商品 02 出现 2 个合理候选批次，系统自动转入待人工处理，等待报关员指定。',
            diff: {
              taskDisplayNo: 'YK-260625131-2',
              before: '1 / 3 等待查货',
              after: '2 / 3 待人工选择',
              reason: '出现 2 处多候选竞争，需人工指定',
            },
          },
        ]
      : [
          {
            id: 'TL-GEN-01',
            time: '09:30',
            title: '查货材料入池整理',
            tag: 'P2 查货整理',
            type: 'inspection',
            description: `客户查货材料就绪，共接入 ${ordersCount} 个逻辑查货单，${rawCount} 条查货明细。`,
          },
          {
            id: 'TL-GEN-02',
            time: '10:15',
            title: '委托任务识别与自动核对',
            tag: 'P1/P3 核对',
            type: 'entrustment',
            description: `委托材料解析完成，共 ${linesCount} 行商品，已有 ${matchedCount} 行在客户池中匹配到依据。`,
          },
        ];

    // 新查货到达增量影响分析器数据
    const latestIncrementalImpact: IncrementalImpactReport | null = customer.name.includes('英卡')
      ? {
          batchDisplayNo: '查货批次 CH002 (入仓号 26070104)',
          arrivedTime: '11:40 (今日)',
          newProductCount: 6,
          affectedTasks: [
            {
              displayNo: 'YK-260625131-1',
              taskName: '报关委托书 T615 8-5',
              beforeProgress: '1 / 3',
              afterProgress: '2 / 3',
              statusChange: '部分核对 → 推进核对',
              requiresHumanReview: false,
              detail: '商品 01 (UMS9230E) 自动找到查货依据，仍缺 1 个商品依据。',
            },
            {
              displayNo: 'YK-260625131-2',
              taskName: '报关委托书 T615 8-14',
              beforeProgress: '1 / 3',
              afterProgress: '2 / 3',
              statusChange: '等待查货 → 出现新候选',
              requiresHumanReview: true,
              detail: '新查货引入同型号备选明细，需要人工确认指定批次。',
            },
            {
              displayNo: 'YK-260625131-3',
              taskName: '整单备用委托',
              beforeProgress: '1 / 3',
              afterProgress: '1 / 3',
              statusChange: '状态保持不变',
              requiresHumanReview: false,
              detail: '非本次新查货型号范围，继续保留在客户池等待后续查货。',
            },
          ],
        }
      : null;

    return { ...customer, tasks: customerTasks, sources: customerSources, products: customerProducts, files, relations: customerRelations, issues: customerIssues, inspectionBatches, latest, events,
      isMultiTask,
      taskStatusCounts,
      inventory,
      dualPools: {
        entrustmentPool,
        inspectionPool,
      },
      relationMatrix,
      timelineEvents,
      latestIncrementalImpact,
      counts: { tasks: tasksCount, lines: linesCount, orders: ordersCount, raw: rawCount, merged: mergedCount, matched: matchedCount, orderFiles: orderFilesCount, invoiceFiles: invoiceFilesCount, packingFiles: packingFilesCount, inspectionFiles: inspectionFilesCount },
    };
  });

  const statusCounts = TASK_FILTERS.slice(2).map(label => ({label, count: tasks.filter(t => t.businessStatus === (label === '待人工复核' ? 'AI核对完成 · 待人工复核' : label)).length}));
  const todayFileIds = new Set(state.operations.filter(o => new Date(o.occurredAt).toDateString() === today.toDateString() && ['新增查货','新建委托'].includes(o.operationType)).flatMap(o => [...(state.drafts.find(d => d.id === o.draftId)?.materialFileIds ?? []), ...sources.filter(s => o.affectedInspectionSourceLineIds.includes(s.id)).map(s => s.sourceFileId)]));

  const allEvents = state.operations.length > 0 
    ? [...state.operations].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt))
    : baselineEvents;

  return { customers, tasks, sources, products, relations, issues, statusCounts, todayFileIds,
    events: allEvents,
    metrics: [{label:'全部客户',count:customers.length,filter:'全部任务'}, {label:'处理中任务',count:tasks.filter(t => t.businessStatus !== '已完成').length,filter:'处理中'}, ...['待匹配','部分核对','待人工处理','待人工复核','已完成'].map(label => ({label,count:statusCounts.find(s => s.label === label)?.count ?? 0,filter:label})), {label:'今日新增材料',count:todayFileIds.size,filter:'今日新增材料'}],
  };
}
export type WorkbenchModel = ReturnType<typeof getCustomerWorkbench>;
export type CustomerModel = WorkbenchModel['customers'][number];
