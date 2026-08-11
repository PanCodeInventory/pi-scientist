---
name: analysis-planning
description: Creates persistent, methodology-focused bioinformatics task documents for Scientist NEW and CONTINUE workflows. The main agent must read and follow this skill whenever it reaches the PLAN stage, before writing Task/TaskN-YYYYMMDD.md or calling sci_implement.
---

# Bioinformatics Analysis Planning

Use this skill as the **main Scientist agent** to turn mandatory Scout findings, any relevant evidence optionally retrieved with `sci_librarian`, the confirmed Shared Scientific Contract, and the user-confirmed analysis directory into a persistent Markdown task document. `sci_librarian` is not a prerequisite for planning; include its evidence only when the main agent chose to retrieve it for a concrete evidence gap.

The task document drives worker/reviewer execution. The final narrative report is **not** a subagent step and is **not** automatic: after every analysis step in the Todolist has passed review, the main agent summarizes completion, and the user runs `/generate-report` when the results are confirmed.

## Shared Scientific Contract

The current session should contain the explicitly confirmed, auto-generated Shared Scientific Contract produced by your evidence-grounded dialogue with the user after scouting/research. It includes stable decision IDs, dependencies, evidence provenance, recommended defaults, and whether each branch was user-chosen, accepted, delegated, or deferred. Treat it as the authoritative scientific intent. Carry these decisions into the Goal, Methodology, parameter justification, assumptions, and Task Details:

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
- Include a main-agent completion reminder (summarize + tell the user to run `/generate-report`), but do **not** add a report step to the Todolist.
- Example: user says "analyze this scRNA-seq data" with no prior context.

### CONTINUE Mode (延续分析)
Building on a JUST-COMPLETED analysis. You add new modules to an existing project.
- The task context will tell you: the PRIOR plan file, completed modules, and which data files to reuse.
- The NEW module directory gets the next available NN_ prefix.
- You MUST reference existing module outputs as inputs for the new steps.
- You create a NEW plan file (not overwriting the prior one).
- Include a main-agent completion reminder (summarize + tell the user to run `/generate-report`), but do **not** add a report step to the Todolist.
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
Subagents MUST NOT create module-level `README.md` files. The only documentation deliverable is the final HTML report, generated later by the main agent when the user runs `/generate-report`.

## Critical Rule: Write a File

You MUST create a task file. This is NOT optional.

1. Identify the user-confirmed **analysis parent directory** from the task context and record it in the task file. If the task context does not explicitly provide it, STOP and ask for it; do not create a plan.
2. Check if `<analysis_parent_dir>/Task/` exists; if not, create it.
3. Determine the task number:
   - List existing `Task*-*.md` files in `Task/`
   - Find the highest task number (e.g., `Task3-20260526.md` → N=3)
   - Use N+1 for the new task (e.g., `Task4-20260528.md`)
   - If no tasks exist, start at `Task1-YYYYMMDD.md`
4. Date format: YYYYMMDD (no hyphens), use today's date.
5. Define one or more analysis module directories using the pattern `<NN>_ModuleName/`.
6. Write the complete task document to `Task/TaskN-YYYYMMDD.md`.
7. Do **not** add `99_Report/`, `RFINAL`, `README.md`, or any report-generation step to the Todolist.
8. After writing, confirm the task file path and analysis module directories, and retain the completion reminder: summarize when all steps pass review, then the user runs `/generate-report` to write `Report/<TaskID>-<具体内容>-<YYYYMMDD>.html`.

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

Do NOT create module-level `README.md` files. Results are categorized by file type under `results/`. If per-celltype separation is needed, create subfolders within the file-type folders, e.g. `results/tables/T_cell/` or `results/plots/T_cell/`, but never make cell type the first level under `results/`.

## Task Document Structure

The file MUST record the analysis parent directory and module directories near the top. It MUST contain **Todolist** and **Task Details** sections, plus methodology/manifest/success criteria sections, and a **Main-Agent Completion Reminder** section.

