---
name: scanpy-de
description: 'Single-cell differential expression analysis: find genes that differ between conditions, treatments, or groups in scRNA-seq data. Use when the user wants Wilcoxon, pseudobulk + DESeq2/edgeR, MAST, or SCVI DE (单细胞差异表达). For within-cluster marker genes (cluster vs rest), use scanpy-cluster instead.'
---

# Scanpy-DE: Single-Cell Differential Expression Analysis

## Overview

Using the wrong method causes pseudoreplication and inflated false discovery rates. Pick the method from the experimental design, then follow that method's reference file for the full workflow.

**Data prerequisite**: Reuse validated preprocessed data; use **scanpy-prep** only for missing or explicitly requested preparation. The AnnData must be QCed, keep full-gene log-normalized expression in `X`, and keep full-gene integer-valued counts in `layers["counts"]`. `.raw` is not a count source. If comparing conditions within cell types, verify existing annotations or obtain them with **scanpy-annotate**. Clarify unresolved contrasts, experimental units, replicates, and covariates before testing; do not re-ask design choices already specified.

## Method Selection

| Scenario | Method | Why |
|----------|--------|-----|
| Quick marker genes (no biological replicates) | Wilcoxon (scanpy built-in) | Fast, no extra packages needed |
| Multi-biological-replicate studies | Pseudobulk + DESeq2/edgeR | Gold standard FDR control |
| Sparse data with high dropout | MAST | Zero-inflation modeling |
| Complex batch effects across conditions | SCVI-tools | Integrated batch correction in model |

Decision flow:

```
Have biological replicates (≥3 per condition)?
       /            \
     YES             NO
      |               |
Use Pseudobulk    Complex batch structure?
(DESeq2/edgeR)       /        \
                   YES          NO
                    |            |
            Use SCVI-tools   High dropout rate?
            (batch_corr=True)   /        \
                              YES          NO
                               |            |
                          Use MAST     Use Wilcoxon
                                       (quick markers)
```

Each method's full workflow lives in its reference file:

- Wilcoxon: `references/wilcoxon-method.md` — implementation, parameter tuning, result structure
- Pseudobulk + DESeq2/edgeR: `references/pseudobulk-method.md` — Python aggregation + R DESeq2/edgeR (end-to-end script: `scripts/pseudobulk_pipeline.py`)
- SCVI-tools: `references/scvi-de-method.md` — setup, training, DE modes, result interpretation (end-to-end script: `scripts/scvi_de_analysis.py`)
- MAST: `references/mast-method.md` — hurdle model, covariates, result interpretation

## Critical Thresholds

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `min_fold_change` | 1.5-2.0 | Filter weak effects |
| `min_in_group_fraction` | 0.25-0.30 | Ensure gene expressed in target |
| `max_out_group_fraction` | 0.5 | Ensure specificity |
| `pvals_adj` | < 0.05 | FDR-corrected significance |
| `proba_de` (SCVI) | > 0.95 | Bayesian probability threshold |
| `min_cells` (pseudobulk) | >= 10 | Reliable aggregation per sample |
| `min_samples` (pseudobulk) | >= 3 | Minimum biological replicates required |

## Common Pitfalls

1. **Pseudoreplication**: Using Wilcoxon with multiple biological replicates treats each cell as independent, inflating false positives. Use pseudobulk + DESeq2/edgeR when you have biological replicates.

2. **Batch correction before DE**: If you run batch correction as a preprocessing step and then DE on the corrected data, the DE test won't account for uncertainty in the correction. Use SCVI-tools which integrates batch correction into the statistical model.

3. **Ignoring donor/patient effects**: Even after batch correction, donor-specific effects persist. Always include donor as a covariate (pseudobulk) or use models that handle it (SCVI, MAST).

4. **Simple t-tests on scRNA-seq data**: Zero-inflated distributions violate t-test assumptions of normality and homoscedasticity. Use methods designed for scRNA-seq.

5. **Over-filtering genes**: Aggressive filtering removes informative lowly-expressed genes. Use conservative filtering (e.g. `min_cells=3`); rely on statistical testing to filter noise.

## Quality Control Checklist

Before finishing a DE run, work through every item and confirm it holds.

Before running DE:

- [ ] Raw counts preserved (not just normalized)
- [ ] Cell type annotations verified
- [ ] Batch/donor information recorded
- [ ] Sufficient cells per group (≥10 for Wilcoxon, ≥3 replicates for pseudobulk)
- [ ] QC filtering appropriate for tissue type
- [ ] Method selected based on experimental design

After running DE:

- [ ] Results make biological sense
- [ ] Known marker genes detected
- [ ] Fold changes reasonable
- [ ] Multiple testing correction applied
- [ ] Results validated by independent method (if critical)

## Reporting Guidelines

When reporting scRNA-seq DE results, include: method used, rationale for method choice, covariates included, filtering thresholds, number of replicates per condition and cell type, and validation.

## Key References

1. Squair et al. (2021) Nat Commun 12:5692 — Pseudoreplication bias in scRNA-seq DE
2. Nguyen et al. (2023) Nat Commun 14:1570 — Benchmarking scRNA-seq DE methods
3. Wu et al. (2025) Genome Biology 26:58 — Shortcomings in scRNA-seq DE
4. sc-best-practices.org/conditions/differential_gene_expression.html
5. Harvard Chan Bioinformatics Core — Pseudobulk tutorial

## Next Steps

After identifying DE genes:
- **gene-prognosis-scan** — check clinical relevance of DE genes
- **scanpy-cluster** — if you haven't annotated cell types yet
- **scanpy-cellcommunication** — cell communication involving DE genes
