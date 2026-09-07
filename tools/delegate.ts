/** Shared adapter for optional execution/review, without an orchestration loop. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { buildReviewTask, buildWorkerTask } from "../core/prompts.js";
import { runAgent, renderAgentResult, type AgentRenderItem } from "../core/runner.js";
import { agentToolResult } from "./shared.js";

export function registerTaskAgentTool(pi: ExtensionAPI, role: "worker" | "reviewer", run = runAgent): void {
	const review = role === "reviewer";
	const name = review ? "sci_review" : "sci_implement";
	pi.registerTool({
		name,
		label: review ? "Sci Review" : "Sci Implement",
		description: review
			? "Optional independent, read-only review of a specified design, stage or scientific claim. Returns evidence and fixes; never edits a plan. Provide task scope and paths, or an existing planFile. No automatic follow-up execution. Output bounded to 50KB/2000 lines; full text is saved when truncated."
			: "Legacy one-shot worker delegation. Prefer sci_dispatch for persistent team analysis; this synchronous compatibility tool has no task recovery. Accepts a task brief or an existing planFile; no plan required and NO automatic reviewer. The worker validates outputs and updates only its assigned progress if a plan exists. Output bounded to 50KB/2000 lines; full text is saved when truncated.",
		promptSnippet: review ? "Optional independent scientific review" : "One-shot worker compatibility tool (no auto-review)",
		promptGuidelines: [review
			? "Use sci_review for consequential designs, major outputs, central claims or requested review; not automatically after each step."
			: "Use sci_implement only when a bounded independent task benefits from delegation. Include relevant decisions and paths; the worker does not inherit conversation history."],
		parameters: Type.Object({
			task: Type.Optional(Type.String({ description: "Concrete scope, relevant constraints, inputs and outputs (required unless planFile is provided)", minLength: 1 })),
			planFile: Type.Optional(Type.String({ description: "Optional existing plan; resolved relative to cwd", minLength: 1 })),
			cwd: Type.Optional(Type.String({ description: "Established analysis parent directory; defaults to current directory" })),
			timeoutSeconds: Type.Optional(Type.Integer({ description: "Maximum agent runtime in seconds; default 600. Long analysis processes should use tmux.", minimum: 1, maximum: 3600 })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			if (!params.task?.trim() && !params.planFile?.trim()) throw new Error("Provide a task brief or an existing planFile.");
			const cwd = params.cwd ? path.resolve(ctx.cwd, params.cwd.replace(/^@/, "")) : ctx.cwd;
			const planFile = params.planFile ? path.resolve(cwd, params.planFile.replace(/^@/, "")) : undefined;
			if (planFile && !fs.statSync(planFile, { throwIfNoEntry: false })?.isFile()) {
				throw new Error(`Plan file not found: ${planFile}. Supply the correct path or use a task brief without a plan.`);
			}
			const task = (review ? buildReviewTask : buildWorkerTask)({ task: params.task, planFile, workDir: cwd });
			const result = await run(ctx.cwd, discoverScientists().agents, role, task, {
				workDir: cwd, signal, timeoutSeconds: params.timeoutSeconds,
				onUpdate: onUpdate ? (u) => onUpdate({ content: [{ type: "text", text: u.output }], details: u.details }) : undefined,
			});
			return agentToolResult(result);
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(`${name} `)) + theme.fg("dim", String(args.task || args.planFile || "...").slice(0, 120)), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as AgentRenderItem | undefined;
			return details ? renderAgentResult(details, !!expanded, theme)
				: new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
		},
	});
}
