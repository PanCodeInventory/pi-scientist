// Interactive question UI for ask_user_question.
//
// Two render paths:
//   - showScientificDialog: a custom TUI for scientific decisions (question
//     first, recommendation, grouped evidence, inline editor for custom answers)
//   - showFallbackDialog: pi-native select/input/editor fallback used in
//     non-TUI sessions or for administrative questions
// Plus withWorkingLoaderHidden, which hides pi's streaming spinner while the
// tall scientific dialog is on screen to avoid full-viewport flicker in tmux.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { formatPlainQuestion, normalizeResolution } from "./contract.js";
import {
	CATEGORY_LABELS,
	EVIDENCE_SOURCE_LABELS,
	groupEvidence,
	type AskUserOption,
	type AskUserPurpose,
	type DecisionCategory,
	type DialogSelection,
	type EvidenceItem,
	type ScientificRecommendation,
} from "./types.js";

export async function showScientificDialog(
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
		let cachedWidth: number | undefined;
		let cachedLines: string[] | undefined;

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
			cachedWidth = undefined;
			cachedLines = undefined;
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
			if (cachedLines && cachedWidth === width) return cachedLines;

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
			cachedWidth = width;
			cachedLines = lines;
			return lines;
		}

		return {
			get focused() {
				return focused;
			},
			set focused(value: boolean) {
				if (focused === value) return;
				focused = value;
				editor.focused = value && editMode;
				cachedWidth = undefined;
				cachedLines = undefined;
			},
			render,
			invalidate: () => {
				cachedWidth = undefined;
				cachedLines = undefined;
				editor.invalidate();
			},
			handleInput,
		};
	});
}

export async function showFallbackDialog(
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

export async function withWorkingLoaderHidden<T>(ctx: ExtensionContext, operation: () => Promise<T>): Promise<T> {
	if (ctx.mode !== "tui") return await operation();

	// A tool waits while Pi is still streaming, so its 80 ms working spinner keeps
	// rendering. With this tall dialog the spinner can sit above the viewport,
	// forcing pi-tui into repeated full redraws that visibly flicker inside tmux.
	ctx.ui.setWorkingVisible(false);
	try {
		return await operation();
	} finally {
		ctx.ui.setWorkingVisible(true);
	}
}
