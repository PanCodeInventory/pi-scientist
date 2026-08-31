# Skill Audit & Repair — 2026-08

A two-phase skill-engineering pass over the Scientist extension's skill pool, executed by `ollama-cloud` DeepSeek subagents under `tmux`, audited against the [`writing-great-skills`](../../.agents/skills/writing-great-skills/SKILL.md) standard.

## Method

**Audit (19 skills).** Each skill reviewed by one DeepSeek subagent (`ollama-cloud/deepseek-v4-pro:0813`, fallback `deepseek-v4-flash:0731`) that first loaded `writing-great-skills/SKILL.md` + `GLOSSARY.md`, then produced a 5-section report (Invocation / Information Hierarchy / Steering / Pruning / Top fixes). Reports: `/tmp/skill-review/reports/*.md`.

**Repair (19 skills, Tier 1+2+3).** Each skill fixed by one DeepSeek subagent given its audit report, with `read/edit/write/bash` tools, constrained to edit only inside that skill's directory. Subagents printed a `CHANGELOG` + `SELF-CHECK: PASS|FAIL`. Skills backed up to `/tmp/skill-review/backup/skills/` before any edit. Tier 3 additionally forbade cross-directory file moves (e.g. `report-template.html`, which `core/commands.ts` resolves).

**Verification.** Static frontmatter parse (19/19 valid), `pi --skill <dir>` load smoke test (19/19 reach stop), dead-pointer scan, contradiction check on every correctness bug.

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

## Repair summary — 19 skills

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
| analysis-planning | 432→175 | -257 | — | PASS |
| choose-single-cell-gene-set-scoring | 123→106 | -17 | — | PASS |
| geo-finder | 88→70 | -18 | — | PASS |
| pyscenic-single-cell-analysis | 94→62 | -32 | — | PASS |
| scanpy-annotate | 206→184 | -22 | `__pycache__/*.pyc` | PASS |
| scanpy-cellcommunication | 279→265 | -14 | 2 files renamed | PASS |
| scientific-brainstorming | 189→145 | -44 | — | PASS (frontmatter quote fixed manually) |
| statistical-testing | 114→84 | -30 | — | PASS |
| tmux-runner | 121→114 | -7 | — | PASS |
| tooluniverse-min | 210→81 | -129 | — | PASS |
| **total SKILL.md** | | **-1801** | 8 deleted, 5 created, 2 renamed | 19/19 |

New files created by subagents: `scanpy-cluster/references/resolution_selection.md`, `scanpy-prep/scripts/preprocess_full_gene.py`, `squidpy-analysis/references/napari.md`, `analysis-planning/references/task-document-template.md`, `statistical-testing/quick-reference.md`, `tooluniverse-min/BATCH.md`. Renamed: `scanpy-cellcommunication/references/{workflow-detailed.md,workflow_detailed.md}` → `{cellchat-workflow-detailed.md,liana-workflow-detailed.md}` (branch-distinct, one-character collision cured). `publication/` is a previously-untracked skill directory (now with `disable-model-invocation: true`).

### Correctness bugs resolved

