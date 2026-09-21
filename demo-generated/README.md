# Phase -1 数据资产

本目录是“真实样本 → Mock 数据基线”，不包含页面工程或业务动作实现。所有真实样本只读。Mock 保留本地真实业务名称、编号、价格；未把联系人、电话、地址等个人资料导入商品事实。`extracted/`、`renders/` 是本地原件识读缓存，含未脱敏原文和页面，不属于后续页面加载的数据。

## 从哪里看

- `source_inventory.json`、`SAMPLE_ANALYSIS.md`：先建立的样本盘点，包含物理文件与单证统计、歧义、重复材料和原始行数。
- `manifests/`：11套样本的逐行事实、单元格/页码、共享重量和未知项。
- `mock/`：15份初始事实与场景JSON，具体层级见 `DATA_CONTRACT.md`。
- `SCENARIO_COVERAGE.md`：CASE-01～21逐项对应真实样本、轻量变体和限制。
- `validation-report.json`、`test-results.txt`：数据检查、源文件完整性、生成一致性和反例结果。
- `../spec_final/DEV_STATUS.md`、`../spec_final/OPEN_QUESTIONS.md`：阶段状态与材料缺口。

## 重复生成与校验

在项目根目录运行（当前宿主已有 Python 环境）：

```sh
/Users/chch/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 demo-generated/scripts/rebuild.py
```

在其他环境中，有 Python 3.12 与 openpyxl 3.1.5 即可对已复核抽取重新生成和校验：

```sh
python3 demo-generated/scripts/rebuild.py
python3 -m unittest discover -s demo-generated/tests -v
python3 demo-generated/scripts/scenario_loader.py SC-19
```

`rebuild.py` 先校验源文件，再依次生成复核事实、分析报告、Mock和场景；重复生成两次比对校验值，最后运行验证与反例测试。它不重新OCR、不修改源文件、不执行业务动作。`validate.py` 可单独快速检查数据；完整测试报告由 `rebuild.py` 产生。

加载器输出一个全新的事实副本、初始材料批次ID和待执行动作配方。`initialBatchIds` 是未来应通过业务动作加载的材料，不等于已经占用。所有原件初始为未加载，客户未知查货为隔离状态，关系初始为空。操作配方中的确认、匹配、补客户、版本变化等均留给后续阶段实现。

## 本地识读工具

全部识读在本机执行，未上传外部服务。原始抽取使用 `extract.py`：PDF文字提取、pdftoppm页面渲染、Apple Vision离线中文/英文识读、Excel单元格及合并区域读取。扫描结果经过人工式逐页目视复核后写入 `reviewed_facts.py`，OCR输出不能直接替代业务事实。

当前 XLS 专用依赖 xlrd 2.0.2 仅位于 `demo-generated/.python-deps/`。重新抽取需要 `requirements-phase-minus-1.txt` 中工具和系统 `pdftoppm`、macOS Swift/Vision；编译命令如下（生成物仍位于本目录）：

```sh
swiftc demo-generated/scripts/ocr.swift -o demo-generated/scripts/.ocr-local
python3 demo-generated/scripts/extract.py
```

现有抽取缓存会核对源文件校验值；原件外部变动时拒绝沿用旧识读。`source-baseline.json` 是首次盘点的固定证据，不能为了让校验通过而重新覆盖。

## 统计边界

确认34个逻辑查货单、122条原始行。客户不明的14单29行保留在隔离区；35个展示组的数量/净毛重汇总至少一项不完整。未知不会补零，也没有按数量分摊整箱重量。

确认12份委托、50条委托商品。多对多样例仅有“附件查看”占位工作簿，其委托商品数量UNKNOWN，未按零计入总量。参考结果不是原始委托；英卡不同文件名的重复26070093只入库一次。

数据测试通过不等于CASE业务验收通过。当前没有业务动作引擎、UI或端到端测试，也没有进入Phase 0。

## 2026-09-20 真实 Prompt 校准

SC-08 已接入完整 P1→P2→P3→P4 结果。原始响应、宿主执行证据和验收说明见 `real-calibration/SC-08-audit/INTEGRATION_REPORT.md`。运行 `python3 demo-generated/scripts/build_real_calibration_fixture.py --check` 可验证真实结果与页面 fixture 一致。其余章节保留早期基线阶段记录，不代表当前页面开发状态。
