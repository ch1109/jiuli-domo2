import type { CustomerModel, WorkbenchModel } from "./customer-workbench-model";
import type { UiDraft } from "./demo-store";

/**
 * 业务语义翻译层：
 * 将系统内部技术术语（P1/P2/P3/P4、原始行、合并商品、逻辑查货单、MATCHED等）
 * 降维翻译为报关业务人员能直接理解的自然语言。
 */

export const BUSINESS_TERMS = {
  entrustmentProduct: "待核对商品",
  inspectionRawRow: "查货明细",
  inspectionMergedProduct: "可匹配商品",
  logicalOrder: "入仓批次 / 查货单",
  p1Stage: "委托材料识别",
  p2Stage: "查货材料识别",
  p3Stage: "商品自动对应",
  p4Stage: "字段自动核对",
  matched: "已找到对应",
  multipleCandidates: "有多个可能对应，需人工选择",
  unmatched: "暂未找到可靠对应",
  completeCoverage: "查货依据完整",
  partialCoverage: "查货依据不完整",
  uncertainCoverage: "覆盖范围待确认",
  draftOccupied: "已用于当前委托",
  finalized: "已完成使用",
} as const;

/**
 * 状态码转换为业务自然语言
 */
export function translateRelationStatus(status: string): { label: string; tag: string } {
  switch (status) {
    case "MATCHED":
      return { label: "已找到可靠查货对应", tag: "已找到对应" };
    case "MULTIPLE_CANDIDATES":
      return { label: "有多个可能对应，需人工选择", tag: "多个候选" };
    case "UNMATCHED":
    case "PENDING":
    default:
      return { label: "暂无可靠查货对应", tag: "暂无对应" };
  }
}

export function translateCoverage(coverage: string | null | undefined): string {
  if (coverage === "COMPLETE") return "查货依据完整";
  if (coverage === "PARTIAL") return "查货依据不完整";
  if (coverage === "UNCERTAIN") return "覆盖范围待确认";
  return "尚未覆盖";
}

export function translateAvailability(availability: string): string {
  if (availability === "草稿占用") return "已用于当前委托";
  if (availability === "已核销") return "已完成使用";
  if (availability === "可匹配") return "可匹配";
  return availability;
}

/**
 * 首页「今日业务概况」模型生成
 */
export interface WorkspaceSummary {
  headline: string;
  storyLead: string;
  storyDetail: string;
  metrics: Array<{
    key: string;
    label: string;
    count: number;
    subtext: string;
    filter: string;
  }>;
}

export function generateWorkspaceSummary(model: WorkbenchModel): WorkspaceSummary {
  const archivedCount = 4; // 历史/归档样本任务数（欧陆通 1 票，智微科技 3 票）
  const totalTasks = model.tasks.length + archivedCount; // 全量 16 票任务
  const processingTasks = model.tasks.filter((t) => t.businessStatus !== "已完成").length; // 处理中 12 票
  const waitingMatchTasks = model.tasks.filter((t) => t.businessStatus === "待匹配" || t.matched < t.total).length;
  const issueTasks = model.tasks.filter(
    (t) => t.businessStatus === "待人工处理" || t.businessStatus === "异常" || t.issues > 0
  ).length;
  // 严格区分待人工复核（等待开启）与人工复核中（正在复核）
  const reviewingTasks = model.tasks.filter(
    (t) => t.businessStatus === "待人工复核" || t.businessStatus === "AI核对完成 · 待人工复核"
  ).length;
  const completedTasks = archivedCount + model.tasks.filter((t) => t.businessStatus === "已完成").length; // 已完成/归档 4 票

  const headline = "今日业务概况";
  const storyLead = `当前有 ${processingTasks} 票委托正在处理。`;

  let middlePart = `其中 ${waitingMatchTasks} 票正在等待查货对应`;
  if (issueTasks > 0) {
    middlePart += `，${issueTasks} 票存在材料或客户信息异常需人工介入`;
  }
  if (reviewingTasks > 0) {
    middlePart += `，${reviewingTasks} 票已完成全量自动核对待人工复核确认`;
  } else {
    middlePart += `。暂时还没有进入人工复核的任务`;
  }
  middlePart += `。另有 ${completedTasks} 票历史委托已全量完成归档`;
  const storyDetail = `${middlePart}。`;

  const metrics = [
    {
      key: "all",
      label: "全部任务",
      count: totalTasks,
      subtext: `覆盖 ${model.customers.length} 家客户（含 ${completedTasks} 票已归档）`,
      filter: "全部",
    },
    {
      key: "processing",
      label: "处理中委托",
      count: processingTasks,
      subtext: "正在推进核对",
      filter: "我的待办",
    },
    {
      key: "waiting",
      label: "等待商品对应",
      count: waitingMatchTasks,
      subtext: "待执行匹配或待查货",
      filter: "等待外部材料",
    },
    {
      key: "issues",
      label: "需人工介入",
      count: issueTasks,
      subtext: "多候选/信息异常",
      filter: "需要人工选择",
    },
    {
      key: "reviewing",
      label: "待人工复核",
      count: reviewingTasks,
      subtext: "核对完成待签字",
      filter: "待最终复核",
    },
    {
      key: "completed",
      label: "已完成归档",
      count: completedTasks,
      subtext: "已生成报关单证",
      filter: "已完成",
    },
  ];

  return { headline, storyLead, storyDetail, metrics };
}

/**
 * 待办任务中心数据结构（严格分离任务阶段、当前进度、阻塞原因、下一步动作四要素）
 */
export interface PendingTaskItem {
  id: string;
  displayNo: string;
  customerId: string | null;
  customerName: string;
  stage: string; // 任务阶段：客户信息确认 | 商品对应 | 字段核对 | 最终复核 | 整单归档
  progressText: string; // 当前进度：如 "8 / 9 个商品找到查货依据"
  compositionalProgress: string; // 构成式进度：如 "9 个商品：8 已自动对应（7 无问题 · 1 有提醒）· 1 暂无查货依据"
  blockingReason: string; // 阻塞原因：如 "7 处多候选需人工确认"、"等待仓储补充查货材料"
  nextActionText: string; // 下一步动作：如 "处理商品对应"、"开始人工复核"
  badge: {
    label: string;
    variant: "blue" | "green" | "orange" | "gray";
  };
  summary: string;
  unresolvedReasons: string[];
  ctaText: string;
  actionType: "select-candidate" | "start-review" | "resolve-customer" | "upload-inspection" | "fix-fields" | "view-final" | "view-pending";
  totalLines: number;
  matchedLines: number;
}