- `scanpy-cluster` — dead pointer `references/parameter_selection.md` → repointed to `scanpy-prep/references/parameter_selection.md` (cross-skill reuse).
- `spatial-commot` — dead pointer `references/visualization-guide.md` deleted.
- `scanpy-de` — Decision Flow now includes the MAST branch (was self-contradictory with the method table).
- `scanpy-prep` — QC MT% thresholds (4 contradictory PBMC cutoffs: 5–8/5–10/8–10/10–15) unified into one tissue-specific table.
- `publication` — frontmatter now sets `disable-model-invocation: true` (was paying permanent context load for a description that forbade auto-invocation).
- `dnbc4tools` — `sample_sheet.tsv` rewritten to the 3-column `rna multi` format (was 7-column/pipe-delimited mismatch).
- `gene-prognosis-scan` — "four phases" → five; Rule 8 threshold `>100`→`>50`.
- `scanpy-cellcommunication` — `expr_prop` bound single-valued (">0.3" → ">0.2", matching the Key Parameters row); all ~3,300 lines of orphaned disclosed reference wired in via pointers; `workflow_detailed.md`/`workflow-detailed.md` one-character collision cured by branch-distinct rename.
- `tooluniverse-min` — proxy port 7897→7890 unified (matches the wrapper's actual `http://127.0.0.1:7890`); dead pointers `scripts/setup/…` → `setup/…` fixed in SKILL.md + README; false "no NCBI-dependent tools" description claim removed.
- `tmux-runner` — the two time thresholds (~1 min vs 2 min) resolved to "~2 minutes is the operative threshold".
- `scientific-brainstorming` — subagent wrote an unquoted `description: Brainstorming: act…` that broke YAML parsing; quote-wrapped manually afterwards (verified 19/19 frontmatter parse).

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

## Tier 3 changelogs (all 10 repaired)

### analysis-planning
- SKILL.md: description front-loads "PLAN stage"; dropped no-op "must read and follow" + identity — [fix #3]
- SKILL.md: deleted "Final Report (On-Demand, Main Agent Only)" section + its Skill References bullet — [fix #1]
- SKILL.md: collapsed "no README/report step/99_Report/RFINAL/logs" into one Forbidden-outputs line (step 7); removed 11 restatements — [fix #2]
- SKILL.md: collapsed completion reminder / report filename / Task-is-plan-only each into its single home — [fix #2]
- SKILL.md: disclosed the Task Document Structure template to `references/task-document-template.md`, pointed from step 6 — [fix #4]
- SKILL.md: sharpened step 6 criterion to enumerate required sections — [fix #5]
- SKILL.md: deleted "Why This Structure" + no-ops; body anchor token switched to "plan" — [fix #3/#6]
- references/task-document-template.md: created; completion reminder has its single home there — [fix #2/#4]
- SKIPPED: fix #1 (file move) — `references/report-template.html` stays: `core/commands.ts:14` resolves `/generate-report`'s template at `skills/analysis-planning/references/report-template.html`; moving it would break the command (needs-manual-move if ever relocated).
- SKIPPED: fix #7 — broken pointer deleted with the Final Report section; nothing left to fix.

### choose-single-cell-gene-set-scoring
- SKILL.md: description front-loads **estimand**; 13-name method list → family triggers; verb×noun matrix → "interpreting a score's estimand" — [fix #1/#4/#7]
- SKILL.md: step 2 replication rule collapsed to gotcha + pointer to validation.md — [fix #5]
- SKILL.md: step 3 criterion → "report every failing check with the observed evidence" — [fix #6]
- SKILL.md: step 5 interpretation bullets → pointer to methods.md — [fix #3]
- SKILL.md: step 6 six defaults deleted (tree is the single source) — [fix #2]
- references/methods.md: overclaim guards co-located into AddModuleScore/AUCell/singscore rows — [fix #3]
- NOTE: `agents/openai.yaml` left in place — platform agent config, not a disclosed reference; deleting risks breakage.

### geo-finder
- SKILL.md: description front-loads "GEO", one trigger per branch; GEO synonym pile dropped — [fix #1]
- SKILL.md: Step 1 completion criterion "hold a list of candidate GSE accessions" — [fix #2]
- SKILL.md: non-standard `compatibility` frontmatter removed; whitelist note single-homed — [fix #3]
- SKILL.md: Key-parameters column + search-tool map + Example section deleted — [fix #4/#5]
- SKILL.md: "epigenomics tools" → "assay-specific tools"; Step 0 pre-flight owns the proxy note — [fix #6, §2]

### pyscenic-single-cell-analysis
- SKILL.md: description → one branch trigger; "Covers Human and Mouse…" identity dropped — [fix #1]
- SKILL.md: inline CLI/Python workflows → specific pointers to the two templates — [fix #2]
- SKILL.md: gene-symbol validation gate moved to step 1, before `grn` — [fix #3]
- SKILL.md: ctx step criterion — "regulons.csv non-empty; if empty stop and run validate_genes.py" — [fix #4]
- docs/TROUBLESHOOTING.md + python template: duplicates removed; raw-counts rule single-homed in Overview — [fix #5/#6]

### scanpy-annotate
- SKILL.md: 16-trigger description → 3 (EN/CN + cluster-identify) — [fix #1/#2]
- SKILL.md: stale `(943 lines)` detail deleted; `__pycache__/*.pyc` removed — [fix #3]
- SKILL.md: Common Pitfalls merged into their steps (co-location) — [fix #4]
- SKILL.md: Step 1 criterion — "one inference + 3 validation genes per cluster, every cluster" — [fix #5]
- SKILL.md: Overview "Two tiers" → "Three tiers" (admits Gene Set Scoring branch) — [fix #6]

### scanpy-cellcommunication
- SKILL.md: description 17 triggers → 6; "Two approaches" identity dropped — [fix #3]
- SKILL.md: all orphaned disclosed reference wired in via pointers (liana-workflow-detailed, api_reference, methods_comparison, visualization-guide, troubleshooting, database-reference, examples/, scripts/, assets/) — [fix #1]
- references/workflow-detailed.md → cellchat-workflow-detailed.md; references/workflow_detailed.md → liana-workflow-detailed.md (collision cured) — [fix #2]; scripts/setup-environment.R stale pointer updated
- SKILL.md: Step 0 criterion "Q1–Q4 answered"; three method-selection sites merged into one — [fix #4/#5]
- SKILL.md: `expr_prop` single-valued (>0.2); NMF snippet + Common Visualizations → pointers — [fix #6/#7, §4]

### scientific-brainstorming
- SKILL.md: description front-loads "Brainstorming" + "thought partner" token — [fix #3]
- SKILL.md: "When to Use This Skill" deleted (duplicated description) — [fix #2]
- SKILL.md: Phases 1–5 each got a checkable "Done when" criterion — [fix #1]
- SKILL.md: Adaptive Techniques → one line per branch; Resources section deleted (single sharpened pointer in Phase 2) — [fix #5/#6]
- SKILL.md: tone no-ops deleted — [fix #4]
- Post-fix: frontmatter `description` quote-wrapped manually (subagent wrote unquoted colon-bearing value breaking YAML).

### statistical-testing
- SKILL.md: description → one trigger per branch, leading word front-loaded — [fix #1]
- SKILL.md: DESeq2 re-correction rule + effect-size rows merged to single homes — [fix #2/#3]
- SKILL.md: Quick Reference code blocks → pointer to `quick-reference.md` — [fix #5]
- quick-reference.md: created (disclosed code reference) — [fix #5]

### tmux-runner
- SKILL.md: description front-loads `long-running`/`tmux`; content inventory cut — [fix #1]
- SKILL.md: wrapper contract trimmed to non-obvious facts; `.sh` is the single site — [fix #2/#5]
- SKILL.md: Verify steps 2–3 → checkable/exhaustive criteria; step 4 merged into step 1 — [fix #3/#4]
- SKILL.md: time thresholds resolved — "~2 minutes is the operative threshold" — [fix #7]

### tooluniverse-min
- SKILL.md: description front-loads `tu`/ToolUniverse; false "no NCBI-dependent tools" claim dropped — [fix #1]
- SKILL.md: 28-category catalog tables deleted (CLI `list`/`find` is live source) — [fix #3]
- SKILL.md: L1–L9 Production Lessons → pointer to `BATCH.md` keyed on ">100 calls / in-process API" — [fix #2]
- SKILL.md + README.md: dead pointers `scripts/setup/…` → `setup/…`; proxy port 7897 → 7890 (matches wrapper) — [fix #4, correctness]
- BATCH.md: created (L1–L3, L5–L9; L4 pipefail block deleted) — [fix #2]
- setup/install-python-deps.sh: whitelist reads from the wrapper via sed; "95-106 tools" → "~106 tools" — [fix #5, §4]

## Remaining work

All 19 skills repaired (Tier 1+2+3), verified, and committed. Open follow-ups:

- `analysis-planning/references/report-template.html` stays in the skill directory because `core/commands.ts:14` resolves `/generate-report`'s template there. If the skill is ever restructured, that path must move with it (or the skill should own the template only via the command).
- `choose-single-cell-gene-set-scoring/agents/openai.yaml` — platform agent config, left in place deliberately.
- Audit reports and pre-repair backup live under `/tmp/skill-review/` and will not survive reboot; the audit method + changelogs are preserved in this document.

## Artifacts

- Audit reports: `/tmp/skill-review/reports/*.md` (19 files)
- Per-skill changelogs: `/tmp/skill-review/fixlogs/*.changelog.md` (19 files)
- Pre-repair backup: `/tmp/skill-review/backup/skills/`
- Runner scripts: `run-review.sh`, `run-fix.sh`, `run-fix-tier2.sh`, `fix-scanpy-prep.sh`, `run-fix-tier3.sh`
- Subagent prompts: `prompts/reviewer-system.md`, `prompts/fixer-system.md`