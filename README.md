# pi-scientist

面向生物信息分析的 Pi 能力包:科学工作原则、共享交付规范、领域与运行技能,以及按需调用 tmux / Herdr 的子代理派工约定。无内置角色、模式或协调状态机;派工是纯文本约定,不依赖扩展工具。

## 加载方式

```bash
pi install /absolute/path/to/pi-scientist
# 临时加载扩展和技能（显式选择技能，不绕过用户的资源配置）
pi -e ./index.ts --skill ./skills
```

## 提供什么

| 入口 | 用途 |
|---|---|
| 20 个领域与运行技能 | 经包的 `pi.skills` 声明加载，遵守技能筛选与 `--no-skills`；含 tmux-runner(长计算)与 subagent-delegation(派工约定) |
| 科学原则、代码风格与交付规范 | 每次运行通过结构化提示词 sections 注入，不覆盖其他扩展的 sections (`SCIENTIST_NO_ENFORCEMENT=1` 只跳过原则,保留代码风格与交付规范) |
| `ask_user_question` | 询问影响科学意图的未知选择，含推荐项/选项 UI；仅供模型直接调用，不开放给 codemode 嵌套调用，以保留分支问答记录 |
| `sci_logs` | 查询各模块 tmux 计算的 manifest.jsonl(跑了什么、成败、耗时、日志) |
| `/generate-report` | 按需中文自包含 HTML 报告 |
| `/publication` | 按需一图一 Notebook,实际执行验证 |
| `/reflect` | 结合真实结果讨论方法与局限 |

## 子代理派工

不再内置协调工具与 worker/leader 模式。需要把工作交给另一个 pi 会话时,按 **subagent-delegation** skill 的约定执行:

- **子代理用 herdr(主线,需派工方在 Herdr 内)**:固定布局——当前 workspace 下每个整体任务一个 tab(label = 任务名),窗口内每个 worker 一个 pane(agent 名 = 细分任务名),用 `herdr tab/pane/agent` 原生命令启动,再用 skill 自带 `bind-worker.py` 显式绑定派工归属;watcher 仅向绑定的 workspace + pane + Pi session 回告 worker 的 `idle/done`、`blocked` 或退出(含 result.md 是否就绪),不会仅凭名字监听全局 agent
- **tmux 为降级路线**(不在 Herdr 内时):`tmux new-session` 起裸 `pi --session` + 哨兵文件循环等待,无自动回告

两条路线共享同一约定:worker 完成必须写 `.sci/runs/<task>/result.md`(哨兵),验收由派工方亲自读产物、核对标准,不接受 worker 自述。详见 `skills/subagent-delegation/SKILL.md`。

**通知隔离升级**:已打开的各 Pi 会话需 `/reload` 才能停掉旧版全局 watcher。旧任务不自动认领,需在真正的派工会话内用 skill 的绑定脚本登记;未绑定或身份不完整时不自动投递。同 workspace/同项目的其他 pane 和新 Pi 会话也不会接收。绑定保存在派工会话 cwd 下的 `.sci/herdr-watch/<session-id>/`,worker 改名/换 pane/换会话不会被按同名自动接管。

## 长计算

与子代理派工是两件事,**子代理任务内部的重活也照旧用 tmux-runner**:wrapper 让脚本活过会话超时,并在模块 `tmux/` 目录留 `.status`/日志/`manifest.jsonl`,会话完成后自动退出(不残留空 tmux 会话)。主会话用 `sci_logs` 查询执行历史。

## 升级与验证

旧版本的任务系统(`sci_dispatch` / `sci_tasks` / `sci_sessions` / `sci_handoff`)、worker/leader 模式、`/scientist`、`/science-join` 已全部删除。历史项目的 `.scientist/` 目录(含 state.json、runs、sessions 记录)原地保留仅作归档,新代码不读写;继续工作时用 subagent-delegation 的流程重新派工即可。

`SCIENTIST_MODE`、`SCIENTIST_TEAM_ROOT`、`SCIENTIST_SESSION_ID`、`SCIENTIST_MODEL_DEFAULT`、`SCIENTIST_RUNTIME_CONFIG` 均不再生效。`SCIENTIST_NO_ENFORCEMENT` 保留(仅跳过科学原则)。

默认代码风格为线性、命令式、研究脚本式（linear imperative research scripting）：从上到下执行，减少无必要的封装、抽象、循环和防御性代码；简单操作尽量单行，不强制 Black/PEP 8 式展开。保留科学正确性所需的检查，用户明确指定其他风格时优先遵从。

共享代码风格、目录、图形与复现规范见 [工作规范](docs/conventions.md)。历史审计文件与未实施的 `PROJECT-MEMORY-DESIGN.md` 不作为现行运行规则。

本地开发/测试依赖固定为 Pi `1.4.0`（与当前使用的宿主版本对齐），TypeBox 与 TypeScript 也显式声明在 `devDependencies`；发布用的宿主 `peerDependencies` 保持 `*`，不捆绑 Pi。使用锁文件复现测试环境：

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm pack --dry-run
```

测试使用本地数据夹具,不调用付费模型。SDK 测试使用隔离的临时凭据/模型缓存路径，并关闭模型目录联网刷新。覆盖真实源码加载、技能筛选/reload、提示词扩展组合、codemode 工具可达性、问答错误显示、窗口缩放及大日志截尾。

交互弹窗保留两行问题摘要，完整长问题可用 PgUp/PgDn 滚动查看（输入答案时也可用）；小于 20 列 × 16 行时暂停选项提交，扩大窗口后继续，Esc 始终可以取消。`sci_logs log` 异步读取最多 64 KiB 的日志尾部，再按 50KB/2000 行限制输出；截断时提供原日志路径。
