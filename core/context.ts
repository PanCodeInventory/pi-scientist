/** Describe actual prompt resources, never rediscover or force-enable filtered skills. */
import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SCIENTIST_CONVENTIONS_SECTION } from "./conventions.js";
import { SCIENTIST_PRINCIPLES_SECTION } from "./enforcement.js";

const REQUIRED_SKILLS = ["visualization", "tmux-runner"];

export function scientistResourceStatus(options: BuildSystemPromptOptions) {
    // Match Pi's skill advertisement rules, including readers hidden behind codemode.
    const canRead = (options.selectedTools ?? []).some(name => name === "read" || name === "bash");
    const advertised = new Set((options.skills ?? []).filter(skill => !skill.disableModelInvocation && canRead).map(skill => skill.name));
    const missing = REQUIRED_SKILLS.filter(name => !advertised.has(name));
    const guidance = [
        "The available_skills catalog is the source of truth for automatic skill selection. A catalog entry advertises name, description and location, not the full instructions; read the relevant SKILL.md before use. Prior conversation mentions do not prove current availability.",
        "tmux-runner is a skill containing a shell wrapper, not a dedicated tool. Use it through the available execution tools after reading its instructions.",
        missing.length
            ? `Required convention skills not advertised in this run: ${missing.join(", ")}. Do not guess their paths, claim they are loaded, or bypass resource filters. Before an affected long-running computation or deliverable figure, explain the missing dependency and ask to enable it; unrelated work can continue. To load the bundle, configure scientist under packages (not only extensions), or explicitly supply --skill /path/to/scientist/skills, then reload. Respect intentional exclusions and --no-skills.`
            : "Required convention skills are advertised: visualization, tmux-runner. Load their instructions on demand; availability does not prove execution or validation.",
    ].join("\n");
    return { missing, guidance };
}

export function registerScientistContext(pi: ExtensionAPI): void {
    let lastWarning = "";
    pi.on("before_agent_start", (event, ctx) => {
        const sections = event.systemPromptOptions.sections;
        sections["scientist-conventions"] = SCIENTIST_CONVENTIONS_SECTION;
        if (process.env.SCIENTIST_NO_ENFORCEMENT) delete sections["scientist-principles"];
        else sections["scientist-principles"] = SCIENTIST_PRINCIPLES_SECTION;
        const { missing, guidance } = scientistResourceStatus(event.systemPromptOptions);
        sections["scientist-resources"] = guidance;
        const warning = missing.join(", ");
        if (warning && warning !== lastWarning && ctx?.hasUI)
            ctx.ui.notify(`Scientist 缺少当前可用技能：${warning}。仅加载 extensions 不会加载包技能；请检查 packages、技能筛选及 --no-skills，修正后 /reload。相关步骤不能跳过技能规范。`, "warning");
        lastWarning = warning;
    });
}
