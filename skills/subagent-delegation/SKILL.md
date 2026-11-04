---
name: subagent-delegation
description: "Dispatch bounded analysis work through sci_delegate: Jev selects difficulty and vision requirements, then launches a separate pi session as a Herdr agent pane (requires HERDR_ENV=1; tmux is the fallback route when not inside Herdr). Use when delegating a sizable, well-scoped task to a subagent, running concurrent analysis lines, or reusing a live session for follow-up instructions. Completion is declared by a result file, never inferred from screen appearance; long-running computation inside a task still uses the tmux-runner skill."
---

# 子代理派工(herdr 主线,tmux 降级)

把边界清晰的工作交给另一个 pi 会话执行。**子代理本身用 herdr 管;任务内部的长程计算照旧用 tmux-runner**——两者解决不同问题(herdr 管会话生命周期与状态,tmux-runner 管"活过超时 + 留执行档案"),不互相替代。

## 不可协商的约定

1. **哨兵文件即完成定义**。worker 完成时必须把结论写入 `.sci/runs/<worker-slug>/result.md`(自包含:做了什么、实际核对项、产物路径、遗留问题)。**没有 result.md 一律视为未完成**——herdr 的 idle/done 只代表"落定",告诉你"可以去看",不代表"完成了你的任务"。
2. **验收由派工方亲自做**:读产物、核对验收标准、抽查日志;不接受 worker 自述。
3. **worker 消失 ≠ 任务完成**。agent 退出但没写 result.md 时,先查日志和产物再定性。
4. **blocked 状态要人工处理**:worker 弹出审批/提问(如 ask_user_question)时 herdr 标 `blocked` 且拒绝盲发输入;到该 pane 人工处理,不要试图代答。

## 目录与 brief 约定

```
<analysis>/.sci/runs/<task-slug>/
  brief.md        # 派工前写:任务、输入、已确认决定、可写目录、验收标准、长计算会话名
  dispatch.json   # sci_delegate 自动写:分类、路由、启动阶段与会话身份;用于排查部分失败
  result.md       # worker 完成时写(哨兵)
  session.jsonl   # worker 的原生会话文件(续接/复盘用)
```

brief 模板要点:一句话目标;输入绝对路径;已确认决定;write scopes(只读任务写明"不修改任何文件");可操作的验收标准;长计算要求用 tmux-runner 并指定唯一 `sci_<module>_<step>` 会话名;结尾明确"完成或受阻时把结论写入 <run>/result.md;禁止 git commit"。

按需补两行,不新建协议文件:
- **重跑与依赖**:前置产物及完成检查;固定输入重跑是否安全、是否允许把自身输出作输入、覆盖边界。
- **证据冲突**:双方分别提交支持/反证、数据来源与可复现检查;协调者按预先约定的直接证据和独立验证裁决,不按票数或 worker 自信程度裁决。细胞注释中,经核对的标记表达/污染证据优先于单纯邻域相似性;证据仍冲突则保留不确定性。

`result.md` 应明确 completed / blocked 及未通过项;文件存在只是可以收取,不代表成功。

## Jev 路由与派工

新 worker 使用 **sci_delegate** 一次完成:读取 brief → Jev 分类 → 固定路由 → 启动 → Herdr 归属绑定 → 发任务。不手选模型、不自行拼 pi 启动命令。先写好 brief,把方法是否已定、需要哪些判断、是否必须直接看图写清楚;brief 不超过 48 KiB,分类时不要再改。Jev 只看 brief,不读取主会话、原始数据或图片本身。

Jev 分别判断 `difficulty=easy/mid/hard` 与 `needsVision`;运行耗时不等于推理难度。直接检查截图、图形布局或组织形态时设置 `requiresVision=true` 强制视觉能力;仅生成图片或处理数值表不算。false 不会覆盖 Jev 的正向视觉判断。

| 难度 | 无 vision | 有 vision |
|---|---|---|
| easy | ollama-cloud/minimax-m3.1-flash · low | zai-coding-cn/glm-5.3-flash · low |
| mid | zai-coding-cn/glm-5.3 · high | ollama-cloud/deepseek-v4.1-flash:1017 · high |
| hard | openai-codex/gpt-6-astra · high | openai-codex/gpt-6-astra · high |

分类失败、模型不可用或能力不匹配时不会静默降档/换 provider。`dispatch.json` 是一次启动的收据,不是任务状态系统,不代替 Herdr/result.md。启动前失败:查明原因后用新 slug 派工;启动/绑定/提交途中失败:先查收据、pane、session 和绑定,不盲目重跑工具或重发 prompt。`agent_prompt_stalled` 也可能已提交。工具不会自动关闭可能仍在工作的 worker。

工具用 Pi 原生 SessionManager 写入一条“等待后续任务”的初始化用户消息以落盘会话身份,不产生额外模型调用;绑定成功后才发真实任务。新派工分类一次;同会话普通补充不重新分类或换模型。实质改变范围/视觉需求时重新拆成新任务,先处理旧 worker 的写入边界。

## 布局规范(固定,不可省略)

每发起一次整体任务,在**当前 workspace 下新开一个 tab(window)**,tab 的 label 就是**本次整体任务名称**(可中文,自由命名);**每个 worker 一个 pane**,worker 的 agent 名就是**细分任务名**(pane/侧栏里显示的就是它)。一眼就能回答"哪个任务在哪、谁在跑"。

