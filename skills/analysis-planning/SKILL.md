---
name: analysis-planning
description: Optional planning for multi-step bioinformatics work and long-running projects. Use for a short execution checklist, dependencies, validation criteria, or a persistent Task document when useful; simple tasks and ordinary questions need no plan.
---

# Bioinformatics Analysis Planning

Plan only as much as the work needs. The main agent coordinates the analysis, delegates substantial execution to workers, and accepts results after checking evidence. Workers self-check; independent review is selected by the main agent when warranted. Answer ordinary questions directly; do not turn them into an analysis workflow.

## Choose the Smallest Useful Plan

- **Simple task**: act directly and report the result and checks. No plan file.
- **Several steps**: keep a short checklist in the conversation, with inputs, intended outputs, and key checks.
- **Long project, complex dependencies, or resumable work**: use a persistent `Task/TaskN-YYYYMMDD.md` when useful or requested. Adapt the [optional template](references/task-document-template.md); omit irrelevant sections.

A plan is a working aid, not an authorization mechanism. There is no required request classification, shared-contract confirmation, or specialist-tool preflight. Explicit user authorization and project conventions still apply whether or not a Task exists.

## Scientific Decisions Before Affected Computation

Read the request, available metadata, and relevant existing outputs first. Reuse explicit constraints; do not ask the user to repeat them. Clarify unresolved choices that materially change the science, such as:

- biological question, primary endpoint, groups and contrasts;
- experimental unit, biological replication, paired/repeated measurements;
- covariates, batch handling, exclusions and confounding;
- method family, evidential standard, and exploratory versus confirmatory interpretation;
- scope, requested deliverables, or output location when genuinely ambiguous.

Ask only what is needed, with no question quota. Continue independent inspection while a consequential choice is unresolved; do not silently choose that contrast or hypothesis. Document delegated technical choices, justified defaults, assumptions, and limitations without requiring a separate approval ceremony.

Validate data semantics before selecting methods: organism and gene IDs, matrix orientation, counts versus normalized values, sample alignment, missingness, and existing preprocessing. Preserve the relevant skill's data-storage requirements. Match statistical tests to the experimental unit, account for replication and multiple testing, and report effect sizes and uncertainty where applicable.

## Reuse and File Organization

Inspect existing outputs and provenance before recomputing. Reuse valid artifacts; rerun only what is missing, invalidated, or explicitly requested with changed parameters. Protect original data, record affected dependencies, and do not overwrite prior results without explicit authorization.

The following deliverable layout is required for analysis modules, even without a Task file. Honor explicit project-specific conventions; do not reorganize existing data merely to fit this template:

```text
<analysis_parent_dir>/
  Task/                         # optional plan Markdown only
  <NN>_ModuleName/
    scripts/config/             # YAML configuration
    scripts/stages/             # sequential reproducible scripts (01_, 02_, ...)
    scripts/utils/              # shared helpers and copied tmux wrapper
    results/data/               # h5ad and other data
    results/tables/              # TSV/CSV
    results/plots/               # PNG/PDF
    tmux/                       # run logs, status, manifest when tmux is used
  Report/                       # requested final reports
```

`Task/` stores plan Markdown only; generated analysis artifacts MUST stay outside it. New modules use the next available `<NN>_ModuleName/` prefix and the fixed `scripts/` and `results/` structure above. Per-cell-type subfolders belong inside `results/data/`, `results/tables/`, or `results/plots/`, not directly under `results/`.

Do not create module README files, `99_Report/`, `RFINAL`, or analysis `logs/` directories. The analysis root `logs/` is runner-only; do not create or repurpose it. Tmux logs, status files, and run history belong under `<Module>/tmux/`, with the wrapper under `<Module>/scripts/utils/`. Ordinary questions need no filesystem scaffolding.

When creating a Task file, record the analysis root, goal, inputs/dependencies, checklist, outputs, and success criteria. Use the next unused Task number and today's date; retain prior plans when starting a distinct project increment. Add step details, method rationale, versions, and parameter choices only at the level needed to reproduce the work. Refer to relevant skills by name or valid path.

## Execute, Validate, Update

The main agent as coordinating executor updates checklist progress and records output paths, actual checks, failures, and blockers. Workers return evidence through sci_handoff; they do not edit the shared plan in team assignments. Mark a step complete after its required outputs and scientific checks pass, not merely because a command exited. Update the plan when findings require a change; clarify changes to consequential scientific choices with the user.

Use [tmux-runner](../tmux-runner/SKILL.md) for long-running jobs when appropriate, even without a plan. Record commands, environment, logs, exit status, and expected artifacts. Estimated runtime and `**Long-running**: yes` are useful optional step fields.

## Team Execution

Use sci_dispatch for substantial analysis execution. Include established cwd, role,
inputs, confirmed decisions, writeScopes, acceptance criteria and dependencies.
Queue dependent tasks with start=false; launch through sci_tasks start only after
the main agent accepts their upstream tasks. A dispatch result is a task ID, not
completed analysis. Keep machine state in .scientist/ and analysis outputs in modules.

Workers self-check and report submitted, waiting_compute, blocked or failed through
sci_handoff. The main agent inspects evidence and uses sci_tasks accept to release
downstream work. For corrections or completed calculations, use sci_tasks resume
with concrete instructions; inspect registered jobs before recomputing. Previous
attempts and native sessions remain available for provenance.

Scout and librarian are on-demand roles. Reviewer is optional and selected for
complex designs, anomalies, central claims or the user's request; it may review
before or after execution. There is no automatic worker-to-reviewer chain.

Herdr manages expert sessions; tmux-runner manages long analysis jobs. A tmux expert
backend is available outside Herdr. The coordinator receives change notifications
while its Pi session is active; when restarting, inspect sci_tasks before dispatching.
See [team architecture](../../docs/team-architecture.md) for recovery boundaries.
The old sci_implement/sci_review/sci_scout/sci_librarian tools remain one-shot helpers.

## Completion and Reports

Summarize what actually ran, key results, output paths, validation evidence, and remaining limitations. Distinguish completed, blocked, and unexecuted work. Do not commit without user authorization.

A report is optional and can be requested with `/generate-report`; neither a Task file nor specialist review is a prerequisite. For a comprehensive report, use Chinese HTML under `Report/`, covering the question/design, inputs and QC, methods/parameters, findings with figures and statistics, limitations, and a reproducibility/file index.

Required filename: `Report/<ID>-<具体内容>-<YYYYMMDD>.html`. When a Task exists, `<ID>` MUST match its Task number (e.g. `Task3-单细胞聚类注释分析-20260528.html`); otherwise use a stable topic ID in the same filename format. Do not invent a Task just to name a report. Report actual execution and validation, and flag missing evidence rather than presenting it as confirmed.
