# Scientist

> 一个面向生物信息学的多 Agent 分析框架。基础假设是：代码能跑和结果正确，是两回事。生信输出里的每一个数字、每一张图、每一个统计选择，都应该能被独立验证。

---

## 问题

主流的 AI Agent 框架——Cursor、Copilot、Cline——设计目标都是辅助编程。在编程场景里，编译通过、测试绿灯就是终点。

生信分析不是编程。它有三个问题在通用框架下特别容易出。

**第一，模型会制造数据。** 有两种情况。本地数据在磁盘上时，模型通常能正常读取，编造数据的概率不高。但一旦任务涉及公共数据库——TCGA、GEO、STRING、Ensembl——需要通过外部 API 获取数据，而端口不通或接口返回空响应时，模型倾向于自行补全。它不会报告"取不到数据"，而是直接生成一个看上去合理的替代品。出来的 p-value 符合分布，logFC 范围也对，火山图甚至比真实数据画出来更好看，但跟任何真实来源都没有关系。这不是偶尔出错，是系统性的行为模式：模型把"生成一段像分析结果的文字"当成了"做分析"。

**第二，API 调用失真。** scanpy、Seurat、DESeq2 这些包的版本迭代快，函数签名和参数语义在版本之间可能完全不同。模型调用了一个已经移除的函数，或者把 `min_genes` 写成 `min_cells`——代码不报错，但统计结果全部偏移。软件工程里，API 错误几乎立刻暴露；生信里，统计方法会静默消化错误输入，给出一个数值上合法的输出。从结果上看不出来，除非回溯脚本逐行检查。

**第三，图表不能用。** 通用框架产出的图用的是 matplotlib 默认样式：jet 配色、低分辨率、字体模糊、图例压在数据上。在编程场景下，这些图的作用是辅助调试——看一眼知道大概分布就行。但生信分析里，图是最终输出的一部分，要放入稿件、通过期刊审稿。中间的差距不是调几个参数就能补上的——它需要一套完整的图表质量标准，并且有人执行这套标准。

这三个问题指向同一个原因：通用 Agent 框架的评判标准是"代码有没有跑通"，不是"分析对不对"。分析对不对这件事，需要独立于执行的验证环节。

---

## 设计

Scientist 用三条规则解决上面的问题。

**方法先于代码。** 不先定下用什么方法、为什么用这个方法、参数怎么选——就不写第一行代码。Planner Agent 会生成一个持久化的计划文件，写明每步的包版本、参数依据、假设条件和备选方案。这份计划会被 Worker 和 Reviewer 反复引用，而不是写完就被遗忘。

**数据不可伪造。** Worker Agent 的系统提示里有一个独立章节，措辞不留余地：禁止编造、模拟或随机生成任何数据。如果 Worker 无法从声明好的输入文件里加载真实数据，它必须直接终止，报告 `ANALYSIS TERMINATED`。没有例外。

**每一步都有人审。** Worker 产出之后，Reviewer 自动启动，审代码正确性、检验方法是否适合数据特征、图表是否符合发表标准、数据溯源是否完整。审查不通过，自动追加修复任务，修好才算完成。

---

## 五个 Agent

单个大 Agent 同时背负"快完成任务"和"确保统计正确"这两个目标时，会走捷径。我试过，结果是它选择前者。

所以拆成了五个：

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  SCOUT   │  │LIBRARIAN │  │ PLANNER  │  │  WORKER  │  │ REVIEWER │
│ 检查数据  │  │ 研究方法  │  │ 制定计划  │  │ 执行步骤  │  │ 审查输出  │
├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤
│ read/ls  │  │ pubmed   │  │ read     │  │ read/write│  │ read     │
│ grep     │  │ context7 │  │ write    │  │ edit      │  │ grep     │
│ find/bash│  │ webreader│  │ grep/find│  │ bash      │  │ ls/bash  │
│          │  │          │  │ ls       │  │工具宇宙    │  │ (只读)   │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

默认模型由 `agents/*.md` 的 frontmatter 定义：

| Agent | 默认模型 | 环境变量覆盖 |
|-------|----------|--------------|
| Scout | `commandcode/deepseek/deepseek-v4-flash` | `SCIENTIST_MODEL_SCOUT` |
| Librarian | `commandcode/MiniMaxAI/MiniMax-M3` | `SCIENTIST_MODEL_LIBRARIAN` |
| Planner | `zai-coding-cn/glm-5.2:xhigh` | `SCIENTIST_MODEL_PLANNER` |
| Worker | `openai-codex/gpt-5.6-terra` | `SCIENTIST_MODEL_WORKER` |
| Reviewer | `openai-codex/gpt-5.6-sol:xhigh` | `SCIENTIST_MODEL_REVIEWER` |

