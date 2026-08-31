# Skill Audit & Repair — 2026-08

A two-phase skill-engineering pass over the Scientist extension's skill pool, executed by `ollama-cloud` DeepSeek subagents under `tmux`, audited against the [`writing-great-skills`](../../.agents/skills/writing-great-skills/SKILL.md) standard.

## Method

**Audit (19 skills).** Each skill reviewed by one DeepSeek subagent (`ollama-cloud/deepseek-v4-pro:0813`, fallback `deepseek-v4-flash:0731`) that first loaded `writing-great-skills/SKILL.md` + `GLOSSARY.md`, then produced a 5-section report (Invocation / Information Hierarchy / Steering / Pruning / Top fixes). Reports: `/tmp/skill-review/reports/*.md`.

**Repair (9 skills, Tier 1+2).** Each skill fixed by one DeepSeek subagent given its audit report, with `read/edit/write/bash` tools, constrained to edit only inside that skill's directory. Subagents printed a `CHANGELOG` + `SELF-CHECK: PASS|FAIL`. Skills backed up to `/tmp/skill-review/backup/skills/` before any edit.

**Verification.** Static frontmatter parse (19/19 valid), `pi --skill <dir>` load smoke test (9/9 reach stop), dead-pointer scan, contradiction check on every correctness bug.

## Audit findings — cross-skill pattern frequency

| Failure mode | Hits | |
|---|---|---|
| duplication | 142 | same meaning in >1 place (SKILL.md ↔ disclosed files, description ↔ body) |
| leading word missing | 115 | description not front-loading an anchor token |
| no-op | 84 | sentences that change nothing vs the model's default |
| sprawl | 58 | SKILL.md simply too long |
| premature completion | 54 | steps with uncheckable completion criteria |
| single source of truth | 43 | one rule maintained in multiple places |
| orphan files | 41 | disclosed files never pointed at from SKILL.md |
| context load | 35 | description synonym-piling every turn |
| completion criterion | 35 | vague or non-exhaustive bounds |
| co-location | 31 | a concept's definition/rules/caveats scattered |
| sediment | 12 | stale layers never cleared |
| dead/broken pointer | 6 | SKILL.md points at a file that doesn't exist |

## Repair summary — 9 skills

| Skill | SKILL.md lines | Δ | Deleted files | Self-check |
|---|---|---|---|---|
| publication | 89→86 | -3 | — | PASS |
| scanpy-cluster | 153→152 | -1 | 4 orphans | PASS |
| spatial-commot | 531→398 | -133 | — | PASS |
| scanpy-de | 203→111 | -92 | 1 orphan | PASS |
| scanpy-prep | 274→227 | -47 | — | PASS |
| squidpy-analysis | 800→122 | -678 | — | PASS |
| dnbc4tools | 231→51 | -180 | 3 orphan scripts | PASS |
| gene-prognosis-scan | 473→376 | -97 | — | PASS |
| visualization | 31→31 | 0 | — | PASS |
| **total SKILL.md** | | **-1231** | 8 files | |

New files created by subagents: `scanpy-cluster/references/resolution_selection.md`, `scanpy-prep/scripts/preprocess_full_gene.py`, `squidpy-analysis/references/napari.md`. `publication/` is a previously-untracked skill directory (now with `disable-model-invocation: true`).

### Correctness bugs resolved

- `scanpy-cluster` — dead pointer `references/parameter_selection.md` → repointed to `scanpy-prep/references/parameter_selection.md` (cross-skill reuse).
- `spatial-commot` — dead pointer `references/visualization-guide.md` deleted.
- `scanpy-de` — Decision Flow now includes the MAST branch (was self-contradictory with the method table).
- `scanpy-prep` — QC MT% thresholds (4 contradictory PBMC cutoffs: 5–8/5–10/8–10/10–15) unified into one tissue-specific table.
- `publication` — frontmatter now sets `disable-model-invocation: true` (was paying permanent context load for a description that forbade auto-invocation).
- `dnbc4tools` — `sample_sheet.tsv` rewritten to the 3-column `rna multi` format (was 7-column/pipe-delimited mismatch).
- `gene-prognosis-scan` — "four phases" → five; Rule 8 threshold `>100`→`>50`.

## Per-skill changelogs

