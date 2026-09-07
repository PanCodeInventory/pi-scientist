import * as fs from "node:fs";
import * as path from "node:path";
import { discoverScientists } from "./agents.js";
import { TerminalBackend, type TeamBackend } from "./team-backend.js";
import { TeamStore, activeAttempt, atomicJSON, projectPath, validateHandoff, recordedJobs, jobExit, type TaskInput, type TeamTask } from "./team-store.js";

export class Team {
	readonly store: TeamStore;
	constructor(root: string, private readonly backend: (kind: "herdr" | "tmux") => TeamBackend = kind => new TerminalBackend(kind)) {
		this.store = new TeamStore(root);
	}
	create(input: TaskInput) { return this.store.create(input); }
	async start(id: string, kind: "herdr" | "tmux", maxConcurrent = 3): Promise<TeamTask> {
		if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8) throw new Error("maxConcurrent must be 1–8");
		if (kind === "herdr" && process.env.HERDR_ENV !== "1") throw new Error("Start Pi inside Herdr or choose backend=tmux");
		const candidate = this.store.get(id);
		const agent = discoverScientists().agents.find(a => a.name === candidate.role);
		if (!agent) throw new Error(`Missing specialist role: ${candidate.role}`);
		const { task, attempt } = this.store.reserve(id, maxConcurrent);
		try {
			atomicJSON(path.join(attempt.dir, "assignment.json"), { task, attempt });
			fs.writeFileSync(path.join(attempt.dir, "role.md"), agent.systemPrompt + `\n\nTEAM ASSIGNMENT: Only the main agent owns Task plans and final acceptance. Do not edit Task/ or dispatch other agents. Write only to the assigned output directories. Read-only roles may publish their structured report through sci_handoff, which writes only this attempt's handoff. Report real evidence; a handoff is not final project acceptance.\n`, { mode: 0o600 });
			fs.writeFileSync(path.join(attempt.dir, "brief.md"), [
				`# ${task.role}: ${task.id}\nAttempt: ${attempt.id}\nAnalysis root: ${this.store.root}`,
				task.brief,
				`Inputs:\n${task.inputs.map(x => `- ${x}`).join("\n")}`,
				`Confirmed decisions:\n${task.decisions.map(x => `- ${x}`).join("\n")}`,
				`Allowed output directories (role restrictions, not an OS sandbox):\n${task.writeScopes.join("\n") || "None; read-only inspection."}`,
				`Acceptance criteria:\n${task.criteria.map(x => `- ${x}`).join("\n")}`,
				`Dependency records: ${task.dependsOn.join(", ") || "none"}. Read their accepted outputs in ${path.join(this.store.dir, "state.json")}.`,
				`Previous attempts: ${task.attempts.slice(0, -1).map(a => a.dir).join(", ") || "none"}. Inspect prior artifacts and jobs before computing again.`,
				"Use relevant domain skills. Self-check actual outputs. Long computations use tmux-runner and unique sci_ session names per attempt; never overwrite old status/log files. When waiting, call sci_handoff with waiting_compute and the job log/status paths, then end the turn. The coordinator will resume validation after the jobs finish. Missing scientific decisions go to the main agent through a blocked handoff. Never ask the user directly or guess an answer.",
				"Finish with sci_handoff: submitted with outputs/checks; waiting_compute with jobs; blocked with missing information; or failed with evidence. Then end your turn. Only the main agent accepts tasks. Reviewer is optional and is never dispatched automatically.",
			].join("\n\n"), { mode: 0o600 });
			await this.backend(kind).launch({ root: this.store.root, task, attempt, agent }, handle => {
				this.store.update(id, t => {
					if (activeAttempt(t)?.id !== attempt.id) throw new Error("Stale attempt allocation");
					activeAttempt(t)!.handle = handle;
				});
			});
		} catch (error) {
			this.store.update(id, t => { t.status = "blocked"; t.note = `Launch needs inspection: ${String(error)}. No automatic retry.`; activeAttempt(t)!.error = String(error); });
			throw error;
		}
		return this.store.get(id);
	}
	/** Reconcile structured, attempt-matched handoffs. Terminal idle alone never submits. */
	async collect(): Promise<TeamTask[]> {
		const changed: TeamTask[] = [];
		for (const snapshot of this.store.read().tasks) {
			const attempt = activeAttempt(snapshot);
			if (!attempt || ["accepted", "cancelled", "pending"].includes(snapshot.status)) continue;
			const file = path.join(attempt.dir, "handoff.json");
			if (!attempt.handoff && fs.existsSync(file)) {
				try {
					const handoff = validateHandoff(JSON.parse(fs.readFileSync(file, "utf8")), snapshot, attempt, this.store.root);
					changed.push(this.store.update(snapshot.id, t => {
						if (activeAttempt(t)?.id !== attempt.id || activeAttempt(t)?.handoff || ["accepted", "cancelled", "pending"].includes(t.status)) return;
						activeAttempt(t)!.handoff = handoff; t.status = handoff.status; t.note = handoff.summary;
					}));
				} catch (error) {
					const note = `Invalid handoff: ${String(error)}`;
					if (snapshot.note !== note) changed.push(this.store.update(snapshot.id, t => { t.status = "blocked"; t.note = note; }));
				}
				continue;
			}
			if (snapshot.status === "waiting_compute" && attempt.handoff) {
				const exits = attempt.handoff.jobs.map(j => jobExit(this.store.root, j));
				if (exits.length && exits.every(x => x !== undefined)) changed.push(this.store.update(snapshot.id, t => {
					t.status = "blocked"; t.note = `Computation ended (exit codes: ${exits.join(", ")}). Inspect logs, then resume the worker to validate outputs. This is not scientific completion.`;
				}));
			} else if (snapshot.status === "running" && attempt.handle) {
				const runtime = await this.backend(attempt.handle.backend).inspect(attempt);
				// Give the first prompt time to arrive; handoff publication may race an idle report.
				if (runtime.state === "blocked" || runtime.state === "gone" || (runtime.state === "idle" && Date.now() - Date.parse(attempt.startedAt) > 60_000 && !fs.existsSync(file))) {
					changed.push(this.store.update(snapshot.id, t => { t.status = "blocked"; t.note = `Agent is ${runtime.state} without a validated handoff. Inspect its session; do not infer completion or repeat computation.`; }));
				}
			}
		}
		return changed;
	}
	async accept(id: string, evidence: string): Promise<TeamTask> {
		if (!evidence.trim()) throw new Error("Main-agent acceptance requires evidence and remaining limitations");
		await this.collect();
		const task = this.store.get(id), attempt = activeAttempt(task);
		if (task.status !== "submitted" || !attempt?.handoff) throw new Error("Only a submitted handoff can be accepted");
		for (const file of attempt.handoff.outputs) {
			if (task.role === "worker" && (!fs.existsSync(projectPath(this.store.root, file)) || fs.statSync(projectPath(this.store.root, file)).size === 0)) throw new Error(`Missing or empty output: ${file}`);
		}
		if (recordedJobs(task).some(j => jobExit(this.store.root, j) === undefined) || attempt.handoff.jobs.some(j => jobExit(this.store.root, j) !== 0)) throw new Error("Job exit records must be successful before acceptance");
		await this.closeIdle(task);
		return this.store.update(id, t => { t.status = "accepted"; t.acceptance = evidence; });
	}
	private async closeIdle(task: TeamTask): Promise<void> {
		const attempt = activeAttempt(task);
		if (!attempt || attempt.closed) return;
		if (!attempt.handle) throw new Error("Interrupted launch has no terminal identity. Inspect it before recovery.");
		const backend = this.backend(attempt.handle.backend);
		const runtime = await backend.inspect(attempt);
		if (!["idle", "gone"].includes(runtime.state)) throw new Error(`Agent is ${runtime.state}; cannot release its output ownership. Inspect the terminal first. ${runtime.detail ?? ""}`);
		if (runtime.state !== "gone") await backend.stop(attempt);
		this.store.update(task.id, t => { activeAttempt(t)!.closed = true; });
	}
	async retry(id: string, instruction: string, kind: "herdr" | "tmux", maxConcurrent = 3): Promise<TeamTask> {
		await this.collect();
		const task = this.store.get(id), attempt = activeAttempt(task);
		if (!["blocked", "failed", "submitted", "cancelled"].includes(task.status) || !instruction.trim()) throw new Error("Resume requires a blocked, failed, submitted or cancelled task and explicit correction/continuation instructions");
		if (recordedJobs(task).some(j => jobExit(this.store.root, j) === undefined)) throw new Error("Recorded computation may still be running; inspect its log/status before resuming");
		await this.closeIdle(task);
		this.store.update(id, t => { t.brief += `\n\nCoordinator continuation:\n${instruction}`; t.status = "pending"; });
		return this.start(id, kind, maxConcurrent);
	}
	async cancel(id: string): Promise<TeamTask> {
		const task = this.store.get(id), attempt = activeAttempt(task);
		if (task.status === "accepted") throw new Error("Accepted tasks are immutable; create a follow-up task");
		if (attempt && !attempt.closed) {
			if (!attempt.handle) throw new Error("No owned handle; inspect interrupted launch before cancellation");
			await this.backend(attempt.handle.backend).stop(attempt);
		}
		return this.store.update(id, t => { if (activeAttempt(t)) activeAttempt(t)!.closed = true; t.status = "cancelled"; t.note = "Agent stopped. Detached analysis jobs are preserved; inspect their logs before any restart."; });
	}
}
