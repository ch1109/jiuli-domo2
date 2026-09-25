import type { CustomerModel } from './customer-workbench-model';
import { getInspectionAvailability } from './inspection-availability';
import type { UiSource } from './demo-store';

export type OverviewStatus = '前置问题' | '等待查货' | '待确认对应' | '待人工核对' | '部分完成' | '已完成';
export type OverviewFilter = '全部' | '需要我处理' | OverviewStatus;
export type OverviewTarget = 'customer' | 'candidate' | 'problem' | 'review' | 'task' | 'final' | 'archive';
export const OVERVIEW_FILTERS: OverviewFilter[] = ['全部', '需要我处理', '前置问题', '等待查货', '待确认对应', '待人工核对', '部分完成', '已完成'];

export interface OverviewAction { label: string; target: OverviewTarget; draftId?: string; lineId?: string; prominent: boolean; }
export interface OverviewTask {
  id: string; displayNo: string; status: OverviewStatus; total: number; done: number; waiting: number; humanTodos: number;
  progress: string; problem: string; action: OverviewAction; updatedAt: string; priority: number;
}
export interface OverviewCustomer {
  customer: CustomerModel; status: OverviewStatus; tasks: OverviewTask[]; focusTasks: OverviewTask[]; activeTasks: number;
  total: number; done: number; waiting: number; humanTodos: number; progress: string; problem: string; action: OverviewAction;
  updatedAt: string; priority: number;
}

const rank: Record<OverviewStatus, number> = { '前置问题': 6, '待确认对应': 5, '待人工核对': 4, '部分完成': 3, '等待查货': 2, '已完成': 0 };
const makeAction = (label: string, target: OverviewTarget, draftId?: string, lineId?: string, prominent = true): OverviewAction => ({ label, target, draftId, lineId, prominent });

