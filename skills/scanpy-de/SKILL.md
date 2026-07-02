---
name: scanpy-de
description: 'Single-cell differential expression analysis: method selection and code patterns for comparing conditions in scRNA-seq data. Use this AFTER scanpy-prep when you have QCed data and need to find genes that differ between conditions, treatments, or groups. Triggered by: single-cell differential expression, scRNA-seq DE, pseudobulk, MAST, DESeq2 for single-cell, compare conditions in single-cell, Wilcoxon for scRNA, SCVI DE, 单细胞差异表达, 单细胞差异分析, 条件比较, treatment vs control single-cell, condition comparison, scvi differential expression, rank genes between conditions, pseudobulk DE. For within-cluster marker genes (cluster vs rest), use scanpy-cluster instead.'
---

# Scanpy-DE: Single-Cell Differential Expression Analysis

## Overview

Differential expression in single-cell RNA-seq requires careful method selection. Using the wrong method causes pseudoreplication and inflated false discovery rates. This skill provides a decision framework and production-ready code patterns for four distinct DE methods.

**Prerequisite**: Run **scanpy-prep** first. The AnnData must be QCed, normalized, and have raw counts saved. If comparing between conditions, cell types should already be annotated (via scanpy-cluster).

## Method Selection Guide

| Scenario | Method | Why |
|----------|--------|-----|
| Quick marker genes (no biological replicates) | Wilcoxon (scanpy built-in) | Fast, no extra packages needed |
| Multi-biological-replicate studies | Pseudobulk + DESeq2/edgeR | Gold standard FDR control |
| Sparse data with high dropout | MAST | Zero-inflation modeling |
| Complex batch effects across conditions | SCVI-tools | Integrated batch correction in model |

## Decision Flow

```
                Have biological replicates?
                       /            \
                     YES             NO
                      |               |
           Use Pseudobulk       Complex batches?
       (DESeq2/edgeR)              /        \
                                 YES          NO
                                  |            |
                          Use SCVI-tools   Use Wilcoxon
                          (batch_corr=True) (quick markers)
```

## Code Patterns

### Wilcoxon (Built-in, Quick)

```python
import scanpy as sc

# Compare conditions within a cell type
adata_subset = adata[adata.obs['cell_type'] == 'T cells'].copy()
sc.tl.rank_genes_groups(adata_subset, groupby='condition',
                         groups=['treated'], reference='control',
                         method='wilcoxon')

# Filter by fold change and expression
sc.tl.filter_rank_genes_groups(adata_subset,
    min_fold_change=1.5,
    min_in_group_fraction=0.25,
    max_out_group_fraction=0.5)

# Extract results
df = sc.get.rank_genes_groups_df(adata_subset, group='treated')
```

For complete Wilcoxon workflow with parameter tuning: `references/wilcoxon-method.md`

### Pseudobulk + DESeq2 (Gold Standard for Replicates)

```python
from decoupler import pseudobulk
import pandas as pd

# Aggregate single cells to pseudobulk samples
pb_df, pb_obs = pseudobulk(
    adata,
    sample_col='donor_id',      # Biological replicate identifier
    groupby='cell_type',        # Aggregate per cell type
    layer='counts',             # MUST use raw counts
    min_cells=10,               # Minimum cells per pseudobulk sample
    min_counts=1,
    min_samples=3
)

# pb_df columns: pseudobulk sample IDs
# pb_df index: gene names
# pb_obs contains: donor_id, cell_type, condition, n_cells

# Save for downstream DESeq2 analysis (R or PyDESeq2)
pb_df.to_csv('pseudobulk_counts.csv')
pb_obs.to_csv('pseudobulk_metadata.csv')
```

Then in R with DESeq2:
```r
library(DESeq2)
counts <- read.csv('pseudobulk_counts.csv', row.names=1)
meta <- read.csv('pseudobulk_metadata.csv', row.names=1)
dds <- DESeqDataSetFromMatrix(countData=counts, colData=meta, design=~ donor + condition)
dds <- DESeq(dds)
res <- results(dds, contrast=c('condition', 'treated', 'control'))
```

Or in Python with PyDESeq2:
```python
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats

dds = DeseqDataSet(counts=pb_df.T, metadata=pb_obs, design='~ donor + condition')
dds.deseq2()
stat_res = DeseqStats(dds, contrast=['condition', 'treated', 'control'])
stat_res.summary()
```

End-to-end example: `scripts/pseudobulk_pipeline.py`

For detailed pseudobulk methodology: `references/pseudobulk-method.md`

### SCVI-tools (Deep Learning with Batch Correction)

```python
import scvi

# Setup and train
scvi.model.SCVI.setup_anndata(adata, batch_key="batch", layer='counts')
model = scvi.model.SCVI(adata)
model.train()

# Differential expression between two groups within a cell type
de_df = model.differential_expression(
    groupby="cell_type",
    group1="CD4_T",
    group2="CD8_T",
    batch_correction=True
)

# Filter by Bayesian probability
sig_genes = de_df[de_df["proba_de"] > 0.95]

# Results columns: proba_de, lfc_mean, lfc_median, bayes_factor, is_de_fdr_0.05
```

**Key outputs**:
- `proba_de` > 0.95 → high confidence DE
- `lfc_mean` → effect size (log2 fold change)
- `bayes_factor` → evidence strength
- `is_de_fdr_0.05` → FDR-corrected binary call

Full example: `scripts/scvi_de_analysis.py`
Detailed SCVI DE guide: `references/scvi-de-method.md`

### MAST (Zero-inflated Data)

```r
library(MAST)

# Prepare SingleCellAssay object
sca <- SceToSingleCellAssay(sce_object)

# Fit hurdle model with donor as random effect
zlmFit <- zlm(~ condition + donor, sca = sca)

# Likelihood ratio test for condition effect
summaryFit <- summary(zlmFit, doLRT = "condition")

# Extract results
dt <- summaryFit$datatable
fcHurdle <- merge(dt[contrast=='conditiontreated' & component=='H',],
                   dt[contrast=='conditiontreated' & component=='logFC',],
                   by='primerid')
```

For complete MAST implementation: `references/mast-method.md`

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

## Key References

1. Squair et al. (2021) Nat Commun — Pseudoreplication bias in scRNA-seq DE
2. Nguyen et al. (2023) Nat Commun — Benchmarking scRNA-seq DE methods
3. sc-best-practices.org/conditions/differential_gene_expression.html

## Next Steps

After identifying DE genes:
- **gene-prognosis-scan** — check clinical relevance of DE genes
- **scanpy-cluster** — if you haven't annotated cell types yet
- **CellChat Analysis** — cell communication involving DE genes
