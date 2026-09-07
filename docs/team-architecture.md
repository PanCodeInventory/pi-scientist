# Scientist 多智能体架构

主代理负责科学决策、任务拆分、与用户沟通和最终验收。实质分析默认委派 Worker；Scout 与 Librarian 按需参与。Reviewer 由主代理根据复杂度、异常、核心结论风险或用户要求选择，可以在执行前或执行后调用，没有自动 review 链。

## 运行层

- Herdr 内默认使用 Herdr 后端：在当前 pane 下分出专家 pane，保留用户焦点，使用本机 CLI 的 agent start/prompt 接口。
- Herdr 外默认使用 tmux 专家后端；也可显式指定 backend。Herdr 调用失败不会自动换后端重新启动同一个任务。
- 每次尝试保存独立 Pi session，沿用 agents/ 下的模型、工具和领域 Skills。子代理只增加 sci_handoff，不能调度团队或接受任务。
- 分析长计算仍用现有 tmux-runner。专家会话和计算作业有不同身份与生命周期；停止专家不会自动停止独立计算。

这些是协作和目录约定，不是操作系统沙箱。工具限制和角色提示不能保证 bash 无法写入其他目录。

## 调度接口

`sci_dispatch` 创建持久任务，默认立即启动。必须提供已明确的分析父目录、角色、任务说明、输入、已确认决策、写入范围和验收条件。只读角色的 writeScopes 使用空数组。

```js
sci_dispatch({
  cwd: "/analysis/project",
  role: "worker",
  task: "按已确认设计执行 T 细胞差异分析并自检",
  inputs: ["/data/annotated.h5ad"],
  decisions: ["使用已确认的 treatment vs control 对比与 donor 配对设计"],
  writeScopes: ["03_DE"],
  criteria: ["核对 counts 层、donor 与配对关系", "输出可复现脚本、差异表和实际验证记录"],
  backend: "herdr"
})
```

返回的是 task ID、attempt ID 和终端信息，不是分析结果。依赖任务用 `dependsOn: ["task-..."]`、`start: false` 创建，主代理验收上游后通过 `sci_tasks start` 启动。

`sci_tasks` 操作：

| action | 行为 |
|---|---|
| list / get | 对账交接文件和已记录的计算状态，返回任务记录 |
| start | 启动 pending 任务；依赖必须 accepted，默认最多 3 个未关闭的专家尝试 |
| accept | 主代理填写 evidence，核对产物及已记录作业；关闭空闲专家并标记 accepted |
| resume | 主代理填写继续/修正说明；关闭旧的空闲尝试，保留其记录，创建新尝试 |
| cancel | 停止具有可验证身份的专家，保留独立 tmux 计算 |

相互重叠的写入目录不能并发分配。取消专家后，如果其已记录计算仍未产生退出状态，输出目录仍保留占用。工作进程实际消耗的 CPU/内存/GPU 由主代理在设计和启动脚本时限制；maxConcurrent 只限制专家数量，不是计算资源调度器。

accepted 任务不能原地恢复修改；后续变更创建新任务和模块，保留上游证据。Reviewer 本身也是独立任务，其交付由主代理判断，不会自动将被审查 Worker 标记通过或失败。

## 交接与状态

```text
pending → running → submitted → accepted
                 ↘ waiting_compute → blocked → resume（新 attempt）
                 ↘ blocked / failed → resume（新 attempt）
pending / 运行中的任务 → cancelled
```

子代理通过 `sci_handoff` 提交 summary、outputs、checks 和 jobs。工具校验任务/尝试身份，将交接暂存；正常结束该轮后才发布。模型错误、中断或输出截断不能发布为正常交接。submitted 表示执行者已自检，主代理仍需独立核对科学有效性。

长计算以 `waiting_compute` 交接，jobs 包含唯一 `sci_` session 名称和模块内 log/status 路径。每次尝试使用新名称，避免旧 status 被误认作本次结果。主代理接到计算退出通知后，恢复 Worker 读取日志并验证内容；零退出不会自动提交或验收。

主代理 Pi 扩展每 10 秒用普通代码检查状态，只在状态变化时发送通知并触发后续回合。没有模型轮询，也没有独立常驻调度服务。主代理离线时，已经启动的专家和计算继续运行；新依赖任务的启动与最终验收要等主代理接续。

## 持久化与恢复

```text
<analysis>/.scientist/
  state.json                         # 主代理维护的任务、依赖、尝试与验收
  state.lock                         # 短事务锁，正常操作后移除
  runs/<task-id>/<attempt-id>/
    assignment.json                  # 启动时任务快照
    brief.md / role.md               # 交接上下文和角色
    session.jsonl                    # Pi 原生会话（由 Pi 写入）
    lifecycle.json                   # Pi 生命周期
    jobs.json                        # 已登记的计算路径
    handoff.pending.json             # 尚未正常结束该轮的交接
    handoff.json                     # 已发布交接
    launch.sh / exit-code            # tmux 专家后端使用
```

第一版使用加锁、原子替换的 JSON 状态文件，避免为本地框架引入额外数据库服务。机器记录不放入 Task/，分析产物不放入 .scientist/。Task Markdown 由主代理更新。

在分析目录打开新的 Pi 会话时自动提示已有任务；如果原分析目录与当前目录不同，使用 `sci_tasks({cwd: 原目录, action: "list"})` 重新接管。恢复会保留历史会话与交接，新的 attempt 通过任务文件和产物接续，不把旧会话中的隐含假设自动作为新指令。

连接失败或终端身份不明时保持未确认状态，不自动宣布进程消失、不重复启动。启动过程在创建 pane 后立即记录身份；在创建 pane 与落盘之间发生崩溃等极小窗口，仍需要人工检查。机器重启不能恢复原计算进程；须检查真实状态再决定重跑。若协调进程在写状态时崩溃留下 state.lock，先检查锁中 host/pid 确认原协调进程已停止，再移除这个锁。不要在两个主代理会话中同时操作同一项目。

未及时交接的作业可能还未进入 jobs.json，因此任何异常重试仍需检查模块 tmux 日志与真实进程。科学内容校验由 Worker 和主代理承担；框架只能检查结构、身份、路径及部分运行不变量。

## 兼容与验证

原 sci_implement / sci_review / sci_scout / sci_librarian 保留为同步单次工具，仍支持旧 planFile。它们不进入新的持久任务状态；实质团队分析使用 sci_dispatch。不自动修改 Pi 的工具启用选择。

原报告、Publication、图形与长计算目录规范不变。各专家模型覆盖顺序不变。异步专家拥有独立 Pi 会话；主代理会话显示的 usage 不自动包含这些会话的全部费用，不能用它当作团队总成本。

测试覆盖任务依赖、并发和目录冲突、任务验收、可选审查、交接身份、恢复、终端调用与参数边界。不使用研究数据或付费模型；测试通过不证明科学结果正确。
