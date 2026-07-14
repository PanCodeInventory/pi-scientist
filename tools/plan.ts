import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../agents.js";
import { buildPlannerTask } from "../prompts.js";
import { runAgent, runAgentFork, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../runner.js";
import { extractOutput, makeDetails, stubDetails } from "./shared.js";

export function registerPlanTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sci_plan",
		label: "Sci Plan",
		description: [
			"Dispatch a methodology-focused planner agent to create a bioinformatics analysis plan.",
			"Provide outputs from sci_scout/sci_librarian plus the Shared Scientific Contract from user dialogue as context. The plan MUST include a Methodology section",
			"with package versions, citations, parameter justification, assumptions, and alternative approaches.",
			"The plan is saved under Task/ in the user-confirmed analysis parent directory; generated outputs go to sibling module directories like <NN>_ModuleName/, not under Task/.",
			"Planner must not add a subagent final-report step; it only records a main-agent completion reminder for Report/<TaskID>-<具体内容>-<YYYYMMDD>.html + git commit.",
			"Use this after scouting and before implementing.",
		].join(" "),
		promptSnippet: "Dispatch planner to create analysis plan with methodology for TASK",
		promptGuidelines: [
			"ALWAYS use sci_plan after sci_scout to create a methodology-confirmed analysis plan. NEVER implement without a plan.",
			"Before sci_plan, resolve the evidence-grounded decision tree, explicitly confirm the auto-generated Shared Scientific Contract, then use ask_user_question with purpose='administrative' to confirm the analysis parent directory that will contain the Task/ plan folder and analysis subdirectories.",
			"Plans are saved as <workDir>/Task/TaskN-YYYYMMDD.md. Generated outputs must go under module directories like <workDir>/01_Preprocessing/ or <workDir>/<NN>_ModuleName/ (siblings to Task/, not inside Task/).",
			"Do NOT plan per-module README.md files, 99_Report/, RFINAL, or any report-generation Todolist step. The final report is main-agent only after all steps pass review.",
			"If scouting returns insufficient context, call sci_scout again with more specific guidance before planning.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "The analysis task to plan for" }),
			context: Type.String({ description: "Context from sci_scout + sci_librarian + user dialogue: data findings, method evidence/citations, the confirmed auto-generated Shared Scientific Contract (including decision IDs, provenance, recommendations, and resolution modes), delegated defaults, and analysis parent directory" }),
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
			const fullTask = buildPlannerTask(params.task, effectiveWorkDir, params.context);
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
			return renderAgentResult(details, !!expanded, theme);
		},
	});
}
