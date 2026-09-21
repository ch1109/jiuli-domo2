# 2026BMH001 四步模型核对报告

模型：gpt-5.6-luna（本批次子代理顺序执行）

本套已按 P1 → P2 → P3 → P4 保存请求和响应，输入覆盖真实委托 XLS、11 份真实查货 PDF、提取产物和对应渲染页。没有把 manifest 的 fact baseline、页面预设关系或参考结果写成模型结论。

- P1：SUCCESS；11 条委托商品行。客户解析为深圳市百闽海科技有限公司。型号包括 LM2576SX-3.3/NOPB（2 行）、TXS0108EPWR（2 行）及 7 个单型号行；委托侧单位均为 PCS，产地、净重和毛重为空。
- P2：PARTIAL；11 个逻辑查货单、22 条原始商品行。所有查货抬头客户都不是请求客户：10 份显示 FUJIAN CENTERM INFORMATION CO., LTD，Arrow 文件显示 FUJIAN STAR-NET AIOT TECHNOLOGY CO., LTD。Arrow 原件标为 1–8/8，但只提供第 1–6 页；缺页范围保留为未解析范围。另保留 LM2576 同一原始行的 DE:2500 / GB:1500 产地组成，以及第 4 页两批次共享 22.6 KG 净重、29 件/板和手写 136 KGS 等范围事实。
- P3：SUCCESS；0 条 MATCHED，6 条 MULTIPLE_CANDIDATES，5 条 UNMATCHED。重复型号组（LM2576、TXS0108、TLV62569、SN74AHC1G08）均保留竞争候选；单候选型号也因查货客户未确认、检索不完整或缺少直接业务行编号而保持 UNMATCHED。没有按数量相等、文件顺序或供应商信息抢占原始行，也没有拆分原始行。
- P4：INVALID_INPUT / P3_DEPENDENCY_NOT_MET；没有 MATCHED 关系，字段决策数为 0。缺页、客户不一致和候选竞争未解决前，不执行字段核验或重量计算资格判断。

限制：本套目前只能作为待人工归属/补齐材料的模型审计结果。尤其不能将 Arrow 当前页数量合计、板标毛重或同型号数量闭合直接写入委托商品。

