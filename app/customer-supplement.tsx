'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building,
  FileText,
  Sparkles,
  AlertTriangle,
  Layers,
  Database,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useDemoStore } from '@/lib/demo-store';

interface CustomerSupplementProps {
  onBack: () => void;
  onNavigateOverview: () => void;
}

const ZW_TASKS_CONFIG = [
  {
    draftId: 'D-8181f9edc198',
    displayNo: '2026(DG)ZW001',
    sampleId: '2026(DG)ZW001',
    title: '智微智能导单委托 001',
    linesCount: 6,
    entrustmentFile: '智微智能导单文件-1767600043104.xlsx',
    inspectionFiles: ['1767583198125.pdf', '1767597461096.pdf'],
    warehouseNos: ['26010048', '26010713'],
    sampleModels: [
      { rowNo: 1, model: 'ASM1543', brand: 'ASMEDIA', quantity: '6500 PCS', origin: '中国台湾' },
      { rowNo: 2, model: 'ASM2480B', brand: 'ASMEDIA', quantity: '3500 PCS', origin: '中国台湾' },
      { rowNo: 3, model: 'ASM1562', brand: 'ASMEDIA', quantity: '6500 PCS', origin: '中国台湾' },
      { rowNo: 4, model: 'ASM1164', brand: 'ASMEDIA', quantity: '7000 PCS', origin: '中国台湾' },
      { rowNo: 5, model: 'UP9505UQGW', brand: 'UPI', quantity: '2500 PCS', origin: '中国台湾' },
      { rowNo: 6, model: 'UP7501M8', brand: 'UPI', quantity: '3000 PCS', origin: '中国台湾' },
    ],
  },
  {
    draftId: 'D-b436a16434a4',
    displayNo: '2026(DG)ZW003',
    sampleId: '2026(DG)ZW003',
    title: '智微智能导单委托 003',
    linesCount: 5,
    entrustmentFile: '智微智能导单文件-1767930508809.xlsx',
    inspectionFiles: ['1767836836913.pdf', '1767866131153.pdf'],
    warehouseNos: ['26010211', '26010801'],
    sampleModels: [
      { rowNo: 1, model: 'ALC897-VA2-CG', brand: 'REALTEK', quantity: '35000 PCS', origin: '中国' },
      { rowNo: 2, model: 'RTS5411S-GR', brand: 'REALTEK', quantity: '2600 PCS', origin: '中国台湾' },
      { rowNo: 3, model: 'CS5511AN', brand: 'ASL', quantity: '1680 PCS', origin: '中国台湾' },
      { rowNo: 4, model: 'CS5511AN', brand: 'ASL', quantity: '5040 PCS', origin: '中国台湾' },
      { rowNo: 5, model: 'CS5512AN', brand: 'ASL', quantity: '3360 PCS', origin: '中国台湾' },
    ],
  },
  {
    draftId: 'D-ab6bfdee3e54',
    displayNo: '2026(DG)ZW050',
    sampleId: '2026(DG)ZW050',
    title: '智微智能导单委托 050',
    linesCount: 1,
    entrustmentFile: '东莞智微智能导单文件-1778663696109.xlsx',
    inspectionFiles: ['1778638120450.pdf'],
    warehouseNos: ['26050640'],
    sampleModels: [
      { rowNo: 1, model: 'RTL8111H-CG', brand: 'REALTEK', quantity: '2500 PCS', origin: '中国台湾' },
    ],
  },
];

