import { getMergedPoolProducts, DRAFT_SAMPLE_DISPLAY_MAP, type DemoState } from './demo-store';
import { getTaskSummary } from './workspace-status';
import { getFieldRows } from './workbench-model';
import baselineFiles from '../demo-generated/mock/source-files.json';
import batches from '../demo-generated/mock/material-batches.json';
import fixture from '../demo-generated/mock/real-calibration-sc08.json';
import puyiFixture from '../demo-generated/mock/real-calibration-26shpyd056.json';

import auditIndex from '../demo-generated/mock/model-audit-index.json';
import realCommodityReconciliationsJson from '../demo-generated/mock/real-sample-commodity-reconciliations.json';
import ordersJson from '../demo-generated/mock/inspection-orders.json';

export const CUSTOMER_SAMPLE_IDS_MAP: Record<string, string[]> = {
  'C-132ffbd28c07': ['26SHPYD056'],
  'C-66be07d6cabe': ['2026(DG)ZW001', '2026(DG)ZW003', '2026(DG)ZW050'],
  'C-e0cb675e9f1d': ['2026AG001'],
  'C-7ad6719f6d43': ['2026ACSY003'],
  'C-80d0a4f9a7ac': ['2026BMH001'],
  'C-b212996858bd': ['英卡-抽+整'],
  'C-0a93054667fc': ['多对多样例'],
  'C-7a1e673169bf': ['2026CNKJ001'],
  'C-89aa660b4b46': ['2025YBT010-2'],
};

export const TASK_FILTERS = ['全部任务', '处理中', '待解析', '待匹配', '部分核对', '待人工处理', '待人工复核', '人工复核中', '已完成', '异常'] as const;

