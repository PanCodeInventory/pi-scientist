---
name: analysis-planning
description: Use when the main Scientist agent reaches the PLAN stage and must write a Task/TaskN-YYYYMMDD.md plan or call sci_implement. Handles NEW and CONTINUE modes.
---

# Bioinformatics Analysis Planning

Use this skill as the **main Scientist agent** to turn mandatory Scout findings, any relevant evidence optionally retrieved with `sci_librarian`, the confirmed Shared Scientific Contract, and the user-confirmed analysis directory into a persistent Markdown plan. `sci_librarian` is not a prerequisite for planning; include its evidence only when the main agent chose to retrieve it for a concrete evidence gap.

## Shared Scientific Contract

The current session should contain the explicitly confirmed, auto-generated Shared Scientific Contract. Treat it as the authoritative scientific intent. Carry these decisions into the Goal, Methodology, parameter justification, assumptions, and Task Details:

- biological question/hypothesis and primary endpoint,
- experimental unit, groups/contrasts, and replication,
- covariates, batch handling, exclusions, and assumptions,
- selected method family and the evidence/rationale for it,
- requested outputs, evidential standard, and interpretation boundaries,
- any technical choices the user explicitly delegated to the agent.

Do not silently replace an agreed decision. If the contract is missing a consequential scientific choice, internally inconsistent, or incompatible with the scouted data, STOP and report the exact unresolved issue instead of guessing or writing a plan.

## Two Planning Modes

You operate in one of two modes:

### NEW Mode (新分析)
Brand new analysis from raw data. You design the full pipeline from scratch.
- Determine all module directories and their sequence.
- No prior modules to reference.
- Example: user says "analyze this scRNA-seq data" with no prior context.

### CONTINUE Mode (延续分析)
Building on a JUST-COMPLETED analysis. You add new modules to an existing project.
- The task context will tell you: the PRIOR plan file, completed modules, and which data files to reuse.
- The NEW module directory gets the next available NN_ prefix.
- You MUST reference existing module outputs as inputs for the new steps.
- You create a NEW plan file (not overwriting the prior one).
- Example: user says "run DE on these clusters" after completing clustering + annotation.

**Key CONTINUE rule**: Never plan to re-run completed steps. Reuse existing outputs.
If the user wants to re-run with different parameters, treat it as a NEW analysis
but reference the existing raw/preprocessed data.

## Directory Model

There are three different directory concepts. Do NOT mix them up:

1. **Plan directory** — `<analysis_parent_dir>/Task/`
   - Stores only persistent Task/Plan markdown files.
   - Example: `Task/Task3-20260528.md`

2. **Analysis module directories** — `<analysis_parent_dir>/<NN>_ModuleName/`
   - Store concrete analysis files: scripts, config, data outputs, tables, and plots.
   - These are siblings of `Task/`, not children of `Task/`.
   - Example: `01_Preprocessing/`, `02_Clustering/`, `03_DEG/`.

3. **Final report directory** — `<analysis_parent_dir>/Report/`
   - Created on-demand by the **main agent** when the user runs `/generate-report`, after all Todolist items pass review and the results are confirmed.
   - Stores only the final report.
   - Report filename pattern: `Report/<TaskID>-<具体内容>-<YYYYMMDD>.html`.
     - `<TaskID>` MUST match the Task file's Task number prefix, e.g. `Task/Task3-20260528.md` → `Task3`.
     - `<具体内容>` is a short filename-safe summary of the report content, e.g. `单细胞聚类注释分析`.
     - `<YYYYMMDD>` is the report creation date.
     - Example: `Report/Task3-单细胞聚类注释分析-20260528.html`.
   - It is not an analysis module and must never appear as a worker/reviewer step.

Generated analysis outputs MUST NOT be written under `Task/`. The `Task/` folder is for plan files only.

## Critical Rule: Write a File

You MUST create a plan file. This is NOT optional.

1. Identify the user-confirmed **analysis parent directory** from the task context and record it in the plan file. If the task context does not explicitly provide it, STOP and ask for it; do not create a plan.
2. Check if `<analysis_parent_dir>/Task/` exists; if not, create it.
3. Determine the task number:
   - List existing `Task*-*.md` files in `Task/`
   - Find the highest task number (e.g., `Task3-20260526.md` → N=3)
   - Use N+1 for the new task (e.g., `Task4-20260528.md`)
   - If no tasks exist, start at `Task1-YYYYMMDD.md`
