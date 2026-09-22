import { describe, expect, it } from 'vitest';
import { buildBusinessWorkspace, useDemoStore } from '../lib/demo-store';
import { getCustomerWorkbench } from '../lib/customer-workbench-model';
import { generateCustomerStory } from '../lib/business-translation';

describe('客户业务概览交互定稿规范测试（四级层级体系）', () => {
  it('1. 固定核心入口（Persistent Navigation）——永远存在', () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    expect(model.customers).toHaveLength(9);

    for (const c of model.customers) {
      const story = generateCustomerStory(c);
      const { actionModel } = story;

      // 单任务客户固定入口为“查看商品对应 →”，多任务为“查看全部商品对应 →”
      if (story.isMultiTask) {
        expect(actionModel.persistentEntryText).toBe('查看全部商品对应 →');
      } else {
        expect(actionModel.persistentEntryText).toBe('查看商品对应 →');
      }
    }
  });

  it('2. 动态主操作（Primary Action）——每张卡最多一个高强调实心按钮，无待办时为 null', () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    // 浦壹：需要人工确认 7 个商品的多候选 -> [处理商品对应]
    const puyi = model.customers.find((c) => c.name.includes('浦壹'))!;
    const puyiStory = generateCustomerStory(puyi);
    expect(puyiStory.actionModel.primaryAction?.text).toBe('处理商品对应');

    // 百闽海：6 个商品存在多个候选批次 -> [选择对应商品]
    const bmh = model.customers.find((c) => c.name.includes('百闽海'))!;
    const bmhStory = generateCustomerStory(bmh);
    expect(bmhStory.actionModel.primaryAction?.text).toBe('选择对应商品');

    // 傲冠：同型号多候选竞争 -> [选择对应商品]
    const ag = model.customers.find((c) => c.name.includes('傲冠'))!;
    const agStory = generateCustomerStory(ag);
    expect(agStory.actionModel.primaryAction?.text).toBe('选择对应商品');

    // 英堡科技：AI 核对完成，待人工复核 -> [开始人工复核]
    const yingbao = model.customers.find((c) => c.name.includes('英堡'))!;
    const yingbaoStory = generateCustomerStory(yingbao);
    expect(yingbaoStory.actionModel.primaryAction?.text).toBe('开始人工复核');

    // 澳创实业：等待查货资料 -> 无主操作（null）
    const acsy = model.customers.find((c) => c.name.includes('澳创'))!;
    const acsyStory = generateCustomerStory(acsy);
    expect(acsyStory.actionModel.primaryAction).toBeNull();

    // 福建超年：等待查货资料 -> 无主操作（null）
    const cnkj = model.customers.find((c) => c.name.includes('超年'))!;
    const cnkjStory = generateCustomerStory(cnkj);
    expect(cnkjStory.actionModel.primaryAction).toBeNull();

    // 深圳欧陆通：整单归档（已完成） -> 无主操作（null）
    const oult = model.customers.find((c) => c.name.includes('欧陆通'))!;
    const oultStory = generateCustomerStory(oult);
    expect(oultStory.actionModel.primaryAction).toBeNull();

    // 深圳市英卡科技：并发多任务目前均处于等待查货 -> 无主操作（null）
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const yingkaStory = generateCustomerStory(yingka);
    expect(yingkaStory.actionModel.primaryAction).toBeNull();
  });

  it('3. 弱导航（Secondary Link）与低频操作（More Actions 收纳至 ···）', () => {
    const data = buildBusinessWorkspace();
    const state = { ...useDemoStore.getInitialState(), ...data };
    const model = getCustomerWorkbench(state);

    // 英卡科技（多任务）：弱导航为“查看全部 3 票 ›”
    const yingka = model.customers.find((c) => c.name.includes('英卡'))!;
    const yingkaStory = generateCustomerStory(yingka);
    expect(yingkaStory.actionModel.secondaryLink?.text).toBe('查看全部 3 票 ›');

    // 欧陆通（已完成单任务）：弱导航为“查看最终核对单 →”
    const oult = model.customers.find((c) => c.name.includes('欧陆通'))!;
    const oultStory = generateCustomerStory(oult);
    expect(oultStory.actionModel.secondaryLink?.text).toBe('查看最终核对单 →');

    // 澳创（单任务未归档）：无弱导航
    const acsy = model.customers.find((c) => c.name.includes('澳创'))!;
    const acsyStory = generateCustomerStory(acsy);
    expect(acsyStory.actionModel.secondaryLink).toBeNull();

    // 所有客户均在 moreActions 中包含低频功能（如补充查货资料、查看原始材料等）
    for (const c of model.customers) {
      const story = generateCustomerStory(c);
      const actionKeys = story.actionModel.moreActions.map((a) => a.actionType);
      expect(actionKeys).toContain('upload-inspection'); // 补充查货资料
      expect(actionKeys).toContain('view-materials');    // 查看原始材料
      expect(actionKeys).toContain('view-history');      // 查看处理历史
      expect(actionKeys).toContain('view-tech-detail');  // 查看技术详情
    }
  });
});
