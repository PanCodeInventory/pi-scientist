import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../core/runner.js";
import { extractOutput, makeDetails } from "./shared.js";

export function registerScoutTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sci_scout",
		label: "Sci Scout",
		description: [
			"Dispatch a data-aware scout agent to inspect bioinformatics data files and return structured findings.",
			"The scout identifies data formats (h5ad, csv, bam, vcf, etc.), reports dimensions, metadata,",
			"experimental design, and data quality metrics.",
			"Use this BEFORE planning any analysis — never start without understanding the data.",
			"Set thoroughness: 'quick' for format check, 'medium' (default) for dimension/metadata scan,",
			"'thorough' for full QC metrics and experimental design assessment.",
		].join(" "),
		promptSnippet: "Dispatch data-aware scout to inspect bioinformatics data for TASK",
		promptGuidelines: [
			"MUST call sci_scout BEFORE any analysis planning to inspect data files. This is REQUIRED — never skip scouting.",
			"For every analysis, call scout first. Even if you think you know the data format, scout anyway — you need fresh context.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "What to inspect: data files, formats, dimensions, metadata, experimental design" }),
			thoroughness: Type.Optional(
				StringEnum(["quick", "medium", "thorough"] as const, {
					description: "How deeply to inspect. Default: medium.",
					default: "medium",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const result = await runAgent(ctx.cwd, discovery.agents, "scout", params.task, {
				signal,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			const output = extractOutput(result);

			return {
				content: [{ type: "text", text: output || "(no output)" }],
				details: makeDetails(result, output),
				isError: result.exitCode !== 0,
			};
		},

		renderCall(args, theme, _context) {
			const preview = (args.task as string)?.slice(0, 60) || "...";
			const thoroughness = args.thoroughness as string | undefined;
			let text = theme.fg("toolTitle", theme.bold("sci_scout ")) +
				theme.fg("accent", "scout");
			if (thoroughness && thoroughness !== "medium") {
				text += theme.fg("muted", ` [${thoroughness}]`);
			}
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as AgentRenderItem | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			return renderAgentResult(details, !!expanded, theme);
		},
	});
}
