/** Durable task state. Only the coordinator mutates this store; children publish handoffs. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

export type Role = "worker" | "scout" | "librarian" | "reviewer";
export type TaskStatus = "pending" | "running" | "waiting_compute" | "blocked" | "submitted" | "accepted" | "failed" | "cancelled";
export interface Job { session: string; statusFile: string; logFile: string }
export interface Handoff {
	taskId: string; attemptId: string;
	status: "submitted" | "waiting_compute" | "blocked" | "failed";
	summary: string; outputs: string[]; checks: string[]; jobs: Job[];
}
export interface Handle { backend: "herdr" | "tmux"; target: string; paneId: string; terminalId?: string }
export interface Attempt {
	id: string; dir: string; startedAt: string; handle?: Handle;
	handoff?: Handoff; error?: string; closed?: boolean;
}
export interface TeamTask {
	id: string; role: Role; brief: string; inputs: string[]; decisions: string[];
	writeScopes: string[]; criteria: string[]; dependsOn: string[];
	status: TaskStatus; attempts: Attempt[]; createdAt: string; updatedAt: string;
	note?: string; acceptance?: string;
}
export interface TeamState { version: 1; tasks: TeamTask[] }
export type TaskInput = Pick<TeamTask, "role" | "brief" | "inputs" | "decisions" | "writeScopes" | "criteria" | "dependsOn">;
export const activeAttempt = (task: TeamTask) => task.attempts.at(-1);
export const now = () => new Date().toISOString();

export function recordedJobs(task: TeamTask): Job[] {
	const jobs = task.attempts.flatMap(a => {
		const file = path.join(a.dir, "jobs.json");
		const registered = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as Job[] : [];
		return [...registered, ...(a.handoff?.jobs ?? [])];
	});
	return [...new Map(jobs.map(j => [j.statusFile, j])).values()];
}
export function jobExit(root: string, job: Job): number | undefined {
	const file = projectPath(root, job.statusFile);
	if (!fs.existsSync(file)) return undefined;
	const match = /^EXIT_STATUS:(\d+)\s*$/.exec(fs.readFileSync(file, "utf8"));
	return match ? Number(match[1]) : undefined;
}

export function atomicJSON(file: string, data: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temp = `${file}.${randomUUID()}.tmp`;
	try { fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 }); fs.renameSync(temp, file); }
	finally { fs.rmSync(temp, { force: true }); }
}

/** Resolve symlinks, including the existing ancestors of a not-yet-created path. */
function canonical(file: string): string {
	if (fs.existsSync(file)) return fs.realpathSync(file);
	const parent = path.dirname(file);
	return parent === file ? file : path.join(canonical(parent), path.basename(file));
}
export function projectPath(root: string, file: string): string {
	const base = canonical(path.resolve(root));
	const full = canonical(path.resolve(base, file));
	if (full !== base && !full.startsWith(base + path.sep)) throw new Error(`Path leaves analysis directory: ${file}`);
	return full;
}
export function overlaps(a: string, b: string): boolean {
	return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
}

