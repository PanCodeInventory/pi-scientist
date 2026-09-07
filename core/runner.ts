/**
 * Core agent runner — spawns a pi process for a given agent and captures output.
 *
 * Scientist subagent tools (sci_scout, sci_librarian, sci_implement, sci_review)
 * use this as the underlying execution engine. It handles:
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
import type { Message, Usage } from "@earendil-works/pi-ai";
import { getMarkdownTheme, truncateHead, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
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
	/** All model usage reported by the subprocess, including nested tools. */
	modelUsage?: Usage;
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

/** Simplified type for rendering — avoids Message[] reconstruction. */
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

export type OnAgentUpdate = (partial: { output: string; details: AgentRunDetails }) => void;

export interface AgentRunOptions {
	timeoutSeconds?: number;
	workDir?: string;
	signal?: AbortSignal;
	onUpdate?: OnAgentUpdate;
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
			return truncateHead(msg.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")).content;
		}
	}
	return "";
}

function emptyUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

// ============================================================================
// Pi invocation
// ============================================================================

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	// SDK/tests may have process.argv[1] pointing at an unrelated application.
	if (currentScript && /(?:pi-coding-agent|coding-agent)[/\\].*cli\.[cm]?js$/.test(currentScript) && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };

	return { command: "pi", args };
}

function unknownAgentResult(agents: AgentConfig[], agentName: string, task: string): AgentRunResult {
	const available = agents.map((agent) => `"${agent.name}"`).join(", ") || "none";
	return {
		agent: agentName,
		agentSource: "unknown",
		task,
		exitCode: 1,
		messages: [],
		stderr: `Unknown agent: "${agentName}". Available: ${available}.`,
		usage: emptyUsage(),
	};
}

async function writeSystemPrompt(agent: AgentConfig): Promise<string | null> {
	if (!agent.systemPrompt.trim()) return null;

	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-scientist-"));
	const promptPath = path.join(tmpDir, `prompt-${agent.name}.md`);
	try {
		await withFileMutationQueue(promptPath, async () => {
			await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
		});
		return promptPath;
	} catch (error) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		throw error;
	}
}

/** Isolated, bounded subprocess; no automatic follow-up agents. */
async function spawnPiAgent(
	cwd: string,
	agent: AgentConfig,
	task: string,
	baseArgs: string[],
	options?: AgentRunOptions,
): Promise<AgentRunResult> {
	const args = [...baseArgs];
	const result: AgentRunResult = {
		agent: agent.name,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: emptyUsage(),
		model: agent.model,
		modelUsage: {
			input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
	let promptPath: string | null = null;

	const emitUpdate = () => {
		options?.onUpdate?.({
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
	};

	try {
		options?.signal?.throwIfAborted();
		promptPath = await writeSystemPrompt(agent);
		if (promptPath) args.push("--append-system-prompt", promptPath);
		args.push(`Task: ${task}`);

		let wasAborted = false;
		let timedOut = false;
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: options?.workDir ?? cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				detached: process.platform !== "win32",
				// Resources still load; Scientist tools/hooks do not register in children.
				env: { ...process.env, SCIENTIST_SUBAGENT: "1", SCIENTIST_NO_ENFORCEMENT: "1" },
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
					const usage = (msg as { usage?: Usage }).usage;
					if (usage) {
						for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
							result.usage[key] += usage[key] || 0;
							result.modelUsage![key] += usage[key] || 0;
						}
						result.modelUsage!.totalTokens += usage.totalTokens || 0;
						for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
							result.modelUsage!.cost[key] += usage.cost?.[key] || 0;
						}
						result.usage.cost += usage.cost?.total || 0;
					}
					if (msg.role === "assistant") {
						// Retain the final response, not the entire subprocess conversation.
						result.messages = [msg];
						result.usage.turns++;
						result.usage.contextTokens = msg.usage?.totalTokens || 0;
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
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
				result.stderr = (result.stderr + data.toString()).slice(-50_000);
			});
			let closed = false;
			let killTimer: ReturnType<typeof setTimeout> | undefined;
			const kill = (signal: NodeJS.Signals) => {
				if (closed) return;
				try {
					if (process.platform !== "win32" && proc.pid) process.kill(-proc.pid, signal);
					else proc.kill(signal);
				} catch { /* Already exited. */ }
			};
			const stop = () => {
				kill("SIGTERM");
				killTimer ??= setTimeout(() => kill("SIGKILL"), 1000);
			};
			const abort = () => { wasAborted = true; stop(); };
			const timeout = setTimeout(() => { timedOut = true; stop(); }, (options?.timeoutSeconds ?? 600) * 1000);
			const cleanup = () => {
				closed = true;
				clearTimeout(timeout);
				if (killTimer) clearTimeout(killTimer);
				options?.signal?.removeEventListener("abort", abort);
			};
			proc.on("close", (code: number | null) => {
				cleanup();
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 1);
			});
			proc.on("error", (error) => { result.errorMessage = error.message; cleanup(); resolve(1); });
			if (options?.signal?.aborted) abort();
			else options?.signal?.addEventListener("abort", abort, { once: true });
		});

		result.exitCode = exitCode;
		if (wasAborted || timedOut) {
			result.exitCode = 1;
			result.stopReason = "aborted";
			result.errorMessage = wasAborted ? "Agent was aborted" : `Agent exceeded ${options?.timeoutSeconds ?? 600}s runtime limit. Detached analysis jobs may still be running; inspect their logs before retrying.`;
		} else if (!result.messages.some((message) => message.role === "assistant")) {
			result.exitCode = 1;
			result.errorMessage ||= "Agent exited without an assistant response.";
		}
		return result;
	} finally {
		if (promptPath) {
			try {
				fs.rmSync(path.dirname(promptPath), { recursive: true, force: true });
			} catch {
				// Best-effort cleanup only.
			}
		}
	}
}

