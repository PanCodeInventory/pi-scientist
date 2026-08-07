import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { buildCompletionReminder, buildReviewTask } from "../core/prompts.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../core/runner.js";
import { extractOutput, hasUncheckedTodolistItems, makeDetails } from "./shared.js";

export function registerReviewTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sci_review",
		label: "Sci Review",
		description: [
			"Dispatch a plan-aware reviewer that reviews the latest worker-executed step.",
			"The reviewer inspects outputs, then updates the plan file directly:",
			"  - PASS: marks the checkbox [x] and optionally adds review notes.",
			"  - NEEDS FIX: adds fix steps to the plan (Todolist + Task Details).",
			"Note: sci_implement already auto-chains review. Use this standalone tool only for manual re-reviews.",
			"If the review completes all Todolist items, this tool reminds the main agent to write Report/<TaskID>-<具体内容>-<YYYYMMDD>.html with frontend-design and then git commit.",
		].join(" "),
		promptSnippet: "Dispatch reviewer to verify latest step and update plan file",
		promptGuidelines: [
			"sci_implement already auto-chains a reviewer after each worker step. You do NOT need to call sci_review separately after sci_implement.",
			"Use sci_review standalone only for manual re-reviews, e.g. when you want to re-check a previously reviewed step.",
			"The reviewer updates the plan file directly: marks [x] on PASS, adds fix steps on NEEDS FIX.",
			"If sci_review says all Todolist items are checked, stop dispatching subagents: use/read frontend-design, write Report/<TaskID>-<具体内容>-<YYYYMMDD>.html, then git commit.",
		],
		parameters: Type.Object({
			planFile: Type.String({ description: "Path to the task document (e.g. Task/Task1-20260528.md). The reviewer reads this file, reviews the latest worker-executed step's outputs, updates the plan file (marks [x] on PASS, adds fix steps on NEEDS FIX)." }),
			cwd: Type.Optional(Type.String({ description: "User-confirmed analysis parent directory for the reviewer (defaults to current project directory). Use the directory recorded in the plan file." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const effectiveCwd = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			const task = buildReviewTask({
				planFile: params.planFile,
				workDir: effectiveCwd,
				standalone: true,
			});
			const result = await runAgent(ctx.cwd, discovery.agents, "reviewer", task, {
				workDir: effectiveCwd,
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const output = extractOutput(result);
			const planPath = path.isAbsolute(params.planFile)
				? params.planFile
				: path.resolve(effectiveCwd, params.planFile);
			const uncheckedTodos = result.exitCode === 0 ? hasUncheckedTodolistItems(planPath) : null;
			const finalOutput = uncheckedTodos === false
				? [output || "(no output)", "", buildCompletionReminder(params.planFile)].join("\n")
				: output;

			return {
				content: [{ type: "text", text: finalOutput || "(no output)" }],
				details: makeDetails(result, finalOutput),
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
			return renderAgentResult(details, !!expanded, theme);
		},
	});
}
