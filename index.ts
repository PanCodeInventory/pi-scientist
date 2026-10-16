/** Scientific capabilities: principles, delivery conventions, skills and dialogue.
 *  No coordinator/worker roles or delegation machinery — sub-agent dispatch is a
 *  documented convention (see the subagent-delegation skill), not extension code. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateReportCommand, registerPublicationCommand, registerReflectCommand } from "./core/commands.js";
import { registerScientificDialogue } from "./dialogue/index.js";
import { injectScientistPrinciples } from "./core/enforcement.js";
import { injectScientistConventions } from "./core/conventions.js";
import { registerLogsTool } from "./tools/logs.js";
import { registerHerdrWatch } from "./core/herdr-watch.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = [here, path.resolve(here, "..")].find(p => fs.existsSync(path.join(p, "skills"))) ?? here;

export default function scientist(pi: ExtensionAPI): void {
    pi.on("resources_discover", async () => ({ skillPaths: [path.join(root, "skills")] }));
    pi.on("before_agent_start", async event => {
        const prompt = injectScientistConventions(event.systemPrompt);
        return { systemPrompt: process.env.SCIENTIST_NO_ENFORCEMENT ? prompt : injectScientistPrinciples(prompt) };
    });
    registerScientificDialogue(pi);
    registerGenerateReportCommand(pi);
    registerPublicationCommand(pi);
    registerReflectCommand(pi);
    registerLogsTool(pi);
    registerHerdrWatch(pi);
}
