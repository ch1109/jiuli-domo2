# Phase 1：页面重构前的数据层梳理

生成日期：2026-09-21

## 当前结论

项目已经有一套较完整的领域模型和 mock 数据资产：72 个物理文件、34 个逻辑查货单、122 条查货原始行、63 个查货合并组、50 条委托原始行、1695 条字段证据。现有 `lib/domain/types.ts`` 已覆盖客户、材料批次、源文件、逻辑查货单、原始查货行、合并商品、草稿、关系、字段证据、版本、操作记录和最终核对单。

这次页面改版缺的主要不是底层事实，而是一个面向页面的“客户业务工作台读模型”：把这些对象按客户聚合，并把 P1 / P2 / P3 / P4 的处理结果、材料层级和统计口径一次性组织好。

## 当前前端数据模型缺口

1. `CustomerWorkspace` 目前直接从 `state.drafts` 与 `state.sources` 计算少量数字，缺少统一的客户摘要对象，因此材料数、委托商品数、原始查货行数、合并商品数和关系状态容易分散在组件里。
2. `UiDraft` 没有明确的委托批次对象，页面无法自然展示“主体委托书 + 发票 / 箱单 + P1 结果 + 草稿版本”。目前只能通过文件 ID 反查。
3. `UiSource` 没有把“查货 PDF → 入仓号 → 原始行 → 合并商品”的层级作为页面读模型暴露出来；逻辑单和合并组只能临时拼接。
4. P3 的 `MATCHED / MULTIPLE_CANDIDATES / UNMATCHED` 以及 `COMPLETE / PARTIAL / UNCERTAIN` 已在领域关系和模型响应中存在，但首页和客户页没有统一的关系摘要与候选详情模型。
5. P4 字段决策和证据已保存在 `FieldEvidence.modelDecision`，但任务详情页还需要按字段聚合“当前值、原始值、查货值、来源位置、AI 动作、人工修改历史”。
6. 首页统计仍使用旧的 6 项任务指标，缺少 PRD 要求的 8 项全局指标、状态分布、待办任务表和最近动态流。
7. 当前样本来源、真实模型结果、事实基线和场景变体没有在页面读模型中标出来源等级，容易把合成场景误认为真实 P1/P2/P3 输出。

## 统一 fixture 建议

```text
DemoFixture
├─ customers[]
├─ materialBatches[]
│  └─ sourceFileIds[]
├─ sourceFiles[]
├─ inspectionOrders[]
│  └─ sourceLineIds[]
├─ inspectionSourceLines[]
├─ inspectionMergedProducts[]
│  └─ sourceLineIds[]
├─ entrustmentDrafts[]
│  └─ lineIds[]
├─ entrustmentLines[]
├─ matchRelations[]
├─ fieldEvidence[]
├─ versions[]
├─ operations[]
├─ finalReconciliations[]
└─ sampleManifest[]
```

页面只消费 `selectors` 计算出的读模型，不在 React 组件内保存 `matchedCount`、`issueCount` 等业务结果。建议新增：

```ts
CustomerBusinessSummary
CustomerOverview
EntrustmentTaskCard
InspectionBatchSummary
ProductRelationSummary
TaskReviewRow
FieldEvidencePanel
```

所有数量从关联 ID 计算：委托商品行直接数 `entrustmentLines`；查货原始行直接数 `inspectionSourceLines`；查货合并商品直接数 `inspectionMergedProducts`；P3 状态从 `matchRelations` 与未建立关系的委托行计算；占用 / 核销从原始行状态计算。

## 三页组件结构

### 01 客户工作台

```text
CustomerWorkbenchPage
├─ GlobalMetrics（8 项指标 + 状态分布）
├─ CustomerOverviewMatrix
│  └─ CustomerBusinessCard（材料 → 商品 → 核对状态）
├─ TodoTaskCenter（70%）
│  └─ TaskTable
└─ RecentActivity（30%）
```

### 02 客户详情工作台

```text
CustomerDetailPage
├─ CustomerHeaderSummary
├─ CustomerDetailTabs
│  ├─ BusinessOverview
│  │  ├─ EntrustmentPool（P1 / 草稿）
│  │  ├─ InspectionPool（P2 / 合并商品）
│  │  ├─ ProductRelations（P3 列表 / 关系图切换）
│  │  └─ HumanQueue
│  ├─ EntrustmentMaterials
│  ├─ InspectionMaterials
│  ├─ ProductRelationList
│  └─ IssueQueue
└─ SourceTraceDrawer
```

### 03 委托核对任务详情

```text
EntrustmentReviewPage
├─ TaskHeader（状态、覆盖、版本、提交按钮）
├─ ReviewNavigation（商品行、问题摘要）
├─ DraftFieldGrid（25 字段分组）
└─ EvidencePanel（P1 / P2 / P3 / P4 来源与历史）
```

## 真实样本映射

`sample_manifest.json` 收录 11 套真实整单样本。当前只有 `2025YBT010-2` / 英堡科技存在可复验的同一任务内 P1→P2→P3→P4 真实模型输出，路径为 `demo-generated/real-calibration/SC-08-audit/`；其他样本是已整理的事实基线或场景数据，字段 `modelOutputStatus` 明确标为 `fact-baseline-only`。

推荐 Demo 首屏默认使用英堡样本展示真实闭环；其余样本按场景标签作为材料与事实覆盖展示，待后续补齐对应模型输出后再标记为真实 P1/P2/P3/P4。

## 实施顺序

1. 先新增只读 selectors / view-model，把现有领域对象聚合成三页需要的结构。
2. 将 `CustomerWorkspace` 拆为首页、客户详情和任务详情三个容器，沿用现有 Zustand 操作，不改 P1/P2/P3/P4 schema。
3. 首页先接全局统计、客户卡片、待办表和动态；客户详情再接双池和 P3；最后把任务详情改成三栏核对。
4. 用现有业务动作验证：匹配后原始行变为草稿占用、解除后释放、最终确认后核销；统计全部从 fixture/selectors 重算。
