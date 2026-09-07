# Per-Project Memory Layer — 设计方案

> 参考 Hermes Agent 的记忆设计(声明性记忆 + 程序性 Skill + Curator 整固),
> 为 scientist 扩展实现"每个项目一个专属的自沉淀记忆层"。

> **状态(2026-09-01):设计完成,决定暂不实施。** 当前规模下 Task 链 + AGENTS.md + Skills 已足够,
> memory 的三个职能(冷启动 O(1)/任务外经验/晋升候审)暂无痛点支撑。
> **重开信号**(任一出现且变频繁时,从 §12 v0 约 50 行起步):
> ① 新会话冷启动要读 ≥3 个 Task 文件才能确定"现在哪个工件权威/有什么坑"成为常态;
> ② 同一个坑(环境/数据)在同一项目被踩第二次;
> ③ 任务外经验(QUERY 探索/环境踩坑的结论)开始被反复需要却无处可查。

## 框架总览

```text
┌─────────────────────────────── ① 工作流层:读写都挂在现有节点上,不新增流程 ────────────────────────────────┐
│      会话开始  模式分类    Scout        科学对话    计划定稿      Implement  Review            Publication│
│  ─────────────────────────────────────────────────────────────────────────────────────────────────────────│
│  读  L1冻结    State/Data  Data+State   Dec·不重问  L2+Dec        切面+L2    Dec+State         methods素材│
│  写  —         —           E2+漂移修正  E3          E3补·写TaskN  E4/E5立即  E6转正·TaskN冻结  冻结       │
│                            漂移检测                               E6候选     E7·提示                      │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
     写 ↓  七类沉淀事件(跟验证走,不跟时钟走)                       读 ↑  三入口(注入/渐进披露/检索)
┌────────────────── ② 存储层(存哪里):<project>/.pi/memory/ + 项目内既有文件 ───────────────────┐
│ L1 MEMORY.md ─────────────── ≤3000字符·冻结注入(每会话常驻)                                  │
│   ├ Mission      项目意图 1-2 句(继任者测试的锚点)                                           │
│   ├ Environment  [F] 环境事实:env/版本/机器坑                                                │
│   ├ Data         [A] 数据个性:批次结构/污染/错标/元数据语义                                  │
│   ├ Decisions    [B] 决策账本:选型+why+证据指针(superseded 链)                               │
│   ├ Lessons      [C] 教训+负面结果:症状+归因+勿再试                                          │
│   └ State        [D] 当前状态:权威工件指针(固定 id,replace,单一真值)                         │
│   条目语法:-[cat] 内容 (evidence:路径|TaskID) (id,日期,superseded→新id)                      │
│                                                                                              │
│ L2 skills/<topic>/SKILL.md ── 渐进披露:description 触发词命中才 read                         │
│   frontmatter(触发词+溯源) / 适用条件 / 步骤参数及依据 / 失败模式 / 证据指针                 │
│                                                                                              │
│ L3 Task/TaskN-*.md ─────── 单任务档案:计划+论证+复现索引;完成即冻结(记忆的蒸馏源+证据层)     │
│ L3 pi 会话 ─────────────── 原文备份,最后手段(靠指针下潜 / librarian 检索)                    │
│ archive/ ─────────────────── Curator 淘汰物(不参与 skill 发现,可检索)                        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────── ③ 写通道:记什么(七类沉淀事件) ────────────────────────────────┐
│ E1 项目立项  NEW 对话收敛        → Mission 一两句                                            │
│ E2 数据勘察  scout 见怪癖        → [data]                                                    │
│ E3 用户定夺  选型/阈值/生物判断  → [dec]+依据(用户原话=最高等级证据)                         │
│ E4 踩坑解决  失败→绕过成功那一刻 → [env]    ┐                                                │
│ E5 路线死亡  决定放弃那一刻      → [les]    ├ 立即写(保真度随时间衰减)                       │
│ E7 用户纠正  agent 被推翻        → [les]/supersede ┘                                         │
│ E6 工件晋级  implement 完成→review 通过 → [state]  两拍制:完成=候选,review=转正              │
│ 护栏:QUERY 禁写 | 猜测不入 | 证据指针必填 | superseded 不删                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────── ④ 读通道:怎么取 ───────────────────────────────────────┐
│ 按问题路由:                                                                                  │
│   哪个工件是权威? → L1 State        为什么当初这么选? → [dec]→证据指针→L3                    │
│   这数据有什么坑? → [data]/[les]     这项目里怎么做 X?  → L2 触发词→read                     │
│   试过什么不行?   → [les][负面]      当时具体怎么做?    → L3 检索(librarian)                 │
│ 按角色切面(runner 注入,子代理不读全量):                                                      │
│   主代理 = 全量 L1(冻结注入)    scout = Data+State(漂移检测)                                 │
│   worker = Env+Lessons+相关 L2   reviewer = Dec+State(结果对账决策)                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────── ⑤ Curator 整固环:防膨胀 ───────────────────────────────────┐
│ 触发:L1 ≥ 90% 预算 | L2 > 20 个 | 每 10 会话 | 手动 /memory curate                           │
│ 动作:合并语义重复 → 新替旧(标 superseded,不删) → L1 长内容降级 L2 → 归档 archive/            │
│ 保障:整固 diff 经用户确认后才落盘;唯一合法的批量写                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

项目生命周期:冷启动(A/F 为主)→ 活跃期(B/C/D 高频)→ 里程碑(整固点)→ 发表冻结(L2 可晋升全局 skill)

蒸馏链(向上,越写越小越稳):会话/代码 → TaskN(计划+论证+复现索引)→ MEMORY(验证时刻四问)→ AGENTS.md/Skills(人确认晋升)
回溯链(向下,证据指针)  :MEMORY 一行 → TaskN §章节 → 产物/会话原文
```

