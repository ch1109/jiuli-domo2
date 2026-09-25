import type { UiDraft } from "./demo-store";

export function getTaskSummary(draft: UiDraft, processing?: string) {
  const total = draft.lines.length;
  const matched = draft.lines.filter(line => line.relationSourceIds.length > 0 || !!line.relationSourceId).length;
  const issues = draft.finalized || draft.status === "已完成" ? 0 : draft.lines.filter(line => !line.manuallyConfirmed && (line.issue || line.issueIds.length > 0 || line.status === "待人工处理")).length;
  let businessStatus = "待匹配";
  let realtimeStatus = "等待查货材料";
  let nextAction = "补充查货";
  if (draft.finalized || draft.status === "已完成") {
    businessStatus = "已完成"; realtimeStatus = "已完成"; nextAction = "查看结果";
  } else if (!draft.customerId) {
    businessStatus = "异常"; realtimeStatus = "客户未识别"; nextAction = "补充客户";
  } else if (!total) {
    businessStatus = "待解析"; realtimeStatus = "等待解析材料"; nextAction = "查看材料";
  } else if (draft.status === "人工确认中") {
    businessStatus = "人工复核中"; realtimeStatus = "等待人工最终确认"; nextAction = "继续复核";
  } else if (issues) {
    businessStatus = "待人工处理"; realtimeStatus = `等待人工处理 ${issues} 行问题`; nextAction = "处理问题";
  } else if (matched === total) {
    businessStatus = "AI核对完成 · 待人工复核"; realtimeStatus = "等待人工复核"; nextAction = "去复核";
  } else if (matched > 0) {
    businessStatus = "部分核对"; realtimeStatus = `等待补充 ${total - matched} 行查货`; nextAction = "查看缺口";
  }
  return { businessStatus, realtimeStatus: processing && businessStatus !== "已完成" ? processing : realtimeStatus, nextAction, total, matched, issues };
}
