/**
 * Scientist — Bioinformatics workflow extension
 *
 * Combines three capabilities into one cohesive system:
 *   1. System prompt enforcement that teaches the Scientist methodology
 *   2. Specialized subagent tools (sci_scout, sci_librarian, sci_plan,
 *      sci_implement, sci_review, sci_parallel) designed for
 *      the bioinformatics analysis workflow
 *   3. /scientist toggle to enable/disable Scientist mode
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverScientists } from "./agents.js";
import { SCIENTIST_ENFORCEMENT } from "./enforcement.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
	runAgent,
	runAgentFork,
	runParallel,
	renderAgentResult,
	type AgentRunResult,
	type AgentRunDetails,
	type AgentRenderItem,
} from "./runner.js";

// ============================================================================
// Tool names
// ============================================================================

/** Tool names registered by this extension */
const SCI_TOOLS = [
	"ask_user_question",
	"sci_scout",
	"sci_librarian",
	"sci_plan",
	"sci_implement",
	"sci_review",
	"sci_parallel",
	"sci_logs",
];

// ============================================================================
// System prompt manipulation
// ============================================================================

function injectEnforcement(prompt: string): string {
	if (prompt.includes("<scientist-enforcement>")) return prompt;
	const marker = "\nCurrent date:";
	return prompt.includes(marker)
		? prompt.replace(marker, SCIENTIST_ENFORCEMENT + marker)
		: prompt + SCIENTIST_ENFORCEMENT;
}

// ============================================================================
// Helpers
// ============================================================================

function extractOutput(result: AgentRunResult): string {
	if (result.exitCode !== 0) {
		return `${result.agent} failed: ${result.errorMessage || result.stderr || "(no output)"}`;
	}
	return result.messages
		.filter((m) => m.role === "assistant")
		.map((m) => m.content.filter((c) => c.type === "text").map((c) => c.text).join(""))
		.join("\n");
}

/**
 * Extract the last ```json code block from worker output.
 * Returns the raw JSON string (or null if not found).
 */
function extractHandoffJson(output: string): string | null {
	const matches = output.match(/```json\s*\n([\s\S]*?)\n```/g);
	if (!matches || matches.length === 0) return null;
	// Take the last json block (the handoff is always the last one)
	const lastMatch = matches[matches.length - 1];
	const jsonStr = lastMatch.replace(/^```json\s*\n/, "").replace(/\n```$/, "").trim();
	// Quick validation
	try {
		const parsed = JSON.parse(jsonStr);
		if (parsed.stepId && parsed.planFile) return jsonStr;
	} catch { /* not valid json, fall through */ }
	return null;
}

function makeDetails(result: AgentRunResult, output: string): AgentRenderItem {
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

/** Minimal AgentRenderItem for early-return paths where no agent run happened. */
function stubDetails(agent: string, task: string): AgentRenderItem {
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

interface ScriptRun {
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

/** Scan an analysis root for every <Module>/tmux/manifest.jsonl and parse all runs. */
function collectScriptRuns(root: string): ScriptRun[] {
	const runs: ScriptRun[] = [];
	let modules: string[];
	try {
		modules = fs.readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)
			.filter((n) => fs.existsSync(path.join(root, n, "tmux", "manifest.jsonl")));
	} catch { return []; }
	for (const mod of modules) {
		const manifest = path.join(root, mod, "tmux", "manifest.jsonl");
		let content: string;
		try { content = fs.readFileSync(manifest, "utf-8"); } catch { continue; }
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const o = JSON.parse(trimmed);
				runs.push({
					module: String(o.module ?? mod),
					session: String(o.session ?? ""),
					script: String(o.script ?? ""),
					exitCode: Number(o.exitCode),
					duration_s: o.duration_s,
					ts: o.ts,
					startTs: o.startTs,
					endTs: o.endTs,
					logFile: String(o.logFile ?? ""),
					statusFile: String(o.statusFile ?? ""),
					manifestPath: path.join(mod, "tmux", "manifest.jsonl"),
				});
			} catch { /* skip malformed line */ }
		}
	}
	return runs;
}

