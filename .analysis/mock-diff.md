# 真实输出与 Demo 的差异

本轮完整差异及修正记录见 `demo-generated/real-calibration/SC-08-audit/INTEGRATION_REPORT.md`。

关键修正：P1/P2事实完整映射；P3/P4结果直接消费；删除型号后缀语义硬编码；查货件数不由箱号补造；保留数量/单位NO_EVIDENCE及范围毛重冲突；不可变委托基准；解绑撤销AI补值；可选空字段不标必填缺失。

只有 SC-08 被真实输出替换，其他场景仍是原基线或显式合成变体。未修改 Prompt 或模型响应。
