# pi-scientist

面向生物信息分析的 Pi 能力包:科学工作原则、共享交付规范、领域与运行技能,以及按需调用 tmux / Herdr 的分析子代理派工约定。无内置分析角色、模式或协调状态机；另提供默认关闭的项目技能学习：从交付点派生受限的后台复盘会话。

## 加载方式

```bash
pi install /absolute/path/to/pi-scientist
# 临时加载扩展和技能（显式选择技能，不绕过用户的资源配置）
pi -e ./index.ts --skill ./skills
```

项目级配置应放在 `.pi/settings.json` 的 `packages` 中（或在项目内执行 `pi install --local /absolute/path/to/pi-scientist`）：

```json
{
  "packages": ["/absolute/path/to/pi-scientist"]
}
```

**只把目录写入 `extensions` 会加载代码和规范，但不会加载包的 `pi.skills`。** 请替换该条目，不要同时重复注册。修改后执行 `/reload`。

### 上下文与技能可用性

- 科学原则、用户规范是常驻的结构化 sections；技能只注入名称、描述、位置，正文按需读取，不整包塞入上下文。
- 完整包有 20 个技能，其中 `publication` 仅显式调用，默认模型目录显示另外 19 个。`tmux-runner` 是带 shell wrapper 的技能，不是独立工具。
- 每轮按 Pi 实际提供的技能和读取工具检查 `visualization` / `tmux-runner`。缺失时在上下文注明、在 UI 告警；受影响的步骤先解决依赖，不猜路径、不绕过过滤、不改变既有规范。相同缺失状态不反复弹窗。
- 继续遵守 `skills: []`、排除规则、`--no-skills` 和 `disable-model-invocation`。不会通过 `resources_discover` 偷偷补回已禁用技能。
- 检查时区分“技能目录已注入”和“正文已读”，以及“项目说明已作为上下文注入”和“主动读取过文件”；不要以模型口头自述代替实际资源检查。`sci_delivery` 的交付要求仅在项目学习已启用且工具可用时注入。

## 提供什么

| 入口 | 用途 |
|---|---|
| 20 个领域与运行技能 | 经包的 `pi.skills` 声明加载，遵守技能筛选与 `--no-skills`；含 tmux-runner(长计算)与 subagent-delegation(派工约定) |
| 科学原则、代码风格与交付规范 | 每次运行通过结构化提示词 sections 注入，不覆盖其他扩展的 sections (`SCIENTIST_NO_ENFORCEMENT=1` 只跳过原则,保留代码风格与交付规范) |
| `ask_user_question` | 询问影响科学意图的未知选择，含推荐项/选项 UI；仅供模型直接调用，不开放给 codemode 嵌套调用，以保留分支问答记录 |
| `sci_logs` | 查询各模块 tmux 计算的 manifest.jsonl(跑了什么、成败、耗时、日志) |
| `sci_delegate` | Jev 判断子任务难度与 vision 需求,按固定路由启动 worker、绑定归属并派工;后续监看/验收沿用原流程 |
| `/generate-report` | 按需中文自包含 HTML 报告 |
| `/publication` | 按需一图一 Notebook,实际执行验证 |
| `/reflect` | 结合真实结果讨论方法与局限 |
| `/sci-learn`、`sci_delivery` | 可选项目技能学习：启用后登记交付、克隆活动分支、后台复盘并增量更新项目 skill |

## 子代理派工

不恢复旧任务系统与 worker/leader 模式。需要把工作交给另一个 pi 会话时,按 **subagent-delegation** skill 准备 brief 与布局,再调用 **sci_delegate** 一次完成 Jev 分类、固定模型选择、启动、绑定和发任务:

- **子代理用 herdr(主线,需派工方在 Herdr 内)**:固定布局——当前 workspace 下每个整体任务一个 tab(label = 任务名),窗口内每个 worker 一个 pane(agent 名 = 细分任务名),用 `herdr tab/pane` 准备空 pane,然后 `sci_delegate` 用 `herdr agent start` 启动并调用原有 `bind-worker.py` 显式绑定派工归属,绑定成功才发任务;watcher 仅向绑定的 workspace + pane + Pi session 回告 worker 的 `idle/done`、`blocked` 或退出(含 result.md 是否就绪),不会仅凭名字监听全局 agent
- **tmux 为降级路线**(不在 Herdr 内时):同一 `sci_delegate` 工具按路由启动独立 tmux/pi 会话,哨兵文件循环等待,无自动回告

分类器为 `typesafe/jev-latest`。固定路由(文本 / vision):easy=`ollama-cloud/minimax-m3.1-flash` low / `zai-coding-cn/glm-5.3-flash` low;mid=`zai-coding-cn/glm-5.3` high / `ollama-cloud/deepseek-v4.1-flash:1017` high;hard 两者均为 `openai-codex/gpt-6-astra` high。`requiresVision=true` 强制视觉能力;分类或模型检查失败不自动降档。需配置 TypeSafe、Ollama Cloud、ZAI Coding CN 和 Codex 的对应认证/提供方。工具不切换主会话模型。

