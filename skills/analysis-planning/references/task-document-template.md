# TaskN: [Short Title]

> Optional template for long or resumable projects. For a few steps, use a short checklist instead. Remove unused fields and sections; placeholders are not analysis defaults.
> Created: YYYY-MM-DD | Status: READY / RUNNING / BLOCKED / COMPLETE | Progress: 0/N
> Analysis root: `/absolute/project/path`
> Plan file: `Task/TaskN-YYYYMMDD.md`
> Prior work: [relevant plan/output paths, if any]

## Goal and Scope

[Question, endpoint, requested deliverables, and interpretation boundaries. Reuse decisions already given by the user.]

## Inputs and Dependencies

| Input / existing output | Meaning and checks | Used by |
|-------------------------|--------------------|---------|
| `path/to/input.h5ad` | [organism, samples/groups, matrix semantics, QC/provenance] | P01 |

## Output Layout

Analysis modules use `<NN>_ModuleName/` with `scripts/stages/`, `scripts/config/`, `scripts/utils/`, and `results/data/`, `results/tables/`, `results/plots/`. Record the concrete module names and output paths below. Tmux logs/status/manifest belong in `<Module>/tmux/`. No generated analysis artifacts under `Task/`; no module README, analysis `logs/`, `99_Report/`, or `RFINAL`. Preserve original inputs and existing results unless an overwrite is explicitly authorized. These conventions apply even when no Task file is used.

## Checklist

- [ ] **P01**: [Action and expected result]
- [ ] **P02**: [Action and expected result]

The main agent updates progress after validating worker evidence, with evidence and blockers below. Add or revise steps as needed; independent review is optional and read-only.

## Step Details (Only Where Useful)

### P01: [Title]

- **Input**: [paths and prerequisite outputs]
- **Method**: [method, key parameters, rationale; relevant skill/reference]
- **Module**: `<NN>_ModuleName/`
- **Execution**: [script under `scripts/stages/`, configuration under `scripts/config/`, helpers under `scripts/utils/`; command and environment]
- **Output**: [concrete paths under the module's `results/data/`, `results/tables/`, and `results/plots/`]
- **Validation**: [artifact integrity and scientific/statistical checks]
- **Runtime**: [estimate; tmux/log paths if useful]
- **Result / blocker**: [actual outcome, evidence, and any unresolved issue]

[Add matching details for other checklist items only when they need this level of detail.]

## Scientific Design and Reproducibility

- Experimental unit, biological replicates, groups/contrasts, pairing: [known design]
- Covariates, batch handling, exclusions, missingness: [decisions and rationale]
- Matrix/gene-ID semantics and preprocessing: [verified state; preserve counts and gene coverage]
- Methods, versions, seeds, parameter justification: [actual choices, not assumed versions]
- Statistical reporting: [effect sizes, uncertainty, multiple-testing correction as applicable]
- Assumptions, interpretation limits, unresolved consequential choices: [notes]

## Success Criteria

- [ ] Required scripts/notebooks actually executed successfully; commands/logs recorded
- [ ] Expected files exist, are readable, and have correct dimensions, identifiers, and contents
- [ ] Outputs follow the fixed module layout; original data and prior results protected
- [ ] Data semantics and sample/group alignment validated
- [ ] Statistical design, tests, and reporting appropriate to the question
- [ ] Figures checked visually and conclusions supported by the results
- [ ] Uncertainty, failed checks, missing evidence, and scope changes disclosed

## Progress and Completion Notes

[Executor records completed steps and checks, outputs, failures, and next useful action. Do not label unexecuted work as complete.]

When finished, summarize results, paths, and caveats to the user. Generate a report only when requested; see [report format guidance](../SKILL.md#completion-and-reports). A report is not a mandatory checklist step. Do not commit without user authorization.