## 0. 设计原则(从 Hermes 提炼)

1. **分层记忆**:小预算的常驻事实层(MEMORY.md)+ 无硬限的按需流程层(Skills)+ 原始会话层(pi sessions,复用,不新建)。
2. **预算强制整固**:L1 设字符硬上限,写满必须合并/替换,禁止无限追加;L2 用 Curator 防膨胀。
3. **冻结快照**:L1 只在 `before_agent_start` 注入一次;会话中写入立即落盘、但**不**更新已注入内容(下个会话生效),保护 prefix cache。
4. **不上向量库**:项目记忆高复用、强结构、低容量。渐进披露 + 精确文件路径已覆盖需求,且可 git diff / 人审 / 零检索基础设施。
5. **继任者测试**:Hermes 的验收标准是"下次对话还认识我";项目记忆的标准是"明天换一个全新 agent 接手,只读这份记忆能否无缝继续"。只写能让失忆继任者少走弯路的东西。

## 1. 与 Hermes 的本质差异:关系记忆 vs 资产记忆

Hermes 是个人助理,记忆是一本**日记**(关系记忆):主体是**人**——偏好、风格、环境;读者是下一次对话的同一个 agent;真伪标准是"用户说了算";长期缓慢积累、无生命周期。

项目记忆是一份**实验记录本 + 存档点**(资产记忆):主体是**物和事**——数据、决策、状态、教训;读者是**陌生人**(换模型/换 agent/协作者/半年后的你);真伪标准是**证据说了算**;随项目生命周期(冷启动→活跃→里程碑整固→发表冻结)演进;且是**项目交付物的一部分**——agent 消失后应仍能支撑人类继任者接手。

由此派生的关键差异:

- **真伪标准**:条目必须带证据指针(文件路径/Task ID/图)。否则记忆变成谣言引擎——一条幻觉进记忆,会被后续会话反复放大。
- **失效模式**:不止偏好更替,更常见的是**状态过时**(派生工件指针每个模块都变)与**结论被推翻**(需要 supersession 语义而非删除)。
- **状态层是刚需**:coding 项目里 repo+git 本身就是状态;分析项目的文件系统**不编码**"哪个 h5ad 是权威版本、用户认可了哪个注释"——这些只活在对话里。项目记忆的状态层实质是挂起-恢复的**存档文件**,这是 scientist 的 CONTINUE 模式比通用 coding agent 更需要记忆层的原因。

## 2. 项目记忆的内容模型:记什么

| 类别 | 记什么 | 写入语义 | 例子 |
|---|---|---|---|
| **A 数据个性** | 这份数据被发现的怪癖:批次方向、错标样本、ambient RNA | 不可变,追加 | "PBC 数据 RBC 比例虚高,疑 ambient RNA" |
| **B 决策账本** | 选型 + why + **证据指针** | 追加;被推翻时标 superseded 而非删除 | "整合选 scVI 弃 harmony:图见 03_Integration/plots/compare.pdf" |
| **C 负面结果** | 试过且失败的路线 + 症状 + 归因 | 追加 | "pyscenic 在此数据 regulon 全糊,疑深度不足" |
| **D 当前状态** | 最优工件指针、注释结论、配色、待办 | **replace,单一真值**,固定 id | "当前主 h5ad:05_Annotation/.../annotated.h5ad" |
| **E 已验证流程** | 项目特有工作流 | L2 skill | "本数据集的注释流程" |
| **F 环境事实** | env、版本坑、机器怪癖 | 近似不可变 | "勿升 scikit-misc(破坏 seurat_v3 HVG)" |

**B 是核心资产,因为它最易腐烂**:代码记录 *what*,文件记录 *output*,唯独 *why* 只活在对话里——而它是写 methods、回审稿人、避免重新吵架的唯一来源。**C 被普遍低估**:负面结果替继任者省一天,且通用方法学 skill 永远不会告诉你"这在这份数据上不行"。

**不记什么(三层分界)**:
- 用户全局偏好 → 属于用户层(将来可做全局 memory);混进项目记忆会在协作时泄漏;
- 通用方法论 → 属于 `skills/` 方法学层;项目记忆只记**这份数据的个性**;
- 会话细节原文 → 属于 L3(Task 文件/会话);记忆只留蒸馏结论 + 指回 L3 的指针。

