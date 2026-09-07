# 用户工作规范（与调度策略分离）

这是现有规范的保留清单，不是为了弥补模型能力而设置的流程。模型变强、执行者改变、取消自动 review 都不自动授权修改这些约定。用户明确要求的例外优先；否则保持现有规范。

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

## 图形

[figure-standards.md](../skills/visualization/shared/figure-standards.md) 是唯一详细标准，本轮保持全部 32 条不变。最终图保存 PNG（至少 300 DPI）和 PDF，不使用 JPEG。配色、字号、轴标签、图例位置、图内标注等不是代理可任意改变的审美偏好。

有独立 plot-ready CSV/TSV 且图型受 visualization 支持时使用 R 路径；使用 `theme_elegant(base_size=9)` 与 `get_palette_values()`。否则可用 Python，仍遵守相同标准。探索性临时图保存在 tmp/。

## 长计算与复现

使用 tmux-runner 的 wrapper 和既有日志/退出状态/manifest 布局。主代理或可选 worker 都能使用。启动成功不能当作分析完成，实际内容验证不能被文件存在或零退出替代。执行代码保留随机种子（默认 42）、实际包版本、参数和输入输出依据。

## 正式交付与授权

- 正式报告仅在明确请求时生成：中文自包含 HTML，图片内嵌，无外部依赖；包含方法依据、核心结论、逐图解释、文件/复现索引。
- 命名保留 `Report/<TaskID>-<topic>-<YYYYMMDD>.html`。没有 Task 的任务用描述性主题命名，不为了文件名补建计划。
- Publication：一图一 notebook，相对路径引用既有结果，不嵌入/复制大数据，一张图的 PDF+PNG，不代用户拼 panel；实际从干净内核 Run All。
- 不自动 commit/push；不将取消、超时或缺少回答理解为授权。
- 不用模拟/mock 数据替代缺失输入、失败检索或分析结果。

## 维护边界

运行时摘要位于 `core/conventions.ts`，并同时提供给主代理与可选子代理。改变调度不应顺便改变本文件及图形规范。正确性要求见领域 Skills；可替换执行策略位于 `core/enforcement.ts` 和工具描述。分类依据见 [rule-audit.md](rule-audit.md)。
