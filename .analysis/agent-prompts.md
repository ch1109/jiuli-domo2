# Prompt 驱动校准前的目录与业务分析

> 只读检查结果；本文件不新增业务规则。真实规则以用户本轮要求和项目最终文档为准。

## 1. 已确认结论

- 最终方案和 P1、P2、P3、P4 四份最终 Prompt 均存在，接口版本统一为 jiuli-ai-v3。
- P2 明确存在：提示词文件及方案/P2_inspection_facts_FINAL_v3.0.txt，因此完整链路必须按 P1 → P2 → P3 → P4，不能跳过或自行编造 P2。
- 仓库已有 demo-generated/real-calibration/SC-08，但其中 P1/P2 response.json 都是 HTTP 401 Unauthorized；没有合法模型输出，不能当真实校准结果，也不能据此进入 P3/P4。
- 最适合继续做完整真实校准的代表性场景是 SC-08 / CASE-08：英堡科技两条委托行，对应同一入仓号 25120336 下两条查货原始行；订单、查货、来源和现有 mock 均齐全。

## 2. 用户本轮要求（与文档内容区分）

用户要求暂停继续扩展 Demo，完整阅读目录，按 jiuli-ai-v3 构造 P1～P4 输入，使用 GPT-5.6 Sol 和最终 Prompt 实际执行完整链路，保存每阶段 request.json/response.json，只对模型结果做系统职责范围内的确定性转换，再替换或校准 mock，并记录业务理解偏差。不得重写 Prompt、不得迁就页面篡改模型结论；P2 存在时不得跳过。

本文件只记录分析，不代表已经完成模型调用或 mock 替换。

## 3. 最终方案与四阶段职责

来源：提示词文件及方案/九立报关单证智能核对_最终提示词方案_v3.0.md。

统一请求/响应外层都保留 schema_version、prompt、request_id、context、input/output；schema_version 固定 jiuli-ai-v3。模型只返回业务语义和局部引用，持久化行 ID、证据键、范围、依赖、版本和状态由程序维护。

### P1：委托事实

- 文件：提示词文件及方案/P1_order_draft_FINAL_v3.0.txt。
- 输入：customer_directory、normalization、恰好一份 ORDER，可有零到多份 INVOICE/PACKING_LIST。
- 输出：processing_status、customer_resolution、read_status、rows、scope_records、unlinked_records、issues。
- 按主体委托原始行顺序输出 25 列初始事实；每个非空值要有来源；不从辅助品名扩行，不做价格/数量/重量反推或累计。

### P2：查货事实与范围

- 文件：提示词文件及方案/P2_inspection_facts_FINAL_v3.0.txt。
- 输入：customer_id 和 files（file_id、segments、content）。
- 输出：processing_status、customer_id、read_status、logical_inspections、raw_rows、scope_records、issues。
- 以可靠八位入仓号划分逻辑单，完整保存每条原始商品、产地候选、人工标记、包装/重量范围；不判断委托关系、不合并、不累计、不分配。

### P3：关系裁决

- 文件：提示词文件及方案/P3_product_matching_FINAL_v3.0.txt。
- 输入：customer_id、retrieval_complete、order_rows、inspection_candidates、系统生成的 proposed_groups/comparison_results。
- 仅在同客户、未核销、未被其他草稿占用的候选中判断。证据优先直接业务编号、唯一物料号、双向唯一型号，再用 PO/料号/SKU/DC/LOT/箱号消歧；数量相等、文件顺序、供应商、产地、净重单独不能证明关系。
- 输出每条委托行一项 row_relation，状态 MATCHED/MULTIPLE_CANDIDATES/UNMATCHED，覆盖 COMPLETE/PARTIAL/UNCERTAIN；不得切分原始行或重复占用同一 raw_row_id。

### P4：字段核验/计算资格

- 文件：提示词文件及方案/P4_field_verification_FINAL_v3.0.txt。
- context.mode 只能为 VERIFY_FIELDS 或 ASSESS_CALCULATION。
- VERIFY_FIELDS 只处理 evaluated_fields，返回 KEEP/FILL/UPDATE/CONFLICT/MISSING/NO_ACTION 决策及证据/问题引用；未请求字段不能被清空或重算。
- ASSESS_CALCULATION 只判断重量组资格，不输出计算数值；通过后由代码计算，再以 VERIFY_FIELDS 消费派生证据。

## 4. SC-08 真实素材与现有 mock

### 真实素材