export function normalizeModel(model: string | null | undefined): string {
  if (!model) return '';
  return model
    .toUpperCase()
    .replace(/[#\-_/\\()（）\s]/g, '')
    .trim();
}

export type ModelRelationLevel =
  | 'EXACT_MODEL'                 // 已自动对应
  | 'CORE_MODEL_WITH_AFFIX_DIFF'  // 已自动对应 · 型号写法有差异
  | 'MULTIPLE_MODEL_CANDIDATES'   // 需要人工选择
  | 'NO_MODEL_CANDIDATE'          // 暂无查货依据
  | 'MODEL_CONFLICT';             // 存在明确冲突

export interface ModelAffixDiff {
  hasDiff: boolean;
  diffType: 'none' | 'prefix' | 'suffix' | 'complex';
  coreModel: string;
  prefix?: string;
  suffix?: string;
  entrustmentModel: string;
  inspectionModel: string;
  explanation: string;
}

export function analyzeModelAffixDiff(
  entrustModel?: string | null,
  inspectModel?: string | null
): ModelAffixDiff {
  const e = (entrustModel || '').trim();
  const i = (inspectModel || '').trim();

  if (!e || !i) {
    return {
      hasDiff: false,
      diffType: 'none',
      coreModel: e || i,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: '—',
    };
  }

  // 完全一致（忽略大小写与首尾空白）
  if (e.toUpperCase() === i.toUpperCase()) {
    return {
      hasDiff: false,
      diffType: 'none',
      coreModel: e,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: '核心型号完全一致',
    };
  }

  const eNorm = normalizeModel(e);
  const iNorm = normalizeModel(i);
  if (eNorm === iNorm && eNorm.length > 0) {
    return {
      hasDiff: false,
      diffType: 'none',
      coreModel: e,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: '标准化型号一致',
    };
  }

  // 1. 查货多后缀：例如 74HC00PW-Q100 vs 74HC00PW-Q100,118
  if (i.toUpperCase().startsWith(e.toUpperCase())) {
    const diffPart = i.slice(e.length);
    return {
      hasDiff: true,
      diffType: 'suffix',
      coreModel: e,
      suffix: diffPart,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: `查货型号多出后缀 [${diffPart}]`,
    };
  }

  // 2. 委托多后缀
  if (e.toUpperCase().startsWith(i.toUpperCase())) {
    const diffPart = e.slice(i.length);
    return {
      hasDiff: true,
      diffType: 'suffix',
      coreModel: i,
      suffix: diffPart,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: `委托型号多出后缀 [${diffPart}]`,
    };
  }

  // 3. 查货多前缀：例如 ABC123 vs XX-ABC123
  if (i.toUpperCase().endsWith(e.toUpperCase())) {
    const diffPart = i.slice(0, i.length - e.length);
    return {
      hasDiff: true,
      diffType: 'prefix',
      coreModel: e,
      prefix: diffPart,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: `查货型号多出前缀 [${diffPart}]`,
    };
  }

  // 4. 委托多前缀：例如 XX-ABC123 vs ABC123
  if (e.toUpperCase().endsWith(i.toUpperCase())) {
    const diffPart = e.slice(0, e.length - i.length);
    return {
      hasDiff: true,
      diffType: 'prefix',
      coreModel: i,
      prefix: diffPart,
      entrustmentModel: e,
      inspectionModel: i,
      explanation: `委托型号多出前缀 [${diffPart}]`,
    };
  }

  // 5. 符号规范化后比对前后缀
  if (eNorm.length >= 3 && iNorm.length >= 3) {
    if (iNorm.startsWith(eNorm)) {
      const suffixNorm = iNorm.slice(eNorm.length);
      return {
        hasDiff: true,
        diffType: 'suffix',
        coreModel: e,
        suffix: suffixNorm,
        entrustmentModel: e,
        inspectionModel: i,
        explanation: `查货型号多出后缀 [${suffixNorm}]`,
      };
    }
    if (eNorm.startsWith(iNorm)) {
      const suffixNorm = eNorm.slice(iNorm.length);
      return {
        hasDiff: true,
        diffType: 'suffix',
        coreModel: i,
        suffix: suffixNorm,
        entrustmentModel: e,
        inspectionModel: i,
        explanation: `委托型号多出后缀 [${suffixNorm}]`,
      };
    }
    if (iNorm.endsWith(eNorm)) {
      const prefixNorm = iNorm.slice(0, iNorm.length - eNorm.length);
      return {
        hasDiff: true,
        diffType: 'prefix',
        coreModel: e,
        prefix: prefixNorm,
        entrustmentModel: e,
        inspectionModel: i,
        explanation: `查货型号多出前缀 [${prefixNorm}]`,
      };
    }
    if (eNorm.endsWith(iNorm)) {
      const prefixNorm = eNorm.slice(0, eNorm.length - iNorm.length);
      return {
        hasDiff: true,
        diffType: 'prefix',
        coreModel: i,
        prefix: prefixNorm,
        entrustmentModel: e,
        inspectionModel: i,
        explanation: `委托型号多出前缀 [${prefixNorm}]`,
      };
    }
  }

  return {
    hasDiff: true,
    diffType: 'complex',
    coreModel: e,
    entrustmentModel: e,
    inspectionModel: i,
    explanation: '型号主体存在明显冲突',
  };
}

export interface CustomerCommodityItem {
  id: string;
  taskDisplayNo: string;
  taskDraftId: string;
  lineOrder: number;
  lineId: string;
  entrustmentModel: string;
  entrustmentBrand?: string;
  entrustmentOrigin?: string;
  entrustmentQuantity?: string;
  entrustmentProductName?: string;
  inspectionModel: string | null;
  inspectionBrand?: string;
  inspectionOrigin?: string;
  inspectionQuantity?: string;
  sourceBatch: string;
  sourceWarehouseNo: string;
  sourceFileName: string;
  sourcePage?: number | null;
  sourceRowOrder?: number | null;
  sourceBoxNo?: string | null;
  relationLevel: ModelRelationLevel;
  statusText: string;
  statusVariant: 'green' | 'yellow' | 'orange' | 'gray' | 'red';
  affixDiff?: ModelAffixDiff;
  noticeText: string;
  candidateCount?: number;
  candidates?: Array<{
    model: string;
    batchDisplayNo: string;
    warehouseNo: string;
    fileName: string;
    page: number | null;
    sourceRowId: string;
  }>;
  judgmentEvidence: string[];
  isMultiBatchSource?: boolean;
  sourceBatches?: Array<{
    batchDisplayNo: string;
    warehouseNo: string;
    fileName: string;
    page?: number | null;
    rowOrder?: number | null;
    boxNo?: string | null;
    rawRowId?: string;
    quantity?: string;
    isIncrement?: boolean;
    note?: string;
  }>;
}

export interface CommodityReconciliationSummary {
  totalCount: number;
  exactCount: number;      // 🟢 已自动对应
  affixDiffCount: number;  // 🟡 已自动对应 · 有提醒
  multipleCount: number;   // 🟠 需要人工选择
  noCandidateCount: number;// ⚪ 暂无查货依据
  conflictCount: number;   // 🔴 存在明确冲突
  actionRequiredItems: CustomerCommodityItem[]; // multipleCount + conflictCount
  items: CustomerCommodityItem[];
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
  usedInspectionBatches: string[]; // 兼容保留
  confirmedInspectionBatches: string[]; // 已确认使用批次 (如 CH001、CH002)
  candidateInspectionBatches: string[]; // 候选批次 (如 CH003)
  missingInspectionCount: number;       // 仍缺查货商品 (如 1 个)
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
  confirmedTaskItems: string[];  // 已实际提供依据 (如 YK-1 / 商品01 (UMW2631))
  candidateTaskItems: string[];  // 候选关联 (如 YK-2 / 商品03 (ABC123))
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
  commoditySummary?: string; // 明确显示具体型号，如 "UMW2631 ✓ (箱1~4)"
  commodityItems?: Array<{ model: string; status: 'matched' | 'multiple' | 'affix' | 'none'; note?: string }>;
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

export interface BatchRelationQuestionItem {
  id: string;
  question: string;
  summary: string;
  details: Array<{
    label: string;
    items: string[];
  }>;
  statusTag?: string;
  statusVariant?: 'green' | 'blue' | 'orange';
}

export function getBatchRelationQuestions(customer: any): BatchRelationQuestionItem[] {
  if (customer.name && customer.name.includes('英卡')) {
    return [
      {
        id: 'Q1',
        question: 'CH001 被谁用了？',
        summary: '共 12 条查货原始明细，8 条已实际提供依据，4 条当前空闲可继续匹配',
        details: [
          {
            label: '已实际提供依据',
            items: [
              'YK-260625131-1 / 商品 01 (UMW2631) · 占用箱001~箱004 (60,000 PCS，与 CH002 共同提供依据)',
              'YK-260625131-3 / 商品 01 (UMW2631) · 独占占用箱005~箱008 (60,000 PCS)',
              'YK-260625131-3 / 商品 02 (ZX001) · 自动对应匹配 (30,000 PCS)',
            ],
          },
          {
            label: '仍可继续匹配',
            items: ['箱009~箱012 空闲 (共 60,000 PCS 可供新到委托任务分配)'],
          },
        ],
        statusTag: '部分锁定 · 部分空闲',
        statusVariant: 'blue',
      },
      {
        id: 'Q2',
        question: 'YK-1 用了哪些批次？',
        summary: '共 3 个待核对商品：2 个已有可靠依据（其中 UMW2631 跨批次共同覆盖），1 个暂无查货依据',
        details: [
          {
            label: '已确认使用批次',
            items: [
              'CH001 (入仓 26070093) + CH002 (入仓 26070104) ── 共同为 商品 01 (UMW2631) 提供依据',
              'CH002 (入仓 26070104) ── 独立为 商品 02 (UMS9230E) 提供依据',
            ],
          },
          {
            label: '仍等待查货材料',
            items: ['商品 03 (ABC102) 暂无可靠查货依据，系统处于持续监听中'],
          },
        ],
        statusTag: '跨 2 批次提供依据',
        statusVariant: 'green',
      },
      {
        id: 'Q3',
        question: '新批次 CH003 来了以后影响谁？',
        summary: '09/18 15:30 补货入仓，精准影响 YK-260625131-2，产生多候选需人工选择',
        details: [
          {
            label: '增量变更过程',
            items: [
              '受影响任务：YK-260625131-2 (商品 03 · ABC123)',
              '新增查货候选：CH003 识别出 ABC123-B，与 CH002 中已有的 ABC123-A 规格同级',
              '系统影响判定：由原来单一候选变为两个同级候选，转为「需要人工选择」',
            ],
          },
        ],
        statusTag: '增量输入触发待办',
        statusVariant: 'orange',
      },
    ];
  }

  // 默认通用结构
  return [
    {
      id: 'Q1',
      question: '当前查货批次被谁使用？',
      summary: '系统根据唯一料号与标准化型号自动绑定受影响委托单据',
      details: [
        { label: '已匹配委托', items: (customer.tasks || []).filter((t: any) => t.matched > 0).map((t: any) => `${t.draft.displayNo} (${t.matched}项商品)`) },
      ],
      statusTag: '自动跟踪',
      statusVariant: 'blue',
    },
    {
      id: 'Q2',
      question: '各委托任务分别使用了哪些查货依据？',
      summary: '依据材料入仓顺序与条目唯一性锁定，支持单商品多批次覆盖',
      details: [
        { label: '任务使用情况', items: (customer.tasks || []).map((t: any) => `${t.draft.displayNo}: 已匹配 ${t.matched}/${t.total}`) },
      ],
      statusTag: '增量流转',
      statusVariant: 'green',
    },
    {
      id: 'Q3',
      question: '新材料到达后系统如何增量更新？',
      summary: '仅触发关联商品局部重算，不影响已复核确认为完毕的历史数据',
      details: [
        { label: '增量策略', items: ['增量查货不重置人工已确认状态', '多候选自动聚合并触发待办提醒'] },
      ],
      statusTag: '局部重算',
      statusVariant: 'orange',
    },
  ];
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

export function generateCommodityReconciliationSummary(
  customer: any,
  customerTasks: any[],
  customerSources: any[],
  customerRelations: any[],
  enrichedBatches: any[],
  state: DemoState
): CommodityReconciliationSummary {
  // 1. 优先根据当前客户与任务映射提取真实样本校准数据
  const sampleMap = realCommodityReconciliationsJson as Record<string, any>;
  const customerSampleIds = CUSTOMER_SAMPLE_IDS_MAP[customer.id] || [];

  let realItems: CustomerCommodityItem[] = [];

  // 如果智微智能包含多个子任务（ZW001, ZW003, ZW050）
  if (customerSampleIds.length > 1) {
    for (const sId of customerSampleIds) {
      if (sampleMap[sId]?.items) {
        realItems.push(...(sampleMap[sId].items as CustomerCommodityItem[]));
      }
    }
  } else if (customerSampleIds.length === 1 && sampleMap[customerSampleIds[0]]?.items) {
    realItems = [...(sampleMap[customerSampleIds[0]].items as CustomerCommodityItem[])];
  } else {
    // 尝试通过 customerTasks 中的任务 displayNo 匹配
    for (const task of customerTasks) {
      const displayNo = task.draft.displayNo;
      if (sampleMap[displayNo]?.items) {
        realItems.push(...(sampleMap[displayNo].items as CustomerCommodityItem[]));
      }
    }
  }

  if (realItems.length > 0) {
    // 防御性深拷贝并同步真实 draftId（以便跳转）
    const taskDraftMap = new Map<string, string>();
    for (const task of customerTasks) {
      taskDraftMap.set(task.draft.displayNo, task.draft.id);
    }

    const items: CustomerCommodityItem[] = realItems.map((it) => {
      const matchedDraftId = taskDraftMap.get(it.taskDisplayNo) || it.taskDraftId;
      return {
        ...it,
        taskDraftId: matchedDraftId,
      };
    });

    const exactCount = items.filter((i) => i.relationLevel === 'EXACT_MODEL').length;
    const affixDiffCount = items.filter((i) => i.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF').length;
    const multipleCount = items.filter((i) => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES').length;
    const noCandidateCount = items.filter((i) => i.relationLevel === 'NO_MODEL_CANDIDATE').length;
    const conflictCount = items.filter((i) => i.relationLevel === 'MODEL_CONFLICT').length;
    const actionRequiredItems = items.filter(
      (i) => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || i.relationLevel === 'MODEL_CONFLICT'
    );

    return {
      totalCount: items.length,
      exactCount,
      affixDiffCount,
      multipleCount,
      noCandidateCount,
      conflictCount,
      actionRequiredItems,
      items,
    };
  }

  // 2. 通用动态回退生成逻辑（针对未来新上传的单据）
  const fallbackItems: CustomerCommodityItem[] = customerTasks.flatMap((task) =>
    task.draft.lines.map((line: any, idx: number) => {
      const model = line.fields?.型号 || line.model || `PROD-${idx + 1}`;
      const brand = line.fields?.品牌 || '—';
      const origin = line.fields?.产地 || '—';
      const qty = line.fields?.数量 ? `${line.fields.数量} PCS` : '—';
      const displayNo = task.draft.displayNo;

      const activeRel = state.relations.find((r) => r.active && r.entrustmentLineId === line.id);
      if (activeRel) {
        const source = customerSources.find((s) => activeRel.inspectionSourceLineIds.includes(s.id));
        const diff = analyzeModelAffixDiff(model, source?.fields?.型号 || source?.model);
        if (diff.hasDiff && (diff.diffType === 'prefix' || diff.diffType === 'suffix')) {
          return {
            id: `CI-${line.id}`,
            taskDisplayNo: displayNo,
            taskDraftId: task.draft.id,
            lineOrder: idx + 1,
            lineId: line.id,
            entrustmentModel: model,
            entrustmentBrand: brand,
            entrustmentOrigin: origin,
            entrustmentQuantity: qty,
            entrustmentProductName: line.fields?.品名 || '商品',
            inspectionModel: source?.fields?.型号 || source?.model || model,
            inspectionBrand: source?.fields?.品牌 || brand,
            inspectionOrigin: source?.fields?.产地 || origin,
            inspectionQuantity: source?.fields?.数量 ? `${source.fields.数量} PCS` : qty,
            sourceBatch: source?.warehouseNo ? `入仓 ${source.warehouseNo}` : 'CH001',
            sourceWarehouseNo: source?.warehouseNo || '—',
            sourceFileName: source?.sourceLocation?.position || '查货单.pdf',
            sourcePage: source?.sourceLocation?.page ?? 1,
            sourceRowOrder: idx + 1,
            relationLevel: 'CORE_MODEL_WITH_AFFIX_DIFF' as ModelRelationLevel,
            statusText: '已自动对应 · 型号写法有差异',
            statusVariant: 'yellow' as const,
            affixDiff: diff,
            noticeText: diff.explanation,
            judgmentEvidence: [
              `✓ 核心型号一致`,
              `⚠ ${diff.explanation}`,
              `已自动对应，最终复核时关注。`,
            ],
          };
        }
        return {
          id: `CI-${line.id}`,
          taskDisplayNo: displayNo,
          taskDraftId: task.draft.id,
          lineOrder: idx + 1,
          lineId: line.id,
          entrustmentModel: model,
          entrustmentBrand: brand,
          entrustmentOrigin: origin,
          entrustmentQuantity: qty,
          entrustmentProductName: line.fields?.品名 || '商品',
          inspectionModel: source?.fields?.型号 || source?.model || model,
          inspectionBrand: source?.fields?.品牌 || brand,
          inspectionOrigin: source?.fields?.产地 || origin,
          inspectionQuantity: source?.fields?.数量 ? `${source.fields.数量} PCS` : qty,
          sourceBatch: source?.warehouseNo ? `入仓 ${source.warehouseNo}` : 'CH001',
          sourceWarehouseNo: source?.warehouseNo || '—',
          sourceFileName: source?.sourceLocation?.position || '查货单.pdf',
          sourcePage: source?.sourceLocation?.page ?? 1,
          sourceRowOrder: idx + 1,
          relationLevel: 'EXACT_MODEL' as ModelRelationLevel,
          statusText: '已自动对应',
          statusVariant: 'green' as const,
          noticeText: '—',
          judgmentEvidence: ['✓ 标准化型号完全一致', '✓ 查货单对应原始行清晰明确'],
        };
      }

      // 未匹配
      return {
        id: `CI-${line.id}`,
        taskDisplayNo: displayNo,
        taskDraftId: task.draft.id,
        lineOrder: idx + 1,
        lineId: line.id,
        entrustmentModel: model,
        entrustmentBrand: brand,
        entrustmentOrigin: origin,
        entrustmentQuantity: qty,
        entrustmentProductName: line.fields?.品名 || '商品',
        inspectionModel: null,
        sourceBatch: '—',
        sourceWarehouseNo: '—',
        sourceFileName: '—',
        relationLevel: 'NO_MODEL_CANDIDATE' as ModelRelationLevel,
        statusText: '暂无查货依据',
        statusVariant: 'gray' as const,
        noticeText: '等待新查货',
        judgmentEvidence: ['当前客户查货池中暂无对应材料，等待后续查货导入。'],
      };
    })
  );

  const exactCount = fallbackItems.filter((i) => i.relationLevel === 'EXACT_MODEL').length;
  const affixDiffCount = fallbackItems.filter((i) => i.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF').length;
  const multipleCount = fallbackItems.filter((i) => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES').length;
  const noCandidateCount = fallbackItems.filter((i) => i.relationLevel === 'NO_MODEL_CANDIDATE').length;
  const conflictCount = fallbackItems.filter((i) => i.relationLevel === 'MODEL_CONFLICT').length;
  const actionRequiredItems = fallbackItems.filter(
    (i) => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || i.relationLevel === 'MODEL_CONFLICT'
  );

  return {
    totalCount: fallbackItems.length,
    exactCount,
    affixDiffCount,
    multipleCount,
    noCandidateCount,
    conflictCount,
    actionRequiredItems,
    items: fallbackItems,
  };
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
    const customerSampleIds = CUSTOMER_SAMPLE_IDS_MAP[customer.id] || [];
    const customerSources = sources.filter(s => {
      if (s.customerId === customer.id) return true;
      const order = ordersJson.find((o: any) => o.id === s.logicalInspectionOrderId);
      if (order && customerSampleIds.includes(order.sampleId)) return true;
      return false;
    });
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
      const whNo = orders[0]?.split('-').pop() ?? members[0]?.warehouseNo ?? '待定入仓号';
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
      let confirmedBatches: string[] = [];
      let candidateBatches: string[] = [];
      let missingCount = 0;

      if (customer.name && customer.name.includes('英卡')) {
        if (t.draft.displayNo === 'YK-260625131-1') {
          confirmedBatches = ['CH001 (入仓 26070093)', 'CH002 (入仓 26070104)'];
          candidateBatches = [];
          missingCount = 1;
        } else if (t.draft.displayNo === 'YK-260625131-2') {
          confirmedBatches = ['CH002 (入仓 26070104)', 'CH003 (入仓 26070188 补货)'];
          candidateBatches = ['CH002 (入仓 26070104)', 'CH003 (入仓 26070188 补货)'];
          missingCount = 0;
        } else {
          confirmedBatches = ['CH001 (入仓 26070093)'];
          candidateBatches = ['CH002 (入仓 26070104)', 'CH003 (入仓 26070188 补货)'];
          missingCount = 0;
        }
      } else {
        confirmedBatches = [...new Set(
          t.draft.lines.flatMap(l => l.relationSourceIds)
            .map(id => customerSources.find(s => s.id === id)?.logicalInspectionOrderId)
            .filter((id): id is string => Boolean(id))
            .map(orderId => {
              const b = inspectionBatches.find(batch => batch.orders.includes(orderId));
              return b ? b.displayNo : orderId.split('-').pop() ?? 'CH001';
            })
        )];
        missingCount = Math.max(0, t.total - t.matched);
      }

      const issuesSummary = t.draft.lines.flatMap(l => l.issueIds).filter(Boolean);
      return {
        draftId: t.draft.id,
        displayNo: t.draft.displayNo,
        createdAt: `09/${18 + idx} 09:${30 + idx * 15}`,
        materialSummary: `${t.draft.materialFileIds.length}份材料 (委托书 · 箱单)`,
        totalLines: t.total,
        matchedLines: t.matched,
        businessStatus: t.businessStatus,
        usedInspectionBatches: confirmedBatches,
        confirmedInspectionBatches: confirmedBatches,
        candidateInspectionBatches: candidateBatches,
        missingInspectionCount: missingCount,
        issuesSummary: issuesSummary.length > 0 ? issuesSummary : (missingCount > 0 ? [`缺少 ${missingCount} 个商品查货依据`] : []),
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
            ...effectiveInspectionBatches[0],
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
            ...effectiveInspectionBatches[0],
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

      let confirmedTasks: string[] = [];
      let candidateTasks: string[] = [];
      if (customer.name && customer.name.includes('英卡')) {
        if (b.id === 'B-CH001') {
          confirmedTasks = ['YK-1 / 商品01 (UMW2631 · 箱1~4)', 'YK-3 / 商品01 (UMW2631 · 箱5~8)', 'YK-3 / 商品02 (ZX001)'];
          candidateTasks = [];
        } else if (b.id === 'B-CH002') {
          confirmedTasks = ['YK-1 / 商品01 (UMW2631 · 增量推进)', 'YK-1 / 商品02 (UMS9230E)', 'YK-2 / 商品01 (ABC001)'];
          candidateTasks = ['YK-2 / 商品03 (ABC123)', 'YK-3 / 商品03 (ZX990)'];
        } else if (b.id === 'B-CH003') {
          confirmedTasks = ['YK-2 / 商品02 (74HC00PW-Q100)'];
          candidateTasks = ['YK-2 / 商品03 (ABC123)', 'YK-3 / 商品03 (ZX990)'];
        }
      } else {
        confirmedTasks = b.affectedTaskDisplayNos.map(no => `${no} (已对应商品)`);
      }

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
        confirmedTaskItems: confirmedTasks,
        candidateTaskItems: candidateTasks,
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
        let commoditySummary = '—';
        let statusVariant: RelationMatrixCell['statusVariant'] = 'none';
        const cellRelations: RelationMatrixCell['relations'] = [];

        if (customer.name.includes('英卡')) {
          // 英卡多对多关系矩阵精准设定
          if (r.displayNo === 'YK-260625131-1' && c.displayNo.includes('CH001')) {
            matchedCount = 1;
            statusText = 'UMW2631 ✓ (箱1~箱4)';
            commoditySummary = 'UMW2631 ✓ (箱1~箱4)';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 1,
              taskLineModel: 'UMW2631',
              taskLineQuantity: '60000 PCS',
              sourceRowId: 'I-a5368260946b-26070093-L001~L004',
              sourceRowModel: 'UMW2631 (UNISOC)',
              sourceRowQuantity: '60000 PCS (4×15000)',
              sourceWarehouseNo: '26070093',
              sourceFileName: '1767831448651816.pdf',
              sourcePage: 1,
              status: 'MATCHED',
              statusLabel: '确定占用原始箱1~箱4 (与CH002共同覆盖)',
            });
          } else if (r.displayNo === 'YK-260625131-1' && c.displayNo.includes('CH002')) {
            matchedCount = 2;
            statusText = 'UMW2631 ✓ (增量覆盖) · UMS9230E ✓';
            commoditySummary = 'UMW2631 ✓ (增量覆盖) · UMS9230E ✓';
            statusVariant = 'matched';
            cellRelations.push(
              {
                taskLineOrder: 1,
                taskLineModel: 'UMW2631',
                taskLineQuantity: '60000 PCS',
                sourceRowId: 'I-CH002-L007',
                sourceRowModel: 'UMW2631 (UNISOC)',
                sourceRowQuantity: '60000 PCS',
                sourceWarehouseNo: '26070104',
                sourceFileName: 'CH002_26070104.pdf',
                sourcePage: 1,
                status: 'MATCHED',
                statusLabel: '增量推进共同覆盖',
              },
              {
                taskLineOrder: 2,
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
              }
            );
          } else if (r.displayNo === 'YK-260625131-2' && c.displayNo.includes('CH002')) {
            matchedCount = 1;
            multipleCount = 1;
            statusText = 'ABC001 ✓ · ABC123-A ⚠';
            commoditySummary = 'ABC001 ✓ · ABC123-A ⚠';
            statusVariant = 'matched';
            cellRelations.push({
              taskLineOrder: 1,
              taskLineModel: 'ABC001',
              taskLineQuantity: '66000 PCS',
              sourceRowId: 'I-CH002-L002',
              sourceRowModel: 'ABC001 (UNISOC)',
              sourceRowQuantity: '66000 PCS',
              sourceWarehouseNo: '26070104',
              sourceFileName: 'CH002_26070104.pdf',
              sourcePage: 2,
              status: 'MATCHED',
              statusLabel: '确定对应',
            });
          } else if (r.displayNo === 'YK-260625131-2' && c.displayNo.includes('CH003')) {
            matchedCount = 1;
            multipleCount = 1;
            statusText = '74HC00PW 🟡 (有提醒) · ABC123-B ⚠ (候选待人工确认)';
            commoditySummary = '74HC00PW 🟡 (有提醒) · ABC123-B ⚠';
            statusVariant = 'multiple';
            cellRelations.push({
              taskLineOrder: 3,
              taskLineModel: 'ABC123',
              taskLineQuantity: '66000 PCS',
              sourceRowId: 'I-CH003-L005',
              sourceRowModel: 'ABC123-B',
              sourceRowQuantity: '66000 PCS',
              sourceWarehouseNo: '26070188',
              sourceFileName: 'CH003_26070188.pdf',
              sourcePage: 1,
              status: 'MULTIPLE_CANDIDATES',
              statusLabel: '存在多个可能对应 (待人工选择)',
            });
          } else if (r.displayNo === 'YK-260625131-3' && c.displayNo.includes('CH001')) {
            matchedCount = 2;
            statusText = 'UMW2631 ✓ (箱5~8) · ZX001 ✓';
            commoditySummary = 'UMW2631 ✓ (箱5~8) · ZX001 ✓';
            statusVariant = 'matched';
            cellRelations.push(
              {
                taskLineOrder: 1,
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
              },
              {
                taskLineOrder: 2,
                taskLineModel: 'ZX001',
                taskLineQuantity: '30000 PCS',
                sourceRowId: 'I-CH001-L010',
                sourceRowModel: 'ZX001',
                sourceRowQuantity: '30000 PCS',
                sourceWarehouseNo: '26070093',
                sourceFileName: '1767831448651816.pdf',
                sourcePage: 1,
                status: 'MATCHED',
                statusLabel: '确定对应',
              }
            );
          } else if (r.displayNo === 'YK-260625131-3' && c.displayNo.includes('CH002')) {
            multipleCount = 1;
            statusText = 'ZX990-A ⚠';
            commoditySummary = 'ZX990-A ⚠';
            statusVariant = 'multiple';
          } else if (r.displayNo === 'YK-260625131-3' && c.displayNo.includes('CH003')) {
            multipleCount = 1;
            statusText = 'ZX990-B ⚠';
            commoditySummary = 'ZX990-B ⚠';
            statusVariant = 'multiple';
          }
        } else {
          // 通用客户根据商品型号计算
          const activeRels = task.draft.lines.filter(l => 
            l.relationSourceIds.some(sid => batch.sources.some(s => s.id === sid))
          );
          if (activeRels.length > 0) {
            matchedCount = activeRels.length;
            statusText = `${activeRels[0].model || '商品'} ✓`;
            commoditySummary = statusText;
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
          commoditySummary,
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
    const commoditySummary = generateCommodityReconciliationSummary(
      customer,
      customerTasks,
      customerSources,
      customerRelations,
      enrichedBatches,
      state
    );

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
      commoditySummary,
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
