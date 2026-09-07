// Entry point for the scientific dialogue subsystem.
//
// Wires the ask_user_question tool and /science-contract command, plus the
// lifecycle hooks that persist and restore the Shared Scientific Contract
// across session reload, compaction, fork, and tree navigation. The mutable
// decision state lives in this module's closure; pure helpers (snapshot,
// generate, validate) come from ./contract.js and the two render paths come
// from ./ui.js.
//
// The TypeBox parameter schemas below are intentionally module-private: they
// are only consumed by the tool registration and must not be re-exported, so
// that `declaration: true` does not need to name their (non-portable) inferred
// types in the generated .d.ts.

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	generateScientificContract,
	isContractEvent,
	makeStateEvent,
	snapshotState,
	validateScientificQuestion,
} from "./contract.js";
import {
	ASK_TOOL_NAME,
	CATEGORY_LABELS,
	DECISION_CATEGORIES,
	RESOLUTION_LABELS,
	type AskUserOption,
	type AskUserPurpose,
	type AskUserQuestionDetails,
	type DecisionCategory,
	type EvidenceItem,
	type ScientificDecisionRecord,
	type ScientificRecommendation,
} from "./types.js";
import { showFallbackDialog, showScientificDialog, withWorkingLoaderHidden } from "./ui.js";

const EvidenceSchema = Type.Object({
	source: StringEnum(["scout", "librarian", "data", "code", "plan", "literature", "user", "inference"] as const, {
		description: "Evidence provenance. Use inference only for conclusions derived by the main agent.",
	}),
	claim: Type.String({ description: "One atomic fact relevant to this decision. Do not restate the source name; the provenance tag conveys it.", maxLength: 1_200 }),
	reference: Type.Optional(Type.String({ description: "File/field, PMID/DOI, URL, plan section, or tool output reference", maxLength: 500 })),
});

const RecommendationSchema = Type.Object({
	value: Type.String({ description: "Machine-readable recommended answer; match an option value when possible", maxLength: 300 }),
	label: Type.Optional(Type.String({ description: "Human-readable recommended answer", maxLength: 300 })),
	rationale: Type.String({ description: "Why this is the recommended answer for the current evidence", maxLength: 1_500 }),
	conditions: Type.Optional(Type.String({ description: "Conditions under which the recommendation holds or should change", maxLength: 1_000 })),
});

const AskUserOptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the option", maxLength: 300 }),
	value: Type.Optional(Type.String({ description: "Machine-readable value; defaults to label", maxLength: 300 })),
	description: Type.Optional(Type.String({ description: "Scientific/statistical implication or trade-off", maxLength: 1_000 })),
	recommended: Type.Optional(Type.Boolean({ description: "Mark this option as recommended. Normally matches recommendation.value." })),
	resolution: Type.Optional(StringEnum(["user_choice", "accepted_recommendation", "delegated", "deferred"] as const, {
		description: "How selecting this option resolves the decision. Use delegated for '按你的建议', deferred for intentional deferral.",
	})),
	confirmsContract: Type.Optional(Type.Boolean({ description: "True only for the explicit option that confirms the complete Shared Scientific Contract." })),
});

