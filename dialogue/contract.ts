/** Presentation/history helpers. Legacy contract events remain readable, never gates. */
import { ASK_TOOL_NAME, type AskUserOption, type QuestionParams, type ResolutionKind, type ScientificRecommendation } from "./types.js";

export function formatPlainQuestion(params: QuestionParams): string {
	const sections = [`需要你决定\n${params.question.trim()}`];
	if (params.principles?.trim()) sections.push(`原理\n${params.principles.trim()}`);
	if (params.recommendation) {
		const r = params.recommendation;
		sections.push(`推荐\n${r.label ?? r.value}：${r.rationale}${r.conditions ? `\n适用条件：${r.conditions}` : ""}`);
	}
	if (params.briefing?.trim()) sections.push(`背景\n${params.briefing.trim()}`);
	return sections.join("\n\n");
}

export function normalizeResolution(option: AskUserOption, recommendation?: ScientificRecommendation): ResolutionKind {
	if (option.resolution) return option.resolution;
	return option.recommended || (recommendation && (option.value ?? option.label) === recommendation.value)
		? "accepted_recommendation" : "user_choice";
}

/** Translate older tool calls without fabricating evidence or consent. */
export function prepareQuestionArguments(args: unknown): unknown {
	if (!args || typeof args !== "object") return args;
	const input = args as Record<string, unknown>;
	const next: Record<string, unknown> = {};
	for (const key of ["question", "briefing", "principles", "recommendation", "options", "allowCustom", "multiline", "placeholder"]) {
		if (key in input) next[key] = input[key];
	}
	if (typeof input.recommendation === "string") {
		next.recommendation = { value: input.recommendation, rationale: input.recommendation };
	}
	if (Array.isArray(input.options)) {
		next.options = input.options.map((option: unknown) => {
			if (typeof option === "string") return { label: option };
			if (!option || typeof option !== "object") return option;
			return Object.fromEntries(Object.entries(option).filter(([key]) =>
				["label", "value", "description", "recommended", "resolution"].includes(key)));
		});
	}
	// Old evidence was hidden in the contract. Preserve it as visible context.
	const legacyContext: string[] = [];
	if (typeof input.whyItMatters === "string") legacyContext.push(input.whyItMatters);
	if (Array.isArray(input.evidence)) {
		for (const value of input.evidence) {
			if (!value || typeof value !== "object" || typeof value.claim !== "string") continue;
			legacyContext.push(`${value.claim}${typeof value.reference === "string" ? ` [${value.reference}]` : ""}`);
		}
	}
	if (legacyContext.length) next.briefing = [input.briefing, ...legacyContext].filter(Boolean).join("\n").slice(0, 2000);
	return next;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

/** Call with the active branch only; do not leak decisions from sibling branches. */
export function buildDecisionLog(entries: readonly unknown[]): string {
	const lines = ["# Scientific decision log", "", "Recorded answers, not a confirmed-contract gate. Later answers may supersede earlier ones."];
	for (const entry of entries) {
		const e = record(entry);
		const message = record(e?.message);
		if (e?.type !== "message" || message?.role !== "toolResult" || message.toolName !== ASK_TOOL_NAME) continue;
		const details = record(message.details);
		const decision = record(record(details?.stateEvent)?.decision);
		const question = details?.question ?? decision?.question;
		const answer = details?.answer ?? decision?.answer;
		if (typeof answer !== "string" || details?.cancelled === true) continue;
		lines.push("", `- ${typeof question === "string" ? question : "Legacy decision"}`, `  - ${answer}`);
	}
	if (lines.length === 3) lines.push("", "No recorded answers on this branch.");
	return lines.join("\n");
}
