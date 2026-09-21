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
  const totalTasks = model.tasks.length;
  const processingTasks = model.tasks.filter((t) => t.businessStatus !== "已完成").length;
  const waitingMatchTasks = model.tasks.filter((t) => t.businessStatus === "待匹配").length;
  const issueTasks = model.tasks.filter(
    (t) => t.businessStatus === "待人工处理" || t.businessStatus === "异常"
  ).length;
  const reviewingTasks = model.tasks.filter(
    (t) => t.businessStatus.includes("待人工复核") || t.businessStatus === "人工复核中"
  ).length;
  const completedTasks = model.tasks.filter((t) => t.businessStatus === "已完成").length;

  const headline = "今日业务概况";
  const storyLead = `当前有 ${processingTasks} 票委托正在处理。`;

  let middlePart = `其中 ${waitingMatchTasks} 票正在等待查货对应`;
  if (issueTasks > 0) {
    middlePart += `，${issueTasks} 票存在材料或客户信息异常`;
  }
  if (reviewingTasks > 0) {
    middlePart += `，已有 ${reviewingTasks} 票进入人工复核`;
  } else {
    middlePart += `。暂时还没有进入人工复核的任务`;
  }
  const storyDetail = `${middlePart}。`;

  const metrics = [
    {
      key: "all",
      label: "全部任务",
      count: totalTasks,
      subtext: `覆盖 ${model.customers.length} 家客户`,
      filter: "全部任务",
    },
    {
      key: "processing",
      label: "处理中委托",
      count: processingTasks,
      subtext: "正在推进核对",
      filter: "处理中",
    },
    {
      key: "waiting",
      label: "等待商品对应",
      count: waitingMatchTasks,
      subtext: "待执行匹配或待查货",
      filter: "待匹配",
    },
    {
      key: "issues",
      label: "待人工处理",
      count: issueTasks,
      subtext: "材料/客户疑问或冲突",
      filter: "待人工处理",
    },
    {
      key: "reviewing",
      label: "待人工复核",
      count: reviewingTasks,
      subtext: "AI核对完成待签字",
      filter: "待人工复核",
    },
    {
      key: "completed",
      label: "已完成核对",
      count: completedTasks,
      subtext: "已生成最终核对单",
      filter: "已完成",
    },
  ];

  return { headline, storyLead, storyDetail, metrics };
}

/**
 * 客户卡片「故事卡」业务叙事生成
 */
export interface CustomerStory {
  id: string;
  name: string;
  updatedAtText: string;
  currentStatusText: string;
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
  progressMatched: number;
  progressTotal: number;
  progressText: string;
  nextStepText: string;
  primaryTaskId: string | null;
  primaryTaskDisplayNo: string | null;
  hasIssues: boolean;
}

