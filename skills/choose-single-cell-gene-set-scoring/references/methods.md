# Method reference

Use this reference after the estimand and analysis unit are known. Choose by what the score measures, not by package familiarity.

## Ordinary expression signatures

| Method | Quantity estimated | Prefer when | Main limitation | Parameters or context to record |
|---|---|---|---|---|
| Mean expression | Average expression of observed signature genes | Transparent baseline, small coherent high-expression marker panels | Depth and intrinsically abundant genes dominate | layer, transform, missing-gene handling |
| Mean gene-wise Z-score | Average standardized expression across genes | Comparing relative expression patterns inside the fitted dataset | Depends on the cells used to estimate each gene's center and variance; scaled residuals can change interpretation | scaling population, clipping, assay/layer |
| AddModuleScore / `score_genes` | Target mean minus expression-matched control mean | Fast exploration inside one object | Control pool, bins, random sampling, and subsetting can change the reference | gene pool, bins, controls per gene, seed, full object versus subset, assay/layer |
| UCell | Mann–Whitney-U-derived within-cell rank score, typically with rank truncation | Ordinary signatures across compositionally different objects or large datasets | Sparse cells and rank truncation reduce resolution; separate studies remain uncalibrated | maximum rank, positive/negative handling, missing genes, input layer |
| AUCell | Recovery AUC of signature genes near the top of each cell's ranking | Active-cell calling, regulons, and programs expected to be concentrated in a subset | Depends on the top-rank window and threshold; ties among zeros matter | `aucMaxRank` or equivalent, detected-gene distribution, threshold procedure |
| singscore | Normalized within-sample ranks, with separate up and down components | Validated bidirectional signatures and independent per-cell scoring | Negative signatures are fragile under dropout | up/down membership, rank normalization, ties, missing genes |
| JASMINE | Rank signal combined with detected-member proportion | Moderate/large signatures where coverage carries biological information | Detection proportion is correlated with UMI depth and RNA content | scoring variant, detection definition, depth adjustment |

## Sample-level enrichment

| Method | Quantity estimated | Prefer when | Avoid when | Parameters or context to record |
|---|---|---|---|---|
| ssGSEA | Per-sample running-sum enrichment over the full gene ranking | Pseudobulk or dense sample-level expression, especially when continuity with bulk workflows matters | Raw sparse single cells with many tied zeros | normalization, exponent/weight, gene universe, sample unit |
| GSVA | Nonparametric sample-wise variation of gene-set expression across samples | Multiple biological samples or sample-by-cell-type pseudobulks | Treating thousands of cells as independent samples | expression scale, kernel/method, gene-set size limits, sample unit |

Use sample-by-cell-type pseudobulk when testing condition effects. A cluster average over all donors collapses replication and cannot substitute for independent samples.

## Network and footprint inference

| Method | Quantity estimated | Prefer when | Main limitation | Inputs to verify |
|---|---|---|---|---|
| PROGENy-style footprints | Signaling activity inferred from perturbation-responsive genes | The question concerns pathway signaling rather than expression of pathway members | Coverage and context of the footprint constrain validity | organism, footprint size, signed weights, tissue relevance |
| VIPER-style inference | Regulator activity inferred from signed/weighted regulons | TF or regulator activity where regulator mRNA is insufficient | Regulon quality and context dominate the result | regulon source, confidence, mode of regulation, minimum targets |
| decoupleR methods | Activity estimates from a network using ULM, MLM, weighted mean, VIPER-like, or consensus models | A signed/weighted regulator-target network is available and model comparison is justified | A consensus cannot repair a poor network | method, network columns, target overlap, weights, permutations or minimum targets |

## Tie-breakers

- Prefer UCell over matched-control scores when objects will be scored separately or their cell composition differs, but align gene identifiers and the assayed gene universe and avoid claiming universal raw-score comparability.
- Prefer AUCell over UCell when the scientific output is an active/inactive call driven by top-ranked genes; prefer UCell when the output is a continuous ordinary-signature ranking using the signature more broadly.
- Prefer singscore over unsigned rank methods only when both signature directions are biologically validated.
- Prefer a footprint or regulon model over any unweighted gene-set score when the estimand is causal pathway or TF activity.
- Prefer GSVA/ssGSEA over per-cell rank scores only after moving to a sample-level matrix suited to sample-level enrichment.

## Method-specific failure checks

- For matched controls, repeat with another seed and a reasonable control-pool specification; large rank changes reveal an unstable reference.
- For rank methods, inspect detected-gene counts and zero ties; a score-depth relationship can survive rank transformation.
- For AUCell, inspect the detected-gene distribution before fixing the top-rank window, then estimate and validate any active threshold rather than assuming a universal cutoff.
- For signed methods, score positive and negative arms separately before combining them.
- For network methods, report target overlap per regulator; an activity estimate supported by very few observed targets should be filtered or marked low confidence.
