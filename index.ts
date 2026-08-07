/**
 * Scientist — Bioinformatics workflow extension.
 *
 * The entry point wires lifecycle hooks, dialogue state, commands, and tool
 * registration. Individual tool implementations live under tools/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReflectCommand } from "./commands.js";
import { registerScientificDialogue } from "./dialogue/index.js";
import { SCIENTIST_ENFORCEMENT } from "./enforcement.js";
import { registerScientistWorkflowTools } from "./tools/index.js";
import { registerLibrarianTool } from "./tools/librarian.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Mandatory workflow tools enabled in Scientist mode. */
const SCI_WORKFLOW_TOOLS = [
	"ask_user_question",
	"sci_scout",
	"sci_implement",
	"sci_review",
	"sci_logs",
];

/** Independent retrieval tools available for main-agent, on-demand use. */
const SCI_RETRIEVAL_TOOLS = ["sci_librarian"];

function resolvePackageRoot(): string {
	const candidates = [__dirname, path.resolve(__dirname, "..")];
	return candidates.find((candidate) => fs.existsSync(path.join(candidate, "skills")))
		?? path.resolve(__dirname, "..");
}

function injectEnforcement(prompt: string): string {
	if (prompt.includes("<scientist-enforcement>")) return prompt;
	const marker = "\nCurrent date:";
	return prompt.includes(marker)
		? prompt.replace(marker, SCIENTIST_ENFORCEMENT + marker)
		: prompt + SCIENTIST_ENFORCEMENT;
}

export default function (pi: ExtensionAPI): void {
	registerScientificDialogue(pi);
	registerReflectCommand(pi);
	registerScientistWorkflowTools(pi);
	registerLibrarianTool(pi);

	// Source runs keep skills beside index.ts; packaged runs keep them beside dist/.
	const packageRoot = resolvePackageRoot();
	pi.on("resources_discover", async () => ({
		skillPaths: [path.join(packageRoot, "skills")],
	}));

	pi.on("before_agent_start", async (event, ctx) => {
		ctx.ui.setStatus("scientist", "Scientist On");

		const allToolNames = pi.getAllTools().map((tool) => tool.name);
		const enabled = new Set([
			...pi.getActiveTools(),
			...SCI_WORKFLOW_TOOLS,
			...SCI_RETRIEVAL_TOOLS,
		]);
		pi.setActiveTools(Array.from(enabled).filter((tool) => allToolNames.includes(tool)));

		return { systemPrompt: injectEnforcement(event.systemPrompt) };
	});
}
