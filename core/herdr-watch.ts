/** Watch only workers explicitly bound to this dispatcher session. A global
 *  Herdr agent name is never evidence of ownership (even in the same project). */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface WatchEvent { name: string; status: "idle" | "blocked" | "gone"; previous: string }
/** done and idle both mean "ready for input"; treat as one bucket to avoid double notifications. */
const bucket = (status: string) => (status === "done" ? "idle" : status);
const SETTLED = new Set(["idle", "blocked"]);
const SLUG = /^[a-z][a-z0-9_-]{0,31}$/;
const SESSION_ID = /^[a-zA-Z0-9_-]+$/;

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

/** Parse named statuses only; this helper does NOT establish routing/ownership. */
export function parseAgentList(output: string): Map<string, string> {
    const map = new Map<string, string>();
    let data: any;
    try { data = JSON.parse(output); } catch { return map; }
    if (!Array.isArray(data?.result?.agents)) return map;
    for (const a of data.result.agents) {
        const name = typeof a?.name === "string" ? a.name : typeof a?.agent_name === "string" ? a.agent_name : undefined;
        if (name && typeof a.agent_status === "string") map.set(name, a.agent_status);
    }
    return map;
}

interface Owner { sessionId: string; workspaceId: string; paneId: string }
interface Binding {
    version: 1;
    owner: Owner;
    worker: { name: string; workspaceId: string; paneId: string; sessionFile: string; sessionId: string };
    runDir: string;
}

/** Read only the bounded first JSONL line, never the worker's conversation. */
function sessionId(file: string): string | undefined {
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, "r");
        const bytes = Buffer.alloc(16 * 1024);
        const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
        const header = JSON.parse(bytes.subarray(0, count).toString("utf8").split("\n")[0]!);
        return header?.type === "session" && typeof header.id === "string" ? header.id : undefined;
    } catch { return undefined; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
}

function matchesSession(agent: any, id: string, file?: string): boolean {
    const ref = agent?.agent_session;
    if (ref?.agent !== "pi" || ref.kind !== "path" || typeof ref.value !== "string" || !path.isAbsolute(ref.value)) return false;
    return (!file || path.resolve(ref.value) === file) && sessionId(ref.value) === id;
}

function readBindings(root: string, owner: Owner): Map<string, Binding> {
    const bindings = new Map<string, Binding>();
    const dir = path.join(root, ".sci", "herdr-watch", owner.sessionId);
    let files: string[];
    try { files = fs.readdirSync(dir); } catch { return bindings; }
    for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
            const b = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Binding;
            if (b.version !== 1 || b.owner?.sessionId !== owner.sessionId || b.owner.workspaceId !== owner.workspaceId || b.owner.paneId !== owner.paneId) continue;
            const w = b.worker;
            if (!w || typeof w.name !== "string" || !SLUG.test(w.name) || file !== `${w.name}.json` || w.workspaceId !== owner.workspaceId || typeof w.paneId !== "string" || !w.paneId || w.paneId === owner.paneId) continue;
            if (typeof w.sessionId !== "string" || !SESSION_ID.test(w.sessionId) || w.sessionId === owner.sessionId) continue;
            if (typeof b.runDir !== "string" || !path.isAbsolute(b.runDir) || typeof w.sessionFile !== "string" || w.sessionFile !== path.join(b.runDir, "session.jsonl")) continue;
            // Key by immutable dispatch identity, not globally reusable agent names.
            bindings.set(JSON.stringify([w.name, w.workspaceId, w.paneId, w.sessionFile, w.sessionId, b.runDir]), b);
        } catch { /* Incomplete/invalid registration never broadens the watch scope. */ }
    }
    return bindings;
}

