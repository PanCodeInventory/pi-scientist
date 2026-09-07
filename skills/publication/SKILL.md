---
name: publication
description: 把已完成分析装配为一图一 Notebook 的投稿成图整理，仅由用户手动请求触发。
disable-model-invocation: true
---

# Publication — 成图整理（一图一 Notebook）

本技能**仅由用户手动请求触发**（`/publication`、`/skill:publication` 或明确要求按此约定整理投稿图）。无需对请求进行模式分类。

## 定位

Publication 默认只做**已完成分析的整合与排版**：把既有的分析产物（h5ad、结果表、中间数据）**不修改地**组装成一张张可发表的图，每张图对应一个自包含、可复现的 Jupyter Notebook。这是装配，不是默认授权新分析。

成图交付不附带 `Report/` 报告、`Task/` 计划或 README。主代理默认直接检查、编写、执行和验证；专门的检查、检索、执行或只读审查工具均按需使用，不构成必经链路，也不触发自动 review。

若缺少数据或需要新的统计检验、模型拟合等计算，先说明缺口、计算范围与科学选择。已有明确授权则据此执行；否则与用户澄清是否补算或缩小成图范围。获准的补算放在分析模块内并遵守其布局，成图 notebook 仍只读取可溯源的分析产物；无需切换模式。

## 流程

1. **轻量盘点**：主代理直接检查所需既有输出、数据源与参数；复杂盘点可按需使用 `sci_scout`，输出缺失则按下方失败兜底处理。
2. **澄清未决选择**：复用已有期刊要求、图形规范与用户确认，不重复提问。只讨论仍未明确且影响交付或科学解释的选择：
   - 期刊目标 / 栏宽 / 字号，以及 PDF+PNG 之外是否另有明确格式要求
   - 配色方案、色盲安全及分组顺序
   - 要出哪几张图、数据源、对比和筛选范围
   普通样式沿用既定规范；关键科学选择不擅自决定，无固定提问数量或轮次。
3. **建目录写 notebook**：创建 `Publication/`，逐个写出 notebook。每个 notebook 含参数 cell、来源溯源注释、绘图 cell、导出 cell，只用相对路径，且只导出一张图。
4. **执行复现**：逐个 Run All 确认能复现，把导出图片路径告知用户。
5. **收尾**：总结产出（哪些 notebook、各自导出的图路径），停止。不要 git commit。

## 硬性规则

1. **直接交付 notebook**：成图本身不要求 Task 文件或工具调度。主代理可直接写 notebook（nbformat 4 JSON），或在 `jupytext` 可用时用 `jupytext --to ipynb` 从 py:percent 文件转换。
2. **输出位置**：分析父目录下的顶层 `Publication/` 文件夹，与 `Task/` 和各 `<NN>_ModuleName/` 平级。
3. **一图一 notebook**：文件名 `Publication/FigureN_<short>.ipynb`，或 `Publication/FigureN_<short>/FigureN.ipynb` 配一个 `exports/` 子目录放导出图。补充图用 `SF` 前缀。
4. **只用相对路径引用数据**：notebook 通过相对路径读取既有分析输出（如 `../02_Clustering/results/data/02_clustered.h5ad`）。**绝不**复制或内嵌大数据文件。小型论文级元数据（细胞类型→颜色映射、基因列表、分组顺序、panel 标签）可作为**显式 cell** 写在 notebook 里——这是优点，不是缺点。
5. **只导出单一图片**：每个 notebook 产出一张图，**不做 panel 组合**（用户自行在外部拼版）。导出 PDF（矢量）+ PNG 300dpi，遵循 [figure-standards.md](../visualization/shared/figure-standards.md) 的格式/尺寸/配色规范，禁止 JPEG。
6. **一个 notebook 一个内核**（Python 或 R），按该图主要依赖的绘图库决定。不要在一个 notebook 里混用双内核。
7. **必须 Restart & Run All 复现**：每个 notebook 从上到下能干净跑通。提交前主代理要实际执行一次确认（inline 运行或 `jupyter nbconvert --execute --inplace`）。

## 推荐目录结构

```text
<analysis_parent_dir>/
├── Task/                         # 可选的既有分析计划；成图不需要创建
├── 01_Preprocessing/             # 既有分析模块，是 Publication 的数据源
├── 02_Clustering/
├── ...
└── Publication/                  # 成图输出根目录
    ├── shared/                   # 可选：跨图共享的样式/配色模块（style.py 或 utils.R）
    ├── Figure1_Overview/
    │   ├── Figure1.ipynb
    │   └── exports/              # Figure1.pdf + Figure1.png（单一图片，非组合）
    └── Figure2_Dotplot/
        ├── Figure2.ipynb
        └── exports/
```

`shared/` 是可选的，用于抽出跨图共享的 `theme_elegant()` / 配色 / 细胞类型颜色映射（可复用 [utils.R](../visualization/r-pipeline/scripts/utils.R) 里的主题与配色）。其余代码刻意保留在每个 notebook 内，以保证单图自包含——自包含优先于 DRY。

## Notebook 内部规范

每个 notebook 应包含：

1. **参数 cell（首个代码 cell）**：数据源路径、输出目录、figure id、尺寸/DPI。写成 papermill 兼容的参数 cell（`# %% parameters` 或带 `"tags": ["parameters"]`）。所有路径用相对路径。
2. **来源溯源注释**：每个绘图 cell 顶部注释标注数据来自哪个模块/脚本/步骤，例如：
   ```python
   # 来源: 02_Clustering/scripts/stages/01_clustering.py (P02)
   # 输入: ../02_Clustering/results/data/02_clustered.h5ad
   ```
   这把 notebook 锚定回既有分析，便于"文件与复现索引"和后续过期检测。
3. **绘图 cell**：只做"从分析结果到成图"的最后一步——subset、变换、美化。不重新跑分析。
4. **导出 cell（末 cell）**：按 `figure-standards.md` 的尺寸（单栏 85mm 等）与格式导出**单一图片**到 `exports/`：
   ```python
   plt.savefig('exports/Figure1.pdf', bbox_inches='tight')   # 矢量
   plt.savefig('exports/Figure1.png', dpi=300, bbox_inches='tight')
   ```

## 与分析和报告的关系

- 上游模块重跑后，根据 notebook 的来源溯源注释和相对路径定位过期图片并重新执行；务必保留这些溯源信息。
- Publication 与 `/generate-report` 互补：前者产出可复现的单图 notebook 供投稿，后者产出综合中文 HTML 报告。两者都由用户手动请求，互不替代。

## 失败兜底

- 所需输出不存在或不完整时，列明缺口和受影响图片，澄清补算范围或先交付不受影响的图；不虚构数据，也不悄悄扩大分析范围。
- notebook 执行失败时检查日志并修复；无法执行则明确报告环境或数据阻塞，不能标为已复现。
