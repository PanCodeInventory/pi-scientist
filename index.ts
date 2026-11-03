/** Scientific capabilities: principles, delivery conventions, skills and dialogue.
 *  Analysis delegation remains a convention. Optional project learning clones
 *  delivery history into a restricted background reflection session. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateReportCommand, registerPublicationCommand, registerReflectCommand } from "./core/commands.js";
import { registerScientificDialogue } from "./dialogue/index.js";
import { SCIENTIST_PRINCIPLES_SECTION } from "./core/enforcement.js";
import { SCIENTIST_CONVENTIONS_SECTION } from "./core/conventions.js";
import { registerLogsTool } from "./tools/logs.js";
import { registerHerdrWatch } from "./core/herdr-watch.js";
import { registerLearning } from "./core/learning.js";

export default function scientist(pi: ExtensionAPI): void {
    // Package skills are discovered through pi.skills; respect resource filters.
    pi.on("before_agent_start", event => {
        const sections = event.systemPromptOptions.sections;
        sections["scientist-conventions"] = SCIENTIST_CONVENTIONS_SECTION;
        if (process.env.SCIENTIST_NO_ENFORCEMENT) delete sections["scientist-principles"];
        else sections["scientist-principles"] = SCIENTIST_PRINCIPLES_SECTION;
    });
    registerScientificDialogue(pi);
    registerGenerateReportCommand(pi);
    registerPublicationCommand(pi);
    registerReflectCommand(pi);
    registerLogsTool(pi);
    registerHerdrWatch(pi);
    registerLearning(pi);
}
