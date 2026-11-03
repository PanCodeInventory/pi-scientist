---
name: subagent-delegation
description: "Dispatch bounded analysis work to a separate pi session as a Herdr agent pane (requires HERDR_ENV=1; tmux is the fallback route when not inside Herdr). Use when delegating a sizable, well-scoped task to a subagent, running concurrent analysis lines, or reusing a live session for follow-up instructions. Completion is declared by a result file, never inferred from screen appearance; long-running computation inside a task still uses the tmux-runner skill."
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
  result.md       # worker 完成时写(哨兵)
  session.jsonl   # worker 的原生会话文件(续接/复盘用)
```

brief 模板要点:一句话目标;输入绝对路径;已确认决定;write scopes(只读任务写明"不修改任何文件");可操作的验收标准;长计算要求用 tmux-runner 并指定唯一 `sci_<module>_<step>` 会话名;结尾明确"完成或受阻时把结论写入 <run>/result.md;禁止 git commit"。

按需补两行,不新建协议文件:
- **重跑与依赖**:前置产物及完成检查;固定输入重跑是否安全、是否允许把自身输出作输入、覆盖边界。
- **证据冲突**:双方分别提交支持/反证、数据来源与可复现检查;协调者按预先约定的直接证据和独立验证裁决,不按票数或 worker 自信程度裁决。细胞注释中,经核对的标记表达/污染证据优先于单纯邻域相似性;证据仍冲突则保留不确定性。

`result.md` 应明确 completed / blocked 及未通过项;文件存在只是可以收取,不代表成功。

## 布局规范(固定,不可省略)

每发起一次整体任务,在**当前 workspace 下新开一个 tab(window)**,tab 的 label 就是**本次整体任务名称**(可中文,自由命名);**每个 worker 一个 pane**,worker 的 agent 名就是**细分任务名**(pane/侧栏里显示的就是它)。一眼就能回答"哪个任务在哪、谁在跑"。

```bash
# 1) 任务窗口:label = 整体任务名
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "<analysis>" --label "<整体任务名>"
#    → 记下 .result.root_pane.pane_id(窗口里第一个 pane)
# 2) 第一个 worker 直接用 root pane;之后每个 worker 在窗口内 split 出新 pane
herdr pane split --pane <该窗口任一 pane_id> --direction right --cwd "<analysis>" --no-focus
#    → 方向看当前布局,宽的向右、高的向下;均 --no-focus,不抢用户焦点
# 3) 每个 pane 起一个命名 agent:agent 名 = 细分任务名
RUN=<analysis>/.sci/runs/<worker-slug>; mkdir -p "$RUN"   # 然后写 brief.md
herdr agent start <worker-slug> --kind pi --pane <pane_id> -- --session "$RUN/session.jsonl"
# 4) 在派工方的 bash 中绑定归属(脚本路径相对于本 skill 目录,执行时换成绝对路径)
#    仅 agent start 成功且 Pi 已报告 session 身份后绑定;失败就先检查,不要继续 prompt
python3 <本skill绝对路径>/scripts/bind-worker.py <pane_id> "$RUN"
# 5) 按已确认的 pane ID 发任务,不要只凭全局可重用的 agent 名定位
herdr agent prompt <pane_id> "读 $RUN/brief.md 并完成。完成或受阻时把结论写入 $RUN/result.md。"
```

每个新任务用新的 worker-slug;不要把上次的 result.md/released 当作新任务状态。

**命名规则**:agent 名只能是 `[a-z][a-z0-9_-]{0,31}`——细分任务名为中文时转小写 kebab-case 英文名(如 `atlas-build`、`atlas-review`),目录也用这个 slug;中文任务名放 tab label。命名只用于显示,不代表派工归属。`bind-worker.py` 会核对 workspace、派工 pane/当前 Pi session、worker pane/session.jsonl 及其原生 session ID,再将绑定原子写入**派工会话启动目录**的 `.sci/herdr-watch/<dispatcher-session-id>/<worker-slug>.json`。run 目录可以在分析子目录内,回告会读取绑定的绝对路径。不要手写/复制绑定,也不要在 worker pane 内代派工方执行绑定。

全部用 herdr 原生命令组合,不需要任何自定义工具。要点:
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
tmux new-session -d -s "<worker-slug>" -c "<analysis>"
tmux send-keys -t "<worker-slug>" "pi --session '$RUN/session.jsonl'" Enter
sleep 5
tmux send-keys -t "<worker-slug>" "读 '$RUN/brief.md' 并完成。完成(或受阻)时把结论写入 '$RUN/result.md'。" Enter
# 需要结果时用 bash 挂起自己:
while [ ! -s "$RUN/result.md" ] && tmux has-session -t "<worker-slug>" 2>/dev/null; do sleep 30; done
```

降级路线的已知限制(也是默认走 herdr 的原因):tmux 判不了 idle/working,**没有自动回告**,派工方只能自己循环等哨兵;`capture-pane` 只用于人会看或定性死亡现场,不作为状态依据。

## 并行与额度

默认同时活跃任务 ≤ 3 个;每个任务 write scopes 互不重叠(自己排目录,没有代码替你查)。worker 验收后才能视为释放额度。