单 Agent 环境变量优先于 frontmatter；未配置 frontmatter 时使用 `SCIENTIST_MODEL_DEFAULT`，仍未配置则交给 pi 选择默认模型。例如：

```bash
SCIENTIST_MODEL_WORKER=anthropic/claude-sonnet-4-5 pi
```

每个 Agent 配不同的系统提示、不同的工具集、不同的模型。Scout 只需要 `read` 和 `ls`，给它 bash 反而分散注意力。Reviewer 有 bash 但被限制为只读——它不能编辑分析文件，只能检查和写 Plan File。这种最小权限设计的目的不在安全，而在注意力：不该 Agent 碰的工具就不要出现在它的工具列表里，省得它分心。

### Plan File：分析的地面真相

Agent 对话历史是易失的。上下文窗口溢出时，早期决策先被遗忘。即使窗口够大，越靠前的内容被模型关注的概率越低。

Scientist 把分析计划写成 Markdown 文件，放在文件系统里：

```
项目目录/
├── Task/
│   └── Task1-20260609.md    ← 计划文件
├── 01_Preprocessing/        ← 产出
├── 02_Clustering/
└── 03_DEG/
```

计划文件的内容是一份结构化的任务清单：

```markdown
## Todolist
- [ ] P01: QC 过滤
- [ ] P02: 聚类
- [x] P03: DEG 分析  ← 只有 Reviewer 能打勾

## Task Details
### P03: DEG 分析
Module: 03_DEG/
Script: 03_DEG/scripts/stages/01_deg.py
Input: 02_Clustering/results/data/02_clustered.h5ad
Method: Wilcoxon + Bonferroni
```

Worker 读取计划、执行步骤、产出文件。它不能编辑计划文件。打勾 `[x]` 是 Reviewer 的专属操作。

这样一来，Plan File 上的 `[x]` 就不只是"执行了"——它同时还意味着"审过了"。

### Spawn 和 Fork：两种上下文继承

多数子 Agent 用 **Spawn** 模式：启动一个独立的 pi 进程，只传入任务描述和 Agent 自己的系统提示。Worker 不需要知道用户最开始说了什么，它只需要知道这一步的参数和目标。

Planner 是例外。它需要综合数据格式、用户意图、Librarian 推荐的方法——这些信息散落在对话历史的不同位置。如果只给一段任务描述，要么信息不全，要么描述长到难以处理。

所以 Planner 用 **Fork**：直接分支当前会话，继承完整的对话历史，再叠加 Planner 自己的系统提示。

```typescript
// runner.ts
args.push("--fork", sessionFile);           // 继承全部对话
args.push("--append-system-prompt", path);  // 叠加 Planner 系统提示
```

Spawn 提供干净上下文给执行型 Agent，Fork 提供完整上下文给决策型 Agent。

---

## Worker + Reviewer 强制耦合

`sci_implement` 是 Scientist 里调用最频繁的工具。一次调用做两件事：

```
sci_implement(planFile)
  │
  ├─ Worker 启动
  │   → 读 Plan File，找下一个未勾选步骤
  │   → 按 Task Details 执行
  │   → 产出文件 + Handoff JSON
  │
  └─ Reviewer 自动启动
      → 解析 Handoff JSON
      → 审代码、统计、图表、溯源
      → PASS: Plan File 中打 [x]
      → FAIL: Plan File 末尾追加修复任务
```

Worker 不再写人类可读的总结——它输出一个结构化 JSON 作为交接单据：

```json
{
  "stepId": "P03",
  "filesToReview": [
    {"path": "03_DEG/scripts/stages/01_deg.py", "role": "script"},
    {"path": "03_DEG/results/plots/volcano.png", "role": "figure"}
  ],
  "inputFiles": ["02_Clustering/results/data/02_clustered.h5ad"]
}
```

Reviewer 拿到这个单据，知道该审哪些文件、每个文件是什么类型、数据从哪来的。不需要猜测。

### Reviewer 审什么

五个维度：

- **数据溯源。** 脚本是否从声明的 `inputFiles` 实际加载了数据。没有 `read_h5ad` 或 `read_csv` 调用却产出了分析表格，直接判定为伪造。
- **代码正确性。** API 是否当前版本，参数是否和计划文件一致，数据处理步骤是否有误。
- **统计有效性。** 检验方法是否适合数据分布特征。非正态数据用了参数检验，或者多重检验校正没做——都会被打回。
- **图表质量。** 格式、配色、字体、尺寸是否达标。具体标准见下文。
- **计划合规。** 产出文件是否在声明的模块目录下，是否用了计划中指定的 Skill。

踩到数据伪造直接终止。其他问题追加修复任务。

### Plan File 的演变

审查后，计划文件自动更新：

```
初始:                        PASS:                       FAIL:
- [ ] P01: QC               - [x] P01: QC               - [ ] P01: QC
- [ ] P02: 聚类             - [ ] P02: 聚类             - [ ] P01_fix1: 改阈值
                             - [ ] P03: DEG              - [ ] P02: 聚类
```