export function generateCustomerStory(customer: CustomerModel): CustomerStory {
  const totalTasks = customer.counts.tasks;
  const activeTasks = customer.tasks.filter((t) => !t.draft.finalized);
  const totalLines = customer.counts.lines;
  const matchedLines = customer.tasks.reduce((sum, t) => sum + t.matched, 0);

  const materialsSummary = `委托书 ${customer.counts.orderFiles}份 · 箱单 ${customer.counts.packingFiles}份 · 查货单 ${customer.counts.inspectionFiles}份`;

  let badgeLabel = "等待商品对应";
  let badgeVariant: "blue" | "green" | "orange" | "gray" = "blue";

  if (totalTasks === 0 && customer.counts.raw === 0) {
    badgeLabel = "暂无任务";
    badgeVariant = "gray";
  } else if (activeTasks.length === 0 && totalTasks > 0) {
    badgeLabel = "整单归档";
    badgeVariant = "green";
  } else if (matchedLines === totalLines && totalLines > 0) {
    badgeLabel = "AI核对完成 · 待复核";
    badgeVariant = "green";
  } else if (customer.counts.inspectionFiles === 0) {
    badgeLabel = "等待查货材料";
    badgeVariant = "orange";
  } else if (matchedLines === 0 && customer.counts.raw > 0) {
    badgeLabel = "等待商品对应";
    badgeVariant = "blue";
  } else if (customer.issues.length > 0) {
    badgeLabel = "需人工关注";
    badgeVariant = "orange";
  } else {
    badgeLabel = "等待商品对应";
    badgeVariant = "blue";
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

  const progressText = `${matchedLines} / ${totalLines} 个商品找到查货依据`;

  let nextStepText = "AI 正在寻找商品对应关系（如仍无法确认，将进入人工选择）";
  if (activeTasks.length === 0 && totalTasks > 0) {
    nextStepText = "整单业务已完成四步核对或归档入库，可在工作台中查看完整档案";
  } else if (customer.counts.inspectionFiles === 0) {
    nextStepText = "仓储尚未上传查货材料，等待查货单到达后自动匹配";
  } else if (matchedLines === 0 && customer.counts.raw > 0) {
    nextStepText = "AI 正在寻找商品对应关系（如仍无法确认，将进入人工选择）";
  } else if (customer.issues.length > 0) {
    nextStepText = `存在 ${customer.issues.length} 处材料或字段疑问，需要人工介入处理`;
  } else if (matchedLines === totalLines && totalLines > 0) {
    nextStepText = "所有商品均已找到查货依据并通过核对，等待人工最终复核确认";
  }

  const primaryTask = customer.tasks[0]?.draft;

  const updatedAtText = customer.latest
    ? new Date(customer.latest).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "暂无更新";

  return {
    id: customer.id,
    name: customer.name,
    updatedAtText,
    currentStatusText,
    badge: { label: badgeLabel, variant: badgeVariant },
    materialsSummary,
    orderProductCount: customer.counts.lines,
    inspectionRawCount: customer.counts.raw,
    inspectionMergedCount: customer.counts.merged,
    aiOrderSummary,
    aiInspectionSummary,
    progressMatched: matchedLines,
    progressTotal: totalLines,
    progressText,
    nextStepText,
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
}

export function generateTaskProcessStages(
  draft: UiDraft | undefined,
  sources: readonly unknown[] = [],
  allSourceCountForCustomer = 0,
  mergedProductCount = 0
): ProcessStage[] {
  if (!draft || !draft.lines) {
    return [
      { step: 1, title: "整理委托材料", code: "P1", codeDesc: "委托材料识别", status: "waiting", statusText: "待接入", productSummary: "尚未选择委托草稿", actionNote: "请先选择委托任务" },
      { step: 2, title: "整理查货材料", code: "P2", codeDesc: "查货材料识别", status: "waiting", statusText: "待接入", productSummary: "尚未收到查货单", actionNote: "需仓储补充查货材料" },
      { step: 3, title: "自动寻找商品对应", code: "P3", codeDesc: "商品自动对应", status: "waiting", statusText: "等待上一步", productSummary: "需先整理材料", actionNote: "待材料接入后匹配" },
      { step: 4, title: "自动核对字段", code: "P4", codeDesc: "字段自动核对", status: "waiting", statusText: "等待上一步", productSummary: "需先找到查货对应", actionNote: "比对型号、品牌与产地" },
      { step: 5, title: "人工最终确认", code: "归档", codeDesc: "最终核对与核销", status: "waiting", statusText: "等待上一步", productSummary: "待前序核对通过", actionNote: "生成最终核对单" },
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
    statusText: hasInspectionMaterials ? "已完成" : "等待查货",
    productSummary: hasInspectionMaterials
      ? `${allSourceCountForCustomer || sources.length} 条查货明细 → ${
          mergedProductCount || Math.max(1, Math.ceil((allSourceCountForCustomer || sources.length) / 3))
        } 个可匹配商品`
      : "尚未收到查货单",
    actionNote: hasInspectionMaterials ? "三键规则整理入库" : "需仓储补充查货材料",
  };

  // Stage 3: 自动寻找商品对应 (P3)
  let s3Status: ProcessStage["status"] = "waiting";
  let s3StatusText = "等待上一步";
  let s3Summary = `${matched}/${total} 个商品已对应`;
  let s3Note = "AI 自动寻找匹配关系";

  if (!hasInspectionMaterials) {
    s3Status = "waiting";
    s3StatusText = "等待查货材料";
    s3Summary = `0/${total} 已对应`;
    s3Note = "查货材料到达后自动匹配";
  } else if (matched === total && total > 0) {
    s3Status = "completed";
    s3StatusText = "全部已对应";
    s3Summary = `${matched}/${total} 商品已找到对应`;
    s3Note = "AI 找到唯一可靠查货依据";
  } else if (matched > 0) {
    s3Status = "warning";
    s3StatusText = "部分已对应";
    s3Summary = `${matched}/${total} 商品已找到对应`;
    s3Note = `剩余 ${total - matched} 行暂无可靠依据`;
  } else {
    s3Status = "processing";
    s3StatusText = "处理中";
    s3Summary = `0/${total} 已对应`;
    s3Note = "暂无可靠查货对应，等待执行匹配";
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
  let s4StatusText = "等待上一步";
  let s4Summary = "等待商品对应";
  let s4Note = "比对型号、品牌、产地与数量";

  if (matched === 0) {
    s4Status = "waiting";
    s4StatusText = "等待上一步";
    s4Summary = "需先找到查货对应";
    s4Note = "找到对应后自动比对";
  } else if (conflicts > 0 || unresolvedIssues > 0) {
    s4Status = "warning";
    s4StatusText = "存在冲突";
    s4Summary = `发现 ${conflicts + unresolvedIssues} 处字段差异`;
    s4Note = "需人工裁决或按查货修改";
  } else if (matched === total) {
    s4Status = "completed";
    s4StatusText = "核对一致";
    s4Summary = "核心字段全部核对通过";
    s4Note = "符合报关申报规范";
  } else {
    s4Status = "processing";
    s4StatusText = "部分核对完成";
    s4Summary = `已核对 ${matched} 个商品的字段`;
    s4Note = "待其余商品匹配后比对";
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
  let s5StatusText = "等待上一步";
  let s5Summary = "等待完成前序核对";
  let s5Note = "生成 25 列最终核对单";

  if (isFinalized) {
    s5Status = "completed";
    s5StatusText = "已完成封版";
    s5Summary = "最终核对单已生成";
    s5Note = "查货明细已完成使用并核销";
  } else if (isConfirming) {
    s5Status = "processing";
    s5StatusText = "人工确认中";
    s5Summary = "正在复核最终数据";
    s5Note = "核实无误后点击“确认完成”";
  } else if (matched === total && conflicts === 0 && unresolvedIssues === 0) {
    s5Status = "warning";
    s5StatusText = "待提交复核";
    s5Summary = "所有字段核对通过";
    s5Note = "可点击“提交人工复核”";
  } else {
    s5Status = "waiting";
    s5StatusText = "等待上一步";
    s5Summary = "需先解决所有问题行";
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

  return [s1, s2, s3, s4, s5];
}

/**
 * 演示场景体验清单
 */
export const DEMO_SCENARIO_SHOWCASES = [
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
