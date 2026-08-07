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
import type { Message } from "@earendil-works/pi-ai";
import { getMarkdownTheme, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
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

interface AgentRunOptions {
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
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
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
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
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

/** Shared subprocess engine used by isolated spawn and session fork modes. */
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
		promptPath = await writeSystemPrompt(agent);
		if (promptPath) args.push("--append-system-prompt", promptPath);
		args.push(`Task: ${task}`);

		let wasAborted = false;
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: options?.workDir ?? cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				// Signal to the scientist extension's before_agent_start hook that this
				// is a subagent: skip injecting the main-agent SCIENTIST_ENFORCEMENT
				// prompt. Subagents carry their own agent .md system prompt instead.
				env: { ...process.env, SCIENTIST_NO_ENFORCEMENT: "1" },
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
			proc.on("error", () => resolve(1));

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

	const args = ["--mode", "json", "-p", "--no-session"];
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
	const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
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