4. Date format: YYYYMMDD (no hyphens), use today's date.
5. Define one or more analysis module directories using the pattern `<NN>_ModuleName/`.
6. Write the plan to `Task/TaskN-YYYYMMDD.md`, following the template at `references/task-document-template.md`. The file must contain the header block, Goal, Module Layout, Todolist, Main-Agent Completion Reminder, Task Details (one `### PNN:` per Todolist item), Methodology, File Manifest, and Success Criteria sections.
7. Forbidden outputs — do not create any of these, and do not add them as Todolist steps: `99_Report/`, `RFINAL`, `README.md` (module-level or otherwise), report-generation steps, or `logs/` directories (the analysis root `logs/` is runner-only; tmux run logs live under `<Module>/tmux/`).
8. After writing, confirm the plan file path and analysis module directories, and retain the completion reminder (see the Main-Agent Completion Reminder section in the template).

## Required Analysis Module Structure

Every analysis module directory MUST follow this framework:

```text
<NN>_ModuleName/
  scripts/
    config/        # YAML configuration files
    stages/        # Sequential analysis scripts (01_, 02_, ...)
    utils/         # Shared utility modules for this module
  results/
    data/          # h5ad or other binary/intermediate data files
    tables/        # TSV/CSV tables and summary tables
    plots/         # PNG/PDF figures
```

Results are categorized by file type under `results/`. If per-celltype separation is needed, create subfolders within the file-type folders, e.g. `results/tables/T_cell/` or `results/plots/T_cell/`, but never make cell type the first level under `results/`.

## Skill References

When a step should follow a specific skill, include `**Skill**: [name]`.
The worker will have access to the skill's SKILL.md content.

Common assignments:
- QC and preprocessing → `scanpy-prep`
- Clustering and annotation → `scanpy-cluster`
- Cell type annotation → `scanpy-annotate`
- Differential expression → `scanpy-de`
- Statistical testing → `statistical-testing`
- Figure creation → `visualization`
- Cell communication → `scanpy-cellcommunication`
- Transcription factor analysis → `pyscenic-single-cell-analysis`
- Spatial analysis → `squidpy-analysis` or `spatial-commot`

## Long-running Steps and Tmux

When a step involves a long-running analysis, you MUST include these fields in the Task Details:

- `**Long-running**: yes` or `no` — indicates whether the worker should use tmux
- `**Estimated time**: <duration>` — e.g., `10-30min`, `1-2h`, `30min-1h`

Mark a step as `**Long-running**: yes` when:
- The analysis involves large datasets (>10k cells, >5k genes)
- The script runs SCENIC, cell communication, trajectory analysis, or multi-sample processing
- The script calls external tools (CellRanger, STAR, HISAT2, etc.)
- You estimate the step will take more than ~5 minutes

The worker will use tmux to run these scripts, ensuring they survive agent timeouts and allowing real-time monitoring via log files.

## CONTINUE Mode Plan (Incremental)

When creating a CONTINUE plan, your plan MUST additionally include:

- `> Prior plan: Task/TaskN-YYYYMMDD.md` in the header
- `> Prior modules: 01_Preprocessing/, 02_Clustering/, 03_Annotation/` listing completed modules
- A **Dependencies** section after the Module Layout table:

```markdown
## Dependencies on Prior Analysis

| New Module | Depends on | File reused |
|------------|-----------|-------------|
| `04_DiffExpression/` | `02_Clustering/`, `03_Annotation/` | `03_Annotation/results/data/adata_annotated.h5ad` |
```

This ensures the worker knows exactly which existing files to load instead of re-running prior steps.

## How Worker and Reviewer Use the Plan

- **Worker**: read the plan, find the first unchecked `- [ ]` in the Todolist, jump to the matching `### PNN:` in Task Details, execute following the `**Module**`/`**Script**`/`**Config**`/`**Input**`/`**Output**` fields, write all generated files under the declared module directory, and report results via handoff JSON. Do not update checkboxes; the reviewer handles plan updates.
- **Reviewer**: check that generated outputs are inside declared `<NN>_ModuleName/` directories and not inside `Task/`, and that no forbidden outputs (step 7) were created. If issues are found, update this same plan file: add fix steps at the end of the Todolist (continuing the numbering) with matching `### PNN:` Task Details subsections, or amend an existing entry's Method notes.

## After Writing the Plan

After writing the file, output:

```text
📋 Task file saved to: Task/TaskN-YYYYMMDD.md
📁 Analysis modules:
- 01_ModuleName/
- 02_ModuleName/

Summary: [1-2 sentence summary]

Total analysis steps: N
Estimated complexity: [Low/Medium/High]

Next action: Call sci_implement with planFile="Task/TaskN-YYYYMMDD.md" and cwd="/absolute/analysis_parent_dir" until all Todolist items are [x]. Then the main agent summarizes completion; the user runs `/generate-report` when ready.
```
