/** Child-only reporting; cannot dispatch agents or accept project tasks. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { TeamStore, activeAttempt, atomicJSON, validateHandoff, now } from "../core/team-store.js";

export function registerTeamHandoff(pi: ExtensionAPI): void {
	const root = process.env.SCIENTIST_TEAM_ROOT, id = process.env.SCIENTIST_TASK_ID, attemptId = process.env.SCIENTIST_ATTEMPT_ID;
	if (!root || !id || !attemptId) return;
	const store = new TeamStore(root);
	const task = store.get(id), attempt = activeAttempt(task);
	if (!attempt || attempt.id !== attemptId) throw new Error("Stale Scientist child attempt");
	const dir = attempt.dir;
	const lifecycle = (state: string) => atomicJSON(path.join(dir, "lifecycle.json"), { taskId: id, attemptId, state, pid: process.pid, at: now() });
	pi.on("session_start", async () => { lifecycle("idle"); });
	pi.on("agent_start", async () => { lifecycle("working"); });
	pi.on("session_shutdown", async () => { lifecycle("gone"); });
	pi.on("agent_end", async event => {
		const staged = path.join(dir, "handoff.pending.json");
		const last = event.messages.filter(m => m.role === "assistant").at(-1);
		const completed = last && "stopReason" in last && last.stopReason === "stop";
		if (fs.existsSync(staged) && completed) fs.renameSync(staged, path.join(dir, "handoff.json"));
		else if (fs.existsSync(staged)) fs.rmSync(staged);
		lifecycle("idle");
	});
	pi.registerTool({
		name: "sci_handoff", label: "Submit task evidence",
		description: "Return this assigned task's outcome to the main agent. submitted requires actual validation checks; waiting_compute requires tmux job paths. This is not final acceptance. After calling, end the turn. Only writes the current attempt's report.",
		parameters: Type.Object({
			status: StringEnum(["submitted", "waiting_compute", "blocked", "failed"] as const),
			summary: Type.String({ minLength: 1, maxLength: 12000 }),
			outputs: Type.Array(Type.String({ minLength: 1 }), { maxItems: 100 }),
			checks: Type.Array(Type.String({ minLength: 1 }), { maxItems: 100 }),
			jobs: Type.Optional(Type.Array(Type.Object({ session: Type.String(), statusFile: Type.String(), logFile: Type.String() }), { maxItems: 30 })),
		}),
		async execute(_id, params) {
			const current = store.get(id);
			if (activeAttempt(current)?.id !== attemptId || ["accepted", "cancelled"].includes(current.status)) throw new Error("This attempt is no longer active");
			if (fs.existsSync(path.join(dir, "handoff.json"))) throw new Error("This attempt already delivered its report. Wait for coordinator continuation in a new attempt.");
			const handoff = validateHandoff({ ...params, taskId: id, attemptId, jobs: params.jobs ?? [] }, current, attempt, store.root);
			if (handoff.jobs.length) atomicJSON(path.join(dir, "jobs.json"), handoff.jobs);
			atomicJSON(path.join(dir, "handoff.pending.json"), handoff);
			return { content: [{ type: "text", text: "Handoff staged. End your turn to publish it to the coordinator. Do not perform additional analysis." }], details: { taskId: id, attemptId } };
		},
	});
}
