# Demo 只读校准分析（inspect_demo）

## 结论

- real-calibration/SC-08 的 P1、P2 response 均只有 HTTP Error 401: Unauthorized，没有合法模型业务输出。
- 本次没有调用模型、没有伪造结果，也没有修改代码或 mock；不能把该 response 当作 P1/P2 事实，因而没有依据进入 P3/P4。
- SC-08 的“唯一可靠候选”关系来自 demo-generated/mock/scenarios.json 的 expectedRelations，以及 reviewed-relations 的 inactive 分析预期；初始 match-relations.json 为空。
- OV-EXACT-MODEL 是场景副本变体，把委托型号的 #9/#D 后缀改成查货基础型号；不是模型判断，也不是通用匹配规则。

## SC-08 代表性完整场景与素材

- 场景：SC-08 / CASE-08，样本 2025YBT010-2；委托两行，查货入仓号 25120336 两行。
- 委托主体：真实整单样本/2025YBT010-2/委托文件/2件.xlsx，文件 F-3c3cc10bd26b，工作表 12-10-2，第 7、8 行。
- 查货材料：真实整单样本/2025YBT010-2/查货文件/1765426942103.pdf，文件 F-8bc7177252aa，第 1 页。
- 参考结果：真实整单样本/2025YBT010-2/核对单/参考结果.xlsx，文件 F-e70c3bd328c2，角色是 reference，不是 P1/P2 原始输入。

### 委托基线事实

- 客户英堡科技（深圳）有限公司，客户 ID C-89aa660b4b46。
- R007：SK HYNIX；型号 H25G9TCXXCX702A#9；品名晶圆；产地韩国；单位个；数量 12081；单价 4.1；总价 49532.1；USD；件数 1；净重 3.6；毛重 4.2。
- R008：SK HYNIX；型号 D25G9TCX8CX239C#D；品名晶圆；产地韩国；单位个；数量 16054；单价 2.9；总价 46556.6；USD；件数 1；净重 4.4；毛重 5。
- 其余选填字段是 UNKNOWN；上述值与 manifests/2025YBT010-2.json 逐项一致。

### 查货基线事实

- 逻辑查货单 I-8bc7177252aa-25120336，客户同为 C-89aa660b4b46；初始 unloaded、未占用、未核销。
- L001：SK HYNIX；型号 H25G9TCXXCX702A（无 #9）；产地原文 KOREA；数量 12081；单位 UNKNOWN；件数 1；净重 3.60；毛重 4.20。
- L002：SK HYNIX；型号 D25G9TCX8CX239C（无 #D）；产地原文 KOREA；数量 16054；单位 UNKNOWN；件数 1；净重 4.40；毛重 5.00。
- 两行分别形成独立三键展示组；记录同时存在表格毛重合计 9.20 KG 与入仓章 9 KG。

## 当前 mock 与状态实现

- build_mock.py 从 manifests 生成委托、查货、来源和 evidence；参考结果没有进入原始委托或查货事实。
- scenario_loader.py 只复制基线并应用白名单变体，不执行关系、占用、版本或核销；运行时初始 loadedBatchIds、matchRelations、history、finalOrders 均为空。
- scenarios.json 的 SC-08 expectedRelations 把两条委托行分别指向两条查货原始行，依据文字明确保留 #9/#D 差异并要求后续规则或人工确认；这是验收配方，不是模型输出。
- lib/demo-store.ts 只把静态 mock 映射成 UI 状态；lib/domain/actions.ts 与 status.ts 在后续动作中创建关系、占用并推导状态，基线事实和业务动作状态分离。

## 与最终 Prompt 的已确认偏差/风险

1. 真实校准缺失：请求外层虽按 jiuli-ai-v3 构造，但 response 不含合法 schema_version、prompt、request_id、output。
2. 关系被配方预先写出：P3 要求根据候选、retrieval_complete、竞争和证据判断 MATCHED/MULTIPLE_CANDIDATES/UNMATCHED；当前 expectedRelations 直接写死关系，且 OV-EXACT-MODEL 先改型号，绕过真实判断。
3. 后缀不是通用规则：P3 要求未确认前后缀业务含义时保留 MODEL_DISCREPANCY，不能静默改型号；当前去后缀只能作为显式场景变体。
4. P4 未执行：没有 P4 request/response，不能知道字段 action（KEEP/FILL/UPDATE/CONFLICT/MISSING）或核验状态。
5. 产地需保留原文与标准化边界：委托是韩国、查货是 KOREA；P1/P2 保存原文，程序才按 normalization 标准化，不能在无模型输出时擅自标绿。
6. 重量冲突需保留：9.20 与 9 KG 两个范围来源不能静默覆盖；P4 禁止把逻辑单总毛重直接复制到商品行。
7. 查货单位 UNKNOWN 不能猜成个；P4 对当前已有单位且查货缺单位应 KEEP+NO_EVIDENCE。
8. 参考结果隔离是正确的：validate.py 明确拒绝 reference/auxiliary 作为 inspection 或 original entrustment 输入。

## 未确认项

- 401 的具体原因（凭据、端点、权限或环境变量）本次只读检查无法确定。
- P3/P4 真实模型决策、retrieval_complete、候选数量和字段决策均未知，不能从 expectedRelations 推断。
- OV-EXACT-MODEL 不代表产品已批准去后缀 normalization。
- 9 KG 与 9.20 KG 的最终处理需真实 P4 输出、确定性规则和人工策略共同决定。

## 后续边界

- 修复 GPT-5.6 Sol 调用后，应原样重试已保存的 SC-08 P1/P2 request，再按 P1→P2→P3→P4 保存合法 request/response。
- 只有合法 response 落盘后，才可将模型结论经确定性 ID、来源和标准化转换成 fixture；不得用 expectedRelations、reviewed-relations 或参考结果替代模型输出。
