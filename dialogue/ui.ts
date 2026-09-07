// Interactive question UI for ask_user_question.
//
// Two render paths:
//   - showScientificDialog: a bottom-anchored bounded overlay for scientific
//     decisions — pinned question, scrollable context (recommendation first,
//     then principles and briefing), SelectList options, inline custom editor,
//     and a terminal bell on open so questions are hard to miss
//   - showFallbackDialog: pi-native select/input/editor fallback used in
//     non-TUI sessions or for administrative questions
// Plus withWorkingLoaderHidden, which hides pi's streaming spinner while the
// scientific overlay is open to avoid competing redraws and flicker in tmux.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { formatPlainQuestion, normalizeResolution } from "./contract.js";
import type { DialogSelection, QuestionParams } from "./types.js";

export async function showScientificDialog(
	params: QuestionParams,
	ctx: ExtensionContext,
	signal?: AbortSignal,
): Promise<DialogSelection | null> {
	const options = params.options ?? [];
	const allowCustom = options.length === 0 || params.allowCustom !== false;

	// Attention cue: BEL turns into a pane/dock alert in tmux and most terminals,
	// drawing the user back when the question arrives while they are looking
	// elsewhere. Best-effort only.
	try {
		process.stdout.write("\x07");
	} catch {
		/* ignore */
	}

	return await ctx.ui.custom<DialogSelection | null>((tui, theme, keybindings, close) => {
		let settled = false;
		const done = (value: DialogSelection | null) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", abort);
			close(value);
		};
		const abort = () => done(null);
		if (signal?.aborted) queueMicrotask(abort);
		else signal?.addEventListener("abort", abort, { once: true });
		let editMode = options.length === 0;
		let contextScrollTop = 0;
		let contextPageSize = 1;
		let contextContentHeight = 0;
		let validationMessage = "";
		let focused = false;
		let cachedWidth: number | undefined;
		let cachedHeight: number | undefined;
		let cachedLines: string[] | undefined;

		const customItemValue = "__scientist_custom_answer__";
		const selectItems: SelectItem[] = options.map((option, index) => {
			const recommended = option.recommended || (option.value ?? option.label) === params.recommendation?.value;
			return {
				value: `option:${index}`,
				label: `${index + 1}. ${option.label}${recommended ? " [推荐]" : ""}`,
				description: option.description,
			};
		});
		if (allowCustom) {
			selectItems.push({
				value: customItemValue,
				label: `${options.length + 1}. 自定义答案`,
				description: "输入未包含在预设选项中的答案",
			});
		}
		const maxVisibleOptions = Math.min(
			selectItems.length,
			Math.max(2, Math.min(6, Math.floor(tui.terminal.rows * 0.2))),
		);
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
		const selectList = selectItems.length > 0
			? new SelectList(selectItems, maxVisibleOptions, editorTheme.selectList, {
				minPrimaryColumnWidth: 18,
				maxPrimaryColumnWidth: 36,
			})
			: undefined;

		function refresh(): void {
			cachedWidth = undefined;
			cachedHeight = undefined;
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
			});
		}
		editor.onSubmit = submitCustom;

		function enterEditMode(): void {
			editMode = true;
			validationMessage = "";
			editor.focused = focused;
			refresh();
		}

		function submitOption(index: number): void {
			const option = options[index];
			if (!option) return;
			done({
				answer: option.label,
				value: option.value ?? option.label,
				wasCustom: false,
				index: index + 1,
				resolution: normalizeResolution(option, params.recommendation),
			});
		}

		if (selectList) {
			selectList.onSelect = (item) => {
				if (item.value === customItemValue) {
					enterEditMode();
					return;
				}
				const index = Number.parseInt(item.value.slice("option:".length), 10);
				if (Number.isInteger(index)) submitOption(index);
			};
			selectList.onCancel = () => done(null);
		}

		function scrollContext(direction: -1 | 1): void {
			const maxScrollTop = Math.max(0, contextContentHeight - contextPageSize);
			const pageStep = Math.max(1, contextPageSize - 1);
			const next = Math.max(0, Math.min(maxScrollTop, contextScrollTop + direction * pageStep));
			if (next === contextScrollTop) return;
			contextScrollTop = next;
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

			if (matchesKey(data, Key.pageUp)) {
				scrollContext(-1);
				return;
			}
			if (matchesKey(data, Key.pageDown)) {
				scrollContext(1);
				return;
			}
			selectList?.handleInput(data);
			refresh();
		}

		function render(width: number): string[] {
			const terminalHeight = Math.max(1, tui.terminal.rows);
			if (cachedLines && cachedWidth === width && cachedHeight === terminalHeight) return cachedLines;

			const renderWidth = Math.max(1, width);
			// Bounded card occupying the lower ~85% of the terminal, bottom-anchored:
			// the question and options sit where pi's editor and streaming output
			// live, and the tail of the transcript stays visible above the card.
			// A fullscreen takeover anchored at the top reads like another block of
			// transcript text and is easy to miss.
			const maxDialogHeight = Math.min(
				terminalHeight,
				Math.max(16, Math.floor(terminalHeight * 0.85)),
			);

			function addWrapped(target: string[], text: string, prefix = ""): void {
				const prefixWidth = visibleWidth(prefix);
				if (prefixWidth >= renderWidth) {
					target.push(...wrapTextWithAnsi(prefix + text, renderWidth));
					return;
				}
				const contentWidth = Math.max(1, renderWidth - prefixWidth);
				const wrapped = wrapTextWithAnsi(text, contentWidth);
				const continuation = " ".repeat(prefixWidth);
				for (let i = 0; i < wrapped.length; i++) {
					target.push(`${i === 0 ? prefix : continuation}${wrapped[i]}`);
				}
			}

			function rule(title: string, color: (text: string) => string): string {
				const label = ` ${title.trim()} `;
				const labelWidth = visibleWidth(label);
				if (labelWidth >= renderWidth) {
					return color(truncateToWidth(label.trim(), renderWidth, ""));
				}
				return color(`─${label}${"─".repeat(Math.max(0, renderWidth - labelWidth - 1))}`);
			}

			// Pinned header: the question itself never scrolls out of view.
			const headerLines: string[] = [];
			addWrapped(headerLines, theme.fg("accent", theme.bold(params.question.trim())), theme.fg("accent", "❯ "));
			headerLines.push("");

			// Scrollable context: the recommended answer comes first so it is visible
			// without scrolling; principles and briefing follow as supporting depth.
			const contextLines: string[] = [];
			if (params.recommendation) {
				addWrapped(contextLines, theme.fg("success", theme.bold("推荐")), " ");
				addWrapped(contextLines, theme.fg("text", params.recommendation.label ?? params.recommendation.value), "   ");
				addWrapped(contextLines, theme.fg("muted", params.recommendation.rationale), "   ");
				if (params.recommendation.conditions) {
					addWrapped(contextLines, theme.fg("dim", `适用条件：${params.recommendation.conditions}`), "   ");
				}
			}

			if (params.principles?.trim()) {
				contextLines.push("");
				addWrapped(contextLines, theme.fg("muted", "原理"), " ");
				addWrapped(contextLines, theme.fg("text", params.principles.trim()), "   ");
			}

			if (params.briefing?.trim()) {
				contextLines.push("");
				addWrapped(contextLines, theme.fg("muted", "背景"), " ");
				addWrapped(contextLines, theme.fg("text", params.briefing.trim()), "   ");
			}

			const actionLines: string[] = [""];
			if (editMode) {
				addWrapped(actionLines, theme.fg("muted", "你的答案："), " ");
				const editorPrefix = renderWidth > 1 ? " " : "";
				const editorWidth = Math.max(1, renderWidth - visibleWidth(editorPrefix));
				for (const line of editor.render(editorWidth)) actionLines.push(`${editorPrefix}${line}`);
				if (validationMessage) addWrapped(actionLines, theme.fg("warning", validationMessage), " ");
			} else if (selectList) {
				addWrapped(actionLines, theme.fg("muted", "请选择"), " ");
				actionLines.push(...selectList.render(renderWidth));
			}

			const help = editMode
				? "Enter 提交 · Shift+Enter 换行 · Esc 返回/取消"
				: "↑↓ 选择 · Enter 确认 · PgUp/PgDn 滚动详情 · Esc 取消";

			const contextViewportHeight = Math.max(0, maxDialogHeight - actionLines.length - headerLines.length - 2);
			contextContentHeight = contextLines.length;
			let visibleContext: string[] = [];
			if (contextViewportHeight > 0) {
				const needsScroll = contextLines.length > contextViewportHeight;
				contextPageSize = Math.max(1, contextViewportHeight - (needsScroll ? 1 : 0));
				const maxScrollTop = Math.max(0, contextLines.length - contextPageSize);
				contextScrollTop = Math.max(0, Math.min(contextScrollTop, maxScrollTop));
				visibleContext = contextLines.slice(contextScrollTop, contextScrollTop + contextPageSize);
				if (needsScroll) {
					const first = contextScrollTop + 1;
					const last = Math.min(contextLines.length, contextScrollTop + contextPageSize);
					const up = contextScrollTop > 0 ? "↑" : " ";
					const down = last < contextLines.length ? "↓" : " ";
					visibleContext.push(theme.fg("dim", truncateToWidth(` ${up}${down} 详情 ${first}-${last}/${contextLines.length} · PgUp/PgDn`, renderWidth, "")));
				}
			} else {
				contextPageSize = 1;
				contextScrollTop = 0;
			}

			const lines = [
				rule("需要你的决定", (text) => theme.fg("accent", theme.bold(text))),
				...headerLines,
				...visibleContext,
				...actionLines,
				rule(help, (text) => theme.fg("dim", text)),
			];
			cachedWidth = width;
			cachedHeight = terminalHeight;
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
				cachedHeight = undefined;
				cachedLines = undefined;
			},
			render,
			invalidate: () => {
				cachedWidth = undefined;
				cachedHeight = undefined;
				cachedLines = undefined;
				editor.invalidate();
				selectList?.invalidate();
			},
			handleInput,
			dispose: () => signal?.removeEventListener("abort", abort),
		};
	}, {
		overlay: true,
		overlayOptions: {
			// Bottom anchor: interaction happens in the lower screen area where
			// pi's editor lives, not at the top edge where it is easily overlooked.
			anchor: "bottom-left",
			width: "100%",
			maxHeight: "100%",
			margin: 0,
		},
	});
}

export async function showFallbackDialog(
	params: QuestionParams,
	ctx: ExtensionContext,
	signal?: AbortSignal,
): Promise<DialogSelection | null> {
	const options = params.options ?? [];
	const allowCustom = options.length === 0 || params.allowCustom !== false;
	const title = formatPlainQuestion(params);

	async function askFreeText(shortTitle = false): Promise<string | undefined> {
		signal?.throwIfAborted();
		const prompt = shortTitle ? params.question : title;
		return params.multiline
			? await ctx.ui.editor(prompt, params.placeholder ?? "")
			: await ctx.ui.input(prompt, params.placeholder ?? "", { signal });
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
	const choice = await ctx.ui.select(title, choices, { signal });
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
