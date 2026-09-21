"use client";
import { useState } from "react";
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
}: {
  draft: UiDraft;
  line: UiLine;
  sources: UiSource[];
  evidence: FieldEvidence[];
  onFieldSelect: (f: FinalOutputField) => void;
}) {
  const state = useDemoStore();
  const [replacement, setReplacement] = useState("");
  const [composite, setComposite] = useState<string[]>([]);
  const [revisedModel,setRevisedModel] = useState(line.model);
  const candidates = sources.filter(
    (s) => s.customerId === draft.customerId && s.availability === "可匹配",
  );
  if (draft.finalized) return <p>已封版</p>;
  return (
    <div className="relation-actions">
      <p>当前查货依据：{line.relationSourceIds.join('、') || '未建立'}</p>
      {line.relationSourceId ? (
        <>
          <button
            className="text-button"
            onClick={() => state.unbindSelectedLine(line.id)}
          >
            解绑查货依据
          </button>
          <select
            aria-label={`改配 ${line.id}`}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          >
            <option value="">选择新依据</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.model} · {c.quantity}
              </option>
            ))}
          </select>
          <button
            disabled={!replacement}
            onClick={() => state.reassignSelectedLine(line.id, replacement)}
          >
            确认改配
          </button>
        </>
      ) : candidates.length > 1 ? (
        <>
          <select
            multiple
            aria-label={`组合 ${line.id} 查货依据`}
            value={composite}
            onChange={(e) =>
              setComposite(
                Array.from(e.currentTarget.selectedOptions, (o) => o.value),
              )
            }
          >
            {candidates.map((c) => (
              <option value={c.id} key={c.id}>
                {c.model} · {c.quantity}
              </option>
            ))}
          </select>
          <button
            disabled={composite.length < 2}
            onClick={() => state.establishCompositeForLine(line.id, composite)}
          >
            建立组合关系
          </button>
        </>
      ) : null}
      {draft.status === "人工确认中" && (
        <button
          className="primary"
          disabled={line.manuallyConfirmed}
          onClick={() => state.confirmLine(line.id)}
        >
          {line.manuallyConfirmed ? "本行已确认" : "确认本行"}
        </button>
      )}
      <details><summary>修订委托型号</summary><input aria-label={`更新 ${line.id} 委托型号`} value={revisedModel} onChange={e=>setRevisedModel(e.target.value)}/><button onClick={()=>state.updateSelectedDraftMaterial(line.id,'型号',revisedModel)}>更新委托资料</button></details>
    </div>
  );
}
