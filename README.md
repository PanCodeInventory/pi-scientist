# pi-scientist

面向生物信息分析的 Pi 多智能体框架：**主代理统筹与验收，Worker 执行并自检，Reviewer 按复杂度和风险调用。**

Herdr 管理专家会话，tmux 托管长计算，Scientist 记录任务、依赖、交接与验收。简单查询、小修改仍由主代理直接完成。

## 开始使用

```bash
pi install /absolute/path/to/pi-scientist
# 临时加载源码
pi -e ./index.ts
```

在 Herdr pane 中运行 Pi 会默认使用 Herdr 专家后端；在其他终端默认使用 tmux 专家后端，也可以通过 backend 参数显式选择。二者都保存独立的 Pi 会话。已有扩展用 `/reload`，建议新会话开始分析，避免旧提示词继续影响调度。

直接提供研究问题、数据位置、已知约束和结果父目录。主代理检查现状后拆分任务，调用 Worker，读取交接证据，再决定验收、修正或请 Reviewer 独立审查。没有强制问答配额、契约门禁或自动 Worker→Reviewer 链。

## 团队工具

| 工具 | 用途 |
|---|---|
| `sci_dispatch` | 创建持久任务，异步启动 Worker / Scout / Librarian / Reviewer；返回任务标识 |
| `sci_tasks` | list/get 查看与恢复状态；start 启动依赖已满足的任务；accept 验收；resume 继续或修正；cancel 停止专家 |
| `sci_handoff` | 仅分配到任务的子代理可用，提交真实结果、自检证据或计算日志；不能验收或派工 |
| `ask_user_question` | 主代理询问影响科学意图与交付的未知选择 |
| `sci_logs` | 查询分析模块的 tmux 日志，latest 不代表权威结果 |

默认最多 3 个未关闭的专家尝试，写入范围不能冲突。依赖只有在主代理显式 accept 后才可运行。Worker 的 submitted、Herdr 的 done、进程零退出都不等于科学验收。

```js
sci_dispatch({
  cwd: "/analysis/project",
  role: "worker",
  task: "按已确认 donor 配对设计执行 03_DE，并验证实际结果",
  inputs: ["/data/annotated.h5ad"],
  decisions: ["已确认 treatment vs control，以及 donor 配对关系"],
  writeScopes: ["03_DE"],
  criteria: ["验证数据层与配对关系", "生成可复现脚本和差异表，并报告实际检查"]
})
// 收到任务更新后检查结果；evidence 是主代理实际检查的证据。
sci_tasks({ cwd: "/analysis/project", action: "list" })
```

长计算继续使用 tmux-runner。专家以 waiting_compute 提交作业路径，主代理在计算结束后恢复 Worker 验证产物。停止专家不会自动终止独立计算；重试前检查实际作业状态。

`.scientist/` 保存持久机器记录与原生会话，`Task/` 是可选的人类可读计划，分析产物保持 `<NN>_ModuleName/` 布局。主代理在线时会收到状态变化通知；离线时已启动的工作继续运行，重新进入后通过 sci_tasks 接续调度。

详细协议、参数示例、状态与恢复限制见 [架构说明](docs/team-architecture.md)。

## 兼容工具与按需交付

`sci_implement`、`sci_review`、`sci_scout`、`sci_librarian` 保留为同步单次工具，支持原参数与旧 planFile，不进入持久团队任务系统。其默认超时仍为 600 秒；超时后脱离运行的计算可能继续。

- `/generate-report [范围]`：中文自包含 HTML 报告，无 Task 也可以生成。
- `/publication [范围]`：按一图一 Notebook、相对路径、PNG+PDF 与 Run All 规范整理既有结果。
- `/reflect [主题]`：结合实际结果讨论方法和局限。
- `/science-contract`：查看当前分支问答记录，不作为执行门禁。

工作与交付规范见 [docs/conventions.md](docs/conventions.md)，图形标准和领域科学要求保留。没有用户要求不自动 commit/push。非交互模式不能弹出问答 UI；取消或未回答不能视为同意。

子代理不能通过 Scientist 工具递归派工。角色的只读/输出范围约束**不是文件系统或网络沙箱**。扩展尊重 Pi 的 `--tools` / `--exclude-tools` 选择，不每轮反向开启被禁用的工具。

## 模型配置

沿用既有角色模型，覆盖顺序为：

```text
SCIENTIST_MODEL_<ROLE> > agents/<role>.md 的 model > SCIENTIST_MODEL_DEFAULT
```

统一模型需显式设置 WORKER、REVIEWER、SCOUT、LIBRARIAN 四个覆盖值。`SCIENTIST_NO_ENFORCEMENT` 仅跳过调度提示，保留交付规范；`SCIENTIST_SUBAGENT=1` 为内部标记。

异步专家费用记录在各自的 Pi 会话中，目前不会自动汇总到主代理 usage。主代理显示金额不能视为完整团队成本。

## 开发与验证

```bash
npm run typecheck
npm test
npm pack --dry-run
```

测试使用本地测试夹具，不调用付费模型、不读取研究数据。覆盖旧工具兼容、问答、任务依赖、目录所有权、交接、验收、恢复与终端适配器。通过测试不证明生物学正确性或实际提速。

`docs/rule-audit.md` 记录前一次流程改革的历史分类；当前调度以代码和 team-architecture.md 为准。`PROJECT-MEMORY-DESIGN.md` 仍是暂不实施的历史方案。