FAIL 那一列里，P01 没有被勾选，但末尾追加了 `P01_fix1`。下一轮 Worker 优先执行修复，修好后 Reviewer 再把 P01 打勾。

效果是：计划文件上每一个 `[x]` 都代表该步骤确实完成了，并且审核通过了。

---

## 工作流

三种模式，主 Agent 根据用户请求自动选择。

**NEW（新分析）**：从原始数据开始。Scout 查数据 → Librarian 查方法 → **主 Agent 与用户进行科学讨论并形成共同科学约定** → Planner 写计划 → Worker + Reviewer 逐步推进。

**CONTINUE（追加分析）**：基于已完成的分析加新模块。Scout 只扫已有产出，不重扫原始数据；如果新增分析涉及重要的方法或解释选择，主 Agent 先和用户讨论清楚。新计划明确声明对已有文件的依赖——Worker 直接读，不重新执行前置步骤。

**QUERY（快速查询）**：问一个具体数值或查一个结果。主 Agent 直接读文件回答，不调用任何子 Agent。

一个完整的 NEW 流程示例：

```
用户: "分析这个 h5ad，聚类、注释、差异表达"

Scout
  → h5ad, 50,000 × 30,000, 3 条件 × 3 重复

Librarian
  → scanpy 1.10, pseudobulk/Wilcoxon 的适用边界、Wolf et al. 2018

科学讨论（逐问逐答）
  → 主 Agent 先展示数据设计、文献依据、候选路线和自己的建议
  → 用户确认主要生物学问题、实验单位、比较组、批次处理和解释边界
  → 形成 Shared Scientific Contract；最后单独确认分析目录

Planner
  → Task1-20260609.md
  → 模块: 01_Preprocessing, 02_Clustering, 03_Annotation, 04_DEG

sci_implement × N
  P01 QC         → [x]
  P02 聚类       → Reviewer: resolution 偏高 → 追加 P02_fix1
  P02_fix1       → [x], P02 → [x]
  P03 注释       → [x]
  P04 DEG        → [x]
```

### 为什么在 Planner 前增加科学讨论

Scout 和 Librarian 返回后，Agent 掌握的信息通常显著多于用户：数据维度、重复结构、质量信号、方法比较、文献证据都可能只存在于折叠的工具输出中。如果这时只问一句“输出到哪个目录”，用户实际上没有参与分析设计。

Scientist 现在把 `ask_user_question` 作为科学对话工具，而不只是澄清工具。对话借鉴了 `grill-me` 的三个关键原则：先建立有依赖关系的决策树、一次解决一个分支、每个问题都给出 Agent 的推荐答案。同时保留 Scientist 自己的限制：不为“追问”而追问，深度由科学风险和剩余不确定性决定。

每个科学问题现在都是一个结构化决策节点：

- **`decisionId/category/dependsOn`**：稳定标识当前分支及其上游依赖；
- **`evidence[]`**：逐条区分 Scout、Librarian、数据、代码、文献、用户信息和 Agent 推断，并记录文件字段、PMID/DOI 等来源；
- **`whyItMatters`**：说明选择如何改变统计有效性或生物学解释；
- **`recommendation`**：包含推荐值、理由、信心和适用条件；
- **备选路线**：逐项说明科学后果，并在界面中标记推荐项。

提问前还会先判断答案是否能从数据、代码、计划文件、包文档或文献中查到。能查到的内容由 Agent 自己调查，不把检索工作推给用户；只询问科学意图、材料中不存在的领域知识、价值判断和真正需要用户参与的选择。

不仅是“一次调用问一个问题”，现在还在运行时强制**每个 assistant turn 最多调用一次** `ask_user_question`。如果模型预先生成多个问题，后续调用会被阻止。模型必须先读取答案、解释影响并剪枝，然后才能在新一轮生成下一问。

科学问题在 TUI 中使用专用界面：证据、重要性、推荐方案、信心、适用条件和候选路线同时可见；长证据可用 `E` 展开；自定义答案在同一界面内编辑，不再丢失上下文，空答案不能提交。

每次回答都会把紧凑的增量决策事件保存在 tool result `details` 中（不重复存整段 briefing/Contract），可随会话 reload、fork 和 tree 分支恢复。插件据此自动重建并生成 **Shared Scientific Contract**；使用 `/science-contract` 可随时查看。最终确认必须覆盖全部已有决策分支并显式选择确认选项，之后才能进入 Planner。分析目录使用 `purpose="administrative"` 单独询问，不进入科学约定。

---

## 代码结构