export function buildCustomerOverview(customer: CustomerModel, sources: readonly UiSource[], finalDraftIds: ReadonlySet<string> = new Set()): OverviewCustomer {
  const items = new Map((customer.commoditySummary?.items ?? []).map((item) => [item.lineId, item]));
  const tasks = customer.tasks.map((task) => {
    const { draft } = task;
    const total = draft.lines.length;
    const lines = draft.lines.map((line) => {
      const item = items.get(line.id);
      const availability = item?.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || item?.relationLevel === 'MODEL_CONFLICT' ? 'CANDIDATES' : item?.relationLevel === 'NO_MODEL_CANDIDATE' ? 'MISSING' : item ? 'MATCHED' : getInspectionAvailability(draft, line, sources, true);
      return { line, item, availability };
    });
    const candidates = lines.filter(({ item, availability }) => item?.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || item?.relationLevel === 'MODEL_CONFLICT' || (!item && availability === 'CANDIDATES'));
    const reviewReady = task.businessStatus === '待人工复核' || task.businessStatus === 'AI核对完成 · 待人工复核';
    const candidateTask = task.matched < task.total && (task.nextAction === '选择商品对应' || task.businessStatus === '待人工处理');
    const candidateCount = reviewReady ? 0 : candidates.length || (candidateTask ? Math.max(1, task.issues) : 0);
    const conflicts = lines.filter(({ item }) => item?.relationLevel === 'MODEL_CONFLICT');
    const waiting = lines.filter(({ availability }) => availability === 'MISSING');
    const done = lines.filter(({ availability }) => availability === 'MATCHED').length;
    const confirmed = draft.lines.filter((line) => line.manuallyConfirmed).length;
    const missingCustomer = !draft.customerId || draft.customerId === 'UNKNOWN' || draft.customerStatus === '待补客户信息';
    const fieldProblems = draft.lines.filter((line) => !line.manuallyConfirmed && (line.issueIds.some((id) => /字段|冲突|必填|修改|确认/.test(id) && !/查货|候选|材料/.test(id)) || (line.issue && /字段|冲突|必填|修改/.test(line.issue) && !/查货|候选|材料/.test(line.issue))));
    const preCount = (missingCustomer ? 1 : 0) + fieldProblems.length + conflicts.length;
    let status: OverviewStatus; let progress: string; let problem: string; let next: OverviewAction;
    if (draft.finalized || draft.status === '已完成') { status = '已完成'; progress = `已完成 ${total} / ${total}`; problem = '核对已完成'; next = finalDraftIds.has(draft.id) ? makeAction('查看最终核对单', 'final', draft.id) : makeAction('查看历史档案', 'archive', draft.id); }
    else if (preCount > 0) { status = '前置问题'; progress = `查货覆盖 ${done} / ${total}`; problem = missingCustomer ? '客户信息待确认' : `${preCount} 个材料或字段问题待处理`; next = missingCustomer ? makeAction('处理客户信息', 'customer', draft.id) : makeAction(`处理 ${preCount} 个材料问题`, 'problem', draft.id, conflicts[0]?.line.id ?? fieldProblems[0]?.id); }
    else if (candidateCount > 0) { status = '待确认对应'; progress = `查货覆盖 ${done} / ${total}`; problem = `${candidateCount} 个商品待确认对应`; next = makeAction(`处理 ${candidateCount} 个待确认商品`, 'candidate', draft.id, candidates[0]?.line.id ?? draft.lines[0]?.id); }
    else if (done === total && total > 0) { status = '待人工核对'; progress = `人工核对 ${confirmed} / ${total}`; problem = confirmed < total ? `${total - confirmed} 个商品待人工核对` : '全部商品已对应，等待人工核对'; next = makeAction(confirmed === 0 ? '开始人工核对' : `继续核对 ${total - confirmed} 个商品`, 'review', draft.id, draft.lines.find((line) => !line.manuallyConfirmed)?.id); }
    else if (done > 0 || confirmed > 0) { status = '部分完成'; progress = `已完成 ${done} / ${total}`; problem = `○ ${waiting.length} 个商品等待查货材料`; next = makeAction('查看任务详情', 'task', draft.id, waiting[0]?.line.id, false); }
    else { status = '等待查货'; progress = `查货覆盖 ${done} / ${total}`; problem = `○ ${waiting.length} 个商品等待查货材料`; next = makeAction('查看任务详情', 'task', draft.id, waiting[0]?.line.id, false); }
    const humanTodos = status === '已完成' || status === '等待查货' || status === '部分完成' ? 0 : preCount + candidateCount + (status === '待人工核对' ? total - confirmed : 0);
    return { id: draft.id, displayNo: draft.displayNo, status, total, done: status === '已完成' ? total : done, waiting: status === '已完成' ? 0 : waiting.length, humanTodos, progress, problem, action: next, updatedAt: draft.updatedAt, priority: rank[status] };
  }).sort((a, b) => b.priority - a.priority || b.humanTodos - a.humanTodos || b.updatedAt.localeCompare(a.updatedAt));
  const active = tasks.filter((task) => task.status !== '已完成');
  const lead = active[0] ?? tasks[0];
  const status = lead?.status ?? '已完成';
  const total = tasks.length ? tasks.reduce((n, task) => n + task.total, 0) : customer.counts.lines;
  const done = tasks.length ? tasks.reduce((n, task) => n + task.done, 0) : total;
  const waiting = tasks.reduce((n, task) => n + task.waiting, 0);
  const humanTodos = active.reduce((n, task) => n + task.humanTodos, 0);
  return { customer, status, tasks, focusTasks: active.slice(0, 2), activeTasks: active.length, total, done, waiting, humanTodos, progress: tasks.length > 1 ? `${total} 个商品 · ${done} 已完成 · ${total - done} 待处理` : (lead?.progress ?? `已完成 ${done} / ${total}`), problem: lead?.problem ?? '历史业务已归档', action: lead?.action ?? makeAction('查看历史档案', 'archive'), updatedAt: customer.latest ?? lead?.updatedAt ?? '', priority: rank[status] };
}

export function matchesOverviewFilter(row: OverviewCustomer, filter: OverviewFilter): boolean {
  if (filter === '全部') return true;
  if (filter === '需要我处理') return row.humanTodos > 0;
  return row.tasks.some((task) => task.status === filter) || (row.tasks.length === 0 && row.status === filter);
}

export function selectOverviewCustomers(rows: OverviewCustomer[], filter: OverviewFilter, query: string, sort: 'priority' | 'recent' | 'longestWaiting' | 'name'): OverviewCustomer[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => matchesOverviewFilter(row, filter) && (!q || `${row.customer.name} ${row.customer.id} ${row.tasks.map((task) => task.displayNo).join(' ')}`.toLowerCase().includes(q))).sort((a, b) => sort === 'name' ? a.customer.name.localeCompare(b.customer.name, 'zh-CN') : sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : sort === 'longestWaiting' ? (a.status === '已完成' ? 1 : 0) - (b.status === '已完成' ? 1 : 0) || a.updatedAt.localeCompare(b.updatedAt) : b.priority - a.priority || b.humanTodos - a.humanTodos || b.updatedAt.localeCompare(a.updatedAt));
}
