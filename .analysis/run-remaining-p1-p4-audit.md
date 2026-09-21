# 剩余真实样本 P1→P2→P3→P4 模型核对任务

你是独立执行模型 `gpt-5.6-sol`。请在当前仓库完成剩余 10 套真实样本的完整模型核对，并留下可复验的审计产物。不要改写四份最终 Prompt，不要把已有 fact baseline、reviewed relation、场景 expectedRelations 或页面结果当作模型结论。

## 必须读取

1. `AGENTS.md`
2. `.analysis/agent-prompts.md`
3. `提示词文件及方案/P1_order_draft_FINAL_v3.0.txt`
4. `提示词文件及方案/P2_inspection_facts_FINAL_v3.0.txt`
5. `提示词文件及方案/P3_product_matching_FINAL_v3.0.txt`
6. `提示词文件及方案/P4_field_verification_FINAL_v3.0.txt`
7. `demo-generated/real-calibration/SC-08-audit/` 的八份请求/响应、provenance 和报告，作为文件格式与审计方式参考；不得复制其业务结论。
8. `demo-generated/sample_manifest.json`、对应 `demo-generated/manifests/*.json`、`demo-generated/extracted/*.json`、必要的 `demo-generated/renders/` 页面与 `真实整单样本/` 原件。

## 样本范围

- `2026(DG)ZW001`
- `2026(DG)ZW003`
- `2026(DG)ZW050`
- `2026ACSY003`
- `2026AG001`
- `2026BMH001`
- `2026CNKJ001`
- `26SHPYD056`
- `多对多样例`
- `英卡-抽+整`

## 执行要求

对每个样本，在 `demo-generated/real-calibration/<sample-id>-audit/` 创建：

- `P1-request.json` / `P1-response.json`
- `P2-request.json` / `P2-response.json`
- `P3-request.json` / `P3-response.json`
- `P4-request.json` / `P4-response.json`
- `provenance.json`
- `INTEGRATION_REPORT.md`

必须逐套按 P1 → P2 → P3 → P4 顺序执行。前一步失败时，后一步也要保留合法的 jiuli-ai-v3 错误/不可执行响应和原因，不得补造成功结果。

- P1 只从一份主体委托扩行，辅助材料不扩行。`多对多样例` 若确实没有可读主体委托，应如实返回无法生成委托行，后续阶段不得虚构委托商品。
- P2 保留每个逻辑查货单和每条原始商品，未知客户或归属冲突不得强配。
- P3 候选只能来自同客户且检索完整的可用原始行；数量相同、顺序相同或事实基线的预设关系不能单独证明匹配。不得重复占用原始行。
- P4 仅对 P3 的可靠关系执行 `VERIFY_FIELDS`；没有可靠关系时要如实保留不可核验状态。不要为了让页面“完整”而改写模型结论。
- 每个非空事实、关系依据和字段决策都保留可回溯的文件、页/表、行列或原始文本引用。
- 响应外层必须保留 `schema_version`、`prompt`、`request_id`、`output`；处理状态、枚举和引用符合四份正式 Prompt。

## 批次验收与接入

1. 新增通用只读校验脚本 `demo-generated/scripts/verify_all_model_audits.py`：检查 10 套八份 JSON 的外层契约、阶段顺序、request_id、P1→P3 和 P2→P3 稳定 ID/事实引用、P3 不重复占用、P4 与 P3 关系一致、证据引用存在、源文件和产物 SHA-256。
2. 写 `demo-generated/real-calibration/REMAINING_SAMPLES_REPORT.md`，列出每套各阶段状态、委托行数、查货原始行数、P3 三种关系数量、P4 决策数量、需人工处理项和限制。
3. 更新 `demo-generated/sample_manifest.json`：只有确实完成且校验通过的样本才改成 `real-calibration-p1-p4` 并写入 8 个产物路径；失败/不可执行样本使用准确状态，不能标成功。
4. 页面侧先不要大改业务动作。若需要让客户工作台读取多套结果，只做小而通用的 fixture/index 接入；保留 SC-08 当前回放行为。
5. 运行校验脚本、相关 Python 测试、`pnpm test`、`pnpm typecheck`、`pnpm lint`。不得修改真实原件、最终 Prompt 或现有 SC-08 八份请求响应。

完成后在最终答复中给出准确的成功/失败数量、核心模型结论、产物路径和测试结果。不要只写计划，持续执行到产物和校验完成。
