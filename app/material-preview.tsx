"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceLocation } from "@/lib/domain/types";
import { getLocalMaterial } from "@/lib/demo-store";
import {ChevronLeft,ChevronRight} from 'lucide-react';

export function MaterialPreview({
  location,
  name,
}: {
  location: SourceLocation;
  name: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const selected = useRef<HTMLTableCellElement>(null);
  const documentScroll = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState(location.sheet ?? "");
  const [rows, setRows] = useState<string[][]>([]);
  const [columns,setColumns]=useState<string[]>([]);
  const [page, setPage] = useState(location.page ?? 1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const pdf = name.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    async function load() {
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
        setError('');
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
          if(page>doc.numPages)throw new Error('证据页码超出原文件页数');
          const p = await doc.getPage(page);
          const viewport = p.getViewport({ scale: 1.4 });
          if (!canvas.current || cancelled) return;
          canvas.current.width = viewport.width;
          canvas.current.height = viewport.height;
          await p.render({ canvasContext: canvas.current.getContext('2d')!, viewport }).promise;
          if (location.bounds && page === location.page) {
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
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "array" });
          if(sheet && !workbook.Sheets[sheet])throw new Error('原文件中没有记录的工作表');
          const chosen = workbook.Sheets[sheet]
            ? sheet
            : workbook.SheetNames[0];
          if (!cancelled) {
            setSheets(workbook.SheetNames);
            const range=workbook.Sheets[chosen]['!ref'];
            setColumns(range ? Array.from({length:XLSX.utils.decode_range(range).e.c+1},(_,i)=>XLSX.utils.encode_col(i)):[]);
            setRows(
              XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[chosen], {
                header: 1,
                raw: false,
                defval: "",
                range: 0,
              }),
            );
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
    };
  }, [location, pdf, page, sheet]);
  useEffect(() => {
    const cell=selected.current;const container=documentScroll.current;
    if(cell&&container){const a=cell.getBoundingClientRect();const b=container.getBoundingClientRect();container.scrollTop+=a.top-b.top-container.clientHeight/2;container.scrollLeft+=a.left-b.left-container.clientWidth/2;}
  }, [rows]);
  const columnIndex =
    (location.column ?? "")
      .toUpperCase()
      .split("")
      .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const isSourceSheet=!location.sheet||(sheet||sheets[0])===location.sheet;
  return (
    <div className="material-preview">
      <div className="preview-controls">
        {pdf ? (
          <>
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="上一页"
            >
              <ChevronLeft size={14}/>
            </button>
            <span>
              第 {page} / {pages} 页
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              aria-label="下一页"
            >
              <ChevronRight size={14}/>
            </button>
          </>
        ) : (
          <select
            aria-label="工作表"
            value={sheet || sheets[0] || ""}
            onChange={(e) => setSheet(e.target.value)}
          >
            {sheets.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
      <small>
        {pdf
          ? location.bounds
            ? "已高亮原文位置"
            : location.page ? "仅定位到页" : "未记录页码，显示第一页"
          : isSourceSheet && location.row && location.column
            ? `定位 ${location.column}${location.row}`
            : "缺少单元格坐标"}
      </small>
      {loading && <p>正在载入原文件…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="preview-document" ref={documentScroll}>
        {pdf ? (
          <canvas ref={canvas} aria-label="PDF 原文件预览" />
        ) : (
          <table>
            <thead><tr><th></th>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  <th>{r + 1}</th>
                  {row.map((value, c) => (
                    <td
                      key={c}
                      ref={
                        isSourceSheet && r + 1 === location.row && c === columnIndex
                          ? selected
                          : undefined
                      }
                      className={
                        isSourceSheet && r + 1 === location.row && c === columnIndex
                          ? "source-highlight"
                          : ""
                      }
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
