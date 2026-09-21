# SC-08 真实 Prompt 校准记录

- 模型：`gpt-5.6-sol`
- 契约：`jiuli-ai-v3`
- 独立执行：`run_sol_audit`
- 审计编号：`SC08-AUDIT-20260920`
- 顺序：P1 → P2 → P3 → P4，四阶段均 `SUCCESS`
- 来源与文件哈希：见 `provenance.json`

关键结论：查货描述中的 `64GB INK DIE (#9)` / `(#D)` 是委托型号后缀的明确业务行标记。P3 为两行建立 `MATCHED + COMPLETE` 关系；P4 保留品牌、型号、产地、单位、数量和净毛重，只补入仓号 `25120336`。旧的 401 响应已由本次独立真实输出替换。