**反向出料**:项目 L2 skill 中被验证为通用的流程,可在项目收尾时晋升为用户全局 skill——项目成为通用能力库的上游。

## 3. 四家分管:AGENTS.md / Skills / Task / 记忆

### 3.1 记什么的定义(排除法)

**新开一个会话,盯着文件树,agent 能自己推出来的,都不用记;推不出来的,才值得记。**
文件系统是 WHAT 的数据库,记忆是 WHY / WHICH-NOW / WHAT-FAILED 的数据库:

| 四问 | 内容 | 例子 |
|---|---|---|
| 为什么 | 决策及依据(用户定夺、选型理由) | "HVG 弃 cell_ranger 用 seurat_v3:3'偏置(Task3)" |
| 现在 | 当前权威状态(单一真值指针) | "主 h5ad = 02_clustered.h5ad" |
| 不行 | 负面结果与坑(这数据上什么死了) | "pyscenic 在此数据全糊,勿再试" |
| 是谁 | Mission、数据个性、环境的雷 | "本项目回答 X 干预对 NK 比例的影响;数据有 ambient RNA" |

一句话:**记忆 = 决策上下文 + 当前状态 + 本地教训**,是项目里唯一"agent 写、项目级、经验性"的信息层。
§2 的 A-F 六类是四问的展开(A/F→是谁,B→为什么,C→不行,D→现在,E→晋升 skills)。

### 3.2 四家分工表

| | AGENTS.md | Skills(方法学) | Task 文件 | 记忆层 |
|---|---|---|---|---|
| 性质 | **规范(应然)**:该怎么做 | **方法(通然)**:这类事的标准做法 | **档案(曾然)**:这一次怎么打算/实际怎么做 | **经验(实然)**:这里实际发生了什么、为什么、信哪个 |
| 作者 | 人写(人改) | 人写(随扩展/项目发布) | agent 写(计划时,reviewer 增补) | agent 自沉淀(验证时刻蒸馏) |
| 例子 | "图一律黑白学术风;勿自行 commit" | "scanpy QC 标准流程" | "Task3:Goal/模块布局/Todolist/方法学论证/复现索引" | "leiden 0.4 比 0.5 合适(8/17)" |
| 粒度/寿命 | 全项目,静态 | 跨任务,版本化 | **单任务,完成即冻结** | 全项目,持续演化 |
| 加载 | pi 原生注入 | 渐进披露 | 按需 read(worker/reviewer 的工作文档) | L1 注入 + L2 渐进披露 |

**为什么不用 AGENTS.md 当记忆**:①作者权是信任边界——人的文件人改、agent 的文件 agent 改,混写后没人能信任哪句是谁放的;②生命周期不同——规范低频稳定、经验高频演化,一起整固会误伤规范;③git 归属清晰。

**分流判据**(一条信息来了问三句):

```
是"要/不要"的指令与偏好?        → AGENTS.md(人写)
是可跨项目复用的流程?            → Skills(方法学)
是"这一次"的计划/布局/论证/复现索引? → Task/TaskN-*.md(单任务档案)
是本项目特有 + 跨会话有用
 + 文件树推不出来?               → 记忆
其余:执行/产物→代码与结果文件;单任务计划→Task/*.md;原文→会话
```

**两条晋升流**(记忆是温床,不是终点):

1. **判例→成文法**:记忆里反复被引用、已稳定的决策,agent 建议、人确认后固化进 AGENTS.md——记忆发现约定,AGENTS.md 立法;
2. **项目经验→方法学**:`.pi/memory/skills/`(agent 自用)→ 验证通用的 → `.pi/skills/`(人审)→ 扩展 `skills/`(跨项目方法库)。

**冲突规则**:AGENTS.md(人的规范)> 记忆(agent 的经验);冲突本身是一次 E7 纠正事件,进记忆。

### 3.3 Task 文件:工作文档 → 过程档案 → 蒸馏源

Task/TaskN-YYYYMMDD.md 有双重身份:活着时是**工作文档**(worker 按 Todolist 执行、reviewer 增补修复步骤、sci_implement 的驱动单元);review 通过后冻结为**过程档案**(证据层 + 复现索引 + 记忆的蒸馏源)。

**双向契约**:
- **计划时读记忆**:Decisions 不翻烧饼、Lessons 避死路、State 定输入(当前权威工件作为 Task Details 的 Input 字段);CONTINUE 恢复 = State(现势)+ `> Prior plan:` 链(编年史)双锚——Task 链回答"做过哪些任务",State 回答"现在各环节哪个是权威",互补不重叠。
- **完成后蒸馏回写**:review 通过时,把 Task 中跨任务有用的内容(E3 定夺/E4 踩坑/E5 死路/E6 新权威工件)蒸馏为一行进 MEMORY.md,证据指针指向 TaskN §章节;Task 文件本身不再改动。

