/**
 * Core agent runner — spawns a pi process for a given agent and captures output.
 *
 * Each tool (sci_scout, sci_plan, sci_implement, sci_review, sci_parallel)
 * uses this as the underlying execution engine. It handles:
 * - Agent discovery and validation
 * - Temp file writing for agent system prompts
 * - Process spawning with JSON mode
 * - Streaming output parsing
 * - Usage tracking
 * - Cleanup
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import { type ExtensionContext, getMarkdownTheme, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentConfig } from "./agents.js";

// ============================================================================
// Types
// ============================================================================

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface AgentRunResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
}

export interface AgentRunDetails {
	agent: string;
	agentSource: string;
	task: string;
	exitCode: number;
	output: string;
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
}

/** Simplified type for rendering — avoids Message[] reconstruction */
export interface AgentRenderItem {
	agent: string;
	agentSource: string;
	task: string;
	exitCode: number;
	output: string;
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
}

// ============================================================================
// Formatting helpers
// ============================================================================

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(usage: UsageStats, model?: string): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (model) parts.push(model);
	return parts.join(" ");
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

// ============================================================================
// Pi invocation
// ============================================================================

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

// ============================================================================
// Skill injection
// ============================================================================

// Skills are discovered via pi's progressive disclosure (resources_discover).
// Subagents see skill names + descriptions in their system prompt and use
// `read` to load the full SKILL.md when a plan step specifies a skill.
// No hardcoded skill lists or content injection needed.

// ============================================================================
// Core runner
// ============================================================================

export type OnAgentUpdate = (partial: { output: string; details: AgentRunDetails }) => void;

export async function runAgent(
	cwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	options?: {
		workDir?: string;
		signal?: AbortSignal;
		onUpdate?: OnAgentUpdate;
	},
): Promise<AgentRunResult> {
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		};
	}

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	let tmpDir: string | null = null;
	let tmpPath: string | null = null;

	const result: AgentRunResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: agent.model,
	};

	const emitUpdate = () => {
		if (options?.onUpdate) {
			options.onUpdate({
				output: getFinalOutput(result.messages) || "(running...)",
				details: {
					agent: result.agent,
					agentSource: result.agentSource,
					task: result.task,
					exitCode: result.exitCode,
					output: getFinalOutput(result.messages),
					usage: result.usage,
					model: result.model,
					stderr: result.stderr,
					stopReason: result.stopReason,
					errorMessage: result.errorMessage,
				},
			});
		}
	};

	try {
		if (agent.systemPrompt.trim()) {
			tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-scientist-"));
			tmpPath = path.join(tmpDir, `prompt-${agent.name}.md`);
			await withFileMutationQueue(tmpPath, async () => {
				await fs.promises.writeFile(tmpPath!, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
			});
			args.push("--append-system-prompt", tmpPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: options?.workDir ?? cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);

					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
							result.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data: Buffer) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code: number | null) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (options?.signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (options.signal.aborted) killProc();
				else options.signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
		if (wasAborted) throw new Error("Agent was aborted");
		return result;
	} finally {
		if (tmpPath) try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
		if (tmpDir) try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
	}
}

// ============================================================================
// Fork-mode runner (inherits full session context)
// ============================================================================

/**
 * Fork-mode agent runner — forks the current session for a subagent,
 * giving it the full conversation context.
 *
 * Unlike runAgent (which spawns an isolated process), runAgentFork:
 * - Uses --fork to inherit the session's full message history
 * - Does NOT restrict tools (full tool set from the forked session)
 * - Appends the agent's system prompt + skills via --append-system-prompt
 */

export async function runAgentFork(
	sessionFile: string,
	cwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	options?: {
		workDir?: string;
		signal?: AbortSignal;
		onUpdate?: OnAgentUpdate;
	},
): Promise<AgentRunResult> {
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		};
	}

	// Fork args: load session context into a new forked session
	const args: string[] = ["--mode", "json", "-p"];
	args.push("--fork", sessionFile);

	// Use agent's model if specified
	if (agent.model) args.push("--model", agent.model);

	// DO NOT set --tools: full tool set from the forked session

	let tmpDir: string | null = null;

	const result: AgentRunResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: agent.model,
	};

	const emitUpdate = () => {
		if (options?.onUpdate) {
			options.onUpdate({
				output: getFinalOutput(result.messages) || "(running...)",
				details: {
					agent: result.agent,
					agentSource: result.agentSource,
					task: result.task,
					exitCode: result.exitCode,
					output: getFinalOutput(result.messages),
					usage: result.usage,
					model: result.model,
					stderr: result.stderr,
					stopReason: result.stopReason,
					errorMessage: result.errorMessage,
				},
			});
		}
	};

	try {
		// Build prompt: agent system prompt
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-scientist-fork-"));

		const fullPrompt = agent.systemPrompt;

		if (fullPrompt.trim()) {
			const promptPath = path.join(tmpDir, `prompt-${agent.name}.md`);
			await withFileMutationQueue(promptPath, async () => {
				await fs.promises.writeFile(promptPath, fullPrompt, { encoding: "utf-8", mode: 0o600 });
			});
			args.push("--append-system-prompt", promptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: options?.workDir ?? cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);

					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
							result.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data: Buffer) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code: number | null) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (options?.signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (options.signal.aborted) killProc();
				else options.signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
		if (wasAborted) throw new Error("Agent was aborted");
		return result;
	} finally {
		if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
	}
}

