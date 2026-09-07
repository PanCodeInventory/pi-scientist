/** Optional questions. Answers live in normal tool history; no contract state machine. */
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { buildDecisionLog, prepareQuestionArguments } from "./contract.js";
import { ASK_TOOL_NAME, type AskUserQuestionDetails, type QuestionParams } from "./types.js";
import { showFallbackDialog, showScientificDialog, withWorkingLoaderHidden } from "./ui.js";

export function registerScientificDialogue(pi: ExtensionAPI): void {
	pi.registerCommand("science-contract", {
		description: "查看当前分支的问答记录（兼容旧契约；不作为执行门槛）",
		async handler(_args, ctx) {
			const log = buildDecisionLog(ctx.sessionManager.getBranch());
			if (ctx.hasUI) await ctx.ui.editor("科学决策记录（只读查看）", log);
		},
	});

	pi.registerTool({
		name: ASK_TOOL_NAME,
		label: "Scientific Question",
		description: "Ask for a consequential choice or information only the user can supply. Only question is required; explanation, recommendation and options are optional. Reuse existing answers. No decision IDs, dependency tree or final contract confirmation is required.",
		promptSnippet: "Ask the user when a material choice is unresolved",
		promptGuidelines: ["Use ask_user_question for material unresolved choices, not discoverable facts or repeated confirmations. Explain scientific trade-offs when useful. Ask dependent follow-ups only after receiving the relevant answer. In non-interactive runs ask in chat and wait; never invent an answer."],
		executionMode: "sequential",
		parameters: Type.Object({
			question: Type.String({ description: "Self-contained question", minLength: 1, maxLength: 1000 }),
			briefing: Type.Optional(Type.String({ description: "Relevant context, evidence or why the choice matters", maxLength: 2000 })),
			principles: Type.Optional(Type.String({ description: "Plain-language method explanation when helpful", maxLength: 3000 })),
			recommendation: Type.Optional(Type.Object({
				value: Type.String({ maxLength: 300 }),
				label: Type.Optional(Type.String({ maxLength: 300 })),
				rationale: Type.String({ maxLength: 1500 }),
				conditions: Type.Optional(Type.String({ maxLength: 1000 })),
			})),
			options: Type.Optional(Type.Array(Type.Object({
				label: Type.String({ minLength: 1, maxLength: 300 }),
				value: Type.Optional(Type.String({ maxLength: 300 })),
				description: Type.Optional(Type.String({ maxLength: 1000 })),
				recommended: Type.Optional(Type.Boolean()),
				resolution: Type.Optional(StringEnum(["user_choice", "accepted_recommendation", "delegated", "deferred"] as const)),
			}), { maxItems: 10 })),
			allowCustom: Type.Optional(Type.Boolean({ default: true })),
			multiline: Type.Optional(Type.Boolean()),
			placeholder: Type.Optional(Type.String({ maxLength: 1000 })),
		}),
		prepareArguments: (args) => prepareQuestionArguments(args) as QuestionParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			signal?.throwIfAborted();
			if (!params.question.trim()) throw new Error("Question must not be blank.");
			if (!ctx.hasUI) throw new Error("Interactive UI unavailable. Ask this question in the assistant response and wait for an answer before the affected work; do not retry this tool or infer consent.");
			const selection = await withWorkingLoaderHidden(ctx, () => ctx.mode === "tui"
				? showScientificDialog(params, ctx, signal)
				: showFallbackDialog(params, ctx, signal));
			signal?.throwIfAborted();
			const details: AskUserQuestionDetails = {
				question: params.question,
				answer: selection?.answer ?? null,
				value: selection?.value ?? null,
				cancelled: !selection,
				wasCustom: selection?.wasCustom,
				selectedIndex: selection?.index,
				resolution: selection?.resolution,
			};
			return {
				content: [{ type: "text", text: selection
					? `User answered: ${selection.answer}${selection.value !== selection.answer ? ` (${selection.value})` : ""}`
					: "User cancelled. Do not infer consent or proceed with the affected choice. Acknowledge and wait for user direction." }],
				details,
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("ask_user_question ")) + theme.fg("muted", args.question || "..."), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as AskUserQuestionDetails | undefined;
			return new Text(details?.cancelled ? theme.fg("warning", "已取消；未获确认")
				: theme.fg("success", "✓ ") + theme.fg("accent", details?.answer ?? ""), 0, 0);
		},
	});
}
