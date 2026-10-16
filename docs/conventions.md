# 用户工作规范（与调度策略分离）

这是现有规范的保留清单，不是为了弥补模型能力而设置的流程。模型变强、执行者改变、取消自动 review 都不自动授权修改这些约定。用户明确要求的例外优先；否则保持现有规范。

## 规则冲突

在适用的指令层级内,当前用户明确要求优先于项目 `AGENTS.md` 的明确约定,
项目约定优先于本插件默认约定。例如项目明确要求模块 README 时,不套用下文
默认禁止项。未解决的冲突应指出并询问,不要静默选边;commit/push 仍需明确授权。
项目 AGENTS.md 由项目维护,插件不自动改写它。

## 目录与命名

在用户确定的分析父目录下保存产物；路径已明确时不重复确认。分析模块采用后续可用的 `<NN>_ModuleName/` 编号，保留既有模块与原始数据。

```text
<analysis>/
  Task/TaskN-YYYYMMDD.md       # 可选计划，不是分析产物目录
  <NN>_ModuleName/
    scripts/stages/          # 编号分析脚本
    scripts/config/          # YAML 参数
    scripts/utils/           # 工具模块
    results/data/            # h5ad/二进制数据
    results/tables/          # CSV/TSV 与结果表
    results/plots/           # 最终图 PNG+PDF
    tmux/                    # 长任务 log/status/manifest.jsonl
  Report/                    # 用户请求的正式报告
  Publication/               # 用户请求的成图 notebooks
  tmp/                       # 临时探索图，不作正式交付
```

不创建模块 README.md、logs/ 或 99_Report/。不把分析结果写在 Task/ 下。只创建实际需要的目录。短任务可以没有 Task，但仍遵守产物目录约定。

## 代码风格

分析脚本、notebook 与回复中的代码示例使用 **线性、命令式、研究脚本式（linear imperative research scripting）** 风格，更接近 Stata do-file 或传统研究代码，而不是工程化 Python 项目。

- 代码从上到下自然执行，使用清晰的中间变量与步骤，让用户能逐行理解、修改数据处理过程。
- 优先使用最基础、最直接的命令与内置数据操作；减少函数封装、抽象层、循环和推测性的防御性代码。只有确实能让必要的重复操作更清楚时才引入函数或循环，不为架构美观新增类、通用 pipeline 或工具模块。
- 保留影响科学正确性与数据完整性的必要检查；减少防御性代码不等于跳过输入、配对、实验单位或 merge 语义核对。
- 保持代码紧凑：简单函数调用、变量列表、列选择、`merge`、`rename`、`read_excel` 等尽量写在一行，不为格式美观拆成很多行。逻辑简单时允许较长单行；只有单行明显过长、包含多层逻辑或影响理解时才换行。
- 不使用 Black/PEP 8 式的强制展开格式；优先保证“看得懂、改得动、步骤清楚”，不追求工程规范和抽象设计。

该偏好每轮随共享规范注入，`SCIENTIST_NO_ENFORCEMENT=1` 不会关闭它；用户明确要求其他风格时，以用户要求为准。目录中的 `scripts/utils/` 只供确有需要的工具使用，不要求为了目录结构额外封装函数。

- 脚本避免与标准库同名（如 `inspect.py`、`json.py`），防止导入遮蔽。
- 目录重命名后核对 config 中的 `module_dir`、输入输出路径与已有文档引用是否实际存在。
- 表格交接声明分隔符、ID 列名/类型、唯一性及缺失值约定；优先将 ID 写为显式列并 `index=False`，若写索引则明确 `index_label`。读入后按键核对/对齐，不靠匿名首列或行顺序。无需另建共享表格框架。

## 图形

[figure-standards.md](../skills/visualization/shared/figure-standards.md) 是唯一详细标准，全部 32 条继续适用。无视觉能力时使用其中的程序化 QC 模式，只能标记“技术检查通过、视觉验收待完成”，不能声称全部通过。最终图保存 PNG（至少 300 DPI）和 PDF，不使用 JPEG。配色、字号、轴标签、图例位置、图内标注等不是代理可任意改变的审美偏好。

有独立 plot-ready CSV/TSV 且图型受 visualization 支持时使用 R 路径；使用 `theme_elegant(base_size=9)` 与 `get_palette_values()`。否则可用 Python，仍遵守相同标准。探索性临时图保存在 tmp/。

## 长计算与复现

使用 tmux-runner 的 wrapper 和既有日志/退出状态/manifest 布局。主智能体和协作者都能使用。启动成功不能当作分析完成，实际内容验证不能被文件存在或零退出替代。执行代码保留随机种子（默认 42）、实际包版本、参数和输入输出依据。

依赖步骤必须等待本次运行完成并验证前置产物；runner `--wait` 返回退出码，默认异步启动不是完成。大文件/最终产物先写同目录临时文件、关闭并验证后原子 rename，避免中断破坏唯一有效结果；重命名不等于断电持久性保证。重跑前声明固定输入是否可重复执行、是否接受自身输出及覆盖边界，不要求所有阶段强行改为幂等。

## 正式交付与授权

- 正式报告仅在明确请求时生成：中文自包含 HTML，图片内嵌，无外部依赖；包含方法依据、核心结论、逐图解释、文件/复现索引。
- 命名保留 `Report/<TaskID>-<topic>-<YYYYMMDD>.html`。没有 Task 的任务用描述性主题命名，不为了文件名补建计划。
- Publication：一图一 notebook，相对路径引用既有结果，不嵌入/复制大数据，一张图的 PDF+PNG，不代用户拼 panel；实际从干净内核 Run All。
- 不自动 commit/push；不将取消、超时或缺少回答理解为授权。
- 不用模拟/mock 数据替代缺失输入、失败检索或分析结果。

## 维护边界

运行时摘要位于 `core/conventions.ts`，并同时提供给主代理与可选子代理。改变调度不应顺便改变本文件及图形规范。正确性要求见领域 Skills；可替换执行策略位于 `core/enforcement.ts` 和工具描述。分类依据见 [rule-audit.md](rule-audit.md)。
