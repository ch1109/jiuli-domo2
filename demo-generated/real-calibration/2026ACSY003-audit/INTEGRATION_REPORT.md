# 2026ACSY003 P1→P2→P3→P4 审计

执行模型：`gpt-5.6-luna`；执行日期：2026-09-21。本目录只保存本样本四阶段请求/响应和审计来源，不修改 SC-08。

| 阶段 | 状态 | 主要数量/结果 |
|---|---|---|
| P1 | `SUCCESS` | 委托行 4，问题 0 |
| P2 | `NEEDS_REVIEW` | 逻辑查货单 1，原始行 4，问题 3 |
| P3 | `SUCCESS` | MATCHED 0 / MULTIPLE_CANDIDATES 0 / UNMATCHED 4 |
| P4 | `INVALID_INPUT` | 字段决策 0 |

## 结论

本轮不把 `demo-generated` 的 fact baseline、参考结果或页面 expected relation 当作模型结论。未解析主体客户、查货客户未证明或候选存在竞争时，后续阶段保留不可执行/未匹配状态。

## 需人工处理与限制

- 查货材料客户为 UNKNOWN，未证明属于当前客户。
- 页内未显示委托客户；右侧手写为COD而非明确COO；重量是每两行共享且未区分净毛。
- P3 没有 MATCHED 关系，P4 VERIFY_FIELDS 不可执行；不伪造字段核验。