```markdown
# TaskN: [Short Title]

> Created: YYYY-MM-DD | Status: READY | Progress: 0/N steps
> Analysis parent directory: `/absolute/path/chosen-by-user`
> Plan file: `Task/TaskN-YYYYMMDD.md`
> Analysis modules: `01_Preprocessing/`, `02_Clustering/`, `03_DEG/`
> Output rule: generated scripts/results stay under the relevant `<NN>_ModuleName/` directory, never under `Task/`; do not create `README.md` or `logs/` directories. Script run logs (tmux) go under `<Module>/tmux/` (indexed by `<Module>/tmux/manifest.jsonl`).
> Main-agent completion: when every Todolist item is `[x]`, the main agent summarizes completion to the user. The user then runs `/generate-report` (after confirming/discussing the results) to generate `Report/<TaskID>-<具体内容>-<YYYYMMDD>.html`. `TaskID` must match the Task file prefix (e.g. `Task3`). This is not a subagent step.

## Goal
One sentence summary of what this task accomplishes.

---

## Module Layout

| Module | Purpose | Main outputs |
|--------|---------|--------------|
| `01_Preprocessing/` | QC and normalization | cleaned h5ad, QC plots/tables |
| `02_Clustering/` | PCA/neighbors/UMAP/clustering | clustered h5ad, UMAP plots |
| `03_DEG/` | marker/DEG analysis | DEG tables and plots |

---

## Todolist

> 每条 Todolist 项与下方 Task Details 中的条目一一对应，编号必须一致。
> Worker 完成一步后不能打勾；Reviewer 审核通过后打勾。Reviewer 如需新增修复步骤，也在末尾追加。
> 不要在 Todolist 中添加 `RFINAL`、`99_Report`、README 或报告生成步骤。

- [ ] **P01**: [Title] — 一句话概述
- [ ] **P02**: [Title] — 一句话概述
- [ ] **P03**: [Title] — 一句话概述
- [ ] **PNN**: [Title]

---

## Main-Agent Completion Reminder (Not a Subagent Step)

When all Todolist items above are marked `[x]`:
1. Stop dispatching worker/reviewer subagents for this plan.
2. The **main agent** summarizes completion to the user: what was done, key results, and any caveats.
3. Tell the user that once the results are confirmed and finalized, they can run `/generate-report` to generate `Report/<TaskID>-<具体内容>-<YYYYMMDD>.html` (example: `Report/Task3-单细胞聚类注释分析-20260528.html`). That command synthesizes the analysis results with the session discussion.
4. Do not create any `README.md` files, do not create `99_Report/`, and do not git commit on your own.

---

## Task Details

### P01: QC and preprocessing

**Module**: `01_Preprocessing/`

**What to do**: 本步骤的目标。

**Script**: `01_Preprocessing/scripts/stages/01_qc_preprocess.py`

**Config**: `01_Preprocessing/scripts/config/qc_preprocess.yaml`

**Input**:
- `data/raw/sample.h5ad`

**Output**:
- `01_Preprocessing/results/data/01_after_qc.h5ad`
- `01_Preprocessing/results/tables/qc_summary.tsv`
- `01_Preprocessing/results/plots/qc_metrics.png`
- `01_Preprocessing/results/plots/qc_metrics.pdf`

**Skill**: `scanpy-prep`

**Long-running**: no

**Estimated time**: <1min

**Method notes**:
- 使用 `sc.pp.filter_cells`，min_genes=200
- 过滤线粒体比例 >20% 的细胞
- 保存 normalized + raw counts

---

### P02: Clustering

**Module**: `02_Clustering/`

**What to do**: ...

**Script**: `02_Clustering/scripts/stages/01_clustering.py`

**Config**: `02_Clustering/scripts/config/clustering.yaml`

**Input**:
- `01_Preprocessing/results/data/01_after_qc.h5ad` (来自 P01)

**Output**:
- `02_Clustering/results/data/02_clustered.h5ad`
- `02_Clustering/results/plots/umap_clusters.png`
- `02_Clustering/results/plots/umap_clusters.pdf`
- `02_Clustering/results/tables/cluster_summary.tsv`

**Skill**: `scanpy-cluster`

**Long-running**: no

**Estimated time**: 2-5min

**Method notes**:
- HVG selection: n_top_genes=2000
- PCA → neighbors → Leiden (resolution=0.5) → UMAP
- Find marker genes with Wilcoxon test

---

### PNN: ...

（每条 Todolist 项必须有对应编号的 Task Details 条目，不可遗漏）

---

## Methodology

### Packages and Versions
| Package | Version | Citation/DOI | Purpose |
|---------|---------|-------------|---------|
| scanpy | 1.10.x | Wolf et al., 2018 | scRNA-seq analysis |

### Parameter Justification
| Parameter | Value | Default | Rationale |
|-----------|-------|---------|-----------|
| n_top_genes | 2000 | 1000 | Dataset has 50k cells |

### Assumptions
- Data has been pre-QC'd by CellRanger
- Batch effects are minimal

### Alternative Approaches Considered
- **Alt 1**: Description — why not chosen

---

## File Manifest

```text
Task/
└── TaskN-YYYYMMDD.md
01_Preprocessing/
├── scripts/
│   ├── config/qc_preprocess.yaml
│   ├── stages/01_qc_preprocess.py
│   └── utils/
└── results/
    ├── data/01_after_qc.h5ad
    ├── tables/qc_summary.tsv
    └── plots/qc_metrics.png / .pdf
