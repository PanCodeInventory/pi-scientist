---
name: publication
description: Publication 模式——把已完成分析装配为一图一 Notebook 的成图整理（手动触发）
disable-model-invocation: true
---

# Publication 模式 — 成图整理（一图一 Notebook）

本模式**仅由用户手动触发**（`/publication` 命令或用户明确要求进入 Publication 模式）。主代理**不**自动把请求分类为 PUBLICATION——它不在 NEW/CONTINUE/QUERY 的自动分类范围里。

## 定位

Publication 模式只做**已完成分析的整合与排版**：把既有的分析产物（h5ad、结果表、中间数据）**不修改地**组装成一张张可发表的图，每张图对应一个自包含、可复现的 Jupyter Notebook。这是装配，不是新分析。

**不是** Publication 模式该做的事：装配之外的一切；生成 `Report/` 报告、建 `Task/` 计划、写 README；派发 worker/reviewer 子代理、调用 `sci_implement` / `sci_review`。

若某张图需要的不是"装配"而是"新计算"，停止 Publication 模式，告知用户这属于 CONTINUE/NEW，先回分析模块做完再回来。

## 流程

1. **轻量盘点**：用 `sci_scout` 盘点既有分析输出，列出所有可用模块、数据源与参数；任一所需输出缺失则走失败兜底。
2. **确认成图选择**：用 `ask_user_question`（每轮一个问题）只问那些数据无法回答、且会影响成图的选择：
   - 期刊目标 / 栏宽 / 格式（TIFF 还是 PDF）/ 字号
   - 配色方案、是否色盲安全
   - 要出哪几张图、每张图的数据源
   这些是美学/科学选择，值得问。一轮确认够就不再多问。
3. **建目录写 notebook**：创建 `Publication/`，逐个写出 notebook。每个 notebook 含参数 cell、来源溯源注释、绘图 cell、导出 cell，只用相对路径，且只导出一张图。
4. **执行复现**：逐个 Run All 确认能复现，把导出图片路径告知用户。
5. **收尾**：总结产出（哪些 notebook、各自导出的图路径），停止。不要 git commit。

## 硬性规则

1. **不走 Plan-Implement 链路**：不创建 `Task/TaskN-*.md`，不调用 `sci_implement` / `sci_review`，不派子代理。主代理用 `write` 工具直接写 notebook（nbformat 4 JSON），或在 `jupytext` 可用时用 `jupytext --to ipynb` 从 py:percent 文件转换。
2. **输出位置**：分析父目录下的顶层 `Publication/` 文件夹，与 `Task/` 和各 `<NN>_ModuleName/` 平级。
3. **一图一 notebook**：文件名 `Publication/FigureN_<short>.ipynb`，或 `Publication/FigureN_<short>/FigureN.ipynb` 配一个 `exports/` 子目录放导出图。补充图用 `SF` 前缀。
4. **只用相对路径引用数据**：notebook 通过相对路径读取既有分析输出（如 `../02_Clustering/results/data/02_clustered.h5ad`）。**绝不**复制或内嵌大数据文件。小型论文级元数据（细胞类型→颜色映射、基因列表、分组顺序、panel 标签）可作为**显式 cell** 写在 notebook 里——这是优点，不是缺点。
5. **只导出单一图片**：每个 notebook 产出一张图，**不做 panel 组合**（用户自行在外部拼版）。导出 PDF（矢量）+ PNG 300dpi，遵循 `skills/visualization/shared/figure-standards.md` 的格式/尺寸/配色规范，禁止 JPEG。
6. **一个 notebook 一个内核**（Python 或 R），按该图主要依赖的绘图库决定。不要在一个 notebook 里混用双内核。
7. **必须 Restart & Run All 复现**：每个 notebook 从上到下能干净跑通。提交前主代理要实际执行一次确认（inline 运行或 `jupyter nbconvert --execute --inplace`）。

## 推荐目录结构

```text
<analysis_parent_dir>/
├── Task/                         # 计划文件（Publication 模式不在这里写任何东西）
├── 01_Preprocessing/             # 既有分析模块，是 Publication 的数据源
├── 02_Clustering/
├── ...
└── Publication/                  # 本模式的输出根目录
    ├── shared/                   # 可选：跨图共享的样式/配色模块（style.py 或 utils.R）
    ├── Figure1_Overview/
    │   ├── Figure1.ipynb
    │   └── exports/              # Figure1.pdf + Figure1.png（单一图片，非组合）
    └── Figure2_Dotplot/
        ├── Figure2.ipynb
        └── exports/
```

`shared/` 是可选的，用于抽出跨图共享的 `theme_elegant()` / 配色 / 细胞类型颜色映射（可复用 `skills/visualization/r-pipeline/scripts/utils.R` 里的主题与配色）。其余代码刻意保留在每个 notebook 内，以保证单图自包含——自包含优先于 DRY。

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

## 与其他模式的关系

- 当后续 CONTINUE 重跑了某模块，靠 notebook 里的来源溯源注释和相对路径可快速定位哪些图过期需要重跑——这是本模式最容易缺的一环，务必写好溯源注释。
- Publication 模式与 `/generate-report` 互补：前者产出可复现的单图 notebook 供投稿，后者产出综合中文 HTML 报告供内部确认。两者都是手动触发，互不替代。

## 失败兜底

- 若盘点发现所需的既有输出不存在或不完整，停止并告知用户先用 NEW/CONTINUE 补齐，再回 Publication。