```
extensions/scientist/
├── index.ts          # 入口：生命周期、资源发现与模块装配
├── commands.ts       # /reflect 命令
├── dialogue.ts       # 科学决策树、持久化 Contract 与交互式问答 UI
├── enforcement.ts    # 注入到 System Prompt 的规则
├── prompts.ts        # Planner/Worker/Reviewer 的统一任务规则
├── runner.ts         # Spawn / Fork 子进程执行引擎
├── agents.ts         # 从 agents/*.md 加载 Agent 配置与模型覆盖
├── tools/            # 各分析工具的注册与实现
│   ├── index.ts
│   ├── shared.ts
│   ├── scout.ts
│   ├── librarian.ts
│   ├── pubmed.ts
│   ├── plan.ts
│   ├── implement.ts
│   ├── review.ts
│   └── logs.ts
├── agents/           # 5 个 Agent 的规格文档
│   ├── scout.md
│   ├── librarian.md
│   ├── planner.md
│   ├── worker.md
│   └── reviewer.md
└── skills/           # 14 个领域 Skill
    ├── scanpy-prep/             # 单细胞预处理
    ├── scanpy-cluster/          # 降维聚类
    ├── scanpy-annotate/         # 细胞注释
    ├── scanpy-de/               # 差异表达
    ├── scanpy-cellcommunication/ # 细胞通讯
    ├── pyscenic-single-cell-analysis/ # 调控网络
    ├── squidpy-analysis/        # 空间统计
    ├── spatial-commot/          # 空间通讯
    ├── gene-prognosis-scan/     # TCGA 生存分析
    ├── geo-finder/              # GEO 数据检索
    ├── journal-club/            # 文献精读
    ├── statistical-testing/     # 统计检验决策
    ├── visualization/           # 发表级图表
    └── scientific-brainstorming/ # 科研讨论
```

Scientist 作为 pi 的扩展模块，通过 `resources_discover` 贡献 Skill 目录，通过 `before_agent_start` 注入规则和当前科学约定，并注册分析工具及 `/reflect`、`/science-contract` 等命令。

---

## 对比

| 维度 | 通用 Agent 框架 | Scientist |
|------|----------------|-----------|
| 分析计划 | 模型自行决定顺序，无记录 | Plan File 持久化，每步有规格 |
| 方法选择 | 凭训练记忆推荐 | Librarian 实时查文档和文献 |
| 数据溯源 | 不验证 | Worker 禁止伪造，Reviewer 审计 |
| 代码审查 | 能跑即通过 | 多维审查：统计、图表、合规 |
| 图表质量 | 默认 matplotlib 样式 | 专用 Skill + Reviewer 检查清单 |
| 出错恢复 | 人工发现和修复 | 自动追加修复，Plan File 演进 |
| 增量分析 | 上下文丢失后易重复执行 | CONTINUE 模式，依赖声明 |

---

## 两个具体机制

### Worker 的数据防伪造

Worker 系统提示中的 CRITICAL 章节：

> You MUST NEVER fabricate, simulate, generate, or invent data.
>
> If you cannot complete a step with real data, terminate with `ANALYSIS TERMINATED`.

Worker 输出 `ANALYSIS TERMINATED` 时，`sci_implement` 直接报错，Reviewer 不会被启动。伪造数据进不了审查流程。

### Reviewer 的图表检查

每张图过这个清单：

```
格式:  PDF + 300 DPI PNG，不接受 JPEG
配色:  viridis 或 Elegant Muted，不接受 jet/rainbow
字体:  sans-serif, 标签 ≥9pt, 刻度 ≥7pt
边框:  去掉顶部和右侧
图例:  无边框，不覆盖数据
尺寸:  单栏 85mm 或全页 175mm
色盲:  灰度下可区分
误差棒: 存在且图例中写明定义
杂项:  无 3D、阴影、多余网格线
```

审查不通过就追加修复任务。

---

## 使用

```bash
# 在 pi 里开 Scientist 模式
/scientist

# 新分析
分析 ~/projects/scrnaseq/data.h5ad，做 QC、聚类、注释和差异表达

# 追加分析
在这些 DEG 上跑 TCGA 生存分析

# 随手查
cluster 3 的 top 10 marker gene 是什么
```

---

## 关于

[pi](https://github.com/earendil-works/pi-coding-agent) 的扩展模块。

四个设计选择：

1. 一个 Agent 只做一件事。Scout 看数据，Librarian 查资料，Planner 定计划，Worker 写代码，Reviewer 审结果。不混用。
2. 计划落到文件系统。对话历史不可靠，Markdown 文件可靠。每一步的规格、输入、输出、参数都写在计划文件里。
3. 审查不通过不等于完成。Worker 产出只是半程，Reviewer 打勾才是终点。
4. Skill 是硬规范。Skill 文件里包含了经过验证的参数建议、代码模板和审查标准。Agent 不需要凭训练记忆猜测怎么做——读 Skill 就能拿到确定的方案。
