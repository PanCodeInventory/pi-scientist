// Pure functions for the Shared Scientific Contract:
// - state snapshots / events (serializable, stored in tool-result details)
// - contract Markdown generation
// - question validation and answer normalization helpers
//
// Nothing here touches the pi API or the terminal; it is pure data-in/data-out
// so it can be unit-tested in isolation.

import {
	CATEGORY_LABELS,
	DECISION_CATEGORIES,
	EVIDENCE_SOURCE_LABELS,
	MAX_CONTRACT_CHARS,
	RESOLUTION_LABELS,
	STATE_VERSION,
	type AskUserOption,
	type DecisionCategory,
	type EvidenceItem,
	type ResolutionKind,
	type ScientificContractEvent,
	type ScientificContractState,
	type ScientificDecisionRecord,
	type ScientificRecommendation,
} from "./types.js";

export function snapshotState(
	decisions: Map<string, ScientificDecisionRecord>,
	confirmed: boolean,
	confirmedAt?: string,
): ScientificContractState {
	return {
		version: STATE_VERSION,
		decisions: Array.from(decisions.values()).map((decision) => ({
			...decision,
			dependsOn: [...decision.dependsOn],
			evidence: decision.evidence.map((item) => ({ ...item })),
			recommendation: { ...decision.recommendation },
		})),
		confirmed,
		confirmedAt,
	};
}

export function isContractEvent(value: unknown): value is ScientificContractEvent {
	if (!value || typeof value !== "object") return false;
	const event = value as Partial<ScientificContractEvent>;
	return event.version === STATE_VERSION && typeof event.confirmed === "boolean";
}

export function makeStateEvent(
	decision: ScientificDecisionRecord | undefined,
	confirmed: boolean,
	confirmedAt?: string,
): ScientificContractEvent {
	return {
		version: STATE_VERSION,
		decision: decision ? {
			...decision,
			dependsOn: [...decision.dependsOn],
			evidence: decision.evidence.map((item) => ({ ...item })),
			recommendation: { ...decision.recommendation },
		} : undefined,
		confirmed,
		confirmedAt,
	};
}

export function generateScientificContract(state: ScientificContractState): string {
	const lines = [
		"# Shared Scientific Contract",
		"",
		`> 状态：${state.confirmed ? "✅ 已由用户确认" : "🟡 尚未最终确认"} | 已解决决策：${state.decisions.length}`,
	];
	if (state.confirmedAt) lines.push(`> 确认时间：${state.confirmedAt}`);

	if (state.decisions.length === 0) {
		lines.push("", "尚无已记录的科学决策。");
		return lines.join("\n");
	}

	for (const category of DECISION_CATEGORIES) {
		const categoryDecisions = state.decisions.filter((decision) => decision.category === category);
		if (categoryDecisions.length === 0) continue;
		lines.push("", `## ${CATEGORY_LABELS[category]}`);
		for (const decision of categoryDecisions) {
			const evidenceSummary = decision.evidence
				.slice(0, 4)
				.map((item) => {
					const body = item.reference ? `${item.claim} [${item.reference}]` : item.claim;
					return `${EVIDENCE_SOURCE_LABELS[item.source]}：${body}`;
				})
				.join("；");
			lines.push(
				`- **${decision.id}**：${decision.answer}`,
				`  - 问题：${decision.question}`,
				`  - 决策方式：${RESOLUTION_LABELS[decision.resolution]}`,
				`  - 为什么重要：${decision.whyItMatters}`,
				`  - 推荐：${decision.recommendation.label ?? decision.recommendation.value} — ${decision.recommendation.rationale}`,
			);
			if (decision.recommendation.conditions) lines.push(`  - 推荐适用条件：${decision.recommendation.conditions}`);
			if (decision.dependsOn.length > 0) lines.push(`  - 依赖：${decision.dependsOn.join(", ")}`);
			if (evidenceSummary) lines.push(`  - 关键证据：${evidenceSummary}`);
			if (decision.evidence.length > 4) lines.push(`  - 其他证据：另有 ${decision.evidence.length - 4} 条，见对应工具调用。`);
			if (decision.resolution === "deferred") lines.push(`  - 注意：该分支被有意延后，后续解释必须保留此限制。`);
		}
	}

	const contract = lines.join("\n");
	return contract.length <= MAX_CONTRACT_CHARS
		? contract
		: `${contract.slice(0, MAX_CONTRACT_CHARS)}\n\n[Contract truncated at ${MAX_CONTRACT_CHARS} characters]`;
}

export function formatPlainQuestion(params: {
	question: string;
	briefing?: string;
	principles?: string;
	recommendation?: ScientificRecommendation;
}): string {
	const sections: string[] = [];
	// Lead with the decision itself so the question is unambiguous.
	sections.push(`需要你决定\n${params.question.trim()}`);
	if (params.principles?.trim()) sections.push(`原理\n${params.principles.trim()}`);
	if (params.recommendation) {
		const recommendation = params.recommendation;
		const conditions = recommendation.conditions ? `\n适用条件：${recommendation.conditions}` : "";
		sections.push(`推荐\n${recommendation.label ?? recommendation.value}：${recommendation.rationale}${conditions}`);
	}
	if (params.briefing?.trim()) sections.push(`背景\n${params.briefing.trim()}`);
	return sections.join("\n\n");
}

export function normalizeResolution(option: AskUserOption, recommendation?: ScientificRecommendation): ResolutionKind {
	if (option.resolution) return option.resolution;
	const value = option.value ?? option.label;
	if (option.recommended || (recommendation && value === recommendation.value)) return "accepted_recommendation";
	return "user_choice";
}

export function validateScientificQuestion(
	params: {
		decisionId?: string;
		category?: DecisionCategory;
		dependsOn?: string[];
		evidence?: EvidenceItem[];
		whyItMatters?: string;
		principles?: string;
		recommendation?: ScientificRecommendation;
		options?: AskUserOption[];
		finalizesContract?: boolean;
	},
	decisions: Map<string, ScientificDecisionRecord>,
): void {
	const missing: string[] = [];
	if (!params.decisionId) missing.push("decisionId");
	if (!params.category) missing.push("category");
	if (!params.evidence?.length) missing.push("evidence");
	if (!params.whyItMatters?.trim()) missing.push("whyItMatters");
	if (!params.recommendation) missing.push("recommendation");
	if (params.category === "method" && !params.principles?.trim()) missing.push("principles");
	if (missing.length > 0) {
		throw new Error(`Scientific questions require structured context and a recommended answer. Missing: ${missing.join(", ")}`);
	}

	const dependsOn = params.dependsOn ?? [];
	if (dependsOn.includes(params.decisionId!)) throw new Error(`Decision ${params.decisionId} cannot depend on itself.`);
	const unresolvedDependencies = dependsOn.filter((id) => !decisions.has(id));
	if (unresolvedDependencies.length > 0) {
		throw new Error(`Resolve dependencies before asking ${params.decisionId}: ${unresolvedDependencies.join(", ")}`);
	}

	if (params.finalizesContract) {
		const missingBranches = Array.from(decisions.values())
			.filter((decision) => decision.category !== "confirmation")
			.map((decision) => decision.id)
			.filter((id) => !dependsOn.includes(id));
		if (missingBranches.length > 0) {
			throw new Error(`Final contract confirmation must depend on every prior decision. Missing: ${missingBranches.join(", ")}`);
		}
		if (!(params.options ?? []).some((option) => option.confirmsContract === true)) {
			throw new Error("Final contract confirmation requires an option with confirmsContract=true.");
		}
	}
}
