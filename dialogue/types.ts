/** Question presentation and persisted answers, not a workflow state machine. */
export const ASK_TOOL_NAME = "ask_user_question";
export type ResolutionKind = "user_choice" | "accepted_recommendation" | "delegated" | "deferred";

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
}

export interface QuestionParams {
	question: string;
	briefing?: string;
	principles?: string;
	recommendation?: ScientificRecommendation;
	options?: AskUserOption[];
	allowCustom?: boolean;
	multiline?: boolean;
	placeholder?: string;
}

export interface DialogSelection {
	answer: string;
	value: string;
	wasCustom: boolean;
	index?: number;
	resolution: ResolutionKind;
}

export interface AskUserQuestionDetails {
	question: string;
	answer: string | null;
	value: string | null;
	cancelled: boolean;
	wasCustom?: boolean;
	selectedIndex?: number;
	resolution?: ResolutionKind;
}