每个 run 的 `dispatch.json` 保存分类与启动收据,不代替任务进度。重复派工被拒绝;部分启动/绑定/发任务失败时先查 pane/session 与收据,不要盲重试。现有状态回告、`result.md` 验收、补充返工和释放流程不变。工具不可用时先检查扩展加载与工具过滤,不要静默绕过路由手动启动。

两条路线共享同一约定:worker 完成必须写 `.sci/runs/<task>/result.md`(哨兵),验收由派工方亲自读产物、核对标准,不接受 worker 自述。详见 `skills/subagent-delegation/SKILL.md`。

**通知隔离升级**:已打开的各 Pi 会话需 `/reload` 才能停掉旧版全局 watcher。旧任务不自动认领,需在真正的派工会话内用 skill 的绑定脚本登记;未绑定或身份不完整时不自动投递。同 workspace/同项目的其他 pane 和新 Pi 会话也不会接收。绑定保存在派工会话 cwd 下的 `.sci/herdr-watch/<session-id>/`,worker 改名/换 pane/换会话不会被按同名自动接管。

## 长计算

与子代理派工是两件事,**子代理任务内部的重活也照旧用 tmux-runner**:wrapper 让脚本活过会话超时,并在模块 `tmux/` 目录留 `.status`/日志/`manifest.jsonl`,会话完成后自动退出(不残留空 tmux 会话)。主会话用 `sci_logs` 查询执行历史。

## 升级与验证

旧版本的任务系统(`sci_dispatch` / `sci_tasks` / `sci_sessions` / `sci_handoff`)、worker/leader 模式、`/scientist`、`/science-join` 已全部删除。历史项目的 `.scientist/` 目录(含 state.json、runs、sessions 记录)原地保留仅作归档,新代码不读写;继续工作时用 subagent-delegation 的流程重新派工即可。

`SCIENTIST_MODE`、`SCIENTIST_TEAM_ROOT`、`SCIENTIST_SESSION_ID`、`SCIENTIST_MODEL_DEFAULT`、`SCIENTIST_RUNTIME_CONFIG` 均不再生效。`SCIENTIST_NO_ENFORCEMENT` 保留(仅跳过科学原则)。

默认代码风格为线性、命令式、研究脚本式（linear imperative research scripting）：从上到下执行，减少无必要的封装、抽象、循环和防御性代码；简单操作尽量单行，不强制 Black/PEP 8 式展开。保留科学正确性所需的检查，用户明确指定其他风格时优先遵从。

共享代码风格、目录、图形与复现规范见 [工作规范](docs/conventions.md)。历史审计文件与未实施的 `PROJECT-MEMORY-DESIGN.md` 不作为现行运行规则。

项目 skill 学习已实现，默认关闭。在明确的分析根目录执行 `/sci-learn on` 启用；主代理在交付前调用 `sci_delivery`，正常结束后自动克隆当前活动分支，主会话不切换。复盘按分析类型匹配已有主题，按需读取相关 skill，必要时创建新主题；一个项目可有多个独立 skill，一次交付也可更新多个。目录和 `name` 直接使用分析主题，例如 `.pi/skills/sample-alignment/SKILL.md`，不加冗余前缀。复盘没有 shell/写文件工具；宿主逐主题检查来源、风险标记和基线后发布，不修改跨项目技能。`/sci-learn reflect` 可补做，`status` 查看主题目录及记录，`off` 停止学习，`rollback <run-id> [topic]` 按主题回退。新技能在下次加载或 `/reload` 后发现，遵守原有资源筛选。

后台调用有模型成本，完整复盘历史保存在项目 `.sci/learning/`，不要公开提交；关闭/reload 主会话会取消后台复盘。本版不是独立科学审核器。详见[实现与边界](docs/project-skill-learning.md)、[验收及消融](docs/project-skill-learning-cases.md)。

本地开发/测试依赖固定为 Pi `1.4.0`（与当前使用的宿主版本对齐），TypeBox 与 TypeScript 也显式声明在 `devDependencies`；发布用的宿主 `peerDependencies` 保持 `*`，不捆绑 Pi。使用锁文件复现测试环境：

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm pack --dry-run
```

默认测试使用本地数据夹具，不调用付费模型。`npm run test:learning-ablation` 做无模型调用的机制消融；`npm run test:learning-live` 是显式付费的三条件小型实验，`npm run test:learning-topics` 验证多主题创建与同类更新；两者使用 `PI_PROVIDER` / `PI_MODEL`，不属于默认测试。SDK 单元测试使用隔离的临时凭据/模型缓存路径，并关闭模型目录联网刷新。覆盖项目 `extensions` 漏载复现与 `packages` 修复、实际技能目录/正文分离、技能筛选/reload、提示词扩展组合、codemode 工具可达性、问答错误显示、窗口缩放及大日志截尾。

交互弹窗保留两行问题摘要，完整长问题可用 PgUp/PgDn 滚动查看（输入答案时也可用）；小于 20 列 × 16 行时暂停选项提交，扩大窗口后继续，Esc 始终可以取消。`sci_logs log` 异步读取最多 64 KiB 的日志尾部，再按 50KB/2000 行限制输出；截断时提供原日志路径。
