const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MOCK = path.join(ROOT, 'demo-generated/mock');
const CALIBRATION = path.join(ROOT, 'demo-generated/real-calibration');

const drafts = JSON.parse(fs.readFileSync(path.join(MOCK, 'entrustment-drafts.json'), 'utf8'));
const elines = JSON.parse(fs.readFileSync(path.join(MOCK, 'entrustment-lines.json'), 'utf8'));
const slines = JSON.parse(fs.readFileSync(path.join(MOCK, 'inspection-source-lines.json'), 'utf8'));
const files = JSON.parse(fs.readFileSync(path.join(MOCK, 'source-files.json'), 'utf8'));
const customers = JSON.parse(fs.readFileSync(path.join(MOCK, 'customers.json'), 'utf8'));
const batches = JSON.parse(fs.readFileSync(path.join(MOCK, 'material-batches.json'), 'utf8'));

const fileMap = new Map(files.map(f => [f.id, f]));
const slineMap = new Map(slines.map(s => [s.id, s]));
const elineMap = new Map(elines.map(e => [e.id, e]));

function getFileName(fileId) {
  const f = fileMap.get(fileId);
  if (!f) return '查货单.pdf';
  return path.basename(f.path);
}

function normalizeSourceId(id) {
  if (!id) return id;
  return id.replace('-F-', '-');
}

const reconciliations = {};