// ============================================================================
// Public runners
// ============================================================================

export async function runAgent(
	cwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	options?: AgentRunOptions,
): Promise<AgentRunResult> {
	const agent = agents.find((candidate) => candidate.name === agentName);
	if (!agent) return unknownAgentResult(agents, agentName, task);

	const args = ["--mode", "json", "-p", "--no-session", "--exclude-tools",
		"sci_scout,sci_librarian,sci_implement,sci_review,sci_logs,ask_user_question,sci_dispatch,sci_tasks,sci_handoff"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", agent.tools.join(","));
	return spawnPiAgent(cwd, agent, task, args, options);
}

// ============================================================================
// TUI rendering helpers
// ============================================================================

export function renderAgentResult(
	result: AgentRenderItem,
	expanded: boolean,
	theme: any,
): Text | Container {
	const isError = result.exitCode !== 0 || ["error", "aborted", "length"].includes(result.stopReason ?? "");
	const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");

	if (!expanded) {
		let text = `${icon} ${theme.fg("toolTitle", theme.bold(result.agent))}${theme.fg("muted", ` (${result.agentSource})`)}`;
		if (result.output) {
			const preview = result.output.slice(0, 150).replace(/\n/g, " ");
			text += `\n${theme.fg("toolOutput", preview)}${result.output.length > 150 ? "..." : ""}`;
		} else {
			text += `\n${theme.fg("muted", "(no output)")}`;
		}
		const usageStr = formatUsageStats(result.usage, result.model);
		if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
		return new Text(text, 0, 0);
	}

	const container = new Container();
	let header = `${icon} ${theme.fg("toolTitle", theme.bold(result.agent))}${theme.fg("muted", ` (${result.agentSource})`)}`;
	if (isError && result.stopReason) header += ` ${theme.fg("error", `[${result.stopReason}]`)}`;
	container.addChild(new Text(header, 0, 0));

	if (isError && result.errorMessage) {
		container.addChild(new Text(theme.fg("error", `Error: ${result.errorMessage}`), 0, 0));
	}
	if (result.stderr && result.stderr.trim()) {
		container.addChild(new Text(theme.fg("warning", `Stderr: ${result.stderr.trim().slice(0, 200)}`), 0, 0));
	}

	container.addChild(new Spacer(1));
	container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
	container.addChild(new Text(theme.fg("dim", result.task), 0, 0));

	if (result.output) {
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
		container.addChild(new Markdown(result.output.trim(), 0, 0, getMarkdownTheme()));
	}

	const usageStr = formatUsageStats(result.usage, result.model);
	if (usageStr) {
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
	}

	return container;
}
