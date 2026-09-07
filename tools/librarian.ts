import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverScientists } from "../core/agents.js";
import { runAgent, renderAgentResult, type AgentRenderItem } from "../core/runner.js";
import { agentToolResult } from "./shared.js";

export function registerLibrarianTool(pi: ExtensionAPI, run = runAgent): void {
	pi.registerTool({
		name: "sci_librarian",
		label: "Sci Librarian",
		description: "Optional retrieval specialist for bioinformatics methods, package documentation and literature. Use for a concrete evidence gap, not as a mandatory analysis stage. Can use available retrieval tools or the tooluniverse-min skill. Output bounded to 50KB/2000 lines with a full-text path when truncated.",
		promptSnippet: "Optional methods, documentation and literature research",
		promptGuidelines: ["Use sci_librarian when independent research adds value; include the relevant data context and specific evidence gap. Direct retrieval is also valid."],
		parameters: Type.Object({
			task: Type.String({ description: "Research question and relevant biological/data context", minLength: 1 }),
			query: Type.Optional(Type.String({ description: "Specific package or method" })),
			source: Type.Optional(StringEnum(["docs", "api", "web", "auto"] as const)),
			timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600, description: "Agent runtime limit; default 600 seconds" })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const task = [params.task, params.query && `Focus: ${params.query}`, params.source && `Preferred source: ${params.source}`].filter(Boolean).join("\n");
			const result = await run(ctx.cwd, discoverScientists().agents, "librarian", task, {
				signal, timeoutSeconds: params.timeoutSeconds,
				onUpdate: onUpdate ? (u) => onUpdate({ content: [{ type: "text", text: u.output }], details: u.details }) : undefined,
			});
			return agentToolResult(result);
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("sci_librarian ")) + theme.fg("dim", String(args.task || "...").slice(0, 120)), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as AgentRenderItem | undefined;
			return details ? renderAgentResult(details, !!expanded, theme)
				: new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
		},
	});
}
