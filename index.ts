/** Scientific capabilities: principles, delivery conventions, skills and dialogue.
 *  Analysis delegation remains a convention. Optional project learning clones
 *  delivery history into a restricted background reflection session. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateReportCommand, registerPublicationCommand, registerReflectCommand } from "./core/commands.js";
import { registerScientificDialogue } from "./dialogue/index.js";
import { registerScientistContext } from "./core/context.js";
import { registerLogsTool } from "./tools/logs.js";
import { registerHerdrWatch } from "./core/herdr-watch.js";
import { registerLearning } from "./core/learning.js";

export default function scientist(pi: ExtensionAPI): void {
    // Package skills are discovered through pi.skills; diagnose, never bypass filters.
    registerScientistContext(pi);
    registerScientificDialogue(pi);
    registerGenerateReportCommand(pi);
    registerPublicationCommand(pi);
    registerReflectCommand(pi);
    registerLogsTool(pi);
    registerHerdrWatch(pi);
    registerLearning(pi);
}
