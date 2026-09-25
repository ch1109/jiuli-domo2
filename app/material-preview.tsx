"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceLocation } from "@/lib/domain/types";
import { getLocalMaterial } from "@/lib/demo-store";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Maximize2,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export function MaterialPreview({
  location,
  name,
  files,
  activeFileId,
  onSelectFile,
  compactMode = false,
  defaultViewMode,
  badgeLabel,
  targetField,
}: {
  location: SourceLocation;
  name: string;
  files?: Array<{ id: string; name: string; materialType: string }>;
  activeFileId?: string;
  onSelectFile?: (id: string) => void;
  compactMode?: boolean;
  defaultViewMode?: "RAW" | "ANNOTATED";
  badgeLabel?: string;
  targetField?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const selectedCell = useRef<HTMLTableCellElement>(null);
  const selectedRow = useRef<HTMLTableRowElement>(null);
  const documentScroll = useRef<HTMLDivElement>(null);
  const tableScrollContainer = useRef<HTMLDivElement>(null);

  const lowerName = name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(lowerName);
  const isExcel = /\.(xlsx|xls|csv)$/i.test(lowerName);

  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState(location.sheet ?? "");
  const [rows, setRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [page, setPage] = useState(location.page ?? 1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 模式切换：默认在有 bounds 或者是 PDF 证据时启用 ANNOTATED (红框标注定位)
  const [viewMode, setViewMode] = useState<"RAW" | "ANNOTATED">(
    defaultViewMode || (location.bounds ? "ANNOTATED" : isPdf ? "ANNOTATED" : "RAW")
  );

  // 缩放与放大弹窗
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);

  // 原文件可访问链接
  const [rawUrl, setRawUrl] = useState<string>("");

  // 维护 rawUrl（本地上传的文件转 blob URL，后端文件走 API）
  useEffect(() => {
    const local = getLocalMaterial(location.fileId);
    if (local) {
      const blobUrl = URL.createObjectURL(local);
      setRawUrl(blobUrl);
      return () => URL.revokeObjectURL(blobUrl);
    } else {
      setRawUrl(`/api/material?id=${encodeURIComponent(location.fileId)}`);
    }
  }, [location.fileId]);

  // 当外部 location 变化时同步更新内部页码和 sheet
  useEffect(() => {
    if (location.page && location.page > 0) {
      setPage(location.page);
    }
    if (location.sheet) {
      setSheet(location.sheet);
    }
  }, [location.fileId, location.page, location.sheet, location.row]);

  // 外部传入 defaultViewMode 变更时响应切换
  useEffect(() => {
    if (defaultViewMode) {
      setViewMode(defaultViewMode);
    }
  }, [defaultViewMode]);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    let objectUrlToRevoke: string | null = null;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const local = getLocalMaterial(location.fileId);
        const response = local
          ? null
          : await fetch(
              `/api/material?id=${encodeURIComponent(location.fileId)}`,
            );
        if (response && !response.ok)
          throw new Error("原文件不可用；本地上传材料刷新后需重新选择原文件。");

        const buffer = local
          ? await local.arrayBuffer()
          : await response!.arrayBuffer();

        if (cancelled) return;
        setError("");

        if (isImage) {
          const blob = new Blob([buffer]);
          const url = URL.createObjectURL(blob);
          objectUrlToRevoke = url;
          if (!cancelled) {
            setImageUrl(url);
            setLoading(false);
          }
          return;
        }

        if (isPdf) {
          const lib = await import("pdfjs-dist");
          lib.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
          const task = lib.getDocument({ data: buffer });
          destroy = () => {
            void task.destroy();
          };
          const doc = await task.promise;
          if (cancelled) return;
          setPages(doc.numPages);
          const currentPage = Math.min(Math.max(1, page), doc.numPages);
          const p = await doc.getPage(currentPage);

          // 渲染标注模式的 canvas
          if (canvas.current) {
            const viewport = p.getViewport({ scale: 1.3 * zoomScale });
            canvas.current.width = viewport.width;
            canvas.current.height = viewport.height;
            await p.render({
              canvasContext: canvas.current.getContext("2d")!,
              viewport,
            }).promise;

            if (location.bounds && currentPage === location.page) {
              const ctx = canvas.current.getContext("2d");
              const [x, y, w, h] = location.bounds;
              if (ctx) {
                const boxX = x * viewport.width;
                const boxY = y * viewport.height;
                const boxW = w * viewport.width;
                const boxH = h * viewport.height;

                // 1. 半透明高亮填充
                ctx.fillStyle = "rgba(220, 38, 38, 0.15)";
                ctx.fillRect(boxX, boxY, boxW, boxH);

                // 2. 鲜明红色边框 (完全对齐参考图 2 风格)
                ctx.strokeStyle = "#dc2626";
                ctx.lineWidth = 2.5;
                ctx.strokeRect(boxX, boxY, boxW, boxH);

                // 3. 绘制顶部红色胶囊标签 (如 "产地证据: COO: TAIWAN, CHINA / COD: France")
                const labelText = badgeLabel || location.rawText || location.position || "实测依据高亮定位";
                if (labelText) {
                  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                  const textMetrics = ctx.measureText(labelText);
                  const pillWidth = textMetrics.width + 14;
                  const pillHeight = 20;
                  const pillX = Math.max(2, boxX);
                  const pillY = Math.max(pillHeight + 2, boxY - 4);

                  ctx.fillStyle = "#dc2626";
                  ctx.beginPath();
                  if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(pillX, pillY - pillHeight, pillWidth, pillHeight, 3);
                  } else {
                    ctx.fillRect(pillX, pillY - pillHeight, pillWidth, pillHeight);
                  }
                  ctx.fill();

                  ctx.fillStyle = "#ffffff";
                  ctx.fillText(labelText, pillX + 7, pillY - 6);
                }

                // 4. 自动滚动使红框区域在视口中绝对垂直与水平居中（免去手动拖动）
                const centerPdfHighlight = () => {
                  if (documentScroll.current) {
                    const containerH = documentScroll.current.clientHeight;
                    const containerW = documentScroll.current.clientWidth;
                    const targetTop = Math.max(0, boxY - containerH / 2 + boxH / 2);
                    const targetLeft = Math.max(0, boxX - containerW / 2 + boxW / 2);
                    documentScroll.current.scrollTo({
                      top: targetTop,
                      left: targetLeft,
                      behavior: "smooth",
                    });
                  }
                };
                centerPdfHighlight();
                setTimeout(centerPdfHighlight, 60);
                setTimeout(centerPdfHighlight, 200);
              }
            }
          }
        } else {
          // 处理表格文件（Excel 等）
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheetNames = workbook.SheetNames || [];
          if (sheetNames.length === 0) {
            throw new Error("表格文件无有效工作表");
          }

          const chosen = sheet && workbook.Sheets[sheet] ? sheet : sheetNames[0];

          if (!cancelled) {
            setSheets(sheetNames);
            if (chosen !== sheet) {
              setSheet(chosen);
            }
            const activeWorksheet = workbook.Sheets[chosen];
            if (activeWorksheet) {
              const range = activeWorksheet["!ref"];
              setColumns(
                range
                  ? Array.from(
                      { length: XLSX.utils.decode_range(range).e.c + 1 },
                      (_, i) => XLSX.utils.encode_col(i),
                    )
                  : [],
              );
              setRows(
                XLSX.utils.sheet_to_json<string[]>(activeWorksheet, {
                  header: 1,
                  raw: false,
                  defval: "",
                  range: 0,
                }),
              );
            } else {
              setRows([]);
              setColumns([]);
            }
          }
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "原文件加载异常");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      destroy?.();
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [
    location.fileId,
    isPdf,
    isImage,
    page,
    sheet,
    zoomScale,
    viewMode,
    badgeLabel,
    location.bounds ? location.bounds.join(",") : "",
    location.rawText,
    location.position,
  ]);

  // 动态表头识别：在前 12 行中动态检索匹配字段所在的真实列索引 (0-based)
  const columnIndex = useMemo(() => {
    if (targetField && rows.length > 0) {
      const cleanField = targetField.trim().toLowerCase();
      for (let r = 0; r < Math.min(12, rows.length); r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] || "").trim().toLowerCase();
          if (!cell) continue;
          if (cleanField === "产地" && /产地|原产地|coo|origin/i.test(cell)) return c;
          if (cleanField === "型号" && (/型号|货物型号|规格型号|model|part\s*no|p\/n/i.test(cell) && !/规格描述/.test(cell))) return c;
          if (cleanField === "品牌" && /品牌|brand/i.test(cell)) return c;
          if (cleanField === "品名" && /品名|货物名称|商品名称|product|description|item/i.test(cell)) return c;
          if (cleanField === "数量" && /数量|qty|quantity|pcs/i.test(cell)) return c;
          if (cleanField === "净重" && /净重|n\.w|net\s*weight/i.test(cell)) return c;
          if (cleanField === "毛重" && /毛重|g\.w|gross\s*weight/i.test(cell)) return c;
          if ((cleanField === "报关单价" || cleanField === "单价") && (/单价|unit\s*price|price/i.test(cell) && !/总价/.test(cell))) return c;
          if (cleanField === "总价" && /总价|total|amount/i.test(cell)) return c;
          if (cleanField === "件数" && /件数|箱数|ctn|packages/i.test(cell)) return c;
          if (cleanField === "入仓号" && /入仓|仓号|warehouse/i.test(cell)) return c;
          if (cleanField === "单位" && (/单位|unit/i.test(cell) && !/单价/.test(cell))) return c;
          if (cleanField === "币种" && /币种|currency/i.test(cell)) return c;
        }
      }
    }
    if (location.column) {
      return (
        location.column
          .toUpperCase()
          .split("")
          .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
      );
    }
    return -1;
  }, [rows, targetField, location.column]);

  // 动态商品行号校准 (1-based)
  const resolvedRowNumber = useMemo(() => {
    if (location.row && location.row > 0) return location.row;
    if (location.rawText && rows.length > 0) {
      const cleanVal = location.rawText.trim().toLowerCase();
      for (let r = 5; r < rows.length; r++) {
        const row = rows[r];
        if (row && row.some((c) => String(c).trim().toLowerCase() === cleanVal)) {
          return r + 1;
        }
      }
    }
    return location.row ?? 1;
  }, [rows, location.row, location.rawText]);

  // 滚动定位到选中单元格或行：确保直接展示在可视窗口正中央，无需手动拖动滚动条
  useEffect(() => {
    if (loading) return;
    const targetElement = selectedCell.current || selectedRow.current;
    if (!targetElement) return;

    const performCenterScroll = () => {
      // 1. 标准 scrollIntoView 向上追溯所有可滚动包含块，进行水平和垂直居中呈现
      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });

      // 2. 容器级绝对坐标精确居中校准（确保内层有滚动条的 excel-table-scroll-wrapper 绝对滚到位）
      const container = tableScrollContainer.current || documentScroll.current;
      if (container) {
        const cellRect = targetElement.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const deltaY = cellRect.top - contRect.top - contRect.height / 2 + cellRect.height / 2;
        const deltaX = cellRect.left - contRect.left - contRect.width / 2 + cellRect.width / 2;
        if (Math.abs(deltaY) > 4) {
          container.scrollTop += deltaY;
        }
        if (Math.abs(deltaX) > 4) {
          container.scrollLeft += deltaX;
        }
      }
    };

    performCenterScroll();
    const t1 = setTimeout(performCenterScroll, 60);
    const t2 = setTimeout(performCenterScroll, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [rows, resolvedRowNumber, columnIndex, targetField, location.column, loading]);

  // 下载原文件
  const downloadRawFile = () => {
    if (!rawUrl) return;
    const a = document.createElement("a");
    a.href = rawUrl;
    a.download = name;
    a.click();
  };

  const isSourceSheet = !location.sheet || (sheet || sheets[0]) === location.sheet;

  return (
    <div className={`material-preview-v2 ${compactMode ? "is-compact" : ""}`}>
      {/* 顶部主工具栏：材料选择与快捷动作 (在 compactMode 下隐藏以避免双层嵌套) */}
      {!compactMode && (
        <div className="preview-primary-bar">
          {files && files.length > 0 ? (
            <div className="primary-file-selector">
              <span className="file-type-icon">
                {isPdf ? (
                  <FileText size={13} className="text-red" />
                ) : isExcel ? (
                  <FileSpreadsheet size={13} className="text-green" />
                ) : (
                  <Eye size={13} className="text-blue" />
                )}
              </span>
              <select
                aria-label="选择材料原件"
                value={activeFileId || location.fileId}
                onChange={(e) => onSelectFile?.(e.target.value)}
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.materialType} · {f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="primary-file-label">
              <span className="file-type-icon">
                {isPdf ? (
                  <FileText size={13} className="text-red" />
                ) : isExcel ? (
                  <FileSpreadsheet size={13} className="text-green" />
                ) : (
                  <Eye size={13} className="text-blue" />
                )}
              </span>
              <span className="file-title-text" title={name}>
                {name}
              </span>
            </div>
          )}

          <div className="primary-actions-group">
            <button
              type="button"
              className="preview-btn-compact primary"
              onClick={() => setIsFullscreenModalOpen(true)}
              title="全屏放大查阅原文件"
            >
              <Maximize2 size={12} />
              <span>放大</span>
            </button>
            <button
              type="button"
              className="preview-btn-compact"
              onClick={downloadRawFile}
              title="下载原文件"
            >
              <Download size={12} />
              <span>下载</span>
            </button>
          </div>
        </div>
      )}

      {/* 次级上下文工具栏：按文件格式自适应排布 */}
      <div className="preview-sub-bar">
        {isPdf ? (
          <>
            <div className="preview-mode-segmented">
              <button
                type="button"
                className={`seg-btn ${viewMode === "RAW" ? "active" : ""}`}
                onClick={() => setViewMode("RAW")}
                title="使用浏览器原生矢量 PDF 阅读器"
              >
                <Eye size={11} />
                <span>原生阅读</span>
              </button>
              <button
                type="button"
                className={`seg-btn ${viewMode === "ANNOTATED" ? "active" : ""}`}
                onClick={() => setViewMode("ANNOTATED")}
                title="展示 AI 识别框选定位"
              >
                <Sparkles size={11} />
                <span>AI标注</span>
              </button>
            </div>

            {viewMode === "ANNOTATED" ? (
              <div className="pdf-page-controls-compact">
                <button
                  type="button"
                  className="icon-mini-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="page-text">
                  {page} / {pages}
                </span>
                <button
                  type="button"
                  className="icon-mini-btn"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight size={13} />
                </button>
                <div className="zoom-mini-box">
                  <button
                    type="button"
                    className="icon-mini-btn"
                    disabled={zoomScale <= 0.8}
                    onClick={() => setZoomScale((z) => Math.max(0.7, z - 0.15))}
                  >
                    <ZoomOut size={11} />
                  </button>
                  <span>{Math.round(zoomScale * 100)}%</span>
                  <button
                    type="button"
                    className="icon-mini-btn"
                    disabled={zoomScale >= 2.0}
                    onClick={() => setZoomScale((z) => Math.min(2.0, z + 0.15))}
                  >
                    <ZoomIn size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <span className="pdf-native-hint">
                原生矢量 PDF · 窗口内支持滚轮缩放与 Ctrl+F 检索
              </span>
            )}
          </>
        ) : isExcel ? (
          <>
            <div className="sheet-selector-compact">
              <span className="label">工作表:</span>
              <select
                aria-label="选择工作表"
                value={sheet || sheets[0] || ""}
                onChange={(e) => setSheet(e.target.value)}
              >
                {sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="excel-meta-chips">
              <span className="sub-chip">
                {rows.length} 行 × {columns.length} 列
              </span>
              {location.row && isSourceSheet && (
                <span className="sub-chip highlight">
                  定位第 {location.row} 行
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="image-native-hint">图片原件视图</span>
        )}
      </div>

      {/* 主展示区 */}
      <div className="preview-body-container" ref={documentScroll}>
        {loading && viewMode === "ANNOTATED" && (
          <div className="preview-loading">
            <span className="spinner-dot" />
            <span>加载材料原件中...</span>
          </div>
        )}

        {error && (
          <div className="preview-error">
            <p>{error}</p>
            <button
              type="button"
              className="secondary btn-sm"
              onClick={downloadRawFile}
            >
              下载材料原文件
            </button>
          </div>
        )}

        {!error && (
          <>
            {/* 1. 原生 PDF 查阅 */}
            {isPdf && viewMode === "RAW" && Boolean(rawUrl) && (
              <div className="raw-pdf-wrapper">
                <iframe
                  src={rawUrl}
                  className="native-pdf-embed-iframe"
                  title={`原文件原生查阅 - ${name}`}
                />
              </div>
            )}
            {isPdf && viewMode === "RAW" && !rawUrl && (
              <div className="preview-loading">
                <span className="spinner-dot" />
                <span>加载原件文档中...</span>
              </div>
            )}

            {/* 2. PDF 标注模式 */}
            {isPdf && viewMode === "ANNOTATED" && (
              <div className="pdf-canvas-wrapper">
                <canvas ref={canvas} />
              </div>
            )}

            {/* 3. 图片原件 */}
            {isImage && (imageUrl || rawUrl) && (
              <div className="native-image-container">
                <img
                  src={imageUrl || rawUrl}
                  alt={name}
                  className="native-direct-image"
                />
              </div>
            )}

            {/* 4. Excel 表格 */}
            {isExcel && (
              <div className="excel-table-scroll-wrapper" ref={tableScrollContainer}>
                <table className="excel-full-grid">
                  <thead>
                    <tr>
                      <th className="excel-th-row-num">#</th>
                      {columns.map((c, colIdx) => (
                        <th
                          key={c}
                          className={
                            colIdx === columnIndex && isSourceSheet
                              ? "excel-th-highlight"
                              : ""
                          }
                          title={colIdx === columnIndex ? `当前聚焦定位列：${targetField || c}` : undefined}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rIdx) => {
                      const rowNumber = rIdx + 1;
                      const isHighlightRow =
                        resolvedRowNumber === rowNumber && isSourceSheet;
                      return (
                        <tr
                          key={rIdx}
                          ref={isHighlightRow ? selectedRow : null}
                          className={
                            isHighlightRow ? "excel-row-highlight" : ""
                          }
                        >
                          <td className="excel-td-row-num">{rowNumber}</td>
                          {columns.map((_, colIdx) => {
                            const isHighlightCell =
                              isHighlightRow && colIdx === columnIndex;
                            return (
                              <td
                                key={colIdx}
                                ref={isHighlightCell ? selectedCell : null}
                                className={
                                  isHighlightCell
                                    ? "excel-cell-highlight"
                                    : ""
                                }
                              >
                                {row[colIdx] ?? ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* 全屏放大模态框 */}
      {isFullscreenModalOpen && (
        <div
          className="preview-fullscreen-modal-backdrop"
          role="presentation"
          onClick={() => setIsFullscreenModalOpen(false)}
        >
          <div
            className="preview-fullscreen-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="原文件全屏放大查阅"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fullscreen-modal-head">
              <div className="modal-title-left">
                {isPdf ? (
                  <FileText size={18} className="text-red" />
                ) : (
                  <FileSpreadsheet size={18} className="text-green" />
                )}
                <div>
                  <strong>原文件放大查阅：{name}</strong>
                  <span className="modal-sub-tag">
                    {isPdf
                      ? `原生 PDF 全屏阅读器`
                      : `工作表：${sheet || sheets[0] || "默认"}`}
                  </span>
                </div>
              </div>

              <div className="modal-tools-right">
                <button
                  type="button"
                  className="secondary btn-sm"
                  onClick={downloadRawFile}
                >
                  <Download size={12} />
                  下载原件
                </button>
                <button
                  type="button"
                  className="icon-button modal-close-btn"
                  onClick={() => setIsFullscreenModalOpen(false)}
                  title="关闭全屏预览"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="fullscreen-modal-body">
              {isPdf ? (
                Boolean(rawUrl && rawUrl.trim().length > 0) ? (
                  <iframe
                    src={rawUrl}
                    className="fullscreen-native-pdf-iframe"
                    title={`原文件放大 - ${name}`}
                  />
                ) : (
                  <div className="preview-loading">
                    <span className="spinner-dot" />
                    <span>正在准备原文件放大查阅...</span>
                  </div>
                )
              ) : isImage && Boolean((imageUrl || rawUrl)?.trim()) ? (
                <div className="fullscreen-image-box">
                  <img src={(imageUrl || rawUrl)!} alt={name} />
                </div>
              ) : (
                <div className="fullscreen-excel-box">
                  <table className="excel-full-grid fullscreen-grid">
                    <thead>
                      <tr>
                        <th className="excel-th-row-num">#</th>
                        {columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            location.row === rIdx + 1 && isSourceSheet
                              ? "excel-row-highlight"
                              : ""
                          }
                        >
                          <td className="excel-td-row-num">{rIdx + 1}</td>
                          {columns.map((_, colIdx) => (
                            <td
                              key={colIdx}
                              className={
                                location.row === rIdx + 1 &&
                                colIdx === columnIndex &&
                                isSourceSheet
                                  ? "excel-cell-highlight"
                                  : ""
                              }
                            >
                              {row[colIdx] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
