---
name: choose-single-cell-gene-set-scoring
description: Choose a gene-set scoring method by its estimand — the biological quantity the score estimates. Use when selecting among mean/Z, module, rank, sample-level, or network scoring methods; when reviewing a gene signature; or when interpreting a score's estimand.
---

# Choose Single-Cell Gene-Set Scoring

Treat method selection, signature quality control, and validation as one workflow.

## Run the workflow

### 1. Define the estimand before naming a method

Classify the user's question into one of these targets:

- **Expression program:** Ask whether a marker or state program is coordinately expressed.
- **Relative module expression:** Ask whether a gene set is elevated above expression-matched background inside one object.
- **Active-cell detection:** Ask which cells strongly switch on a program or regulon.
- **Pathway activity:** Ask whether a signaling pathway produced its expected downstream transcriptional response.
- **TF activity:** Ask whether a transcription factor's signed targets follow the expected regulon pattern.
- **Sample-level enrichment:** Ask whether pathways differ across biological samples, conditions, or sample-by-cell-type pseudobulks.

Do not substitute a marker score for pathway or TF activity. If the goal is genuinely ambiguous and the answer would change the method, ask one concise question; otherwise state the inferred target and continue.

### 2. Establish the analysis unit and comparison design

Collect or infer:

- analysis unit: cell, nucleus, spatial spot, cluster average, or sample-by-cell-type pseudobulk;
- input layer: raw counts, normalized/log-normalized expression, scaled residuals, or ranks;
- comparison: within one object, across samples, across batches, or across datasets with different cell composition;
- gene-set structure: positive only, positive plus negative, or signed and weighted network;
- signature size, identifier type, dataset overlap, per-cell coverage, sparsity, and sequencing depth;
- biological replication and the level at which inference will be performed.

Do not treat cells as biological replicates; see [references/validation.md](references/validation.md) for the valid group-level inference patterns.

### 3. Audit the signature before scoring

Perform these checks and report every failing check with the observed evidence:

1. Normalize gene identifiers, resolve species and ortholog mapping, remove duplicates, and report missing genes.
2. Reject overlap between positive and negative sets unless the conflict is explicitly resolved.
3. Treat fewer than 5 observed genes as high risk and 5–10 as fragile. Treat these as heuristics, not universal cutoffs.
4. Report both dataset-wide overlap and per-cell detection coverage; low coverage can make a nominally large signature behave like a tiny one.
5. Check whether one or two highly expressed genes dominate the score with per-gene contribution or leave-one-gene-out analysis.
6. Flag lineage markers in a state signature and mitochondrial, ribosomal, dissociation, stress, ambient-RNA, and cell-cycle genes when they can answer a different biological question.
7. Verify that negative genes encode a true opposing state. Zero expression in sparse data is not reliable evidence of down-regulation.

If the signature fails these checks, recommend repairing it before choosing a more sophisticated algorithm.

### 4. Apply the decision tree

Use this precedence order so a downstream branch cannot override the biological target:

```text
Is the target TF activity?
├─ yes → signed regulon + decoupleR/VIPER-style inference
└─ no
   Is the target signaling-pathway activity?
   ├─ yes → perturbation-derived footprint such as PROGENy via decoupleR
   └─ no
      Is the analysis unit pseudobulk or cluster/sample average?
      ├─ yes → GSVA or ssGSEA for enrichment; network methods for TF/pathway activity
      └─ no: cell, nucleus, or spatial spot
         Is the goal to call a small active subset or score a regulon by top-ranked genes?
         ├─ yes → AUCell
         └─ no
            Does the signature contain validated positive and negative arms?
            ├─ yes → singscore or another signed rank method
            └─ no
               Must scores be stable to object composition or computed in separate objects?
               ├─ yes → UCell as the ordinary-signature default
               └─ no: within-object exploration → AddModuleScore or score_genes
```

Read [references/methods.md](references/methods.md) when selecting among close alternatives, explaining parameters, or implementing a method. Read [references/validation.md](references/validation.md) when designing confirmatory analysis, cross-dataset comparisons, thresholds, or statistical tests.

### 5. Preserve the method's interpretation

State what the returned number means and what it does not mean. The per-method interpretation and overclaim guards are in [references/methods.md](references/methods.md).

### 6. Recommend one primary method and one purposeful check

Choose a primary method that matches the estimand. Add a secondary method only when it tests a real sensitivity, preferably from a different scoring family; do not present a vote among many algorithms.

### 7. Return an actionable decision

Return compact technical prose with this content:

```yaml
estimand: expression_program | relative_module | active_cells | pathway_activity | tf_activity | sample_enrichment
primary_method: method name
why: design-specific mechanism and consequence
secondary_check: method or diagnostic, with its purpose
input_layer: required matrix or rank representation
parameters_to_record: only parameters that materially affect interpretation
signature_qc: pass/warn/fail plus observed issues
not_recommended: methods excluded for this design and why
validation: 3-6 concrete checks
inference_unit: biological level used for condition testing
interpretation_limit: one sentence preventing the likeliest overclaim
confidence: high | medium | low, with the reason
```

If the user asks for code, first identify the ecosystem and object type, then implement the selected method with a fixed seed where randomness exists, explicit assay/layer selection, preserved raw signature membership, and recorded package versions and parameters. Do not invent API arguments; inspect the installed package or current primary documentation when exact syntax matters.
