"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceLocation } from "@/lib/domain/types";
import { getLocalMaterial } from "@/lib/demo-store";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MaterialPreview({
  location,
  name,
}: {
  location: SourceLocation;
  name: string;
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

  const lowerName = name.toLowerCase();
  const pdf = lowerName.endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(lowerName);

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

        if (pdf) {
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
          const viewport = p.getViewport({ scale: 1.4 });
          if (!canvas.current || cancelled) return;
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
              ctx.fillStyle = "rgba(255,195,0,.3)";
              ctx.fillRect(
                x * viewport.width,
                y * viewport.height,
                w * viewport.width,
                h * viewport.height,
              );
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

          // 优先使用记录的 sheet，若不存在则回退到首个可用 sheet
          const chosen = (sheet && workbook.Sheets[sheet])
            ? sheet
            : sheetNames[0];

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
          setError(e instanceof Error ? e.message : "预览失败");
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
  }, [location.fileId, pdf, isImage, page, sheet]);

  // 滚动定位到选中单元格或选中整行
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

  const columnIndex =
    location.column
      ? location.column
          .toUpperCase()
          .split("")
          .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
      : -1;

  const isSourceSheet = !location.sheet || (sheet || sheets[0]) === location.sheet;

  return (
    <div className="material-preview">
      {(pdf || isImage || sheets.length > 1) && (
        <div className="preview-controls">
          {pdf ? (
            <>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="上一页"
              >
                <ChevronLeft size={14} />
              </button>
              <span>
                第 {page} / {pages} 页
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="下一页"
              >
                <ChevronRight size={14} />
              </button>
            </>
          ) : isImage ? (
            <span>图片原件预览</span>
          ) : (
            <label className="sheet-selector" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#77857d" }}>工作表：</span>
              <select
                aria-label="工作表"
                value={sheet || sheets[0] || ""}
                onChange={(e) => setSheet(e.target.value)}
              >
                {sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <small>
        {pdf
          ? location.bounds
            ? "已高亮原文位置"
            : location.page
              ? `已定位至第 ${page} 页`
              : "显示第 1 页（原文件浏览）"
          : isImage
            ? "已载入原文件图像"
            : isSourceSheet && location.row && columnIndex >= 0
              ? `定位 ${location.column}${location.row}`
              : isSourceSheet && location.row
                ? `已定位至第 ${location.row} 行`
                : "原文件对照浏览"}
      </small>

      {loading && <p>正在载入原文件…</p>}
      {error && <p role="alert">{error}</p>}

      <div className="preview-document" ref={documentScroll}>
        {pdf ? (
          <canvas ref={canvas} aria-label="PDF 原文件预览" />
        ) : isImage ? (
          imageUrl && (
            <img
              src={imageUrl}
              alt={name}
              style={{ maxWidth: "100%", height: "auto", display: "block" }}
            />
          )
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => {
                const isCurrentRow = isSourceSheet && r + 1 === location.row;
                const hasSpecificCell = isCurrentRow && columnIndex >= 0;
                return (
                  <tr
                    key={r}
                    ref={isCurrentRow && !hasSpecificCell ? selectedRow : undefined}
                    className={isCurrentRow && !hasSpecificCell ? "source-row-highlight source-highlight" : ""}
                  >
                    <th>{r + 1}</th>
                    {row.map((value, c) => {
                      const isTargetCell = isCurrentRow && c === columnIndex;
                      return (
                        <td
                          key={c}
                          ref={isTargetCell ? selectedCell : undefined}
                          className={isTargetCell ? "source-highlight" : ""}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
