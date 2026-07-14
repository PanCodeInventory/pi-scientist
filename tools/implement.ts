import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../agents.js";
import { buildCompletionReminder, buildReviewTask, buildWorkerTask } from "../prompts.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../runner.js";
import { extractHandoffJson, extractOutput, hasUncheckedTodolistItems, makeDetails } from "./shared.js";

export function registerImplementTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sci_implement",
		label: "Sci Implement",
		description: [
			"Dispatch a worker agent to execute the next unchecked step from a plan file,",
			"then automatically chain a reviewer agent to verify the output and update the plan.",
			"The worker executes the step but cannot modify the plan file.",
			"The reviewer inspects the output, marks checkboxes on PASS, or adds fix steps on NEEDS FIX.",
			"Each call executes ONE analysis step + its review. Call sci_implement repeatedly to progress through the plan.",
			"When all plan steps are checked, the tool reminds the main agent to write Report/<TaskID>-<具体内容>-<YYYYMMDD>.html with frontend-design and then git commit.",
		].join(" "),
		promptSnippet: "Dispatch worker+reviewer to execute and verify next plan step",
		promptGuidelines: [
			"ALWAYS call sci_implement with the planFile path and cwd/workDir from sci_plan's output. The worker reads the file directly — no need to copy the plan content.",
			"Each sci_implement call runs worker (execute step) → reviewer (verify + update plan) automatically. Call sci_implement once per analysis step.",
			"If the reviewer reports NEEDS FIX, fix steps have already been added to the plan file. Call sci_implement again to execute them.",
			"If sci_implement says all Todolist items are checked, stop dispatching subagents: use/read frontend-design, write Report/<TaskID>-<具体内容>-<YYYYMMDD>.html, then git commit.",
			"If the worker reports ANALYSIS TERMINATED or fails, investigate the issue before re-dispatching.",
		],
		parameters: Type.Object({
			planFile: Type.String({ description: "Path to the plan file created by sci_plan (e.g. Task/Task1-20260528.md). The worker reads this file to find its next task." }),
			cwd: Type.Optional(Type.String({ description: "User-confirmed analysis parent directory for the worker (defaults to current project directory). Prefer the workDir used by sci_plan." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const effectiveCwd = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			const fullTask = buildWorkerTask(params.planFile, effectiveCwd);

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
			const reviewTask = buildReviewTask({
				planFile: params.planFile,
				workDir: effectiveCwd,
				handoffJson,
			});

			const reviewResult = await runAgent(ctx.cwd, discovery.agents, "reviewer", reviewTask, {
				workDir: effectiveCwd,
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: `[reviewer] ${u.output}` }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const reviewOutput = extractOutput(reviewResult);

			const planPath = path.isAbsolute(params.planFile)
				? params.planFile
				: path.resolve(effectiveCwd, params.planFile);
			const uncheckedTodos = reviewResult.exitCode === 0 ? hasUncheckedTodolistItems(planPath) : null;
			const completionReminder = uncheckedTodos === false
				? buildCompletionReminder(params.planFile)
				: "";

			// Combined result
			const combinedOutput = [
				`## Worker Output`,
				workerOutput || "(no output)",
				"",
				`## Review Output`,
				reviewOutput || "(no output)",
				completionReminder,
			].filter(Boolean).join("\n");

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
			return renderAgentResult(details, !!expanded, theme);
		},
	});
}