// ============================================================================
// Parallel runner
// ============================================================================

export async function runParallel(
	cwd: string,
	agents: AgentConfig[],
	tasks: { agent: string; task: string; workDir?: string }[],
	options?: {
		signal?: AbortSignal;
		onUpdate?: OnAgentUpdate;
		maxConcurrency?: number;
	},
): Promise<AgentRunResult[]> {
	if (tasks.length === 0) return [];

	const limit = Math.max(1, Math.min(options?.maxConcurrency ?? 4, tasks.length));
	const results: AgentRunResult[] = new Array(tasks.length);
	let nextIndex = 0;

	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const idx = nextIndex++;
			if (idx >= tasks.length) return;
			const t = tasks[idx];
			results[idx] = await runAgent(cwd, agents, t.agent, t.task, {
				workDir: t.workDir,
				signal: options?.signal,
				onUpdate: options?.onUpdate,
			});
		}
	});

	await Promise.all(workers);
	return results;
}

// ============================================================================
// TUI rendering helpers
// ============================================================================

export function renderAgentResult(
	items: AgentRenderItem | AgentRenderItem[],
	mode: "single" | "parallel",
	expanded: boolean,
	theme: any,
): Text | Container {
	const results = Array.isArray(items) ? items : [items];
	const mdTheme = getMarkdownTheme();

	const successCount = results.filter((r) => r.exitCode === 0 && r.stopReason !== "error" && r.stopReason !== "aborted").length;
	const icon = successCount === results.length
		? theme.fg("success", "✓")
		: theme.fg("error", "✗");

	if (!expanded) {
		let text = icon;
		if (mode === "single" && results.length === 1) {
			const r = results[0];
			text += ` ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
			if (r.output) {
				const preview = r.output.slice(0, 150).replace(/\n/g, " ");
				text += `\n${theme.fg("toolOutput", preview)}${r.output.length > 150 ? "..." : ""}`;
			} else {
				text += `\n${theme.fg("muted", "(no output)")}`;
			}
			const usageStr = formatUsageStats(r.usage, r.model);
			if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
		} else {
			text += ` ${theme.fg("toolTitle", theme.bold("parallel"))} ${theme.fg("accent", `${successCount}/${results.length}`)}`;
			for (const r of results) {
				const rIcon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
				const preview = r.output ? r.output.slice(0, 60).replace(/\n/g, " ") : "(no output)";
				text += `\n  ${rIcon} ${theme.fg("accent", r.agent)} ${theme.fg("dim", preview)}`;
			}
		}
		return new Text(text, 0, 0);
	}

	// Expanded view
	const container = new Container();

	if (mode === "single" && results.length === 1) {
		const r = results[0];
		const isError = r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
		const statusIcon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
		let header = `${statusIcon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
		if (isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
		container.addChild(new Text(header, 0, 0));

		if (isError && r.errorMessage) {
			container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
		}
		if (r.stderr && r.stderr.trim()) {
			container.addChild(new Text(theme.fg("warning", `Stderr: ${r.stderr.trim().slice(0, 200)}`), 0, 0));
		}

		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
		container.addChild(new Text(theme.fg("dim", r.task), 0, 0));

		if (r.output) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
			container.addChild(new Markdown(r.output.trim(), 0, 0, mdTheme));
		}

		const usageStr = formatUsageStats(r.usage, r.model);
		if (usageStr) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
		}
	} else {
		container.addChild(new Text(
			`${icon} ${theme.fg("toolTitle", theme.bold("parallel"))} ${theme.fg("accent", `${successCount}/${results.length} tasks`)}`,
			0, 0,
		));

		for (const r of results) {
			const rIcon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
			container.addChild(new Spacer(1));
			container.addChild(new Text(
				`${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}`,
				0, 0,
			));
			container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

			if (r.output) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(r.output.trim(), 0, 0, mdTheme));
			}

			const usageStr = formatUsageStats(r.usage, r.model);
			if (usageStr) container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
		}

		// Aggregate usage
		const total = results.reduce(
			(acc, r) => ({
				input: acc.input + r.usage.input,
				output: acc.output + r.usage.output,
				cacheRead: acc.cacheRead + r.usage.cacheRead,
				cacheWrite: acc.cacheWrite + r.usage.cacheWrite,
				cost: acc.cost + r.usage.cost,
				contextTokens: acc.contextTokens + r.usage.contextTokens,
				turns: acc.turns + r.usage.turns,
			}),
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		);
		const totalStr = formatUsageStats(total);
		if (totalStr) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", `Total: ${totalStr}`), 0, 0));
		}
	}

	return container;
}
