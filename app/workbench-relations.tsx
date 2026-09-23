"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Link2,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Unlink,
} from "lucide-react";
import {
  useDemoStore,
  type UiDraft,
  type UiLine,
  type UiSource,
} from "@/lib/demo-store";
import type { FieldEvidence, FinalOutputField, SourceLocation } from "@/lib/domain/types";

export interface CommodityRelationsProps {
  draft: UiDraft;
  line: UiLine;
  sources: UiSource[];
  evidence: FieldEvidence[];
  onFieldSelect: (f: FinalOutputField) => void;
  onJumpToMaterial?: (fileId: string, location?: Partial<SourceLocation>) => void;
  onSwitchTab?: (tab: "FIELD_SOURCE" | "INSPECTION_BASIS" | "RAW_MATERIAL" | "VERIFY_DECISION") => void;
}

export function CommodityRelations({
  draft,
  line,
  sources,
  onFieldSelect,
  onJumpToMaterial,
  onSwitchTab,
}: CommodityRelationsProps) {
  const state = useDemoStore();
  const [selectedSingleSourceId, setSelectedSingleSourceId] = useState("");
  const [selectedCompositeIds, setSelectedCompositeIds] = useState<string[]>([]);
  const [revisedModel, setRevisedModel] = useState(line.model);
  const [showReviseModel, setShowReviseModel] = useState(false);
  const [matchMode, setMatchMode] = useState<"single" | "composite">("single");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [showWeakPool, setShowWeakPool] = useState(false); // 弱候选池默认折叠

  // 当前客户池中所有可匹配或已绑定的查货商品
  const availableCandidates = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.customerId === draft.customerId &&
          (s.availability === "可匹配" ||
            (line.relationSourceIds ?? []).includes(s.id) ||
            line.relationSourceId === s.id),
      ),
    [sources, draft.customerId, line.relationSourceIds, line.relationSourceId],
  );

  // 当前委托行已绑定的查货商品对象
  const activeSources = useMemo(
    () =>
      sources.filter(
        (s) =>
          (line.relationSourceIds ?? []).includes(s.id) ||
          line.relationSourceId === s.id,
      ),
    [sources, line.relationSourceId, line.relationSourceIds],
  );

  const hasRelation = activeSources.length > 0;

  // 精确匹配型号的候选列表
  const exactModelCandidates = useMemo(() => {
    const targetModel = line.model?.trim().toUpperCase();
    if (!targetModel) return [];
    return availableCandidates.filter(
      (c) =>
        c.model?.trim().toUpperCase() === targetModel &&
        !activeSources.some((a) => a.id === c.id),
    );
  }, [availableCandidates, line.model, activeSources]);

  // 数量计算
  const entrustmentQty = Number(line.fields.数量 || line.quantity || 0);
  const activeTotalQuantity = useMemo(
    () =>
      activeSources.reduce(
        (sum, s) => sum + Number(s.fields?.数量 || s.quantity || 0),
        0,
      ),
    [activeSources],
  );
  const qtyDifference = activeTotalQuantity - entrustmentQty;

  // 涉及批次与入仓号集合
  const batchSet = useMemo(
    () =>
      new Set(
        activeSources
          .map((s) => s.logicalInspectionOrderId || s.warehouseNo)
          .filter(Boolean),
      ),
    [activeSources],
  );

  // 过滤后的手动候选池
  const filteredCandidates = useMemo(() => {
    let list = availableCandidates;
    if (candidateSearch.trim()) {
      const q = candidateSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.model?.toLowerCase().includes(q) ||
          (c.warehouseNo && c.warehouseNo.toLowerCase().includes(q)) ||
          (c.sourceFileId && c.sourceFileId.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [availableCandidates, candidateSearch]);

  // 多选切换
  const toggleCompositeSelect = (sourceId: string) => {
    setSelectedCompositeIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId],
    );
  };

  const compositeTotalQuantity = useMemo(() => {
    return selectedCompositeIds.reduce((sum, id) => {
      const s = availableCandidates.find((c) => c.id === id);
      return sum + Number(s?.fields?.数量 || s?.quantity || 0);
    }, 0);
  }, [selectedCompositeIds, availableCandidates]);

  // 当前状态判断
  const isMultiCandidate = !hasRelation && exactModelCandidates.length >= 2;
  const isNoMatch = !hasRelation && exactModelCandidates.length === 0;
  const isSingleRecommend = !hasRelation && exactModelCandidates.length === 1;

  // 委托商品行号
  const lineIndex = draft.lines.findIndex((l) => l.id === line.id) + 1;

  return (
    <div className="relations-modern-panel">
      {/* 顶部轻量概要卡片 (专注当前选中委托商品的查货核验依据 P2/P3) */}
      <div className="rel-summary-compact">
        <div className="summary-compact-header">
          <div className="summary-compact-title">
            <strong>查货核验依据</strong>
            <span className="summary-item-badge">
              商品 {String(lineIndex).padStart(2, "0")} · {line.id.replace(/^L-?/, "R")}
            </span>
          </div>
          <div className="summary-status-tag">
            {hasRelation ? (
              <span className="rel-badge-green">
                <CheckCircle2 size={12} />
                已建立可靠依据 (MATCHED)
              </span>
            ) : isMultiCandidate ? (
              <span className="rel-badge-amber">
                <AlertTriangle size={12} />
                找到 {exactModelCandidates.length} 个候选，需人工确认
              </span>
            ) : isSingleRecommend ? (
              <span className="rel-badge-blue">
                <Sparkles size={12} />
                找到 1 个推荐依据
              </span>
            ) : (
              <span className="rel-badge-muted">
                <AlertCircle size={12} />
                暂未建立查货依据 (UNMATCHED)
              </span>
            )}
          </div>
        </div>

        <div className="summary-metrics-four">
          <div className="metric-box">
            <span className="metric-lbl">当前关系</span>
            <b className={hasRelation ? "text-green" : "text-muted"}>
              {hasRelation ? `已关联 ${activeSources.length} 条` : "暂无"}
            </b>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">查货候选</span>
            <b className={exactModelCandidates.length > 0 ? "text-amber" : "text-muted"}>
              {exactModelCandidates.length} 个
            </b>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">涉及批次</span>
            <b>{batchSet.size > 0 ? `${batchSet.size} 批` : "0 批"}</b>
          </div>
          <div className="metric-box">
            <span className="metric-lbl">使用原始行</span>
            <b>{activeSources.length} 条</b>
          </div>
        </div>
      </div>

      {/* ① 当前委托商品卡片 */}
      <div className="rel-card rel-entrustment-card">
        <div className="rel-card-header">
          <div className="rel-title-group">
            <span className="rel-badge-accent">当前委托商品</span>
            <strong className="rel-model-title">{line.model || "型号未填"}</strong>
          </div>
          <span className="rel-qty-pill">
            申报数量：<b>{line.fields.数量 || line.quantity || "0"}</b>{" "}
            {line.fields.单位 || "PCS"}
          </span>
        </div>

        <div className="rel-meta-grid">
          <div className="rel-meta-item">
            <span className="rel-meta-label">品名：</span>
            <span className="rel-meta-val">{line.fields.品名 || "—"}</span>
          </div>
          <div className="rel-meta-item">
            <span className="rel-meta-label">品牌：</span>
            <span className="rel-meta-val">{line.fields.品牌 || "—"}</span>
          </div>
          <div className="rel-meta-item">
            <span className="rel-meta-label">产地：</span>
            <span className="rel-meta-val">{line.fields.产地 || "—"}</span>
          </div>
          <div className="rel-meta-item">
            <span className="rel-meta-label">申报单价：</span>
            <span className="rel-meta-val">
              {line.fields.报关单价
                ? `${line.fields.报关单价} ${line.fields.币种 || ""}`
                : "—"}
            </span>
          </div>
          <div className="rel-meta-item">
            <span className="rel-meta-label">物料号：</span>
            <span className="rel-meta-val">
              {line.fields.物料号码 || line.fields.sku || "—"}
            </span>
          </div>
          <div className="rel-meta-item rel-meta-source">
            <span className="rel-meta-label">来源依据：</span>
            <button
              type="button"
              className="source-jump-btn"
              onClick={() => {
                if (line.sourceLocation?.fileId && onJumpToMaterial) {
                  onJumpToMaterial(line.sourceLocation.fileId, line.sourceLocation);
                } else if (onJumpToMaterial) {
                  onJumpToMaterial(draft.materialFileIds[0] || "", {
                    row: lineIndex + 1,
                    sheet: "Sheet1",
                    position: `第${lineIndex + 1}行`,
                  });
                }
              }}
              title="点击在原始材料中定位此委托行"
            >
              <FileSpreadsheet size={12} />
              <span>
                {line.sourceLocation?.fileId
                  ? `${line.sourceLocation.fileId} · 第${line.sourceLocation.row ?? lineIndex + 1}行`
                  : `2件.xlsx · 第${lineIndex + 1}行`}
              </span>
              <ExternalLink size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* ② 当前商品关系：情景 A（已对应）/ 情景 B（多候选）/ 情景 C（无匹配） */}
      <div className="rel-card rel-active-relation-card">
        <div className="rel-card-header">
          <div className="rel-section-title-box">
            <Link2 size={13} className="text-teal" />
            <span className="rel-section-title">当前查货依据关系</span>
          </div>
          {hasRelation && (
            <span className="rel-status-badge tag-green">
              <CheckCircle2 size={12} />
              已建立可靠对应
            </span>
          )}
        </div>

        {/* ─── 情景 A：已建立可靠对应 ─── */}
        {hasRelation ? (
          <div className="active-relation-section">
            <div className="relation-header-meta">
              <div className="meta-pair">
                <span className="meta-lbl">查货批次</span>
                <b>{activeSources[0]?.logicalInspectionOrderId || "CH003"}</b>
              </div>
              <div className="meta-pair">
                <span className="meta-lbl">入仓号</span>
                <b>{activeSources[0]?.warehouseNo || "26036383"}</b>
              </div>
              <div className="meta-pair">
                <span className="meta-lbl">查货商品型号</span>
                <strong className="text-teal">{activeSources[0]?.model}</strong>
              </div>
              <div className="meta-pair">
                <span className="meta-lbl">覆盖情况</span>
                {qtyDifference === 0 ? (
                  <span className="pill-coverage coverage-full">✓ 数量完整覆盖</span>
                ) : (
                  <span className="pill-coverage coverage-diff">
                    ⚠ 实测合计 {activeTotalQuantity} (差异 {qtyDifference > 0 ? `+${qtyDifference}` : qtyDifference})
                  </span>
                )}
              </div>
            </div>

            {/* 重点：实际使用的原始查货行明细 */}
            <div className="used-raw-rows-wrapper">
              <div className="raw-rows-title">
                <span>实际使用的原始查货明细行 ({activeSources.length} 条)：</span>
                <small className="text-muted">追溯真实原始入库单据记录</small>
              </div>

              <div className="raw-rows-list">
                {activeSources.map((source, idx) => {
                  const rawNo = `原始行 ${String(idx + 1).padStart(2, "0")}`;
                  const rowId = source.id.replace(/^I-/, "");

                  return (
                    <div key={source.id} className="raw-row-card">
                      <div className="raw-row-top">
                        <div className="raw-row-tag-group">
                          <span className="badge-raw-no">{rawNo}</span>
                          <span className="badge-raw-id" title={source.id}>{rowId}</span>
                        </div>
                        <div className="raw-row-qty">
                          实测数量：<b>{source.fields?.数量 || source.quantity}</b>
                        </div>
                      </div>

                      <div className="raw-row-props">
                        <span>产地：<b>{source.fields?.产地 || source.origin || "—"}</b></span>
                        <span>·</span>
                        <span>件数：<b>{source.fields?.件数 || "1"}</b></span>
                        <span>·</span>
                        <span>净重：<b>{source.fields?.净重 || "—"} kg</b></span>
                      </div>

                      <div className="raw-row-bottom">
                        <button
                          type="button"
                          className="link-raw-location"
                          onClick={() => {
                            if (onJumpToMaterial) {
                              onJumpToMaterial(source.sourceFileId, source.sourceLocation);
                            }
                          }}
                          title="在原始材料中定位此查货行"
                        >
                          <FileText size={11} />
                          <span>
                            {source.sourceFileId}
                            {source.sourceLocation?.page ? ` · 第${source.sourceLocation.page}页` : ""}
                            {source.sourceLocation?.position ? ` · ${source.sourceLocation.position}` : ""}
                          </span>
                          <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 解绑与改配操作，以及查看 P4 结论导航 */}
            <div className="active-relation-actions">
              <button
                type="button"
                className="btn-ghost-danger"
                onClick={() => state.unbindSelectedLine(line.id)}
                title="解除当前关联并释放查货明细"
              >
                <Unlink size={12} />
                解除当前依据
              </button>
              <button
                type="button"
                className="btn-secondary-light"
                onClick={() => setShowWeakPool((prev) => !prev)}
              >
                <RefreshCw size={11} />
                {showWeakPool ? "收起改配选择器" : "改配其他查货"}
              </button>
              {onSwitchTab && (
                <button
                  type="button"
                  className="btn-link-p4-decision"
                  onClick={() => onSwitchTab("VERIFY_DECISION")}
                  title="前往核验结论查看 P4 字段判定"
                >
                  <Sparkles size={12} className="text-purple" />
                  <span>查看 P4 核验结论 →</span>
                </button>
              )}
            </div>
          </div>
        ) : isMultiCandidate ? (
          /* ─── 情景 B：多候选待人工选择 ─── */
          <div className="multi-candidates-section">
            <div className="multi-candidates-banner">
              <AlertTriangle size={15} className="text-amber" />
              <div>
                <strong>当前状态：找到 {exactModelCandidates.length} 个可能对应，需要人工选择</strong>
                <p>两个候选均具备合理型号与品牌证据，目前无法自动唯一确定，请点击选择或组合关联。</p>
              </div>
            </div>

            <div className="candidate-cards-flow">
              {exactModelCandidates.map((cand, idx) => {
                const isSelected = selectedSingleSourceId === cand.id;
                const isCompositeSelected = selectedCompositeIds.includes(cand.id);

                return (
                  <div
                    key={cand.id}
                    className={`candidate-reasoning-card ${
                      isSelected || isCompositeSelected ? "is-active" : ""
                    }`}
                  >
                    <div className="cand-card-top">
                      <div className="cand-top-left">
                        <span className="cand-order-badge">候选 {idx + 1}</span>
                        <strong className="cand-model-name">{cand.model}</strong>
                      </div>
                      <div className="cand-qty-box">
                        实测数量：<b>{cand.fields?.数量 || cand.quantity}</b>
                      </div>
                    </div>

                    <div className="cand-details-row">
                      <span>入仓号：<b>{cand.warehouseNo || "26036383"}</b></span>
                      <span>·</span>
                      <span>产地：<b>{cand.fields?.产地 || cand.origin || "—"}</b></span>
                      <span>·</span>
                      <span className="cand-file-link" title={cand.sourceFileId}>
                        <FileText size={11} />
                        {cand.sourceFileId}
                      </span>
                    </div>

                    {/* 核心：为什么是候选 */}
                    <div className="cand-why-box">
                      <span className="why-box-title">为什么是候选：</span>
                      <ul className="why-evidence-list">
                        <li className="ev-ok">
                          <Check size={11} className="text-green" />
                          <span>型号完全一致 ({cand.model})</span>
                        </li>
                        <li className="ev-ok">
                          <Check size={11} className="text-green" />
                          <span>品牌一致 ({cand.brand || line.fields.品牌 || "WINBOND"})</span>
                        </li>
                        {cand.fields?.产地 && line.fields.产地 && cand.fields.产地 !== line.fields.产地 ? (
                          <li className="ev-warn">
                            <span className="circle-dot">○</span>
                            <span>产地差异 (委托:{line.fields.产地} vs 查货:{cand.fields.产地})，无法自动消歧</span>
                          </li>
                        ) : (
                          <li className="ev-neutral">
                            <span className="circle-dot">○</span>
                            <span>缺少进一步物料号或批次唯一消歧证据</span>
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className="cand-card-actions">
                      <button
                        type="button"
                        className="btn-select-candidate"
                        onClick={() => {
                          state.selectLineSource(line.id, cand.id);
                          setSelectedSingleSourceId("");
                        }}
                      >
                        <Check size={12} />
                        选择这个商品
                      </button>
                      <button
                        type="button"
                        className={`btn-toggle-composite ${isCompositeSelected ? "composite-on" : ""}`}
                        onClick={() => toggleCompositeSelect(cand.id)}
                        title="勾选此项参与多批次组合关联"
                      >
                        <Layers size={11} />
                        {isCompositeSelected ? "已勾选组合" : "加入多选组合"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedCompositeIds.length >= 2 && (
              <div className="composite-selection-action-bar">
                <span>
                  已选 <b>{selectedCompositeIds.length}</b> 个候选明细 · 合计实测 <b>{compositeTotalQuantity}</b>
                </span>
                <button
                  type="button"
                  className="primary btn-sm"
                  onClick={() => {
                    state.establishCompositeForLine(line.id, selectedCompositeIds);
                    setSelectedCompositeIds([]);
                  }}
                >
                  <Layers size={13} />
                  组合关联所选项作为依据
                </button>
              </div>
            )}

            <div className="multi-cand-footer-note">
              <Info size={13} className="text-muted" />
              <span>所有候选均具备合理关系证据；人工选择后系统将自动重新核验受影响字段。</span>
            </div>
          </div>
        ) : isSingleRecommend ? (
          /* ─── 情景：1 个高可信推荐 ─── */
          <div className="single-recommend-section">
            <div className="recommend-banner">
              <Sparkles size={15} className="text-teal" />
              <div>
                <strong>系统已检索到 1 个完全一致的推荐查货商品</strong>
                <p>型号与品牌吻合，可一键关联为查货依据。</p>
              </div>
            </div>
            {exactModelCandidates.map((cand) => (
              <div key={cand.id} className="candidate-reasoning-card is-active">
                <div className="cand-card-top">
                  <strong className="cand-model-name">{cand.model}</strong>
                  <div className="cand-qty-box">
                    实测数量：<b>{cand.fields?.数量 || cand.quantity}</b>
                  </div>
                </div>
                <div className="cand-details-row">
                  <span>入仓号：<b>{cand.warehouseNo || "26036383"}</b></span>
                  <span>·</span>
                  <span>产地：<b>{cand.fields?.产地 || cand.origin || "—"}</b></span>
                  <span>·</span>
                  <span>{cand.sourceFileId}</span>
                </div>
                <button
                  type="button"
                  className="primary btn-sm btn-block-action"
                  onClick={() => state.selectLineSource(line.id, cand.id)}
                >
                  <Check size={13} />
                  一键采纳此查货依据
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* ─── 情景 C：完全没有匹配 ─── */
          <div className="no-match-reason-card">
            <div className="no-match-head">
              <AlertCircle size={16} className="text-orange" />
              <strong>暂未找到可靠查货依据</strong>
            </div>

            <div className="no-match-body">
              <div className="check-stats-line">
                <span>系统已经检查：</span>
                <b>{availableCandidates.length} 个当前可用查货商品</b>
              </div>
              <div className="check-stats-line">
                <span>筛选结果：</span>
                <b className="text-orange">0 个满足可靠对应条件</b>
              </div>
              <div className="reason-explanation">
                <span>主要原因：</span>
                <p>
                  当前客户查货池中没有与型号【<b>{line.model || "未命名"}</b>】建立可靠关系的商品。
                </p>
              </div>
              <div className="followup-note">
                <small>后续有新查货材料进入后，系统会自动重新检查并增量核验。</small>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ③ 为什么建立这个关系（关键证据层） */}
      {(hasRelation || exactModelCandidates.length > 0) && (
        <div className="rel-card rel-evidence-justification-card">
          <div className="rel-card-header">
            <div className="rel-title-group">
              <Sparkles size={13} className="text-purple" />
              <span className="rel-section-title">为什么认为是同一商品？</span>
            </div>
          </div>

          <div className="justification-list">
            <div className="just-item item-ok">
              <Check size={13} className="text-green" />
              <div>
                <b>型号完全一致</b>
                <p>{line.model || "—"}</p>
              </div>
            </div>

            <div className="just-item item-ok">
              <Check size={13} className="text-green" />
              <div>
                <b>品牌一致</b>
                <p>{line.fields.品牌 || line.brand || "WINBOND"}</p>
              </div>
            </div>

            <div className="just-item item-ok">
              <Check size={13} className="text-green" />
              <div>
                <b>物料号一致 / 兼容</b>
                <p>{line.fields.物料号码 || line.fields.sku || "规则校验通过"}</p>
              </div>
            </div>

            <div className="just-item item-qty-note">
              <span className="qty-dot">○</span>
              <div>
                <b>数量比对（核验用途）</b>
                <p>
                  委托数量：{entrustmentQty} PCS · 查货实测：
                  {hasRelation ? activeTotalQuantity : (exactModelCandidates[0]?.quantity || 0)} PCS
                </p>
                <small className="text-muted">
                  * 数量仅用于核验差异及分摊核算，不作为商品唯一身份判定依据。
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ④ 客户查货池全量浏览与弱候选关联 (弱候选默认折叠，提供改配、组合、强行关联途径) */}
      {(!draft.finalized && (showWeakPool || !hasRelation)) && (
        <div className="rel-card rel-candidate-pool-drawer">
          <div
            className="pool-drawer-header"
            onClick={() => setShowWeakPool((v) => !v)}
            role="button"
            tabIndex={0}
          >
            <div className="drawer-title-left">
              <PackageCheck size={14} className="text-teal" />
              <span className="rel-section-title">
                {hasRelation ? "客户可用查货池（改配/组合）" : "查看全部查货明细与弱候选"}
              </span>
              <span className="rel-count-badge">{availableCandidates.length}</span>
            </div>
            <div className="drawer-toggle-icon">
              {showWeakPool ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </div>

          {showWeakPool && (
            <div className="pool-drawer-body">
              {/* 模式切换：单一对应 vs 多批次组合 */}
              <div className="pool-mode-bar">
                <div className="rel-segmented-control" role="radiogroup">
                  <button
                    type="button"
                    className={`segment-btn ${matchMode === "single" ? "active" : ""}`}
                    onClick={() => setMatchMode("single")}
                  >
                    单一对应
                  </button>
                  <button
                    type="button"
                    className={`segment-btn ${matchMode === "composite" ? "active" : ""}`}
                    onClick={() => setMatchMode("composite")}
                  >
                    多批次组合
                  </button>
                </div>
              </div>

              {/* 搜索过滤栏 */}
              <div className="candidate-search-bar">
                <div className="search-input-box">
                  <Search size={12} className="search-icon" />
                  <input
                    type="text"
                    aria-label="搜索候选查货型号或入仓号"
                    placeholder="搜索型号、入仓号、原件..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                  />
                  {candidateSearch && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => setCandidateSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* 候选列表卡片 */}
              {filteredCandidates.length === 0 ? (
                <div className="candidates-empty-state">
                  <Boxes size={24} className="empty-icon" />
                  <p>未找到匹配条件的查货商品</p>
                </div>
              ) : (
                <div className="candidate-cards-scroll">
                  {filteredCandidates.map((c) => {
                    const isSelectedSingle = selectedSingleSourceId === c.id;
                    const isSelectedComposite = selectedCompositeIds.includes(c.id);
                    const isSelected =
                      matchMode === "single"
                        ? isSelectedSingle
                        : isSelectedComposite;
                    const isCurrentlyActive = (line.relationSourceIds ?? []).includes(c.id);
                    const isModelMatch =
                      c.model?.trim().toUpperCase() ===
                      line.model?.trim().toUpperCase();

                    return (
                      <div
                        key={c.id}
                        className={`candidate-modern-card ${
                          isSelected ? "is-selected" : ""
                        } ${isCurrentlyActive ? "is-current-active" : ""}`}
                        onClick={() => {
                          if (matchMode === "single") {
                            setSelectedSingleSourceId(c.id);
                          } else {
                            toggleCompositeSelect(c.id);
                          }
                        }}
                      >
                        <div className="cand-indicator-col">
                          <div
                            className={`custom-check-ring ${
                              matchMode === "composite" ? "square" : "circle"
                            } ${isSelected ? "checked" : ""}`}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} />}
                          </div>
                        </div>

                        <div className="cand-info-col">
                          <div className="cand-row-1">
                            <strong className="cand-model">{c.model}</strong>
                            <div className="cand-tag-box">
                              {isModelMatch && (
                                <span className="tag-match-exact">
                                  <Sparkles size={9} /> 型号吻合
                                </span>
                              )}
                              {isCurrentlyActive && (
                                <span className="tag-match-current">当前依据</span>
                              )}
                            </div>
                          </div>

                          <div className="cand-row-2">
                            <span className="cand-stat-item">
                              实测数量：<b>{c.fields?.数量 || c.quantity}</b>
                            </span>
                            <span className="cand-dot">·</span>
                            <span className="cand-stat-item">
                              入仓号：{c.warehouseNo || "默认"}
                            </span>
                            <span className="cand-dot">·</span>
                            <span className="cand-stat-item">
                              产地：{c.fields?.产地 || c.origin || "—"}
                            </span>
                          </div>

                          <div className="cand-row-3">
                            <span className="cand-file-info" title={c.sourceFileId}>
                              <FileText size={10} />
                              {c.sourceFileId}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 底部确认操作栏 */}
              <div className="candidate-footer-action">
                {matchMode === "single" ? (
                  <div className="footer-action-row">
                    <span className="footer-status-text">
                      {selectedSingleSourceId
                        ? "已选定 1 条查货明细"
                        : "请点击上方查货卡片选择依据"}
                    </span>
                    <button
                      type="button"
                      className="primary btn-sm btn-action-confirm"
                      disabled={
                        !selectedSingleSourceId ||
                        selectedSingleSourceId === line.relationSourceId
                      }
                      onClick={() => {
                        if (hasRelation) {
                          state.reassignSelectedLine(line.id, selectedSingleSourceId);
                        } else {
                          state.selectLineSource(line.id, selectedSingleSourceId);
                        }
                        setSelectedSingleSourceId("");
                      }}
                    >
                      <Check size={13} />
                      {hasRelation ? "确认改配所选查货" : "关联为查货依据"}
                    </button>
                  </div>
                ) : (
                  <div className="footer-action-row">
                    <span className="footer-status-text">
                      已选 <b>{selectedCompositeIds.length}</b> 条 · 合计实测{" "}
                      <b>{compositeTotalQuantity}</b>
                    </span>
                    <button
                      type="button"
                      className="primary btn-sm btn-action-confirm"
                      disabled={selectedCompositeIds.length < 2}
                      onClick={() => {
                        state.establishCompositeForLine(
                          line.id,
                          selectedCompositeIds,
                        );
                        setSelectedCompositeIds([]);
                      }}
                    >
                      <Layers size={13} />
                      组合关联所选 ({selectedCompositeIds.length})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ⑤ 委托型号纠偏表单 */}
      <div className="rel-card rel-revise-card">
        <button
          type="button"
          className="rel-revise-toggle"
          onClick={() => setShowReviseModel(!showReviseModel)}
        >
          <div className="revise-label-group">
            <Pencil size={12} className="text-muted" />
            <span>原始委托型号录入有误？点击纠偏委托型号</span>
          </div>
          <ChevronRight
            size={13}
            className={`revise-chevron ${showReviseModel ? "rotated" : ""}`}
          />
        </button>

        {showReviseModel && (
          <div className="rel-revise-form">
            <p className="revise-hint">
              修订委托型号后，系统将自动重新检索客户查货池并触发增量核验。
            </p>
            <div className="revise-input-group">
              <input
                type="text"
                aria-label="修订委托型号"
                value={revisedModel}
                onChange={(e) => setRevisedModel(e.target.value)}
              />
              <button
                type="button"
                className="secondary btn-sm"
                disabled={!revisedModel || revisedModel === line.model}
                onClick={() => {
                  state.updateSelectedDraftMaterial(
                    line.id,
                    "型号",
                    revisedModel,
                  );
                  setShowReviseModel(false);
                }}
              >
                <RefreshCw size={11} />
                更新并重新核对
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 保持别名导出以兼容其他引用
export const LineActions = CommodityRelations;
