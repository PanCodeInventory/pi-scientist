import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../core/runner.js";
import { extractOutput, makeDetails } from "./shared.js";

export function registerLibrarianTool(pi: ExtensionAPI): void {
	const LIBRARIAN_SOURCES = StringEnum(["docs", "api", "web", "auto"] as const, {
		description: "Research source preference. Default: auto.",
		default: "auto",
	});

	{
		const tool = {
			name: "sci_librarian",
			label: "Sci Librarian",
			description: [
				"Run an independent retrieval agent for bioinformatics methods, package documentation, published protocols, and peer-reviewed literature.",
				"The librarian queries the tooluniverse-min skill (curated ~106-tool CLI whitelist) for specialized bioinformatics resources, Context7 for package docs,",
				"Web Reader for published methods, and pubmed_search for direct PubMed article discovery and retrieval.",
				"This is an optional research tool chosen by the main agent when external evidence would materially improve an answer, analysis design, or interpretation;",
				"it is not a mandatory stage of the Scientist workflow and does not replace sci_scout for inspecting local data.",
			].join(" "),
			promptSnippet: "Optionally retrieve bioinformatics methods, package documentation, or literature for TASK",
			promptGuidelines: [
				"Use sci_librarian on demand when current external methods, package documentation, protocols, or literature evidence would materially improve the answer, plan, or interpretation.",
				"Do not call sci_librarian automatically merely because a task is NEW, CONTINUE, complex, or approaching the planning stage; the main agent decides whether external retrieval adds value.",
				"Use sci_scout or built-in file tools for local data and project facts; sci_librarian is an external retrieval specialist, not a substitute for local inspection.",
				"If local scouting context is relevant, include its concise data summary (format, dimensions, organism) so retrieved methods match the dataset.",
				"When requesting literature review, include specific genes, pathways, phenotypes, or conditions so the librarian can build targeted PubMed queries.",
			],
			parameters: Type.Object({
				task: Type.String({ description: "What to research: methods, packages, statistical tests, or PubMed literature topics. If scout was already called, include data summary (format, dimensions, organism). For literature review, include specific genes, pathways, or conditions to query." }),
				query: Type.Optional(Type.String({ description: "Specific package or method to look up (e.g., 'scanpy', 'DESeq2', 'Wilcoxon test')" })),
				source: Type.Optional(LIBRARIAN_SOURCES),
			}),
			async execute(_toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
				const discovery = discoverScientists();
				let fullTask = `Research the following: ${params.task}`;
				if (params.query) fullTask += `\n\nFocus on package/method: ${params.query}`;
				if (params.source && params.source !== "auto") fullTask += `\n\nPreferred source: ${params.source}`;

				const result = await runAgent(ctx.cwd, discovery.agents, "librarian", fullTask, {
					signal,
					onUpdate: onUpdate ? (u: any) => onUpdate({
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
			renderCall(args: any, theme: any, _context: any) {
				const preview = (args.task as string)?.slice(0, 60) || "...";
				const source = args.source as string | undefined;
				let text = theme.fg("toolTitle", theme.bold("sci_librarian ")) +
					theme.fg("accent", "librarian");
				if (source && source !== "auto") {
					text += theme.fg("muted", ` [${source}]`);
				}
				text += `\n  ${theme.fg("dim", preview)}`;
				return new Text(text, 0, 0);
			},
			renderResult(result: any, { expanded }: any, theme: any, _context: any) {
				const details = result.details as AgentRenderItem | undefined;
				if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
				return renderAgentResult(details, !!expanded, theme);
			},
		};

		pi.registerTool(tool as any);
	}
}
