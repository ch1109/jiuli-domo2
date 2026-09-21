# 真实 Prompt 校准：只读环境与调用路径检查

检查日期：2026-09-20
检查范围：项目目录、demo-generated/real-calibration、最终 Prompt、模型调用入口与运行环境
限制：本次只读检查没有调用真实模型，没有修改 Demo 代码，也没有伪造任何 response。

## 结论

1. 项目目录和现有校准目录均存在；demo-generated/real-calibration/SC-08 不是缺目录。
2. SC-08 已保存 P1/P2 请求，但对应响应只有 {"error":"HTTP Error 401: Unauthorized"}。因此当前没有可用的真实 P1/P2 模型结论，P3/P4 未能合法开始。
3. 项目本地没有 OpenAI SDK、Responses API 调用脚本或 .env/OPENAI_API_KEY。package.json 也未声明 OpenAI 依赖；现有 API 路由 app/api/parse/route.ts 只调用本地 Python 解析器，不访问模型。
4. 当前宿主的 Codex 应用工具清单支持选择 gpt-5.6-sol（可通过 Codex 线程消息接口指定模型），但这不是项目内的 OpenAI Responses API 密钥路径。若主任务要继续真实校准，需要由主代理选择并记录一个可审计的宿主调用方案，确保每阶段仍保存原始 request.json 与真实 response.json。

## 已核实文件

- demo-generated/real-calibration/SC-08/P1-request.json：schema_version=jiuli-ai-v3、prompt=P1，英堡科技两行委托输入。
- demo-generated/real-calibration/SC-08/P1-response.json：HTTP 401 Unauthorized。
- demo-generated/real-calibration/SC-08/P2-request.json：schema_version=jiuli-ai-v3、prompt=P2，客户 C-89aa660b4b46、入仓 25120336 两条查货行。
- demo-generated/real-calibration/SC-08/P2-response.json：HTTP 401 Unauthorized。
- demo-generated/real-calibration/SC-08/README.md：明确记录模型名 gpt-5.6-sol、401 限制，以及没有 P3/P4 输出。
- 提示词文件及方案/P1_order_draft_FINAL_v3.0.txt、P2_inspection_facts_FINAL_v3.0.txt、P3_product_matching_FINAL_v3.0.txt、P4_field_verification_FINAL_v3.0.txt：四份最终 Prompt 均存在，且均要求 jiuli-ai-v3 外层、合法 JSON、不得凭空补值/计算或创建持久化 ID。
- 提示词文件及方案/九立报关单证智能核对_最终提示词方案_v3.0.md：总方案与四份最终 Prompt 的关键契约一致。
- app/api/parse/route.ts：仅执行 python3 demo-generated/scripts/parse_adapter.py，无远程模型调用。
- package.json：仅有 Next/React/Zustand 等依赖，没有 openai 包；包管理器为 pnpm@10.13.1。

## 环境事实

本次检查可见的模型/凭据相关环境变量只有 DOUBAO_API_KEY、GEMINI_API_KEY 以及 Codex 宿主元数据；没有 OPENAI_API_KEY、Azure OpenAI 变量或项目 .env 文件。因此此前 401 的最小解释是请求走了 OpenAI 兼容接口但没有合法凭据（或凭据不属于该接口），而不是素材目录不存在。

项目目录也不是 Git 仓库（git status 返回 fatal: not a git repository），这与校准文件是否存在无关。

## 对继续执行的影响

- 不应把现有 P1-response.json/P2-response.json 当作模型输出；它们是错误记录，不能进入 P3/P4 或替换 mock。
- 若采用宿主 Codex 模型入口，必须明确如何让每次阶段调用读取对应最终 Prompt 和 jiuli-ai-v3 request，并把宿主返回的原始 JSON 原样落盘；不能把线程摘要、手写结论或二次改写当作 response。
- 在 P1、P2 均获得真实成功响应前，不应生成 P3/P4 或更新核心 mock。若 P2 缺失，必须记录缺失而不是自行编造；本项目当前确实存在 P2 Prompt 文件和 SC-08 P2 request，因此不属于 P2 缺失。

## 给主代理的建议

1. 先解决模型调用通道/认证问题：确认可审计的 gpt-5.6-sol 宿主调用方式，或让用户提供合法 OpenAI 兼容 API 凭据/端点。
2. 继续使用 SC-08 作为最小完整代表场景：P1 两行英堡委托 + P2 入仓 25120336 两条查货原始行，便于先验证链路和落盘格式。
3. 成功后严格按 P1 → P2 → P3 → P4；每阶段保存请求和真实响应，确定性转换仅做契约允许的 ID/关系/状态回填，不把模型判断重新硬编码进 mock。