**分工红线**:Task 不承载跨任务状态(否则要翻 N 个文件才知道哪个是权威——这正是 State 属于记忆的理由);记忆不承载单任务细节(留一行+指针)。

**蒸馏链与回溯链**(四家的动态图景):

```
蒸馏链(向上,越写越小越稳):会话/代码 → TaskN(计划+论证+复现索引)→ MEMORY.md(四问)→ AGENTS.md/Skills(人确认晋升)
回溯链(向下,证据指针):MEMORY 一行 → TaskN §章节 → 产物/会话原文
```

"为什么当初用 scVI?"的完整答案 = MEMORY [dec] 一行 → Task3 §Methodology 论证 → 03_Integration/plots/compare.pdf 图 → 会话原话。

### 3.4 Memory 做了什么 Task+AGENTS.md 做不到的事

重合是真的:Decisions 一行确实是 Task Methodology 的复制。但这是**日志与视图**的重叠,不是冗余错误。三个结构性不可替代的职能:

1. **O(1) 回答"现在"**:Task 是 append-only 编年日志,每个文件冻结在自己的完成时刻;回答"现在哪个工件权威/当前策略是什么"需从链头回放并消解沿途冲突,O(N) 读/会话。Memory 的 State/Decisions 是把回放**做一次缓存结果**(物化视图)。视图可从日志重建——这正是"重合感"的来源;缓存不是冗余,是蒸馏一次换恢复 O(1)。由此,防过时机制(supersede/漂移检测/curator)的位置也对了:**它们全是缓存失效策略**。
2. **收容任务外经验**:QUERY 探索(零落盘)、环境踩坑、用户随口纠正、Publication 微调——不产生 Task 文件,也进不了人审的 AGENTS.md。没有 memory,它们随会话蒸发;而"勿升 scikit-misc"这类最高频复用的知识恰恰产自任务外。
3. **晋升候审区**:AGENTS.md 的价值在信任边界(每条人确认),但经验产生速率 >> 人审批速率。Memory 是候审区:成熟升格、未熟发酵、过时淘汰。

**适用条件(诚实版)**:项目只有 2-3 个 Task、几乎无任务外事件、用户勤于手写 AGENTS.md → 不需要 memory。价值随 `任务数 × 任务外事件率 × 会话切换频率` 增长。

**可证伪测试**:砍掉 memory 只用 Task+AGENTS.md 跑两周,记录 ①每次冷启动读几个文件才知道"现在用哪个、有什么坑";②重踩已知坑/重问已定夺问题的次数。两个都是零 → 不建。

## 4. 记忆契约:记什么、何时存、何时取

### 4.0 总纲

记什么由**沉淀事件**决定,存哪里由**粒度**决定,何时读写由**工作流时刻**决定。核心原则:**沉淀跟着验证走,不跟时钟走**——写入发生在被验证/被纠正/被定夺的瞬间,而非会话结束批量补写(保真度衰减,且可能永远不执行);批量只属于 curator 整固。

### 4.1 记什么:七类沉淀事件

| # | 事件 | 触发信号 | 记什么 | 类别 |
|---|---|---|---|---|
| E1 | 项目立项 | NEW 模式科学对话收敛 | 科学问题/意图 1-2 句(记忆层锚点) | Mission(L1 头部) |
| E2 | 数据勘察 | scout 发现数据怪癖 | 样本表错漏、批次结构、污染、元数据语义 | A [data] |
| E3 | 用户定夺 | 对话中用户给出选型/阈值/生物学判断 | 决策+理由,依据=用户原话(最高等级证据) | B [dec] |
| E4 | 踩坑解决 | 失败→绕过成功那一刻 | 环境坑、版本冲突、正确姿势 | F [env] |
| E5 | 路线死亡 | 决定放弃某路线那一刻 | 症状+归因+勿再试 | C [les][负面] |
| E6 | 工件晋级 | implement 完成→review 通过 | 新权威工件指针、验证结论 | D [state] |
| E7 | 用户纠正 | agent 被推翻 | 正确做法;推翻旧决策则 supersede | B/C |

E4/E5/E7 **立即写**;E6 分两拍:implement 完成写"候选",review 通过才"转正"——未验证产物不得抢注权威位。

### 4.2 粒度判定(存哪里)

```
这条知识……
├─ 一句话说得清的稳定事实(数据怪癖/环境坑/教训)? → L1 一行条目
├─ 是"当前哪个是权威"的状态?                     → L1 [state],固定 id,replace
├─ 是带 why 的选型?                              → L1 [dec] 一行+证据指针;论证细节留在 Task 文件
├─ 是 ≥5 步、验证过、可复用的流程?                → L2 SKILL.md
└─ 是过程细节/试错原文?                           → 不进记忆,留在 L3;需要时只放指针
```

### 4.3 存储框架

**L1 条目语法**(一行一世界,机器可解析):

```
- [cat] 内容 (evidence: 路径|TaskID) `(id:xxx, YYYY-MM-DD[, superseded→yyy])`
```

