# Validation and inference reference

Use these checks to decide whether a score reflects the intended biology and whether group comparisons use valid replication.

## Minimum diagnostic set

1. **Coverage:** Report how many signature genes are present in the assay and the distribution of detected signature members per cell or sample. This reveals when missingness changes the effective signature.
2. **Technical dependence:** Calculate within-relevant-stratum associations with library size, detected genes, mitochondrial fraction, and other assay-specific QC variables. Stratify by cell type or sample when pooled correlations would confound biology with composition.
3. **Dominance:** Inspect gene-level contributions and perform leave-one-gene-out scoring for small or suspicious signatures. Flag a score whose cell ranking collapses after one gene is removed.
4. **Expected controls:** Test known positive and negative cell populations, perturbations, or conditions. Use this as biological validation, not as circular evidence if those labels were defined from the same signature.
5. **Method sensitivity:** Compare with one method based on a different principle or vary a consequential parameter. Seek agreement in biological ordering, not numeric equality.
6. **Sample stability:** Recalculate summaries by donor or sample and verify that the reported effect is not driven by one specimen or by unequal cell counts.

## Cross-dataset comparisons

Before comparing separate datasets:

- harmonize species, identifiers, signature membership, gene universe, and input layer;
- use the same method and material parameters;
- inspect coverage and depth separately in every dataset;
- avoid interpreting equal raw scores as equal absolute biological activity unless calibration has been demonstrated;
- prefer within-dataset contrasts, ranks, effect sizes, or sample-level standardized summaries when platforms or preprocessing differ;
- include dataset or study structure in the statistical model rather than pooling cells as independent observations.

Rank-based methods reduce sensitivity to expression scale and object composition, but they do not remove batch effects or assay-specific missingness.

## Spatial transcriptomics

Treat a spot score as a mixture of expression programs from its contributing cells unless the platform is near single-cell resolution. Check score associations with spot library size and estimated cell-type proportions, and use deconvolution or within-compartment comparisons when a state signature is confounded with abundance.

## Active-cell thresholds

Use a threshold only when the biological question requires classification. Derive it from validated controls, a reproducible mixture or null model, or a prespecified quantile with clear interpretation. Report the thresholding rule and test its stability across samples; do not use zero for background-corrected scores or a package default as a universal biological boundary.

## Group-level inference

Keep the biological sample as the replicate. Acceptable patterns include:

- summarize cell scores within `sample × cell_type`, then compare samples;
- fit a mixed model with sample-level random or fixed effects when its assumptions fit the design;
- build sample-by-cell-type pseudobulk expression and score or test that matrix for sample-level pathway questions.

Do not use a cell-level Wilcoxon test as the sole condition-level evidence when treatment was assigned to samples. More cells increase measurement precision inside a sample; they do not increase the number of independent experimental units.

## Confidence rubric

- **High:** The estimand is explicit, the signature is well covered and not dominated, the method matches the data unit, expected controls behave correctly, and the effect is consistent across biological samples.
- **Medium:** The method is appropriate but coverage, negative genes, cross-dataset calibration, or sample consistency has a material uncertainty.
- **Low:** The signature is tiny or poorly observed, the input layer is unsuitable, the network has weak target overlap, technical covariates dominate, or replication does not support the requested inference.