### publication (Tier 1)
- SKILL.md: add `disable-model-invocation: true`, trim description to a human-facing one-liner front-loading "装配" — [fix #1,#5] invocation / leading word
- SKILL.md: move 流程 directly after 定位 — [fix #2] information hierarchy
- SKILL.md: merge 失败兜底 2 into 定位's boundary sentence — [fix #3] duplication
- SKILL.md: sharpen step 3 criterion to a checkable, exhaustive bar — [fix #4] completion criterion
- SKILL.md: collapse 不是-list prose into "装配之外的一切" — [fix #5] leading word
- SKILL.md: delete "不要制造不影响 notebook 的问题。" — [fix #6] no-op
- SKILL.md: merge step 5's "不要建 Task/README/Report" into 不是-list — [fix #7] single source of truth
- SKILL.md: sharpen step 1 criterion, merge "不修改" into 定位 — [§3/§4] completion criterion / duplication

### scanpy-cluster (Tier 1)
- SKILL.md: description → 18 words, front-loads "clustering"/"cell type annotation", one trigger per branch — [fix #2,#6] context load / leading word
- SKILL.md: removed duplicated "PCA not recomputed", "(recommended over Louvain)", "Blind resolution" pitfall, `set_figure_params` defaults — [fix #5] duplication
- SKILL.md: deleted "For routine analyses…" no-op sentence — [§4] no-op
- SKILL.md: added exhaustiveness bar "every cluster mapped to a cell type backed by ≥1 marker gene" — [fix #7] completion criterion
- SKILL.md: added pointer to `references/marker_database.py` — [fix #4] progressive disclosure
- references/api_reference.md, references/standard_workflow.md, assets/analysis_template.py, scripts/wilcoxon_markers.py: deleted (out-of-scope prep-phase orphans) — [fix #3,#4] relevance / sprawl / duplication
- SKIPPED: fix #1 (pointer edit) — broken `references/parameter_selection.md` already corrected to `scanpy-prep/references/parameter_selection.md`; the remaining broken cross-refs lived in `analysis_template.py`, removed via its deletion.

### spatial-commot (Tier 1)
- SKILL.md: description collapsed to leading word + one trigger per branch — [fix #3] description / context load
- SKILL.md: deleted 4 inlined tables (comparison, tuning, pitfalls, param quick-ref) → conditional pointers to disclosed files — [fix #1] progressive disclosure / duplication
- SKILL.md: deleted dead pointer `references/visualization-guide.md` — [fix #2] relevance / variance
- SKILL.md: added "Done when:" completion criteria to Steps 2–8 — [fix #4] completion criterion / premature completion
- SKILL.md: `dis_thr` platform values → single table in `parameter_guide.md` — [fix #5] single source of truth
- SKILL.md: disclosed `assets/analysis_template.py` + `scripts/setup_environment.sh` — [fix #6] relevance
- SKILL.md: adopted "spatial constraint" leading word — [fix #7] leading word
- SKILL.md: deleted no-op lines, merged Key References table — [§4] no-op / duplication

### scanpy-de (Tier 1)
- SKILL.md: description 16 triggers → 5 (one per branch), cut identity — [fix #2] duplication / context load
- SKILL.md: deleted 4 inline code blocks → reworded pointers — [fix #3,#4] duplication / sprawl / context pointer
- SKILL.md: Decision Flow now includes the MAST branch, co-located with the Method Selection table — [fix #1,#5] correctness / co-location
- SKILL.md: merged pitfalls + thresholds, single `min_cells` value — [fix #5] co-location / single source of truth
- SKILL.md: surfaced the QC checklist as an exhaustiveness bar — [fix #6] completion criterion / legwork
- references/best-practices.md: deleted (orphan merged into SKILL.md) — [fix #1] single source of truth
- references/{wilcoxon,pseudobulk,mast,scvi-de}-method.md: shrunk 281/350/333/415 → 91/116/120/118 lines — [fix #7] sprawl

### scanpy-prep (Tier 2 — flash fallback after pro length-truncation)
- SKILL.md: description rewritten — front-loads "upstream prep", one trigger per branch — [fix #4] invocation
- SKILL.md: deleted "When to Use" + "Key Parameters" (duplicated disclosed tables) — [fix #6] duplication
- SKILL.md: deleted "Understanding AnnData Structure" block (pretraining no-op) — [fix #5] no-op
- SKILL.md: storage rules collapsed under one heading ("Data Storage Contract") — [fix #1] single source of truth / co-location
- SKILL.md: deleted duplicate `qc_pass` flag, Common Pitfalls #1/#2/#7 restatements — [fix #1] duplication
- SKILL.md: "Verify Storage After Pipeline" → completion criterion with integer-dtype + raw-shape asserts — [fix #7] completion criterion
- SKILL.md: cut "proactively ask whether to continue with clustering or DE" (post-completion step) — [fix #7] premature completion
- references/parameter_selection.md: STEP 4–7 branches + §4–§7 cut (PCA/neighbors/clustering/DE = downstream skills), §2.1 Full-Gene Data Contract deleted, cheat-sheet PBMC cap aligned to the single threshold table — [fix #3,#1,#2] relevance / sprawl / contradiction

### squidpy-analysis (Tier 2)
- SKILL.md: rewrote to ~122-line module index — deleted inline parameter tables, code snippets, Core Workflow diagram, Statistical Method Guidance, Quantified Minimums, Version History, inline citations — [fix #1,#6,#7] progressive disclosure / single source of truth / sediment
- SKILL.md: description → leading word + one trigger per branch — [fix #2] context load / duplication
- SKILL.md: replaced "LOOK UP, DON'T GUESS" with `verify` token at each function heading — [fix #5] leading word / no-op
- SKILL.md: added co-located "Version notes" + sharpened "Non-negotiables" (checkable, exhaustive) — [fix #6] co-location / completion criterion
- references/napari.md: created — full Napari section moved behind a pointer — [fix #3] progressive disclosure / branch
- references/parameter_guide.md: merged Statistical Method Guidance + pros/cons + nhood_enrichment-vs-co_occurrence table — [fix #6] single source of truth / co-location

### dnbc4tools (Tier 2)
- SKILL.md: rewrote to a 51-line index — deleted all duplicated tables/command blocks, kept doc index + two must-have gotchas inline — [fix #1] single source of truth / sprawl
- SKILL.md: description front-loads `dnbc4tools`, drops content summary + identity, one trigger per branch — [fix #2] leading word / context load
- SKILL.md: inlined the `ref.json` copy as the mkref completion criterion — [fix #3] completion criterion / premature completion
- SKILL.md: deleted non-standard `triggers:` field + `version: "1.0"` — [fix #6] relevance
- docs/REFERENCE_GENOME.md: removed mkgtf `--type` + ref.json copy duplication — [fix #5,#3] duplication / single source of truth
- docs/TROUBLESHOOTING.md + SCRNA_WORKFLOW.md: removed duplicate gotcha sections — [fix #5] duplication
- docs/MULTI_SAMPLE.md: removed inline sample_sheet template, kept a pointer — [fix #4] co-location
- resources/templates/sample_sheet.tsv: rewrote to the 3-column `rna multi` format — [fix #4] co-location
- scripts/{batch_run,check_system,estimate_resources}.sh: deleted (orphaned) — [fix #4] relevance

### gene-prognosis-scan (Tier 2)
- SKILL.md: 23-phrase bilingual description → front-loaded "pan-cancer prognosis scan" + 3 branches — [fix #1] description / context load / duplication
- SKILL.md: deleted Rules 4/8/10/12/13, the 16-row Tool Limitations table, duplicated code blocks — [fix #2] single source of truth / duplication / sprawl
- SKILL.md: fixed "four phases" → five; re-sequenced Phase 3 into the workflow — [fix #3] relevance / co-location
- SKILL.md: Rule 1 → two-pass raw-REST resolution (Phase 0) as the single ID mechanism — [fix #4] context pointer / predictability
- SKILL.md: HPA call carries `operation`; CLI form is JSON — [fix #5] predictability
- SKILL.md: Phase 1 criterion sharpened to exhaustive — [fix #6] completion criterion / legwork
- SKILL.md: deleted no-ops; fixed Rule 8 threshold `>100`→`>50` — [§4] no-op / relevance
- references/tool-reference.md: made the single source of truth for tool schemas/pitfalls — [fix #2] single source of truth / duplication

### visualization (Tier 2)
- SKILL.md: description rewritten — front-loads "publication-quality", added scplotter (TCR/BCR, spatial, CCC, RNA velocity) + general-chart triggers — [fix #2] description / context load
- SKILL.md: deleted "One language (R)" + false "All branches share one visual standard" claim — [fix #1] single source of truth
- SKILL.md: deleted the Gate's inline re-summary of figure-standards.md (incl. fabricated "2.5–3.0″"), kept only the pointer — [fix #3] single source of truth / duplication
- SKILL.md: "Done" gate made branch-conditional (theme_elegant for BasicViz/ggplot2; scplotter's own theming); Done #2 → "all 32 standards" exhaustive — [fix #1,#4] completion criterion clarity + demand
- shared/figure-standards.md: deleted worker/reviewer framing + Severity Levels + MANDATORY BLOCKERS review machinery — [§4] sediment / relevance
- r-pipeline/references/theme-and-colors.md: deleted Color Management + setup_python() sections — [§2/§4] relevance / sprawl
- r-pipeline/references/scplotter-api.md: deleted LLM-Assisted Visualization, Key Parameters, Built-in Datasets, External Resources — [fix #5] sprawl / relevance
- r-pipeline/references/ggplot2-patterns.md: fixed dangling pointer → "is below (Key design rules)" — [fix #6] context pointer wording

## Remaining — Tier 3 (not yet repaired)

10 skills audited but not yet fixed; their reports live in `/tmp/skill-review/reports/`. Typical Tier-3 findings are description synonym-piling and missing leading words, light-touch rewrites:

`analysis-planning`, `choose-single-cell-gene-set-scoring`, `geo-finder`, `pyscenic-single-cell-analysis`, `scanpy-annotate`, `scanpy-cellcommunication`, `scientific-brainstorming`, `statistical-testing`, `tmux-runner`, `tooluniverse-min`.

Notable Tier-3 correctness bugs still open:
- `scanpy-cellcommunication` — ~3,300 lines of orphaned disclosed reference; `workflow_detailed.md` vs `workflow-detailed.md` one-character collision.
- `scientific-brainstorming` — 5 phases with no checkable completion criteria.

## Artifacts

- Audit reports: `/tmp/skill-review/reports/*.md` (19 files)
- Per-skill changelogs: `/tmp/skill-review/fixlogs/*.changelog.md` (9 files)
- Pre-repair backup: `/tmp/skill-review/backup/skills/`
- Runner scripts: `run-review.sh`, `run-fix.sh`, `run-fix-tier2.sh`, `fix-scanpy-prep.sh`
- Subagent prompts: `prompts/reviewer-system.md`, `prompts/fixer-system.md`