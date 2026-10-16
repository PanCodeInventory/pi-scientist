# pi-scientist

面向生物信息分析的 Pi 能力包:科学工作原则、共享交付规范、领域与运行技能,以及按需调用 tmux / Herdr 的子代理派工约定。无内置角色、模式或协调状态机;派工是纯文本约定,不依赖扩展工具。

## 加载方式

```bash
pi install /absolute/path/to/pi-scientist
# 临时加载
pi -e ./index.ts
```

## 提供什么

| 入口 | 用途 |
|---|---|
| 19+ 领域与运行技能 | 经 `resources_discover` 自动加载;含 tmux-runner(长计算)与 subagent-delegation(派工约定) |
| 科学原则、代码风格与交付规范 | 每次回合注入(`SCIENTIST_NO_ENFORCEMENT=1` 只跳过原则,保留代码风格与交付规范) |
| `ask_user_question` | 询问影响科学意图的未知选择,含推荐项/选项 UI |
| `sci_logs` | 查询各模块 tmux 计算的 manifest.jsonl(跑了什么、成败、耗时、日志) |
| `/generate-report` | 按需中文自包含 HTML 报告 |
| `/publication` | 按需一图一 Notebook,实际执行验证 |
| `/reflect` | 结合真实结果讨论方法与局限 |

## 子代理派工

不再内置协调工具与 worker/leader 模式。需要把工作交给另一个 pi 会话时,按 **subagent-delegation** skill 的约定执行:

- **子代理用 herdr(主线,需派工方在 Herdr 内)**:固定布局——当前 workspace 下每个整体任务一个 tab(label = 任务名),窗口内每个 worker 一个 pane(agent 名 = 细分任务名),全部用 `herdr tab/pane/agent` 原生命令;本会话在 Herdr 内时,扩展自带 watcher,命名子代理 `idle/done`、`blocked` 或退出时会自动回告(含 result.md 是否就绪)
- **tmux 为降级路线**(不在 Herdr 内时):`tmux new-session` 起裸 `pi --session` + 哨兵文件循环等待,无自动回告

两条路线共享同一约定:worker 完成必须写 `.sci/runs/<task>/result.md`(哨兵),验收由派工方亲自读产物、核对标准,不接受 worker 自述。详见 `skills/subagent-delegation/SKILL.md`。

## 长计算

与子代理派工是两件事,**子代理任务内部的重活也照旧用 tmux-runner**:wrapper 让脚本活过会话超时,并在模块 `tmux/` 目录留 `.status`/日志/`manifest.jsonl`,会话完成后自动退出(不残留空 tmux 会话)。主会话用 `sci_logs` 查询执行历史。

## 升级与验证

旧版本的任务系统(`sci_dispatch` / `sci_tasks` / `sci_sessions` / `sci_handoff`)、worker/leader 模式、`/scientist`、`/science-join` 已全部删除。历史项目的 `.scientist/` 目录(含 state.json、runs、sessions 记录)原地保留仅作归档,新代码不读写;继续工作时用 subagent-delegation 的流程重新派工即可。

`SCIENTIST_MODE`、`SCIENTIST_TEAM_ROOT`、`SCIENTIST_SESSION_ID`、`SCIENTIST_MODEL_DEFAULT`、`SCIENTIST_RUNTIME_CONFIG` 均不再生效。`SCIENTIST_NO_ENFORCEMENT` 保留(仅跳过科学原则)。

默认代码风格为线性、命令式、研究脚本式（linear imperative research scripting）：从上到下执行，减少无必要的封装、抽象、循环和防御性代码；简单操作尽量单行，不强制 Black/PEP 8 式展开。保留科学正确性所需的检查，用户明确指定其他风格时优先遵从。

共享代码风格、目录、图形与复现规范见 [工作规范](docs/conventions.md)。历史审计文件与未实施的 `PROJECT-MEMORY-DESIGN.md` 不作为现行运行规则。

```bash
npm run typecheck
npm test
npm pack --dry-run
```

测试使用本地数据夹具,不调用付费模型。
