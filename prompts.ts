import * as path from "node:path";

/**
 * Canonical planner rules. Keep workflow layout and deliverable policy here so
 * every planner invocation receives the same instructions.
 */
export const PLANNER_LAYOUT_RULES = [
	"Plan location rule: save the persistent task file under the analysis parent directory's Task/ folder (Task/TaskN-YYYYMMDD.md).",
	"Output location rule: create/use concrete analysis module directories directly under the analysis parent directory, named like 01_Preprocessing/ or <NN>_ModuleName/, siblings to Task/. Each module must follow: scripts/config/, scripts/stages/, scripts/utils/, results/data/, results/tables/, results/plots/. Do NOT create README.md or logs/ directories anywhere; script run logs/status produced by tmux go under <Module>/tmux/ (one tmux/manifest.jsonl per module indexes every run). Require every generated script, config, intermediate file, table, figure, and analysis result for this analysis to be saved under the relevant module directory, never under Task/. Results must be categorized by file type under results/.",
	"Final report rule: do NOT add RFINAL, 99_Report/, README, or report-generation items to the Todolist. Instead include a Main-Agent Completion Reminder stating that after all Todolist items are [x], the main agent must use/read frontend-design, write the report under Report/<TaskID>-<具体内容>-<YYYYMMDD>.html, then run git commit. TaskID must match the Task file's Task number prefix (e.g. Task/Task3-20260528.md -> Task3); 具体内容 is a short filename-safe summary; date uses YYYYMMDD.",
	"Figure rule: any step producing a FINAL figure must (a) prefer R via the visualization skill when the data is a plot-ready CSV/TSV and the figure type is R-supported, otherwise use Python compliant with figure-standards.md; (b) list both .png (300 DPI) and .pdf in Output; (c) note compliance with skills/visualization/shared/figure-standards.md. Exploratory figures must NOT go into results/plots/.",
].join("\n");

export function buildPlannerTask(task: string, workDir: string, context: string): string {
	return [
		`Create a bioinformatics analysis plan for: ${task}`,
		`User-confirmed analysis parent directory: ${workDir}`,
		PLANNER_LAYOUT_RULES,
		`Context from scout/librarian/user answers:\n${context}`,
	].join("\n\n");
}

export function buildWorkerTask(planFile: string, workDir: string): string {
	return `Read the plan file at \`${planFile}\` and execute the next unchecked analysis step. Effective analysis parent directory: ${workDir}. The plan file must declare the analysis parent directory, plan file path, and concrete module directory for each step. Follow the methodology and skill specified in that step, and write every generated script/config/result under the declared module directory (e.g. <NN>_ModuleName/, sibling to Task/, not inside Task/). Do NOT create README.md files or 99_Report/. DO NOT modify the plan file — the reviewer agent handles plan updates.`;
}

export function buildReviewTask(options: {
	planFile: string;
	workDir: string;
	handoffJson?: string | null;
	standalone?: boolean;
}): string {
	const { planFile, workDir, handoffJson, standalone = false } = options;
	if (handoffJson) {
		return `Worker completed a step. Here is the worker's handoff JSON:\n\n\`\`\`json\n${handoffJson}\n\`\`\`\n\nAnalysis parent directory: ${workDir}.\nPlan file: \`${planFile}\`.\n\nUse the handoff JSON to do a TARGETED review: only review the files listed in \`filesToReview\`. Match \`stepId\` to the plan's Task Details to verify parameters. After review, update the plan file: mark \`- [x]\` on PASS, or add fix steps on NEEDS FIX.`;
	}

	const identifyStep = standalone
		? "Identify the latest step that the worker executed"
		: "The worker has just completed a step — find the latest step that was executed";
	const passAction = standalone
		? "mark the checkbox `- [x]` in the Todolist and optionally add review notes"
		: "mark the checkbox `- [x]`";
	const fixAction = standalone
		? "add concrete fix steps to the Todolist and Task Details sections"
		: "add fix steps to the plan";

	return `Read the plan file at \`${planFile}\`. Effective analysis parent directory: ${workDir}. ${identifyStep} (it will still be marked \`- [ ]\` because the worker is forbidden from modifying the plan). Review its outputs for code correctness, statistical validity, figure quality (MUST first read skills/visualization/shared/figure-standards.md, then run its 6 BLOCKER checks — any failure is NEEDS FIX), data provenance, and plan compliance. If PASS: ${passAction}. If NEEDS FIX: ${fixAction}. Update the plan file accordingly.`;
}

export function extractTaskIdFromPlanFile(planFile: string): string {
	const stem = path.basename(planFile).replace(/\.md$/i, "");
	const match = stem.match(/^(Task\d+)(?:-\d{8})?$/);
	return match?.[1] || stem || "TaskN";
}

export function todayYmd(now = new Date()): string {
	const yyyy = String(now.getFullYear());
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	return `${yyyy}${mm}${dd}`;
}

export function reportFilenameHint(planFile: string): string {
	return `Report/${extractTaskIdFromPlanFile(planFile)}-具体内容-${todayYmd()}.html`;
}

export function buildCompletionReminder(planFile: string): string {
	return [
		"## Main-Agent Completion Reminder",
		"All Todolist items in the plan are now checked. Do NOT call another subagent for report generation.",
		"Next, the main agent must:",
		"1. Use/read the `frontend-design` skill.",
		`2. Write the final self-contained Chinese HTML report to \`${reportFilenameHint(planFile)}\` (replace \`具体内容\` with a short filename-safe content summary; no README files, no \`99_Report/\`).`,
		"3. Run `git status`, stage the relevant analysis/report files, and create a git commit.",
	].join("\n");
}