L1 结构 = Mission 头部一行 + 五分区(Environment/Data/Decisions/Lessons/State)。Mission 是继任者测试的锚:先知道"项目要回答什么",再读其余。

**L2 项目 skill schema**(比通用方法学 skill 多两块):

```markdown
---
name: proj-<项目>-<主题>
description: 触发词("知识被需要时最可能出现的短语")+ 溯源(验证于 TaskN,日期)
---
## 适用条件(When)   ← 这份数据的什么特性使它适用
## 步骤与参数(及依据)
## 已知边界/失败模式   ← 方法学 skill 不会告诉你的
## 证据指针
```

description 触发词是提取的关键——写得差,skill 等于不存在。

### 4.4 提取框架:三入口 + 按问题路由 + 按角色切面

**入口与成本**:L1 每会话冻结注入(常驻,~3000 字符);L2 description 常驻、正文按需 read;L3 靠 librarian 检索(P3)。

**按问题类型路由**:

| agent 遇到的问题 | 去哪读 |
|---|---|
| 现在做到哪了/哪个工件是权威? | L1 State(已在上下文) |
| 为什么当初这么选? | L1 [dec] → 证据指针下潜 L3 |
| 这数据有什么坑? | L1 [data]/[les] |
| 这项目里怎么做 X? | L2 skill(触发→read) |
| 试过什么、什么不行? | L1 [les][负面] → L3 细节 |
| 当时具体怎么做的? | L3(librarian 搜 Task/会话) |

**按角色切面分发**(子代理不读全量,各取所需):

- **scout**:读 Data + State,并做**漂移检测**——拿 State 指针对照文件系统现实,不一致 = 记忆过时 → 触发修正(不等 curator);
- **worker**(由 runner 注入压缩切面):Environment + Lessons + 本模块相关 L2 skill 路径;
- **reviewer**:读 Decisions + State——审查的本质是"结果是否兑现账本上的决策";
- **主代理**:全量 L1(已注入)。

### 4.5 时刻表(读写都挂在现有工作流节点)

| 阶段 | 读 | 写 |
|---|---|---|
| 会话开始(`before_agent_start`) | L1 冻结注入 | — |
| 模式分类 | CONTINUE→State/Data;NEW→Data/Lessons | — |
| Scout | Data + State + 漂移检测 | E2;漂移修正 |
| 科学对话 | Decisions(已定夺的不重问,对话不翻烧饼) | E3 |
| 计划定稿 | 相关 L2 skill + Decisions + State 定输入;写 Task/TaskN-*.md | E3 若未落账,此刻落 |
| Implement | worker 切面注入 | E4/E5 立即;E6 候选 |
| Review 通过 | Decisions + State | TaskN 冻结;E6 转正+验证结论;"值得沉淀?"蒸馏 |
| QUERY | 只读,答完即走 | **禁写** |
| Publication | Decisions(methods 素材)+ State | 冻结期只补成图约定 |
| 超限/手动 | — | curator 批量整固(唯一合法批量写) |

### 4.6 防污染护栏

证据指针必填;猜测不入;QUERY 禁写;State 固定 id 单一真值;superseded 不删;scout 漂移检测兜底过时。

## 5. 三层结构

```
L1  常驻层    <project>/.pi/memory/MEMORY.md      ≤3000 字符,冻结注入 system prompt
L2  沉淀层    <project>/.pi/memory/skills/*/SKILL.md   注册为 pi skills,渐进披露
L3  情景层    Task/TaskN-*.md(结构化档案,主力)+ pi 会话(原文,兜底)   复用,不做新东西
```

**L1 存"知道什么"**——环境事实、踩坑、关键决策、用户在本项目的偏好。
**L2 存"怎么做"**——被验证过的工作流(如"本数据集的注释流程"、"本环境装环境的正确姿势")、
可复用的参数组合、marker panel 等。内容超过几段的流程性知识就升级为 L2 Skill。
**L3 存原文**——完整对话与任务计划,由 Curator 挖掘素材,平时不进上下文。

## 6. 存储布局

```
<project-root>/.pi/memory/
├── MEMORY.md          # L1:结构化条目,带 id/日期/类别,超预算拒绝写入
├── skills/            # L2:自沉淀技能(标准 SKILL.md + frontmatter)
│   └── <topic>/
│       └── SKILL.md   # name: proj-<slug>-<topic>,description 含触发词
└── archive/           # 被整固淘汰的旧条目/技能;不注册进 skillPaths
```

- **in-repo 模式(默认)**:如上,可随 git 共享给协作者,历史可追溯。
- **central 模式**:`~/.pi/agent/memory/<project-slug>/`,适合私有/非 git 项目。
  由 `.pi/settings.json` 的 `projectMemory.mode` 配置,默认 repo。
- 项目标识 = git 根目录的 basename + 路径短哈希(central 模式防重名)。

### L1 条目格式