```bash
# 1) 任务窗口:label = 整体任务名
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "<analysis>" --label "<整体任务名>"
#    → 记下 .result.root_pane.pane_id(窗口里第一个 pane)
# 2) 第一个 worker 直接用 root pane;之后每个 worker 在窗口内 split 出新 pane
herdr pane split --pane <该窗口任一 pane_id> --direction right --cwd "<analysis>" --no-focus
#    → 方向看当前布局,宽的向右、高的向下;均 --no-focus,不抢用户焦点
# 3) 准备 run 和 brief;worker 名取自目录末级 slug
RUN=<analysis>/.sci/runs/<worker-slug>; mkdir -p "$RUN"
# 用 write 写 $RUN/brief.md,然后调用下面的 sci_delegate 工具
```

```json
{
  "cwd": "<analysis绝对路径>",
  "runDir": "<analysis绝对路径>/.sci/runs/<worker-slug>",
  "paneId": "<新worker的pane_id>",
  "requiresVision": false
}
```

工具名为 `sci_delegate`。成功后已完成启动、绑定和发任务,不要再执行一次 `agent prompt`。同一整体任务的后续 worker 在同 tab split 新 pane 后分别调用。工具返回的 pane/session/run 身份用于后续监看,不用全局 agent 名猜归属。

```bash
# 已有旧 worker 或部分启动失败时,仅在真正派工会话核对身份后手动修复绑定:
python3 <本skill绝对路径>/scripts/bind-worker.py <pane_id> "$RUN"
```

每个新任务用新的 worker-slug;不要把上次的 result.md/released 当作新任务状态。

**命名规则**:agent 名只能是 `[a-z][a-z0-9_-]{0,31}`——细分任务名为中文时转小写 kebab-case 英文名(如 `atlas-build`、`atlas-review`),目录也用这个 slug;中文任务名放 tab label。命名只用于显示,不代表派工归属。`bind-worker.py` 会核对 workspace、派工 pane/当前 Pi session、worker pane/session.jsonl 及其原生 session ID,再将绑定原子写入**派工会话启动目录**的 `.sci/herdr-watch/<dispatcher-session-id>/<worker-slug>.json`。run 目录可以在分析子目录内,回告会读取绑定的绝对路径。不要手写/复制绑定,也不要在 worker pane 内代派工方执行绑定。

布局和后续管理仍用 herdr 原生命令;只有新 worker 的路由与启动走 sci_delegate。要点:
- 动手前确认在 Herdr 内:`test "${HERDR_ENV:-}" = 1`(不在则走 tmux 降级路线)
- CLI 错误走 JSON 的 `error` 字段而 **exit code 仍为 0**;脚本化判断必须 parse JSON
- `agent prompt` 报 `agent_prompt_stalled` = 提交了 5 秒无活动,先 `agent get`/`agent read` 查看,不要重发

## 监看与收取

- **自动**:仅监看显式绑定到**本 workspace + 派工 pane + 当前 Pi session ID** 的 worker;不会按全局 agent 名、项目目录、当前焦点或同 workspace 猜测归属。子代理 `working→idle/done`、进入 `blocked`、或已确认身份的 agent 消失时回告观测时间、pane、run 路径和 result.md 快照。同一结果版本的重复 idle 被去重;CLI 错误不当作全体消失。回告可能排队延迟,已验收/释放的旧通知直接忽略;没有通知也不能证明任务仍在运行。
- **旧任务迁移**:更新后各派工会话执行 `/reload` 才会停止旧版全局 watcher。未绑定任务保持静默,不会自动认领;需要回告时,在真正的派工会话中核对 worker pane 和 run 后运行上述绑定脚本。`/new`、切换会话或换 pane 不继承其他会话的绑定;同一会话原 pane `/reload` 可恢复绑定。首次观测只建立基线,不补发历史事件。
- **手动**:`herdr agent get <pane_id>`;`herdr agent read <pane_id> --source recent-unwrapped --lines 80`;或按布局规范直接切到任务 tab 亲眼看。

## 收取与返工

```bash
# 回告 idle 后:读 $RUN/result.md 与产物,逐条核对验收标准
# 需要返工/补充(同会话继续,上下文保留):先归档旧哨兵,避免误认本轮完成
mv "$RUN/result.md" "$RUN/result.previous.md"
rm -f "$RUN/released"
herdr agent prompt <pane_id> "补充:……(修正后继续写 result.md)"
# 验收通过/放弃后释放:先记下主动释放意图,避免 watcher 将其作为异常提醒
# pane close 连进程一起回收(pi 无自退命令,不要 prompt 它 "/exit")
touch "$RUN/released"
herdr pane close <pane_id>
# 检查返回 JSON: pane_not_found 仅在已确认主动释放时视为已清理;
# 其他失败先核对 pane/agent 是否仍活着,撤销 released 后再处理。
```

复盘完整过程:worker 的原生会话在 `$RUN/session.jsonl`。

## tmux 降级路线(仅派工方不在 Herdr 内时)

```bash
RUN=<analysis>/.sci/runs/<worker-slug>
# 写 brief 后调用 sci_delegate({cwd: <analysis>, runDir: <RUN>}),不传 paneId。
# 工具按相同路由在独立 tmux 会话启动 pi 并传入任务,不提供自动回告。
# 需要结果时用 bash 挂起自己:
while [ ! -s "$RUN/result.md" ] && tmux has-session -t "<worker-slug>" 2>/dev/null; do sleep 30; done
```

降级路线的已知限制(也是默认走 herdr 的原因):tmux 判不了 idle/working,**没有自动回告**,派工方只能自己循环等哨兵;`capture-pane` 只用于人会看或定性死亡现场,不作为状态依据。

## 并行与额度

默认同时活跃任务 ≤ 3 个;每个任务 write scopes 互不重叠(自己排目录,没有代码替你查)。worker 验收后才能视为释放额度。