export interface WatchOptions {
    intervalMs?: number;
    run?: (bin: string, args: string[]) => Promise<string>;
}
const defaultRun = (bin: string, args: string[]) => new Promise<string>((resolve, reject) => {
    execFile(bin, args, { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
});

export function registerHerdrWatch(pi: ExtensionAPI, options: WatchOptions = {}) {
    if (process.env.HERDR_ENV !== "1") return undefined;
    const workspaceId = process.env.HERDR_WORKSPACE_ID, paneId = process.env.HERDR_PANE_ID;
    const run = options.run ?? defaultRun;
    let root: string | undefined, owner: Owner | undefined;
    const seen = new Map<string, string>();
    const notifiedIdle = new Map<string, string>();
    let disposed = false, polling = false;
    const poll = async () => {
        if (disposed || polling || !root || !owner) return;
        const bindings = readBindings(root, owner);
        // Removing ownership forgets state silently; never manufacture "gone" alerts.
        for (const key of seen.keys()) if (!bindings.has(key)) seen.delete(key);
        for (const key of notifiedIdle.keys()) if (!bindings.has(key)) notifiedIdle.delete(key);
        if (!bindings.size) return;
        polling = true;
        try {
            const output = await run("herdr", ["agent", "list"]);
            if (disposed) return;
            // Herdr may return an error JSON with exit code 0. It is not an empty list.
            const data = JSON.parse(output);
            if (data?.error || !Array.isArray(data?.result?.agents)) return;
            const agents: any[] = data.result.agents;
            // Confirm this very pane still hosts this very session, not a replacement.
            const dispatchers = agents.filter(a => a?.pane_id === owner!.paneId && a.workspace_id === owner!.workspaceId);
            if (dispatchers.length !== 1 || !matchesSession(dispatchers[0], owner.sessionId)) return;
            const current = new Map<string, string>();
            for (const [key, b] of bindings) {
                const workers = agents.filter(a => a?.pane_id === b.worker.paneId);
                const a = workers[0];
                if (workers.length === 1 && a.workspace_id === b.worker.workspaceId && (a.name ?? a.agent_name) === b.worker.name && typeof a.agent_status === "string" && matchesSession(a, b.worker.sessionId, b.worker.sessionFile))
                    current.set(key, a.agent_status);
            }
            const events = diffAgents(seen, current);
            seen.clear(); for (const [k, v] of current) seen.set(k, v);
            if (!events.length) return;
            const observedAt = new Date().toISOString();
            const lines: string[] = [];
            // A binding can be removed/replaced while the CLI is in flight.
            const active = readBindings(root, owner);
            for (const e of events) {
                const b = active.get(e.name);
                if (!b) continue;
                const dir = b.runDir;
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
                lines.push(`- ${b.worker.name}${state}${e.status === "blocked" ? "(等待人工确认/选择,请到该 pane 处理)" : ""};pane=${b.worker.paneId};run=${dir};result.md ${ready ? `已就绪,mtime=${stat!.mtime.toISOString()}` : "未出现"}`);
            }
            if (!lines.length || disposed) return;
            pi.sendMessage({ customType: "scientist-subagent", content: `Herdr 子代理状态快照 observedAt=${observedAt} workspace=${owner.workspaceId} dispatcher=${owner.paneId} session=${owner.sessionId}:\n${lines.join("\n")}\n回告可能排队延迟;若已验收/主动释放则忽略。否则核对当前状态、result.md 与产物,勿把快照当完成证明。`, display: true }, { triggerTurn: true, deliverAs: "followUp" });
        } catch { /* herdr CLI 故障时不打扰;下一轮自动重试 */ }
        finally { polling = false; }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { disposed = true; clearInterval(timer); seen.clear(); notifiedIdle.clear(); };
    pi.on("session_start", async (_event, ctx) => {
        if (disposed || timer) return;
        const id = ctx.sessionManager.getSessionId();
        if (!workspaceId || !paneId || !SESSION_ID.test(id)) return;
        root = ctx.cwd;
        owner = { sessionId: id, workspaceId, paneId };
        timer = setInterval(() => void poll(), options.intervalMs ?? 20_000);
        timer.unref();
    });
    pi.on("session_shutdown", async () => { stop(); });
    return { poll, stop };
}
