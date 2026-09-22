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

  it("各客户商品找到查货依据的当前进度、百分比与文案真实准确（非全0）", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    // 1. 上海浦壹：9行中有8行在查货单中存在依据（7行W25N01GVZEIG + 1行88E6240A1TFJ2C000），1行LIS2DU12TR查无此货
    const puyi = model.customers.find(c => c.name.includes("浦壹"))!;
    const puyiStory = generateCustomerStory(puyi);
    expect(puyi.counts.matched).toBe(8);
    expect(puyiStory.progressText).toBe("8 / 9 个商品找到查货依据");
    expect(puyiStory.progressPercent).toBe(89);
    expect(puyiStory.badge.label).toBe("部分商品已对应");
    expect(puyiStory.nextStepText).toContain("需要人工确认 7 个商品的多候选对应");

    // 2. 英堡科技：2行商品全部与查货单型号对应
    const yingbao = model.customers.find(c => c.name.includes("英堡"))!;
    const yingbaoStory = generateCustomerStory(yingbao);
    expect(yingbao.counts.matched).toBe(2);
    expect(yingbaoStory.progressText).toBe("2 / 2 个商品找到查货依据");
    expect(yingbaoStory.progressPercent).toBe(100);
    expect(yingbaoStory.badge.label).toBe("AI核对完成 · 待复核");

    // 3. 英卡科技：3票任务各1行UMW2631在查货单中有依据，共3/9
    const yingka = model.customers.find(c => c.name.includes("英卡"))!;
    const yingkaStory = generateCustomerStory(yingka);
    expect(yingka.counts.matched).toBe(3);
    expect(yingkaStory.progressText).toBe("3 / 9 个商品找到查货依据");
    expect(yingkaStory.progressPercent).toBe(33);
    expect(yingkaStory.badge.label).toBe("等待查货材料");

    // 4. 百闽海：11行中有6行在查货档案中存在依据（6条多候选批次，5条暂未覆盖）
    const baiminhai = model.customers.find(c => c.name.includes("百闽海"))!;
    const baiminhaiStory = generateCustomerStory(baiminhai);
    expect(baiminhai.counts.matched).toBe(6);
    expect(baiminhaiStory.progressText).toBe("6 / 11 个商品找到查货依据");
    expect(baiminhaiStory.progressPercent).toBe(55);
    expect(baiminhaiStory.badge.label).toBe("需要人工选择");

    // 5. 澳创实业：4行全部对应
    const aochuang = model.customers.find(c => c.name.includes("澳创"))!;
    const aochuangStory = generateCustomerStory(aochuang);
    expect(aochuang.counts.matched).toBe(4);
    expect(aochuangStory.progressText).toBe("4 / 4 个商品找到查货依据");
    expect(aochuangStory.progressPercent).toBe(100);

    // 6. 傲冠软件：2行全部对应
    const aoguan = model.customers.find(c => c.name.includes("傲冠"))!;
    const aoguanStory = generateCustomerStory(aoguan);
    expect(aoguan.counts.matched).toBe(2);
    expect(aoguanStory.progressText).toBe("2 / 2 个商品找到查货依据");
    expect(aoguanStory.progressPercent).toBe(100);

    // 7. 超超科技：1行全部对应
    const chaochao = model.customers.find(c => c.name.includes("超年") || c.name.includes("超超"))!;
    const chaochaoStory = generateCustomerStory(chaochao);
    expect(chaochao.counts.matched).toBe(1);
    expect(chaochaoStory.progressText).toBe("1 / 1 个商品找到查货依据");
    expect(chaochaoStory.progressPercent).toBe(100);

    // 8. 智微智能：整单归档12行全部完成
    const zhiwei = model.customers.find(c => c.name.includes("智微智能"))!;
    const zhiweiStory = generateCustomerStory(zhiwei);
    expect(zhiwei.counts.matched).toBe(12);
    expect(zhiweiStory.progressText).toBe("12 / 12 个商品找到查货依据");
    expect(zhiweiStory.progressPercent).toBe(100);
    expect(zhiweiStory.badge.label).toBe("整单归档");

    // 9. 深圳欧陆通：整单归档就绪
    const oulutong = model.customers.find(c => c.name.includes("欧陆通"))!;
    const oulutongStory = generateCustomerStory(oulutong);
    expect(oulutongStory.progressText).toBe("整单已归档就绪");
    expect(oulutongStory.progressPercent).toBe(100);
    expect(oulutongStory.badge.label).toBe("整单归档");
  });

  it("待办任务中心表格 (TaskTable) 中的单号必须为真实整单业务单号且进度客观真实非全0", () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    // 1. 严格断言：不再出现任何 W001~W012 临时编号
    const oldFormatTasks = model.tasks.filter(t => t.draft.displayNo.match(/^W\d{3}$/));
    expect(oldFormatTasks).toHaveLength(0);

    // 2. 英堡科技真实任务 (2025YBT010-2)：2/2 匹配，状态为待人工复核，下一步开始人工复核
    const ybtTask = model.tasks.find(t => t.draft.displayNo === '2025YBT010-2')!;
    expect(ybtTask).toBeDefined();
    expect(ybtTask.total).toBe(2);
    expect(ybtTask.matched).toBe(2);
    expect(ybtTask.businessStatus).toBe('待人工复核');
    expect(ybtTask.nextAction).toBe('开始人工复核');

    // 3. 上海浦壹真实任务 (26SHPYD056)：8/9 匹配，状态为部分核对，下一步处理商品对应
    const puyiTask = model.tasks.find(t => t.draft.displayNo === '26SHPYD056')!;
    expect(puyiTask).toBeDefined();
    expect(puyiTask.total).toBe(9);
    expect(puyiTask.matched).toBe(8);
    expect(puyiTask.businessStatus).toBe('部分核对');
    expect(puyiTask.nextAction).toBe('处理商品对应');

    // 4. 百闽海科技真实任务 (2026BMH001)：6/11 匹配，下一步选择商品对应
    const bmhTask = model.tasks.find(t => t.draft.displayNo === '2026BMH001')!;
    expect(bmhTask).toBeDefined();
    expect(bmhTask.total).toBe(11);
    expect(bmhTask.matched).toBe(6);
    expect(bmhTask.nextAction).toBe('选择商品对应');

    // 5. 英卡科技真实任务 (YK-260625131-1)：1/3 匹配，下一步补充查货材料
    const ykTask = model.tasks.find(t => t.draft.displayNo === 'YK-260625131-1')!;
    expect(ykTask).toBeDefined();
    expect(ykTask.total).toBe(3);
    expect(ykTask.matched).toBe(1);
    expect(ykTask.nextAction).toBe('补充查货材料');

    // 6. 智微智能无客户真实任务 (2026(DG)ZW001)：异常，需补充客户
    const zwTask = model.tasks.find(t => t.draft.displayNo === '2026(DG)ZW001')!;
    expect(zwTask).toBeDefined();
    expect(zwTask.matched).toBe(0);
    expect(zwTask.businessStatus).toBe('异常');
    expect(zwTask.nextAction).toBe('补充客户');
  });
});
