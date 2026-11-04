/** One-shot routed launch. Existing watcher/binding and result-file acceptance remain authoritative. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { SessionManager, withFileMutationQueue, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { classifyWorker, selectWorkerRoute, validateWorkerModel } from "../core/subagent-route.js";

const SLUG = /^[a-z][a-z0-9_-]{0,31}$/;
// Works both from source tools/ and built dist/tools/.
const packageRoot = fileURLToPath(new URL(import.meta.url.includes("/dist/tools/") ? "../../" : "../", import.meta.url));
const bindingScript = path.join(packageRoot, "skills/subagent-delegation/scripts/bind-worker.py");
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const normalize = (base: string, value: string) => path.resolve(base, value.replace(/^@/, ""));

function header(file: string) {
    const fd = fs.openSync(file, "r");
    try {
        const bytes = Buffer.alloc(16 * 1024);
        const n = fs.readSync(fd, bytes, 0, bytes.length, 0);
        const data = JSON.parse(bytes.subarray(0, n).toString("utf8").split("\n")[0]!);
        if (data.type !== "session" || typeof data.id !== "string") throw new Error("Invalid native session header");
        return data;
    } finally { fs.closeSync(fd); }
}

export function registerDelegateTool(pi: ExtensionAPI): void {
    pi.registerTool({
        name: "sci_delegate",
        label: "Route and delegate",
        exposure: "model-only",
        executionMode: "sequential",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        description: "Classify a prepared subagent brief with Jev (difficulty and vision), choose the configured model, start a pi worker, bind ownership and submit its task. In Herdr, prepare an empty worker pane in the task tab first. Outside Herdr, starts a tmux session. Does not monitor or accept results. A launch receipt prevents duplicate dispatch; partial failures require inspection, not blind retry.",
        promptSnippet: "Route and launch a bounded subagent task using Jev",
        promptGuidelines: [
            "Before sci_delegate, read subagent-delegation, prepare a fresh <cwd>/.sci/runs/<worker-slug>/brief.md with scope, inputs, confirmed decisions and acceptance criteria, and prepare the task tab/empty pane when inside Herdr.",
            "Use sci_delegate for new workers instead of manually selecting models or starting pi. Set requiresVision=true whenever the task explicitly requires inspecting images; merely generating plots is not vision.",
            "After sci_delegate, keep the existing Herdr progress/watch, result.md acceptance, follow-up and release workflow. Do not redispatch after a partial launch or uncertain prompt submission; inspect the returned receipt, pane and session first.",
        ],
        parameters: Type.Object({
            cwd: Type.String({ description: "Worker working directory (analysis root)." }),
            runDir: Type.String({ description: "Fresh run directory containing brief.md; must be <cwd>/.sci/runs/<worker-slug>. Paths resolve relative to the dispatcher cwd." }),
            paneId: Type.Optional(Type.String({ description: "Herdr: existing empty worker pane in the current workspace, already created in the task tab with cwd set correctly. Omit outside Herdr." })),
            requiresVision: Type.Optional(Type.Boolean({ description: "True forces a vision-capable route for an explicit image-inspection requirement. False cannot override Jev's positive vision judgment." })),
        }),
        async execute(_id, params, signal, onUpdate, ctx) {
            signal?.throwIfAborted();
            const cwd = fs.realpathSync(normalize(ctx.cwd, params.cwd));
            if (!fs.statSync(cwd).isDirectory()) throw new Error("Worker cwd must be a directory");
            const run = fs.realpathSync(normalize(ctx.cwd, params.runDir));
            const slug = path.basename(run);
            if (!SLUG.test(slug) || run !== path.join(cwd, ".sci", "runs", slug)) throw new Error("runDir must be <cwd>/.sci/runs/<worker-slug>; slug must match [a-z][a-z0-9_-]{0,31}");
            const briefPath = path.join(run, "brief.md");
            if (fs.realpathSync(briefPath) !== briefPath || !fs.statSync(briefPath).isFile() || fs.statSync(briefPath).size > 48 * 1024) throw new Error("brief.md must be a regular, non-symlink file of at most 48 KiB");
            const brief = fs.readFileSync(briefPath, "utf8");
            if (!brief.trim()) throw new Error("brief.md is empty");
            for (const file of ["session.jsonl", "result.md", "released"]) if (fs.existsSync(path.join(run, file))) throw new Error(`Run is not fresh: ${file} exists; inspect it and use a new worker slug`);
            const herdr = process.env.HERDR_ENV === "1";
            if (herdr && !params.paneId) throw new Error("Herdr dispatch requires an empty paneId; prepare the task tab/pane first");
            if (!herdr && params.paneId) throw new Error("paneId is only valid inside Herdr");
            const ownerId = ctx.sessionManager.getSessionId(), ownerFile = ctx.sessionManager.getSessionFile();
            const workspace = process.env.HERDR_WORKSPACE_ID, ownerPane = process.env.HERDR_PANE_ID;
            const checkOwner = () => {
                signal?.throwIfAborted();
                if (ctx.sessionManager.getSessionId() !== ownerId || ctx.sessionManager.getSessionFile() !== ownerFile) throw new Error("Dispatcher session changed during routing");
            };
            const exec = async (bin: string, args: string[], timeout = 20_000) => {
                checkOwner();
                const r = await pi.exec(bin, args, { signal, timeout, cwd });
                if (r.code !== 0 || r.killed) throw new Error(`${bin} failed (exit=${r.code}, killed=${r.killed}): ${(r.stderr || r.stdout).slice(-2000)}`);
                return r.stdout;
            };
            const herdrCommand = async (args: string[], timeout?: number) => {
                const data = JSON.parse(await exec("herdr", args, timeout));
                if (data?.error || !data?.result) throw new Error(`Herdr ${args.slice(0, 2).join(" ")}: ${JSON.stringify(data.error ?? data).slice(0, 2000)}`);
                return data.result;
            };
            const preflight = async () => {
                if (!herdr) {
                    const probe = await pi.exec("tmux", ["has-session", "-t", `=${slug}`], { signal, timeout: 5000, cwd });
                    if (probe.killed || probe.code !== 1) throw new Error("tmux session exists or tmux probe failed; refusing duplicate launch");
                    return;
                }
                if (!workspace || !ownerPane || params.paneId === ownerPane || !ownerFile) throw new Error("Missing Herdr dispatcher identity, native session, or worker pane is self");
                const { agents } = await herdrCommand(["agent", "list"]);
                if (!Array.isArray(agents)) throw new Error("Invalid Herdr agent snapshot");
                const owners = agents.filter((a: any) => a.pane_id === ownerPane && a.workspace_id === workspace);
                const ref = owners[0]?.agent_session;
                if (owners.length !== 1 || ref?.agent !== "pi" || ref.kind !== "path" || ref.value !== ownerFile || header(ownerFile).id !== ownerId) throw new Error("Herdr dispatcher does not match the current native Pi session");
                const { pane } = await herdrCommand(["pane", "get", params.paneId!]);
                if (pane?.workspace_id !== workspace || pane.pane_id !== params.paneId || pane.agent || agents.some((a: any) => a.pane_id === params.paneId)) throw new Error("Worker pane must be empty and in the dispatcher's workspace");
                if (fs.realpathSync(pane.foreground_cwd ?? pane.cwd) !== cwd) throw new Error("Worker pane cwd differs from requested cwd; create the pane with --cwd");
            };
            await preflight();
            const receiptPath = path.join(run, "dispatch.json");
            const receipt: Record<string, unknown> = {
                version: 1, createdAt: new Date().toISOString(), phase: "classifying", launchAttempted: false,
                ownerSessionId: ownerId, ownerPane, workspace, transport: herdr ? "herdr" : "tmux",
                paneId: params.paneId, cwd, runDir: run, worker: slug,
                briefSha256: createHash("sha256").update(brief).digest("hex"),
            };
            await withFileMutationQueue(receiptPath, async () => {
                try { fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx" }); }
                catch (error) { throw new Error(`Dispatch receipt already exists or cannot be created: ${receiptPath}; inspect before retrying`, { cause: error }); }
            });
            const save = async (updates: Record<string, unknown>) => {
                Object.assign(receipt, updates);
                await withFileMutationQueue(receiptPath, async () => {
                    const temporary = `${receiptPath}.${randomUUID()}.tmp`;
                    try {
                        fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2), { flag: "wx" });
                        fs.renameSync(temporary, receiptPath);
                    } finally { fs.rmSync(temporary, { force: true }); }
                });
            };
            let usage: Usage | undefined;
            try {
                onUpdate?.({ content: [{ type: "text", text: `Jev: classifying ${slug} (difficulty + vision)…` }], details: {} });
                const classified = await classifyWorker(brief, params.requiresVision === true, ctx.modelRegistry, signal);
                usage = classified.usage;
                signal?.throwIfAborted();
                const route = selectWorkerRoute(classified, params.requiresVision === true);
                await save({ route, classifierUsage: usage, phase: "classified" });
                validateWorkerModel(route, ctx.modelRegistry);
                await preflight();
                if (fs.readFileSync(briefPath, "utf8") !== brief) throw new Error("brief.md changed during classification; no worker started");
                for (const file of ["session.jsonl", "result.md", "released"]) if (fs.existsSync(path.join(run, file))) throw new Error(`Run changed during classification: ${file}`);
                checkOwner();
                // Use the native writer, not a hand-written header. Pi defers persistence until a user message.
                const sessionFile = path.join(run, "session.jsonl");
                const native = SessionManager.open(sessionFile, run, cwd);
                native.appendModelChange(route.provider, route.model);
                native.appendThinkingLevelChange(route.thinking);
                native.appendMessage({ role: "user", content: "Dispatcher prepared this worker session. Wait for a subsequent task message before starting work.", timestamp: Date.now() });
                await save({ phase: "starting", launchAttempted: true, workerSessionId: native.getSessionId(), sessionFile });
                const args = ["--session", sessionFile, "--provider", route.provider, "--model", route.model, "--thinking", route.thinking];
                const prompt = `Read ${JSON.stringify(briefPath)} and execute the brief. Write a self-contained completed/blocked report to ${JSON.stringify(path.join(run, "result.md"))}. Do not git commit. Do not delegate this task further.`;
                onUpdate?.({ content: [{ type: "text", text: `${slug}: ${route.difficulty}, vision=${route.needsVision} → ${route.provider}/${route.model} (${route.thinking})` }], details: {} });
                if (herdr) {
                    await herdrCommand(["agent", "start", slug, "--kind", "pi", "--pane", params.paneId!, "--", ...args], 60_000);
                    await save({ phase: "started" });
                    let bound = false, lastError: unknown;
                    for (let attempt = 0; attempt < 5; attempt++) {
                        try { await exec("python3", [bindingScript, params.paneId!, run]); bound = true; break; }
                        catch (error) { lastError = error; signal?.throwIfAborted(); if (attempt < 4) await delay(500, undefined, { signal }); }
                    }
                    if (!bound) throw lastError;
                    await save({ phase: "bound" });
                    await save({ phase: "submitting" });
                    // Never retry submission: agent_prompt_stalled may mean accepted but activity was not observed.
                    await herdrCommand(["agent", "prompt", params.paneId!, prompt]);
                } else {
                    await exec("tmux", ["new-session", "-d", "-s", slug, "-c", cwd, `exec ${["pi", ...args, prompt].map(quote).join(" ")}`]);
                }
                await save({ phase: "submitted", submittedAt: new Date().toISOString() });
                return {
                    content: [{ type: "text", text: `Dispatched ${slug}: ${route.provider}/${route.model} (${route.thinking}), difficulty=${route.difficulty}, vision=${route.needsVision}.\n${herdr ? `pane=${params.paneId}; ownership bound; existing watcher unchanged.` : `tmux=${slug}; poll result.md manually (no automatic tmux progress notifications).`}\nReceipt: ${receiptPath}\nResult: ${path.join(run, "result.md")}\nRead artifacts and verify acceptance criteria; result.md is not proof of success.` }],
                    details: { ...receipt }, usage,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await save({ failedAtPhase: receipt.phase, phase: "failed", error: message, classifierUsage: usage }).catch(() => {});
                return {
                    isError: true,
                    content: [{ type: "text", text: `${message}\nReceipt: ${receiptPath}\n${receipt.launchAttempted ? "Launch may have occurred. Inspect pane/session, binding and result.md. Do not blindly relaunch, resend the prompt or close the worker." : "No worker launch attempted. Inspect the receipt, correct the cause, then use a fresh run directory."}` }],
                    details: { ...receipt }, usage,
                };
            }
        },
    });
}
