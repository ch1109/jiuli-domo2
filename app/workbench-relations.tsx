"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
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
import type { FieldEvidence, FinalOutputField } from "@/lib/domain/types";

export function LineActions({
  draft,
  line,
  sources,
  onFieldSelect,
}: {
  draft: UiDraft;
  line: UiLine;
  sources: UiSource[];
  evidence: FieldEvidence[];
  onFieldSelect: (f: FinalOutputField) => void;
}) {
  const state = useDemoStore();
  const [selectedSingleSourceId, setSelectedSingleSourceId] = useState("");
  const [selectedCompositeIds, setSelectedCompositeIds] = useState<string[]>([]);
  const [revisedModel, setRevisedModel] = useState(line.model);
  const [showReviseModel, setShowReviseModel] = useState(false);
  const [matchMode, setMatchMode] = useState<"single" | "composite">("single");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateTab, setCandidateTab] = useState<"ALL" | "RECOMMENDED">("ALL");

  // 该客户池中所有可匹配的查货商品
  const availableCandidates = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.customerId === draft.customerId &&
          (s.availability === "可匹配" ||
            (line.relationSourceIds ?? []).includes(s.id)),
      ),
    [sources, draft.customerId, line.relationSourceIds],
  );

  // 过滤后的候选列表
  const filteredCandidates = useMemo(() => {
    let list = availableCandidates;
    if (candidateTab === "RECOMMENDED") {
      list = list.filter(
        (c) =>
          c.model?.trim().toUpperCase() === line.model?.trim().toUpperCase(),
      );
    }
    if (candidateSearch.trim()) {
      const q = candidateSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.model.toLowerCase().includes(q) ||
          (c.warehouseNo && c.warehouseNo.toLowerCase().includes(q)) ||
          (c.sourceFileId && c.sourceFileId.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [availableCandidates, candidateTab, candidateSearch, line.model]);

  const recommendedCount = useMemo(
    () =>
      availableCandidates.filter(
        (c) =>
          c.model?.trim().toUpperCase() === line.model?.trim().toUpperCase(),
      ).length,
    [availableCandidates, line.model],
  );

  // 当前已绑定的查货商品对象
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

  // 切换多选
  const toggleCompositeSelect = (sourceId: string) => {
    setSelectedCompositeIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId],
    );
  };

  // 多选合计数量
  const compositeTotalQuantity = useMemo(() => {
    return selectedCompositeIds.reduce((sum, id) => {
      const s = availableCandidates.find((c) => c.id === id);
      return sum + Number(s?.quantity ?? 0);
    }, 0);
  }, [selectedCompositeIds, availableCandidates]);

  const entrustmentQty = Number(line.fields.数量 || line.quantity || 0);

  return (
    <div className="relations-modern-panel">
      {/* 1. 当前委托商品概览卡片 */}
      <div className="rel-card rel-entrustment-card">
        <div className="rel-card-header">
          <div className="rel-title-group">
            <span className="rel-badge-accent">委托申报项</span>
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
        </div>
      </div>

      {/* 2. 当前匹配状态与已关联依据 */}
      <div className="rel-card rel-active-status-card">
        <div className="rel-card-header">
          <div className="rel-section-title-box">
            <Link2 size={13} className="text-teal" />
            <span className="rel-section-title">当前查货依据关系</span>
          </div>
          {hasRelation ? (
            <span className="rel-status-badge tag-green">
              <CheckCircle2 size={12} />
              已关联 ({activeSources.length} 条明细)
            </span>
          ) : (
            <span className="rel-status-badge tag-orange">
              <AlertTriangle size={12} />
              未关联查货明细
            </span>
          )}
        </div>

        {hasRelation ? (
          <div className="active-sources-container">
            {activeSources.map((s, idx) => {
              const diff = Number(s.quantity || 0) - entrustmentQty;
              const isQtyMatch = diff === 0;

              return (
                <div key={s.id} className="active-source-card">
                  <div className="active-source-top">
                    <span className="source-index-tag">批次 #{idx + 1}</span>
                    <strong className="source-model-name">{s.model}</strong>
                    <div className="source-qty-badge">
                      实测数量：<b>{s.quantity}</b>
                    </div>
                  </div>

                  <div className="active-source-tags-row">
                    {isQtyMatch ? (
                      <span className="qty-match-pill pill-match">
                        ✓ 申报与实测数量吻合
                      </span>
                    ) : (
                      <span className="qty-match-pill pill-diff">
                        ⚠ 实测与申报差异 {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                    <span className="source-meta-tag">入仓号：{s.warehouseNo || "默认"}</span>
                    <span className="source-meta-tag">产地：{s.origin || "—"}</span>
                  </div>

                  <div className="active-source-footer-row">
                    <span className="source-file-ref" title={s.sourceFileId}>
                      <FileText size={11} />
                      {s.sourceFileId}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="active-sources-action-bar">
              <button
                type="button"
                className="btn-ghost-danger"
                onClick={() => state.unbindSelectedLine(line.id)}
                title="解除当前关联的查货明细"
              >
                <Unlink size={12} />
                解除当前匹配依据
              </button>
            </div>
          </div>
        ) : (
          <div className="rel-empty-prompt">
            <AlertCircle size={15} className="prompt-icon" />
            <div className="prompt-text">
              <strong>尚未建立查货对应</strong>
              <p>当前委托商品暂无查货实测数据支撑，请在下方候选池中指定查货商品。</p>
            </div>
          </div>
        )}
      </div>

      {/* 3. 客户可用查货商品池 (优雅现代卡片交互) */}
      {!draft.finalized && (
        <div className="rel-card rel-candidate-section">
          <div className="rel-card-header">
            <div className="rel-title-group">
              <PackageCheck size={14} className="text-teal" />
              <span className="rel-section-title">客户可用查货池</span>
              <span className="rel-count-badge">
                {availableCandidates.length}
              </span>
            </div>

            {/* 模式切换：单选改配 vs 多行合并 */}
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

            <div className="quick-filter-chips">
              <button
                type="button"
                className={`chip-btn ${candidateTab === "ALL" ? "active" : ""}`}
                onClick={() => setCandidateTab("ALL")}
              >
                全部 ({availableCandidates.length})
              </button>
              <button
                type="button"
                className={`chip-btn ${candidateTab === "RECOMMENDED" ? "active" : ""}`}
                onClick={() => setCandidateTab("RECOMMENDED")}
              >
                <Sparkles size={10} />
                推荐完全一致 ({recommendedCount})
              </button>
            </div>
          </div>

          {/* 候选列表卡片 */}
          {filteredCandidates.length === 0 ? (
            <div className="candidates-empty-state">
              <Boxes size={26} className="empty-icon" />
              <p>
                {candidateSearch || candidateTab === "RECOMMENDED"
                  ? "未找到符合筛选条件的查货明细"
                  : "该客户池暂无其他可用的查货商品明细"}
              </p>
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
                const modelMatches =
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
                          {modelMatches && (
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
                          实测数量：<b>{c.quantity}</b>
                        </span>
                        <span className="cand-dot">·</span>
                        <span className="cand-stat-item">
                          入仓号：{c.warehouseNo || "默认"}
                        </span>
                        <span className="cand-dot">·</span>
                        <span className="cand-stat-item">
                          产地：{c.origin || "—"}
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

          {/* 底部动作栏 */}
          <div className="candidate-footer-action">
            {matchMode === "single" ? (
              <div className="footer-action-row">
                <span className="footer-status-text">
                  {selectedSingleSourceId
                    ? "已选定 1 条查货明细作为依据"
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
                  已选 <b>{selectedCompositeIds.length}</b> 条明细 · 合计实测{" "}
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

      {/* 4. 委托资料型号纠偏 */}
      <div className="rel-card rel-revise-card">
        <button
          type="button"
          className="rel-revise-toggle"
          onClick={() => setShowReviseModel(!showReviseModel)}
        >
          <div className="revise-label-group">
            <Pencil size={12} className="text-muted" />
            <span>原始委托型号录入有误？点击在此纠偏</span>
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