export function CustomerSupplementPage({ onBack, onNavigateOverview }: CustomerSupplementProps) {
  const store = useDemoStore();
  const targetDraftId = store.targetCustomerSupplementDraftId || store.selectedDraftId;

  // 找到当前选中的任务
  const initialTaskIndex = ZW_TASKS_CONFIG.findIndex((t) => t.draftId === targetDraftId);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(initialTaskIndex >= 0 ? initialTaskIndex : 0);

  const activeTask = ZW_TASKS_CONFIG[selectedTaskIndex] || ZW_TASKS_CONFIG[0];
  const realDraft = store.drafts.find((d) => d.id === activeTask.draftId) || store.drafts.find((d) => d.displayNo === activeTask.displayNo);

  // 选中的目标客户 ID，默认推荐 东莞市智微智能科技有限公司
  const [selectedCustomerId, setSelectedCustomerId] = useState('C-66be07d6cabe');
  // 批量应用至全部 3 个任务
  const [applyBatch, setApplyBatch] = useState(true);

  // 流水线执行状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<number>(0); // 0: 未开始, 1: P1, 2: P2, 3: P3, 4: P4, 5: 完成
  const [isCompleted, setIsCompleted] = useState(false);

  // 检查是否已经补充过
  const isAlreadyResolved = realDraft && realDraft.customerId && realDraft.customerId !== 'UNKNOWN' && realDraft.customerStatus !== '待补客户信息';

  const handleStartPipeline = () => {
    setIsProcessing(true);
    setPipelineStep(1);

    // 动态模拟四阶段提示词依次执行
    setTimeout(() => {
      setPipelineStep(2);
      setTimeout(() => {
        setPipelineStep(3);
        setTimeout(() => {
          setPipelineStep(4);
          setTimeout(() => {
            // 正式向 store 提交补充客户与全自动匹配
            const draftIdsToUpdate = applyBatch
              ? ZW_TASKS_CONFIG.map((t) => t.draftId)
              : [activeTask.draftId];

            store.supplementCustomerForTasks({
              draftIds: draftIdsToUpdate,
              customerId: selectedCustomerId,
            });

            setPipelineStep(5);
            setIsCompleted(true);
            setIsProcessing(false);
          }, 700);
        }, 800);
      }, 750);
    }, 700);
  };

  return (
    <div className="cw-supplement-page">
      {/* 顶部面包屑与导航操作条 */}
      <div className="cw-supplement-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="topbar-back-btn"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={16} />
            <span>返回工作台</span>
          </button>
          <div className="cw-supplement-title-area">
            <div className="cw-supplement-breadcrumb">
              <span>工作区</span> / <span>客户工作台</span> / <strong>人工补充客户信息</strong>
            </div>
            <h2>人工补充委托客户信息</h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cw-status orange" style={{ fontSize: 13, padding: '4px 10px' }}>
            ⚠ 前置阻断 · 待人工指认客户
          </span>
        </div>
      </div>

      {/* 待补充客户的三票任务快速切换栏 */}
      <div className="cw-supplement-task-tabs">
        <div style={{ fontSize: 13.5, color: '#475569', fontWeight: 600, marginRight: 8 }}>
          待补充客户任务 ({ZW_TASKS_CONFIG.length})：
        </div>
        {ZW_TASKS_CONFIG.map((task, idx) => {
          const isSelected = idx === selectedTaskIndex;
          const draftState = store.drafts.find((d) => d.id === task.draftId || d.displayNo === task.displayNo);
          const isResolved = draftState && draftState.customerId && draftState.customerId !== 'UNKNOWN' && draftState.customerStatus !== '待补客户信息';

          return (
            <button
              key={task.draftId}
              type="button"
              className={`cw-task-tab-btn ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedTaskIndex(idx)}
              disabled={isProcessing}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>{task.displayNo}</strong>
                {isResolved ? (
                  <span className="cw-badge-small green">已补充</span>
                ) : (
                  <span className="cw-badge-small orange">需补充</span>
                )}
              </div>
              <small>{task.linesCount} 行委托商品 · 查货在库</small>
            </button>
          );
        })}
      </div>

      {/* 主体两栏布局：左侧委托分析与前置阻断原因，右侧查货材料线索与客户补充确认 */}
      <div className="cw-supplement-grid">
        {/* 左侧：委托侧材料与 P1 阻断原因 */}
        <section className="cw-supplement-card">
          <div className="cw-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} className="icon-blue" />
              <h3>委托侧材料识别（P1 模型解析）</h3>
            </div>
            <span className="cw-tag-code">P1 · 委托解析</span>
          </div>

          <div className="cw-supplement-alert-box">
            <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>前置拦截原因 (NEEDS_REVIEW)：</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
                主体委托材料（{activeTask.entrustmentFile}）原文无左上角委托方或公司抬头字段，AI 无法在委托材料中直接提取客户名。
                根据报关单证合规契约，系统已前置阻断商品跨客户强配；必须由人工指认客户后，才能激活草稿流水线进入查货匹配。
              </p>
            </div>
          </div>

          <div className="cw-file-info-row">
            <div className="cw-file-item">
              <FileText size={15} style={{ color: '#059669' }} />
              <div>
                <strong>{activeTask.entrustmentFile}</strong>
                <small>主委托材料 · XLSX 电子表格 · 状态：等待客户绑定</small>
              </div>
            </div>
          </div>

          <div className="cw-items-table-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13.5, color: '#1e293b' }}>
                P1 提取的委托待核对商品 ({activeTask.sampleModels.length} 行)
              </strong>
              <small style={{ color: '#64748b' }}>结构完整保留，未做跨行合并</small>
            </div>
            <table className="cw-mini-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>序号</th>
                  <th>商品型号</th>
                  <th>品牌</th>
                  <th>数量</th>
                  <th>产地</th>
                </tr>
              </thead>
              <tbody>
                {activeTask.sampleModels.map((row) => (
                  <tr key={row.rowNo}>
                    <td>第 {row.rowNo} 行</td>
                    <td>
                      <strong style={{ color: '#0f766e' }}>{row.model}</strong>
                    </td>
                    <td>{row.brand}</td>
                    <td>{row.quantity}</td>
                    <td>{row.origin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 右侧：查货侧材料线索与客户补充确认 */}
        <section className="cw-supplement-card">
          <div className="cw-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={18} className="icon-green" />
              <h3>查货材料线索与客户匹配推荐</h3>
            </div>
            <span className="cw-status green">仓储材料已就绪</span>
          </div>

          {/* AI 推荐线索 */}
          <div className="cw-clue-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Sparkles size={17} style={{ color: '#047857' }} />
              <strong style={{ fontSize: 14.5, color: '#065f46' }}>
                AI 检测到关联仓储查货线索
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#047857', lineHeight: 1.5 }}>
              在仓储查货库中，对应入仓单号（<b>{activeTask.warehouseNos.join('、')}</b>）的查货材料（{activeTask.inspectionFiles.join('、')}）已提前入库，
              材料抬头 Bill To / 收货方明确标注为：<b>【东莞市智微智能科技有限公司】</b>，且货物型号与本委托商品高度吻合。
            </p>
          </div>

          {/* 客户选择区 */}
          <div className="cw-customer-select-section">
            <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
              选择或确认正式所属客户：
            </label>

            {/* 推荐客户卡片 */}
            <div
              className={`cw-recommended-customer-card ${selectedCustomerId === 'C-66be07d6cabe' ? 'selected' : ''}`}
              onClick={() => setSelectedCustomerId('C-66be07d6cabe')}
              role="button"
              tabIndex={0}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Building size={20} style={{ color: '#059669' }} />
                  <div>
                    <strong style={{ fontSize: 15, color: '#0f172a' }}>
                      东莞市智微智能科技有限公司
                    </strong>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                      客户代码：C-66be07d6cabe · 查货提单/箱单一致
                    </div>
                  </div>
                </div>
                <span className="cw-badge-small green">AI 强烈推荐 (99.8%)</span>
              </div>
            </div>

            {/* 下拉选单：选择其他客户 */}
            <div style={{ marginTop: 10 }}>
              <small style={{ color: '#64748b', display: 'block', marginBottom: 4 }}>
                如需更改为其他客户，可在此选择：
              </small>
              <select
                aria-label="选择客户"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13.5,
                }}
              >
                {store.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            {/* 批量应用复选框 */}
            <div className="cw-checkbox-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={applyBatch}
                  onChange={(e) => setApplyBatch(e.target.checked)}
                  disabled={isProcessing}
                />
                <span style={{ fontSize: 13.5, color: '#1e293b' }}>
                  <strong>同步批量应用至同批次智微智能委托</strong>（全部 3 票：2026(DG)ZW001、ZW003、ZW050）
                </span>
              </label>
            </div>

            {/* 主操作按钮 */}
            {!isCompleted && (
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="primary cw-btn-submit-supplement"
                  onClick={handleStartPipeline}
                  disabled={isProcessing || !selectedCustomerId}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>正在执行 AI 四个提示词全流程流水线...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>确认补充客户并启动 AI 流水线</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 四个提示词处理过程展示区（实时动态 / 完成后的全流程回溯） */}
      {(isProcessing || isCompleted || isAlreadyResolved) && (
        <section className="cw-pipeline-showcase-section">
          <div className="cw-pipeline-showcase-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Layers size={20} style={{ color: '#0f766e' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>
                AI 四个提示词处理流水线执行过程（P1 → P2 → P3 → P4）
              </h3>
            </div>
            {isCompleted ? (
              <span className="cw-status green">
                <CheckCircle2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                全流程四阶段核对贯通完成
              </span>
            ) : (
              <span className="cw-status blue">
                流水线执行中（阶段 {pipelineStep} / 4）
              </span>
            )}
          </div>

          <div className="cw-pipeline-steps-grid">
            {/* 提示词 1: P1 委托材料解析与草稿生成 */}
            <div className={`cw-pipeline-step-card ${pipelineStep >= 1 ? 'active' : ''} ${pipelineStep > 1 || isCompleted || isAlreadyResolved ? 'done' : ''}`}>
              <div className="cw-step-header">
                <div className="cw-step-num">P1</div>
                <div>
                  <strong>委托材料解析生成草稿</strong>
                  <small>P1_order_draft</small>
                </div>
                {pipelineStep > 1 || isCompleted || isAlreadyResolved ? (
                  <Check size={16} className="cw-step-done-icon" />
                ) : pipelineStep === 1 ? (
                  <RefreshCw size={15} className="spin" style={{ color: '#0f766e' }} />
                ) : null}
              </div>
              <div className="cw-step-body">
                <div className="cw-step-material">
                  <span>📄 委托材料：</span>
                  <code>{activeTask.entrustmentFile}</code>
                </div>
                <p className="cw-step-desc">
                  绑定正式客户【东莞市智微智能科技有限公司】，激活草稿单 V1。提取 {activeTask.linesCount} 行委托商品骨架与 25 字段初值，进入客户委托材料池。
                </p>
                <div className="cw-step-status-tag success">草稿单已激活 · 事实提取完成</div>
              </div>
            </div>

            {/* 提示词 2: P2 查货材料解析与事实提取 */}
            <div className={`cw-pipeline-step-card ${pipelineStep >= 2 ? 'active' : ''} ${pipelineStep > 2 || isCompleted || isAlreadyResolved ? 'done' : ''}`}>
              <div className="cw-step-header">
                <div className="cw-step-num">P2</div>
                <div>
                  <strong>查货材料事实提取与入库</strong>
                  <small>P2_inspection_facts</small>
                </div>
                {pipelineStep > 2 || isCompleted || isAlreadyResolved ? (
                  <Check size={16} className="cw-step-done-icon" />
                ) : pipelineStep === 2 ? (
                  <RefreshCw size={15} className="spin" style={{ color: '#0f766e' }} />
                ) : null}
              </div>
              <div className="cw-step-body">
                <div className="cw-step-material">
                  <span>📦 查货材料：</span>
                  <code>{activeTask.inspectionFiles.join('、')}</code>
                </div>
                <p className="cw-step-desc">
                  解析入仓号 {activeTask.warehouseNos.join('、')}，提取收货方东莞智微智能抬头与原始行明细，归集入库到东莞智微智能查货池，初始状态标记为“可匹配”。
                </p>
                <div className="cw-step-status-tag success">入仓事实已归集 · 状态可匹配</div>
              </div>
            </div>

            {/* 提示词 3: P3 商品匹配与依据关联 */}
            <div className={`cw-pipeline-step-card ${pipelineStep >= 3 ? 'active' : ''} ${pipelineStep > 3 || isCompleted || isAlreadyResolved ? 'done' : ''}`}>
              <div className="cw-step-header">
                <div className="cw-step-num">P3</div>
                <div>
                  <strong>商品匹配与依据关联</strong>
                  <small>P3_product_matching</small>
                </div>
                {pipelineStep > 3 || isCompleted || isAlreadyResolved ? (
                  <Check size={16} className="cw-step-done-icon" />
                ) : pipelineStep === 3 ? (
                  <RefreshCw size={15} className="spin" style={{ color: '#0f766e' }} />
                ) : null}
              </div>
              <div className="cw-step-body">
                <div className="cw-step-material">
                  <span>🔗 匹配范围：</span>
                  <code>智微智能专属双池检索</code>
                </div>
                <p className="cw-step-desc">
                  补充客户后解除跨客户强配阻断！AI 在智微智能客户池内自动匹配，ASM1543、UP9505UQGW 等商品成功锁定对应依据，库存转为“草稿占用”。
                </p>
                <div className="cw-step-status-tag success">解除阻断 · 商品依据锁定成功</div>
              </div>
            </div>

            {/* 提示词 4: P4 字段级比对与多源核对 */}
            <div className={`cw-pipeline-step-card ${pipelineStep >= 4 ? 'active' : ''} ${pipelineStep >= 4 || isCompleted || isAlreadyResolved ? 'done' : ''}`}>
              <div className="cw-step-header">
                <div className="cw-step-num">P4</div>
                <div>
                  <strong>字段一致性比对核对</strong>
                  <small>P4_field_verification</small>
                </div>
                {pipelineStep >= 4 || isCompleted || isAlreadyResolved ? (
                  <Check size={16} className="cw-step-done-icon" />
                ) : pipelineStep === 4 ? (
                  <RefreshCw size={15} className="spin" style={{ color: '#0f766e' }} />
                ) : null}
              </div>
              <div className="cw-step-body">
                <div className="cw-step-material">
                  <span>⚖️ 核对模式：</span>
                  <code>25 字段跨材料严格比对</code>
                </div>
                <p className="cw-step-desc">
                  逐字段比对申报数量、净重、毛重、品牌、产地；保留两份查货共箱重量，标记 UPI 芯片印刷 COD 与 COO 差异供报关员最终确认。
                </p>
                <div className="cw-step-status-tag success">25 字段比对完成 · 待报关员复核</div>
              </div>
            </div>
          </div>

          {/* 完成后的直观导航指引 */}
          {(isCompleted || isAlreadyResolved) && (
            <div className="cw-pipeline-success-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="cw-success-icon-wrap">
                  <CheckCircle2 size={24} style={{ color: '#059669' }} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15.5, color: '#064e3b' }}>
                    客户补充成功！【东莞市智微智能科技有限公司】已正式加入客户业务概览
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#047857' }}>
                    四阶段提示词流水线已全量执行完毕，{applyBatch ? '3 票委托任务' : '本票委托任务'}已解除异常，商品依据已锁定。
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="primary"
                  onClick={onNavigateOverview}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                >
                  <span>前往客户业务概览查看 (已增加智微智能)</span>
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => store.selectDraft(activeTask.draftId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>进入核对工作台核对该单</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
