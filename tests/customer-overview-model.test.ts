import { describe, expect, it } from 'vitest';
import { buildBusinessWorkspace, useDemoStore } from '../lib/demo-store';
import { getCustomerWorkbench } from '../lib/customer-workbench-model';
import { buildCustomerOverview, matchesOverviewFilter, selectOverviewCustomers } from '../lib/customer-overview';

const rows = () => {
  const state = { ...useDemoStore.getInitialState(), ...buildBusinessWorkspace() };
  const model = getCustomerWorkbench(state);
  return model.customers.map((customer) => buildCustomerOverview(customer, state.sources));
};

describe('客户业务概览业务状态', () => {
  it('多候选进入待确认对应并直达商品', () => {
    const row = rows().find((item) => item.customer.name.includes('英卡'))!;
    expect(row.focusTasks.some((task) => task.status === '待确认对应')).toBe(true);
    const task = row.focusTasks.find((item) => item.status === '待确认对应')!;
    expect(task.action.label).toContain('待确认商品');
    expect(task.action.draftId).toBeTruthy();
    expect(task.action.lineId).toBeTruthy();
    expect(matchesOverviewFilter(row, '需要我处理')).toBe(true);
  });

  it('等待材料不算人工待办', () => {
    const row = rows().find((item) => item.customer.name.includes('澳创'))!;
    expect(row.status).toBe('等待查货');
    expect(row.action).toMatchObject({ label: '查看任务详情', prominent: false });
    expect(matchesOverviewFilter(row, '需要我处理')).toBe(false);
  });

  it('全部对应后进入人工核对', () => {
    const row = rows().find((item) => item.customer.name.includes('英堡'))!;
    expect(row.status).toBe('待人工核对');
    expect(row.action.label).toBe('开始人工核对');
  });

  it('多任务最多展示两票，任务号可搜索', () => {
    const all = rows();
    const row = all.find((item) => item.customer.name.includes('英卡'))!;
    expect(row.tasks).toHaveLength(3);
    expect(row.focusTasks).toHaveLength(2);
    expect(selectOverviewCustomers(all, '全部', 'YK-260625131-2', 'priority')).toEqual([row]);
  });

  it('已完成不进入需要我处理', () => {
    const row = rows().find((item) => item.customer.name.includes('欧陆通'))!;
    expect(row.status).toBe('已完成');
    expect(matchesOverviewFilter(row, '需要我处理')).toBe(false);
  });
});
