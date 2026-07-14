import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	Editor,
	type EditorTheme,
	Text,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

const ASK_TOOL_NAME = "ask_user_question";
const STATE_VERSION = 1;
const MAX_CONTRACT_CHARS = 16_000;

const DECISION_CATEGORIES = [
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

type AskUserPurpose = "scientific" | "administrative";
type DecisionCategory = (typeof DECISION_CATEGORIES)[number];
type EvidenceSource = "scout" | "librarian" | "data" | "code" | "plan" | "literature" | "user" | "inference";
type ResolutionKind = "user_choice" | "accepted_recommendation" | "delegated" | "deferred";

interface EvidenceItem {
	source: EvidenceSource;
	claim: string;
	reference?: string;
}

interface ScientificRecommendation {
	value: string;
	label?: string;
	rationale: string;
	conditions?: string;
}

interface AskUserOption {
	label: string;
	value?: string;
	description?: string;
	recommended?: boolean;
	resolution?: ResolutionKind;
	confirmsContract?: boolean;
}

interface ScientificDecisionRecord {
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

interface ScientificContractState {
	version: number;
	decisions: ScientificDecisionRecord[];
	confirmed: boolean;
	confirmedAt?: string;
}

interface ScientificContractEvent {
	version: number;
	decision?: ScientificDecisionRecord;
	confirmed: boolean;
	confirmedAt?: string;
}

interface AskUserQuestionDetails {
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

interface DialogSelection {
	answer: string;
	value: string;
	wasCustom: boolean;
	index?: number;
	resolution: ResolutionKind;
	confirmsContract: boolean;
}

const CATEGORY_LABELS: Record<DecisionCategory, string> = {
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

const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
	user_choice: "用户选择",
	accepted_recommendation: "接受推荐",
	delegated: "委托 Agent 决定",
	deferred: "有意延后",
};

const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
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
const EVIDENCE_SOURCE_ORDER: EvidenceSource[] = [
	"data", "code", "plan", "scout", "librarian", "literature", "user", "inference",
];

function groupEvidence(evidence: EvidenceItem[]): Array<{ source: EvidenceSource; items: EvidenceItem[] }> {
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
		description: "Structured evidence supporting the question and recommendation. Required and non-empty for scientific questions. Keep it concise: 2-5 decisive, deduplicated items grouped by provenance.",
		minItems: 1,
		maxItems: 12,
	})),
	whyItMatters: Type.Optional(Type.String({
		description: "How this choice changes biological interpretation, statistical validity, or downstream work. Required for scientific questions.",
		maxLength: 1_500,
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

function snapshotState(
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

function isContractEvent(value: unknown): value is ScientificContractEvent {
	if (!value || typeof value !== "object") return false;
	const event = value as Partial<ScientificContractEvent>;
	return event.version === STATE_VERSION && typeof event.confirmed === "boolean";
}

function makeStateEvent(
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

function generateScientificContract(state: ScientificContractState): string {
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

function formatEvidenceGrouped(evidence: EvidenceItem[]): string {
	return groupEvidence(evidence)
		.map(({ source, items }) => {
			const body = items
				.map((item) => item.reference ? `  • ${item.claim}（${item.reference}）` : `  • ${item.claim}`)
				.join("\n");
			return `${EVIDENCE_SOURCE_LABELS[source]}\n${body}`;
		})
		.join("\n");
}

function formatPlainQuestion(params: {
	question: string;
	briefing?: string;
	evidence?: EvidenceItem[];
	whyItMatters?: string;
	recommendation?: ScientificRecommendation;
}): string {
	const sections: string[] = [];
	// Lead with the decision itself so the question is unambiguous.
	sections.push(`需要你决定\n${params.question.trim()}`);
	if (params.recommendation) {
		const recommendation = params.recommendation;
		const conditions = recommendation.conditions ? `\n适用条件：${recommendation.conditions}` : "";
		sections.push(`推荐\n${recommendation.label ?? recommendation.value}：${recommendation.rationale}${conditions}`);
	}
	if (params.whyItMatters?.trim()) sections.push(`为什么重要\n${params.whyItMatters.trim()}`);
	if (params.briefing?.trim()) sections.push(`背景\n${params.briefing.trim()}`);
	if (params.evidence?.length) sections.push(`证据\n${formatEvidenceGrouped(params.evidence)}`);
	return sections.join("\n\n");
}

function normalizeResolution(option: AskUserOption, recommendation?: ScientificRecommendation): ResolutionKind {
	if (option.resolution) return option.resolution;
	const value = option.value ?? option.label;
	if (option.recommended || (recommendation && value === recommendation.value)) return "accepted_recommendation";
	return "user_choice";
}

function validateScientificQuestion(
	params: {
		decisionId?: string;
		category?: DecisionCategory;
		dependsOn?: string[];
		evidence?: EvidenceItem[];
		whyItMatters?: string;
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

async function showScientificDialog(
	params: {
		question: string;
		decisionId: string;
		category: DecisionCategory;
		briefing?: string;
		evidence: EvidenceItem[];
		whyItMatters: string;
		recommendation: ScientificRecommendation;
		options?: AskUserOption[];
		allowCustom?: boolean;
		multiline?: boolean;
		placeholder?: string;
	},
	ctx: ExtensionContext,
): Promise<DialogSelection | null> {
	const options = params.options ?? [];
	const allowCustom = options.length === 0 || params.allowCustom !== false;

	return await ctx.ui.custom<DialogSelection | null>((tui, theme, keybindings, done) => {
		let selectedIndex = 0;
		let editMode = options.length === 0;
		let evidenceExpanded = params.evidence.length <= 3;
		let validationMessage = "";
		let focused = false;

		const customOptionIndex = options.length;
		const displayOptionCount = options.length + (allowCustom ? 1 : 0);
		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const editor = new Editor(tui, editorTheme);
		editor.setText(params.placeholder ?? "");

		function refresh(): void {
			tui.requestRender();
		}

		function submitCustom(value: string): void {
			const trimmed = value.trim();
			if (!trimmed) {
				validationMessage = "答案不能为空，请输入内容后再提交。";
				refresh();
				return;
			}
			done({
				answer: trimmed,
				value: trimmed,
				wasCustom: true,
				resolution: "user_choice",
				confirmsContract: false,
			});
		}
		editor.onSubmit = submitCustom;

		function enterEditMode(): void {
			editMode = true;
			validationMessage = "";
			editor.focused = focused;
			refresh();
		}

		function handleInput(data: string): void {
			if (editMode) {
				if (keybindings.matches(data, "tui.select.cancel")) {
					if (options.length > 0) {
						editMode = false;
						editor.focused = false;
						validationMessage = "";
						refresh();
					} else {
						done(null);
					}
					return;
				}
				editor.handleInput(data);
				validationMessage = "";
				refresh();
				return;
			}

			if (data === "e" || data === "E") {
				evidenceExpanded = !evidenceExpanded;
				refresh();
				return;
			}
			if (keybindings.matches(data, "tui.select.up")) {
				selectedIndex = Math.max(0, selectedIndex - 1);
				refresh();
				return;
			}
			if (keybindings.matches(data, "tui.select.down")) {
				selectedIndex = Math.min(Math.max(0, displayOptionCount - 1), selectedIndex + 1);
				refresh();
				return;
			}
			if (keybindings.matches(data, "tui.select.confirm")) {
				if (allowCustom && selectedIndex === customOptionIndex) {
					enterEditMode();
					return;
				}
				const option = options[selectedIndex];
				if (!option) return;
				done({
					answer: option.label,
					value: option.value ?? option.label,
					wasCustom: false,
					index: selectedIndex + 1,
					resolution: normalizeResolution(option, params.recommendation),
					confirmsContract: option.confirmsContract === true,
				});
				return;
			}
			if (keybindings.matches(data, "tui.select.cancel")) done(null);
		}

		function render(width: number): string[] {
			const lines: string[] = [];
			const renderWidth = Math.max(1, width);

			function addWrapped(text: string, prefix = ""): void {
				const prefixWidth = visibleWidth(prefix);
				if (prefixWidth >= renderWidth) {
					lines.push(...wrapTextWithAnsi(prefix + text, renderWidth));
					return;
				}
				const contentWidth = Math.max(1, renderWidth - prefixWidth);
				const wrapped = wrapTextWithAnsi(text, contentWidth);
				const continuation = " ".repeat(prefixWidth);
				for (let i = 0; i < wrapped.length; i++) lines.push(`${i === 0 ? prefix : continuation}${wrapped[i]}`);
			}

			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			addWrapped(theme.fg("dim", `科学决策 · ${CATEGORY_LABELS[params.category]} · ${params.decisionId}`), " ");

			// 1) The question leads, rendered prominently so it is never ambiguous.
			lines.push("");
			addWrapped(theme.fg("accent", theme.bold(params.question.trim())), theme.fg("accent", "❯ "));

			// 2) The actionable recommendation comes next.
			lines.push("");
			addWrapped(theme.fg("success", theme.bold("推荐")), " ");
			addWrapped(theme.fg("text", params.recommendation.label ?? params.recommendation.value), "   ");
			addWrapped(theme.fg("muted", params.recommendation.rationale), "   ");
			if (params.recommendation.conditions) addWrapped(theme.fg("dim", `适用条件：${params.recommendation.conditions}`), "   ");

			// 3) Why it matters.
			lines.push("");
			addWrapped(theme.fg("muted", "为什么重要"), " ");
			addWrapped(theme.fg("text", params.whyItMatters), "   ");

			// 4) Supporting context, kept collapsed and grouped by provenance for readability.
			if (params.briefing?.trim()) {
				lines.push("");
				addWrapped(theme.fg("muted", "背景"), " ");
				addWrapped(theme.fg("text", params.briefing.trim()), "   ");
			}

			lines.push("");
			const totalEvidence = params.evidence.length;
			addWrapped(theme.fg("muted", `证据（${totalEvidence}）`), " ");
			const limit = evidenceExpanded ? Number.POSITIVE_INFINITY : 3;
			let shown = 0;
			for (const group of groupEvidence(params.evidence)) {
				if (shown >= limit) break;
				addWrapped(theme.fg("toolTitle", EVIDENCE_SOURCE_LABELS[group.source]), "   ");
				for (const item of group.items) {
					if (shown >= limit) break;
					const body = item.reference ? `${item.claim}（${item.reference}）` : item.claim;
					addWrapped(theme.fg("text", body), theme.fg("accent", "     • "));
					shown++;
				}
			}
			if (!evidenceExpanded && totalEvidence > shown) addWrapped(theme.fg("dim", `还有 ${totalEvidence - shown} 条证据 · 按 E 展开`), "   ");
			else if (evidenceExpanded && totalEvidence > 3) addWrapped(theme.fg("dim", "按 E 收起"), "   ");

			lines.push("");
			addWrapped(theme.fg("muted", "请选择"), " ");

			for (let i = 0; i < options.length; i++) {
				const option = options[i];
				const selected = !editMode && i === selectedIndex;
				const recommended = option.recommended || (option.value ?? option.label) === params.recommendation.value;
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				const badge = recommended ? theme.fg("success", " [推荐]") : "";
				addWrapped(theme.fg(selected ? "accent" : "text", `${i + 1}. ${option.label}`) + badge, prefix);
				if (option.description) addWrapped(theme.fg("muted", option.description), "     ");
			}

			if (allowCustom) {
				const selected = !editMode && selectedIndex === customOptionIndex;
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				addWrapped(theme.fg(selected || editMode ? "accent" : "text", `${customOptionIndex + 1}. 自定义答案${editMode ? " ✎" : ""}`), prefix);
			}

			if (editMode) {
				lines.push("");
				addWrapped(theme.fg("muted", "你的答案："), " ");
				const editorPrefix = renderWidth > 1 ? " " : "";
				const editorWidth = Math.max(1, renderWidth - visibleWidth(editorPrefix));
				for (const line of editor.render(editorWidth)) lines.push(`${editorPrefix}${line}`);
				if (validationMessage) addWrapped(theme.fg("warning", validationMessage), " ");
			}

			lines.push("");
			const help = editMode
				? "Enter 提交 · Shift+Enter 换行 · Esc 返回/取消"
				: "↑↓ 选择 · Enter 确认 · E 展开证据 · Esc 取消";
			addWrapped(theme.fg("dim", help), " ");
			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			return lines;
		}

		return {
			get focused() {
				return focused;
			},
			set focused(value: boolean) {
				focused = value;
				editor.focused = value && editMode;
			},
			render,
			invalidate: () => {},
			handleInput,
		};
	});
}

async function showFallbackDialog(
	params: {
		question: string;
		purpose: AskUserPurpose;
		briefing?: string;
		evidence?: EvidenceItem[];
		whyItMatters?: string;
		recommendation?: ScientificRecommendation;
		options?: AskUserOption[];
		allowCustom?: boolean;
		multiline?: boolean;
		placeholder?: string;
	},
	ctx: ExtensionContext,
): Promise<DialogSelection | null> {
	const options = params.options ?? [];
	const allowCustom = options.length === 0 || params.allowCustom !== false;
	const title = params.purpose === "administrative"
		? params.question
		: formatPlainQuestion(params);

	async function askFreeText(shortTitle = false): Promise<string | undefined> {
		const prompt = shortTitle ? params.question : title;
		return params.multiline
			? await ctx.ui.editor(prompt, params.placeholder ?? "")
			: await ctx.ui.input(prompt, params.placeholder ?? "");
	}

	if (options.length === 0) {
		while (true) {
			const typed = await askFreeText();
			if (typed === undefined) return null;
			if (typed.trim()) {
				return {
					answer: typed.trim(),
					value: typed.trim(),
					wasCustom: true,
					resolution: "user_choice",
					confirmsContract: false,
				};
			}
			ctx.ui.notify("答案不能为空", "warning");
		}
	}

	const labels = options.map((option, index) => {
		const recommended = option.recommended || (option.value ?? option.label) === params.recommendation?.value;
		const base = `${index + 1}. ${option.label}${recommended ? " [推荐]" : ""}`;
		return option.description ? `${base} — ${option.description}` : base;
	});
	const customLabel = "自定义答案...";
	const choices = allowCustom ? [...labels, customLabel] : labels;
	const choice = await ctx.ui.select(title, choices);
	if (!choice) return null;
	const index = choices.indexOf(choice);
	if (index >= 0 && index < options.length) {
		const option = options[index];
		return {
			answer: option.label,
			value: option.value ?? option.label,
			wasCustom: false,
			index: index + 1,
			resolution: normalizeResolution(option, params.recommendation),
			confirmsContract: option.confirmsContract === true,
		};
	}

	while (true) {
		const typed = await askFreeText(true);
		if (typed === undefined) return null;
		if (typed.trim()) {
			return {
				answer: typed.trim(),
				value: typed.trim(),
				wasCustom: true,
				resolution: "user_choice",
				confirmsContract: false,
			};
		}
		ctx.ui.notify("答案不能为空", "warning");
	}
}

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
			"Inspect files/code/docs/literature instead of asking discoverable factual questions.",
			"Call this tool at most once per assistant turn; after the answer, explain its consequence, prune the decision tree, then ask the next dependency in a new turn.",
			"Decision state persists in tool-result details across reloads and branches, and each scientific answer returns an automatically generated Shared Scientific Contract.",
		].join(" "),
		promptSnippet: "Resolve one evidence-grounded scientific decision branch with the user",
		executionMode: "sequential",
		promptGuidelines: [
			"Call ask_user_question at most ONCE in each assistant response. Never emit sibling ask_user_question calls; later questions must be generated only after reading the prior answer.",
			"Before ask_user_question, inspect files, code, plans, documentation, or literature when they can answer the candidate question. Ask only for user intent, unavailable domain knowledge, value judgments, or genuine choices.",
			"For every scientific call, provide decisionId, category, resolved dependsOn IDs, structured evidence with provenance, whyItMatters, and recommendation {value, rationale, conditions}. Missing fields are rejected.",
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
					recommendation,
					options,
					finalizesContract: params.finalizesContract,
				}, decisions);
			}

			const result = purpose === "scientific" && ctx.mode === "tui"
				? await showScientificDialog({
					question: params.question,
					decisionId: params.decisionId!,
					category: params.category as DecisionCategory,
					briefing: params.briefing,
					evidence,
					whyItMatters: params.whyItMatters!,
					recommendation: recommendation!,
					options,
					allowCustom: params.allowCustom,
					multiline: params.multiline,
					placeholder: params.placeholder,
				}, ctx)
				: await showFallbackDialog({
					question: params.question,
					purpose,
					briefing: params.briefing,
					evidence,
					whyItMatters: params.whyItMatters,
					recommendation,
					options,
					allowCustom: params.allowCustom,
					multiline: params.multiline,
					placeholder: params.placeholder,
				}, ctx);

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
