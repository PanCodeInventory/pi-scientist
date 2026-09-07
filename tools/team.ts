import * as fs from "node:fs";
import * as path from "node:path";
import { truncateHead, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Team } from "../core/team.js";
import { activeAttempt, type TeamTask } from "../core/team-store.js";

const strings = () => Type.Array(Type.String({ minLength: 1 }), { maxItems: 100 });
const backendSchema = Type.Optional(StringEnum(["herdr", "tmux"] as const));
const selectedBackend = (value?: "herdr" | "tmux") => value ?? (process.env.HERDR_ENV === "1" ? "herdr" : "tmux");
const displayTask = (task: TeamTask) => ({ id: task.id, role: task.role, status: task.status, brief: task.brief.slice(0, 300), dependsOn: task.dependsOn, note: task.note, acceptance: task.acceptance, attempt: activeAttempt(task) ? { id: activeAttempt(task)!.id, dir: activeAttempt(task)!.dir, handle: activeAttempt(task)!.handle, closed: activeAttempt(task)!.closed } : undefined });
const response = (value: unknown) => {
	const text = truncateHead(JSON.stringify(value, null, 2));
	return { content: [{ type: "text" as const, text: text.content + (text.truncated ? "\n[Truncated. Full task records are in the requested analysis directory's .scientist/state.json.]" : "") }], details: {} };
};

export function registerTeamTools(pi: ExtensionAPI, makeTeam: (root: string) => Team = root => new Team(root)): void {
	const watched = new Map<string, Team>();
	let polling = false, disposed = false;
	const watch = (root: string) => {
		const canonical = fs.realpathSync(root);
		if (!watched.has(canonical)) watched.set(canonical, makeTeam(canonical));
		return watched.get(canonical)!;
	};
	// No model is used to poll. Notify only on a persistent state transition.
	const timer = setInterval(async () => {
		if (polling || disposed) return;
		polling = true;
		try {
			for (const team of watched.values()) {
				try {
					const changed = await team.collect();
					if (changed.length && !disposed) pi.sendMessage({ customType: "scientist-team", content: `Scientist task updates in ${team.store.root}:\n${JSON.stringify(changed.map(displayTask))}\nInspect evidence with sci_tasks. Only the main agent can accept results. Start pending dependents after acceptance; review is optional.`, display: true }, { triggerTurn: true, deliverAs: "followUp" });
				} catch { /* sci_tasks surfaces errors; polling failures must not wake an LLM repeatedly. */ }
			}
		} finally { polling = false; }
	}, 10_000);
	timer.unref();
	pi.on("session_shutdown", async () => { disposed = true; clearInterval(timer); watched.clear(); });
	pi.on("session_start", async (_event, ctx) => {
		watched.clear();
		if (fs.existsSync(path.join(ctx.cwd, ".scientist", "state.json"))) {
			const team = watch(ctx.cwd);
			pi.sendMessage({ customType: "scientist-team", content: `Persistent Scientist tasks found at ${team.store.root}. Use sci_tasks list to reconcile prior runs before dispatching or recomputing.`, display: true }, { deliverAs: "nextTurn" });
		}
	});
	pi.registerTool({
		name: "sci_dispatch", label: "Dispatch scientist task",
		description: "Default execution path for substantial analysis: create a persistent task and launch a specialist asynchronously in Herdr (inside Herdr) or tmux. Main agent supplies decisions, output ownership and acceptance criteria. Review is optional: role=reviewer only when warranted. Returns task/attempt IDs, not completed results. Queue dependent work with start=false, then start after main-agent acceptance of dependencies.",
		parameters: Type.Object({
			cwd: Type.String({ description: "User-established analysis parent directory", minLength: 1 }),
			role: StringEnum(["worker", "scout", "librarian", "reviewer"] as const), task: Type.String({ minLength: 1 }),
			inputs: strings(), decisions: strings(), writeScopes: strings(), criteria: strings(),
			dependsOn: Type.Optional(strings()), start: Type.Optional(Type.Boolean({ default: true })), backend: backendSchema,
			maxConcurrent: Type.Optional(Type.Integer({ minimum: 1, maximum: 8, default: 3 })),
		}),
		async execute(_id, params, signal, _update, ctx) {
			signal?.throwIfAborted();
			const team = watch(path.resolve(ctx.cwd, params.cwd));
			const task = team.create({ role: params.role, brief: params.task, inputs: params.inputs, decisions: params.decisions, writeScopes: params.writeScopes, criteria: params.criteria, dependsOn: params.dependsOn ?? [] });
			if (params.start !== false) {
				try { await team.start(task.id, selectedBackend(params.backend), params.maxConcurrent); }
				catch (error) { throw new Error(`Task persisted as ${task.id}. ${String(error)} Use sci_tasks get/start/resume; do not dispatch a duplicate.`); }
			}
			return response(displayTask(team.store.get(task.id)));
		},
	});
	pi.registerTool({
		name: "sci_tasks", label: "Manage scientist tasks",
		description: "Inspect and reconcile persistent team tasks; start queued work, accept evidence, resume with corrections, or cancel an owned agent. Only accept after checking scientific validity and outputs. Reviewer is optional. resume creates a new attempt and preserves old evidence; it refuses while recorded computation may still run. cancel stops the agent, preserving detached tmux calculations. No automatic retries, reviews, or terminal approval responses.",
		parameters: Type.Object({
			cwd: Type.String({ minLength: 1 }), action: StringEnum(["list", "get", "start", "accept", "resume", "cancel"] as const),
			taskId: Type.Optional(Type.String({ minLength: 1 })), evidence: Type.Optional(Type.String({ description: "Acceptance evidence or resume/correction instructions", minLength: 1 })),
			backend: backendSchema, maxConcurrent: Type.Optional(Type.Integer({ minimum: 1, maximum: 8, default: 3 })),
		}),
		async execute(_id, params, signal, _update, ctx) {
			signal?.throwIfAborted();
			const team = watch(path.resolve(ctx.cwd, params.cwd));
			await team.collect();
			if (params.action === "list") return response(team.store.read().tasks.map(displayTask));
			if (!params.taskId) throw new Error("taskId required");
			if (params.action === "get") return response(team.store.get(params.taskId));
			if (params.action === "start") return response(displayTask(await team.start(params.taskId, selectedBackend(params.backend), params.maxConcurrent)));
			if (params.action === "accept") return response(displayTask(await team.accept(params.taskId, params.evidence ?? "")));
			if (params.action === "resume") return response(displayTask(await team.retry(params.taskId, params.evidence ?? "", params.backend ?? activeAttempt(team.store.get(params.taskId))?.handle?.backend ?? selectedBackend(), params.maxConcurrent)));
			return response(displayTask(await team.cancel(params.taskId)));
		},
	});
}