export function generatePendingTasksSummary(model: WorkbenchModel): PendingTaskItem[] {
  return model.tasks.map((task) => {
    const draft = task.draft;
    const no = draft.displayNo;
    const totalLines = draft.lines.length;

    let badge: { label: string; variant: "blue" | "green" | "orange" | "gray" } = { label: "部分商品已对应", variant: "blue" };
    let summary = "商品对应正在推进";
    let unresolvedReasons: string[] = [];
    let ctaText = "查看任务详情";
    let actionType: PendingTaskItem["actionType"] = "view-pending";
    let matchedLines = 0;
    let stage = "商品对应";
    let blockingReason = "等待查货资料对齐";
    let nextActionText = "查看任务详情";

    if (no === "2025YBT010-2") {
      badge = { label: "AI核对完成 · 待复核", variant: "green" };
      summary = "2 个商品均已找到查货依据，16 项申报字段全部自动核对通过";
      unresolvedReasons = ["所有商品已通过自动核验，等待报关员最终确认签字"];
      ctaText = "开始人工复核";
      actionType = "start-review";
      matchedLines = 2;
      stage = "最终复核";
      blockingReason = "无阻塞（AI全流程已核对通过，等待人工复核签字）";
      nextActionText = "开始人工复核";
    } else if (no === "26SHPYD056") {
      badge = { label: "部分商品已对应", variant: "blue" };
      summary = "8 个商品已在查货单找到依据，尚有 1 个商品查无此货";
      unresolvedReasons = [
        "7 个商品存在同型号多批次候选，需人工确认对应关系",
        "1 个商品 (LIS2DU12TR) 查货材料暂无对应原始行",
      ];
      ctaText = "进入核对工作台";
      actionType = "select-candidate";
      matchedLines = 8;
      stage = "商品对应";
      blockingReason = "7 个商品存在同型号多候选，1 个商品未覆盖查货依据";
      nextActionText = "进入核对工作台";
    } else if (no === "2026BMH001") {
      badge = { label: "需要人工选择", variant: "orange" };
      summary = "6 个商品存在多个候选批次，5 个商品暂未在查货单中出现";
      unresolvedReasons = [
        "6 个商品在查货库存在多批次候选，证据不足时不凭目录强配",
        "5 个商品暂未在查货材料中找到依据，待补充查货",
      ];
      ctaText = "进入核对工作台";
      actionType = "select-candidate";
      matchedLines = 6;
      stage = "商品对应";
      blockingReason = "6 处多候选需人工选定入仓对应，5 行等待补充查货";
      nextActionText = "进入核对工作台";
    } else if (no === "2026AG001") {
      badge = { label: "需要人工选择", variant: "orange" };
      summary = "2 个同型号商品存在多候选竞争，需人工指定对应明细";
      unresolvedReasons = ["2 条同型号商品存在多个可能查货对应，保留为多候选待选"];
      ctaText = "进入核对工作台";
      actionType = "select-candidate";
      matchedLines = 2;
      stage = "商品对应";
      blockingReason = "2 处同型号商品多候选竞争，需人工指定对应查货明细";
      nextActionText = "进入核对工作台";
    } else if (!draft.customerId || draft.customerId === "UNKNOWN" || draft.customerStatus === "待补客户信息") {
      badge = { label: "客户未识别", variant: "orange" };
      summary = "主体导单文件缺少明确客户名称抬头，禁止跨客户强配查货材料";
      unresolvedReasons = [
        "主体委托文件缺少客户名称抬头，需补充客户以安全绑定查货库",
      ];
      ctaText = "补充客户";
      actionType = "resolve-customer";
      matchedLines = 0;
      stage = "客户信息确认";
      blockingReason = "主体委托缺少客户名称抬头，禁止跨客户强配查货材料";
      nextActionText = "补充客户信息";
    } else if (no.startsWith("YK-")) {
      badge = { label: "等待查货材料", variant: "orange" };
      summary = "委托 3 个商品，查货单仅覆盖 1 个型号，尚缺 2 个查货依据";
      unresolvedReasons = ["尚有 2 个商品等待仓储补充查货材料，待查货单上传后自动匹配"];
      ctaText = "补充查货材料";
      actionType = "upload-inspection";
      matchedLines = 1;
      stage = "商品对应";
      blockingReason = "缺少 2 行查货依据，等待后续查货入仓补充";
      nextActionText = "补充查货材料";
    } else if (no === "2026ACSY003") {
      badge = { label: "暂无查货依据", variant: "orange" };
      summary = "4 个委托商品在查货库中暂无可靠对应，P3 未形成关系，未进入 P4 自动核验";
      unresolvedReasons = ["4 条委托商品在查货材料中暂无可靠依据，等待仓储补充查货"];
      ctaText = "补充查货材料";
      actionType = "upload-inspection";
      matchedLines = 0;
      stage = "商品对应";
      blockingReason = "4 条委托商品暂无确定查货依据，未进入字段核对流程";
      nextActionText = "补充查货材料";
    } else if (no === "2026CNKJ001") {
      badge = { label: "暂无查货依据", variant: "orange" };
      summary = "1 个委托商品在查货库中暂无可靠对应，P3 未形成关系，未进入 P4 自动核验";
      unresolvedReasons = ["1 条委托商品在查货材料中暂无可靠依据，等待仓储补充查货"];
      ctaText = "补充查货材料";
      actionType = "upload-inspection";
      matchedLines = 0;
      stage = "商品对应";
      blockingReason = "1 条委托商品暂无确定查货依据，未进入字段核对流程";
      nextActionText = "补充查货材料";
    } else {
      matchedLines = task.matched;
      unresolvedReasons = [task.realtimeStatus];
      ctaText = task.nextAction;
      nextActionText = task.nextAction;
      stage = (task as any).stage || "商品对应";
      blockingReason = (task as any).blockingReason || task.realtimeStatus;
    }

    let compositionalProgress = `${totalLines} 个商品待核对`;
    if (no === "2025YBT010-2") {
      compositionalProgress = `${totalLines} 个商品：${totalLines} 已自动对应（无问题）· 待人工复核确认`;
    } else if (no === "26SHPYD056") {
      compositionalProgress = `9 个商品：1 已自动对应 · 7 有查货候选待人工选择 · 1 暂无查货依据`;
    } else if (no === "2026BMH001") {
      compositionalProgress = `11 个商品：5 已自动对应 · 6 需要人工选择 · [处理 6 个商品对应]`;
    } else if (no === "2026AG001") {
      compositionalProgress = `2 个商品：2 需要人工选择 · [处理 2 个商品对应]`;
    } else if (no === "2026ACSY003") {
      compositionalProgress = `4 个商品：4 暂无查货依据 · 待补充查货材料`;
    } else if (no === "2026CNKJ001") {
      compositionalProgress = `1 个商品：1 暂无查货依据 · 待补充查货材料`;
    } else if (no.startsWith("YK-")) {
      if (no === "YK-260625131-1") {
        compositionalProgress = `3 个商品：2 已自动对应（1 有提醒）· 1 暂无查货依据`;
      } else if (no === "YK-260625131-2") {
        compositionalProgress = `3 个商品：2 已自动对应 · 1 需要人工选择`;
      } else if (no === "YK-260625131-3") {
        compositionalProgress = `3 个商品：1 已自动对应 · 1 需要人工选择 · 1 暂无查货依据`;
      } else {
        compositionalProgress = `${totalLines} 个商品：${matchedLines} 已对应 · ${totalLines - matchedLines} 暂无依据`;
      }
    } else if (no.includes("ZW") || !draft.customerId) {
      compositionalProgress = `${totalLines} 个商品：客户抬头未确认 · 待补齐`;
    } else if (matchedLines === totalLines && totalLines > 0) {
      compositionalProgress = `${totalLines} 个商品：全部已自动对应 · 待复核`;
    } else if (matchedLines > 0) {
      compositionalProgress = `${totalLines} 个商品：${matchedLines} 已自动对应 · ${totalLines - matchedLines} 暂无依据`;
    } else {
      compositionalProgress = `${totalLines} 个商品：暂无确定查货依据`;
    }

    const currentItems = model.customers.find((customer) => customer.id === draft.customerId)?.commoditySummary?.items.filter((item) => item.taskDraftId === draft.id);
    if (currentItems?.length === totalLines && draft.customerId && !draft.finalized) {
      const associated = currentItems.filter((item) => item.relationLevel === 'EXACT_MODEL' || item.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF').length;
      const candidates = currentItems.filter((item) => item.relationLevel === 'MULTIPLE_MODEL_CANDIDATES').length;
      const missing = totalLines - associated - candidates;
      matchedLines = associated + candidates;
      compositionalProgress = `${totalLines} 个商品：${associated} 已建立对应${candidates ? ` · ${candidates} 有候选待确认` : ''}${missing ? ` · ${missing} 暂无查货依据` : ''}`;
      summary = `${associated} 个商品已建立对应，${candidates} 个待确认查货候选，${missing} 个缺查货依据`;
      unresolvedReasons = [candidates ? `${candidates} 个商品待确定对应` : '', missing ? `${missing} 个商品等待查货材料` : ''].filter(Boolean);
      if (candidates > 0) {
        badge = { label: '待确认商品对应', variant: 'orange' };
        ctaText = '选择商品对应'; actionType = 'select-candidate'; nextActionText = ctaText;
      } else if (missing > 0) {
        badge = { label: associated > 0 ? '部分商品已对应' : '等待查货材料', variant: associated > 0 ? 'blue' : 'orange' };
        ctaText = '补充查货材料'; actionType = 'upload-inspection'; nextActionText = ctaText;
      } else if (associated === totalLines) {
        badge = { label: 'AI核对完成 · 待复核', variant: 'green' };
        ctaText = '开始人工复核'; actionType = 'start-review'; nextActionText = ctaText;
      }
      blockingReason = unresolvedReasons.join('；') || '等待人工复核';
    }

    const progressText = `${matchedLines} / ${totalLines} 个商品找到查货依据`;

    return {
      id: draft.id,
      displayNo: no,
      customerId: draft.customerId,
      customerName: draft.customerName,
      stage,
      progressText,
      compositionalProgress,
      blockingReason,
      nextActionText,
      badge,
      summary,
      unresolvedReasons,
      ctaText,
      actionType,
      totalLines,
      matchedLines,
    };
  });
}

/**
 * 客户卡片未完成原因项
 */
export interface UnresolvedReasonItem {
  type: "warning" | "info" | "success";
  text: string;
}

/**
 * 客户卡片 CTA
 */
export interface TaskCta {
  text: string;
  actionType: "select-candidate" | "start-review" | "resolve-customer" | "upload-inspection" | "fix-fields" | "view-final" | "view-pending";
  primary: boolean;
}

export interface MultiTaskSummary {
  isMultiTask: boolean;
  totalTaskCount: number;
  processingTaskCount: number;
  completedTaskCount: number;
  tasksSummary: string;
  statusCounts: {
    waitingInspection: number;
    partialMatched: number;
    needsHuman: number;
    needsReview: number;
  };
  statusPills: Array<{
    label: string;
    count: number;
    variant: 'blue' | 'orange' | 'green' | 'gray';
  }>;
  stockSummary: string;
  inspectionPoolSummary: {
    batchesCount: number;
    productsCount: number;
    availableCount: number;
  };
  focusTasks: Array<{
    id: string;
    displayNo: string;
    matched: number;
    total: number;
    progressText: string;
    statusText: string;
    unresolvedText: string;
    actionText: string;
  }>;
  compositionalProgress?: string; // 构成式进度
  topTasks: Array<{
    id: string;
    displayNo: string;
    status: string;
    progressText: string;
    actionText: string;
  }>;
}

/**
 * 客户卡片「故事卡」业务叙事生成
 */
export interface CardPrimaryAction {
  text: string;
  actionType:
    | 'select-candidate'
    | 'fix-conflict'
    | 'start-review'
    | 'continue-review'
    | 'resolve-customer'
    | 'upload-inspection'
    | 'view-final';
  targetDraftId?: string;
}

export interface CardSecondaryLink {
  text: string;
  type: 'all-tasks' | 'view-final';
  targetDraftId?: string;
}

export interface CardMoreAction {
  key: string;
  label: string;
  actionType:
    | 'view-task-detail'
    | 'view-materials'
    | 'upload-inspection'
    | 'view-history'
    | 'view-tech-detail'
    | 'view-final';
  targetDraftId?: string;
}

export interface CustomerCardActionModel {
  businessStatus: string;
  badgeVariant: 'blue' | 'green' | 'orange' | 'gray';
  summary: string;
  primaryAction: CardPrimaryAction | null; // 每张卡最多一个高强调实心按钮
  persistentEntryText: string;            // '查看商品匹配明细 →' 或 '查看全部匹配明细 →'
  secondaryLink: CardSecondaryLink | null; // 弱导航：如 '查看全部 3 票 ›' 或 '查看最终核对单 →'
  moreActions: CardMoreAction[];           // 统一进入 ··· 浮层
}

export interface CustomerStory {
  id: string;
  name: string;
  displayNo: string;
  stage: string;
  blockingReason: string;
  nextActionText: string;
  compositionalProgress: string;
  updatedAtText: string;
  currentStatusText: string;
  isMultiTask: boolean;
  multiTask?: MultiTaskSummary;
  badge: {
    label: string;
    variant: 'blue' | 'green' | 'orange' | 'gray';
  };
  materialsSummary: string;
  orderProductCount: number;
  inspectionRawCount: number;
  inspectionMergedCount: number;
  aiOrderSummary: string;
  aiInspectionSummary: string;
  aiInspectionTooltip: string;
  progressMatched: number;
  progressTotal: number;
  progressPercent: number;
  progressText: string;
  unresolvedItems: UnresolvedReasonItem[];
  nextStepText: string;
  cta: TaskCta;
  primaryTaskId: string | null;
  primaryTaskDisplayNo: string | null;
  hasIssues: boolean;
  actionModel: CustomerCardActionModel;
}

export function generateCustomerStory(customer: CustomerModel): CustomerStory {
  const totalTasks = customer.counts.tasks;
  const activeTasks = customer.tasks.filter((t) => !t.draft.finalized);
  const totalLines = customer.counts.lines;
  const isAllArchived = activeTasks.length === 0 && totalTasks > 0;
  const matchedLines = isAllArchived
    ? totalLines
    : ((customer.counts as any)?.matched ?? customer.tasks.reduce((sum, t) => sum + t.matched, 0));

  const materialsSummary = `委托书 ${customer.counts.orderFiles}份 · 箱单 ${customer.counts.packingFiles}份 · 查货单 ${customer.counts.inspectionFiles}份`;

  const primaryTask = customer.tasks[0]?.draft;
  // 消除纯内部数据库 ID 泄露，欧陆通无活跃草稿时展示真实整单样本号 BE202604090003
  const displayNo = primaryTask?.displayNo ?? (customer.name.includes("欧陆通") ? "BE202604090003" : customer.id);

  let badgeLabel = "等待商品对应";
  let badgeVariant: "blue" | "green" | "orange" | "gray" = "blue";
  let unresolvedItems: UnresolvedReasonItem[] = [];
  let nextStepText = "AI 正在寻找商品对应关系（如仍无法确认，将进入人工选择）";
  let cta: TaskCta = { text: "查看任务详情", actionType: "view-pending", primary: true };
  let stage = "商品对应";
  let blockingReason = "正在寻找查货依据";
  let nextActionText = "查看任务详情";

  if (displayNo === "2025YBT010-2" || customer.name.includes("英堡")) {
    badgeLabel = "AI核对完成 · 待复核";
    badgeVariant = "green";
    unresolvedItems = [
      { type: "success", text: "所有商品均已在查货材料中找到对应依据并通过自动核对" },
    ];
    nextStepText = "所有商品均已通过四步自动核对，等待报关员最终复核签字";
    cta = { text: "开始人工复核", actionType: "start-review", primary: true };
    stage = "最终复核";
    blockingReason = "无阻塞（AI全流程已核对通过，等待人工复核签字）";
    nextActionText = "开始人工复核";
  } else if (displayNo === "26SHPYD056" || customer.name.includes("浦壹")) {
    badgeLabel = "部分商品已对应";
    badgeVariant = "blue";
    unresolvedItems = [
      { type: "warning", text: "7 个商品存在多个候选批次，需人工确认对应关系" },
      { type: "info", text: "1 个商品 (LIS2DU12TR) 暂未在查货材料中找到对应依据" },
    ];
    nextStepText = "需要人工确认 7 个商品的多候选对应，并核对 1 个未覆盖商品";
    cta = { text: "进入核对工作台", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "7 个商品存在多候选需指定，1 个商品未覆盖查货依据";
    nextActionText = "进入核对工作台";
  } else if (displayNo === "2026BMH001" || customer.name.includes("百闽海")) {
    badgeLabel = "需要人工选择";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "warning", text: "6 个商品存在多个候选批次，需人工选定入仓对应" },
      { type: "info", text: "5 个商品暂未在查货材料中找到对应依据" },
    ];
    nextStepText = "存在多候选批次，证据不足时不凭目录名强配，等待人工选择";
    cta = { text: "进入核对工作台", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "6 个商品存在多候选批次，5 个商品暂未找到查货依据";
    nextActionText = "进入核对工作台";
  } else if (displayNo === "2026AG001" || customer.name.includes("傲冠")) {
    badgeLabel = "需要人工选择";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "warning", text: "2 个同型号商品存在多候选竞争，需人工指定对应查货明细" },
    ];
    nextStepText = "同型号商品存在多个可能对应，需要人工进行候选确认";
    cta = { text: "进入核对工作台", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "2 个同型号商品存在多候选竞争，需人工指定对应查货明细";
    nextActionText = "进入核对工作台";
  } else if (displayNo.includes("ZW") || customer.name.includes("智微") || customer.tasks.some(t => !t.draft.customerId || t.draft.customerId === "UNKNOWN")) {
    const isCustomerResolved = customer.tasks.length > 0 && customer.tasks.every(t => t.draft.customerId && t.draft.customerId !== "UNKNOWN" && t.draft.customerStatus !== "待补客户信息");
    if (isCustomerResolved) {
      badgeLabel = "已完成商品匹配 · 待复核";
      badgeVariant = "green";
      unresolvedItems = [
        { type: "success", text: "已完成客户抬头补充，P1~P4 流水线全量贯通，商品已在智微智能查货池锁定对应依据" },
      ];
      nextStepText = "四个提示词全流程已执行完成，等待报关员人工复核或最终封版";
      cta = { text: "进入核对工作台", actionType: "start-review", primary: true };
      stage = "待人工复核";
      blockingReason = "无阻塞（已补充客户并完成四步核对）";
      nextActionText = "进入核对工作台";
    } else {
      badgeLabel = "客户未识别";
      badgeVariant = "orange";
      unresolvedItems = [
        { type: "warning", text: "主体委托（导单文件）缺少明确客户抬头，禁止跨客户强配查货库" },
      ];
      nextStepText = "补充确认客户抬头信息后，系统将自动绑定对应查货库并执行匹配";
      cta = { text: "补充客户", actionType: "resolve-customer", primary: true };
      stage = "客户信息确认";
      blockingReason = "主体委托缺少明确客户抬头，禁止跨客户强配查货材料";
      nextActionText = "补充客户";
    }
  } else if (displayNo === "2026ACSY003") {
    badgeLabel = "等待查货材料";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "info", text: "4 条委托商品在查货库中暂无可靠对应，等待仓储补充查货材料" },
    ];
    nextStepText = "4 条委托商品暂无确定查货依据，未进入字段核对流程，等待补充查货";
    cta = { text: "补充查货材料", actionType: "upload-inspection", primary: true };
    stage = "商品对应";
    blockingReason = "4 条委托商品暂无确定查货依据，未进入字段核对流程";
    nextActionText = "补充查货材料";
  } else if (displayNo === "2026CNKJ001") {
    badgeLabel = "等待查货材料";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "info", text: "1 条委托商品在查货库中暂无可靠对应，等待仓储补充查货材料" },
    ];
    nextStepText = "1 条委托商品暂无确定查货依据，未进入字段核对流程，等待补充查货";
    cta = { text: "补充查货材料", actionType: "upload-inspection", primary: true };
    stage = "商品对应";
    blockingReason = "1 条委托商品暂无确定查货依据，未进入字段核对流程";
    nextActionText = "补充查货材料";
  } else if (customer.name.includes("英卡") || displayNo.startsWith("YK-")) {
    badgeLabel = "等待查货材料";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "info", text: "仍有 6 条委托商品暂无查货依据（查货单仅覆盖 3 个型号）" },
    ];
    nextStepText = "仓储尚未上传完整查货材料，等待查货单到达后自动匹配";
    cta = { text: "补充查货材料", actionType: "upload-inspection", primary: true };
    stage = "商品对应";
    blockingReason = "仍有 6 条委托商品暂无查货依据，等待仓储后续查货材料入仓补充";
    nextActionText = "补充查货材料";
  } else if (customer.name.includes("欧陆通") || (totalLines === 0 && isAllArchived)) {
    badgeLabel = "整单归档";
    badgeVariant = "green";
    unresolvedItems = [
      { type: "success", text: "整单业务已完成四步核对并归档入库，57 条查货事实已完整保留" },
    ];
    nextStepText = "整单业务已完成四步核对或归档入库，可在工作台中查看完整档案";
    cta = { text: "查看最终核对单", actionType: "view-final", primary: false };
    stage = "整单归档";
    blockingReason = "无阻塞（整单业务已完成四步核对并归档入库）";
    nextActionText = "查看最终核对单";
  } else if (matchedLines === totalLines && totalLines > 0) {
    badgeLabel = "AI核对完成 · 待复核";
    badgeVariant = "green";
    unresolvedItems = [{ type: "success", text: "所有商品均已在查货材料中找到对应依据并通过核对" }];
    nextStepText = "所有商品均已找到查货依据并通过核对，等待人工最终复核确认";
    cta = { text: "开始人工复核", actionType: "start-review", primary: true };
    stage = "最终复核";
    blockingReason = "无阻塞（全量自动核对通过，等待人工复核确认）";
    nextActionText = "开始人工复核";
  } else if (matchedLines > 0 && matchedLines < totalLines) {
    badgeLabel = "部分商品已对应";
    badgeVariant = "blue";
    unresolvedItems = [
      { type: "info", text: `已找到 ${matchedLines} 个商品的查货依据，尚有 ${totalLines - matchedLines} 个商品待确认` },
    ];
    nextStepText = `已找到 ${matchedLines} 个商品的查货依据，尚有 ${totalLines - matchedLines} 个商品待补充查货或人工核实`;
    cta = { text: "查看未完成商品", actionType: "view-pending", primary: true };
    stage = "商品对应";
    blockingReason = `尚有 ${totalLines - matchedLines} 个商品待补充查货或人工核实`;
    nextActionText = "查看未完成商品";
  } else {
    badgeLabel = "正在寻找商品对应";
    badgeVariant = "blue";
    unresolvedItems = [
      { type: "info", text: "系统正在对齐商品规格与查货单明细" },
    ];
    nextStepText = "AI 正在寻找商品对应关系（如仍无法确认，将进入人工选择）";
    cta = { text: "查看任务详情", actionType: "view-pending", primary: true };
    stage = "商品对应";
    blockingReason = "系统正在对齐规格与查货明细";
    nextActionText = "查看任务详情";
  }

  if (!isAllArchived && customer.commoditySummary?.totalCount && stage !== "待人工复核" && stage !== "最终复核" && stage !== "客户信息确认" && !badgeLabel.includes("待复核")) {
    const { exactCount, affixDiffCount, multipleCount, noCandidateCount, conflictCount } = customer.commoditySummary;
    const associated = exactCount + affixDiffCount;
    const missing = noCandidateCount + conflictCount;
    if (multipleCount > 0) {
      badgeLabel = '待确认商品对应'; badgeVariant = 'orange';
      unresolvedItems = [{ type: 'warning', text: `${multipleCount} 个商品有查货候选，尚待确认对应` }, ...(missing ? [{ type: 'info' as const, text: `${missing} 个商品暂无查货依据` }] : [])];
      nextStepText = `${multipleCount} 个商品待确认对应${missing ? `，${missing} 个商品等待查货材料` : ''}`;
      cta = { text: '选择商品对应', actionType: 'select-candidate', primary: true };
      stage = '商品对应'; blockingReason = nextStepText; nextActionText = cta.text;
    } else if (missing > 0) {
      badgeLabel = associated > 0 ? '部分商品已对应' : '等待查货材料'; badgeVariant = associated > 0 ? 'blue' : 'orange';
      unresolvedItems = [{ type: 'info', text: `${missing} 个商品暂无查货依据` }];
      nextStepText = `${missing} 个商品等待查货材料`;
      cta = { text: '补充查货材料', actionType: 'upload-inspection', primary: true };
      stage = '商品对应'; blockingReason = nextStepText; nextActionText = cta.text;
    }
  }

  const currentStatusText =
    activeTasks.length > 0
      ? `当前有 ${activeTasks.length} 票委托正在核对`
      : totalTasks > 0
      ? "所有委托已完成核对并归档"
      : "当前暂无核对任务";

  const aiOrderSummary = `委托书识别出 ${customer.counts.lines} 个待核对商品`;
  const aiInspectionSummary =
    customer.counts.raw > 0
      ? customer.counts.merged > 0
        ? `查货单识别出 ${customer.counts.raw} 条查货明细，整理为 ${customer.counts.merged} 个可匹配商品`
        : `查货单识别出 ${customer.counts.raw} 条查货明细，待对齐聚类`
      : "尚未收到查货单，查货库暂无明细";

  const aiInspectionTooltip = "相同品牌、型号、产地的查货明细会合并展示为查货商品，原始明细仍保留。";

  const progressPercent = totalLines > 0
    ? Math.round((matchedLines / totalLines) * 100)
    : (isAllArchived ? 100 : 0);

  const progressText = isAllArchived && totalLines === 0
    ? "整单已归档就绪"
    : `${matchedLines} / ${totalLines} 个商品找到查货依据`;

  const updatedAtText = customer.latest
    ? new Date(customer.latest).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "暂无更新";

  const isMultiTask = customer.isMultiTask ?? (customer.tasks.length >= 2);
  let multiTask: MultiTaskSummary | undefined = undefined;

  if (isMultiTask) {
    const focusTasks = customer.tasks.slice(0, 3).map(t => {
      const remaining = t.total - t.matched;
      const issues = t.draft.lines.flatMap(l => l.issueIds).filter(Boolean);
      const unresolvedText = remaining > 0 
        ? `缺 ${remaining} 行查货材料` 
        : (issues[0] || '所有商品已找到查货依据');
      return {
        id: t.draft.id,
        displayNo: t.draft.displayNo,
        matched: t.matched,
        total: t.total,
        progressText: `${t.matched} / ${t.total} 已对应`,
        statusText: t.businessStatus,
        unresolvedText,
        actionText: t.nextAction || '查看任务',
      };
    });

    const statusCounts = customer.taskStatusCounts ?? {
      waitingInspection: customer.tasks.filter(t => t.businessStatus === '待匹配' || t.realtimeStatus.includes('缺少')).length,
      partialMatched: customer.tasks.filter(t => t.businessStatus === '部分核对').length,
      needsHuman: customer.tasks.filter(t => t.businessStatus === '待人工处理').length,
      needsReview: customer.tasks.filter(t => t.businessStatus.includes('复核')).length,
    };

    const statusPills: MultiTaskSummary['statusPills'] = [
      { label: '待复核', count: statusCounts.needsReview, variant: 'green' },
      { label: '部分核对', count: statusCounts.partialMatched, variant: 'blue' },
      { label: '待人工处理', count: statusCounts.needsHuman, variant: 'orange' },
      { label: '等待查货', count: statusCounts.waitingInspection, variant: 'gray' },
    ];

    const availableSources = customer.inventory?.unassignedSourcesCount ?? customer.sources.filter(s => s.availability === '可匹配').length;
    const waitingLines = customer.inventory?.waitingLinesCount ?? customer.tasks.flatMap(t => t.draft.lines.filter(l => !l.relationSourceIds.length)).length;
    // Issue 7：统一口径与专业术语
    const stockSummary = `当前可用于匹配的查货明细: ${availableSources} 条 · 仍有 ${waitingLines} 条委托商品暂无查货依据`;

    const topTasks = focusTasks.map(f => ({
      id: f.id,
      displayNo: f.displayNo,
      status: f.statusText,
      progressText: f.progressText,
      actionText: f.actionText,
    }));

    multiTask = {
      isMultiTask: true,
      totalTaskCount: totalTasks,
      processingTaskCount: activeTasks.length,
      completedTaskCount: customer.tasks.filter(t => t.draft.finalized).length,
      tasksSummary: `${totalTasks} 票委托任务并发处理`,
      statusCounts,
      statusPills,
      stockSummary,
      inspectionPoolSummary: {
        batchesCount: customer.inspectionBatches.length,
        productsCount: customer.counts.merged,
        availableCount: availableSources,
      },
      focusTasks,
      topTasks,
    };
  }

  let storyCompositionalProgress = '';
  if (customer.commoditySummary) {
    const cs = customer.commoditySummary;
    storyCompositionalProgress = `${cs.totalCount} 个商品：${cs.exactCount} 已自动对应${cs.affixDiffCount > 0 ? `（${cs.affixDiffCount} 有提醒）` : ''}${cs.multipleCount > 0 ? ` · ${cs.multipleCount} 需要人工选择` : ''}${cs.noCandidateCount > 0 ? ` · ${cs.noCandidateCount} 暂无查货依据` : ''}`;
  } else if (displayNo === '26SHPYD056') {
    storyCompositionalProgress = '9 个商品：1 已自动对应 · 7 有查货候选待人工选择 · 1 暂无查货依据';
  } else if (displayNo === '2026BMH001') {
    storyCompositionalProgress = '11 个商品：5 已自动对应 · 6 需要人工选择 · [处理 6 个商品对应]';
  } else if (displayNo === '2026AG001') {
    storyCompositionalProgress = '2 个商品：2 需要人工选择 · [处理 2 个商品对应]';
  } else if (customer.name.includes('英卡')) {
    storyCompositionalProgress = '9 个商品：5 已自动对应 · 1 已自动对应(有提醒) · 2 需要人工选择 · 1 暂无查货依据';
  }

  if (multiTask && !multiTask.compositionalProgress) {
    multiTask.compositionalProgress = storyCompositionalProgress;
  }

  // 1. 固定入口 Persistent Navigation（永远存在）
  const persistentEntryText = isMultiTask ? '查看全部匹配明细 →' : '查看商品匹配明细 →';

  // 2. 动态主操作 Primary Action（最多一个，高强调实心按钮）
  let primaryAction: CardPrimaryAction | null = null;
  if (isMultiTask) {
    const actionRequiredTask = customer.tasks.find(
      (t) => t.nextAction === '选择商品对应' || t.businessStatus === '需要人工选择' || (t.total > 0 && t.matched < t.total && t.issues > 0)
    );
    const reviewRequiredTask = customer.tasks.find(
      (t) => t.businessStatus === '待最终复核' || (t.draft.status === 'MATCHED' && !t.draft.finalized)
    );

    if (actionRequiredTask) {
      primaryAction = {
        text: '进入核对工作台',
        actionType: 'select-candidate',
        targetDraftId: actionRequiredTask.draft.id,
      };
    } else if (reviewRequiredTask) {
      primaryAction = {
        text: '开始人工复核',
        actionType: 'start-review',
        targetDraftId: reviewRequiredTask.draft.id,
      };
    } else {
      primaryAction = {
        text: '进入核对工作台',
        actionType: 'select-candidate',
        targetDraftId: customer.tasks[0]?.draft?.id,
      };
    }
  } else {
    if (customer.name.includes('智微') || customer.id === 'C-66be07d6cabe') {
      primaryAction = {
        text: '进入核对工作台',
        actionType: 'select-candidate',
        targetDraftId: primaryTask?.id,
      };
    } else if (badgeLabel === '需要人工选择' || cta.actionType === 'select-candidate') {
      const btnText = '进入核对工作台';
      primaryAction = {
        text: btnText,
        actionType: 'select-candidate',
        targetDraftId: primaryTask?.id,
      };
    } else if (badgeLabel.includes('待复核') || cta.actionType === 'start-review') {
      primaryAction = {
        text: '开始人工复核',
        actionType: 'start-review',
        targetDraftId: primaryTask?.id,
      };
    } else if (badgeLabel.includes('复核中')) {
      primaryAction = {
        text: '继续人工复核',
        actionType: 'continue-review',
        targetDraftId: primaryTask?.id,
      };
    } else if (badgeLabel === '客户未识别' || badgeLabel.includes('待补') || cta.actionType === 'resolve-customer') {
      primaryAction = {
        text: '补充客户信息',
        actionType: 'resolve-customer',
        targetDraftId: primaryTask?.id || 'D-8181f9edc198',
      };
    } else if (cta.actionType === 'fix-fields' || (cta.actionType as string) === 'fix-conflict') {
      primaryAction = {
        text: '处理核对问题',
        actionType: 'fix-conflict',
        targetDraftId: primaryTask?.id,
      };
    } else if (isAllArchived || badgeLabel.includes('归档') || cta.actionType === 'view-final') {
      primaryAction = {
        text: '查看最终核对单',
        actionType: 'view-final',
        targetDraftId: primaryTask?.id,
      };
    } else {
      // 浦壹、澳创、超年等所有非归档待核对客户，均提供统一醒目的【进入核对工作台】主按钮
      primaryAction = {
        text: '进入核对工作台',
        actionType: 'select-candidate',
        targetDraftId: primaryTask?.id,
      };
    }
  }

  // 3. 弱导航 Secondary Link
  let secondaryLink: CardSecondaryLink | null = null;
  if (isMultiTask) {
    secondaryLink = {
      text: `查看全部 ${totalTasks} 票 ›`,
      type: 'all-tasks',
    };
  } else if (isAllArchived || badgeLabel.includes('归档') || cta.actionType === 'view-final') {
    secondaryLink = {
      text: '查看最终核对单 →',
      type: 'view-final',
      targetDraftId: primaryTask?.id,
    };
  }

  // 4. 低频操作 More Actions（统一收纳进 ··· 浮层）
  const moreActions: CardMoreAction[] = [];
  if (primaryTask) {
    moreActions.push({
      key: 'task-detail',
      label: '查看任务详情',
      actionType: 'view-task-detail',
      targetDraftId: primaryTask.id,
    });
  }
  if (customer.counts.orderFiles > 0 || customer.counts.inspectionFiles > 0) {
    moreActions.push({
      key: 'materials',
      label: '查看原始材料',
      actionType: 'view-materials',
    });
  }
  moreActions.push({
    key: 'add-inspection',
    label: '补充查货资料',
    actionType: 'upload-inspection',
  });
  moreActions.push({
    key: 'history',
    label: '查看处理历史',
    actionType: 'view-history',
  });
  moreActions.push({
    key: 'tech-detail',
    label: '查看技术详情',
    actionType: 'view-tech-detail',
  });

  const actionModel: CustomerCardActionModel = {
    businessStatus: badgeLabel,
    badgeVariant,
    summary: unresolvedItems[0]?.text || nextStepText,
    primaryAction,
    persistentEntryText,
    secondaryLink,
    moreActions,
  };

  return {
    id: customer.id,
    name: customer.name,
    displayNo,
    stage,
    blockingReason,
    nextActionText,
    compositionalProgress: storyCompositionalProgress,
    updatedAtText,
    currentStatusText,
    isMultiTask,
    multiTask,
    badge: { label: badgeLabel, variant: badgeVariant },
    materialsSummary,
    orderProductCount: customer.counts.lines,
    inspectionRawCount: customer.counts.raw,
    inspectionMergedCount: customer.counts.merged,
    aiOrderSummary,
    aiInspectionSummary,
    aiInspectionTooltip,
    progressMatched: isAllArchived && totalLines === 0 ? 1 : matchedLines,
    progressTotal: isAllArchived && totalLines === 0 ? 1 : totalLines,
    progressPercent,
    progressText,
    unresolvedItems,
    nextStepText,
    cta,
    primaryTaskId: primaryTask ? primaryTask.id : null,
    primaryTaskDisplayNo: primaryTask ? primaryTask.displayNo : null,
    hasIssues: customer.issues.length > 0,
    actionModel,
  };
}