function fmtDuration(s: number | undefined): string {
	if (s == null) return "-";
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
	return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

interface AskUserOption {
	label: string;
	value?: string;
	description?: string;
}

interface AskUserQuestionDetails {
	question: string;
	options: AskUserOption[];
	answer: string | null;
	value: string | null;
	cancelled: boolean;
	wasCustom?: boolean;
	selectedIndex?: number;
}

// ============================================================================
// Extension entry
// ============================================================================

export default function (pi: ExtensionAPI) {
	// ── /reflect — introspective Socratic Q&A ─────────────────────────

	pi.registerCommand("reflect", {
		description: "\u81ea\u7701\u6a21\u5f0f\uff1a\u56de\u987e\u5df2\u5b8c\u6210\u7684\u5206\u6790\uff0c\u901a\u8fc7\u82cf\u683c\u62c9\u5e95\u5f0f\u63d0\u95ee\u5e2e\u52a9\u4f60\u6df1\u5165\u7406\u89e3\u6280\u672f\u539f\u7406\u548c\u53c2\u6570",
		async handler(_args, ctx) {
			const INTROSPECTION_PROMPT = [
				"## \ud83d\udd2c \u81ea\u7701\u6a21\u5f0f\u542f\u52a8",
				"",
				"\u4f60\u73b0\u5728\u8981\u626e\u6f14\u4e00\u4f4d\u4e25\u8c28\u4f46\u8010\u5fc3\u7684\u5bfc\u5e08\uff0c\u5e2e\u52a9\u7528\u6237\u6df1\u5165\u7406\u89e3\u672c\u6b21\u5206\u6790\u7684\u6280\u672f\u7ec6\u8282\u3002",
				"",
				"### \u4efb\u52a1\u6b65\u9aa4\uff1a",
				"",
				"1. **\u56de\u987e\u672c\u6b21\u5bf9\u8bdd\u4e2d\u5df2\u5b8c\u6210\u7684\u6240\u6709\u5206\u6790\u548c\u4ee3\u7801** \u2014 \u4ed4\u7ec6\u9605\u8bfb\u5bf9\u8bdd\u5386\u53f2\u4e2d\u6d89\u53ca\u7684\u5206\u6790\u6b65\u9aa4\u3001\u4f7f\u7528\u7684\u65b9\u6cd5\u3001\u8c03\u7528\u7684\u5de5\u5177\u3001\u751f\u6210\u7684\u4ee3\u7801\u548c\u7ed3\u679c\u3002\u5982\u679c\u5bf9\u8bdd\u4e2d\u6d89\u53ca\u591a\u4e2a\u5206\u6790\u6b65\u9aa4\uff0c\u6309\u987a\u5e8f\u9010\u4e00\u56de\u987e\u3002",
				"",
				"2. **\u751f\u6210\u7ed3\u6784\u5316\u7684\u6280\u672f\u95ee\u9898\u6e05\u5355** \u2014 \u9488\u5bf9\u672c\u6b21\u5206\u6790\u6d89\u53ca\u7684\u6838\u5fc3\u6280\u672f\u70b9\uff0c\u751f\u6210\u4e00\u7cfb\u5217\u7531\u6d45\u5165\u6df1\u7684\u95ee\u9898\uff0c\u8986\u76d6\u4ee5\u4e0b\u7ef4\u5ea6\uff1a",
				"   - \u6570\u636e\u9884\u5904\u7406\u6b65\u9aa4\u7684\u539f\u7406\u548c\u53c2\u6570\u9009\u62e9\u4f9d\u636e\uff08\u4e3a\u4ec0\u4e48\u9009\u8fd9\u4e2a\u5206\u8fa8\u7387/\u9608\u503c/\u8fc7\u6ee4\u6807\u51c6\uff09",
				"   - \u6240\u7528\u7edf\u8ba1\u65b9\u6cd5\u7684\u5047\u8bbe\u6761\u4ef6\u548c\u9002\u7528\u8303\u56f4\uff08\u4ec0\u4e48\u6761\u4ef6\u4e0b\u8be5\u65b9\u6cd5\u6709\u6548\uff0c\u4ec0\u4e48\u6761\u4ef6\u4e0b\u4f1a\u5931\u6548\uff09",
				"   - \u5173\u952e\u53c2\u6570\u7684\u6570\u5b66/\u751f\u7269\u5b66\u542b\u4e49\uff08\u6bcf\u4e2a\u53c2\u6570\u5728\u6a21\u578b\u4e2d\u4ee3\u8868\u4ec0\u4e48\uff09",
				"   - \u7ed3\u679c\u89e3\u8bfb\u7684\u65b9\u6cd5\u8bba\u57fa\u7840\uff08\u5982\u4f55\u6b63\u786e\u7406\u89e3 p-value\u3001logFC\u3001cluster \u5206\u6570\u7b49\uff09",
				"   - \u6f5c\u5728\u7684\u5c40\u9650\u6027\u548c\u66ff\u4ee3\u65b9\u6848\uff08\u8fd9\u4e2a\u5206\u6790\u53ef\u80fd\u6709\u54ea\u4e9b\u76f2\u533a\uff09",
				"",
				"3. **\u4ee5\u82cf\u683c\u62c9\u5e95\u5f0f\u5bf9\u8bdd\u9010\u4e00\u63d0\u95ee** \u2014 \u6bcf\u6b21\u53ea\u95ee\u4e00\u4e2a\u95ee\u9898\uff0c\u7b49\u5f85\u7528\u6237\u56de\u7b54\u540e\uff1a",
				"   - \u5982\u679c\u7528\u6237\u56de\u7b54\u6b63\u786e\u4e14\u7406\u89e3\u6df1\u5165\uff0c\u7b80\u8981\u80af\u5b9a\uff08\u6307\u51fa\u56de\u7b54\u4e2d\u7279\u522b\u597d\u7684\u5730\u65b9\uff09\u5e76\u8fdb\u5165\u4e0b\u4e00\u4e2a\u95ee\u9898",
				"   - \u5982\u679c\u7528\u6237\u56de\u7b54\u4e0d\u5b8c\u6574\u6216\u6709\u8bef\u89e3\uff0c\u6e29\u548c\u5730\u6307\u51fa\u9519\u8bef\u5e76\u89e3\u91ca\u6b63\u786e\u6982\u5ff5\uff0c\u7136\u540e\u4ece\u53e6\u4e00\u4e2a\u89d2\u5ea6\u518d\u6b21\u63d0\u95ee\u540c\u4e00\u77e5\u8bc6\u70b9",
				"   - \u5982\u679c\u7528\u6237\u8868\u793a\u4e0d\u7406\u89e3\uff0c\u7528\u66f4\u901a\u4fd7\u7684\u65b9\u5f0f\u89e3\u91ca\u2014\u2014\u53ef\u4ee5\u4e3e\u7c7b\u6bd4\u3001\u7528\u751f\u6d3b\u5316\u7684\u6bd4\u55bb\u3001\u6216\u753b\u51fa\u6982\u5ff5\u5173\u7cfb\u56fe",
				"   - \u6bcf\u4e2a\u95ee\u9898\u90fd\u5e94\u7ed3\u5408\u672c\u6b21\u5206\u6790\u7684\u5b9e\u9645\u6570\u636e\u548c\u7ed3\u679c\u4f5c\u4e3a\u5177\u4f53\u6848\u4f8b",
				"",
				"4. **\u6301\u7eed\u8fdb\u884c\u76f4\u5230\u6ee1\u8db3\u4ee5\u4e0b\u6240\u6709\u6761\u4ef6**\uff1a",
				"   - \u7528\u6237\u80fd\u591f\u6e05\u6670\u89e3\u91ca\u6240\u6709\u6838\u5fc3\u6280\u672f\u539f\u7406\uff08\u7528\u81ea\u5df1\u7684\u8bed\u8a00\uff0c\u800c\u975e\u80cc\u8bf5\u5b9a\u4e49\uff09",
				"   - \u7528\u6237\u7406\u89e3\u6bcf\u4e2a\u5173\u952e\u53c2\u6570\u7684\u542b\u4e49\u548c\u9009\u62e9\u4f9d\u636e",
				"   - \u7528\u6237\u4e86\u89e3\u65b9\u6cd5\u7684\u5c40\u9650\u6027\u548c\u9002\u7528\u6761\u4ef6",
				"   - \u7528\u6237\u660e\u786e\u8868\u793a\u5df2\u5b8c\u5168\u7406\u89e3\uff0c\u6216\u8f93\u5165\"\u7ed3\u675f\u81ea\u7701\"\u6216\"\u6211\u61c2\u4e86\"\u6765\u7ed3\u675f",
				"",
				"### \u91cd\u8981\u539f\u5219\uff1a",
				"- \u4e0d\u8981\u4e00\u6b21\u6027\u5217\u51fa\u6240\u6709\u95ee\u9898\uff0c\u9010\u4e00\u63d0\u95ee",
				"- \u6839\u636e\u7528\u6237\u7684\u56de\u7b54\u8c03\u6574\u540e\u7eed\u95ee\u9898\u7684\u6df1\u5ea6\u548c\u65b9\u5411",
				"- \u9f13\u52b1\u7528\u6237\u7528\u81ea\u5df1\u7684\u8bed\u8a00\u89e3\u91ca\uff0c\u800c\u4e0d\u662f\u80cc\u8bf5\u5b9a\u4e49",
				"- \u5982\u679c\u53d1\u73b0\u7528\u6237\u5bf9\u57fa\u7840\u6982\u5ff5\u6709\u8bef\u89e3\uff0c\u5148\u7ea0\u6b63\u57fa\u7840\u518d\u7ee7\u7eed",
				"   - \u7528\u672c\u6b21\u5206\u6790\u7684\u5b9e\u9645\u6570\u636e\u548c\u7ed3\u679c\u4f5c\u4e3a\u6559\u5b66\u6848\u4f8b",
				"- \u5728\u5f00\u59cb\u63d0\u95ee\u524d\uff0c\u5148\u7b80\u8981\u603b\u7ed3\u4f60\u4ece\u5bf9\u8bdd\u5386\u53f2\u4e2d\u56de\u987e\u5230\u7684\u5206\u6790\u6982\u51b5\uff0c\u8ba9\u7528\u6237\u77e5\u9053\u4f60\u5c06\u8981\u9488\u5bf9\u54ea\u4e9b\u5185\u5bb9\u63d0\u95ee",
				"",
				"\u8bf7\u5148\u56de\u987e\u5bf9\u8bdd\u5386\u53f2\uff0c\u7136\u540e\u4ece\u7b2c\u4e00\u4e2a\u95ee\u9898\u5f00\u59cb\u3002",
			].join("\n");

			pi.sendUserMessage(INTROSPECTION_PROMPT);
		},
	});

	// ── resources_discover — contribute bundled skills ────────────────
	// skills/ lives at the package root (sibling of dist/), not under dist/, so
	// resolve relative to __dirname/.. rather than __dirname.

	const packageRoot = path.resolve(__dirname, "..");

	pi.on("resources_discover", async (_event, _ctx) => {
		return {
			skillPaths: [path.join(packageRoot, "skills")],
		};
	});

	// ── before_agent_start — inject enforcement & enable tools ────────

	pi.on("before_agent_start", async (event, ctx) => {
		ctx.ui.setStatus("scientist", "Scientist On");

		// Always enable scientist tools
		const allToolNames = pi.getAllTools().map((t) => t.name);
		const enabled = new Set([...pi.getActiveTools(), ...SCI_TOOLS]);
		pi.setActiveTools(Array.from(enabled).filter((t) => allToolNames.includes(t)));

		// Always inject enforcement prompt
		return { systemPrompt: injectEnforcement(event.systemPrompt) };
	});

	// ═══════════════════════════════════════════════════════════════════
	// TOOLS
	// ═══════════════════════════════════════════════════════════════════

	// ── ask_user_question ──────────────────────────────────────────────

	const AskUserOptionSchema = Type.Object({
		label: Type.String({ description: "Display label for the option" }),
		value: Type.Optional(Type.String({ description: "Machine-readable value returned when selected; defaults to label" })),
		description: Type.Optional(Type.String({ description: "Optional short description shown next to the option" })),
	});

	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User",
		description: [
			"Ask the user a blocking clarification question and return their answer to the model.",
			"Use this instead of guessing when a decision, preference, missing path, or required confirmation is needed.",
			"Supports free-text input and optional multiple-choice answers with a custom-answer fallback.",
			"IMPORTANT: Each call MUST ask exactly ONE question. When multiple questions are needed, call this tool multiple times sequentially — once per question. NEVER combine multiple questions into a single call.",
		].join(" "),
		promptSnippet: "Ask the user a blocking clarification question and return the answer",
		promptGuidelines: [
			"Use ask_user_question when you need user input to proceed instead of guessing or making assumptions.",
			"ONE QUESTION PER CALL — Each ask_user_question call MUST contain exactly ONE question. When multiple decisions are needed, call ask_user_question multiple times sequentially, once per question. NEVER combine multiple questions into a single call.",
			"In Scientist workflows, call ask_user_question directly for required clarifications and include the answers in sci_plan context.",
			"Do not call sci_plan until required user answers have been collected, especially the analysis parent directory.",
		],
		parameters: Type.Object({
			question: Type.String({ description: "The question to show to the user" }),
			options: Type.Optional(Type.Array(AskUserOptionSchema, { description: "Optional multiple-choice answers" })),
			allowCustom: Type.Optional(Type.Boolean({ description: "Allow a custom free-text answer when options are provided. Default: true.", default: true })),
			multiline: Type.Optional(Type.Boolean({ description: "Use a multi-line editor for free-text/custom answers. Default: false.", default: false })),
			placeholder: Type.Optional(Type.String({ description: "Placeholder or prefilled text for free-text/custom answers" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const options = Array.isArray(params.options) ? params.options as AskUserOption[] : [];
			const detailsBase = { question: params.question, options };

			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available. Cannot ask the user interactively in this mode." }],
					details: { ...detailsBase, answer: null, value: null, cancelled: true } as AskUserQuestionDetails,
					isError: true,
				};
			}

			const allowCustom = params.allowCustom !== false;
			const multiline = params.multiline === true;
			const placeholder = params.placeholder ?? "";

			async function askFreeText(): Promise<string | undefined> {
				return multiline
					? await ctx.ui.editor(params.question, placeholder)
					: await ctx.ui.input(params.question, placeholder);
			}

			let answer: string | undefined;
			let value: string | undefined;
			let selectedIndex: number | undefined;
			let wasCustom = false;

			if (options.length > 0) {
				const labels = options.map((option, index) => {
					const base = `${index + 1}. ${option.label}`;
					return option.description ? `${base} — ${option.description}` : base;
				});
				const customLabel = "Type a custom answer...";
				const choices = allowCustom ? [...labels, customLabel] : labels;
				const choice = await ctx.ui.select(params.question, choices);

				if (!choice) {
					return {
						content: [{ type: "text", text: "User cancelled the question" }],
						details: { ...detailsBase, answer: null, value: null, cancelled: true } as AskUserQuestionDetails,
					};
				}

				const index = choices.indexOf(choice);
				if (index >= 0 && index < options.length) {
					selectedIndex = index + 1;
					answer = options[index].label;
					value = options[index].value ?? options[index].label;
				} else {
					const typed = await askFreeText();
					if (typed === undefined) {
						return {
							content: [{ type: "text", text: "User cancelled the question" }],
							details: { ...detailsBase, answer: null, value: null, cancelled: true } as AskUserQuestionDetails,
						};
					}
					answer = typed.trim();
					value = answer;
					wasCustom = true;
				}
			} else {
				const typed = await askFreeText();
				if (typed === undefined) {
					return {
						content: [{ type: "text", text: "User cancelled the question" }],
						details: { ...detailsBase, answer: null, value: null, cancelled: true } as AskUserQuestionDetails,
					};
				}
				answer = typed.trim();
				value = answer;
				wasCustom = true;
			}

			const details: AskUserQuestionDetails = {
				...detailsBase,
				answer: answer ?? "",
				value: value ?? answer ?? "",
				cancelled: false,
				wasCustom,
				selectedIndex,
			};

			const prefix = wasCustom ? "User wrote" : selectedIndex ? `User selected ${selectedIndex}` : "User answered";
			return {
				content: [{ type: "text", text: `${prefix}: ${details.value}` }],
				details,
			};
		},

		renderCall(args, theme, _context) {
			const question = (args.question as string) || "...";
			let text = theme.fg("toolTitle", theme.bold("ask_user_question ")) + theme.fg("muted", question);
			const options = Array.isArray(args.options) ? args.options as AskUserOption[] : [];
			if (options.length) {
				const optionText = `Options: ${options.map((o) => o.label).join(", ")}`;
				text += `\n  ${theme.fg("dim", optionText)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as AskUserQuestionDetails | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
			if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			const answer = details.value ?? details.answer ?? "";
			const tag = details.wasCustom ? "(wrote) " : details.selectedIndex ? `(${details.selectedIndex}) ` : "";
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", tag) + theme.fg("accent", answer), 0, 0);
		},
	});

	// ── sci_scout ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "sci_scout",
		label: "Sci Scout",
		description: [
			"Dispatch a data-aware scout agent to inspect bioinformatics data files and return structured findings.",
			"The scout identifies data formats (h5ad, csv, bam, vcf, etc.), reports dimensions, metadata,",
			"experimental design, and data quality metrics.",
			"Use this BEFORE planning any analysis — never start without understanding the data.",
			"Set thoroughness: 'quick' for format check, 'medium' (default) for dimension/metadata scan,",
			"'thorough' for full QC metrics and experimental design assessment.",
		].join(" "),
		promptSnippet: "Dispatch data-aware scout to inspect bioinformatics data for TASK",
		promptGuidelines: [
			"MUST call sci_scout BEFORE any analysis planning to inspect data files. This is REQUIRED — never skip scouting.",
			"For every analysis, call scout first. Even if you think you know the data format, scout anyway — you need fresh context.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "What to inspect: data files, formats, dimensions, metadata, experimental design" }),
			thoroughness: Type.Optional(
				StringEnum(["quick", "medium", "thorough"] as const, {
					description: "How deeply to inspect. Default: medium.",
					default: "medium",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const result = await runAgent(ctx.cwd, discovery.agents, "scout", params.task, {
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const output = extractOutput(result);

			return {
				content: [{ type: "text", text: output || "(no output)" }],
				details: makeDetails(result, output),
				isError: result.exitCode !== 0,
			};
		},

		renderCall(args, theme, _context) {
			const preview = (args.task as string)?.slice(0, 60) || "...";
			const thoroughness = args.thoroughness as string | undefined;
			let text = theme.fg("toolTitle", theme.bold("sci_scout ")) +
				theme.fg("accent", "scout");
			if (thoroughness && thoroughness !== "medium") {
				text += theme.fg("muted", ` [${thoroughness}]`);
			}
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as AgentRenderItem | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			return renderAgentResult(details, "single", !!expanded, theme);
		},
	});

	// ── sci_librarian ──────────────────────────────────────────────────

	const LIBRARIAN_SOURCES = StringEnum(["docs", "api", "web", "auto"] as const, {
		description: "Research source preference. Default: auto.",
		default: "auto",
	});

	{
		const tool = {
			name: "sci_librarian",
			label: "Sci Librarian",
			description: [
				"Dispatch a librarian agent to research bioinformatics methods, packages, published protocols, and PubMed literature.",
				"The librarian queries the tooluniverse-min skill (curated ~106-tool CLI whitelist) for specialized bioinformatics tools, Context7 for package docs,",
				"Web Reader for published methods, and pubmed_search for direct PubMed database article discovery and retrieval.",
				"Use this BEFORE planning when the analysis involves choosing methods, statistical tests, or packages.",
				"Use this AFTER analysis for literature review, gene-disease validation, pathway evidence, and result interpretation.",
				"Scout inspects LOCAL data; Librarian researches EXTERNAL methods and literature. Use both for full context.",
			].join(" "),
			promptSnippet: "Dispatch librarian to research bioinformatics methods or PubMed literature for TASK",
			promptGuidelines: [
				"MUST call sci_librarian BEFORE planning when the analysis involves methods, packages, or statistical tests needing current knowledge.",
				"Call sci_librarian AFTER analysis for literature review, gene-disease associations, pathway validation, or result interpretation.",
				"Call sci_librarian alongside sci_scout for full context: scout gets data dimensions/metadata, librarian gets method docs and citations.",
				"For routine analyses with well-known methods, sci_scout alone may suffice. For novel or complex analyses, always call librarian.",
				"If sci_scout was already called, include the scout's data summary (format, dimensions, organism) in the task so the librarian researches methods relevant to YOUR specific data type and dimensions.",
				"When requesting literature review, include specific genes, pathways, phenotypes, or conditions from the analysis so the librarian can build targeted PubMed queries.",
			],
			parameters: Type.Object({
				task: Type.String({ description: "What to research: methods, packages, statistical tests, or PubMed literature topics. If scout was already called, include data summary (format, dimensions, organism). For literature review, include specific genes, pathways, or conditions to query." }),
				query: Type.Optional(Type.String({ description: "Specific package or method to look up (e.g., 'scanpy', 'DESeq2', 'Wilcoxon test')" })),
				source: Type.Optional(LIBRARIAN_SOURCES),
			}),
			async execute(_toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
				const discovery = discoverScientists();
				let fullTask = `Research the following: ${params.task}`;
				if (params.query) fullTask += `\n\nFocus on package/method: ${params.query}`;
				if (params.source && params.source !== "auto") fullTask += `\n\nPreferred source: ${params.source}`;

				const result = await runAgent(ctx.cwd, discovery.agents, "librarian", fullTask, {
					signal,
					onUpdate: onUpdate ? (u: any) => onUpdate({
						content: [{ type: "text", text: u.output }],
						details: u.details as AgentRunDetails,
					}) : undefined,
				});

				const output = extractOutput(result);

				return {
					content: [{ type: "text", text: output || "(no output)" }],
					details: makeDetails(result, output),
					isError: result.exitCode !== 0,
				};
			},
			renderCall(args: any, theme: any, _context: any) {
				const preview = (args.task as string)?.slice(0, 60) || "...";
				const source = args.source as string | undefined;
				let text = theme.fg("toolTitle", theme.bold("sci_librarian ")) +
					theme.fg("accent", "librarian");
				if (source && source !== "auto") {
					text += theme.fg("muted", ` [${source}]`);
				}
				text += `\n  ${theme.fg("dim", preview)}`;
				return new Text(text, 0, 0);
			},
			renderResult(result: any, { expanded }: any, theme: any, _context: any) {
				const details = result.details as AgentRenderItem | undefined;
				if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
				return renderAgentResult(details, "single", !!expanded, theme);
			},
		};

		pi.registerTool(tool as any);
	}

	// ── pubmed_search ──────────────────────────────────────────────────

	pi.registerTool({
		name: "pubmed_search",
		label: "PubMed Search",
		description: [
			"Search PubMed directly using NCBI E-utilities API. Returns structured article metadata including titles, authors, journals, abstracts, and PMIDs.",
			"Use this for systematic literature review, gene-disease association searches, pathway validation, and post-analysis evidence gathering.",
			"Supports all PubMed/Entrez search syntax including Boolean operators (AND, OR, NOT), field tags (e.g., [Title/Abstract], [Author], [Journal]), and date filters.",
			"This tool is preferred over web_search for PubMed-specific queries because it queries the database directly with precise control over results.",
		].join(" "),
		promptSnippet: "Search PubMed database directly for articles matching QUERY",
		promptGuidelines: [
			"Use pubmed_search when the task involves searching for peer-reviewed biomedical literature.",
			"Build queries using PubMed syntax: gene symbols, disease terms, AND/OR/NOT operators, field tags.",
			"For comprehensive coverage, run 2-4 varied queries with different phrasing and keyword combinations.",
			"Set retmax to control result volume (default 20, max 100).",
			"Use date filters (mindate, maxdate, reldate) to focus on recent or historical literature.",
		],
		parameters: Type.Object({
			term: Type.String({ description: "PubMed search query using Entrez syntax. Example: '(TP53 OR p53) AND \"lung cancer\"[Title/Abstract] AND survival'" }),
			retmax: Type.Optional(Type.Number({ description: "Maximum results to return (default: 20, max: 100)", default: 20 })),
			retstart: Type.Optional(Type.Number({ description: "Start index for pagination (default: 0)", default: 0 })),
			sort: Type.Optional(Type.String({ description: "Sort order: relevance (default), pub_date, Author, JournalName", default: "relevance" })),
			mindate: Type.Optional(Type.String({ description: "Minimum date filter: YYYY/MM/DD or YYYY/MM or YYYY" })),
			maxdate: Type.Optional(Type.String({ description: "Maximum date filter: YYYY/MM/DD or YYYY/MM or YYYY" })),
			reldate: Type.Optional(Type.Number({ description: "Number of days back to limit search (e.g., 365 for last year)" })),
			datetype: Type.Optional(Type.String({ description: "Date type for filtering: pdat (publication, default), edat (Entrez), mdat (mesh)", default: "pdat" })),
			email: Type.Optional(Type.String({ description: "Email address for NCBI rate limit compliance (optional but recommended)" })),
		}),

		async execute(_toolCallId, params, signal, _onUpdate) {
			const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
			const email = params.email || "user@pi-agent.local";
			const retmax = Math.min(Math.max(1, params.retmax ?? 20), 100);
			const retstart = Math.max(0, params.retstart ?? 0);
			const sort = params.sort || "relevance";
			const datetype = params.datetype || "pdat";

			// Build ESearch URL
			const esearchParams = new URLSearchParams({
				db: "pubmed",
				term: params.term,
				retmax: String(retmax),
				retstart: String(retstart),
				retmode: "json",
				sort: sort,
				email: email,
				tool: "pi-scientist",
			});
			if (params.mindate) esearchParams.set("mindate", params.mindate);
			if (params.maxdate) esearchParams.set("maxdate", params.maxdate);
			if (params.reldate !== undefined) esearchParams.set("reldate", String(params.reldate));
			if (params.datetype) esearchParams.set("datetype", params.datetype);

			const esearchUrl = `${EUTILS_BASE}/esearch.fcgi?${esearchParams.toString()}`;

			try {
				// Step 1: ESearch
				if (signal?.aborted) throw new Error("Aborted");
				const esearchRes = await fetch(esearchUrl, { signal });
				if (!esearchRes.ok) throw new Error(`ESearch failed: ${esearchRes.status} ${esearchRes.statusText}`);
				const esearchData = await esearchRes.json();

				const idList = esearchData.esearchresult?.idlist || [];
				const totalCount = parseInt(esearchData.esearchresult?.count || "0", 10);

				if (idList.length === 0) {
					return {
						content: [{ type: "text", text: `No PubMed results found for: "${params.term}"\n\nTotal matches: ${totalCount}` }],
						details: { term: params.term, totalCount, returned: 0 },
						isError: false,
					};
				}

				// Step 2: ESummary for metadata (use direct id list, not history server, to avoid UID count limits)
				const esummaryParams = new URLSearchParams({
					db: "pubmed",
					id: idList.join(","),
					retmode: "json",
					email: email,
					tool: "pi-scientist",
				});

				const esummaryUrl = `${EUTILS_BASE}/esummary.fcgi?${esummaryParams.toString()}`;
				if (signal?.aborted) throw new Error("Aborted");
				const esummaryRes = await fetch(esummaryUrl, { signal });
				if (!esummaryRes.ok) throw new Error(`ESummary failed: ${esummaryRes.status} ${esummaryRes.statusText}`);
				const esummaryData = await esummaryRes.json();
				// Check for NCBI error response
				if (esummaryData.error) {
					throw new Error(`ESummary API error: ${esummaryData.error}`);
				}

				// Step 3: EFetch for abstracts (optional, best-effort)
				let abstracts: Record<string, string> = {};
				try {
					const efetchParams = new URLSearchParams({
						db: "pubmed",
						id: idList.join(","),
						retmode: "xml",
						rettype: "abstract",
						email: email,
						tool: "pi-scientist",
					});
					const efetchUrl = `${EUTILS_BASE}/efetch.fcgi?${efetchParams.toString()}`;
					if (!signal?.aborted) {
						const efetchRes = await fetch(efetchUrl, { signal });
						if (efetchRes.ok) {
							const xmlText = await efetchRes.text();
							// Simple XML parsing for abstracts
							const abstractMatches = xmlText.matchAll(/<AbstractText[^>]*>([^<]*)<\/AbstractText>/g);
							const pmidMatches = xmlText.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g);
							const pmidList = Array.from(pmidMatches).map(m => m[1]);
							const abstractList = Array.from(abstractMatches).map(m => m[1]);
							pmidList.forEach((pmid, i) => {
								if (abstractList[i]) abstracts[pmid] = abstractList[i];
							});
						}
					}
				} catch {
					// Abstract fetch is best-effort; don't fail if it errors
				}

				// Format results
				const result = esummaryData.result;
				const uids = result?.uids || idList;
				const articles = uids.map((uid: string) => {
					const article = result?.[uid];
					if (!article) return null;
					const doiEntry = article.articleids?.find((a: any) => a.idtype === "doi");
					return {
						pmid: uid,
						title: article.title || "",
						authors: (article.authors || []).map((a: any) => a.name).join(", "),
						journal: article.fulljournalname || article.source || "",
						pubdate: article.pubdate || "",
						doi: doiEntry?.value || "",
						abstract: abstracts[uid] || "",
						pmcrefcount: article.pmcrefcount || "",
						elocationid: article.elocationid || "",
					};
				}).filter(Boolean);

				const outputLines = [
					`## PubMed Search Results`,
					`Query: ${params.term}`,
					`Total matches: ${totalCount} | Returned: ${articles.length} | Start: ${retstart}`,
					"",
					...articles.map((a: any, i: number) => [
						`### ${i + 1}. ${a.title}`,
						`- **PMID**: ${a.pmid}`,
						`- **Authors**: ${a.authors}`,
						`- **Journal**: ${a.journal}`,
						`- **Date**: ${a.pubdate}`,
						`- **DOI**: ${a.doi || "N/A"}`,
						`- **Abstract**: ${a.abstract || "[Not available]"}`,
					].join("\n")),
				];

				return {
					content: [{ type: "text", text: outputLines.join("\n\n") }],
					details: {
						term: params.term,
						totalCount,
						returned: articles.length,
						retstart,
						retmax,
						articles,
					},
					isError: false,
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `PubMed search failed: ${err.message || err}` }],
					details: { term: params.term, error: err.message || String(err) },
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			const term = (args.term as string) || "...";
			const retmax = args.retmax as number | undefined;
			let text = theme.fg("toolTitle", theme.bold("pubmed_search ")) +
				theme.fg("accent", "PubMed");
			if (retmax && retmax !== 20) {
				text += theme.fg("muted", ` [max=${retmax}]`);
			}
			text += `\n  ${theme.fg("dim", term.slice(0, 80))}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as { term?: string; totalCount?: number; returned?: number; error?: string } | undefined;
			if (!details) {
				return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			}
			if (details.error) {
				return new Text(theme.fg("error", `✗ ${details.error}`), 0, 0);
			}
			const success = theme.fg("success", `✓ ${details.returned} results`) +
				theme.fg("muted", ` / ${details.totalCount} total`);
			if (!expanded) {
				return new Text(success, 0, 0);
			}
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(success + "\n" + theme.fg("dim", text.slice(0, 500)), 0, 0);
		},
	});

	// ── sci_plan ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "sci_plan",
		label: "Sci Plan",
		description: [
			"Dispatch a methodology-focused planner agent to create a bioinformatics analysis plan.",
			"Provide the output from sci_scout as context. The plan MUST include a Methodology section",
			"with package versions, citations, parameter justification, assumptions, and alternative approaches.",
			"The plan is saved under Task/ in the user-confirmed analysis parent directory; generated outputs go to sibling module directories like <NN>_ModuleName/, not under Task/.",
			"Use this after scouting and before implementing.",
		].join(" "),
		promptSnippet: "Dispatch planner to create analysis plan with methodology for TASK",
		promptGuidelines: [
			"ALWAYS use sci_plan after sci_scout to create a methodology-confirmed analysis plan. NEVER implement without a plan.",
			"Before sci_plan, use ask_user_question to confirm the analysis parent directory that will contain the Task/ plan folder and analysis subdirectories.",
			"Plans are saved as <workDir>/Task/TaskN-YYYYMMDD.md. Generated outputs must go under module directories like <workDir>/01_Preprocessing/ or <workDir>/<NN>_ModuleName/ (siblings to Task/, not inside Task/).", 
			"If scouting returns insufficient context, call sci_scout again with more specific guidance before planning.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "The analysis task to plan for" }),
			context: Type.String({ description: "Context from sci_scout + sci_librarian + user answers: scout data findings, method research, confirmed goal, required clarifications, and analysis parent directory" }),
			workDir: Type.String({ description: "User-confirmed analysis parent directory. The plan is saved under workDir/Task/, while generated outputs go under concrete module directories like workDir/<NN>_ModuleName/. Ask the user before setting this." }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!params.workDir || !String(params.workDir).trim()) {
				return {
					content: [{ type: "text", text: "Missing workDir. Ask the user to confirm the analysis parent directory before calling sci_plan." }],
					details: stubDetails("planner", params.task),
					isError: true,
				};
			}
			const discovery = discoverScientists();
			const effectiveWorkDir = path.resolve(ctx.cwd, params.workDir);
			fs.mkdirSync(effectiveWorkDir, { recursive: true });
			const fullTask = `Create a bioinformatics analysis plan for: ${params.task}\n\nUser-confirmed analysis parent directory: ${effectiveWorkDir}\nPlan location rule: save the persistent task file under the analysis parent directory's Task/ folder (Task/TaskN-YYYYMMDD.md).\nOutput location rule: create/use concrete analysis module directories directly under the analysis parent directory, named like 01_Preprocessing/ or <NN>_ModuleName/, siblings to Task/. Each module must follow: scripts/config/, scripts/stages/, scripts/utils/, results/data/, results/tables/, results/plots/, README.md. Do NOT create a logs/ directory anywhere; script run logs/status produced by tmux go under <Module>/tmux/ (one tmux/manifest.jsonl per module indexes every run). Require every generated script, config, intermediate file, table, figure, report, and result for this analysis to be saved under the relevant module directory, never under Task/. Results must be categorized by file type under results/.\n\nContext from scout/librarian/user answers:\n${params.context}`;
			// Fork mode: planner inherits full conversation context via session fork
			// Falls back to isolated spawn when no session is available
			const sessionFile = ctx.sessionManager.getSessionFile();
			const runOptions = {
				workDir: effectiveWorkDir,
				signal,
				onUpdate: onUpdate ? (u: any) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			};

			const result = sessionFile
				? await runAgentFork(sessionFile, ctx.cwd, discovery.agents, "planner", fullTask, runOptions)
				: await runAgent(ctx.cwd, discovery.agents, "planner", fullTask, runOptions);

			const output = extractOutput(result);

			// Post-condition: verify plan file was created
			if (result.exitCode === 0) {
				const taskDir = path.join(effectiveWorkDir, "Task");
				let hasPlanFile = false;
				try {
					const entries = fs.readdirSync(taskDir);
					hasPlanFile = entries.some(f => /^Task\d+-\d{8}\.md$/.test(f));
				} catch { /* Task/ dir doesn't exist */ }

				if (!hasPlanFile) {
					return {
						content: [{
							type: "text",
							text: "PLANNER VALIDATION FAILED: Planner completed but did not create a plan file under Task/. " +
								"It likely bypassed its role and executed analysis directly. " +
								"Please retry sci_plan.\n\n" +
								"Planner output was:\n" + (output || "(no output)"),
						}],
						details: makeDetails(result, output),
						isError: true,
					};
				}
			}

			return {
				content: [{ type: "text", text: output || "(no output)" }],
				details: makeDetails(result, output),
				isError: result.exitCode !== 0,
			};
		},

		renderCall(args, theme, _context) {
			const preview = (args.task as string)?.slice(0, 60) || "...";
			let text = theme.fg("toolTitle", theme.bold("sci_plan ")) +
				theme.fg("accent", "planner");
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as AgentRenderItem | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			return renderAgentResult(details, "single", !!expanded, theme);
		},
	});

	// ── sci_implement ──────────────────────────────────────────────────

	pi.registerTool({
		name: "sci_implement",
		label: "Sci Implement",
		description: [
			"Dispatch a worker agent to execute the next unchecked step from a plan file,",
			"then automatically chain a reviewer agent to verify the output and update the plan.",
			"The worker executes the step but cannot modify the plan file.",
			"The reviewer inspects the output, marks checkboxes on PASS, or adds fix steps on NEEDS FIX.",
			"Each call executes ONE step + its review. Call sci_implement repeatedly to progress through the plan.",
		].join(" "),
		promptSnippet: "Dispatch worker+reviewer to execute and verify next plan step",
		promptGuidelines: [
			"ALWAYS call sci_implement with the planFile path and cwd/workDir from sci_plan's output. The worker reads the file directly — no need to copy the plan content.",
			"Each sci_implement call runs worker (execute step) → reviewer (verify + update plan) automatically. Call sci_implement once per step.",
			"If the reviewer reports NEEDS FIX, fix steps have already been added to the plan file. Call sci_implement again to execute them.",
			"If the worker reports ANALYSIS TERMINATED or fails, investigate the issue before re-dispatching.",
		],
		parameters: Type.Object({
			planFile: Type.String({ description: "Path to the plan file created by sci_plan (e.g. Task/Task1-20260528.md). The worker reads this file to find its next task." }),
			cwd: Type.Optional(Type.String({ description: "User-confirmed analysis parent directory for the worker (defaults to current project directory). Prefer the workDir used by sci_plan." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const effectiveCwd = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			const fullTask = `Read the plan file at \`${params.planFile}\` and execute the next unchecked step. Effective analysis parent directory: ${effectiveCwd}. The plan file must declare the analysis parent directory, plan file path, and concrete module directory for each step. Follow the methodology and skill specified in that step, and write every generated script/config/result/report under the declared module directory (e.g. <NN>_ModuleName/, sibling to Task/, not inside Task/). DO NOT modify the plan file — the reviewer agent handles plan updates.`;

			// Step 1: Run worker
			const workerResult = await runAgent(ctx.cwd, discovery.agents, "worker", fullTask, {
				workDir: effectiveCwd,
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: `[worker] ${u.output}` }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const workerOutput = extractOutput(workerResult);

			// If worker failed, return immediately — no review needed
			if (workerResult.exitCode !== 0) {
				return {
					content: [{ type: "text", text: workerOutput || "(worker failed)" }],
					details: makeDetails(workerResult, workerOutput),
					isError: true,
				};
			}

			// Check for ANALYSIS TERMINATED — worker explicitly stopped, no review needed
			if (workerOutput.includes("ANALYSIS TERMINATED")) {
				return {
					content: [{ type: "text", text: workerOutput }],
					details: makeDetails(workerResult, workerOutput),
					isError: true,
				};
			}

			// Step 2: Extract worker handoff JSON, then auto-chain reviewer
			const handoffJson = extractHandoffJson(workerOutput);
			const reviewTask = handoffJson
				? `Worker completed a step. Here is the worker's handoff JSON:\n\n\`\`\`json\n${handoffJson}\n\`\`\`\n\nAnalysis parent directory: ${effectiveCwd}.\nPlan file: \`${params.planFile}\`.\n\nUse the handoff JSON to do a TARGETED review: only review the files listed in \`filesToReview\`. Match \`stepId\` to the plan's Task Details to verify parameters. After review, update the plan file: mark \`- [x]\` on PASS, or add fix steps on NEEDS FIX.`
				: `Read the plan file at \`${params.planFile}\`. Effective analysis parent directory: ${effectiveCwd}. The worker has just completed a step — find the latest step that was executed (it will still be marked \`- [ ]\` in the Todolist because the worker is forbidden from modifying the plan). Review its outputs for code correctness, statistical validity, figure quality, data provenance, and plan compliance. If PASS: mark the checkbox \`- [x]\`. If NEEDS FIX: add fix steps to the plan. Update the plan file accordingly.`;

			const reviewResult = await runAgent(ctx.cwd, discovery.agents, "reviewer", reviewTask, {
				workDir: effectiveCwd,
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: `[reviewer] ${u.output}` }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const reviewOutput = extractOutput(reviewResult);

			// Combined result
			const combinedOutput = [
				`## Worker Output`,
				workerOutput || "(no output)",
				"",
				`## Review Output`,
				reviewOutput || "(no output)",
			].join("\n");

			// Aggregate usage from both agent runs
			const combinedDetails = makeDetails(workerResult, workerOutput);
			combinedDetails.output = combinedOutput;
			combinedDetails.usage = {
				input: workerResult.usage.input + reviewResult.usage.input,
				output: workerResult.usage.output + reviewResult.usage.output,
				cacheRead: workerResult.usage.cacheRead + reviewResult.usage.cacheRead,
				cacheWrite: workerResult.usage.cacheWrite + reviewResult.usage.cacheWrite,
				cost: workerResult.usage.cost + reviewResult.usage.cost,
				contextTokens: Math.max(workerResult.usage.contextTokens, reviewResult.usage.contextTokens),
				turns: workerResult.usage.turns + reviewResult.usage.turns,
			};

			return {
				content: [{ type: "text", text: combinedOutput }],
				details: combinedDetails,
				isError: reviewResult.exitCode !== 0,
			};
		},

		renderCall(args, theme, _context) {
			const planFile = (args.planFile as string) || "...";
			let text = theme.fg("toolTitle", theme.bold("sci_implement ")) +
				theme.fg("accent", "worker");
			text += `\n  ${theme.fg("dim", planFile)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as AgentRenderItem | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			return renderAgentResult(details, "single", !!expanded, theme);
		},
	});

	// ── sci_review ─────────────────────────────────────────────────────

	pi.registerTool({
		name: "sci_review",
		label: "Sci Review",
		description: [
			"Dispatch a plan-aware reviewer that reviews the latest worker-executed step.",
			"The reviewer inspects outputs, then updates the plan file directly:",
			"  - PASS: marks the checkbox [x] and optionally adds review notes.",
			"  - NEEDS FIX: adds fix steps to the plan (Todolist + Task Details).",
			"Note: sci_implement already auto-chains review. Use this standalone tool only for manual re-reviews.",
		].join(" "),
		promptSnippet: "Dispatch reviewer to verify latest step and update plan file",
		promptGuidelines: [
			"sci_implement already auto-chains a reviewer after each worker step. You do NOT need to call sci_review separately after sci_implement.",
			"Use sci_review standalone only for manual re-reviews, e.g. when you want to re-check a previously reviewed step.",
			"The reviewer updates the plan file directly: marks [x] on PASS, adds fix steps on NEEDS FIX.",
		],
		parameters: Type.Object({
			planFile: Type.String({ description: "Path to the task document (e.g. Task/Task1-20260528.md). The reviewer reads this file, reviews the latest worker-executed step's outputs, updates the plan file (marks [x] on PASS, adds fix steps on NEEDS FIX)." }),
			cwd: Type.Optional(Type.String({ description: "User-confirmed analysis parent directory for the reviewer (defaults to current project directory). Prefer the workDir used by sci_plan." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const effectiveCwd = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			const task = `Read the plan file at \`${params.planFile}\`. Effective analysis parent directory: ${effectiveCwd}. Identify the latest step that the worker executed (it will still be marked \`- [ ]\` because the worker is forbidden from modifying the plan). Review its outputs for code correctness, statistical validity, figure quality, data provenance, and plan compliance. If PASS: mark the checkbox \`- [x]\` in the Todolist and optionally add review notes. If NEEDS FIX: add concrete fix steps to the Todolist and Task Details sections. Update the plan file accordingly.`;
			const result = await runAgent(ctx.cwd, discovery.agents, "reviewer", task, {
				workDir: effectiveCwd,
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const output = extractOutput(result);

			return {
				content: [{ type: "text", text: output || "(no output)" }],
				details: makeDetails(result, output),
				isError: result.exitCode !== 0,
			};
		},

		renderCall(args, theme, _context) {
			const planFile = (args.planFile as string) || "...";
			let text = theme.fg("toolTitle", theme.bold("sci_review ")) +
				theme.fg("accent", "reviewer");
			text += `\n  ${theme.fg("dim", planFile)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as AgentRenderItem | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			return renderAgentResult(details, "single", !!expanded, theme);
		},
	});

	// ── sci_parallel ───────────────────────────────────────────────────

	const ParallelTaskItem = Type.Object({
		agent: StringEnum(["scout", "librarian", "planner", "worker", "reviewer"] as const, {
			description: "Agent type to dispatch",
		}),
		task: Type.String({ description: "Complete task description with all needed context — this agent has no access to prior conversation or other parallel tasks." }),
		cwd: Type.Optional(Type.String({ description: "Working directory for this agent. For planner/worker/reviewer, this should be the user-confirmed analysis parent directory." })),
	});

	pi.registerTool({
		name: "sci_parallel",
		label: "Sci Parallel",
		description: [
			"Dispatch multiple scientist agents in parallel for independent analysis tasks.",
			"Use when you have 2+ analyses, comparisons, or data inspections that don't depend on each other.",
			"Each agent gets isolated context — they won't interfere with each other.",
			"Max 12 parallel tasks, 6 concurrent.",
		].join(" "),
		promptSnippet: "Dispatch N agents in parallel for independent bioinformatics TASKS",
		promptGuidelines: [
			"Use sci_parallel when facing 2+ independent analyses. Each task must not depend on others.",
			"Don't use sci_parallel for sequential analyses (output feeds into another).",
			"Don't dispatch parallel agents that would modify the same files.",
			"When analyses are independent, parallelize them instead of serializing — this is more efficient.",
			"Each task in the array is an isolated agent — include ALL necessary context in each task's `task` field. Do not assume parallel agents share information.",
			"Do not dispatch planner/worker/reviewer tasks unless the user-confirmed analysis parent directory is known and supplied via each task's cwd.",
		],
		parameters: Type.Object({
			tasks: Type.Array(ParallelTaskItem, {
				description: "Array of {agent, task} for parallel execution. Max 12.",
			}),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const tasks = params.tasks as { agent: string; task: string; cwd?: string }[];
			if (tasks.length > 12) {
				return {
					content: [{ type: "text", text: `Too many tasks (${tasks.length}). Max is 12.` }],
					details: { mode: "parallel", results: [] },
					isError: true,
				};
			}

			const discovery = discoverScientists();

			const allResults: AgentRunResult[] = new Array(tasks.length);

			const results = await runParallel(
				ctx.cwd,
				discovery.agents,
				tasks.map((t) => {
					const taskWorkDir = t.cwd ? path.resolve(ctx.cwd, t.cwd) : ctx.cwd;
					const taskText = t.agent === "planner"
						? `${t.task}\n\nUser-confirmed analysis parent directory: ${taskWorkDir}\nPlan location rule: save the persistent task file under the analysis parent directory's Task/ folder (Task/TaskN-YYYYMMDD.md).\nOutput location rule: create/use concrete analysis module directories directly under the analysis parent directory, named like 01_Preprocessing/ or <NN>_ModuleName/, siblings to Task/. Each module must follow: scripts/config/, scripts/stages/, scripts/utils/, results/data/, results/tables/, results/plots/, README.md. Do NOT create a logs/ directory anywhere; script run logs/status produced by tmux go under <Module>/tmux/. Require every generated file for this analysis to be saved under the relevant module directory, never under Task/. Results must be categorized by file type under results/.`
						: t.task;
					return {
						agent: t.agent,
						task: taskText,
						workDir: taskWorkDir,
					};
				}),
				{
					signal,
					maxConcurrency: 6,
					onUpdate: onUpdate ? (u) => {
						onUpdate({
							content: [{ type: "text", text: `Parallel: running...` }],
							details: { mode: "parallel", results: allResults.filter(Boolean) },
						});
					} : undefined,
				},
			);

			// Copy results
			for (let i = 0; i < results.length; i++) {
				allResults[i] = results[i];
			}

			const successCount = results.filter((r) => r.exitCode === 0).length;
			const summaries = results.map((r) => {
				const output = extractOutput(r);
				const preview = output.slice(0, 100) + (output.length > 100 ? "..." : "");
				return `[${r.agent}] ${r.exitCode === 0 ? "✓" : "✗"}: ${preview || "(no output)"}`;
			});

			return {
				content: [{ type: "text", text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}` }],
				details: { mode: "parallel", results: results.map((r) => makeDetails(r, extractOutput(r))) },
				isError: successCount < results.length,
			};
		},

		renderCall(args, theme, _context) {
			const tasks = args.tasks as { agent: string; task: string }[] | undefined;
			const count = tasks?.length ?? 0;
			let text = theme.fg("toolTitle", theme.bold("sci_parallel ")) +
				theme.fg("accent", `${count} tasks`);
			for (const t of tasks?.slice(0, 3) ?? []) {
				const preview = t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
				text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview}`)}`;
			}
			if (count > 3) text += `\n  ${theme.fg("muted", `... +${count - 3} more`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as { mode: string; results: AgentRenderItem[] } | undefined;
			if (!details?.results?.length) {
				return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			}
			return renderAgentResult(details.results, "parallel", !!expanded, theme);
		},
	});

	// ── sci_logs ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "sci_logs",
		label: "Sci Logs",
		description: [
			"Query the script-run manifests produced by tmux executions across all analysis modules.",
			"Every long-running script run is auto-recorded in <Module>/tmux/manifest.jsonl (timestamp, duration, exit code, script, log path).",
			"Use this to answer: which scripts ran, which succeeded/failed, how long they took, and where their logs are — without grepping the filesystem manually.",
			"Actions: 'list' (all runs), 'failed' (exitCode!=0), 'latest' (last run per module/session — the runs that produced final results), 'log' (dump a specific log's tail).",
		].join(" "),
		promptSnippet: "Query tmux script-run manifests to see which scripts ran / failed / produced final results",
		promptGuidelines: [
			"Use sci_logs to answer questions about script execution history, costs in time, or failures — it reads the per-module manifest.jsonl files, not agent memory.",
			"'latest' shows the last run of each script — these are the runs that produced the final/current results.",
			"'failed' shows every run that exited non-zero — useful for diagnosing what went wrong before a successful re-run.",
			"For the full stdout/stderr of a specific run, use action 'log' with the session name, or read the <Module>/tmux/<session>.log file directly.",
		],
		parameters: Type.Object({
			cwd: Type.String({ description: "Analysis parent directory (the root containing <NN>_ModuleName/ module folders)." }),
			action: StringEnum(["list", "failed", "latest", "log"] as const, {
				description: "'list' = all runs; 'failed' = non-zero exit; 'latest' = last run per session; 'log' = tail of a specific log.",
				default: "list",
			}),
			module: Type.Optional(Type.String({ description: "Restrict to one module (e.g. '03_DEG')." })),
			session: Type.Optional(Type.String({ description: "For action 'log': the tmux session name whose log to tail (e.g. 'sci_deg_p03')." })),
			lines: Type.Optional(Type.Number({ description: "For action 'log': number of trailing lines to show. Default 40.", default: 40 })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			let runs = collectScriptRuns(root);
			if (params.module) runs = runs.filter((r) => r.module === params.module);

			const action = (params.action as string) || "list";

			// action: log — tail a specific log file
			if (action === "log") {
				if (!params.session) {
					return { content: [{ type: "text", text: "action 'log' requires 'session'." }], details: stubDetails("sci_logs", "log"), isError: true };
				}
				const mod = params.module || runs.find((r) => r.session === params.session)?.module;
				if (!mod) {
					return { content: [{ type: "text", text: `No manifest entry found for session '${params.session}'. Pass --module or check sci_logs list.` }], details: stubDetails("sci_logs", "log"), isError: true };
				}
				const logPath = path.join(root, mod, "tmux", `${params.session}.log`);
				try {
					const content = fs.readFileSync(logPath, "utf-8");
					const n = params.lines ?? 40;
					const allLines = content.split("\n");
					const tail = allLines.slice(Math.max(0, allLines.length - n)).join("\n");
					return {
						content: [{ type: "text", text: `tail -n ${n} ${mod}/tmux/${params.session}.log\n${"─".repeat(40)}\n${tail}` }],
						details: stubDetails("sci_logs", "log"),
					};
				} catch {
					return { content: [{ type: "text", text: `Log not found: ${mod}/tmux/${params.session}.log` }], details: stubDetails("sci_logs", "log"), isError: true };
				}
			}

			if (runs.length === 0) {
				return { content: [{ type: "text", text: `No script-run manifests found under ${root}. Run a long-running script via sci_implement first (manifests are written to <Module>/tmux/manifest.jsonl).` }], details: stubDetails("sci_logs", action) };
			}

			// Sort newest-first by endTs (fall back to ts string, then manifest order)
			runs.sort((a, b) => (b.endTs ?? 0) - (a.endTs ?? 0) || String(b.ts ?? "").localeCompare(String(a.ts ?? "")));

			let selected = runs;
			if (action === "failed") {
				selected = runs.filter((r) => r.exitCode !== 0);
				if (selected.length === 0) {
					return { content: [{ type: "text", text: `All ${runs.length} run(s) succeeded (exitCode 0). No failures recorded.` }], details: stubDetails("sci_logs", "failed") };
				}
			} else if (action === "latest") {
				// Keep only the last run per (module, session)
				const seen = new Set<string>();
				selected = [];
				for (const r of runs) { // runs is newest-first
					const key = `${r.module}/${r.session}`;
					if (seen.has(key)) continue;
					seen.add(key);
					selected.push(r);
				}
			}

			const lines = selected.map((r) => {
				const mark = r.exitCode === 0 ? "✓" : "✗";
				return `[${r.module}] ${mark} ${r.session}  exit=${r.exitCode}  ${fmtDuration(r.duration_s)}  ${r.ts ?? ""}  ${r.script}`;
			});
			const header = `sci_logs ${action} — ${selected.length} run(s)` +
				(params.module ? ` in ${params.module}` : "") +
				`\n(root: ${root})`;
			return { content: [{ type: "text", text: `${header}\n${"─".repeat(40)}\n${lines.join("\n")}` }], details: stubDetails("sci_logs", action) };
		},

		renderCall(args, theme, _context) {
			const action = (args.action as string) || "list";
			const cwd = (args.cwd as string) || "...";
			return new Text(
				theme.fg("toolTitle", theme.bold("sci_logs ")) + theme.fg("accent", action) + `\n  ${theme.fg("dim", cwd)}`,
				0, 0,
			);
		},

		renderResult(result, _opts, theme, _context) {
			return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
		},
	});
}
