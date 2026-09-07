/** Task briefs for optional delegation. No hidden review or plan-update pipeline. */
export function buildWorkerTask(options: { task?: string; planFile?: string; workDir: string }): string {
	return [
		`Analysis parent directory: ${options.workDir}.`,
		options.task?.trim(),
		options.planFile ? `Read the optional plan at \`${options.planFile}\`. ${options.task?.trim() ? "Execute only the explicitly assigned scope." : "Execute the next unchecked step only; if none remain, report that without executing anything."}` : "No persistent plan is required.",
		"Preserve the user's output conventions. Validate actual outputs and report paths, checks and unresolved issues. You own progress updates for the assigned step if a plan exists; only mark it complete after validation. Do not mark unrelated steps or imply independent review occurred. There is no automatic reviewer. Do not delegate further.",
	].filter(Boolean).join("\n\n");
}

export function buildReviewTask(options: { task?: string; planFile?: string; workDir: string }): string {
	return [
		`Review scope in analysis directory: ${options.workDir}.`,
		options.task?.trim() || "Review the analysis described by the supplied plan; identify the relevant outputs and explicitly state your review scope.",
		options.planFile ? `Optional context: \`${options.planFile}\`.` : "No plan file is required.",
		"Perform a read-only, risk-focused review of scientific design, real outputs, provenance and applicable user conventions. Inspect expected outputs as well as supplied file lists; do not trust a worker's list as proof of completeness. Do not edit files, update checkboxes, add fix steps, or re-run analyses. Report findings with evidence, severity and concrete fixes, plus what you could not verify. The main agent decides next actions.",
	].filter(Boolean).join("\n\n");
}
