import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentRunResult, AgentRenderItem } from "../runner.js";

export function extractOutput(result: AgentRunResult): string {
	if (result.exitCode !== 0) {
		return `${result.agent} failed: ${result.errorMessage || result.stderr || "(no output)"}`;
	}
	return result.messages
		.filter((message) => message.role === "assistant")
		.map((message) => message.content.filter((content) => content.type === "text").map((content) => content.text).join(""))
		.join("\n");
}

/** Extract and validate the last JSON code block from worker output. */
export function extractHandoffJson(output: string): string | null {
	const matches = output.match(/```json\s*\n([\s\S]*?)\n```/g);
	if (!matches?.length) return null;

	const json = matches[matches.length - 1]
		.replace(/^```json\s*\n/, "")
		.replace(/\n```$/, "")
		.trim();
	try {
		const parsed = JSON.parse(json);
		return parsed.stepId && parsed.planFile ? json : null;
	} catch {
		return null;
	}
}

export function hasUncheckedTodolistItems(planPath: string): boolean | null {
	let content: string;
	try {
		content = fs.readFileSync(planPath, "utf-8");
	} catch {
		return null;
	}

	let inTodolist = false;
	let sawTodolist = false;
	for (const line of content.split(/\r?\n/)) {
		if (/^##\s+Todolist\b/.test(line)) {
			inTodolist = true;
			sawTodolist = true;
			continue;
		}
		if (inTodolist && /^##\s+/.test(line)) break;
		if (inTodolist && /^-\s+\[ \]\s+(?:\*\*[^*]+\*\*|[A-Za-z][\w-]*)\s*:/.test(line)) return true;
	}
	return sawTodolist ? false : null;
}

export function makeDetails(result: AgentRunResult, output: string): AgentRenderItem {
	return {
		agent: result.agent,
		agentSource: result.agentSource,
		task: result.task,
		exitCode: result.exitCode,
		output,
		stderr: result.stderr,
		usage: result.usage,
		model: result.model,
		stopReason: result.stopReason,
		errorMessage: result.errorMessage,
	};
}

/** Minimal details for early-return paths where no agent run happened. */
export function stubDetails(agent: string, task: string): AgentRenderItem {
	return {
		agent,
		agentSource: "unknown",
		task,
		exitCode: 1,
		output: "",
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
	};
}

export interface ScriptRun {
	module: string;
	session: string;
	script: string;
	exitCode: number;
	duration_s?: number;
	ts?: string;
	startTs?: number;
	endTs?: number;
	logFile: string;
	statusFile: string;
	manifestPath: string;
}

/** Scan an analysis root for every <Module>/tmux/manifest.jsonl. */
export function collectScriptRuns(root: string): ScriptRun[] {
	const runs: ScriptRun[] = [];
	let modules: string[];
	try {
		modules = fs.readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => fs.existsSync(path.join(root, name, "tmux", "manifest.jsonl")));
	} catch {
		return [];
	}

	for (const moduleName of modules) {
		const manifest = path.join(root, moduleName, "tmux", "manifest.jsonl");
		let content: string;
		try {
			content = fs.readFileSync(manifest, "utf-8");
		} catch {
			continue;
		}
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const record = JSON.parse(trimmed);
				runs.push({
					module: String(record.module ?? moduleName),
					session: String(record.session ?? ""),
					script: String(record.script ?? ""),
					exitCode: Number(record.exitCode),
					duration_s: record.duration_s,
					ts: record.ts,
					startTs: record.startTs,
					endTs: record.endTs,
					logFile: String(record.logFile ?? ""),
					statusFile: String(record.statusFile ?? ""),
					manifestPath: path.join(moduleName, "tmux", "manifest.jsonl"),
				});
			} catch {
				// Ignore malformed manifest lines.
			}
		}
	}
	return runs;
}

export function fmtDuration(seconds: number | undefined): string {
	if (seconds == null) return "-";
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
	return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}
