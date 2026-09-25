"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import type { FinalOutputField, SourceLocation } from "@/lib/domain/types";
import type { MultiFileEvidenceContext } from "@/lib/workbench-model";
import { MaterialPreview } from "./material-preview";

export interface MultiEvidenceInspectorProps {
  context: MultiFileEvidenceContext;
  currentField: FinalOutputField;
  allFields: readonly FinalOutputField[];
  onSelectField: (field: FinalOutputField) => void;
  onClose: () => void;
  onQuickAdoptOrder?: (field: FinalOutputField, val: string) => void;
  onQuickAdoptInspection?: (field: FinalOutputField, val: string) => void;
}

export function MultiEvidenceInspector({
  context,
  currentField,
  allFields,
  onSelectField,
  onClose,
  onQuickAdoptOrder,
  onQuickAdoptInspection,
}: MultiEvidenceInspectorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 常用公共对比字段快捷列表
  const commonFields: readonly FinalOutputField[] = [
    "型号",
    "数量",
    "产地",
    "净重",
    "毛重",
    "品牌",
    "品名",
    "件数",
    "报关单价",
    "总价",
    "入仓号",
  ];

  const orderFile = context.files.find((f) => f.materialType === "委托书");
  const inspectionFile = context.files.find((f) => f.materialType === "查货单");
  const auxFiles = context.files.filter((f) => f.materialType !== "委托书" && f.materialType !== "查货单");

  return (
    <div className={`multi-evidence-modal-backdrop ${isFullscreen ? "is-fullscreen" : ""}`}>
      <div className="multi-evidence-modal" role="dialog" aria-modal="true" aria-label="多文件原文证据同屏定位">
        {/* 顶部主横幅：商品与字段决策看板 */}
        <div className="inspector-header">
          <div className="header-meta-group">
            <div className="header-title-row">
              <span className="badge-commodity-id">{context.commodityModel}</span>
              <span className="field-crumb">/</span>
              <b className="field-name-highlight">字段定位与仲裁：{currentField}</b>
            </div>

            <div className="header-decision-summary">
              <div className="decision-final-val">
                <span className="lbl">最终申报采纳值：</span>
                <strong className="val">{context.finalValue || "（空）"}</strong>
              </div>
              <div className="decision-source-tag">
                <span className="adopted-icon">⭐</span>
                <span>采信来源：<b>{context.adoptedSourceLabel}</b></span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="action-btn"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? "还原窗口大小" : "全屏放大查阅"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{isFullscreen ? "还原" : "全屏"}</span>
            </button>
            <button
              type="button"
              className="action-btn close-btn"
              onClick={onClose}
              title="关闭透视视窗"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 公共字段快速切换导航条 */}
        <div className="inspector-field-nav">
          <span className="nav-label">快速切换核对字段：</span>
          <div className="nav-chip-list">
            {commonFields.map((f) => {
              const isActive = f === currentField;
              return (
                <button
                  key={f}
                  type="button"
                  className={`field-nav-chip ${isActive ? "active" : ""}`}
                  onClick={() => onSelectField(f)}
                >
                  <span>{f}</span>
                  {isActive && <i className="active-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 裁决规则与差异警示条 */}
        <div className="inspector-rule-banner">
          <div className="rule-badge">
            <Sparkles size={13} className="text-teal" />
            <strong>{context.adoptionRule.ruleName}</strong>
          </div>
          <p className="rule-reason-text">{context.adoptionRule.reason}</p>

          {context.hasConflict && (
            <div className="conflict-tag-pill">
              <AlertTriangle size={13} className="text-red" />
              <span>存在出入：{context.conflictSummary}</span>
            </div>
          )}

          {context.modelAffixNote && (
            <div className="affix-note-pill">
              <Info size={13} className="text-blue" />
              <span>{context.modelAffixNote}</span>
            </div>
          )}
        </div>

        {/* 主展示区：同屏多文件并排分屏对比 (免切换核心) */}
        <div className="inspector-split-body">
          {/* 视窗 1：委托书原件定位 */}
          {orderFile && (
            <div className="split-pane pane-order">
              <div className="pane-header">
                <div className="pane-title-left">
                  <FileSpreadsheet size={15} className="text-blue" />
                  <span className="pane-file-kind">委托材料</span>
                  <span className="pane-file-name" title={orderFile.fileName}>
                    {orderFile.fileName}
                  </span>
                </div>

                <div className="pane-status-right">
                  <span className="pane-raw-text">
                    原文值：<b className="text-val">{orderFile.rawValue || "空"}</b>
                  </span>
                  <span className={`pane-badge ${orderFile.isAdopted ? "badge-adopted" : "badge-ref"}`}>
                    {orderFile.isAdopted ? "⭐ 最终采纳" : "委托申报基准"}
                  </span>
                </div>
              </div>

              <div className="pane-location-bar">
                <span className="loc-label">原件高亮定位：</span>
                <span className="loc-val">{orderFile.location.position || `第 ${orderFile.location.row} 行`}</span>
                {orderFile.location.column && <span className="loc-col">（{orderFile.location.column} 列）</span>}
              </div>

              <div className="pane-content-view">
                <MaterialPreview
                  key={`${orderFile.fileId}-${orderFile.location.row}-${orderFile.location.column}-${currentField}`}
                  location={orderFile.location}
                  name={orderFile.fileName}
                  activeFileId={orderFile.fileId}
                  compactMode={true}
                  targetField={currentField}
                  badgeLabel={`委托申报: ${orderFile.rawValue || "空"}`}
                />
              </div>

              {/* 委托单证据状态注脚条 (完全对齐参考图风格) */}
              <div className="pane-evidence-footer-bar">
                <div className="footer-bar-row">
                  <span className="status-label">当前位置：</span>
                  <span className="status-value">{orderFile.location.position || `第 ${orderFile.location.row} 行`}</span>
                  <span className="divider-slash">|</span>
                  <span className="status-label">当前文件值：</span>
                  <b className="status-value text-blue">{orderFile.rawValue || "（空）"}</b>
                </div>
                <div className="footer-legend-row">
                  <span className="legend-item"><span className="legend-dot bg-blue" /> 委托申报事实基准</span>
                  {orderFile.isAdopted && <span className="legend-item"><span className="legend-dot bg-green" /> ⭐ 最终采纳申报值</span>}
                </div>
              </div>

              {context.hasConflict && onQuickAdoptOrder && orderFile.rawValue && (
                <div className="pane-quick-footer">
                  <button
                    type="button"
                    className="btn-quick-adopt btn-order"
                    onClick={() => onQuickAdoptOrder(currentField, orderFile.rawValue!)}
                  >
                    <span>改用委托申报值 [{orderFile.rawValue}]</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 视窗 2：查货单实物批次定位 */}
          {inspectionFile && (
            <div className="split-pane pane-inspection">
              <div className="pane-header">
                <div className="pane-title-left">
                  <FileText size={15} className="text-teal" />
                  <span className="pane-file-kind">查货单</span>
                  <span className="pane-file-name" title={inspectionFile.fileName}>
                    {inspectionFile.fileName}
                  </span>
                </div>

                <div className="pane-status-right">
                  <span className="pane-raw-text">
                    实测值：<b className="text-val text-teal">{inspectionFile.rawValue || "未填"}</b>
                  </span>
                  <span className={`pane-badge ${inspectionFile.isAdopted ? "badge-adopted" : "badge-ref"}`}>
                    {inspectionFile.isAdopted ? "⭐ 最终采纳 (实物优先)" : "查货实测依据"}
                  </span>
                </div>
              </div>

              <div className="pane-location-bar">
                <span className="loc-label">实物核验批次：</span>
                <span className="loc-val">{inspectionFile.location.position || `第 ${inspectionFile.location.page} 页`}</span>
                {inspectionFile.location.bounds && <span className="loc-col">（红色高亮框标定实测依据）</span>}
              </div>

              <div className="pane-content-view">
                <MaterialPreview
                  key={`${inspectionFile.fileId}-${inspectionFile.location.page}-${currentField}`}
                  location={inspectionFile.location}
                  name={inspectionFile.fileName}
                  activeFileId={inspectionFile.fileId}
                  compactMode={true}
                  defaultViewMode="ANNOTATED"
                  targetField={currentField}
                  badgeLabel={`${currentField}证据: ${inspectionFile.rawValue || "实测依据"}`}
                />
              </div>

              {/* 查货单证据状态注脚条 (完全对齐参考图 2 底部状态条) */}
              <div className="pane-evidence-footer-bar">
                <div className="footer-bar-row">
                  <span className="status-label">当前位置：</span>
                  <span className="status-value">{inspectionFile.location.position || `查货单 · 第 ${inspectionFile.location.page} 页`}</span>
                  <span className="divider-slash">|</span>
                  <span className="status-label">当前文件值：</span>
                  <b className="status-value text-teal">{inspectionFile.rawValue || "（已标定）"}</b>
                  <span className="divider-slash">|</span>
                  <span className="status-label">匹配对象：</span>
                  <span className="status-value">{context.commodityModel}</span>
                </div>
                <div className="footer-legend-row">
                  {inspectionFile.isAdopted ? (
                    <span className="legend-item"><span className="legend-dot bg-green" /> ■ 采纳证据 (实物优先)</span>
                  ) : context.hasConflict ? (
                    <span className="legend-item"><span className="legend-dot bg-red" /> ■ 差异冲突待裁决</span>
                  ) : (
                    <span className="legend-item"><span className="legend-dot bg-teal" /> ■ 仓库实物查验依据</span>
                  )}
                  {inspectionFile.location.bounds && (
                    <span className="legend-item"><span className="legend-dot bg-red" /> 红色高亮标定框已就位</span>
                  )}
                </div>
              </div>

              {context.hasConflict && onQuickAdoptInspection && inspectionFile.rawValue && (
                <div className="pane-quick-footer">
                  <button
                    type="button"
                    className="btn-quick-adopt btn-inspection"
                    onClick={() => onQuickAdoptInspection(currentField, inspectionFile.rawValue!)}
                  >
                    <span>采纳查货实测值 [{inspectionFile.rawValue}]</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 视窗 3：辅助商业单证（发票/箱单，若有时同屏展示） */}
          {auxFiles.map((aux) => (
            <div key={aux.id} className="split-pane pane-auxiliary">
              <div className="pane-header">
                <div className="pane-title-left">
                  <Layers size={15} className="text-purple" />
                  <span className="pane-file-kind">{aux.materialType}</span>
                  <span className="pane-file-name" title={aux.fileName}>
                    {aux.fileName}
                  </span>
                </div>
                <div className="pane-status-right">
                  <span className="pane-badge badge-ref">商业单证依据</span>
                </div>
              </div>

              <div className="pane-location-bar">
                <span className="loc-label">单证位置：</span>
                <span className="loc-val">{aux.location.position || "单证对应行"}</span>
              </div>

              <div className="pane-content-view">
                <MaterialPreview
                  key={`${aux.fileId}-${currentField}`}
                  location={aux.location}
                  name={aux.fileName}
                  activeFileId={aux.fileId}
                  compactMode={true}
                  badgeLabel={`${aux.materialType}依据: ${aux.rawValue || "单证记录"}`}
                />
              </div>

              <div className="pane-evidence-footer-bar">
                <div className="footer-bar-row">
                  <span className="status-label">当前位置：</span>
                  <span className="status-value">{aux.location.position || "商业单证"}</span>
                  <span className="divider-slash">|</span>
                  <span className="status-label">单证记录值：</span>
                  <b className="status-value">{aux.rawValue || "—"}</b>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部状态说明栏 */}
        <div className="inspector-footer">
          <div className="footer-tips">
            <span className="tip-dot" />
            <span>
              <b>同屏比对提示：</b>左侧展示报关委托原单，右侧展示仓库实测查货报告。点击上方字段按钮可直接无缝联动切换，无需在文件标签之间频繁跳转。
            </span>
          </div>
          <div className="footer-actions">
            <button type="button" className="btn-done" onClick={onClose}>
              完成查阅
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