const AskUserQuestionSchema = Type.Object({
	question: Type.String({ description: "Exactly one self-contained question naming the concrete choice to make. Must be understandable without reading the evidence.", maxLength: 1_000 }),
	purpose: Type.Optional(StringEnum(["scientific", "administrative"] as const, {
		description: "Default: scientific. Use administrative only for paths or other non-scientific logistics.",
		default: "scientific",
	})),
	decisionId: Type.Optional(Type.String({
		description: "Stable snake_case ID for this decision branch, e.g. primary_contrast. Required for scientific questions.",
		pattern: "^[a-z][a-z0-9_]{1,63}$",
	})),
	category: Type.Optional(StringEnum(DECISION_CATEGORIES, { description: "Scientific decision category. Required for scientific questions." })),
	dependsOn: Type.Optional(Type.Array(Type.String({ pattern: "^[a-z][a-z0-9_]{1,63}$" }), {
		description: "Previously resolved decision IDs that this question depends on, in dependency order.",
		maxItems: 20,
	})),
	briefing: Type.Optional(Type.String({ description: "Optional concise synthesis. Do not repeat the full evidence list.", maxLength: 2_000 })),
	evidence: Type.Optional(Type.Array(EvidenceSchema, {
		description: "Structured evidence supporting the question and recommendation. Required and non-empty for scientific questions. Keep it concise: 2-5 decisive, deduplicated items grouped by provenance. Recorded in the persisted contract; not shown in the dialog.",
		minItems: 1,
		maxItems: 12,
	})),
	whyItMatters: Type.Optional(Type.String({
		description: "How this choice changes biological interpretation, statistical validity, or downstream work. Required for scientific questions. Recorded in the persisted contract; not shown in the dialog.",
		maxLength: 1_500,
	})),
	principles: Type.Optional(Type.String({
		description: "Plain-language introduction of how each candidate method/option works: statistical unit, model assumptions, strengths/limits, data-scale behavior. Required for method-category questions; rendered as the primary context in the dialog.",
		maxLength: 3_000,
	})),
	recommendation: Type.Optional(RecommendationSchema),
	options: Type.Optional(Type.Array(AskUserOptionSchema, {
		description: "Optional choices. Describe scientific trade-offs, mark the recommended route, and include a delegation option when useful.",
		maxItems: 10,
	})),
	allowCustom: Type.Optional(Type.Boolean({ description: "Allow an inline custom answer. Default: true.", default: true })),
	multiline: Type.Optional(Type.Boolean({ description: "Allow a multi-line custom answer. Default: false.", default: false })),
	placeholder: Type.Optional(Type.String({ description: "Initial custom-answer text", maxLength: 1_000 })),
	finalizesContract: Type.Optional(Type.Boolean({
		description: "Set true only for the final Shared Scientific Contract confirmation question. dependsOn must include every prior scientific decision ID, and one option must set confirmsContract=true.",
		default: false,
	})),
});