export class TeamStore {
	readonly root: string;
	readonly dir: string;
	constructor(root: string) {
		this.root = fs.realpathSync(path.resolve(root));
		this.dir = projectPath(this.root, ".scientist");
	}
	read(): TeamState {
		const file = path.join(this.dir, "state.json");
		if (!fs.existsSync(file)) return { version: 1, tasks: [] };
		const state = JSON.parse(fs.readFileSync(file, "utf8")) as TeamState;
		if (state.version !== 1 || !Array.isArray(state.tasks)) throw new Error("Unsupported or corrupt Scientist task state");
		return state;
	}
	/** Short synchronous transaction with a cross-process lock; no network work inside. */
	mutate<T>(fn: (state: TeamState) => T): T {
		fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
		const lock = path.join(this.dir, "state.lock");
		let fd: number;
		try { fd = fs.openSync(lock, "wx", 0o600); }
		catch (error: any) {
			if (error.code !== "EEXIST") throw error;
			throw new Error("Scientist state is locked by another coordinator. Retry; inspect state.lock if a coordinator crashed.");
		}
		try {
			fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: now() }));
			const state = this.read();
			const result = fn(state);
			atomicJSON(path.join(this.dir, "state.json"), state);
			return result;
		} finally { fs.closeSync(fd); fs.unlinkSync(lock); }
	}
	get(id: string): TeamTask {
		const task = this.read().tasks.find(t => t.id === id);
		if (!task) throw new Error(`Unknown task: ${id}`);
		return task;
	}
	update(id: string, fn: (task: TeamTask, state: TeamState) => void): TeamTask {
		return this.mutate(state => {
			const task = state.tasks.find(t => t.id === id);
			if (!task) throw new Error(`Unknown task: ${id}`);
			fn(task, state); task.updatedAt = now(); return task;
		});
	}
	create(input: TaskInput): TeamTask {
		if (!input.brief.trim() || !input.criteria.length || input.criteria.some(c => !c.trim())) throw new Error("A task brief and concrete acceptance criteria are required");
		const scopes = input.writeScopes.map(p => projectPath(this.root, p));
		if (input.role === "worker" && !scopes.length) throw new Error("Workers require explicit writeScopes");
		if (input.role !== "worker" && scopes.length) throw new Error("Read-only specialists cannot receive writeScopes");
		for (const scope of scopes) {
			if (overlaps(scope, this.dir) || overlaps(scope, path.join(this.root, "Task"))) throw new Error("Workers cannot own project root, .scientist or Task; specify analysis output directories");
		}
		return this.mutate(state => {
			for (const id of input.dependsOn) if (!state.tasks.some(t => t.id === id)) throw new Error(`Unknown dependency: ${id}`);
			// Dependency IDs always refer to earlier immutable tasks, preventing cycles.
			const task: TeamTask = { ...input, writeScopes: scopes, id: `task-${randomUUID()}`, status: "pending", attempts: [], createdAt: now(), updatedAt: now() };
			state.tasks.push(task); return task;
		});
	}
	reserve(id: string, maxConcurrent: number): { task: TeamTask; attempt: Attempt } {
		let attempt!: Attempt;
		const task = this.update(id, (task, state) => {
			if (task.status !== "pending") throw new Error(`Task ${id} is ${task.status}, not pending`);
			if (task.dependsOn.some(dep => state.tasks.find(t => t.id === dep)?.status !== "accepted")) throw new Error("Dependencies must be accepted by the main agent before execution");
			const busy = state.tasks.filter(t => activeAttempt(t) && !activeAttempt(t)!.closed && !["accepted", "cancelled"].includes(t.status));
			if (busy.length >= maxConcurrent) throw new Error(`Expert concurrency limit (${maxConcurrent}) reached; accept or close finished attempts first`);
			const owners = state.tasks.filter(t => t.id !== task.id && (busy.includes(t) || recordedJobs(t).some(j => jobExit(this.root, j) === undefined)));
			for (const other of owners) for (const scope of task.writeScopes) for (const occupied of other.writeScopes) {
				if (overlaps(scope, occupied)) throw new Error(`Output ownership conflicts with ${other.id}: ${scope}`);
			}
			attempt = { id: randomUUID(), dir: "", startedAt: now() };
			attempt.dir = path.join(this.dir, "runs", task.id, attempt.id);
			task.attempts.push(attempt); task.status = "running"; task.note = undefined;
		});
		return { task, attempt };
	}
}

export function validateHandoff(value: unknown, task: TeamTask, attempt: Attempt, root: string): Handoff {
	const h = value as Handoff;
	if (!h || h.taskId !== task.id || h.attemptId !== attempt.id) throw new Error("Handoff task/attempt mismatch");
	if (!["submitted", "waiting_compute", "blocked", "failed"].includes(h.status) || typeof h.summary !== "string" || !h.summary.trim()) throw new Error("Invalid handoff status or summary");
	for (const field of ["outputs", "checks"] as const) if (!Array.isArray(h[field]) || h[field].some(x => typeof x !== "string" || !x.trim())) throw new Error(`Invalid handoff ${field}`);
	if (!Array.isArray(h.jobs)) throw new Error("Invalid handoff jobs");
	for (const job of h.jobs) {
		if (!job || typeof job.session !== "string" || !/^sci_[A-Za-z0-9_-]+$/.test(job.session)) throw new Error("Invalid tmux job session");
		for (const file of [job.statusFile, job.logFile]) {
			if (typeof file !== "string" || !file) throw new Error("Job log/status path required");
			const full = projectPath(root, file);
			if (!task.writeScopes.some(scope => overlaps(scope, full) && full !== scope)) throw new Error("Job files must be inside assigned output scope");
		}
	}
	if (h.status === "waiting_compute" && !h.jobs.length) throw new Error("Waiting for computation requires job records");
	if (h.status === "submitted" && !h.checks.length) throw new Error("Submission requires actual validation evidence");
	for (const output of h.outputs) {
		// Sources inspected by read-only roles may live outside the project.
		if (task.role === "worker") {
			const full = projectPath(root, output);
			if (!task.writeScopes.some(scope => full.startsWith(scope + path.sep))) throw new Error(`Output outside assigned directories: ${output}`);
		}
	}
	return h;
}
