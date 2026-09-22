"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  location: SourceLocation;
  name: string;
  files?: Array<{ id: string; name: string; materialType: string }>;
  activeFileId?: string;
  onSelectFile?: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const selectedCell = useRef<HTMLTableCellElement>(null);
  const selectedRow = useRef<HTMLTableRowElement>(null);
  const documentScroll = useRef<HTMLDivElement>(null);

  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState(location.sheet ?? "");
  const [rows, setRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [page, setPage] = useState(location.page ?? 1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 模式切换：RAW (原生文件流查阅) vs ANNOTATED (AI标注定位)
  const [viewMode, setViewMode] = useState<"RAW" | "ANNOTATED">("RAW");

  // 缩放与放大弹窗
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);

  // 原文件可访问链接
  const [rawUrl, setRawUrl] = useState<string>("");

  const lowerName = name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(lowerName);
  const isExcel = /\.(xlsx|xls|csv)$/i.test(lowerName);

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
                ctx.fillStyle = "rgba(255,195,0,.35)";
                ctx.fillRect(
                  x * viewport.width,
                  y * viewport.height,
                  w * viewport.width,
                  h * viewport.height,
                );
                ctx.strokeStyle = "#eab308";
                ctx.lineWidth = 2;
                ctx.strokeRect(
                  x * viewport.width,
                  y * viewport.height,
                  w * viewport.width,
                  h * viewport.height,
                );
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
  }, [location.fileId, isPdf, isImage, page, sheet, zoomScale]);

  // 滚动定位到选中单元格或行
  useEffect(() => {
    const targetElement = selectedCell.current || selectedRow.current;
    const container = documentScroll.current;
    if (targetElement && container) {
      const a = targetElement.getBoundingClientRect();
      const b = container.getBoundingClientRect();
      container.scrollTop += a.top - b.top - container.clientHeight / 2;
      if (selectedCell.current) {
        container.scrollLeft += a.left - b.left - container.clientWidth / 2;
      }
    }
  }, [rows, location.row]);

  // 下载原文件
  const downloadRawFile = () => {
    if (!rawUrl) return;
    const a = document.createElement("a");
    a.href = rawUrl;
    a.download = name;
    a.click();
  };

  const columnIndex = location.column
    ? location.column
        .toUpperCase()
        .split("")
        .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
    : -1;

  const isSourceSheet = !location.sheet || (sheet || sheets[0]) === location.sheet;

  return (
    <div className="material-preview-v2">
      {/* 顶部主工具栏：材料选择与快捷动作 */}
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
            {isPdf && viewMode === "RAW" && (
              <div className="raw-pdf-wrapper">
                <iframe
                  src={rawUrl}
                  className="native-pdf-embed-iframe"
                  title={`原文件原生查阅 - ${name}`}
                />
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
              <div className="excel-table-scroll-wrapper">
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
                        location.row === rowNumber && isSourceSheet;
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
                <iframe
                  src={rawUrl}
                  className="fullscreen-native-pdf-iframe"
                  title={`原文件放大 - ${name}`}
                />
              ) : isImage && (imageUrl || rawUrl) ? (
                <div className="fullscreen-image-box">
                  <img src={imageUrl || rawUrl} alt={name} />
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