02_Clustering/
└── ...

# Post-completion deliverable, generated on-demand by the main agent when the user runs /generate-report:
Report/
└── TaskN-具体内容-YYYYMMDD.html
```

## Success Criteria
- [ ] All scripts run without errors
- [ ] All expected analysis output files exist under the declared module directories
- [ ] No generated analysis outputs are written under `Task/`
- [ ] Results are categorized by file type under `results/data/`, `results/tables/`, and `results/plots/`
- [ ] No module-level `README.md` files are created
- [ ] No `logs/` directories are created by agents (the analysis root `logs/` is runner-only; tmux run logs live under `<Module>/tmux/`)
- [ ] Figures are publication quality
- [ ] Statistical tests are appropriate and correctly reported
- [ ] After all Todolist items pass review, the main agent summarizes completion and tells the user to run `/generate-report` when ready (no automatic report, no automatic git commit)
```

## Why This Structure

1. **Task/** — Plan-only folder. The main agent, worker, and reviewer use it as persistent state.
2. **<NN>_ModuleName/** — Concrete analysis modules. Each module is self-contained, reproducible, and reviewable.
3. **Report/** — Final human-facing report, generated on-demand by the main agent when the user runs `/generate-report`, after subagent work is complete and results are confirmed.

This separation means:
- The main agent reads only `Task/TaskN-YYYYMMDD.md` to track progress
- The worker reads the module path for the current step and writes outputs there
- The reviewer checks that all generated files are inside declared module directories and not inside `Task/`
- The final report is produced once, on-demand via `/generate-report` after all reviewed analysis outputs are available and the user confirms, without involving worker/reviewer subagents

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
- Final report writing → triggered by the user via `/generate-report` (main agent only; do not create a worker/reviewer step for this). The agent follows the HTML template at `skills/analysis-planning/references/report-template.html`.

## Final Report (On-Demand, Main Agent Only)

**Do NOT create a final report step.** Plans MUST NOT contain:
- `RFINAL`
- `99_Report/`
- `99_Report/README.md`
- `99_Report/results/report.html`
- Any Todolist item whose purpose is report or README generation

Instead, every plan MUST contain the **Main-Agent Completion Reminder** section shown above.

The report is **not** generated automatically when analysis finishes. The flow is:

1. All Todolist items pass review → the main agent **summarizes** completion to the user (what was done, key results, caveats) and stops. It does NOT write the report and does NOT git commit.
2. The user reviews, discusses, and requests adjustments as needed.
3. When the results are confirmed and finalized, the user runs **`/generate-report`**. That command instructs the main agent to synthesize the analysis results together with the session discussion, then write the report.

When `/generate-report` runs, the main agent:

1. Reads the HTML report template at `skills/analysis-planning/references/report-template.html` and follows its structure and styling (black-and-white academic layout, numbered sections, booktabs tables, numbered figure captions). It replaces the demo data with real content and removes the placeholder-generating script, swapping each `<svg>` for a real base64 image.
2. Creates `Report/` if needed.
3. Writes **only one final documentation deliverable**:
   - `Report/<TaskID>-<具体内容>-<YYYYMMDD>.html` — self-contained Chinese HTML report.
   - Naming example: if the plan file is `Task/Task3-20260528.md` and the content summary is `单细胞聚类注释分析`, write `Report/Task3-单细胞聚类注释分析-20260528.html`.
4. Does **not** create any `README.md` files.
5. Does **not** git commit on its own — it reports the report path and lets the user decide.

Report requirements:
- Filename must follow `TaskID-具体内容-日期.html`; use the Task file's Task number prefix as `TaskID`, keep the content part short and filename-safe, and use `YYYYMMDD` for the date.
- Self-contained HTML: all images embedded as `data:image/png;base64,...`; no external dependencies.
- Chinese language throughout.
- Must contain the four chapters (mirroring the template):
  1. **分析思路与方法选择** — 为什么选这些方法、与其他候选的对比、关键参数依据
  2. **核心结论** — 最重要的发现，用数据说话
  3. **图片详解** — 每张图配一段解读：展示了什么、关键信息在哪里、生物学含义
  4. **文件与复现索引** — 模块目录、关键脚本、配置、结果表和图的位置
- Visual design follows the bundled HTML template; the main agent must read the template before creating the report.

**NEW and CONTINUE mode**: both modes include the completion reminder, but neither mode adds a report step to the Todolist. In CONTINUE mode, the report should summarize the current project state and emphasize the newly completed incremental module(s).

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

## CONTINUE Mode Task Document (Incremental)

When creating a CONTINUE plan, your task document MUST additionally include:

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

## How the Worker Uses This File

1. Read this file
2. Note the `Analysis parent directory`, `Plan file`, and `Analysis modules`
3. For CONTINUE plans, also read the `Prior plan` and `Dependencies` to locate existing outputs
4. Find the first unchecked `- [ ]` in the Todolist，记下编号（如 `P03`）
5. Jump to the matching `### P03:` in Task Details
6. Read the `**Module**`, `**Script**`, `**Config**`, `**Input**`, and `**Output**` fields
7. Execute following the specification and skill, writing all generated files under the declared module directory
8. Do **not** create `README.md` files
9. Do **not** update checkboxes; the reviewer handles plan updates
10. Report results via handoff JSON

## How the Reviewer Uses This File

1. Read the Todolist to see which steps are checked off
2. Review the outputs of the latest completed step
3. Check that generated outputs are inside declared `<NN>_ModuleName/` directories and not inside `Task/`
4. Check that no module-level `README.md` files were created as part of the step
5. If issues found, update **this same plan file** directly:
   - Add new fix steps at the end of the Todolist（继续编号，如 P05, P06）
   - Add matching `### P05:`, `### P06:` Task Details subsections
   - 或修改已有条目的 Method notes 来纠正问题
6. The worker then picks up from the newly added/modified steps

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

Next action: Call sci_implement with planFile="Task/TaskN-YYYYMMDD.md" and cwd="/absolute/analysis_parent_dir" until all Todolist items are [x]. Then the main agent summarizes completion; the user runs `/generate-report` to write Report/TaskN-具体内容-YYYYMMDD.html when ready.
```