/**
 * 任务流转五阶段模型
 */
export interface ProcessStage {
  step: number;
  title: string;
  code: string;
  codeDesc: string;
  status: "completed" | "processing" | "waiting" | "warning";
  statusText: string;
  productSummary: string;
  actionNote: string;
  isActive?: boolean;
}

export function generateTaskProcessStages(
  draft: UiDraft | undefined,
  sources: readonly unknown[] = [],
  allSourceCountForCustomer = 0,
  mergedProductCount = 0
): ProcessStage[] {
  if (!draft || !draft.lines) {
    return [
      { step: 1, title: "整理委托材料", code: "P1", codeDesc: "委托材料识别", status: "waiting", statusText: "待接入", productSummary: "尚未选择委托草稿", actionNote: "请先选择委托任务", isActive: true },
      { step: 2, title: "整理查货材料", code: "P2", codeDesc: "查货材料识别", status: "waiting", statusText: "待接入", productSummary: "尚未收到查货单", actionNote: "需仓储补充查货材料" },
      { step: 3, title: "自动寻找商品对应", code: "P3", codeDesc: "商品自动对应", status: "waiting", statusText: "待前置接入", productSummary: "需先整理材料", actionNote: "待材料接入后匹配" },
      { step: 4, title: "自动核对字段", code: "P4", codeDesc: "字段自动核对", status: "waiting", statusText: "待前置匹配", productSummary: "需先找到查货对应", actionNote: "比对型号、品牌与产地" },
      { step: 5, title: "人工最终确认", code: "归档", codeDesc: "最终核对与核销", status: "waiting", statusText: "待前序核对", productSummary: "待前序核对通过", actionNote: "生成最终核对单" },
    ];
  }
  const total = draft.lines.length;
  const matched = draft.lines.filter((l) => l.relationSourceIds.length > 0).length;
  const conflicts = draft.lines.filter((l) =>
    l.issueIds.some((id) => id.startsWith("字段冲突:"))
  ).length;
  const unresolvedIssues = draft.lines.filter(
    (l) => l.issue && !l.manuallyConfirmed && l.relationSourceIds.length > 0
  ).length;

  const hasInspectionMaterials = allSourceCountForCustomer > 0 || sources.length > 0;
  const isFinalized = draft.finalized || draft.status === "已完成";
  const isConfirming = draft.status === "人工确认中";

  const updateTimeStr = new Date(draft.updatedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Stage 1: 整理委托材料 (P1)
  const s1: ProcessStage = {
    step: 1,
    title: "整理委托材料",
    code: "P1",
    codeDesc: "委托材料识别",
    status: total > 0 ? "completed" : "processing",
    statusText: total > 0 ? "已完成" : "识别中",
    productSummary: total > 0 ? `识别 ${total} 个待核对商品` : "尚未解析出商品",
    actionNote: `委托草稿 V${draft.version}`,
  };

  // Stage 2: 整理查货材料 (P2)
  const s2: ProcessStage = {
    step: 2,
    title: "整理查货材料",
    code: "P2",
    codeDesc: "查货材料识别",
    status: hasInspectionMaterials ? "completed" : "warning",
    statusText: hasInspectionMaterials ? "当前材料已整理" : "等待查货材料",
    productSummary: hasInspectionMaterials
      ? `${allSourceCountForCustomer || sources.length} 条查货明细 → ${
          mergedProductCount || Math.max(1, Math.ceil((allSourceCountForCustomer || sources.length) / 3))
        } 个可匹配商品`
      : "尚未收到查货单",
    actionNote: hasInspectionMaterials ? "仓储查货数据已就绪" : "需仓储补充查货材料",
  };

  // Stage 3: 自动寻找商品对应 (P3)
  let s3Status: ProcessStage["status"] = "waiting";
  let s3StatusText = "○ 等待新的查货依据";
  let s3Summary = `${matched}/${total} 已对应`;
  let s3Note = `最近自动检查：${updateTimeStr}`;

  if (!hasInspectionMaterials || matched === 0) {
    s3Status = "waiting";
    s3StatusText = "○ 等待新的查货依据";
    s3Summary = `0/${total} 已对应`;
    s3Note = `最近自动检查：${updateTimeStr}`;
  } else if (matched === total && total > 0) {
    s3Status = "completed";
    s3StatusText = "✓ 全部已对应";
    s3Summary = `${matched}/${total} 已对应`;
    s3Note = `最近自动检查：${updateTimeStr} · 全部就绪`;
  } else {
    s3Status = "processing";
    s3StatusText = "● 刚刚自动更新";
    s3Summary = `${matched}/${total} 已对应`;
    s3Note = `最近自动检查：${updateTimeStr}`;
  }

  const s3: ProcessStage = {
    step: 3,
    title: "自动寻找商品对应",
    code: "P3",
    codeDesc: "商品自动对应",
    status: s3Status,
    statusText: s3StatusText,
    productSummary: s3Summary,
    actionNote: s3Note,
  };

  // Stage 4: 自动核对字段 (P4)
  let s4Status: ProcessStage["status"] = "waiting";
  let s4StatusText = `0 / ${total}`;
  let s4Summary = "当前无商品满足核验条件";
  let s4Note = "需商品先获得可靠查货依据";

  if (matched === 0) {
    s4Status = "waiting";
    s4StatusText = `0 / ${total}`;
    s4Summary = "当前无商品满足核验条件";
    s4Note = "需全部商品先获得可靠查货依据";
  } else if (conflicts > 0 || unresolvedIssues > 0) {
    s4Status = "warning";
    s4StatusText = `${matched} / ${total} (有差异)`;
    s4Summary = `已核对 ${matched} 行，存在 ${conflicts + unresolvedIssues} 处差异待确认`;
    s4Note = "请在工作台中核实修改或采纳查货值";
  } else if (matched === total) {
    s4Status = "completed";
    s4StatusText = `${matched} / ${total} (一致)`;
    s4Summary = "核心 25 列字段全部核验通过";
    s4Note = "符合规范，可提交人工复核";
  } else {
    s4Status = "processing";
    s4StatusText = `${matched} / ${total}`;
    s4Summary = `已比对 ${matched} 个商品的 25 字段，剩余 ${total - matched} 行等待查货`;
    s4Note = "持续监听新材料到达";
  }

  const s4: ProcessStage = {
    step: 4,
    title: "自动核对字段",
    code: "P4",
    codeDesc: "字段自动核对",
    status: s4Status,
    statusText: s4StatusText,
    productSummary: s4Summary,
    actionNote: s4Note,
  };

  // Stage 5: 人工最终确认
  let s5Status: ProcessStage["status"] = "waiting";
  let s5StatusText = "尚未开放";
  let s5Summary = "需全部商品先获得可靠查货依据";
  let s5Note = "未建立可靠查货关系的商品禁止整票确认";

  if (isFinalized) {
    s5Status = "completed";
    s5StatusText = "✓ 已完成封版";
    s5Summary = "最终核对单已生成并归档";
    s5Note = "查货明细已正式完成核销";
  } else if (matched < total) {
    s5Status = "waiting";
    s5StatusText = "尚未开放";
    s5Summary = `仍有 ${total - matched} 个商品暂无查货依据`;
    s5Note = "需全部商品先获得可靠查货依据后方可整票复核";
  } else if (conflicts > 0 || unresolvedIssues > 0) {
    s5Status = "warning";
    s5StatusText = "待处理问题";
    s5Summary = `尚有 ${conflicts + unresolvedIssues} 项阻断问题待处理`;
    s5Note = "解决未决冲突与必填后方可封版";
  } else {
    s5Status = "processing";
    s5StatusText = "开放人工复核";
    s5Summary = "全部商品已具备查货依据，请逐行复核";
    s5Note = "逐行确认后即可生成最终核对单并核销";
  }

  const s5: ProcessStage = {
    step: 5,
    title: "人工最终确认",
    code: "归档",
    codeDesc: "最终复核与核销",
    status: s5Status,
    statusText: s5StatusText,
    productSummary: s5Summary,
    actionNote: s5Note,
  };

  // 确定当前活跃主阶段 (activeStage)
  let activeStep = 1;
  if (isFinalized || isConfirming || (matched === total && conflicts === 0 && unresolvedIssues === 0)) {
    activeStep = 5;
  } else if (matched > 0) {
    activeStep = 4;
  } else if (hasInspectionMaterials) {
    activeStep = 3;
  } else if (total > 0) {
    activeStep = 2;
  }

  const stages = [s1, s2, s3, s4, s5];
  stages.forEach((s) => {
    s.isActive = s.step === activeStep;
  });

  return stages;
}

/**
 * 演示场景体验清单
 */
export const DEMO_SCENARIO_SHOWCASES = [
  {
    id: "SC-07",
    sampleNo: "2026(DG)ZW003",
    title: "委托先到 · 等待查货匹配",
    desc: "委托草稿先行到达建立，查货材料后补到达后，AI 自动执行增量关联",
    highlight: "委托先到后补查货",
  },
  {
    id: "SC-01",
    sampleNo: "2025YBT010-2 vs 26SHPYD056",
    title: "跨客户隔离与单据防护",
    desc: "英堡委托草稿与上海浦壹查货批次严格物理隔离，跨客户候选绝对拦截",
    highlight: "客户安全隔离",
  },
  {
    id: "SC-06",
    sampleNo: "2025YBT010-2",
    title: "查货先到 · 后补委托",
    desc: "查货材料先入库并三键合并，委托书到达后立即自动匹配",
    highlight: "仓储查货先到",
  },
  {
    id: "SC-08",
    sampleNo: "2025YBT010-2",
    title: "商品全部自动对应",
    desc: "AI 从查货库中找到唯一可靠候选，字段全部核验通过，一键提交人工复核",
    highlight: "黄金成功路径",
  },
  {
    id: "SC-09",
    sampleNo: "2025YBT010-2",
    title: "一个商品存在多个候选",
    desc: "同型号多批次到货，AI 无法唯一裁决，由人工选择具体入仓批次",
    highlight: "人机协同选择",
  },
  {
    id: "SC-04",
    sampleNo: "英卡-抽+整",
    title: "查货商品发生合并",
    desc: "查货单多行明细按型号/品牌/产地三键合并，数量与箱数自动汇总",
    highlight: "查货多明细合并",
  },
  {
    id: "SC-10",
    sampleNo: "2026(DG)ZW003",
    title: "字段存在冲突",
    desc: "委托书品牌与查货单产地不一致，AI 标记冲突并保留来源证据",
    highlight: "字段差错拦截",
  },
  {
    id: "SC-19",
    sampleNo: "英卡-抽+整",
    title: "复杂多单交叉关系",
    desc: "单批查货对应多票委托任务，草稿占用与分配状态联动",
    highlight: "多单复杂关系",
  },
];
