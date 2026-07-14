import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../agents.js";
import { runAgent, renderAgentResult, type AgentRunDetails, type AgentRenderItem } from "../runner.js";
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
				"Dispatch a librarian agent to research bioinformatics methods, packages, published protocols, and PubMed literature.",
				"The librarian queries the tooluniverse-min skill (curated ~106-tool CLI whitelist) for specialized bioinformatics tools, Context7 for package docs,",
				"Web Reader for published methods, and pubmed_search for direct PubMed database article discovery and retrieval.",
				"Use this BEFORE planning when the analysis involves choosing methods, statistical tests, or packages.",
				"Use this AFTER analysis for literature review, gene-disease validation, pathway evidence, and result interpretation.",
				"Scout inspects LOCAL data; Librarian researches EXTERNAL methods and literature. Use both for full context.",
			].join(" "),
			promptSnippet: "Dispatch librarian to research bioinformatics methods or PubMed literature for TASK",
			promptGuidelines: [
				"MUST call sci_librarian BEFORE planning when the analysis involves methods, packages, or statistical tests needing current knowledge.",
				"Call sci_librarian AFTER analysis for literature review, gene-disease associations, pathway validation, or result interpretation.",
				"Call sci_librarian alongside sci_scout for full context: scout gets data dimensions/metadata, librarian gets method docs and citations.",
				"For routine analyses with well-known methods, sci_scout alone may suffice. For novel or complex analyses, always call librarian.",
				"If sci_scout was already called, include the scout's data summary (format, dimensions, organism) in the task so the librarian researches methods relevant to YOUR specific data type and dimensions.",
				"When requesting literature review, include specific genes, pathways, phenotypes, or conditions from the analysis so the librarian can build targeted PubMed queries.",
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
