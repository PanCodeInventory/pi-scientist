/** Watch named Herdr agents (agents are only named when dispatched via
 *  `herdr agent start <name>` — user-driven sessions stay unnamed) and wake
 *  this session when one settles, blocks, or disappears. No state on disk,
 *  no registration surface: the agent name is the entire contract. Active
 *  only when this session itself runs inside Herdr (HERDR_ENV=1). */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface WatchEvent { name: string; status: "idle" | "blocked" | "gone"; previous: string }
/** done and idle both mean "ready for input"; treat as one bucket to avoid double notifications. */
const bucket = (status: string) => (status === "done" ? "idle" : status);
const SETTLED = new Set(["idle", "blocked"]);

/** Transitions worth waking the dispatcher for. A newly appearing agent is never an event. */
export function diffAgents(previous: Map<string, string>, current: Map<string, string>): WatchEvent[] {
    const events: WatchEvent[] = [];
    for (const [name, now] of current) {
        const prev = previous.get(name);
        if (prev !== undefined && bucket(prev) !== bucket(now) && SETTLED.has(bucket(now)))
            events.push({ name, status: bucket(now) as WatchEvent["status"], previous: prev });
    }
    for (const [name, prev] of previous) if (!current.has(name)) events.push({ name, status: "gone", previous: prev });
    return events;
}

/** Parse `herdr agent list` output; unnamed agents (not dispatched by us) never match. */
export function parseAgentList(output: string): Map<string, string> {
    const map = new Map<string, string>();
    let data: any;
    try { data = JSON.parse(output); } catch { return map; }
    for (const a of data?.result?.agents ?? []) {
        const name = typeof a.name === "string" ? a.name : typeof a.agent_name === "string" ? a.agent_name : undefined;
        if (name && typeof a.agent_status === "string") map.set(name, a.agent_status);
    }
    return map;
}

export interface WatchOptions {
    intervalMs?: number;
    run?: (bin: string, args: string[]) => Promise<string>;
    cwd?: () => string;
}
const defaultRun = (bin: string, args: string[]) => new Promise<string>((resolve, reject) => {
    execFile(bin, args, { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
});

export function registerHerdrWatch(pi: ExtensionAPI, options: WatchOptions = {}) {
    if (process.env.HERDR_ENV !== "1") return undefined;
    const run = options.run ?? defaultRun;
    let sessionCwd: string | undefined;
    const cwd = () => options.cwd?.() ?? sessionCwd;
    const seen = new Map<string, string>();
    const notifiedIdle = new Map<string, string>();
    let disposed = false, polling = false;
    const poll = async () => {
        const root = cwd();
        if (disposed || polling || !root) return;
        polling = true;
        try {
            const output = await run("herdr", ["agent", "list"]);
            // Herdr may return an error JSON with exit code 0. It is not an empty list.
            const data = JSON.parse(output);
            if (data?.error || !Array.isArray(data?.result?.agents)) return;
            const current = parseAgentList(output);
            const events = diffAgents(seen, current);
            seen.clear(); for (const [k, v] of current) seen.set(k, v);
            if (!events.length || disposed) return;
            const observedAt = new Date().toISOString();
            const lines: string[] = [];
            for (const e of events) {
                const dir = path.join(root, ".sci", "runs", e.name);
                let stat: fs.Stats | undefined;
                try { stat = fs.statSync(path.join(dir, "result.md")); } catch { /* not published yet */ }
                const ready = !!stat?.isFile() && stat.size > 0;
                const signature = ready ? `${stat!.mtimeMs}:${stat!.size}` : "missing";
                if (e.status === "idle") {
                    if (notifiedIdle.get(e.name) === signature) continue;
                    notifiedIdle.set(e.name, signature);
                }
                if (e.status === "gone") {
                    notifiedIdle.delete(e.name);
                    // Dispatcher writes this marker before intentionally closing the pane.
                    if (fs.existsSync(path.join(dir, "released"))) continue;
                }
                const state = e.status === "gone" ? " 已消失(原因未知,不等于崩溃)" : `: ${e.status}`;
                lines.push(`- ${e.name}${state}${e.status === "blocked" ? "(等待人工确认/选择,请到该 pane 处理)" : ""};result.md ${ready ? `已就绪,mtime=${stat!.mtime.toISOString()}` : "未出现"}`);
            }
            if (!lines.length) return;
            pi.sendMessage({ customType: "scientist-subagent", content: `Herdr 子代理状态快照 observedAt=${observedAt}:\n${lines.join("\n")}\n回告可能排队延迟;若已验收/主动释放则忽略。否则核对当前状态、result.md 与产物,勿把快照当完成证明。`, display: true }, { triggerTurn: true, deliverAs: "followUp" });
        } catch { /* herdr CLI 故障时不打扰;下一轮自动重试 */ }
        finally { polling = false; }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { disposed = true; clearInterval(timer); };
    pi.on("session_start", async (_event, ctx) => {
        if (disposed || timer) return;
        sessionCwd = ctx.cwd;
        timer = setInterval(() => void poll(), options.intervalMs ?? 20_000);
        timer.unref();
    });
    pi.on("session_shutdown", async () => { stop(); });
    return { poll, stop };
}