```markdown
# Project Memory — <项目名>
_Last curated: 2025-08-17 · 2147/3000 chars · 12 entries_

## Environment
- [env] conda env `sci-main`:scanpy 1.10.2 + squidpy;**勿升 scikit-misc**(破坏 seurat_v3 HVG) `(id:env-skmisc, 2025-08-17)`
## Data
- [data] 原始数据 /data/PBC/,样本表 meta/samples.csv;**存在 ambient RNA,RBC 占比虚高** `(id:data-ambient, 2025-08-15)`
## Decisions
- [dec] HVG 选 seurat_v3 而非 cell_ranger:3' 偏置;依据 Task/Task3 §2 `(id:dec-hvg, 2025-08-16)`
- [dec] ~~整合用 harmony~~ → 已被 scVI 取代(分辨率明显更干净;图见 03_Integration/plots/compare.pdf) `(id:dec-integ, 2025-08-17 superseded→dec-scvi)`
## Lessons
- [les] leiden res=0.5 在此深度过聚类,0.4 合适 `(id:les-leiden, 2025-08-17)`
- [les][负面] pyscenic 在此数据 regulon 全糊,疑因测序深度不足;勿再试 `(id:les-pyscenic, 2025-08-17)`
## State
- [state] 当前主 h5ad:02_Clustering/results/data/02_clustered.h5ad(02 完成后已替换 01) `(id:state-h5ad, 2025-08-16)`
- [state] cluster→细胞类型注释以 05_Annotation/tables/celltype_map.tsv 为唯一真值 `(id:state-annot, 2025-08-17)`
```

条目 = 一行,带类别标签([env]/[data]/[dec]/[les]/[state])、稳定 id、日期;
B/D 类必须带证据指针(路径/Task ID)。id 是 `sci_memory` 工具做 replace/remove 的句柄;State 类条目用**固定 id 反复 replace**(如 state-h5ad)以保证单一真值。

## 7. 读路径

### 7.1 L1 冻结注入(`before_agent_start`)

```
<project-memory>
以下是本项目跨会话沉淀的记忆(冻结快照,本会话不更新):
<MEMORY.md 全文>
</project-memory>
记忆纪律:发现新踩坑/用户纠正/关键决策时,用 sci_memory 立即沉淀;写入会落盘并在下个会话生效。
```

- 无记忆文件 → 注入一行:"本项目尚无记忆。在环境踩坑、用户纠正、参数定夺、流程被验证时主动建立。"
- 已有 `injectEnforcement` 逻辑,在同一注入点拼接即可。

### 7.2 L2 渐进披露(`resources_discover`)

scientist 现在返回 `skillPaths: [<pkg>/skills]`;追加项目记忆目录:

```ts
pi.on("resources_discover", async (event) => ({
  skillPaths: [
    path.join(packageRoot, "skills"),
    ...memoryStore(event.cwd).skillDirMaybe(),   // trusted 且存在时返回
  ],
}));
```

pi 原生机制保证:只有 name+description 常驻上下文(每个 skill ~几十 token),
正文由 agent 按需 `read`。L2 技能命名 `proj-<slug>-<topic>` 前缀,与内置方法学 skill 区分。
存量大项目也不怕——渐进披露天然省 token。

### 7.3 Librarian 联动(可选,二期)

`sci_librarian` 检索范围加入 `archive/` 与历史 `Task/*.md`,让"已遗忘的记忆"可被检索回来。

## 8. 写路径

### 8.1 `sci_memory` 工具(L1 的唯一写入口)

```
sci_memory({
  action: "add" | "replace" | "remove" | "list" | "consolidate",
  section?: "Environment" | "Data" | "Decisions" | "Lessons" | "State",
  content?: string,     // 一行条目(add/replace)
  id?: string,          // replace/remove 的目标
  entries?: string[],   // consolidate:整段重写后的全部条目
})
```

- `add` 时校验预算:写入后超 3000 字符 → 拒绝,返回"先 remove/合并,或调 consolidate"。
- `consolidate` 接受整段重写(仅供 Curator 或用户明确要求时使用),原子写 + 备份旧版到 `archive/`。
- 所有写操作原子化(temp + rename),并维护头部统计行。

### 8.2 L2 的写入 = 普通 `write` 工具

L2 Skill 就是文件。agent 用内置 `write` 创建
`.pi/memory/skills/<topic>/SKILL.md`(enforcement 里给出模板与 frontmatter 要求)。
不需要专用工具——渐进披露的注册在下次 `resources_discover` 自动生效;
本会话内 agent 自己知道刚写了什么。

### 8.3 记忆纪律(写进 SCIENTIST_ENFORCEMENT)

新增一节 "MEMORY DISCIPLINE",以**继任者测试**("明天换一个全新 agent,只读这份记忆能否无缝继续?")为写入判断标准。七类沉淀事件(E1–E7)、粒度判定树与各阶段读写契约见 §4 记忆契约,此处不重复;enforcement 中落地为简表:

| 时刻 | 动作 |
|---|---|
| NEW 对话收敛 | 写 Mission |
| scout 见数据怪癖 | 写 [data] |
| 用户定夺 | 写 [dec]+依据 |
| 踩坑解决/路线死亡/被纠正 | 立即写 [env]/[les] |
| 模块完成 | 写 [state] 候选;review 通过后转正 |

**写作规范**(同样写进纪律):
- 面向陌生读者、自包含;禁止"如前所述"式指代;
- [dec]/[state] 条目必须带证据指针(文件路径/Task ID);猜测未经验证不得入记忆;
- 被推翻的决策不删,标 superseded 并指向新条目 id。

禁止:QUERY 模式的临时查询不沉淀;不确定的猜测不沉淀;已在 skill 里有的不重复进 L1。

### 8.4 顺带挂到现有流程

- `sci_review` 通过后的 review 报告尾部,提示"本次有无值得沉淀的教训?";
- `/reflect` 教学对话收尾时追加一步"把本次学到的教训沉淀进记忆"。

## 9. Curator —— 防膨胀闭环

**触发条件**(满足其一):
- MEMORY.md ≥ 预算的 90%;
- L2 skills 数 > 20;
- 手动 `/memory curate`;
- 距上次整固 > 10 个会话(`memory/META` 里记会话计数,session_start 时累加)。

