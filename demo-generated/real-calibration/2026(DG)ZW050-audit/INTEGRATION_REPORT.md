# 2026(DG)ZW050 P1→P2→P3→P4 审计

执行模型：`gpt-5.6-luna`；执行日期：2026-09-21。本目录只保存本样本四阶段请求/响应和审计来源，不修改 SC-08。

| 阶段 | 状态 | 主要数量/结果 |
|---|---|---|
| P1 | `NEEDS_REVIEW` | 委托行 1，问题 1 |
| P2 | `SUCCESS` | 逻辑查货单 1，原始行 1，问题 1 |
| P3 | `INVALID_INPUT` | MATCHED 0 / MULTIPLE_CANDIDATES 0 / UNMATCHED 0 |
| P4 | `INVALID_INPUT` | 字段决策 0 |

## 结论

本轮不把 `demo-generated` 的 fact baseline、参考结果或页面 expected relation 当作模型结论。未解析主体客户、查货客户未证明或候选存在竞争时，后续阶段保留不可执行/未匹配状态。

## 需人工处理与限制

- 主体委托未提供可映射客户名称，不能把样本目录客户当作模型识别结论。
- 原印刷列标题C.O.D.，不能直接认作COO；模板委托产地韩国。
- P1 未解析主体委托客户，禁止自动建立同客户关系。
- P3 没有 MATCHED 关系，P4 VERIFY_FIELDS 不可执行；不伪造字段核验。
