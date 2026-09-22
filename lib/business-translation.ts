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
      ctaText = "处理商品对应";
      actionType = "select-candidate";
      matchedLines = 8;
      stage = "商品对应";
      blockingReason = "7 个商品存在同型号多候选，1 个商品未覆盖查货依据";
      nextActionText = "处理商品对应";
    } else if (no === "2026BMH001") {
      badge = { label: "需要人工选择", variant: "orange" };
      summary = "6 个商品存在多个候选批次，5 个商品暂未在查货单中出现";
      unresolvedReasons = [
        "6 个商品在查货库存在多批次候选，证据不足时不凭目录强配",
        "5 个商品暂未在查货材料中找到依据，待补充查货",
      ];
      ctaText = "选择商品对应";
      actionType = "select-candidate";
      matchedLines = 6;
      stage = "商品对应";
      blockingReason = "6 处多候选需人工选定入仓对应，5 行等待补充查货";
      nextActionText = "选择商品对应";
    } else if (no === "2026AG001") {
      badge = { label: "需要人工选择", variant: "orange" };
      summary = "2 个同型号商品存在多候选竞争，需人工指定对应明细";
      unresolvedReasons = ["2 条同型号商品存在多个可能查货对应，保留为多候选待选"];
      ctaText = "选择商品对应";
      actionType = "select-candidate";
      matchedLines = 2;
      stage = "商品对应";
      blockingReason = "2 处同型号商品多候选竞争，需人工指定对应查货明细";
      nextActionText = "选择商品对应";
    } else if (no.includes("ZW") || !draft.customerId) {
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

    const progressText = `${matchedLines} / ${totalLines} 个商品找到查货依据`;

    return {
      id: draft.id,
      displayNo: no,
      customerId: draft.customerId,
      customerName: draft.customerName,
      stage,
      progressText,
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
export interface CustomerStory {
  id: string;
  name: string;
  displayNo: string;
  stage: string; // 任务阶段：客户信息确认 | 商品对应 | 字段核对 | 最终复核 | 整单归档
  blockingReason: string; // 阻塞原因
  nextActionText: string; // 下一步动作
  updatedAtText: string;
  currentStatusText: string;
  isMultiTask: boolean;
  multiTask?: MultiTaskSummary;
  badge: {
    label: string;
    variant: "blue" | "green" | "orange" | "gray";
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
    cta = { text: "处理商品对应", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "7 个商品存在多候选需指定，1 个商品未覆盖查货依据";
    nextActionText = "处理商品对应";
  } else if (displayNo === "2026BMH001" || customer.name.includes("百闽海")) {
    badgeLabel = "需要人工选择";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "warning", text: "6 个商品存在多个候选批次，需人工选定入仓对应" },
      { type: "info", text: "5 个商品暂未在查货材料中找到对应依据" },
    ];
    nextStepText = "存在多候选批次，证据不足时不凭目录名强配，等待人工选择";
    cta = { text: "选择商品对应", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "6 个商品存在多候选批次，5 个商品暂未找到查货依据";
    nextActionText = "选择商品对应";
  } else if (displayNo === "2026AG001" || customer.name.includes("傲冠")) {
    badgeLabel = "需要人工选择";
    badgeVariant = "orange";
    unresolvedItems = [
      { type: "warning", text: "2 个同型号商品存在多候选竞争，需人工指定对应查货明细" },
    ];
    nextStepText = "同型号商品存在多个可能对应，需要人工进行候选确认";
    cta = { text: "选择商品对应", actionType: "select-candidate", primary: true };
    stage = "商品对应";
    blockingReason = "2 个同型号商品存在多候选竞争，需人工指定对应查货明细";
    nextActionText = "选择商品对应";
  } else if (displayNo.includes("ZW") || customer.name.includes("智微") || customer.tasks.some(t => !t.draft.customerId)) {
    badgeLabel = isAllArchived ? "整单归档" : "客户未识别";
    badgeVariant = isAllArchived ? "green" : "orange";
    if (isAllArchived) {
      unresolvedItems = [{ type: "success", text: "整单业务已完成四步核对或归档入库，档案齐全" }];
      nextStepText = "整单业务已完成四步核对或归档入库，可在工作台中查看完整档案";
      cta = { text: "查看完整档案", actionType: "view-final", primary: false };
      stage = "整单归档";
      blockingReason = "无阻塞（整单已归档入库）";
      nextActionText = "查看完整档案";
    } else {
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

  return {
    id: customer.id,
    name: customer.name,
    displayNo,
    stage,
    blockingReason,
    nextActionText,
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
    statusText: hasInspectionMaterials ? "已就绪" : "等待查货单",
    productSummary: hasInspectionMaterials
      ? `${allSourceCountForCustomer || sources.length} 条查货明细 → ${
          mergedProductCount || Math.max(1, Math.ceil((allSourceCountForCustomer || sources.length) / 3))
        } 个可匹配商品`
      : "尚未收到查货单",
    actionNote: hasInspectionMaterials ? "仓储查货明细已结构化整理" : "需仓储补充查货材料",
  };

  // Stage 3: 自动寻找商品对应 (P3)
  let s3Status: ProcessStage["status"] = "waiting";
  let s3StatusText = "待开始核对";
  let s3Summary = `${matched}/${total} 个商品已对应`;
  let s3Note = "AI 自动寻找匹配关系";

  if (!hasInspectionMaterials) {
    s3Status = "waiting";
    s3StatusText = "等待查货资料";
    s3Summary = `0/${total} 已对应`;
    s3Note = "待查货单到达后执行匹配";
  } else if (matched === total && total > 0) {
    s3Status = "completed";
    s3StatusText = "全部已对应";
    s3Summary = `${matched}/${total} 商品已匹配查货依据`;
    s3Note = "已建立完整查货对应关系";
  } else if (matched > 0) {
    s3Status = "warning";
    s3StatusText = `部分对应 (${matched}/${total})`;
    s3Summary = `${matched}/${total} 商品已找到对应`;
    s3Note = `剩余 ${total - matched} 行需补充查货依据或手工指定`;
  } else {
    s3Status = "processing";
    s3StatusText = "待执行核对";
    s3Summary = `0/${total} 已对应`;
    s3Note = "请点击【开始核对】执行自动关联";
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
  let s4StatusText = "待前置匹配";
  let s4Summary = "待商品匹配后比对";
  let s4Note = "比对型号、品牌、产地与数量";

  if (matched === 0) {
    s4Status = "waiting";
    s4StatusText = "待前置匹配";
    s4Summary = "需先建立查货对应关系";
    s4Note = "匹配成功后自动比对 25 字段";
  } else if (conflicts > 0 || unresolvedIssues > 0) {
    s4Status = "warning";
    s4StatusText = `存在差异 (${conflicts + unresolvedIssues})`;
    s4Summary = `发现 ${conflicts + unresolvedIssues} 处字段差异待确认`;
    s4Note = "请在下方工作台核实修改或采纳查货值";
  } else if (matched === total) {
    s4Status = "completed";
    s4StatusText = "全字段核验一致";
    s4Summary = "核心 25 列字段全部核验通过";
    s4Note = "符合规范，可提交人工复核";
  } else {
    s4Status = "processing";
    s4StatusText = `部分核验 (${matched}/${total})`;
    s4Summary = `已比对 ${matched} 个商品的 25 字段`;
    s4Note = "待其余商品匹配后完成整单核对";
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
  let s5StatusText = "待前序核对";
  let s5Summary = "需先解决所有差异项";
  let s5Note = "生成 25 列最终核对单";

  if (isFinalized) {
    s5Status = "completed";
    s5StatusText = "已完成封版";
    s5Summary = "最终核对单已生成并归档";
    s5Note = "查货明细已核销入库";
  } else if (isConfirming) {
    s5Status = "processing";
    s5StatusText = "人工复核中";
    s5Summary = "当前正在人工最终复核";
    s5Note = "核实无误后点击【确认完成】，或点击【退回修改】";
  } else if (matched === total && conflicts === 0 && unresolvedIssues === 0) {
    s5Status = "warning";
    s5StatusText = "待提交复核";
    s5Summary = "所有字段核对通过，无冲突";
    s5Note = "请点击【提交人工复核】进入确认";
  } else {
    s5Status = "waiting";
    s5StatusText = "待前序核对";
    s5Summary = conflicts + unresolvedIssues > 0 ? `尚有 ${conflicts + unresolvedIssues} 项差异待裁决` : "需先完成商品匹配与字段核对";
    s5Note = "全部无误后开放人工复核";
  }

  const s5: ProcessStage = {
    step: 5,
    title: "人工最终确认",
    code: "归档",
    codeDesc: "最终核对与核销",
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
