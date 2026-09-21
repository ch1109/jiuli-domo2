# 剩余真实样本 P1→P2→P3→P4 模型核对报告

执行日期：2026-09-21。执行模型：`gpt-5.6-luna`。契约：`jiuli-ai-v3`。

本轮对剩余 10 套真实样本逐套执行并保存 P1、P2、P3、P4 请求与响应。四步均产生审计文件不等于四步均成功；当主体委托、客户归属或可靠商品关系不足时，后续阶段按契约返回 `INVALID_INPUT`，没有用事实基线、参考结果或场景预设关系补造结论。

| 样本 | P1 | P2 | P3 | P4 | 委托行 | 查货原始行 | P3：匹配 / 多候选 / 未匹配 | P4 决策 |
|---|---|---|---|---|---:|---:|---:|---:|
| 2026(DG)ZW001 | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | INVALID_INPUT | 6 | 6 | 0 / 0 / 0 | 0 |
| 2026(DG)ZW003 | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | INVALID_INPUT | 5 | 6 | 0 / 0 / 0 | 0 |
| 2026(DG)ZW050 | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | INVALID_INPUT | 1 | 1 | 0 / 0 / 0 | 0 |
| 2026ACSY003 | SUCCESS | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | 4 | 4 | 0 / 0 / 4 | 0 |
| 2026AG001 | SUCCESS | SUCCESS | SUCCESS | INVALID_INPUT | 2 | 2 | 0 / 2 / 0 | 0 |
| 2026BMH001 | SUCCESS | PARTIAL | SUCCESS | INVALID_INPUT | 11 | 22 | 0 / 6 / 5 | 0 |
| 2026CNKJ001 | SUCCESS | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | 1 | 1 | 0 / 0 / 1 | 0 |
| 26SHPYD056 | SUCCESS | SUCCESS | SUCCESS | SUCCESS | 9 | 9 | 1 / 7 / 1 | 8 |
| 多对多样例 | NEEDS_REVIEW | SUCCESS | INVALID_INPUT | INVALID_INPUT | 0 | 57 | 0 / 0 / 0 | 0 |
| 英卡-抽+整 | INVALID_INPUT | NEEDS_REVIEW | INVALID_INPUT | INVALID_INPUT | 0 | 12 | 0 / 0 / 0 | 0 |

合计读取 39 条委托商品和 120 条查货原始行；连同既有 SC-08 的 2 条委托与 2 条查货，覆盖数据资产中的 50 条委托商品里的 41 条可读主体委托、以及全部 122 条查货原始行。英卡样本有三份独立委托，按 P1“恰好一份主体委托”的输入约束被阻断；多对多样例的委托表只有附件占位，无法生成委托商品行。

## 主要模型结论

- `26SHPYD056` 是本轮唯一完整进入 P4 的样本。MARVELL 委托行由两条查货原始行完整覆盖，形成 1 条 `MATCHED`；模型对品牌、型号、产地、单位、数量、净重、毛重和入仓号作出 8 项决策。其余 7 行为多候选，1 行未找到可靠对应。
- `2026AG001` 两条同型号委托对应同一查货材料，缺少可证明的一一关系，均保留为多候选。
- `2026BMH001` 的查货资料不完整且客户/商品证据存在竞争，6 行多候选、5 行未匹配，没有进入字段自动核验。
- `2026ACSY003`、`2026CNKJ001` 均没有建立可靠关系；客户或查货归属证据不足时不凭目录名强配。
- 三套东莞智微样本的主体委托没有可映射客户名称，因此 P3 被阻断；P2 仍完整保留查货事实、共享重量和 COD/COO 差异。
- `英卡-抽+整` 需要先把三份独立委托拆成三个 P1 任务；`多对多样例` 需要取得真实主体委托附件，之后才可继续关系核对。

## 复验

运行：

```sh
python3 demo-generated/scripts/verify_all_model_audits.py
```

校验器检查 10 套阶段外层契约、请求响应 ID、阶段状态、80 份产物哈希、审计时源文件哈希、P1/P2 到 P3 的稳定 ID、P3 原始行不重复占用、P4 与 P3 关系一致，以及 P4 证据和问题引用。`sample_manifest.json` 是审计完成后更新的可变索引，其审计时哈希保留在各 provenance 中，不按当前文件哈希判失败。