export function registerScientificDialogue(pi: ExtensionAPI): void {
	let decisions = new Map<string, ScientificDecisionRecord>();
	let contractConfirmed = false;
	let contractConfirmedAt: string | undefined;
	let askCallsThisTurn = 0;

	function updateContractStatus(ctx: ExtensionContext): void {
		if (decisions.size === 0) {
			ctx.ui.setStatus("science-contract", undefined);
			return;
		}
		const mark = contractConfirmed ? "✓" : "○";
		ctx.ui.setStatus("science-contract", `${mark} Contract ${contractConfirmed ? "confirmed" : "open"} (${decisions.size})`);
	}

	function restoreState(ctx: ExtensionContext): void {
		decisions = new Map();
		contractConfirmed = false;
		contractConfirmedAt = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message" || entry.message.role !== "toolResult" || entry.message.toolName !== ASK_TOOL_NAME) continue;
			const details = entry.message.details as Partial<AskUserQuestionDetails> | undefined;
			if (!isContractEvent(details?.stateEvent)) continue;
			if (details.stateEvent.decision) decisions.set(details.stateEvent.decision.id, details.stateEvent.decision);
			contractConfirmed = details.stateEvent.confirmed;
			contractConfirmedAt = details.stateEvent.confirmedAt;
		}
		updateContractStatus(ctx);
	}

	pi.on("session_start", async (_event, ctx) => restoreState(ctx));
	pi.on("session_tree", async (_event, ctx) => restoreState(ctx));
	pi.on("before_agent_start", async (event) => {
		if (decisions.size === 0) return;
		const contract = generateScientificContract(snapshotState(decisions, contractConfirmed, contractConfirmedAt));
		return {
			systemPrompt: `${event.systemPrompt}\n\n<scientific-contract-state>\nThis is the branch-aware persisted decision state. Use it instead of re-asking resolved questions.\n${contract}\n</scientific-contract-state>`,
		};
	});
	pi.on("turn_start", async () => {
		askCallsThisTurn = 0;
	});
	pi.on("tool_call", async (event) => {
		if (event.toolName !== ASK_TOOL_NAME) return;
		askCallsThisTurn++;
		if (askCallsThisTurn > 1) {
			return {
				block: true,
				reason: "Only one ask_user_question call is allowed per assistant turn. Read the previous answer, update/prune the decision tree, then ask the next dependency in a new turn.",
			};
		}
	});

	pi.registerCommand("science-contract", {
		description: "查看当前会话中已持久化的 Shared Scientific Contract",
		async handler(_args, ctx) {
			const contract = generateScientificContract(snapshotState(decisions, contractConfirmed, contractConfirmedAt));
			if (!ctx.hasUI) return;
			await ctx.ui.editor("Shared Scientific Contract（只读查看；Esc 关闭）", contract);
		},
	});

	pi.registerTool({
		name: ASK_TOOL_NAME,
		label: "Scientific Decision",
		description: [
			"Resolve exactly one user-owned decision branch and return the answer.",
			"Scientific questions require a stable decision ID/category/dependencies, structured evidence with provenance, why the decision matters, and a clear recommended answer.",
			"For technical choices, also provide a principles introduction of how each candidate works. The dialog displays principles, recommendation, briefing, and options; evidence and whyItMatters are persisted to the Shared Scientific Contract but not rendered.",
			"Inspect files/code/docs/literature instead of asking discoverable factual questions.",
			"Call this tool at most once per assistant turn; after the answer, explain its consequence, prune the decision tree, then ask the next dependency in a new turn.",
			"Decision state persists in tool-result details across reloads and branches, and each scientific answer returns an automatically generated Shared Scientific Contract.",
		].join(" "),
		promptSnippet: "Resolve one evidence-grounded scientific decision branch with the user",
		executionMode: "sequential",
		promptGuidelines: [
			"Call ask_user_question at most ONCE in each assistant response. Never emit sibling ask_user_question calls; later questions must be generated only after reading the prior answer.",
			"Before ask_user_question, inspect files, code, plans, documentation, or literature when they can answer the candidate question. Ask only for user intent, unavailable domain knowledge, value judgments, or genuine choices.",
			"For every scientific call, provide decisionId, category, resolved dependsOn IDs, structured evidence with provenance, whyItMatters, recommendation {value, rationale, conditions}, and principles for method questions. Missing fields are rejected.",
			"`principles` must explain in plain language how each candidate method works (statistical unit, model assumptions, scale behavior, strengths/limits). Required for method-category questions. It is the primary context the user sees — write it for a scientist who knows biology but not this method family.",
			"The dialog shows principles, recommendation, briefing, and options only. Do not rely on evidence or whyItMatters to carry user-facing explanation; they are recorded in the Shared Scientific Contract.",
			"The question must be ONE self-contained sentence that names the exact choice being made (e.g. '主对比组应选 A vs B 还是 A vs C？'). Do not rely on the evidence or briefing to make the question intelligible.",
			"Keep evidence tidy: one atomic fact per item, no duplicates, and let the source tag carry the provenance instead of restating it in the claim. Prefer 2-5 decisive items over exhaustive lists.",
			"Walk upstream-to-downstream dependencies. After each answer, explain the scientific consequence and update/prune the remaining decision tree before asking again.",
			"Option descriptions must explain scientific/statistical trade-offs. Match the recommended option to recommendation.value and include a delegated option when the user may reasonably say '按你的建议'.",
			"Use finalizesContract=true only for the final confirmation question. Its dependsOn must include every prior decision ID and its acceptance option must set confirmsContract=true.",
			"Use purpose='administrative' only for paths and logistics. Administrative questions do not enter the Shared Scientific Contract.",
		],
		parameters: AskUserQuestionSchema,
		prepareArguments(args): any {
			if (!args || typeof args !== "object") return args;
			const input = args as Record<string, unknown>;
			const next: Record<string, unknown> = { ...input };

			// Compatibility with ask_user_question calls stored before structured dialogue v2.
			if (typeof input.recommendation === "string") {
				next.recommendation = {
					value: input.recommendation,
					label: input.recommendation,
					rationale: input.recommendation,
				};
			}
			if (!Array.isArray(input.evidence) && typeof input.briefing === "string" && input.briefing.trim()) {
				next.evidence = [{ source: "inference", claim: input.briefing }];
			}
			if (typeof input.recommendation === "string" && !input.decisionId) {
				next.decisionId = "legacy_decision";
				next.category = "other";
			}
			return next;
		},

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				throw new Error("Interactive UI is unavailable. Ask the question in a normal assistant response and do not continue to planning without an answer.");
			}

			const purpose = (params.purpose ?? "scientific") as AskUserPurpose;
			const options = (params.options ?? []) as AskUserOption[];
			const evidence = (params.evidence ?? []) as EvidenceItem[];
			const recommendation = params.recommendation as ScientificRecommendation | undefined;
			const dependsOn = (params.dependsOn ?? []) as string[];

			if (purpose === "scientific") {
				validateScientificQuestion({
					decisionId: params.decisionId,
					category: params.category as DecisionCategory | undefined,
					dependsOn,
					evidence,
					whyItMatters: params.whyItMatters,
					principles: params.principles,
					recommendation,
					options,
					finalizesContract: params.finalizesContract,
				}, decisions);
			}

			const result = await withWorkingLoaderHidden(ctx, () =>
				purpose === "scientific" && ctx.mode === "tui"
					? showScientificDialog({
						question: params.question,
						decisionId: params.decisionId!,
						category: params.category as DecisionCategory,
						briefing: params.briefing,
						principles: params.principles,
						recommendation: recommendation!,
						options,
						allowCustom: params.allowCustom,
						multiline: params.multiline,
						placeholder: params.placeholder,
					}, ctx)
					: showFallbackDialog({
						question: params.question,
						purpose,
						briefing: params.briefing,
						principles: params.principles,
						recommendation,
						options,
						allowCustom: params.allowCustom,
						multiline: params.multiline,
						placeholder: params.placeholder,
					}, ctx),
			);

			if (!result) {
				return {
					content: [{
						type: "text",
						text: "User cancelled the question. STOP: do not infer consent, do not resolve this branch, and do not proceed to planning. Acknowledge the cancellation and wait for user direction.",
					}],
					details: {
						purpose,
						decisionId: params.decisionId,
						answer: null,
						value: null,
						cancelled: true,
						stateEvent: makeStateEvent(undefined, contractConfirmed, contractConfirmedAt),
						decisionCount: decisions.size,
					} satisfies AskUserQuestionDetails,
				};
			}

			let recordedDecision: ScientificDecisionRecord | undefined;
			if (purpose === "scientific") {
				const now = new Date().toISOString();
				recordedDecision = {
					id: params.decisionId!,
					category: params.category as DecisionCategory,
					question: params.question.trim(),
					dependsOn: [...dependsOn],
					answer: result.answer,
					value: result.value,
					resolution: result.resolution,
					evidence: evidence.map((item) => ({ ...item })),
					recommendation: { ...recommendation! },
					whyItMatters: params.whyItMatters!.trim(),
					updatedAt: now,
				};
				decisions.set(params.decisionId!, recordedDecision);

				// Any changed scientific decision reopens the contract until explicit final confirmation.
				contractConfirmed = params.finalizesContract === true && result.confirmsContract;
				contractConfirmedAt = contractConfirmed ? now : undefined;
			}

			updateContractStatus(ctx);
			const state = snapshotState(decisions, contractConfirmed, contractConfirmedAt);
			const contract = generateScientificContract(state);
			const answerPrefix = result.wasCustom ? "User wrote" : `User selected ${result.index ?? ""}`.trim();
			const resolutionText = purpose === "scientific" ? `\nResolution: ${RESOLUTION_LABELS[result.resolution]}` : "";
			const contractText = purpose === "scientific"
				? `\n\n## Current Shared Scientific Contract\n${contract}\n\nAcknowledge how this answer changes the analysis, prune incompatible branches, and only then decide whether another question is needed.`
				: "";

			return {
				content: [{ type: "text", text: `${answerPrefix}: ${result.value}${resolutionText}${contractText}` }],
				details: {
					purpose,
					decisionId: params.decisionId,
					answer: result.answer,
					value: result.value,
					cancelled: false,
					wasCustom: result.wasCustom,
					selectedIndex: result.index,
					resolution: result.resolution,
					stateEvent: makeStateEvent(recordedDecision, contractConfirmed, contractConfirmedAt),
					decisionCount: decisions.size,
				} satisfies AskUserQuestionDetails,
			};
		},

		renderCall(args, theme) {
			const question = (args.question as string) || "...";
			const decisionId = args.decisionId as string | undefined;
			const category = args.category as DecisionCategory | undefined;
			let text = theme.fg("toolTitle", theme.bold("ask_user_question "));
			if (decisionId) text += theme.fg("accent", decisionId);
			if (category) text += theme.fg("muted", ` · ${CATEGORY_LABELS[category]}`);
			text += `\n  ${theme.fg("muted", question)}`;
			const recommendation = args.recommendation as ScientificRecommendation | string | undefined;
			if (recommendation && typeof recommendation === "object") {
				text += `\n  ${theme.fg("accent", `推荐: ${recommendation.label ?? recommendation.value}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskUserQuestionDetails | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
			if (details.cancelled) return new Text(theme.fg("warning", "已取消；决策分支保持未解决"), 0, 0);
			const tag = details.wasCustom ? "(自定义) " : details.selectedIndex ? `(${details.selectedIndex}) ` : "";
			let text = theme.fg("success", "✓ ") + theme.fg("muted", tag) + theme.fg("accent", details.value ?? details.answer ?? "");
			if (details.decisionId) text += `\n${theme.fg("dim", `${details.decisionId} · ${details.decisionCount} decisions · contract ${details.stateEvent.confirmed ? "confirmed" : "open"}`)}`;
			return new Text(text, 0, 0);
		},
	});
}
