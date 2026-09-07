/** Terminal backends manage owned agent processes, never scientific completion. */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "./agents.js";
import type { Attempt, Handle, TeamTask } from "./team-store.js";

export type Command = (command: string, args: string[]) => Promise<string>;
export const command: Command = (bin, args) => new Promise((resolve, reject) => {
	execFile(bin, args, { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
		if (error) reject(new Error(`${bin} ${args.slice(0, 2).join(" ")}: ${stderr || error.message}`));
		else resolve(stdout);
	});
});
export const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
export interface RuntimeState { state: "working" | "idle" | "blocked" | "gone" | "unknown"; detail?: string }
export interface LaunchSpec { root: string; task: TeamTask; attempt: Attempt; agent: AgentConfig }
export interface TeamBackend {
	launch(spec: LaunchSpec, allocated: (handle: Handle) => void): Promise<void>;
	inspect(attempt: Attempt): Promise<RuntimeState>;
	stop(attempt: Attempt): Promise<void>;
}

function entryPath(): string {
	return fileURLToPath(new URL("../index.js", import.meta.url)).replace(/index\.js$/, fs.existsSync(fileURLToPath(new URL("../index.js", import.meta.url))) ? "index.js" : "index.ts");
}

function invocation(spec: LaunchSpec) {
	const { agent, task, attempt, root } = spec;
	const session = path.join(attempt.dir, "session.jsonl");
	const args = ["-e", entryPath(), "--session", session, "--append-system-prompt", path.join(attempt.dir, "role.md"),
		"--exclude-tools", "sci_dispatch,sci_tasks,sci_scout,sci_librarian,sci_implement,sci_review,sci_logs,ask_user_question"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", [...agent.tools, "sci_handoff"].join(","));
	return {
		args,
		env: [`PATH=${process.env.PATH ?? ""}`, "SCIENTIST_SUBAGENT=1", `SCIENTIST_TEAM_ROOT=${root}`, `SCIENTIST_TASK_ID=${task.id}`, `SCIENTIST_ATTEMPT_ID=${attempt.id}`],
		prompt: `Read ${JSON.stringify(path.join(attempt.dir, "brief.md"))} and complete this assignment. Task ${task.id}, attempt ${attempt.id}. Report through sci_handoff, then end your turn.`,
	};
}

export class TerminalBackend implements TeamBackend {
	constructor(readonly kind: "herdr" | "tmux", private readonly run: Command = command) {}
	private async herdr(args: string[]): Promise<any> {
		if (process.env.HERDR_ENV !== "1") throw new Error("Herdr backend requires Pi inside a Herdr pane (HERDR_ENV=1). Launch Pi in Herdr, or explicitly use backend=tmux.");
		const response = JSON.parse(await this.run("herdr", args));
		if (response.error || response.ok === false) throw new Error(JSON.stringify(response.error ?? response));
		return response.result;
	}
	async launch(spec: LaunchSpec, allocated: (handle: Handle) => void): Promise<void> {
		const { args, env, prompt } = invocation(spec);
		const target = `sci-${spec.attempt.id.replaceAll("-", "").slice(0, 24)}`;
		if (this.kind === "herdr") {
			const split = await this.herdr(["pane", "split", "--current", "--direction", "down", "--cwd", spec.root, "--no-focus", ...env.flatMap(e => ["--env", e])]);
			const pane = split?.pane;
			if (!pane?.pane_id) throw new Error("Herdr split returned no pane ID; inspect the layout before retrying");
			const handle: Handle = { backend: "herdr", target, paneId: pane.pane_id, terminalId: pane.terminal_id };
			allocated(handle); // Persist identity before another external mutation.
			const started = await this.herdr(["agent", "start", target, "--kind", "pi", "--pane", handle.paneId, "--timeout", "30000", "--", ...args]);
			if (started?.agent?.terminal_id) { handle.terminalId = started.agent.terminal_id; allocated(handle); }
			await this.herdr(["agent", "prompt", target, prompt]);
		} else {
			// All interpolated arguments are POSIX-quoted, including paths and the prompt.
			const script = path.join(spec.attempt.dir, "launch.sh");
			fs.writeFileSync(script, `#!/bin/sh\ncd ${shellQuote(spec.root)} || exit 1\n${["env", ...env, "pi", ...args, prompt].map(shellQuote).join(" ")}\ncode=$?\nprintf '%s\\n' "$code" > ${shellQuote(path.join(spec.attempt.dir, "exit-code"))}\nexit "$code"\n`, { mode: 0o700 });
			// Allocate an idle shell first so a caller timeout cannot lose the agent identity.
			const paneId = (await this.run("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", target, "-c", spec.root])).trim();
			if (!/^%\d+$/.test(paneId)) throw new Error("tmux returned no pane ID");
			allocated({ backend: "tmux", target, paneId });
			await this.run("tmux", ["respawn-pane", "-k", "-t", paneId, "sh", script]);
		}
	}
	async inspect(attempt: Attempt): Promise<RuntimeState> {
		const h = attempt.handle;
		if (!h) return { state: "unknown", detail: "Launch interrupted before backend identity was persisted; inspect the terminal before retrying." };
		if (h.backend === "herdr") {
			try {
				const data = await this.herdr(["agent", "get", h.target]);
				const agent = data?.agent;
				if (!agent || agent.name !== h.target || (h.terminalId && agent.terminal_id !== h.terminalId)) return { state: "unknown", detail: "Herdr agent identity changed" };
				if (agent.agent_status === "blocked") return { state: "blocked" };
				const file = path.join(attempt.dir, "lifecycle.json");
				if (fs.existsSync(file)) {
					const lifecycle = JSON.parse(fs.readFileSync(file, "utf8"));
					if (lifecycle.attemptId === attempt.id && lifecycle.state !== "gone") return { state: lifecycle.state };
				}
				return { state: agent.agent_status === "done" ? "idle" : agent.agent_status ?? "unknown" };
			} catch (error) {
				// Connection errors cannot establish that the process is gone.
				return { state: "unknown", detail: String(error) };
			}
		}
		try {
			const owner = (await this.run("tmux", ["display-message", "-p", "-t", h.paneId, "#{session_name}"])).trim();
			if (owner !== h.target) return { state: "unknown", detail: "tmux pane identity changed" };
			const file = path.join(attempt.dir, "lifecycle.json");
			if (!fs.existsSync(file)) return { state: "unknown", detail: "Waiting for Pi lifecycle hook" };
			const lifecycle = JSON.parse(fs.readFileSync(file, "utf8"));
			return lifecycle.attemptId === attempt.id ? { state: lifecycle.state } : { state: "unknown", detail: "Stale lifecycle record" };
		} catch (error) {
			return fs.existsSync(path.join(attempt.dir, "exit-code")) ? { state: "gone" } : { state: "unknown", detail: String(error) };
		}
	}
	async stop(attempt: Attempt): Promise<void> {
		const h = attempt.handle;
		if (!h) throw new Error("No owned terminal handle; inspect the interrupted launch before retrying");
		if (h.backend === "herdr") {
			const data = await this.herdr(["agent", "get", h.target]);
			if (data?.agent?.name !== h.target || !h.terminalId || data.agent.terminal_id !== h.terminalId) throw new Error("Refusing to close a Herdr terminal whose identity cannot be verified");
			await this.herdr(["pane", "close", data.agent.pane_id]);
		} else {
			if (fs.existsSync(path.join(attempt.dir, "exit-code"))) return;
			const owner = (await this.run("tmux", ["display-message", "-p", "-t", h.paneId, "#{session_name}"])).trim();
			if (owner !== h.target) throw new Error("Refusing to stop a tmux pane whose identity changed");
			await this.run("tmux", ["kill-session", "-t", h.target]);
		}
	}
}