- 客户：英堡科技（深圳）有限公司，客户 ID C-89aa660b4b46。
- 委托文件 F-3c3cc10bd26b：真实整单样本/2025YBT010-2/委托文件/2件.xlsx，Sheet 12-10-2。
  - 原表第 7 行：SK HYNIX，型号 H25G9TCXXCX702A#9，品名晶圆，产地韩国，单位个，数量 12081，单价 4.1，总价缓存 49532.1，USD，件数 1，净重 3.6，毛重 4.2。
  - 原表第 8 行：SK HYNIX，型号 D25G9TCX8CX239C#D，品名晶圆，产地韩国，单位个，数量 16054，单价 2.9，总价缓存 46556.6，USD，件数 1，净重 4.4，毛重 5。
- 查货文件 F-8bc7177252aa：真实整单样本/2025YBT010-2/查货文件/1765426942103.pdf，第 1 页，入仓号 25120336。
  - 原始行 1：SK HYNIX / H25G9TCXXCX702A / KOREA / 12081 / 净重 3.60 / 毛重 4.20。
  - 原始行 2：SK HYNIX / D25G9TCX8CX239C / KOREA / 16054 / 净重 4.40 / 毛重 5.00。
  - 文件还出现表格合计毛重 9.20 与入仓章毛重 9 KG；这是范围级事实，不能直接复制到任一商品行。

### 当前 mock/fixture

- lib/demo-store.ts 从 demo-generated/mock/*.json 加载客户、草稿、委托行、查货行、文件、场景、关系和证据；lib/domain/types.ts 集中定义 25 列和业务对象，lib/domain/status.ts 推导中文状态。
- 草稿 D-3c3cc10bd26b 有 2 行，客户已识别，初始状态待核对；两条委托行保留后缀型号和委托侧字段，初始为暂无查货依据。
- 逻辑查货单 I-8bc7177252aa-25120336 含两条原始查货行；inspection-groups.json 为每行独立组。
- reviewed-relations.json 已手写两条逐行关系，并注明 #9/#D 后缀差异需后续规则或人工确认。
- scenarios.json 的 SC-08 初始批次是 B-I-8bc7177252aa-25120336 与 B-D-3c3cc10bd26b；SC-21 复用该链路做 25 列最终输出验收。
- scenario-overrides.json 的 OV-EXACT-MODEL 去掉委托型号后缀，仅是演示副本变体，不是真实原件事实，不能当作模型输出回写基线。

## 5. 需要真实输出验证的偏差候选

1. 旧 SC-08 请求虽已保存，但 response 为 401；不能据此推断模型结论，也未进入 P3/P4。
2. 当前 reviewed-relations 和场景 expectedRelations 直接写死逐行关系；真实 P3 必须根据候选和证据决定状态，不能因数量相等或列表唯一就自动 MATCHED。
3. OV-EXACT-MODEL 改写委托型号；最终 Prompt 要求原始型号保留，归一化只用于关系判断。若后缀等价缺少独立证据，应保留待处理状态或报告 MODEL_DISCREPANCY，不能静默改值。
4. 9 KG 入仓章和 9.20 KG 表格合计是范围级重量，不能与行级 4.20/5.00 混成同一证据层级，也不能把整票重量复制到商品行。
5. KOREA 与韩国、查货单位空/UNKNOWN 与委托单位个需通过统一 normalization；不能在 mock 中凭常识补写并假称模型识别。
6. P4 是按 evaluated_fields 的增量决策，不是把整行 25 列重新生成；未请求字段和历史问题必须保留。
7. AI 匹配成功只对应“已找到查货依据”，不等于人工已确认、最终完成或正式核销。

## 6. 后续完整链路的最小执行顺序

1. 用 F-3c3cc10bd26b 真实抽取内容构造 P1，保存 request/response 原文。
2. 将合法 P1 输出经确定性分配系统行 ID，再用 F-8bc7177252aa 构造 P2，保存 request/response。
3. 程序生成候选快照、证据键和比较结果，调用 P3；不把 reviewed-relations 直接当结论。
4. 对 P3 可靠关系按受影响字段构造 P4 VERIFY_FIELDS；只有确需重量派生时才先调用 ASSESS_CALCULATION。
5. 仅将合法、可追溯、枚举和引用均有效的模型输出转换为 fixture；保留原始响应、转换记录和发现的偏差。

## 7. 当前限制

- 本文件未调用模型，也未替换 mock。
- 仓库现有 SC-08 校准因 HTTP 401 失败；在调用凭证/环境恢复前，不能声称本轮真实校准完成。
- 文档中的待执行验收标准、手写 expectedRelations、以及 OV-EXACT-MODEL 变体均不能被误称为 GPT-5.6 Sol 真实输出。

