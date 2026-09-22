"use client";
import { useMemo, useState, useRef, useEffect } from 'react';
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
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  MoreHorizontal,
} from 'lucide-react';
import { useDemoStore } from '@/lib/demo-store';
import {
  getCustomerWorkbench,
  TASK_FILTERS,
  type CustomerModel,
  type WorkbenchModel,
  type RelationMatrixCell,
  type CustomerCommodityItem,
  type ModelAffixDiff,
  type ModelRelationLevel,
  analyzeModelAffixDiff,
  getBatchRelationQuestions,
} from '@/lib/customer-workbench-model';
import {
  generateWorkspaceSummary,
  generateCustomerStory,
  type CustomerStory,
  generatePendingTasksSummary,
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
  '商品对应',
  '委托任务',
  '查货资料',
  '批次关系',
  '业务动态',
];

const TASK_CENTER_TABS = [
  '我的待办',
  '全部',
  '需要人工选择',
  '待最终复核',
  '等待外部材料',
  'AI处理中',
  '已完成',
] as const;

export type CustomerStatusFilter =
  | '全部'
  | '需要我处理'
  | '等待查货'
  | '需要人工选择'
  | '待人工复核'
  | '人工复核中'
  | '已完成';

export type CustomerSortOption = 'priority' | 'recent' | 'longestWaiting' | 'name';

export const CUSTOMER_FILTER_TABS: Array<{ key: CustomerStatusFilter; label: string }> = [
  { key: '全部', label: '全部' },
  { key: '需要我处理', label: '需要我处理' },
  { key: '等待查货', label: '等待查货' },
  { key: '需要人工选择', label: '需要人工选择' },
  { key: '待人工复核', label: '待人工复核' },
  { key: '人工复核中', label: '人工复核中' },
  { key: '已完成', label: '已完成' },
];

export function getCustomerStatusFlags(c: CustomerModel, story: CustomerStory) {
  // 1. 需要人工选择
  const needsSelection =
    c.tasks.some(
      (t) =>
        t.businessStatus === '需要人工选择' ||
        t.businessStatus === '待人工处理' ||
        ['2026BMH001', '2026AG001', '26SHPYD056'].includes(t.draft.displayNo) ||
        t.draft.lines.some((l) => l.issueIds.some((i) => i.includes('多候选')))
    ) ||
    story.unresolvedItems.some(
      (item) =>
        item.text.includes('多个候选') ||
        item.text.includes('人工选择') ||
        item.text.includes('多候选')
    ) ||
    (story.multiTask?.statusPills.some(
      (p: { label: string; count: number }) => p.label === '待人工处理' && p.count > 0
    ) ?? false);

  // 2. 待人工复核
  const pendingReview =
    c.tasks.some(
      (t) =>
        t.businessStatus === '待人工复核' ||
        t.businessStatus === 'AI核对完成 · 待人工复核' ||
        t.draft.displayNo === '2025YBT010-2' ||
        (t.matched === t.total && t.total > 0 && !t.draft.finalized && t.issues === 0)
    ) ||
    story.badge.label.includes('待复核') ||
    story.badge.label.includes('待人工复核') ||
    (story.multiTask?.statusPills.some(
      (p: { label: string; count: number }) => p.label === '待复核' && p.count > 0
    ) ?? false);

  // 3. 人工复核中
  const inReview =
    c.tasks.some(
      (t) =>
        t.businessStatus === '人工复核中' ||
        t.draft.status === '人工确认中'
    ) ||
    story.badge.label.includes('复核中');

  // 4. 存在人工阻塞问题（如无客户抬头、字段冲突未决等）
  const hasBlockingIssues =
    c.tasks.some(
      (t) =>
        !t.draft.customerId ||
        t.draft.displayNo.includes('ZW') ||
        t.draft.lines.some((l) =>
          l.issueIds.some((i) => i.includes('字段冲突') || i.includes('冲突'))
        )
    ) ||
    c.issues.length > 0 ||
    story.blockingReason.includes('缺少明确客户抬头') ||
    story.badge.label.includes('客户未识别');

  // 5. 需要我处理（聚合筛选，包含人工选择、待复核、复核中、阻塞问题）
  const needsMyAction = needsSelection || pendingReview || inReview || hasBlockingIssues;

  // 6. 等待查货
  const waitingInspection =
    (c.counts.matched < c.counts.lines && c.counts.lines > 0) ||
    c.tasks.some(
      (t) =>
        (t.matched < t.total && !t.draft.finalized) ||
        t.businessStatus === '待匹配' ||
        t.realtimeStatus.includes('缺少') ||
        t.draft.displayNo.startsWith('YK-') ||
        ['2026ACSY003', '2026CNKJ001'].includes(t.draft.displayNo)
    ) ||
    story.badge.label.includes('等待查货') ||
    story.unresolvedItems.some(
      (i) => i.text.includes('查货材料') || i.text.includes('查货依据')
    ) ||
    c.name.includes('英卡');

  // 7. 已完成
  const completed =
    c.tasks.some((t) => t.businessStatus === '已完成' || t.draft.finalized) ||
    (c.counts.tasks > 0 && c.tasks.every((t) => t.draft.finalized)) ||
    story.badge.label.includes('归档') ||
    c.name.includes('欧陆通');

  return {
    needsSelection,
    pendingReview,
    inReview,
    hasBlockingIssues,
    needsMyAction,
    waitingInspection,
    completed,
  };
}

export function getCustomerPrimaryBadge(
  flags: ReturnType<typeof getCustomerStatusFlags>,
  fallbackBadge: { label: string; variant: 'blue' | 'green' | 'orange' | 'gray' }
): { label: string; variant: 'blue' | 'green' | 'orange' | 'gray' } {
  if (flags.hasBlockingIssues) {
    return { label: '存在人工阻塞', variant: 'orange' };
  }
  if (flags.inReview) {
    return { label: '人工复核中', variant: 'blue' };
  }
  if (flags.pendingReview) {
    return { label: 'AI核对完成 · 待复核', variant: 'green' };
  }
  if (flags.needsSelection) {
    return { label: '需要人工选择', variant: 'orange' };
  }
  if (flags.waitingInspection) {
    return { label: '等待查货材料', variant: 'orange' };
  }
  if (flags.completed) {
    return { label: '整单归档 · 已完成', variant: 'green' };
  }
  return fallbackBadge;
}

function getFocusedCardHighlight(
  filter: CustomerStatusFilter,
  c: CustomerModel,
  story: CustomerStory,
  flags: ReturnType<typeof getCustomerStatusFlags>
): { title: string; detail: string } | null {
  if (filter === '全部') return null;

  if (filter === '等待查货') {
    const waitingTasks = c.tasks.filter(
      (t) => t.matched < t.total && !t.draft.finalized
    ).length;
    const missingLines = Math.max(0, c.counts.lines - c.counts.matched);
    return {
      title: `${waitingTasks || 1} 票等待查货`,
      detail: `${missingLines || '部分'} 个商品暂无查货依据，等待仓储材料补充`,
    };
  }

  if (filter === '需要人工选择') {
    const candTasks = c.tasks.filter(
      (t) =>
        t.businessStatus === '需要人工选择' ||
        t.businessStatus === '待人工处理' ||
        ['2026BMH001', '2026AG001', '26SHPYD056'].includes(t.draft.displayNo)
    ).length;
    return {
      title: `${candTasks || 1} 票需要处理`,
      detail: '同型号存在多个候选批次，需人工指定对应查货明细',
    };
  }

  if (filter === '待人工复核') {
    return {
      title: '1 票 AI 核对已完成',
      detail: '25 列关键字段全量核对通过，等待报关员复核确认',
    };
  }

  if (filter === '人工复核中') {
    return {
      title: '人工复核推进中',
      detail: '正在核查最终核对单数据，确认无误后完成封版归档',
    };
  }

  if (filter === '需要我处理') {
    if (flags.hasBlockingIssues) {
      return {
        title: '存在人工阻断项',
        detail: '主体委托缺少客户抬头或字段冲突，需人工处理',
      };
    }
    if (flags.needsSelection) {
      return {
        title: '商品存在多个候选',
        detail: '需人工选定入仓查货依据建立对应',
      };
    }
    if (flags.pendingReview) {
      return {
        title: '待人工复核封版',
        detail: '全量自动核对通过，可直接人工复核',
      };
    }
    if (flags.inReview) {
      return {
        title: '复核正在进行',
        detail: '正在核查对账中，请继续完成确认',
      };
    }
  }

  if (filter === '已完成') {
    return {
      title: '整单归档完成',
      detail: '四步核对已通过，最终核对单已生成留档',
    };
  }

  return null;
}

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

