// Types, constants, and display labels for the scientific dialogue system.
//
// This module is pure data/types (no pi runtime dependency) so it can be
// imported freely by schema, contract, ui, and the registration entry point
// without creating cycles.

export const ASK_TOOL_NAME = "ask_user_question";
export const STATE_VERSION = 1;
export const MAX_CONTRACT_CHARS = 16_000;

export const DECISION_CATEGORIES = [
	"goal",
	"design",
	"contrast",
	"covariate",
	"method",
	"interpretation",
	"output",
	"confirmation",
	"other",
] as const;

export type AskUserPurpose = "scientific" | "administrative";
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];
export type EvidenceSource = "scout" | "librarian" | "data" | "code" | "plan" | "literature" | "user" | "inference";
export type ResolutionKind = "user_choice" | "accepted_recommendation" | "delegated" | "deferred";

export interface EvidenceItem {
	source: EvidenceSource;
	claim: string;
	reference?: string;
}

export interface ScientificRecommendation {
	value: string;
	label?: string;
	rationale: string;
	conditions?: string;
}

export interface AskUserOption {
	label: string;
	value?: string;
	description?: string;
	recommended?: boolean;
	resolution?: ResolutionKind;
	confirmsContract?: boolean;
}

export interface ScientificDecisionRecord {
	id: string;
	category: DecisionCategory;
	question: string;
	dependsOn: string[];
	answer: string;
	value: string;
	resolution: ResolutionKind;
	evidence: EvidenceItem[];
	recommendation: ScientificRecommendation;
	whyItMatters: string;
	updatedAt: string;
}

export interface ScientificContractState {
	version: number;
	decisions: ScientificDecisionRecord[];
	confirmed: boolean;
	confirmedAt?: string;
}

export interface ScientificContractEvent {
	version: number;
	decision?: ScientificDecisionRecord;
	confirmed: boolean;
	confirmedAt?: string;
}

export interface AskUserQuestionDetails {
	purpose: AskUserPurpose;
	decisionId?: string;
	answer: string | null;
	value: string | null;
	cancelled: boolean;
	wasCustom?: boolean;
	selectedIndex?: number;
	resolution?: ResolutionKind;
	stateEvent: ScientificContractEvent;
	decisionCount: number;
}

export interface DialogSelection {
	answer: string;
	value: string;
	wasCustom: boolean;
	index?: number;
	resolution: ResolutionKind;
	confirmsContract: boolean;
}

export const CATEGORY_LABELS: Record<DecisionCategory, string> = {
	goal: "生物学问题与目标",
	design: "实验设计与统计单位",
	contrast: "分组与比较",
	covariate: "协变量、批次与假设",
	method: "分析方法",
	interpretation: "证据标准与解释边界",
	output: "输出与交付",
	confirmation: "共同科学约定确认",
	other: "其他科学决策",
};

export const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
	user_choice: "用户选择",
	accepted_recommendation: "接受推荐",
	delegated: "委托 Agent 决定",
	deferred: "有意延后",
};

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
	data: "数据",
	code: "代码",
	plan: "计划",
	scout: "勘察",
	librarian: "文献检索",
	literature: "文献",
	user: "用户",
	inference: "推断",
};

// Stable display order so evidence from the same provenance clusters together.
export const EVIDENCE_SOURCE_ORDER: EvidenceSource[] = [
	"data", "code", "plan", "scout", "librarian", "literature", "user", "inference",
];

export function groupEvidence(evidence: EvidenceItem[]): Array<{ source: EvidenceSource; items: EvidenceItem[] }> {
	const groups = new Map<EvidenceSource, EvidenceItem[]>();
	for (const item of evidence) {
		const arr = groups.get(item.source);
		if (arr) arr.push(item);
		else groups.set(item.source, [item]);
	}
	return EVIDENCE_SOURCE_ORDER
		.filter((source) => groups.has(source))
		.map((source) => ({ source, items: groups.get(source)! }));
}
