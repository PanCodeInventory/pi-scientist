/** Scientist: coordinated analysis with persistent experts and optional review. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateReportCommand, registerPublicationCommand, registerReflectCommand } from "./core/commands.js";
import { registerScientificDialogue } from "./dialogue/index.js";
import { injectScientistPrinciples } from "./core/enforcement.js";
import { injectScientistConventions } from "./core/conventions.js";
import { registerScientistWorkflowTools } from "./tools/index.js";
import { registerLibrarianTool } from "./tools/librarian.js";
import { registerTeamTools } from "./tools/team.js";
import { registerTeamHandoff } from "./tools/handoff.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePackageRoot(): string {
	return [__dirname, path.resolve(__dirname, "..")]
		.find((candidate) => fs.existsSync(path.join(candidate, "skills")))
		?? path.resolve(__dirname, "..");
}

export default function (pi: ExtensionAPI): void {
	pi.on("resources_discover", async () => ({
		skillPaths: [path.join(resolvePackageRoot(), "skills")],
	}));

	// Specialists retain domain resources but cannot recursively orchestrate Scientist.
	if (process.env.SCIENTIST_SUBAGENT === "1") {
		registerTeamHandoff(pi);
		return;
	}

	registerScientificDialogue(pi);
	registerGenerateReportCommand(pi);
	registerPublicationCommand(pi);
	registerReflectCommand(pi);
	registerScientistWorkflowTools(pi);
	registerLibrarianTool(pi);
	registerTeamTools(pi);

	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.hasUI) ctx.ui.setStatus("scientist", "Scientist · team");
		// Respect Pi's active tool set, including --tools/--exclude-tools. Never
		// silently re-enable a tool the user disabled.
		const prompt = injectScientistConventions(event.systemPrompt);
		return { systemPrompt: process.env.SCIENTIST_NO_ENFORCEMENT ? prompt : injectScientistPrinciples(prompt) };
	});
}