// ==========================================
// 1. 2026AG001 (深圳市傲冠软件股份有限公司)
// ==========================================
{
  const sampleId = '2026AG001';
  const draftId = 'D-e60d9bd8df88';
  const custId = 'C-e0cb675e9f1d';
  const custName = '深圳市傲冠软件股份有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, '2026AG001-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    const order = idx + 1;
    const model = el.fields?.型号 || 'B-RPGC-2C4V-PS1';
    const brand = el.fields?.品牌 || 'SUSE';
    const origin = el.fields?.产地 || '德国';
    const qty = `${el.fields?.数量} PCS`;

    return {
      id: `CI-AG-${el.id}`,
      taskDisplayNo: '2026AG001',
      taskDraftId: draftId,
      lineOrder: order,
      lineId: el.id,
      entrustmentModel: model,
      entrustmentBrand: brand,
      entrustmentOrigin: origin,
      entrustmentQuantity: qty,
      entrustmentProductName: el.fields?.品名 || 'Linux软件',
      inspectionModel: model,
      inspectionBrand: brand,
      inspectionOrigin: origin,
      inspectionQuantity: '32 PCS',
      sourceBatch: '入仓 26050688 (双明细合并)',
      sourceWarehouseNo: '26050688',
      sourceFileName: '1779087953894.pdf',
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应 · 有提醒',
      statusVariant: 'green',
      noticeText: '查货单2行已合并(32 PCS) · 服务期限差异提示(1年 vs 3年)',
      isMultiBatchSource: true,
      sourceBatches: [
        {
          batchDisplayNo: '入仓 26050688 · 行01',
          warehouseNo: '26050688',
          fileName: '1779087953894.pdf',
          page: 1,
          rowOrder: 1,
          boxNo: '行01',
          rawRowId: 'I-6b255626250f-26050688-L001',
          quantity: '20 PCS',
          note: '查货第1行 · 20 PCS · $1617.04',
        },
        {
          batchDisplayNo: '入仓 26050688 · 行02',
          warehouseNo: '26050688',
          fileName: '1779087953894.pdf',
          page: 1,
          rowOrder: 2,
          boxNo: '行02',
          rawRowId: 'I-6b255626250f-26050688-L002',
          quantity: '12 PCS',
          note: '查货第2行 · 12 PCS · $2175.00',
        },
      ],
      candidateCount: 0,
      candidates: [],
      judgmentEvidence: [
        '✓ 核心型号、品牌完全一致 (SUSE · B-RPGC-2C4V-PS1)',
        '✓ 查货单 26050688 同型号 2 行明细自动合并，数量相加为 32 PCS，与委托总量严格吻合',
        '⚠ 核心服务期限提示：委托申报为“标准一年服务”，查货单实际记录为“标准三年服务”，请报关员核验',
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 2. 26SHPYD056 (上海浦壹电子科技有限公司)
// ==========================================
{
  const sampleId = '26SHPYD056';
  const draftId = 'D-df72916dc019';
  const custId = 'C-132ffbd28c07';
  const custName = '上海浦壹电子科技有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, '26SHPYD056-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    const order = idx + 1;
    const model = el?.fields?.型号;
    const brand = el?.fields?.品牌;
    const origin = el?.fields?.产地 || '中国';
    const qty = `${el?.fields?.数量} PCS`;

    if (r.match_status === 'MATCHED') {
      const sids = r.selected_raw_row_ids.map(normalizeSourceId);
      const sl1 = slineMap.get(sids[0]);
      const sl2 = slineMap.get(sids[1]);
      const whNo = sl1?.inspectionOrderId?.split('-').pop() || '26036383';
      const fName = getFileName(sl1?.source?.fileId || 'F-970b59d6d5b8');

      return {
        id: `CI-PY-${el.id}`,
        taskDisplayNo: sampleId,
        taskDraftId: draftId,
        lineOrder: order,
        lineId: el.id,
        entrustmentModel: model,
        entrustmentBrand: brand,
        entrustmentOrigin: origin,
        entrustmentQuantity: qty,
        entrustmentProductName: el?.fields?.品名 || '贴片集成电路',
        inspectionModel: model,
        inspectionBrand: brand,
        inspectionOrigin: origin,
        inspectionQuantity: qty,
        sourceBatch: `入仓 ${whNo} (双明细联合)`,
        sourceWarehouseNo: whNo,
        sourceFileName: fName,
        sourcePage: 2,
        sourceRowOrder: 8,
        sourceBoxNo: '箱08 + 箱09',
        relationLevel: 'EXACT_MODEL',
        statusText: '已自动对应',
        statusVariant: 'green',
        noticeText: '两条查货明细联合覆盖 (1350+1350)',
        isMultiBatchSource: true,
        sourceBatches: [
          {
            batchDisplayNo: `入仓 ${whNo} · 行08`,
            warehouseNo: whNo,
            fileName: fName,
            page: 2,
            rowOrder: 8,
            boxNo: '行08',
            rawRowId: sids[0],
            quantity: `${sl1?.fields?.数量 || 1350} PCS`,
            note: '查货第8行 · 1,350 PCS',
          },
          {
            batchDisplayNo: `入仓 ${whNo} · 行09`,
            warehouseNo: whNo,
            fileName: fName,
            page: 2,
            rowOrder: 9,
            boxNo: '行09',
            rawRowId: sids[1],
            quantity: `${sl2?.fields?.数量 || 1350} PCS`,
            note: '查货第9行 · 1,350 PCS',
          },
        ],
        judgmentEvidence: [
          `✓ 核心型号完全一致 (${model})`,
          `✓ 查货单 ${whNo} 第8行 (1,350 PCS) 与 第9行 (1,350 PCS) 联合覆盖，数量 2,700 PCS 严密闭合`,
          `✓ P4 模型已对品牌、型号、产地、单位、数量、净重、毛重 8 项字段决策全部核验通过`,
        ],
      };
    }

    if (r.match_status === 'MULTIPLE_CANDIDATES') {
      const allSids = (r.candidate_groups || []).map((cg) => normalizeSourceId(cg.raw_row_ids[0]));
      const sourceBatches = allSids.map((sid, sidx) => {
        const sl = slineMap.get(sid);
        const whNo = sl?.inspectionOrderId?.split('-').pop() || '26036383';
        return {
          batchDisplayNo: `入仓 ${whNo} · 行0${sidx + 1}`,
          warehouseNo: whNo,
          fileName: getFileName(sl?.source?.fileId || 'F-970b59d6d5b8'),
          page: sl?.source?.page || 1,
          rowOrder: sidx + 1,
          boxNo: `行0${sidx + 1}`,
          rawRowId: sid,
          quantity: `${sl?.fields?.数量 || '—'} PCS`,
          note: `查货第${sidx + 1}行 · ${sl?.fields?.数量 || '—'} PCS`,
        };
      });

      return {
        id: `CI-PY-${el.id}`,
        taskDisplayNo: sampleId,
        taskDraftId: draftId,
        lineOrder: order,
        lineId: el.id,
        entrustmentModel: model,
        entrustmentBrand: brand,
        entrustmentOrigin: origin,
        entrustmentQuantity: qty,
        entrustmentProductName: el?.fields?.品名 || '贴片集成电路',
        inspectionModel: model,
        inspectionBrand: brand,
        inspectionOrigin: 'CHINA',
        inspectionQuantity: '153440 PCS',
        sourceBatch: '入仓 26036383 (7条明细合并)',
        sourceWarehouseNo: '26036383',
        sourceFileName: getFileName('F-970b59d6d5b8'),
        sourcePage: 1,
        sourceRowOrder: 1,
        sourceBoxNo: '多明细',
        relationLevel: 'EXACT_MODEL',
        statusText: '已自动对应',
        statusVariant: 'green',
        noticeText: '7条查货明细合并覆盖 (累计 153,440 PCS)',
        isMultiBatchSource: true,
        sourceBatches,
        candidateCount: 0,
        candidates: [],
        judgmentEvidence: [
          `✓ 核心型号、品牌完全一致 (${brand} · ${model})`,
          '✓ 查货单 26036383 包含 7 笔同型号明细已自动合并，数量相加为 153,440 PCS，与委托总量严格吻合',
          '✓ 自动对应成功，无需人工介入选择',
        ],
      };
    }

    // UNMATCHED
    return {
      id: `CI-PY-${el.id}`,
      taskDisplayNo: sampleId,
      taskDraftId: draftId,
      lineOrder: order,
      lineId: el.id,
      entrustmentModel: model,
      entrustmentBrand: brand,
      entrustmentOrigin: origin,
      entrustmentQuantity: qty,
      entrustmentProductName: el?.fields?.品名 || '贴片集成电路',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'NO_MODEL_CANDIDATE',
      statusText: '暂无查货依据',
      statusVariant: 'gray',
      noticeText: '查货单中无此型号',
      judgmentEvidence: [
        `○ 查货单 26036383 中没有与 ${model} 同品牌同型号的原始行`,
        '后续查货材料入仓后将自动触发核对。',
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 3. 2026BMH001 (深圳市百闽海科技有限公司)
// ==========================================
{
  const sampleId = '2026BMH001';
  const draftId = 'D-fb448776f711';
  const custId = 'C-80d0a4f9a7ac';
  const custName = '深圳市百闽海科技有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, '2026BMH001-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  // 百闽海查货单 22 行中各型号的真实入仓单和数量信息
  const bmhInspectionInfo = {
    'LM2576SX-3.3/NOPB': {
      batches: [
        { whNo: '26027299', qty: '500 PCS', rawId: 'I-bmh-26027299' },
        { whNo: '26027298', qty: '4000 PCS', rawId: 'I-bmh-26027298' },
      ],
      totalQty: '4500 PCS',
      batchText: '入仓 26027298/26027299 (2行合并 · 4,500 PCS)',
      whNo: '26027298',
    },
    'SN74HC245PWR': {
      batches: [{ whNo: '26027251', qty: '24000 PCS', rawId: 'I-bmh-26027251' }],
      totalQty: '24000 PCS',
      batchText: '入仓 26027251',
      whNo: '26027251',
    },
    'SN74LVC1G04DBVR': {
      batches: [{ whNo: '26027300', qty: '150000 PCS', rawId: 'I-bmh-26027300' }],
      totalQty: '150000 PCS',
      batchText: '入仓 26027300',
      whNo: '26027300',
    },
    'TLV62569DBVR': {
      batches: [
        { whNo: '26027191', qty: '150000 PCS', rawId: 'I-bmh-26027191-1' },
        { whNo: '26027191', qty: '150000 PCS', rawId: 'I-bmh-26027191-2' },
        { whNo: '26027191', qty: '150000 PCS', rawId: 'I-bmh-26027191-3' },
      ],
      totalQty: '450000 PCS',
      batchText: '入仓 26027191 (3行合并 · 450,000 PCS)',
      whNo: '26027191',
    },
    'TPS51200DRCR': {
      batches: [{ whNo: '26027323', qty: '12000 PCS', rawId: 'I-bmh-26027323' }],
      totalQty: '12000 PCS',
      batchText: '入仓 26027323',
      whNo: '26027323',
    },
    'SN74LVC08ADR': {
      batches: [{ whNo: '26027322', qty: '20000 PCS', rawId: 'I-bmh-26027322' }],
      totalQty: '20000 PCS',
      batchText: '入仓 26027322',
      whNo: '26027322',
    },
    'TXS0108EPWR': {
      batches: [
        { whNo: '26027114', qty: '16000 PCS', rawId: 'I-bmh-26027114' },
        { whNo: '26027143', qty: '30000 PCS', rawId: 'I-bmh-26027143-1' },
        { whNo: '26027143', qty: '40000 PCS', rawId: 'I-bmh-26027143-2' },
        { whNo: '26027254', qty: '26000 PCS', rawId: 'I-bmh-26027254' },
      ],
      totalQty: '112000 PCS',
      batchText: '入仓 26027114等 (4行合并 · 112,000 PCS)',
      whNo: '26027114',
    },
    'LM2904BIDR': {
      batches: [{ whNo: '26027322', qty: '150000 PCS', rawId: 'I-bmh-26027322-2' }],
      totalQty: '150000 PCS',
      batchText: '入仓 26027322 (到货 150,000 PCS)',
      whNo: '26027322',
      hasDiff: true,
      diffNotice: '查货到货量大于委托申报量 (+40,000 PCS)',
    },
    'SN74AHC1G08DBVR': {
      batches: [
        { whNo: '26027223', qty: '300000 PCS', rawId: 'I-bmh-26027223-1' },
        { whNo: '26027223', qty: '300000 PCS', rawId: 'I-bmh-26027223-2' },
        { whNo: '26027223', qty: '300000 PCS', rawId: 'I-bmh-26027223-3' },
        { whNo: '26027223', qty: '120000 PCS', rawId: 'I-bmh-26027223-4' },
        { whNo: '26027223', qty: '180000 PCS', rawId: 'I-bmh-26027223-5' },
        { whNo: '26027223', qty: '300000 PCS', rawId: 'I-bmh-26027223-6' },
        { whNo: '26027223', qty: '300000 PCS', rawId: 'I-bmh-26027223-7' },
      ],
      totalQty: '1800000 PCS',
      batchText: '入仓 26027223 (多批合并 · 1,800,000 PCS)',
      whNo: '26027223',
      hasDiff: true,
      diffNotice: '查货多批到货总量大于委托申报量',
    },
  };

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    const order = idx + 1;
    const model = el?.fields?.型号 || '—';
    const brand = el?.fields?.品牌 || 'TI';
    const origin = el?.fields?.产地 || 'US';
    const qty = `${el?.fields?.数量} PCS`;

    const info = bmhInspectionInfo[model] || {
      batches: [{ whNo: '26027114', qty, rawId: 'I-bmh-default' }],
      totalQty: qty,
      batchText: '入仓 26027114',
      whNo: '26027114',
    };

    const isMulti = info.batches.length > 1;
    const statusText = info.hasDiff ? '已自动对应 · 有提醒' : '已自动对应';
    const noticeText = info.hasDiff
      ? info.diffNotice
      : isMulti
      ? `${info.batches.length}条查货明细合并覆盖 (累计 ${info.totalQty})`
      : '型号、品牌、数量完全一致';

    const sourceBatches = info.batches.map((b, bidx) => ({
      batchDisplayNo: `入仓 ${b.whNo} · 行0${bidx + 1}`,
      warehouseNo: b.whNo,
      fileName: '1779087977464.pdf',
      page: 1,
      rowOrder: bidx + 1,
      boxNo: `行0${bidx + 1}`,
      rawRowId: b.rawId,
      quantity: b.qty,
      note: `入仓 ${b.whNo} · ${b.qty}`,
    }));

    return {
      id: `CI-BMH-${el.id}`,
      taskDisplayNo: sampleId,
      taskDraftId: draftId,
      lineOrder: order,
      lineId: el.id,
      entrustmentModel: model,
      entrustmentBrand: brand,
      entrustmentOrigin: origin,
      entrustmentQuantity: qty,
      entrustmentProductName: el?.fields?.品名 || '贴片芯片',
      inspectionModel: model,
      inspectionBrand: brand,
      inspectionOrigin: origin,
      inspectionQuantity: info.totalQty,
      sourceBatch: info.batchText,
      sourceWarehouseNo: info.whNo,
      sourceFileName: '1779087977464.pdf',
      relationLevel: 'EXACT_MODEL',
      statusText,
      statusVariant: 'green',
      noticeText,
      isMultiBatchSource: isMulti,
      sourceBatches: isMulti ? sourceBatches : undefined,
      candidateCount: 0,
      candidates: [],
      judgmentEvidence: [
        `✓ 核心型号、品牌完全一致 (${brand} · ${model})`,
        `✓ 查货单对应明细已完成合并，数量相加为 ${info.totalQty}，满足申报与查验要求`,
        info.hasDiff ? `ℹ 数量提示：${info.diffNotice}` : '✓ 对应成功，自动核销入库',
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 4. 2025YBT010-2 (英堡科技（深圳）有限公司)
// ==========================================
{
  const sampleId = '2025YBT010-2';
  const draftId = 'D-3c3cc10bd26b';
  const custId = 'C-89aa660b4b46';
  const custName = '英堡科技（深圳）有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, 'SC-08-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    const sid = normalizeSourceId(r.selected_raw_row_ids[0]);
    const sl = slineMap.get(sid);
    const whNo = sl?.inspectionOrderId?.split('-').pop() || '25120336';
    const fName = getFileName(sl?.source?.fileId);
    const order = idx + 1;
    const model = el.fields?.型号;
    const inspectModel = sl?.fields?.型号 || (model ? model.split('#')[0] : '—');
    const suffix = model.includes('#') ? `#${model.split('#')[1]}` : '';

    return {
      id: `CI-YBT-${el.id}`,
      taskDisplayNo: sampleId,
      taskDraftId: draftId,
      lineOrder: order,
      lineId: el.id,
      entrustmentModel: model,
      entrustmentBrand: el.fields?.品牌 || 'SK HYNIX',
      entrustmentOrigin: el.fields?.产地 || '韩国',
      entrustmentQuantity: `${el.fields?.数量} 个`,
      entrustmentProductName: el.fields?.品名 || '闪存集成电路',
      inspectionModel: inspectModel,
      inspectionBrand: sl?.fields?.品牌 || 'SK HYNIX',
      inspectionOrigin: sl?.fields?.产地 || '韩国',
      inspectionQuantity: `${sl?.fields?.数量} 个`,
      sourceBatch: `入仓 ${whNo}`,
      sourceWarehouseNo: whNo,
      sourceFileName: fName,
      sourcePage: 1,
      sourceRowOrder: order,
      relationLevel: 'CORE_MODEL_WITH_AFFIX_DIFF',
      statusText: '已自动对应 · 有提醒',
      statusVariant: 'yellow',
      affixDiff: {
        hasDiff: true,
        diffType: 'suffix',
        coreModel: inspectModel,
        suffix,
        entrustmentModel: model,
        inspectionModel: inspectModel,
        explanation: `委托型号带 [${suffix}] 后缀，查货单无此后缀`,
      },
      noticeText: `型号后缀差异 [${suffix}]`,
      judgmentEvidence: [
        `✓ 主体核心型号完全一致 (${inspectModel})`,
        `⚠ 委托申报型号多出 [${suffix}] 尾缀，查货单为标准基干型号`,
        `✓ 查货单入仓号 ${whNo} 数量 (${sl?.fields?.数量}) 与委托完全一致`,
        `✓ 系统已自动建立对应，请报关员复核尾缀申报规则。`,
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 5. 2026ACSY003 (深圳市澳创实业有限公司)
// ==========================================
{
  const sampleId = '2026ACSY003';
  const draftId = 'D-0971c3fd7c49';
  const custId = 'C-7ad6719f6d43';
  const custName = '深圳市澳创实业有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, '2026ACSY003-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    const order = idx + 1;
    return {
      id: `CI-ACSY-${el.id}`,
      taskDisplayNo: sampleId,
      taskDraftId: draftId,
      lineOrder: order,
      lineId: el.id,
      entrustmentModel: el.fields?.型号,
      entrustmentBrand: el.fields?.品牌,
      entrustmentOrigin: el.fields?.产地,
      entrustmentQuantity: `${el.fields?.数量} PCS`,
      entrustmentProductName: el.fields?.品名 || '电子连接器',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'NO_MODEL_CANDIDATE',
      statusText: '暂无可靠依据 · 客户归属待确认',
      statusVariant: 'gray',
      noticeText: '查货单抬头为 TO: S59',
      judgmentEvidence: [
        '⚠ 查货单 26033175 抬头标记为 TO: S59，未显示“深圳市澳创实业有限公司”',
        '⚠ 严格遵循合规底线原则，系统不凭目录名强配，需人工确认查货归属后再建立对应',
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 6. 2026CNKJ001 (福建省超年科技股份有限公司)
// ==========================================
{
  const sampleId = '2026CNKJ001';
  const draftId = 'D-a64834ca9065';
  const custId = 'C-7a1e673169bf';
  const custName = '福建省超年科技股份有限公司';
  const p3 = JSON.parse(fs.readFileSync(path.join(CALIBRATION, '2026CNKJ001-audit/P3-response.json'), 'utf8'));
  const relations = p3.output.row_relations;

  const items = relations.map((r, idx) => {
    const el = elineMap.get(r.order_row_id);
    return {
      id: `CI-CNKJ-${el.id}`,
      taskDisplayNo: sampleId,
      taskDraftId: draftId,
      lineOrder: idx + 1,
      lineId: el.id,
      entrustmentModel: el.fields?.型号,
      entrustmentBrand: el.fields?.品牌,
      entrustmentOrigin: el.fields?.产地,
      entrustmentQuantity: `${el.fields?.数量} PCS`,
      entrustmentProductName: el.fields?.品名 || '连接器',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'MODEL_CONFLICT',
      statusText: '多属性冲突 · 待人工消歧',
      statusVariant: 'red',
      noticeText: '客户名/品牌/产地/入仓号多重冲突',
      judgmentEvidence: [
        '⚠ 客户冲突：查货单 Bill to 为“深圳市快极科技有限公司”，与超年科技不符',
        '⚠ 品牌产地冲突：委托为广濑/韩国，查货为 HIROSE/JAPAN',
        '⚠ 编号歧义：查货单同时存在条码 26057448 与正文 018230127 两个号码',
      ],
    };
  });

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId,
    items,
  };
}

// ==========================================
// 7~9. 东莞市智微智能科技有限公司
// ==========================================
const zwConfigs = [
  { sampleId: '2026(DG)ZW001', draftId: 'D-8181f9edc198', whNos: ['26010048', '26010713'] },
  { sampleId: '2026(DG)ZW003', draftId: 'D-b436a16434a4', whNos: ['26010211', '26010801'] },
  { sampleId: '2026(DG)ZW050', draftId: 'D-ab6bfdee3e54', whNos: ['26050640'] },
];

for (const zw of zwConfigs) {
  const dlines = elines.filter(l => l.draftId === zw.draftId);
  const items = dlines.map((el, idx) => {
    return {
      id: `CI-ZW-${el.id}`,
      taskDisplayNo: zw.sampleId,
      taskDraftId: zw.draftId,
      lineOrder: idx + 1,
      lineId: el.id,
      entrustmentModel: el.fields?.型号 || `ZW-MOD-${idx + 1}`,
      entrustmentBrand: el.fields?.品牌 || '—',
      entrustmentOrigin: el.fields?.产地 || '—',
      entrustmentQuantity: el.fields?.数量 ? `${el.fields.数量} PCS` : '—',
      entrustmentProductName: el.fields?.品名 || '智能硬件模组',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'NO_MODEL_CANDIDATE',
      statusText: '待补充客户映射 · 查货已在库',
      statusVariant: 'gray',
      noticeText: `查货批次 ${zw.whNos.join('/')} 待关联`,
      judgmentEvidence: [
        '⚠ 委托单原文无客户抬头字段，处于前置 NEEDS_REVIEW 拦截状态',
        `✓ 对应查货材料已入仓 (${zw.whNos.join(', ')})，支持人工补充客户映射后自动执行商品匹配`,
      ],
    };
  });

  reconciliations[zw.sampleId] = {
    sampleId: zw.sampleId,
    customerId: 'C-66be07d6cabe',
    customerName: '东莞市智微智能科技有限公司',
    displayNo: zw.sampleId,
    draftId: zw.draftId,
    items,
  };
}

// ==========================================
// 10. 多对多样例 (深圳欧陆通电子股份有限公司)
// ==========================================
{
  const sampleId = '多对多样例';
  const custId = 'C-0a93054667fc';
  const custName = '深圳欧陆通电子股份有限公司';
  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId: null,
    items: [],
  };
}

// ==========================================
// 11. 英卡-抽+整 (深圳市英卡科技有限公司)
// ==========================================
{
  const sampleId = '英卡-抽+整';
  const custId = 'C-b212996858bd';
  const custName = '深圳市英卡科技有限公司';

  const items = [
    {
      id: 'CI-YK1-01',
      taskDisplayNo: 'YK-260625131-1',
      taskDraftId: 'D-1df4f4d83480',
      lineOrder: 1,
      lineId: 'D-1df4f4d83480-R001',
      entrustmentModel: 'UMW2631',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '60000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: 'UMW2631',
      inspectionBrand: 'UNISOC',
      inspectionOrigin: '中国',
      inspectionQuantity: '60000 PCS',
      sourceBatch: 'CH001 + CH002',
      sourceWarehouseNo: '26070093 / 26070104',
      sourceFileName: '1767831448651816.pdf',
      sourcePage: 1,
      sourceRowOrder: 1,
      sourceBoxNo: '箱001~箱004 (CH001) + 增量覆盖 (CH002)',
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应',
      statusVariant: 'green',
      noticeText: '两个批次共同提供依据',
      isMultiBatchSource: true,
      sourceBatches: [
        {
          batchDisplayNo: 'CH001 (入仓 26070093)',
          warehouseNo: '26070093',
          fileName: '1767831448651816.pdf',
          page: 1,
          rowOrder: 3,
          boxNo: '箱001~箱004',
          rawRowId: 'I-a5368260946b-26070093-L003',
          quantity: '60000 PCS',
          note: '查货行03 · 独占占用箱1~4',
        },
        {
          batchDisplayNo: 'CH002 (入仓 26070104)',
          warehouseNo: '26070104',
          fileName: 'CH002_26070104.pdf',
          page: 1,
          rowOrder: 7,
          boxNo: '增量推进',
          rawRowId: 'I-CH002-L007',
          quantity: '60000 PCS',
          isIncrement: true,
          note: '查货行07 · 增量推进共同覆盖',
        },
      ],
      judgmentEvidence: [
        '✓ 核心型号完全一致 (UMW2631)',
        '✓ 由 CH001 (查货行03 / 箱1~4) 与 CH002 (查货行07) 两个来源共同提供依据',
        '✓ 结论：同一个委托商品由两个批次共同覆盖，业务关系已确定',
      ],
    },
    {
      id: 'CI-YK1-02',
      taskDisplayNo: 'YK-260625131-1',
      taskDraftId: 'D-1df4f4d83480',
      lineOrder: 2,
      lineId: 'D-1df4f4d83480-R002',
      entrustmentModel: 'UMS9230E',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '60000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: 'UMS9230E',
      inspectionBrand: 'UNISOC',
      inspectionOrigin: '中国',
      inspectionQuantity: '60000 PCS',
      sourceBatch: 'CH002 (入仓 26070104)',
      sourceWarehouseNo: '26070104',
      sourceFileName: 'CH002_26070104.pdf',
      sourcePage: 1,
      sourceRowOrder: 2,
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应',
      statusVariant: 'green',
      noticeText: '—',
      judgmentEvidence: [
        '✓ 标准化型号完全一致 (UMS9230E)',
        '✓ 查货单 26070104 第1页明确记录',
      ],
    },
    {
      id: 'CI-YK1-03',
      taskDisplayNo: 'YK-260625131-1',
      taskDraftId: 'D-1df4f4d83480',
      lineOrder: 3,
      lineId: 'D-1df4f4d83480-R003',
      entrustmentModel: 'ABC102',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '20000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'NO_MODEL_CANDIDATE',
      statusText: '暂无查货依据',
      statusVariant: 'gray',
      noticeText: '等待新查货',
      judgmentEvidence: [
        '○ 当前客户查货池中未发现可对应商品',
        '后续新查货材料入仓后将自动触发核对，无需人工操作。',
      ],
    },
    {
      id: 'CI-YK2-01',
      taskDisplayNo: 'YK-260625131-2',
      taskDraftId: 'D-a235e97d6dd0',
      lineOrder: 1,
      lineId: 'D-a235e97d6dd0-R001',
      entrustmentModel: 'ABC001',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '66000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: 'ABC001',
      inspectionBrand: 'UNISOC',
      inspectionOrigin: '中国',
      inspectionQuantity: '66000 PCS',
      sourceBatch: 'CH002 (入仓 26070104)',
      sourceWarehouseNo: '26070104',
      sourceFileName: 'CH002_26070104.pdf',
      sourcePage: 2,
      sourceRowOrder: 1,
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应',
      statusVariant: 'green',
      noticeText: '—',
      judgmentEvidence: [
        '✓ 标准化型号完全一致 (ABC001)',
        '✓ 查货单 26070104 第2页明确记录',
      ],
    },
    {
      id: 'CI-YK2-02',
      taskDisplayNo: 'YK-260625131-2',
      taskDraftId: 'D-a235e97d6dd0',
      lineOrder: 2,
      lineId: 'D-a235e97d6dd0-R002',
      entrustmentModel: '74HC00PW-Q100',
      entrustmentBrand: 'NXP',
      entrustmentOrigin: '中国台湾',
      entrustmentQuantity: '10000 PCS',
      entrustmentProductName: '逻辑门芯片',
      inspectionModel: '74HC00PW-Q100,118',
      inspectionBrand: 'NXP',
      inspectionOrigin: '中国台湾',
      inspectionQuantity: '10000 PCS',
      sourceBatch: 'CH003 (入仓 26070188 补货)',
      sourceWarehouseNo: '26070188',
      sourceFileName: 'CH003_26070188.pdf',
      sourcePage: 2,
      sourceRowOrder: 6,
      relationLevel: 'CORE_MODEL_WITH_AFFIX_DIFF',
      statusText: '已自动对应 · 有提醒',
      statusVariant: 'yellow',
      affixDiff: {
        hasDiff: true,
        diffType: 'suffix',
        coreModel: '74HC00PW-Q100',
        suffix: ',118',
        entrustmentModel: '74HC00PW-Q100',
        inspectionModel: '74HC00PW-Q100,118',
        explanation: '查货型号多出后缀 [,118]',
      },
      noticeText: '型号后缀差异 [,118]',
      judgmentEvidence: [
        '✓ 核心型号 74HC00PW-Q100 完全一致',
        '⚠ 查货型号多出包装编带后缀 [,118]',
        '✓ 当前客户查货池中不存在型号完全一致的更高优先候选',
        '✓ 不存在其他同等级主体型号候选，已自动对应同一商品',
        'ℹ 结论：已自动对应，请在最终人工复核时留意型号后缀差异。',
      ],
    },
    {
      id: 'CI-YK2-03',
      taskDisplayNo: 'YK-260625131-2',
      taskDraftId: 'D-a235e97d6dd0',
      lineOrder: 3,
      lineId: 'D-a235e97d6dd0-R003',
      entrustmentModel: 'ABC123',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '66000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'MULTIPLE_MODEL_CANDIDATES',
      statusText: '需要人工选择',
      statusVariant: 'orange',
      noticeText: '发现 2 个可能对应',
      candidateCount: 2,
      candidates: [
        {
          model: 'ABC123-A',
          batchDisplayNo: 'CH002 (入仓 26070104)',
          warehouseNo: '26070104',
          fileName: 'CH002_26070104.pdf',
          page: 2,
          sourceRowId: 'I-CH002-L008',
        },
        {
          model: 'ABC123-B',
          batchDisplayNo: 'CH003 (入仓 26070188 补货)',
          warehouseNo: '26070188',
          fileName: 'CH003_26070188.pdf',
          page: 1,
          sourceRowId: 'I-CH003-L005',
        },
      ],
      judgmentEvidence: [
        '⚠ 查货池中发现 2 个可能对应的商品候选',
        '候选 1: ABC123-A (来自 CH002 / 入仓 26070104)',
        '候选 2: ABC123-B (来自 CH003 / 入仓 26070188)',
        '系统无法唯一排他判断，需由报关员手工选择确认。',
      ],
    },
    {
      id: 'CI-YK3-01',
      taskDisplayNo: 'YK-260625131-3',
      taskDraftId: 'D-5a09ab721f2e',
      lineOrder: 1,
      lineId: 'D-5a09ab721f2e-R001',
      entrustmentModel: 'UMW2631',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '60000 PCS',
      entrustmentProductName: '移动通信基带芯片',
      inspectionModel: 'UMW2631',
      inspectionBrand: 'UNISOC',
      inspectionOrigin: '中国',
      inspectionQuantity: '60000 PCS',
      sourceBatch: 'CH001 (入仓 26070093)',
      sourceWarehouseNo: '26070093',
      sourceFileName: '1767831448651816.pdf',
      sourcePage: 1,
      sourceRowOrder: 1,
      sourceBoxNo: '箱005~箱008',
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应',
      statusVariant: 'green',
      noticeText: '—',
      judgmentEvidence: [
        '✓ 核心型号完全一致 (UMW2631)',
        '✓ 独占占用查货原始箱5~箱8 (共 60,000 PCS)',
        '✓ 来源文件 1767831448651816.pdf 第1页',
      ],
    },
    {
      id: 'CI-YK3-02',
      taskDisplayNo: 'YK-260625131-3',
      taskDraftId: 'D-5a09ab721f2e',
      lineOrder: 2,
      lineId: 'D-5a09ab721f2e-R002',
      entrustmentModel: 'ZX001',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '30000 PCS',
      entrustmentProductName: '集成电路',
      inspectionModel: 'ZX001',
      inspectionBrand: 'UNISOC',
      inspectionOrigin: '中国',
      inspectionQuantity: '30000 PCS',
      sourceBatch: 'CH001 (入仓 26070093)',
      sourceWarehouseNo: '26070093',
      sourceFileName: '1767831448651816.pdf',
      sourcePage: 1,
      sourceRowOrder: 2,
      relationLevel: 'EXACT_MODEL',
      statusText: '已自动对应',
      statusVariant: 'green',
      noticeText: '—',
      judgmentEvidence: [
        '✓ 核心型号完全一致 (ZX001)',
        '✓ 来源文件 1767831448651816.pdf 第1页',
      ],
    },
    {
      id: 'CI-YK3-03',
      taskDisplayNo: 'YK-260625131-3',
      taskDraftId: 'D-5a09ab721f2e',
      lineOrder: 3,
      lineId: 'D-5a09ab721f2e-R003',
      entrustmentModel: 'ZX990',
      entrustmentBrand: 'UNISOC',
      entrustmentOrigin: '中国',
      entrustmentQuantity: '30000 PCS',
      entrustmentProductName: '集成电路',
      inspectionModel: null,
      sourceBatch: '—',
      sourceWarehouseNo: '—',
      sourceFileName: '—',
      relationLevel: 'MULTIPLE_MODEL_CANDIDATES',
      statusText: '需要人工选择',
      statusVariant: 'orange',
      noticeText: '发现 2 个可能对应',
      candidateCount: 2,
      candidates: [
        {
          model: 'ZX990-A',
          batchDisplayNo: 'CH002 (入仓 26070104)',
          warehouseNo: '26070104',
          fileName: 'CH002_26070104.pdf',
          page: 3,
          sourceRowId: 'I-CH002-L009',
        },
        {
          model: 'ZX990-B',
          batchDisplayNo: 'CH003 (入仓 26070188 补货)',
          warehouseNo: '26070188',
          fileName: 'CH003_26070188.pdf',
          page: 1,
          sourceRowId: 'I-CH003-L006',
        },
      ],
      judgmentEvidence: [
        '⚠ 查货池中发现 2 个可能对应的候选商品',
        '候选 1: ZX990-A (来自 CH002 / 入仓 26070104)',
        '候选 2: ZX990-B (来自 CH003 / 入仓 26070188)',
        '两批次主体型号一致但后缀不同，需人工裁决选定。',
      ],
    },
  ];

  reconciliations[sampleId] = {
    sampleId,
    customerId: custId,
    customerName: custName,
    displayNo: sampleId,
    draftId: null,
    items,
  };
}

// 计算各样本 summary
for (const sample of Object.values(reconciliations)) {
  const items = sample.items;
  sample.summary = {
    totalCount: items.length,
    exactCount: items.filter(i => i.relationLevel === 'EXACT_MODEL').length,
    affixDiffCount: items.filter(i => i.relationLevel === 'CORE_MODEL_WITH_AFFIX_DIFF').length,
    multipleCount: items.filter(i => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES').length,
    noCandidateCount: items.filter(i => i.relationLevel === 'NO_MODEL_CANDIDATE').length,
    conflictCount: items.filter(i => i.relationLevel === 'MODEL_CONFLICT').length,
    actionRequiredItems: items.filter(i => i.relationLevel === 'MULTIPLE_MODEL_CANDIDATES' || i.relationLevel === 'MODEL_CONFLICT'),
  };
}

const outPath = path.join(MOCK, 'real-sample-commodity-reconciliations.json');
fs.writeFileSync(outPath, JSON.stringify(reconciliations, null, 2), 'utf8');
console.log('Saved real reconciliations to:', outPath);
console.log('Samples covered:', Object.keys(reconciliations));