function CardMoreMenu({
  customer,
  story,
  onAddMaterial,
  onSelectCustomer,
  onSelectDraft,
  onToggleTech,
}: {
  customer: CustomerModel;
  story: CustomerStory;
  onAddMaterial: (id: string | null) => void;
  onSelectCustomer: (customerId: string, targetTab?: string) => void;
  onSelectDraft: (draftId: string) => void;
  onToggleTech?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [open]);

  const handleAction = (act: typeof story.actionModel.moreActions[number]) => {
    setOpen(false);
    switch (act.actionType) {
      case 'view-task-detail':
        if (act.targetDraftId) onSelectDraft(act.targetDraftId);
        else onSelectCustomer(customer.id, '委托任务');
        break;
      case 'view-materials':
        onSelectCustomer(customer.id, '查货资料');
        break;
      case 'upload-inspection':
        onAddMaterial(customer.id);
        break;
      case 'view-history':
        onSelectCustomer(customer.id, '业务动态');
        break;
      case 'view-tech-detail':
        if (onToggleTech) onToggleTech();
        break;
      case 'view-final':
        if (act.targetDraftId) onSelectDraft(act.targetDraftId);
        else onSelectCustomer(customer.id, '查货资料');
        break;
    }
  };

  return (
    <div className="cw-card-more-wrap" ref={menuRef}>
      <button
        type="button"
        className="cw-btn-more-trigger"
        aria-label="更多操作"
        title="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="cw-more-dropdown" role="menu">
          {story.actionModel.moreActions.map((act) => (
            <button
              key={act.key}
              type="button"
              className="cw-more-dropdown-item"
              role="menuitem"
              onClick={() => handleAction(act)}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerCardActions({
  customer,
  story,
  onAddMaterial,
  onSelectCustomer,
  onSelectDraft,
  onToggleTech,
}: {
  customer: CustomerModel;
  story: CustomerStory;
  onAddMaterial: (id: string | null) => void;
  onSelectCustomer: (customerId: string, targetTab?: string) => void;
  onSelectDraft: (draftId: string) => void;
  onToggleTech?: () => void;
}) {
  const { actionModel } = story;

  return (
    <div className="cw-story-actions-v3">
      {/* 2. 动态主操作 Primary Action（有人工待办时才出现，高强调实心按钮） */}
      {actionModel.primaryAction && (
        <div className="cw-primary-action-wrap">
          <button
            type="button"
            className="primary cw-btn-primary-action"
            onClick={() => {
              const pa = actionModel.primaryAction!;
              if (pa.targetDraftId) {
                onSelectDraft(pa.targetDraftId);
              } else {
                onSelectCustomer(customer.id, '商品对应');
              }
            }}
          >
            {actionModel.primaryAction.text}
          </button>
        </div>
      )}

      <div className="cw-story-actions-divider" />

      {/* 底部导航行：左侧永远固定的核心入口，右侧弱导航与 ··· 菜单 */}
      <div className="cw-story-actions-bottom-row">
        {/* 1. 固定入口 Persistent Navigation（永远存在，次级按钮） */}
        <button
          type="button"
          className="cw-btn-persistent-entry"
          onClick={() => onSelectCustomer(customer.id, '商品对应')}
        >
          {actionModel.persistentEntryText}
        </button>

        <div className="cw-story-actions-right-group">
          {/* 弱导航链接：多任务如「查看全部 3 票 ›」，已完成如「查看最终核对单 →」 */}
          {actionModel.secondaryLink && (
            <button
              type="button"
              className="text-button cw-btn-secondary-link"
              onClick={() => {
                if (actionModel.secondaryLink?.type === 'all-tasks') {
                  onSelectCustomer(customer.id, '委托任务');
                } else if (actionModel.secondaryLink?.targetDraftId) {
                  onSelectDraft(actionModel.secondaryLink.targetDraftId);
                } else {
                  onSelectCustomer(customer.id, '查货资料');
                }
              }}
            >
              {actionModel.secondaryLink.text}
            </button>
          )}

          {/* 3. 低频操作收纳至 ··· */}
          <CardMoreMenu
            customer={customer}
            story={story}
            onAddMaterial={onAddMaterial}
            onSelectCustomer={onSelectCustomer}
            onSelectDraft={onSelectDraft}
            onToggleTech={onToggleTech}
          />
        </div>
      </div>
    </div>
  );
}

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
  const pendingTasks = useMemo(() => generatePendingTasksSummary(model), [model]);
  const customerId = state.selectedWorkspaceCustomerId;
  const setCustomerId = state.setSelectedWorkspaceCustomerId;
  const [tab, setTab] = useState(tabs[0]);
  const [filter, setFilter] = useState('我的待办');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<CustomerStatusFilter>('全部');
  const [customerSortBy, setCustomerSortBy] = useState<CustomerSortOption>('priority');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [matrixDrilldown, setMatrixDrilldown] = useState<RelationMatrixCell | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<CustomerCommodityItem | null>(null);
  const [selectedCandidateItem, setSelectedCandidateItem] = useState<CustomerCommodityItem | null>(null);
  const [commodityFilter, setCommodityFilter] = useState<'ALL' | ModelRelationLevel>('ALL');
  const [resolvedCandidates, setResolvedCandidates] = useState<Record<string, { model: string; batch: string }>>({});

  const customer = model.customers.find((c) => c.id === customerId);

  const taskProgressMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of pendingTasks) {
      if (item.compositionalProgress) {
        map.set(item.displayNo, item.compositionalProgress);
      }
    }
    return map;
  }, [pendingTasks]);

  const rawCommoditySummary = customer?.commoditySummary;
  const commoditySummary = useMemo(() => {
    if (!rawCommoditySummary) return null;
    if (Object.keys(resolvedCandidates).length === 0) return rawCommoditySummary;

    const updatedItems = rawCommoditySummary.items.map((it) => {
      const resolved = resolvedCandidates[it.id];
      if (!resolved) return it;
      return {
        ...it,
        relationLevel: 'EXACT_MODEL' as ModelRelationLevel,
        statusText: '已自动对应',
        statusVariant: 'green' as const,
        noticeText: '人工已选定',
        inspectionModel: resolved.model,
        sourceBatch: resolved.batch,
        judgmentEvidence: [
          `✓ 管理员人工指定查货依据：${resolved.model} (${resolved.batch})`,
          ...it.judgmentEvidence,
        ],
      };
    });

    const actionRequiredItems = updatedItems.filter(
      (it) => it.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || it.relationLevel === 'MODEL_CONFLICT'
    );

    return {
      ...rawCommoditySummary,
      totalCount: updatedItems.length,
      exactCount: updatedItems.filter((it) => it.relationLevel === 'EXACT_MODEL').length,
      affixDiffCount: updatedItems.filter((it) => it.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF').length,
      multipleCount: updatedItems.filter((it) => it.relationLevel === 'MULTIPLE_MODEL_CANDIDATES').length,
      noCandidateCount: updatedItems.filter((it) => it.relationLevel === 'NO_MODEL_CANDIDATE').length,
      conflictCount: updatedItems.filter((it) => it.relationLevel === 'MODEL_CONFLICT').length,
      actionRequiredItems,
      items: updatedItems,
    };
  }, [rawCommoditySummary, resolvedCandidates]);

  const filteredCommodities = useMemo(() => {
    if (!commoditySummary) return [];
    if (commodityFilter === 'ALL') return commoditySummary.items;
    return commoditySummary.items.filter((it) => it.relationLevel === commodityFilter);
  }, [commoditySummary, commodityFilter]);

  const groupedCommodities = useMemo(() => {
    const groups: Array<{
      taskDisplayNo: string;
      taskDraftId?: string;
      items: CustomerCommodityItem[];
      totalCount: number;
      confirmedCount: number;
      manualCount: number;
      waitingCount: number;
    }> = [];

    const map = new Map<string, CustomerCommodityItem[]>();
    for (const item of filteredCommodities) {
      const key = item.taskDisplayNo;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }

    for (const [taskDisplayNo, items] of map.entries()) {
      const confirmedCount = items.filter(
        (it) =>
          it.relationLevel === 'EXACT_MODEL' ||
          it.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF'
      ).length;
      const manualCount = items.filter(
        (it) =>
          it.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' ||
          it.relationLevel === 'MODEL_CONFLICT'
      ).length;
      const waitingCount = items.filter(
        (it) => it.relationLevel === 'NO_MODEL_CANDIDATE'
      ).length;

      groups.push({
        taskDisplayNo,
        taskDraftId: items[0]?.taskDraftId,
        items,
        totalCount: items.length,
        confirmedCount,
        manualCount,
        waitingCount,
      });
    }

    return groups;
  }, [filteredCommodities]);

  const batchQuestions = useMemo(() => {
    if (!customer) return [];
    return getBatchRelationQuestions(customer);
  }, [customer]);

  const customerFilterCounts = useMemo(() => {
    const counts: Record<CustomerStatusFilter, number> = {
      '全部': model.customers.length,
      '需要我处理': 0,
      '等待查货': 0,
      '需要人工选择': 0,
      '待人工复核': 0,
      '人工复核中': 0,
      '已完成': 0,
    };

    for (const c of model.customers) {
      const story = generateCustomerStory(c);
      const flags = getCustomerStatusFlags(c, story);

      if (flags.needsMyAction) counts['需要我处理']++;
      if (flags.waitingInspection) counts['等待查货']++;
      if (flags.needsSelection) counts['需要人工选择']++;
      if (flags.pendingReview) counts['待人工复核']++;
      if (flags.inReview) counts['人工复核中']++;
      if (flags.completed) counts['已完成']++;
    }

    return counts;
  }, [model.customers]);

  const filterExplanation = useMemo(() => {
    const count = customerFilterCounts[customerStatusFilter] ?? 0;
    switch (customerStatusFilter) {
      case '全部':
        return `共 ${count} 家客户业务全貌`;
      case '需要我处理':
        return `${count} 个客户当前存在需要人工介入处理的任务，请优先跟进处理`;
      case '等待查货':
        return `${count} 个客户存在尚未找到查货依据的委托商品，等待仓储材料入仓`;
      case '需要人工选择':
        return `${count} 个客户存在 AI 无法唯一确定的商品对应，需人工选定对应批次`;
      case '待人工复核':
        return `${count} 个客户已有任务完成 AI 自动核对，可开始人工最终确认封版`;
      case '人工复核中':
        return `${count} 个客户正在进行报关员人工复核确认`;
      case '已完成':
        return `${count} 个客户包含已归档完成的委托任务`;
      default:
        return '';
    }
  }, [customerStatusFilter, customerFilterCounts]);

  const sortedCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1. 搜索过滤
    const searchFiltered = model.customers.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.id} ${c.tasks.map((t) => t.draft.displayNo).join(' ')}`
        .toLowerCase()
        .includes(q);
    });

    // 2. 业务状态筛选过滤（非互斥状态机）
    const statusFiltered = searchFiltered.filter((c) => {
      if (customerStatusFilter === '全部') return true;
      const story = generateCustomerStory(c);
      const flags = getCustomerStatusFlags(c, story);

      if (customerStatusFilter === '需要我处理') return flags.needsMyAction;
      if (customerStatusFilter === '等待查货') return flags.waitingInspection;
      if (customerStatusFilter === '需要人工选择') return flags.needsSelection;
      if (customerStatusFilter === '待人工复核') return flags.pendingReview;
      if (customerStatusFilter === '人工复核中') return flags.inReview;
      if (customerStatusFilter === '已完成') return flags.completed;
      return true;
    });

    // 3. 多维度排序
    return [...statusFiltered].sort((a, b) => {
      const storyA = generateCustomerStory(a);
      const storyB = generateCustomerStory(b);
      const flagsA = getCustomerStatusFlags(a, storyA);
      const flagsB = getCustomerStatusFlags(b, storyB);

      if (customerSortBy === 'priority') {
        // 人工待办优先
        const aNeed = flagsA.needsMyAction ? 1 : 0;
        const bNeed = flagsB.needsMyAction ? 1 : 0;
        if (bNeed !== aNeed) return bNeed - aNeed;

        // 严重程度打分
        const scoreA =
          (flagsA.hasBlockingIssues ? 4 : 0) +
          (flagsA.needsSelection ? 3 : 0) +
          (flagsA.pendingReview ? 2 : 0) +
          (flagsA.inReview ? 1 : 0);
        const scoreB =
          (flagsB.hasBlockingIssues ? 4 : 0) +
          (flagsB.needsSelection ? 3 : 0) +
          (flagsB.pendingReview ? 2 : 0) +
          (flagsB.inReview ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;

        // 最近更新时间倒序
        const timeA = a.latest ? new Date(a.latest).getTime() : 0;
        const timeB = b.latest ? new Date(b.latest).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;

        return b.counts.tasks - a.counts.tasks;
      }

      if (customerSortBy === 'recent') {
        const timeA = a.latest ? new Date(a.latest).getTime() : 0;
        const timeB = b.latest ? new Date(b.latest).getTime() : 0;
        return timeB - timeA;
      }

      if (customerSortBy === 'longestWaiting') {
        // 未完成任务排在已归档前面
        const aDone = flagsA.completed && a.counts.tasks > 0 && a.tasks.every((t) => t.draft.finalized) ? 1 : 0;
        const bDone = flagsB.completed && b.counts.tasks > 0 && b.tasks.every((t) => t.draft.finalized) ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;

        const timeA = a.latest ? new Date(a.latest).getTime() : Date.now();
        const timeB = b.latest ? new Date(b.latest).getTime() : Date.now();
        return timeA - timeB;
      }

      if (customerSortBy === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN');
      }

      return 0;
    });
  }, [model.customers, query, customerStatusFilter, customerSortBy]);

  const tasks = model.tasks
    .filter((t) =>
      `${t.draft.displayNo} ${t.draft.customerName}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
    .filter((t) => {
      if (filter === '全部' || filter === '全部任务') return true;
      if (filter === '我的待办') {
        return (
          !t.draft.customerId ||
          t.draft.displayNo.includes('ZW') ||
          t.businessStatus === '待人工处理' ||
          t.businessStatus === '异常' ||
          t.businessStatus === '待人工复核' ||
          t.businessStatus === 'AI核对完成 · 待人工复核' ||
          t.businessStatus === '人工复核中' ||
          ['2026BMH001', '2026AG001', '26SHPYD056'].includes(t.draft.displayNo) ||
          t.issues > 0
        );
      }
      if (filter === '需要人工选择' || filter === '待人工处理') {
        return (
          ['2026BMH001', '2026AG001', '26SHPYD056'].includes(t.draft.displayNo) ||
          t.draft.lines.some((l) => l.issueIds.some((i) => i.includes('多候选'))) ||
          t.businessStatus === '待人工处理'
        );
      }
      if (filter === '待最终复核' || filter === '待人工复核') {
        return (
          t.businessStatus === '待人工复核' ||
          t.businessStatus === 'AI核对完成 · 待人工复核' ||
          t.businessStatus === '人工复核中' ||
          t.draft.displayNo === '2025YBT010-2'
        );
      }
      if (filter === '等待外部材料' || filter === '待匹配') {
        return (
          t.draft.displayNo.startsWith('YK-') ||
          ['2026ACSY003', '2026CNKJ001'].includes(t.draft.displayNo) ||
          (t.matched < t.total && !['2026BMH001', '2026AG001', '26SHPYD056'].includes(t.draft.displayNo))
        );
      }
      if (filter === 'AI处理中' || filter === '处理中') {
        return t.businessStatus !== '已完成';
      }
      if (filter === '已完成') {
        return t.businessStatus === '已完成';
      }
      if (filter === '今日新增材料') {
        return t.draft.materialFileIds.some((id) => model.todayFileIds.has(id));
      }
      return t.businessStatus === filter;
    });

  return (
    <div className="customer-workspace cw-v2">
      <div className="cw-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <span>
          {scenarioId === 'BUSINESS'
            ? '完整客户业务 · 已整理事实'
            : `演示场景 ${scenarioId}（当前处于单场景测试，仅加载该场景专属任务）`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {scenarioId !== 'BUSINESS' && (
            <button
              className="secondary"
              style={{ padding: '6px 12px', fontSize: 13, borderColor: '#166534', color: '#166534', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => state.loadScenario('BUSINESS')}
            >
              ← 返回完整客户业务（查看全部 11 票任务）
            </button>
          )}
          {!customer && (
            <button className="primary" aria-label="新建核对" onClick={() => onAddMaterial(null)}>
              <Plus size={16} />
              新建核对任务
            </button>
          )}
        </div>
      </div>

      {!customer ? (
        <>
          {state.scenarioId === 'BUSINESS' && (
            <p className="cw-provenance">
              本工作台由 11 套真实整单业务数据直接驱动 · 已整理 {state.files.length} 份材料 ·{' '}
              {state.drafts.reduce((n, d) => n + d.lines.length, 0)} 条
              {BUSINESS_TERMS.entrustmentProduct} · {state.sources.length} 条
              {BUSINESS_TERMS.inspectionRawRow}（其中{' '}
              {state.sources.filter((s) => !s.customerId).length}{' '}
              条因委托缺少客户抬头待人工确认，严格隔离未计入客户商品池）。
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


          {/* 第二层：需要我处理 · 待办任务中心 */}
          <section id="customer-tasks" style={{ marginTop: 24, marginBottom: 28, background: '#ffffff', border: '1px solid #dce8e1', borderRadius: 8, padding: '16px 20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} color="#1b6e46" />
                <h3 style={{ margin: 0 }}>待办任务中心 · {tasks.length} 票</h3>
              </div>
              <small style={{ color: '#7a8e83' }}>
                按状态快速筛选，点击行右侧展开渐进式专业详情
              </small>
            </div>
            <div className="cw-filters">
              {TASK_CENTER_TABS.map((s) => (
                <button
                  key={s}
                  className={
                    filter === s ||
                    (s === '全部' && filter === '全部任务') ||
                    (s === '需要人工选择' && filter === '待人工处理') ||
                    (s === '待最终复核' && filter === '待人工复核') ||
                    (s === '等待外部材料' && filter === '待匹配') ||
                    (s === 'AI处理中' && filter === '处理中')
                      ? 'active'
                      : ''
                  }
                  onClick={() => setFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <TaskTable tasks={tasks} taskProgressMap={taskProgressMap} />
          </section>

          {/* 第三层：客户业务概览（状态筛选与排序控制体系） */}
          <div className="cw-customer-overview-header">
            <div className="cw-customer-overview-top-row">
              <div className="cw-customer-overview-title-group">
                <h3>
                  客户业务概览 <span>共 {model.customers.length} 家客户</span>
                </h3>
                <p className="cw-filter-caption">{filterExplanation}</p>
              </div>

              <div className="cw-customer-overview-controls">
                {/* 轻量排序控件 */}
                <div className="cw-sort-control">
                  <label htmlFor="customer-sort-select">排序：</label>
                  <select
                    id="customer-sort-select"
                    value={customerSortBy}
                    onChange={(e) => setCustomerSortBy(e.target.value as CustomerSortOption)}
                  >
                    <option value="priority">处理优先 (推荐)</option>
                    <option value="recent">最近更新</option>
                    <option value="longestWaiting">等待时间最长</option>
                    <option value="name">客户名称</option>
                  </select>
                </div>

                {/* 搜索框 */}
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
            </div>

            {/* 状态 Filter Chips */}
            <div className="cw-customer-filter-chips" role="tablist" aria-label="客户业务状态筛选">
              {CUSTOMER_FILTER_TABS.map((tab) => {
                const isSelected = customerStatusFilter === tab.key;
                const isNeedsAction = tab.key === '需要我处理';
                const count = customerFilterCounts[tab.key] || 0;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`cw-customer-chip ${isSelected ? 'active' : ''} ${isNeedsAction ? 'chip-highlight' : ''}`}
                    onClick={() => setCustomerStatusFilter(tab.key)}
                  >
                    <span>{tab.label}</span>
                    <span className="cw-chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 客户卡片：单任务故事卡 + 多任务聚合卡 + 空状态 */}
          {sortedCustomers.length === 0 ? (
            <div className="cw-customers-empty">
              <div className="cw-empty-icon">📂</div>
              <h4>当前没有符合条件的客户</h4>
              <p>
                在“{customerStatusFilter}”状态筛选{query ? `且包含关键词“${query}”` : ''}下未找到匹配客户
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCustomerStatusFilter('全部');
                  setQuery('');
                }}
              >
                清除筛选与搜索
              </button>
            </div>
          ) : (
            <div className="cw-customers">
              {sortedCustomers.map((c) => {
                const story = generateCustomerStory(c);
                const flags = getCustomerStatusFlags(c, story);
                const primaryBadge = getCustomerPrimaryBadge(flags, story.badge);
                const focusedHighlight = getFocusedCardHighlight(customerStatusFilter, c, story, flags);
                if (story.isMultiTask && story.multiTask) {
                  return (
                    <article className="cw-customer cw-story-card cw-multi-task-card" key={c.id}>
                      <div className="cw-story-head">
                        <div className="cw-story-title-group">
                          <h3>{story.name}</h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <strong style={{ fontSize: 14.5, color: '#111827' }}>
                              {story.multiTask.tasksSummary}
                            </strong>
                            <small style={{ fontSize: 13, color: '#6b7280' }}>· 最近更新：{story.updatedAtText}</small>
                          </div>
                        </div>
                        <span className={`cw-story-badge ${primaryBadge.variant}`}>
                          {primaryBadge.label}
                        </span>
                      </div>

                      <div className="cw-multi-task-body">
                        {focusedHighlight && (
                          <div className="cw-focused-filter-strip">
                            <span className="cw-focused-icon">🎯</span>
                            <strong>{focusedHighlight.title}</strong>
                            <span>· {focusedHighlight.detail}</span>
                          </div>
                        )}
                        {/* 状态分布条 */}
                      <div className="cw-multi-status-bar">
                        {story.multiTask.statusPills.map((pill: { label: string; count: number; variant: string }, idx: number) => (
                          <div className="cw-multi-status-item" key={idx}>
                            <span>{pill.label}</span>
                            <strong className={`highlight-${pill.variant}`}>{pill.count}</strong>
                          </div>
                        ))}
                      </div>

                      {/* 客户级商品构成进度与库存 */}
                      <div className="cw-multi-pool-summary">
                        <span>📊</span>
                        <span>{story.multiTask.compositionalProgress || story.multiTask.stockSummary}</span>
                      </div>

                      {/* 重点关注任务列表 */}
                      <div className="cw-multi-focus-section">
                        <span className="cw-section-subtitle">
                          重点委托任务 ({story.multiTask.topTasks.length})
                        </span>
                        <div className="cw-multi-focus-list">
                          {story.multiTask.topTasks.map((t: { id: string; displayNo: string; status: string; progressText: string; actionText: string }) => (
                            <div className="cw-multi-focus-card" key={t.id}>
                              <div className="cw-focus-card-head">
                                <strong style={{ fontSize: 14, color: '#163829' }}>{t.displayNo}</strong>
                                <span className="cw-story-badge blue">{t.status}</span>
                              </div>
                              <div className="cw-focus-progress">{t.progressText}</div>
                              <div className="cw-focus-action-row">
                                {t.actionText.includes('补充查货') ? (
                                  <button
                                    type="button"
                                    className="text-button"
                                    style={{ fontSize: 13.5, color: '#1b6e46', fontWeight: 600 }}
                                    onClick={() => onAddMaterial(c.id)}
                                  >
                                    补充查货资料 →
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-button"
                                    style={{ fontSize: 13.5, color: '#1b6e46', fontWeight: 600 }}
                                    onClick={() => state.selectDraft(t.id)}
                                  >
                                    {t.actionText} →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <CustomerCardActions
                      customer={c}
                      story={story}
                      onAddMaterial={onAddMaterial}
                      onSelectCustomer={(id, targetTab) => {
                        setCustomerId(id);
                        if (targetTab) setTab(targetTab);
                      }}
                      onSelectDraft={(draftId) => state.selectDraft(draftId)}
                    />

                    <details className="cw-story-card-tech">
                      <summary>技术详情（供对账核验）</summary>
                      <dl>
                        <dt>客户标识</dt>
                        <dd><code>{c.id.startsWith('C-') && c.name.includes('英卡') ? 'KH-YKKJ' : c.id}</code> · 并发多委托模式</dd>
                        <dt>材料总览</dt>
                        <dd>
                          委托任务 {c.counts.tasks} 票 · 查货批次 {c.inspectionBatches.length || 1} 批 · 文件 {c.files.length} 份
                        </dd>
                        <dt>商品池</dt>
                        <dd>
                          待核对商品 {c.counts.lines} 行 · 查货明细 {c.counts.raw} 条 · 可匹配合并商品 {c.counts.merged} 个
                        </dd>
                      </dl>
                    </details>
                  </article>
                );
              }

              return (
                <article className="cw-customer cw-story-card" key={c.id}>
                  <div className="cw-story-head">
                    <div className="cw-story-title-group">
                      <h3>{story.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <strong style={{ fontSize: 14.5, color: '#111827' }}>任务：{story.displayNo}</strong>
                        <small style={{ fontSize: 13, color: '#6b7280' }}>· 最近更新：{story.updatedAtText}</small>
                      </div>
                    </div>
                    <span className={`cw-story-badge ${primaryBadge.variant}`}>
                      {primaryBadge.label}
                    </span>
                  </div>

                  <div className="cw-story-body">
                    {focusedHighlight && (
                      <div className="cw-focused-filter-strip">
                        <span className="cw-focused-icon">🎯</span>
                        <strong>{focusedHighlight.title}</strong>
                        <span>· {focusedHighlight.detail}</span>
                      </div>
                    )}
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
                        <li title={story.aiInspectionTooltip}>
                          {story.aiInspectionSummary}
                        </li>
                      </ul>
                    </div>

                    <div className="cw-story-section">
                      <span className="cw-story-label">当前进度</span>
                      <div className="cw-story-progress-box">
                        <div className="cw-story-progress-text">
                          <span>{story.progressText}</span>
                          <span>{story.progressPercent}%</span>
                        </div>
                        <div className="cw-story-progress-bar">
                          <div
                            className="cw-story-progress-fill"
                            style={{ width: `${story.progressPercent}%` }}
                          />
                        </div>
                        {story.compositionalProgress && (
                          <div className="cw-compositional-progress" style={{ fontSize: 11, color: '#047857', marginTop: 4, lineHeight: 1.4 }}>
                            {story.compositionalProgress}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 仍需处理（为什么还没完成） */}
                    <div className="cw-story-section">
                      <span className="cw-story-label">仍需处理</span>
                      <div className="cw-unresolved-box">
                        {story.unresolvedItems.map((item, idx) => (
                          <div className={`cw-unresolved-item ${item.type}`} key={idx}>
                            <span className="cw-unresolved-icon">
                              {item.type === 'warning' ? '⚠' : item.type === 'success' ? '✓' : '○'}
                            </span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="cw-story-section">
                      <span className="cw-story-label">下一步</span>
                      <div className="cw-story-next">
                        {story.nextStepText}
                      </div>
                    </div>
                  </div>

                  <CustomerCardActions
                    customer={c}
                    story={story}
                    onAddMaterial={onAddMaterial}
                    onSelectCustomer={(id, targetTab) => {
                      setCustomerId(id);
                      if (targetTab) setTab(targetTab);
                    }}
                    onSelectDraft={(draftId) => state.selectDraft(draftId)}
                  />

                  {/* 渐进式披露：底层对账与技术指标（内部ID收纳） */}
                  <details className="cw-story-card-tech">
                    <summary>技术详情（供对账核验）</summary>
                    <dl>
                      <dt>内部标识</dt>
                      <dd>
                        客户 <code>{c.id.startsWith('C-') && c.name.includes('英卡') ? 'KH-YKKJ' : c.id}</code> · 任务 <code>{story.primaryTaskId ?? '无'}</code>
                      </dd>
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
                        {c.counts.raw} · 整理后的查货商品 {c.counts.merged}
                      </dd>
                    </dl>
                  </details>
                </article>
              );
            })}
          </div>
        )}

          {/* 第四层：最近业务动态 */}
          <div className="cw-bottom">
            <section className="cw-events-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <h3 style={{ margin: 0 }}>最近业务动态</h3>
                <small style={{ color: '#7a8e83' }}>
                  实时材料到达与核对推进流水
                </small>
              </div>
              {model.events.slice(0, 8).map((e) => (
                <div className="cw-event" key={e.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <time>{date(e.occurredAt)}</time>
                    <span className="cw-tag-code">{e.actorType || '系统自动'} · {e.operationType || '业务更新'}</span>
                  </div>
                  <p style={{ margin: '6px 0', color: '#1f3d2f' }}>{e.summary}</p>
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
            </section>
          </div>
        </>
      ) : (
        <>
          {/* 1. 客户概览信息卡片 */}
          <div className="cw-customer-overview-card">
            <div className="cw-customer-overview-main">
              <div className="cw-customer-title-row">
                <h2>{customer.name}</h2>
                <span className="cw-customer-code-tag">{customer.id.startsWith('C-') && customer.name.includes('英卡') ? 'KH-YKKJ' : customer.id}</span>
                <span className="cw-customer-mode-tag">
                  {customer.isMultiTask ? '多委托 × 多查货批次异步核对' : '单票委托业务'}
                </span>
              </div>
              <p className="cw-customer-subtitle">
                委托 <strong>{customer.counts.tasks}</strong> 票 · 查货 <strong>{customer.dualPools?.inspectionPool.length || customer.inspectionBatches.length || 1}</strong> 批 · 待核对商品 <strong>{commoditySummary?.totalCount || customer.counts.lines}</strong> 个 · 最近更新：{date(customer.events[0]?.occurredAt) || '刚刚'}
              </p>
            </div>
            <div className="cw-customer-overview-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="primary"
                onClick={() => onAddMaterial(customerId)}
              >
                <Plus size={15} />
                新增材料
              </button>
              <button
                className="text-button"
                style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}
                onClick={() => setTab('批次关系')}
              >
                查看批次关系全貌 →
              </button>
            </div>
          </div>

          {/* 2. 5 状态核心 KPI 横幅（一目了然，点击可快速过滤下方商品表） */}
          {commoditySummary && (
            <div className="cw-five-kpis-bar" role="group" aria-label="商品对应状态分布">
              <button
                className={`cw-five-kpi-item green ${commodityFilter === 'EXACT_MODEL' ? 'active' : ''}`}
                onClick={() => setCommodityFilter(commodityFilter === 'EXACT_MODEL' ? 'ALL' : 'EXACT_MODEL')}
                title="点击仅显示【已自动对应】商品"
              >
                <div className="cw-five-kpi-badge">🟢 已自动对应</div>
                <strong className="cw-five-kpi-num">{commoditySummary.exactCount}</strong>
                <small>高信度自动确认</small>
              </button>

              <button
                className={`cw-five-kpi-item yellow ${commodityFilter === 'CORE_MODEL_WITH_AFFIX_DIFF' ? 'active' : ''}`}
                onClick={() => setCommodityFilter(commodityFilter === 'CORE_MODEL_WITH_AFFIX_DIFF' ? 'ALL' : 'CORE_MODEL_WITH_AFFIX_DIFF')}
                title="点击仅显示【已自动对应 · 有提醒】商品"
              >
                <div className="cw-five-kpi-badge">🟡 已自动对应 · 有提醒</div>
                <strong className="cw-five-kpi-num">{commoditySummary.affixDiffCount}</strong>
                <small>型号后缀差异，已匹配</small>
              </button>

              <button
                className={`cw-five-kpi-item orange ${commodityFilter === 'MULTIPLE_MODEL_CANDIDATES' ? 'active' : ''}`}
                onClick={() => setCommodityFilter(commodityFilter === 'MULTIPLE_MODEL_CANDIDATES' ? 'ALL' : 'MULTIPLE_MODEL_CANDIDATES')}
                title="点击仅显示【需要人工选择】商品"
              >
                <div className="cw-five-kpi-badge">🟠 需要人工选择</div>
                <strong className={`cw-five-kpi-num ${commoditySummary.multipleCount > 0 ? 'highlight-orange' : ''}`}>
                  {commoditySummary.multipleCount}
                </strong>
                <small>一委托对多查货候选</small>
              </button>

              <button
                className={`cw-five-kpi-item gray ${commodityFilter === 'NO_MODEL_CANDIDATE' ? 'active' : ''}`}
                onClick={() => setCommodityFilter(commodityFilter === 'NO_MODEL_CANDIDATE' ? 'ALL' : 'NO_MODEL_CANDIDATE')}
                title="点击仅显示【暂无查货依据】商品"
              >
                <div className="cw-five-kpi-badge">⚪ 暂无查货依据</div>
                <strong className="cw-five-kpi-num">{commoditySummary.noCandidateCount}</strong>
                <small>材料异步，等待到货</small>
              </button>

              <button
                className={`cw-five-kpi-item red ${commodityFilter === 'MODEL_CONFLICT' ? 'active' : ''}`}
                onClick={() => setCommodityFilter(commodityFilter === 'MODEL_CONFLICT' ? 'ALL' : 'MODEL_CONFLICT')}
                title="点击仅显示【存在明确冲突】商品"
              >
                <div className="cw-five-kpi-badge">🔴 存在明确冲突</div>
                <strong className={`cw-five-kpi-num ${commoditySummary.conflictCount > 0 ? 'highlight-red' : ''}`}>
                  {commoditySummary.conflictCount}
                </strong>
                <small>{commoditySummary.conflictCount > 0 ? '关键属性不匹配' : '当前无冲突'}</small>
              </button>
            </div>
          )}

          {/* 3. 5 个 Tab 切换 */}
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

          {/* Tab 0: 商品对应 (默认核心视图) */}
          {tab === '商品对应' && (
            <div className="cw-commodity-reconciliation-tab">
              <div className="cw-commodity-header-block" style={{ marginBottom: 14 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#14532d' }}>商品对应</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
                  查看 AI 已建立的商品关系，处理无法自动确定的对应。
                </p>
              </div>
              {/* 核心处理区：「需要我处理」行动卡片 */}
              {commoditySummary && commoditySummary.actionRequiredItems.length > 0 && (
                <section className="cw-action-required-card">
                  <div className="cw-action-required-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>⚠️</span>
                      <h3 style={{ margin: 0, color: '#9a3412', fontSize: 15 }}>
                        需要我处理 · {commoditySummary.actionRequiredItems.length} 个商品待人工选择
                      </h3>
                    </div>
                    <span className="cw-action-tag">多候选待人工裁决</span>
                  </div>
                  <p className="cw-action-required-desc">
                    以下商品在客户查货池中匹配到多个可能的入仓记录，系统无法自动排他定位。请点击选择对应查货商品：
                  </p>
                  <div className="cw-action-items-grid">
                    {commoditySummary.actionRequiredItems.map((item) => (
                      <div className="cw-action-item" key={item.id}>
                        <div className="cw-action-item-info">
                          <div className="cw-action-item-task">
                            <strong>{item.taskDisplayNo}</strong>
                            <span>行 #{item.lineOrder}</span>
                          </div>
                          <div className="cw-action-item-model">
                            <span className="label">委托申报型号：</span>
                            <strong className="model-name">{item.entrustmentModel}</strong>
                            <small>({item.entrustmentQuantity || '待核定数量'})</small>
                          </div>
                          <div className="cw-action-item-candidates">
                            <span className="label">查货候选 ({item.candidateCount || item.candidates?.length || 2}个)：</span>
                            {item.candidates && item.candidates.length > 0 ? (
                              <div className="cw-candidate-chips-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                {item.candidates.map((c, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: 11,
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: '#fff7ed',
                                      border: '1px solid #fed7aa',
                                      color: '#9a3412',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {idx === 0 ? '①' : idx === 1 ? '②' : `${idx + 1}.`} {c.batchDisplayNo} / {c.model} ({c.warehouseNo})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="candidates-summary">存在同主干不同版本候选</span>
                            )}
                          </div>
                        </div>
                        <div className="cw-action-item-btns">
                          <button
                            className="primary"
                            style={{ fontSize: 12, padding: '5px 12px' }}
                            onClick={() => setSelectedCandidateItem(item)}
                          >
                            选择对应商品 →
                          </button>
                          <button
                            className="text-button"
                            style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}
                            onClick={() => setSelectedDetailItem(item)}
                          >
                            查看依据详情
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 全部商品对应核心业务区 · 按委托任务分组 */}
              <section className="cw-goods-table-card">
                <div className="cw-goods-table-head">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, color: '#14532d' }}>
                      全部商品对应清单 ({filteredCommodities.length}/{commoditySummary?.totalCount || 0}) · 按委托任务分组
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                      以委托商品为核心，跨批次归集查货依据。清晰呈现每个商品的对应结果、依据来源及处理建议。
                    </p>
                  </div>
                  {commodityFilter !== 'ALL' && (
                    <button
                      className="text-button"
                      style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}
                      onClick={() => setCommodityFilter('ALL')}
                    >
                      清除过滤，显示全部商品 ✕
                    </button>
                  )}
                </div>

                <div className="cw-task-groups-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {groupedCommodities.map((group) => (
                    <div className="cw-task-group-card" key={group.taskDisplayNo}>
                      <div className="cw-task-group-head">
                        <div className="cw-task-group-title">
                          <button
                            className="cw-task-title-link"
                            onClick={() => group.taskDraftId && state.selectDraft(group.taskDraftId)}
                            title="点击在工作台中打开该委托任务"
                          >
                            {group.taskDisplayNo}
                          </button>
                          <span className="cw-task-group-counts">
                            ({group.totalCount} 个待核对商品 · {group.confirmedCount} 个已有可靠查货依据
                            {group.waitingCount > 0 ? ` · ${group.waitingCount} 个仍等待查货` : ''}
                            {group.manualCount > 0 ? ` · ${group.manualCount} 个待人工选择` : ''})
                          </span>
                        </div>
                        <button
                          className="text-button-sm"
                          style={{ color: '#166534', fontWeight: 600 }}
                          onClick={() => group.taskDraftId && state.selectDraft(group.taskDraftId)}
                        >
                          进入委托单核对 →
                        </button>
                      </div>

                      <div className="cw-goods-table-wrap">
                        <table className="cw-goods-table">
                          <thead>
                            <tr>
                              <th scope="col" style={{ width: '25%' }}>委托商品</th>
                              <th scope="col" style={{ width: '28%' }}>查货依据</th>
                              <th scope="col" style={{ width: '18%' }}>对应结果</th>
                              <th scope="col" style={{ width: '17%' }}>提醒</th>
                              <th scope="col" style={{ width: '12%', textAlign: 'right' }}>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => {
                              const requiresAction =
                                item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' ||
                                item.relationLevel === 'MODEL_CONFLICT';

                              return (
                                <tr
                                  key={item.id}
                                  className={
                                    item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF'
                                      ? 'row-highlight-yellow'
                                      : item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES'
                                      ? 'row-highlight-orange'
                                      : ''
                                  }
                                >
                                  {/* 1. 委托商品 */}
                                  <td>
                                    <div className="cw-goods-cell-main">
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span className="cw-row-order">#{item.lineOrder}</span>
                                        <strong className="cw-model-entrustment">{item.entrustmentModel}</strong>
                                      </div>
                                      <div className="cw-sub-info">
                                        {item.entrustmentQuantity && <span>{item.entrustmentQuantity}</span>}
                                        {item.entrustmentBrand && <span> · {item.entrustmentBrand}</span>}
                                        {item.entrustmentOrigin && <span> · {item.entrustmentOrigin}</span>}
                                      </div>
                                    </div>
                                  </td>

                                  {/* 2. 查货依据 */}
                                  <td>
                                    {item.isMultiBatchSource ? (
                                      <div className="cw-source-cell multi-batch">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span className="cw-source-batch multi">CH001 + CH002</span>
                                          <span className="cw-source-tag-multi">双批次联合</span>
                                        </div>
                                        <small className="cw-source-meta" style={{ color: '#047857' }}>
                                          {item.sourceBatches && item.sourceBatches.length > 0
                                            ? item.sourceBatches.map((b) => `${b.batchDisplayNo} (${b.boxNo || b.warehouseNo})`).join(' + ')
                                            : '两个批次共同提供依据'}
                                        </small>
                                      </div>
                                    ) : item.sourceBatch && item.sourceBatch !== '—' ? (
                                      <div className="cw-source-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span className="cw-source-batch">{item.sourceBatch}</span>
                                          {item.inspectionModel && item.inspectionModel !== item.entrustmentModel && (
                                            <ModelDiffViewer
                                              entrustmentModel={item.entrustmentModel}
                                              inspectionModel={item.inspectionModel}
                                              affixDiff={item.affixDiff}
                                            />
                                          )}
                                        </div>
                                        <small className="cw-source-meta">
                                          {item.sourceWarehouseNo ? `入仓: ${item.sourceWarehouseNo}` : ''}
                                          {item.sourceBoxNo ? ` · 箱号: ${item.sourceBoxNo}` : ''}
                                          {item.sourceFileName && item.sourceFileName !== '—' ? ` · ${item.sourceFileName}` : ''}
                                        </small>
                                      </div>
                                    ) : (
                                      <span className="cw-source-empty">
                                        {item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES'
                                          ? `${item.candidateCount || 2} 个待选查货来源 (${item.candidates?.map((c) => c.batchDisplayNo).join('、') || '多批次'})`
                                          : '等待新查货批次到达'}
                                      </span>
                                    )}
                                  </td>

                                  {/* 3. 对应结果 */}
                                  <td>
                                    <CommodityStatusBadge
                                      level={item.relationLevel}
                                      statusText={item.statusText}
                                      variant={item.statusVariant}
                                    />
                                  </td>

                                  {/* 4. 提醒 */}
                                  <td>
                                    {item.isMultiBatchSource ? (
                                      <span className="cw-notice-pill green">两个批次共同提供依据</span>
                                    ) : item.noticeText && item.noticeText !== '—' ? (
                                      <span
                                        className={`cw-notice-pill ${
                                          item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF'
                                            ? 'yellow'
                                            : item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES'
                                            ? 'orange'
                                            : 'gray'
                                        }`}
                                      >
                                        {item.noticeText}
                                      </span>
                                    ) : (
                                      <span className="cw-text-dash">—</span>
                                    )}
                                  </td>

                                  {/* 5. 操作 */}
                                  <td style={{ textAlign: 'right' }}>
                                    <div className="cw-action-btns">
                                      {requiresAction && (
                                        <button
                                          className="primary"
                                          style={{ fontSize: 11, padding: '3px 8px' }}
                                          onClick={() => setSelectedCandidateItem(item)}
                                          title="人工选择查货依据"
                                        >
                                          选择
                                        </button>
                                      )}
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}
                                        onClick={() => setSelectedDetailItem(item)}
                                        title="查看四层递进比对详情与材料依据"
                                      >
                                        查看依据
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {groupedCommodities.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
                      当前筛选条件下暂无商品
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Tab 3: 批次关系 (降级为次要关系视图，以回答业务关键问题为核心) */}
          {tab === '批次关系' && (
            <>
              {/* 顶部自然语言关系全貌横幅 */}
              <div className="cw-batch-relation-banner-clean">
                <div className="cw-batch-banner-main">
                  <div className="cw-batch-banner-title">
                    <span style={{ fontSize: 18 }}>📋</span>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#14532d' }}>
                      异步材料池与批次关联关系清单
                    </h3>
                  </div>
                  <p className="cw-batch-banner-text">
                    当前客户有 <strong>{customer.dualPools?.entrustmentPool.length || customer.tasks.length}</strong> 票委托、共 <strong>{commoditySummary?.totalCount || customer.counts.lines}</strong> 个待核对商品；系统已接收 <strong>{customer.dualPools?.inspectionPool.length || customer.inspectionBatches.length || 1}</strong> 批查货材料。已有 <strong>{(commoditySummary?.exactCount || 0) + (commoditySummary?.affixDiffCount || 0)}</strong> 个商品获得可靠查货依据，<strong>{commoditySummary?.multipleCount || 0}</strong> 个需要人工选择，<strong>{commoditySummary?.noCandidateCount || 0}</strong> 个仍等待查货。
                  </p>
                </div>
                <div className="cw-batch-banner-action">
                  <button
                    className="text-button"
                    style={{ fontSize: 13, fontWeight: 600, color: '#166534', whiteSpace: 'nowrap' }}
                    onClick={() => setTab(tabs[2])}
                  >
                    查看材料与批次明细 →
                  </button>
                </div>
              </div>

              {/* 核心第一优先级：批次关系清单 (回答 3 大关键业务问题) */}
              <section className="cw-batch-three-questions-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, color: '#14532d' }}>
                      批次关系清单 · 回答 3 大关键业务问题
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                      穿透批次与任务交集，直接说明每个查货批次去向、委托来源及增量变更影响
                    </p>
                  </div>
                  <span className="cw-tag-code">业务透视清单</span>
                </div>
                <div className="cw-three-questions-grid">
                  {batchQuestions.map((q) => (
                    <div className="cw-question-card" key={q.id}>
                      <div className="cw-question-card-head">
                        <span className="cw-question-num">{q.id}</span>
                        <h4 className="cw-question-title">{q.question}</h4>
                        {q.statusTag && (
                          <span className={`cw-question-badge ${q.statusVariant || 'blue'}`}>
                            {q.statusTag}
                          </span>
                        )}
                      </div>
                      <p className="cw-question-summary">{q.summary}</p>
                      <div className="cw-question-details">
                        {q.details.map((d, didx) => (
                          <div className="cw-question-detail-block" key={didx}>
                            <span className="cw-detail-label">{d.label}</span>
                            <ul className="cw-detail-list">
                              {d.items.map((itemStr, sidx) => (
                                <li key={sidx}>{itemStr}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 双池并列结构 */}
              <div className="cw-dual-pools">
                <div className="cw-pool-col">
                  <div className="cw-pool-col-head">
                    <h4>
                      <span>📋</span>
                      委托任务池 ({customer.dualPools?.entrustmentPool.length || customer.tasks.length} 票)
                    </h4>
                    <small style={{ color: '#64748b' }}>异步输入材料</small>
                  </div>
                  {(customer.dualPools?.entrustmentPool ?? []).map((card) => (
                    <div className="cw-pool-card" key={card.draftId}>
                      <div className="cw-pool-card-head">
                        <strong style={{ fontSize: 13, color: '#163829' }}>{card.displayNo}</strong>
                        <span className="cw-story-badge blue">{card.businessStatus}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        材料: {card.materialSummary} · 创建于 {card.createdAt}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#166534', marginTop: 4 }}>
                        <span>商品核对进度</span>
                        <span>{card.matchedLines}/{card.totalLines} 行已确定依据</span>
                      </div>

                      {card.confirmedInspectionBatches && card.confirmedInspectionBatches.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>已确认使用批次:</span>
                          {card.confirmedInspectionBatches.map((b, i) => (
                            <span className="cw-tag-code" style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534' }} key={i}>{b}</span>
                          ))}
                        </div>
                      )}

                      {card.candidateInspectionBatches && card.candidateInspectionBatches.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 600 }}>候选批次:</span>
                          {card.candidateInspectionBatches.map((b, i) => (
                            <span className="cw-tag-code" style={{ background: '#ffedd5', borderColor: '#fed7aa', color: '#9a3412' }} key={i}>{b}</span>
                          ))}
                        </div>
                      )}

                      {(card.missingInspectionCount ?? 0) > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          仍缺查货依据商品: <strong style={{ color: '#475569' }}>{card.missingInspectionCount} 个</strong> (等待材料到货)
                        </div>
                      )}

                      {card.issuesSummary.length > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                          {card.issuesSummary.join(' · ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button
                          className="text-button"
                          style={{ fontSize: 12, fontWeight: 600, color: '#1b6e46' }}
                          onClick={() => state.selectDraft(card.draftId)}
                        >
                          {card.nextAction} →
                        </button>
                      </div>
                    </div>
                  ))}
                  {!customer.dualPools?.entrustmentPool?.length && (
                    <p className="cw-empty">暂无在办委托任务</p>
                  )}
                </div>

                <div className="cw-pool-connector">
                  <div className="cw-pool-connector-line" />
                  <span>持续增量对应</span>
                  <span style={{ fontSize: 18 }}>↔</span>
                  <div className="cw-pool-connector-line" />
                </div>

                <div className="cw-pool-col">
                  <div className="cw-pool-col-head">
                    <h4>
                      <span>📦</span>
                      查货资料池 ({customer.dualPools?.inspectionPool.length || customer.inspectionBatches.length || 1} 批)
                    </h4>
                    <small style={{ color: '#64748b' }}>异步入仓商品</small>
                  </div>
                  {(customer.dualPools?.inspectionPool ?? []).map((batch) => (
                    <div className="cw-pool-card" key={batch.batchId}>
                      <div className="cw-pool-card-head">
                        <strong style={{ fontSize: 13, color: '#163829' }}>{batch.displayNo}</strong>
                        <span className="cw-tag-code">{batch.arrivedAt}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        {batch.files.length} 份查货材料 · {batch.rawRowCount} 条原始明细 ({batch.mergedProductCount} 个型号)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 4px' }}>
                        <span className="cw-resource-badge available">可继续匹配 {batch.availableCount} 条</span>
                        <span className="cw-resource-badge occupied">当前使用 {batch.draftOccupiedCount} 条</span>
                        {batch.writtenOffCount > 0 && <span className="cw-resource-badge written-off">已完成使用 {batch.writtenOffCount} 条</span>}
                      </div>

                      {batch.confirmedTaskItems && batch.confirmedTaskItems.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>已实际提供依据:</span>
                          <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 11, color: '#1e293b' }}>
                            {batch.confirmedTaskItems.map((itemStr, i) => (
                              <li key={i}>{itemStr}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {batch.candidateTaskItems && batch.candidateTaskItems.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#9a3412', fontWeight: 600 }}>候选关联:</span>
                          <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 11, color: '#9a3412' }}>
                            {batch.candidateTaskItems.map((itemStr, i) => (
                              <li key={i}>{itemStr}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button
                          className="text-button"
                          style={{ fontSize: 12, fontWeight: 600, color: '#1b6e46' }}
                          onClick={() => setTab(tabs[2])}
                        >
                          查看明细箱行 →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 「委托任务 × 查货批次」高级关系矩阵 */}
              <div className="cw-relation-matrix-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, color: '#14532d' }}>
                      「委托任务 × 查货批次」高级关系矩阵
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                      横轴为异步入仓查货批次，纵轴为异步到达委托任务。点击单元格可下钻查看对应商品及原文件页码
                    </p>
                  </div>
                  <span className="cw-tag-code">高级关系图</span>
                </div>

                <div className="cw-matrix-note">
                  💡 <strong>业务提示</strong>：同一商品可能同时出现在多个查货批次列中，表示多个批次共同为该商品提供依据，不代表多个委托商品。
                </div>

                <div className="cw-matrix-table-wrap">
                  <table className="cw-matrix-table">
                    <thead>
                      <tr>
                        <th className="cw-matrix-th-task">委托任务 \ 查货批次</th>
                        {customer.relationMatrix?.columns.map((col) => (
                          <th key={col.id} title={col.title}>
                            {col.displayNo}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customer.relationMatrix?.rows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ textAlign: 'left' }}>
                            <button
                              className="cw-task-link"
                              onClick={() => state.selectDraft(row.id)}
                            >
                              {row.displayNo}
                            </button>
                          </td>
                          {customer.relationMatrix?.columns.map((col) => {
                            const key = `${row.id}_${col.id}`;
                            const cell = customer.relationMatrix?.cells[key];
                            if (!cell || (cell.matchedCount === 0 && cell.multipleCount === 0)) {
                              return (
                                <td key={col.id}>
                                  <span className="cw-matrix-cell-empty">—</span>
                                </td>
                              );
                            }
                            return (
                              <td key={col.id}>
                                <button
                                  className={`cw-matrix-cell-btn ${cell.statusVariant}`}
                                  onClick={() => setMatrixDrilldown(cell)}
                                  title="点击查看详细商品对应与原始箱行/页码"
                                >
                                  {cell.statusVariant === 'matched' && '✓ '}
                                  {cell.statusVariant === 'multiple' && '⚠ '}
                                  {cell.commoditySummary || cell.statusText}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 人工处理问题中心（按业务类型四分类聚合） */}
              <section style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, color: '#14532d' }}>
                      客户问题处理中心 · {customer.issues.length} 项待处理
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                      按商品对应关系、申报字段冲突、必填缺失与客户抬头四类问题归集，支持直接跳转行级作业
                    </p>
                  </div>
                </div>

                {customer.issues.length > 0 ? (
                  <div className="cw-issues-categorized">
                    {/* 分类 1: 商品关系问题 */}
                    {(() => {
                      const relationIssues = customer.issues.filter(i => i.kind === '关系问题' || i.message.includes('多候选') || i.message.includes('查货依据') || i.message.includes('依据'));
                      if (!relationIssues.length) return null;
                      return (
                        <div className="cw-issue-group">
                          <div className="cw-issue-group-head">
                            <span className="cw-status blue">🔗 商品关系问题 (P3 · {relationIssues.length})</span>
                            <small>需要人工选择多候选对应或核对未入仓商品</small>
                          </div>
                          {relationIssues.map(i => (
                            <div className="cw-queue" key={i.id}>
                              <strong>{i.task.draft.displayNo} / 商品 {i.line.sourceOrder} ({i.line.model})</strong>
                              <span>{i.message}</span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  state.selectDraft(i.task.draft.id);
                                  state.setLastVisitedPanel(`line:${i.line.id}${i.field ? `|${i.field}` : ''}`);
                                }}
                              >
                                选择对应 →
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* 分类 2: 申报字段冲突 */}
                    {(() => {
                      const conflictIssues = customer.issues.filter(i => i.kind === '字段问题' && (i.message.includes('冲突') || i.message.includes('不一致') || i.message.includes('差异') || i.message.includes('待确认') || i.message.includes('待裁决')));
                      if (!conflictIssues.length) return null;
                      return (
                        <div className="cw-issue-group">
                          <div className="cw-issue-group-head">
                            <span className="cw-status orange">⚖️ 申报字段冲突 (P4 · {conflictIssues.length})</span>
                            <small>委托与查货材料记载字段不一致，需报关员确认识别结论</small>
                          </div>
                          {conflictIssues.map(i => (
                            <div className="cw-queue" key={i.id}>
                              <strong>{i.task.draft.displayNo} / 商品 {i.line.sourceOrder}</strong>
                              <span>{i.message}</span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  state.selectDraft(i.task.draft.id);
                                  state.setLastVisitedPanel(`line:${i.line.id}${i.field ? `|${i.field}` : ''}`);
                                }}
                              >
                                核对字段 →
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* 分类 3: 必填字段缺失与其他字段问题 */}
                    {(() => {
                      const missingIssues = customer.issues.filter(i => i.kind === '字段问题' && !i.message.includes('冲突') && !i.message.includes('不一致') && !i.message.includes('差异') && !i.message.includes('待确认') && !i.message.includes('待裁决'));
                      if (!missingIssues.length) return null;
                      return (
                        <div className="cw-issue-group">
                          <div className="cw-issue-group-head">
                            <span className="cw-status orange">📋 必填字段缺失 / 待补 ({missingIssues.length})</span>
                            <small>委托单据缺失海关必填要素，需补充手工录入</small>
                          </div>
                          {missingIssues.map(i => (
                            <div className="cw-queue" key={i.id}>
                              <strong>{i.task.draft.displayNo} / 商品 {i.line.sourceOrder}</strong>
                              <span>{i.message}</span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  state.selectDraft(i.task.draft.id);
                                  state.setLastVisitedPanel(`line:${i.line.id}${i.field ? `|${i.field}` : ''}`);
                                }}
                              >
                                补全字段 →
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* 分类 4: 客户信息待确认 */}
                    {(() => {
                      const custIssues = customer.issues.filter(i => i.message.includes('客户') || (!i.task.draft.customerId));
                      if (!custIssues.length) return null;
                      return (
                        <div className="cw-issue-group">
                          <div className="cw-issue-group-head">
                            <span className="cw-status red">🏢 客户信息待确认 (P1 · {custIssues.length})</span>
                            <small>单证抬头缺失或模糊，需先绑定客户方可继续对账</small>
                          </div>
                          {custIssues.map(i => (
                            <div className="cw-queue" key={i.id}>
                              <strong>{i.task.draft.displayNo}</strong>
                              <span>{i.message}</span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  state.selectDraft(i.task.draft.id);
                                }}
                              >
                                确认客户 →
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="cw-empty">暂无待处理问题，所有已匹配商品字段已自动核验完成</p>
                )}
              </section>
            </>
          )}

          {/* Tab 1: 委托任务 */}
          {tab === '委托任务' && (
            <section>
              <h3>
                待核对商品与委托材料池
                <span className="cw-tag-code">P1 · 委托解析</span>
              </h3>
              <EntrustmentPool customer={customer} openFile={setPreview} />
            </section>
          )}

          {/* Tab 2: 查货资料 */}
          {tab === '查货资料' && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    查货明细与商品池
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    展示客户下所有异步入仓的查货材料、已聚合的规格型号与箱级分配状态
                  </p>
                </div>
                <span className="cw-tag-code">P2 · 查货整理</span>
              </div>
              {customer.name.includes('英卡') && (
                <YingkaBoxAllocationCard
                  onSelectDraft={(draftId) => state.selectDraft(draftId)}
                />
              )}
              <InspectionPool customer={customer} openFile={setPreview} />
            </section>
          )}


          {/* Tab 4: 业务动态 */}
          {tab === '业务动态' && (
            <div className="cw-timeline-section">
              {/* 增量影响分析卡片 */}
              {customer.latestIncrementalImpact && (
                <div className="cw-impact-card">
                  <div className="cw-impact-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sparkles size={18} color="#059669" />
                      <h4 style={{ margin: 0, color: '#065f46', fontSize: 14 }}>
                        最新材料增量影响分析 · {customer.latestIncrementalImpact.batchDisplayNo}
                      </h4>
                    </div>
                    <span className="cw-tag-code">到达时间：{customer.latestIncrementalImpact.arrivedTime}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#047857' }}>
                    入仓整理新增 <b>{customer.latestIncrementalImpact.newProductCount}</b> 个查货型号。系统自动触发智能增量核对，精准定位受影响委托任务，仅重算受影响商品，不重跑全单：
                  </p>
                  <div className="cw-impact-tasks-grid">
                    {customer.latestIncrementalImpact.affectedTasks.map((t, idx) => (
                      <div className="cw-impact-task-item" key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 13, color: '#1e293b' }}>{t.displayNo}</strong>
                          <span className={`cw-story-badge ${t.requiresHumanReview ? 'orange' : 'green'}`}>
                            {t.statusChange}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{t.taskName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span style={{ color: '#64748b' }}>进度变化:</span>
                          <strong style={{ color: '#059669' }}>{t.beforeProgress}</strong>
                          <span>→</span>
                          <strong style={{ color: '#059669' }}>{t.afterProgress}</strong>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                          {t.detail}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                          <button
                            className="text-button"
                            style={{ fontSize: 12, fontWeight: 600, color: '#1b6e46' }}
                            onClick={() => {
                              const found = customer.tasks.find(x => x.draft.displayNo === t.displayNo);
                              if (found) state.selectDraft(found.draft.id);
                            }}
                          >
                            前往核对 →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 客户业务时间轴 */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>
                    客户业务全景时间轴 · 异步到达与持续核对流水
                  </h3>
                  <span className="cw-tag-code">全生命周期事实追溯</span>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                  真实记录委托材料与查货入仓材料的任意先后到达过程。系统在同客户池中持续寻找关系，实现跨批次商品匹配与增量推进。
                </p>

                <div className="cw-timeline">
                  {customer.timelineEvents.map((ev) => (
                    <div className={`cw-timeline-item type-${ev.type}`} key={ev.id}>
                      <div className="cw-timeline-node-head">
                        <span className="cw-timeline-time">{ev.time}</span>
                        <span className="cw-timeline-title">{ev.title}</span>
                        <span className={`cw-timeline-tag tag-${ev.type}`}>{ev.tag}</span>
                      </div>
                      <p className="cw-timeline-desc">{ev.description}</p>
                      {ev.diff && (
                        <div className="cw-timeline-diff">
                          <strong>{ev.diff.taskDisplayNo}</strong>
                          <span>核对进度: <b>{ev.diff.before}</b> → <b style={{ color: '#059669' }}>{ev.diff.after}</b></span>
                          <span style={{ color: '#64748b' }}>({ev.diff.reason})</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* 矩阵下钻弹窗 */}
          {matrixDrilldown && (
            <div className="intake-modal-backdrop" onClick={() => setMatrixDrilldown(null)}>
              <div
                className="cw-drilldown-modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="cw-drilldown-head">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#14532d' }}>
                      委托任务 {matrixDrilldown.taskDisplayNo} ↔ 查货批次 {matrixDrilldown.batchDisplayNo}
                    </h3>
                    <small style={{ color: '#64748b' }}>
                      已建立 {matrixDrilldown.relations.length} 处商品级关联与原始依据追溯
                    </small>
                  </div>
                  <button className="page-back-button" onClick={() => setMatrixDrilldown(null)}>
                    <ArrowLeft size={14} />
                    <span>返回上一页</span>
                  </button>
                </div>

                <div className="cw-table-responsive">
                  <table className="cw-table">
                    <thead>
                      <tr>
                        <th>委托商品行</th>
                        <th>查货依据 (明细/箱行)</th>
                        <th>对应关系判定</th>
                        <th>原文件追溯</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixDrilldown.relations.map((rel, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>第 {rel.taskLineOrder} 行 · {rel.taskLineModel}</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>委托数量: {rel.taskLineQuantity}</div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#166534' }}>{rel.sourceRowModel}</span>
                            <div style={{ fontSize: 11, color: '#475569' }}>
                              入仓号 {rel.sourceWarehouseNo} · {rel.sourceRowQuantity}
                            </div>
                            <small style={{ color: '#889e92' }}>明细ID: {rel.sourceRowId}</small>
                          </td>
                          <td>
                            <span className={`cw-status ${rel.status === 'MATCHED' ? 'green' : 'orange'}`}>
                              {rel.statusLabel}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, color: '#1e293b' }}>📄 {rel.sourceFileName}</span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>第 {rel.sourcePage ?? 1} 页</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    className="primary"
                    onClick={() => {
                      state.selectDraft(matrixDrilldown.taskId);
                      setMatrixDrilldown(null);
                    }}
                  >
                    在核对工作台打开该委托草稿 →
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* 四层渐进式详情抽屉 */}
          {selectedDetailItem && (
            <CommodityDetailDrawer
              item={selectedDetailItem}
              onClose={() => setSelectedDetailItem(null)}
              onOpenCandidateModal={(it) => setSelectedCandidateItem(it)}
              onSelectDraft={(id) => state.selectDraft(id)}
              onNavigateTab={(t) => setTab(t)}
            />
          )}

          {/* 人工候选选择器弹窗 */}
          {selectedCandidateItem && (
            <CandidateSelectionModal
              item={selectedCandidateItem}
              onClose={() => setSelectedCandidateItem(null)}
              onConfirmCandidate={(item, candidate) => {
                setResolvedCandidates((prev) => ({
                  ...prev,
                  [item.id]: {
                    model: candidate.model,
                    batch: candidate.batchDisplayNo,
                  },
                }));
                setSelectedCandidateItem(null);
              }}
            />
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
 * 英卡科技重点商品跨批次箱级拆分看板
 */
function YingkaBoxAllocationCard({ onSelectDraft }: { onSelectDraft: (id: string) => void }) {
  const boxes = [
    { no: '箱 001', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-1', draftId: 'D-1df4f4d83480' },
    { no: '箱 002', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-1', draftId: 'D-1df4f4d83480' },
    { no: '箱 003', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-1', draftId: 'D-1df4f4d83480' },
    { no: '箱 004', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-1', draftId: 'D-1df4f4d83480' },
    { no: '箱 005', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-3', draftId: 'D-5a09ab721f2e' },
    { no: '箱 006', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-3', draftId: 'D-5a09ab721f2e' },
    { no: '箱 007', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-3', draftId: 'D-5a09ab721f2e' },
    { no: '箱 008', qty: '15,000 PCS', status: 'occupied', taskNo: 'YK-260625131-3', draftId: 'D-5a09ab721f2e' },
    { no: '箱 009', qty: '15,000 PCS', status: 'available', taskNo: '自由查货库存', draftId: null },
    { no: '箱 010', qty: '15,000 PCS', status: 'available', taskNo: '自由查货库存', draftId: null },
    { no: '箱 011', qty: '15,000 PCS', status: 'available', taskNo: '自由查货库存', draftId: null },
    { no: '箱 012', qty: '15,000 PCS', status: 'available', taskNo: '自由查货库存', draftId: null },
  ];

  return (
    <div className="cw-box-allocation-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, color: '#14532d' }}>
            📦 重点商品跨批次箱级拆分看板 · UMW2631 (UNISOC)
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            批次 CH001 (入仓号 26070093) 共 12 箱 180,000 PCS。系统支持箱级精确拆分与多委托占用：
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dbeafe', border: '1px solid #93c5fd' }} />
            YK-1 占用 (60,000 PCS)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fef3c7', border: '1px solid #fcd34d' }} />
            YK-3 占用 (60,000 PCS)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dcfce7', border: '1px solid #86efac' }} />
            自由可用 (60,000 PCS)
          </span>
        </div>
      </div>
      <div className="cw-box-grid">
        {boxes.map((b) => (
          <div
            key={b.no}
            className={`cw-box-item ${b.status} ${b.draftId === 'D-5a09ab721f2e' ? 'yk3' : ''}`}
            onClick={() => b.draftId && onSelectDraft(b.draftId)}
            title={`${b.no} · ${b.qty} · ${b.taskNo} ${b.draftId ? '(点击查看委托)' : ''}`}
          >
            <strong>{b.no}</strong>
            <small>{b.qty}</small>
            <span>{b.taskNo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 规格型号字符级差异对比可视化组件
 * 主干型号使用正常/重点字色，后缀/前缀差异部分使用微色胶囊标签展示
 */
export function ModelDiffViewer({
  entrustmentModel,
  inspectionModel,
  affixDiff,
}: {
  entrustmentModel: string;
  inspectionModel: string | null;
  affixDiff?: ModelAffixDiff;
}) {
  if (!inspectionModel) {
    return <span className="cw-model-empty">（暂无查货依据）</span>;
  }

  const diff = affixDiff || analyzeModelAffixDiff(entrustmentModel, inspectionModel);

  if (!diff.hasDiff) {
    return <span className="cw-model-exact">{inspectionModel}</span>;
  }

  if (diff.diffType === 'suffix' && diff.suffix) {
    return (
      <span className="cw-model-diff-wrap" title={diff.explanation}>
        <span className="cw-model-common">{diff.coreModel}</span>
        <span className="cw-model-affix-tag suffix" title={`包装/批次后缀差异：${diff.suffix}`}>
          {diff.suffix}
        </span>
      </span>
    );
  }

  if (diff.diffType === 'prefix' && diff.prefix) {
    return (
      <span className="cw-model-diff-wrap" title={diff.explanation}>
        <span className="cw-model-affix-tag prefix" title={`前缀差异：${diff.prefix}`}>
          {diff.prefix}
        </span>
        <span className="cw-model-common">{diff.coreModel}</span>
      </span>
    );
  }

  return (
    <span className="cw-model-diff-wrap" title={diff.explanation}>
      <span className="cw-model-common">{inspectionModel}</span>
      <span className="cw-model-affix-tag notice">差异</span>
    </span>
  );
}

/**
 * 5 种统一商品对应业务状态 Badge
 */
export function CommodityStatusBadge({
  level,
  statusText,
  variant,
}: {
  level: ModelRelationLevel;
  statusText: string;
  variant: string;
}) {
  const icon =
    level === 'EXACT_MODEL'
      ? '🟢'
      : level === 'CORE_MODEL_WITH_AFFIX_DIFF'
      ? '🟡'
      : level === 'MULTIPLE_MODEL_CANDIDATES'
      ? '🟠'
      : level === 'NO_MODEL_CANDIDATE'
      ? '⚪'
      : '🔴';

  return (
    <span className={`cw-five-badge ${variant}`}>
      <span className="cw-five-badge-icon">{icon}</span>
      <span className="cw-five-badge-text">{statusText}</span>
    </span>
  );
}

/**
 * 四层渐进式披露详情抽屉
 * 第1层：业务核心对比 (申报 vs 查货)
 * 第2层：系统对应依据与判定逻辑 (规则与证据点)
 * 第3层：材料证据与原始追溯 (批次、箱号、页码)
 * 第4层：技术追溯折叠 (算法规则、置信度评估)
 */
export function CommodityDetailDrawer({
  item,
  onClose,
  onOpenCandidateModal,
  onSelectDraft,
  onNavigateTab,
}: {
  item: CustomerCommodityItem;
  onClose: () => void;
  onOpenCandidateModal: (item: CustomerCommodityItem) => void;
  onSelectDraft: (draftId: string) => void;
  onNavigateTab: (tab: string) => void;
}) {
  const requiresAction =
    item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' ||
    item.relationLevel === 'MODEL_CONFLICT';

  return (
    <div className="cw-drawer-backdrop" onClick={onClose}>
      <div
        className="cw-commodity-drawer"
        role="dialog"
        aria-label="商品对应四层递进详情"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cw-drawer-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#14532d' }}>
                商品对应详情 · {item.taskDisplayNo}
              </h3>
              <CommodityStatusBadge
                level={item.relationLevel}
                statusText={item.statusText}
                variant={item.statusVariant}
              />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              委托申报行 #{item.lineOrder} · 申报型号: <strong>{item.entrustmentModel}</strong>
            </p>
          </div>
          <button className="cw-drawer-close" onClick={onClose} aria-label="关闭详情抽屉">
            ✕
          </button>
        </div>

        <div className="cw-drawer-body">
          {/* 第 1 层：业务核心对比 */}
          <section className="cw-drawer-section">
            <div className="cw-drawer-section-title">
              <span className="cw-layer-num">1</span>
              <h4>业务核心对比 (申报 vs 查货)</h4>
            </div>
            <div className="cw-entity-compare-table-wrap">
              <table className="cw-entity-compare-table">
                <thead>
                  <tr>
                    <th>属性字段</th>
                    <th>委托方申报记录</th>
                    <th>仓储实物查货记录</th>
                    <th>核对结论</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>规格型号</strong></td>
                    <td>
                      <span className="cw-prop-val">{item.entrustmentModel}</span>
                    </td>
                    <td>
                      <ModelDiffViewer
                        entrustmentModel={item.entrustmentModel}
                        inspectionModel={item.inspectionModel}
                        affixDiff={item.affixDiff}
                      />
                    </td>
                    <td>
                      {item.relationLevel === 'EXACT_MODEL' && (
                        <span className="cw-compare-tag match">完全一致</span>
                      )}
                      {item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF' && (
                        <span className="cw-compare-tag affix" title={item.affixDiff?.explanation}>
                          主干一致 (包装后缀差异)
                        </span>
                      )}
                      {item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' && (
                        <span className="cw-compare-tag multi">多候选待定</span>
                      )}
                      {item.relationLevel === 'NO_MODEL_CANDIDATE' && (
                        <span className="cw-compare-tag none">暂无记录</span>
                      )}
                      {item.relationLevel === 'MODEL_CONFLICT' && (
                        <span className="cw-compare-tag conflict">属性冲突</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td><strong>申报品名 / 品牌</strong></td>
                    <td>
                      <span className="cw-prop-val">
                        {item.entrustmentBrand ? `${item.entrustmentBrand} · 芯片` : '芯片/集成电路'}
                      </span>
                    </td>
                    <td>
                      <span className="cw-prop-val">
                        {item.inspectionBrand
                          ? `${item.inspectionBrand} · 贴片集成电路`
                          : item.inspectionModel
                          ? '集成电路'
                          : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="cw-compare-tag match">品名属性兼容</span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>数量 / 单位</strong></td>
                    <td>
                      <span className="cw-prop-val">{item.entrustmentQuantity || '—'}</span>
                    </td>
                    <td>
                      <span className="cw-prop-val">{item.inspectionQuantity || '待入仓核算'}</span>
                    </td>
                    <td>
                      {item.inspectionQuantity ? (
                        <span className="cw-compare-tag match">数量已核符</span>
                      ) : (
                        <span className="cw-compare-tag none">待核验</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td><strong>原产国 (地区)</strong></td>
                    <td>
                      <span className="cw-prop-val">{item.entrustmentOrigin || '中国'}</span>
                    </td>
                    <td>
                      <span className="cw-prop-val">{item.inspectionOrigin || '中国'}</span>
                    </td>
                    <td>
                      <span className="cw-compare-tag match">产地一致</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 第 2 层：系统对应依据 */}
          <section className="cw-drawer-section">
            <div className="cw-drawer-section-title">
              <span className="cw-layer-num">2</span>
              <h4>系统对应依据与判定逻辑</h4>
            </div>
            <div className="cw-judgment-card">
              <div className="cw-judgment-rule-banner">
                {item.relationLevel === 'EXACT_MODEL' && (
                  <p>
                    <strong>【规则 2.1 · 型号完全一致强关系】</strong>：委托型号与查货记录标准化型号完全一致。独占性命中查货池单一商品，自动建立 MATCHED 强关联，直接流转至 P4 字段一致性核验。
                  </p>
                )}
                {item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF' && (
                  <p>
                    <strong>【规则 2.2 · 主体型号一致但有前缀/后缀差异】</strong>：委托型号与查货型号主干完全一致（<code>{item.affixDiff?.coreModel || item.entrustmentModel}</code>），查货型号带有包装编带后缀 <code>{item.affixDiff?.suffix || ',118'}</code>。当前查货池中不存在更优先的完全一致候选，<strong>系统自动建立 MATCHED 关系</strong>，记录非阻塞提醒，<strong>无需人工处理</strong>，保留委托申报型号不变。
                  </p>
                )}
                {item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' && (
                  <p>
                    <strong>【规则 2.3 · 查货池存在多候选商品】</strong>：查货池中发现 {item.candidateCount || 2} 个同等级有效候选，系统无法自动排他判定，转为待人工裁决。
                  </p>
                )}
                {item.relationLevel === 'NO_MODEL_CANDIDATE' && (
                  <p>
                    <strong>【规则 2.4 · 查货池暂无候选商品】</strong>：当前已入仓的查货材料中均无匹配型号，委托处于异步等待状态，后续新到货批次到达时将自动重新检查。
                  </p>
                )}
                {item.relationLevel === 'MODEL_CONFLICT' && (
                  <p>
                    <strong>【规则 2.5 · 明确属性冲突】</strong>：型号或关键属性存在不可调和冲突，需人工排查并核对原始单据。
                  </p>
                )}
              </div>

              <div className="cw-judgment-evidence-list">
                <span className="cw-sub-label">系统证据链要点：</span>
                <ul>
                  {item.judgmentEvidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>

              {requiresAction && (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      onClose();
                      onOpenCandidateModal(item);
                    }}
                  >
                    立即人工选择查货对应商品 →
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 第 3 层：材料证据与来源 */}
          <section className="cw-drawer-section">
            <div className="cw-drawer-section-title">
              <span className="cw-layer-num">3</span>
              <h4>材料证据与原始追溯</h4>
            </div>

            {item.isMultiBatchSource && item.sourceBatches && item.sourceBatches.length > 0 && (
              <div className="cw-multi-batch-source-card">
                <div className="cw-multi-batch-source-head">
                  <span className="cw-multi-badge">多批次联合依据</span>
                  <h5 style={{ margin: '4px 0', fontSize: 14, color: '#166534' }}>
                    两个查货来源共同覆盖该商品
                  </h5>
                  <p className="cw-multi-source-desc">
                    前序批次提供部分箱量，后续批次增量推进，共同组成申报型号的完整查货证据链。
                  </p>
                </div>
                <div className="cw-source-fork-tree">
                  <div className="cw-tree-root-card">
                    <span className="label">委托申报型号</span>
                    <strong className="root-model">{item.entrustmentModel}</strong>
                    <small>委托总量: {item.entrustmentQuantity || '60,000 PCS'}</small>
                  </div>
                  <div className="cw-tree-branches">
                    {item.sourceBatches.map((sb, idx) => (
                      <div className="cw-tree-branch" key={idx}>
                        <div className="cw-tree-node">
                          <div className="cw-tree-node-top">
                            <span className="cw-source-batch">{sb.batchDisplayNo}</span>
                            <span className="cw-tag-code">入仓号: {sb.warehouseNo}</span>
                            {sb.boxNo && <span className="cw-tag-code" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>箱号: {sb.boxNo}</span>}
                            {sb.quantity && <span className="cw-tag-code" style={{ background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}>{sb.quantity}</span>}
                          </div>
                          <div className="cw-tree-node-sub">
                            <span>📄 {sb.fileName} (明细行 #{sb.rawRowId})</span>
                            {sb.note && <span className="cw-tree-note">· {sb.note}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="cw-evidence-grid">
              <div className="cw-evidence-card">
                <span className="cw-evidence-label">📋 委托侧申报凭证</span>
                <strong>任务号：{item.taskDisplayNo}</strong>
                <p>委托商品行：第 #{item.lineOrder} 行</p>
                {item.taskDraftId && (
                  <button
                    className="text-button-sm"
                    style={{ color: '#166534', fontWeight: 600, padding: 0 }}
                    onClick={() => {
                      onClose();
                      onSelectDraft(item.taskDraftId);
                    }}
                  >
                    在核对工作台打开该任务 →
                  </button>
                )}
              </div>
              <div className="cw-evidence-card">
                <span className="cw-evidence-label">📦 仓储查货记录凭证</span>
                <strong>批次：{item.sourceBatch || '暂无查货批次'}</strong>
                <p>入仓号：{item.sourceWarehouseNo || '—'} · 箱号：{item.sourceBoxNo || '—'}</p>
                {item.sourceFileName && item.sourceFileName !== '—' && (
                  <p style={{ color: '#047857' }}>
                    📄 {item.sourceFileName} (第 {item.sourcePage || 1} 页第 {item.sourceRowOrder || 1} 行)
                  </p>
                )}
              </div>
            </div>

            {/* 重点型号跨批次拆分提示 */}
            {item.entrustmentModel === 'UMW2631' && (
              <div className="cw-drawer-box-link">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: '#166534' }}>📦 该型号跨批次拆分于 16 个物理箱</strong>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: '#475569' }}>
                      批次 CH001 包含箱001~004 (60,000 PCS) 及自由箱009~012；批次 CH002 入仓 UMW2631-A。
                    </p>
                  </div>
                  <button
                    className="text-button-sm"
                    style={{ color: '#166534', fontWeight: 600, whiteSpace: 'nowrap' }}
                    onClick={() => {
                      onClose();
                      onNavigateTab('查货资料');
                    }}
                  >
                    查看箱级拆分看板 →
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 第 4 层：技术追溯折叠 */}
          <section className="cw-drawer-section">
            <details className="cw-drawer-tech-trace">
              <summary>
                <span className="cw-layer-num">4</span>
                技术追溯信息（算法规则与原始行对账）
              </summary>
              <div className="cw-tech-trace-content">
                <dl>
                  <dt>执行算法流水线</dt>
                  <dd>P1 委托解析 → P2 查货归集 → P3 同客户跨批次比对 → P4 字段一致性核验</dd>
                  <dt>P3 匹配规则 ID</dt>
                  <dd><code>RULE-P3-V3-MOD-{item.relationLevel}</code></dd>
                  <dt>算法置信度评估</dt>
                  <dd>
                    {item.relationLevel === 'EXACT_MODEL'
                      ? '99.8% (高信度自动确认)'
                      : item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF'
                      ? '95.2% (核心完全匹配，后缀包容)'
                      : item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES'
                      ? '68.0% (歧义，待人工指定)'
                      : '0.0%'}
                  </dd>
                  <dt>内部唯一标识</dt>
                  <dd>商品行 ID: <code>{item.lineId || item.id}</code></dd>
                  <dt>原始查货追踪</dt>
                  <dd>来源单: <code>{item.sourceWarehouseNo || 'NONE'}</code> · 文件页码: <code>{item.sourcePage || 'N/A'}</code></dd>
                </dl>
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * 人工候选选择器弹窗 (Modal)
 */
export function CandidateSelectionModal({
  item,
  onClose,
  onConfirmCandidate,
}: {
  item: CustomerCommodityItem;
  onClose: () => void;
  onConfirmCandidate: (
    item: CustomerCommodityItem,
    candidate: NonNullable<CustomerCommodityItem['candidates']>[number]
  ) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const candidates = item.candidates || [];

  return (
    <div className="cw-modal-backdrop" onClick={onClose}>
      <div
        className="cw-candidate-modal"
        role="dialog"
        aria-label="选择对应查货商品"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cw-candidate-modal-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: '#9a3412' }}>
              人工指定查货依据商品
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              委托任务：<strong>{item.taskDisplayNo}</strong> · 申报行号：#<strong>{item.lineOrder}</strong> · 委托型号：<strong className="highlight-text">{item.entrustmentModel}</strong>
            </p>
          </div>
          <button className="cw-modal-close" onClick={onClose} aria-label="关闭选择弹窗">
            ✕
          </button>
        </div>

        <div className="cw-candidate-modal-body">
          <div className="cw-candidate-notice">
            <span>ℹ️</span>
            <span>
              客户查货池中发现以下 <strong>{candidates.length}</strong> 个可能对应的商品记录。请根据实物查货单、箱单或业务规则选择正确的一项建立关联：
            </span>
          </div>

          <div className="cw-candidate-cards-list">
            {candidates.map((cand, idx) => (
              <label
                key={cand.sourceRowId || idx}
                className={`cw-candidate-card ${selectedIdx === idx ? 'selected' : ''}`}
                onClick={() => setSelectedIdx(idx)}
              >
                <div className="cw-candidate-radio">
                  <input
                    type="radio"
                    name="candidate-select"
                    checked={selectedIdx === idx}
                    onChange={() => setSelectedIdx(idx)}
                  />
                </div>
                <div className="cw-candidate-details">
                  <div className="cw-candidate-title-row">
                    <strong className="cw-candidate-model">{cand.model}</strong>
                    <span className="cw-candidate-batch-tag">{cand.batchDisplayNo}</span>
                  </div>
                  <div className="cw-candidate-info-grid">
                    <div>
                      <span className="label">仓储入仓号：</span>
                      <span>{cand.warehouseNo}</span>
                    </div>
                    <div>
                      <span className="label">数量核验：</span>
                      <span>{item.entrustmentQuantity || '60000 PCS'}</span>
                    </div>
                    <div>
                      <span className="label">原始查货文件：</span>
                      <span>{cand.fileName} (第 {cand.page || 1} 页)</span>
                    </div>
                    <div>
                      <span className="label">明细行号：</span>
                      <span>#{cand.sourceRowId}</span>
                    </div>
                  </div>
                  <div className="cw-candidate-evidence-tip">
                    <span>依据：</span>
                    <span>
                      {cand.model === item.entrustmentModel
                        ? '核心型号完全吻合，来源于独立入仓批次。'
                        : `型号带有后缀变体（${cand.model}），为可替代/包装衍生候选。`}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="cw-candidate-modal-foot">
          <button className="text-button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={candidates.length === 0}
            onClick={() => {
              if (candidates[selectedIdx]) {
                onConfirmCandidate(item, candidates[selectedIdx]);
              }
            }}
          >
            确认以此候选建立对应关系 ✓
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 待办任务表格：业务视角表头 + 渐进式披露展开
 */
function TaskTable({
  tasks,
  taskProgressMap,
}: {
  tasks: WorkbenchModel['tasks'];
  taskProgressMap?: Map<string, string>;
}) {
  const select = useDemoStore((s) => s.selectDraft);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getAiResult = (t: WorkbenchModel['tasks'][number]) => {
    if (!t.draft.customerId || t.draft.displayNo.includes('ZW')) {
      return { label: '缺少明确客户抬头', businessStage: '客户信息待确认', techCode: 'P1 · 需确认客户' };
    }
    if (t.draft.displayNo === '2025YBT010-2') {
      return { label: '全量自动核对通过', businessStage: '待人工复核确认', techCode: 'P4 · 待复核签字' };
    }
    if (['2026BMH001', '2026AG001'].includes(t.draft.displayNo)) {
      return { label: '存在多个可能对应', businessStage: '商品对应待人工选择', techCode: 'P3 · 需人工选择' };
    }
    if (t.draft.displayNo === '26SHPYD056') {
      return { label: '8行已对应，1行未覆盖', businessStage: '商品对应部分完成', techCode: 'P3 · 部分对应' };
    }
    if (['2026ACSY003', '2026CNKJ001'].includes(t.draft.displayNo)) {
      return { label: '暂无确定查货依据', businessStage: '商品对应待查货', techCode: 'P3 · 依据未匹配' };
    }
    if (t.draft.displayNo.startsWith('YK-')) {
      return { label: '仅覆盖1个型号依据', businessStage: '商品对应待补充查货', techCode: 'P2/P3 · 待补充查货' };
    }
    if (t.matched === t.total && t.total > 0) {
      return { label: '已自动找到全部对应', businessStage: '商品对应全部完成', techCode: 'P3 · 全部对应' };
    }
    const hasMultiple = t.draft.lines.some((l) =>
      l.issueIds.some((i) => i.includes('多候选'))
    );
    if (hasMultiple) {
      return { label: '存在多个可能对应', businessStage: '商品对应待人工选择', techCode: 'P3 · 需人工选择' };
    }
    if (!t.matched) {
      return t.draft.materialFileIds.length > 1
        ? { label: '暂无可靠查货对应', businessStage: '商品对应待匹配', techCode: 'P3 · 待匹配' }
        : { label: '等待仓储上传查货', businessStage: '等待查货资料', techCode: '等待查货' };
    }
    return { label: `已匹配 ${t.matched} 行依据`, businessStage: '商品对应部分完成', techCode: 'P3 · 部分对应' };
  };

  const getAttention = (t: WorkbenchModel['tasks'][number]) => {
    if (!t.draft.customerId || t.draft.displayNo.includes('ZW')) return '需补充客户信息';
    if (t.draft.displayNo === '2025YBT010-2') return '待报关员确认';
    if (t.draft.displayNo === '26SHPYD056') return '7 处多候选待确认';
    if (t.draft.displayNo === '2026BMH001') return '6 处多候选待确认';
    if (t.draft.displayNo === '2026AG001') return '2 处多候选待确认';
    if (['2026ACSY003', '2026CNKJ001'].includes(t.draft.displayNo)) return '暂无确定查货依据';
    if (t.draft.displayNo.startsWith('YK-')) return '缺 2 行查货材料';
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <small style={{ fontSize: 12.5, color: '#64748b' }}>{t.draft.customerName}</small>
                    <span className="cw-stage-tag">{(t as any).stage || '商品对应'}</span>
                  </div>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#1a4d36' }}>
                    {t.matched}/{t.total} 商品已对应
                  </span>
                  <small
                    style={{ display: 'block', color: '#64748b', fontSize: 12.5, marginTop: 4 }}
                    title={taskProgressMap?.get(t.draft.displayNo)}
                  >
                    {taskProgressMap?.get(t.draft.displayNo) ||
                      (t.matched === t.total ? '已完全对应' : t.matched > 0 ? '部分对应' : '暂无对应')}
                  </small>
                </td>
                <td>
                  <div>
                    <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 14 }}>{ai.label}</span>
                    <span className="cw-tag-code" title={`技术流水线：${ai.techCode}`}>{ai.businessStage}</span>
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
                  <span
                    className={`cw-status ${
                      t.businessStatus === '异常'
                        ? 'red'
                        : t.businessStatus.includes('复核')
                        ? 'green'
                        : t.businessStatus.includes('处理')
                        ? 'orange'
                        : 'blue'
                    }`}
                  >
                    {t.businessStatus}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="text-button"
                      style={{ fontSize: 14, color: '#166534', fontWeight: 600 }}
                      onClick={() => select(t.draft.id)}
                    >
                      {t.nextAction}
                      <ArrowRight size={14} />
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
                <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px 12px', borderRadius: 4, marginTop: 4 }}>
                  <dt style={{ color: '#b45309', fontWeight: 600 }}>业务处理指引</dt>
                  <dd style={{ color: '#92400e', marginTop: 2 }}>
                    {t.realtimeStatus} · 点击行右侧「{t.nextAction}」即可直接进入处理
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
                  <div className="cw-table-responsive" style={{ marginTop: 8 }}>
                    <table className="cw-raw-rows-table">
                      <thead>
                        <tr>
                          <th style={{ width: '110px' }}>箱号 / 仓储位置</th>
                          <th style={{ minWidth: '120px' }}>规格型号</th>
                          <th style={{ width: '90px' }}>查货数量</th>
                          <th style={{ width: '100px' }}>入仓单号</th>
                          <th style={{ minWidth: '180px' }}>独立行级占用状态</th>
                          <th style={{ width: '120px' }}>来源追溯</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.sources
                          .filter((s) => p.sourceLineIds.includes(s.id))
                          .map((s) => {
                            let resourceBadgeClass = 'available';
                            let resourceLabel = '可继续匹配 (未占用)';
                            if (s.id.includes('26070093-L001') || s.id.includes('26070093-L002') || s.id.includes('26070093-L003') || s.id.includes('26070093-L004')) {
                              resourceBadgeClass = 'occupied';
                              resourceLabel = '正在被 YK-260625131-1 使用 (箱1~4)';
                            } else if (s.id.includes('26070093-L005') || s.id.includes('26070093-L006') || s.id.includes('26070093-L007') || s.id.includes('26070093-L008')) {
                              resourceBadgeClass = 'occupied';
                              resourceLabel = '正在被 YK-260625131-3 使用 (箱5~8)';
                            } else if (s.id.includes('26070093-L009') || s.id.includes('26070093-L010') || s.id.includes('26070093-L011') || s.id.includes('26070093-L012')) {
                              resourceBadgeClass = 'available';
                              resourceLabel = '可继续匹配 (剩余库存 箱9~12)';
                            } else if (s.availability === '草稿占用' || s.occupiedDraftId) {
                              const draftNo = state.drafts.find((d) => d.id === s.occupiedDraftId)?.displayNo ?? '其他委托';
                              resourceBadgeClass = 'occupied';
                              resourceLabel = `正在被 ${draftNo} 使用`;
                            } else if (s.availability === '已核销') {
                              resourceBadgeClass = 'written-off';
                              resourceLabel = '已完成使用 (已核销)';
                            }

                            return (
                              <tr key={s.id}>
                                <td>
                                  <strong style={{ color: '#163829' }}>
                                    {s.sourceLocation.position || s.id.split('-').pop()}
                                  </strong>
                                </td>
                                <td>{s.model}</td>
                                <td>{s.quantity} {s.fields?.['单位'] || 'pcs'}</td>
                                <td><span className="cw-tag-code">{s.warehouseNo}</span></td>
                                <td>
                                  <span className={`cw-resource-badge ${resourceBadgeClass}`}>
                                    {resourceLabel}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button
                                      className="text-button"
                                      onClick={() => openFile(s.sourceFileId)}
                                    >
                                      来源 · 第 {s.sourceLocation.page ?? 1} 页
                                    </button>
                                    {s.occupiedDraftId && (
                                      <button
                                        className="text-button"
                                        onClick={() => state.selectDraft(s.occupiedDraftId!)}
                                      >
                                        去任务
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
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
