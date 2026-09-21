import { describe, expect, it } from "vitest";
import { buildBusinessWorkspace, useDemoStore } from "../lib/demo-store";
import { getCustomerWorkbench } from "../lib/customer-workbench-model";
import { generateCustomerStory } from "../lib/business-translation";
import auditIndex from "../demo-generated/mock/model-audit-index.json";

describe("客户业务概览卡片与客户工作台内部数据强一致性断言", () => {
  it("所有 9 家客户在业务概览卡片与工作台内部的文件数、商品数、查货数完全对齐", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    const getCustomerAudits = (custId: string) => auditIndex.samples.filter((s) => s.customerId === custId);

    expect(model.customers).toHaveLength(9);

    for (const c of model.customers) {
      const story = generateCustomerStory(c);
      const customerAudits = getCustomerAudits(c.id);

      // 工作台顶部指标计算逻辑
      const totalArchivedRows = customerAudits.reduce((n, a) => n + a.counts.orderRows, 0);
      const totalArchivedRaw = customerAudits.reduce((n, a) => n + a.counts.rawRows, 0);
      const tasksVal = c.tasks.length > 0 ? c.tasks.length : customerAudits.length;
      const linesVal = c.tasks.length > 0 ? c.tasks.reduce((n, t) => n + t.total, 0) : totalArchivedRows;
      const ordersVal = c.sources.length > 0 ? new Set(c.sources.map(s => s.logicalInspectionOrderId)).size : customerAudits.length;
      const rawVal = c.sources.length > 0 ? c.sources.length : totalArchivedRaw;

      // 1. 任务数与商品行数对齐
      expect(c.counts.tasks).toBe(tasksVal);
      expect(c.counts.lines).toBe(linesVal);

      // 2. 查货批次数与明细条数对齐
      expect(c.counts.orders).toBe(ordersVal);
      expect(c.counts.raw).toBe(rawVal);

      // 3. 工作台委托材料池展示的文件数 == counts.orderFiles
      const taskFileIds = new Set(c.tasks.flatMap(t => t.draft.materialFileIds));
      const workbenchEntrustFilesCount = c.tasks.length > 0
        ? taskFileIds.size
        : new Set(customerAudits.flatMap(a => a.entrustmentFiles)).size;
      expect(c.counts.orderFiles).toBe(workbenchEntrustFilesCount);

      // 4. 工作台查货材料池展示的文件数 == counts.inspectionFiles
      const sourceFileIds = new Set(c.sources.map(s => s.sourceFileId));
      const workbenchInspectionFilesCount = sourceFileIds.size > 0
        ? sourceFileIds.size
        : new Set(customerAudits.flatMap(a => a.inspectionFiles)).size;
      expect(c.counts.inspectionFiles).toBe(workbenchInspectionFilesCount);

      // 5. 概览卡片故事文字中的文件数与 counts 完全一致
      expect(story.materialsSummary).toBe(
        `委托书 ${c.counts.orderFiles}份 · 箱单 ${c.counts.packingFiles}份 · 查货单 ${c.counts.inspectionFiles}份`
      );

      // 6. 箱单与发票不会虚假计算（当前样本中查货单不再被误判为箱单）
      expect(c.counts.packingFiles).toBe(0);
      expect(c.counts.invoiceFiles).toBe(0);

      // 7. 百闽海等客户档案查货材料就绪，不可显示“尚未收到查货单”
      if (rawVal > 0) {
        expect(story.aiInspectionSummary).not.toBe("尚未收到查货单，查货库暂无明细");
      }
    }
  });

  it("特定关键客户样本的精确文件数与商品数验证", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    const puyi = model.customers.find(c => c.name.includes("浦壹"))!;
    expect(puyi.counts.orderFiles).toBe(1);
    expect(puyi.counts.packingFiles).toBe(0);
    expect(puyi.counts.inspectionFiles).toBe(1);
    expect(puyi.counts.lines).toBe(9);
    expect(puyi.counts.raw).toBe(9);

    const yingka = model.customers.find(c => c.name.includes("英卡"))!;
    expect(yingka.counts.orderFiles).toBe(3);
    expect(yingka.counts.packingFiles).toBe(0);
    expect(yingka.counts.inspectionFiles).toBe(1);
    expect(yingka.counts.tasks).toBe(3);
    expect(yingka.counts.lines).toBe(9);
    expect(yingka.counts.raw).toBe(12);

    const baiminhai = model.customers.find(c => c.name.includes("百闽海"))!;
    expect(baiminhai.counts.orderFiles).toBe(1);
    expect(baiminhai.counts.packingFiles).toBe(0);
    expect(baiminhai.counts.inspectionFiles).toBe(11);
    expect(baiminhai.counts.lines).toBe(11);
    expect(baiminhai.counts.raw).toBe(22);

    const zhiwei = model.customers.find(c => c.name.includes("智微智能"))!;
    expect(zhiwei.counts.orderFiles).toBe(3);
    expect(zhiwei.counts.packingFiles).toBe(0);
    expect(zhiwei.counts.inspectionFiles).toBe(5);
    expect(zhiwei.counts.tasks).toBe(3);
    expect(zhiwei.counts.lines).toBe(12);
    expect(zhiwei.counts.raw).toBe(13);

    const oulutong = model.customers.find(c => c.name.includes("欧陆通"))!;
    expect(oulutong.counts.orderFiles).toBe(1);
    expect(oulutong.counts.packingFiles).toBe(0);
    expect(oulutong.counts.inspectionFiles).toBe(12);
    expect(oulutong.counts.tasks).toBe(1);
    expect(oulutong.counts.raw).toBe(57);
  });
});
