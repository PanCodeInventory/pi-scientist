import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../core/runner.js";
import { agentToolResult } from "./shared.js";

export function registerScoutTool(pi: ExtensionAPI, run = runAgent): void {
	pi.registerTool({
		name: "sci_scout",
		label: "Sci Scout",
		description: [
			"Dispatch a data-aware scout agent to inspect bioinformatics data files and return structured findings.",
			"The scout identifies data formats (h5ad, csv, bam, vcf, etc.), reports dimensions, metadata,",
			"experimental design, and data quality metrics.",
			"Optional: use when a separate inspection saves context; direct inspection by the main agent is equally valid. Output bounded to 50KB/2000 lines with a full-text path when truncated.",
			"Set thoroughness: 'quick' for format check, 'medium' (default) for dimension/metadata scan,",
			"'thorough' for full QC metrics and experimental design assessment.",
		].join(" "),
		promptSnippet: "Dispatch data-aware scout to inspect bioinformatics data for TASK",
		promptGuidelines: [
			"Use sci_scout only for an independent inspection with a concrete scope; reuse existing findings rather than scouting repeatedly.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "What to inspect: data files, formats, dimensions, metadata, experimental design", minLength: 1 }),
			timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600, description: "Agent runtime limit; default 600 seconds" })),
			thoroughness: Type.Optional(
				StringEnum(["quick", "medium", "thorough"] as const, {
					description: "How deeply to inspect. Default: medium.",
					default: "medium",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const discovery = discoverScientists();
			const task = `Inspection depth: ${params.thoroughness ?? "medium"}.\n${params.task}`;
			const result = await run(ctx.cwd, discovery.agents, "scout", task, {
				signal, timeoutSeconds: params.timeoutSeconds,
				onUpdate: onUpdate ? (u) => onUpdate({
					content: [{ type: "text", text: u.output }],
					details: u.details as AgentRunDetails,
				}) : undefined,
			});

			return agentToolResult(result);
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
