# 26SHPYD056 P1→P2→P3→P4 审计

执行模型：`gpt-5.6-luna`；执行日期：2026-09-21。本目录只保存本样本四阶段请求/响应和审计来源。

| 阶段 | 状态 | 主要数量/结果 |
|---|---|---|
| P1 | `SUCCESS` | 委托行 9，问题 0 |
| P2 | `SUCCESS` | 逻辑查货单 1，原始行 9，问题 2 |
| P3 | `SUCCESS` | MATCHED 1 / MULTIPLE_CANDIDATES 7 / UNMATCHED 1 | 关系按行输出，未把同型号批次按数量静默合并 |
| P4 | `SUCCESS` | 字段决策 8 | 仅核验可靠 MATCHED 的 MARVELL 两批次关系 |

## 结论

本轮没有把 fact baseline、参考结果或页面预设关系当成模型结论。P3 只把型号、品牌、LOT 范围和完整覆盖都足够的 MARVELL 行建立为 MATCHED；WINBOND 同型号多行因批次与数量不能逐行闭合保留为竞争候选，LIS2DU12TR 无同身份查货行。

## 需人工处理与限制

- 查货单位未提供，P4 对 MARVELL 数量只保留当前值，不宣称完成单位可比核验。
- WINBOND 重量和查货批次数量属于不同层级或不一一对应，不能按列表位置、数量凑组或参考结果补齐关系。
- P4 只对 MARVELL 的完整两批次范围核验字段；没有 MATCHED 的行不生成字段 Patch。