**执行**:复用 `core/runner.ts` 子代理机制 spawn curator(带 `SCIENTIST_NO_ENFORCEMENT=1`),
输入 = 当前 MEMORY.md + skills 目录清单 + 本会话 JSONL 摘要 + 近期 Task/*.md 列表,
输出 = 重写后的 MEMORY.md 全文 + skills 增/删/合并方案。主流程 `ctx.ui.confirm` 展示 diff,
用户确认后调用 `sci_memory consolidate` + 归档/写盘。

**整固规则**(写进 `agents/curator.md`):
- 合并语义重复条目;冲突条目新替旧:被推翻的 [dec] **不删**,改标 superseded 并指向新条目(科学记录不蒸发,归档可查);
- 超过 3 个月未被动过的 [env]/[data] 条目向用户确认后归档;
- L2:主题重叠的 skill 合并;过时 skill 移入 `archive/`;
- L1 中"超过 5 行的流程性内容"降级为 L2 skill,L1 留一行索引。

## 10. 与 scientist 的集成清单

| 文件 | 改动 |
|---|---|
| `core/memory.ts` **(新)** | 路径解析(repo/central)、读写/原子写、预算校验、条目解析、META 会话计数 |
| `tools/memory.ts` **(新)** | 注册 `sci_memory` 工具 |
| `index.ts` | `resources_discover` 追加项目 skills 路径;`before_agent_start` 注入 L1 快照;注册 memory 工具 |
| `agents/curator.md` **(新)** | curator 子代理提示词 |
| `core/commands.ts` | 新增 `/memory` 命令(status / curate / show) |
| `core/enforcement.ts` | 增加 MEMORY DISCIPLINE 一节(以 §4 契约为准) |
| `core/runner.ts` | worker 注入切面(Environment+Lessons+相关 L2 skill);reviewer 注入 Decisions+State;scout 注入 Data+State 做漂移检测 |
| `tools/scout.ts` | scout 完成后对比 State 指针,漂移时提示修正 |
| `skills/` | 无改动(方法学 skill 与项目记忆 skill 分离) |

规模估计 ~500–600 行;全部落在 scientist 扩展内,零外部依赖。

## 11. 关键取舍记录

- **为什么不挂到 `.pi/skills/` 现有目录**:避免用户手写 skill 与 agent 自沉淀 skill 混在一起;`proj-` 前缀 + 独立目录让 Curator 可以放心批量整固,且 git 历史清晰(`.pi/memory/` 一个目录管住所有自沉淀物)。
- **为什么会话内不重注入**:Hermes 的教训——中途改 system prompt 会打断前缀缓存,长会话成本不可控。写盘立即可见(文件在),注入下会话才变。
- **为什么 L2 不设字符预算**:L2 靠渐进披露,常驻成本只有 description;给 Curator 设"数量 + 主题重叠"治理即可,内容长度不敏感。
- **为什么 QUERY 模式禁止沉淀**:防止一次性查询把记忆层当垃圾桶;沉淀只发生在"被验证/被纠正/被定夺"的时刻。
- **为什么条目必须带证据指针**:项目记忆的真伪标准是证据而非用户断言;无指针的条目会让记忆退化为谣言引擎(幻觉被跨会话放大)。
- **为什么 State 用固定 id replace 而非追加**:状态需要单一真值;追加式状态会迫使读者自行推断"哪条最新",在自动化场景等于埋雷。

- **为什么没有"会话结束自动总结"**:沉淀跟验证走不跟时钟走(E4/E5/E7 立即写);会话末批量补写保真度差、易被中断,且与 QUERY/短会话场景冲突。批量只属于 curator 整固。
- **为什么按角色切面分发记忆**:控制子代理上下文成本,同时反向约束"记什么"的边界——记 worker 需要的坑、reviewer 需要的账、继任者需要的状态。
- **为什么 State 晋级要等 review 通过**:未验证产物抢注权威位会让后续会话基于错误工件展开;两拍制(候选→转正)与科学工作流的验证环节同构。

## 12. v0 最小版:一个文件、一次注入、一段纪律

回头看,前十章把 Hermes 的"机制"照搬了,但 pi 已有 Hermes 缺的轮子(精确的 edit/write、skill 渐进披露)。最小设计只留三个触点,~50 行代码:

1. **注入**(`before_agent_start`):读 `<cwd>/.pi/memory/MEMORY.md`,存在则拼为 `<project-memory>` 块进 system prompt(冻结快照);
2. **路径注册**(`resources_discover`):`.pi/memory/skills/` 存在时追加进 skillPaths,pi 原生渐进披露接管;
3. **纪律**(enforcement 加一节):何时写/怎么写/继任者测试/放不下就写 skill。

**没有新工具、没有新命令、没有 curator、没有 id/预算/解析器**。L1 就是一个普通 markdown 文件,agent 用内置 edit/write 直接维护;子代理不注入任何东西——主代理在任务简报里转述相关行,零代码。Task 文件(analysis-planning 已在生产)纳入四家分管同样零代码——只是纪律段里的两条契约:计划前读记忆、完成后蒸馏回写。

### MEMORY.md 模板(v0)

```markdown
# Project Memory — <项目名>

> 目标:换一个全新 agent 只读这份文件也能接手。全文 <150 行;满了就合并/删旧,不无限追加。

## Mission(一行)
本项目回答:<科学问题>。(立项时写,冷启动锚)

## State(当前状态 — 永远保持最新)
- 当前主 h5ad:02_Clustering/results/data/02_clustered.h5ad(02 完成后替换了 01)
- 注释唯一真值:05_Annotation/tables/celltype_map.tsv

## Decisions(可选:跨任务最终决策缓存;任务少时省略,读最新 TaskN 的 Methodology 即可)
- HVG 用 seurat_v3 弃 cell_ranger:3'偏置(Task3 §2)
- ~~整合用 harmony~~ → 改 scVI:分辨率更干净(03_Integration/plots/compare.pdf)

## Lessons(坑与死路)
- 勿升 scikit-misc,会破坏 seurat_v3 HVG
- pyscenic 在此数据上 regulon 全糊,勿再试

## Environment
- conda env sci-main:scanpy 1.10 + squidpy;R 用 rl-env
```

### 纪律段(v0,写进 enforcement)

```text
MEMORY DISCIPLINE:
- 记忆文件 .pi/memory/MEMORY.md,用 edit/write 直接维护,普通文件而已
- 何时写:用户定夺选型/阈值时;踩坑解决时;决定放弃某路线时;被用户纠正时;review 通过产出新权威工件时(更新 State)
- Task 蒸馏:计划前先读记忆(Decisions/Lessons/State 定输入);review 通过后把 TaskN 中跨任务有用的结论蒸馏为一行进记忆,指针指回 TaskN 章节
- 怎么写:一行一条;决策必带依据(用户原话或文件/Task 指针);State 原地更新保持单一真值;
  被推翻的决策划线保留并注新依据,不删行;写入立即落盘,下会话生效(本会话注入不更新)
- 放不下/超过几段的可复用流程 → 写 .pi/memory/skills/<topic>/SKILL.md(pi 自动发现)
- 不写:QUERY 查询、未验证猜测、通用方法论(那属于方法学 skill)
- 继任者测试:只写"明天换一个新 agent,只读这份文件能少走弯路"的内容
```

### 机制→约定降级表(砍掉的与加回时机)

核心原则:**先约定,后机制**。约定被违反的痛点出现时,才把该条约定升级为机制。

| 原设计机制 | v0 形态 | 什么信号出现再加回 |
|---|---|---|
| sci_memory 工具(id/证据指针/预算校验) | prompt 约定 + git 兜底 | 条目污染、格式漂移、失控增长 |
| Curator 子代理 + 自动触发 | 手动让 agent"整理一下记忆" | 文件常超预算,整理变例行公事 |
| 两拍制 State 晋级 | 纪律一句:"review 通过才写 State" | 未验证工件被记为权威 |
| 角色切面注入(runner 改造) | 主代理在子代理简报里转述 | worker 频繁重踩已知坑 |
| 漂移检测(scout 对账) | — | State 指针频繁过时 |
| /memory 命令、central 存储 | — | 有真实需求再说 |

### 演进路径

- **v0**:上面三触点,跑真实项目 2-4 周,观察哪些约定被违反;
- **P1**:把被违反的约定升级为机制(工具校验/curator/切面注入,规格见 §4-§9);
- **P2**:librarian 纳入 memory 与 Task 历史检索。

前十章的全部规格在此不浪费——它们是"痛点出现后按图施工"的图纸,v0 是先验证值得施工。
