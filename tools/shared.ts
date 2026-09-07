import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import type { AgentRunResult, AgentRenderItem } from "../core/runner.js";

export function extractOutput(result: AgentRunResult): string {
	if (result.exitCode !== 0) {
		return `${result.agent} failed: ${result.errorMessage || result.stderr || "(no output)"}`;
	}
	const last = result.messages.filter((message) => message.role === "assistant").at(-1);
	return last?.content.filter((content) => content.type === "text").map((content) => content.text).join("\n") ?? "";
}

/** Pi marks thrown tool errors as failures; returning isError alone is insufficient. */
export function agentToolResult(result: AgentRunResult) {
	const response = extractOutput(result);
	const output = [result.errorMessage && !response.includes(result.errorMessage) ? result.errorMessage : "", response]
		.filter(Boolean).join("\n") || "(no output)";
	let text = truncateHead(output).content;
	if (text !== output) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scientist-output-"));
		const file = path.join(dir, "output.txt");
		fs.writeFileSync(file, output, { mode: 0o600 });
		text += `\n\n[Output truncated. Full output: ${file}]`;
	}
	if (result.exitCode !== 0 || ["error", "aborted", "length", "toolUse"].includes(result.stopReason ?? "") ||
		/^(?:#{1,6}\s*)?(?:ANALYSIS TERMINATED|BLOCKED)\b/m.test(output)) {
		throw new Error(`${result.agent} did not complete successfully (${result.stopReason ?? result.exitCode}): ${text}`);
	}
	return {
		content: [{ type: "text" as const, text }],
		details: makeDetails(result, text),
		usage: result.modelUsage,
	};
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

/** Rendering details for log-tool failures that do not start an agent. */
export function stubDetails(agent: string, task: string): AgentRenderItem {
	return {
		agent, agentSource: "unknown", task, exitCode: 1, output: "", stderr: "",
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
