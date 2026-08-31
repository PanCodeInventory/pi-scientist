# Pseudobulk Method for Single-Cell DE

## Overview

Pseudobulk analysis aggregates single-cell counts to the sample level, then applies well-validated bulk RNA-seq DE methods (DESeq2, edgeR, limma). This properly accounts for biological variation between replicates and is the **gold standard** for multi-subject scRNA-seq studies.

## When to Use

- Multi-subject studies with biological replicates (strongly recommended)
- Cell-type-specific DE between conditions
- When controlling false discovery rate is critical
- Paired designs (before/after treatment, same patients)

## When NOT to Use

- Single-sample studies without replicates
- Rare cell types with too few cells per sample

## Python Implementation

```python
import scanpy as sc
from decoupler import pseudobulk

# Aggregate single cells to pseudobulk samples
pb_df, pb_obs = pseudobulk(
    adata,
    sample_col='donor_id',      # Biological replicate identifier
    groupby='cell_type',        # Aggregate per cell type
    layer='counts',             # MUST use raw counts
    min_cells=10,               # Minimum cells per pseudobulk sample
    min_counts=10,               # Minimum counts per gene
    min_samples=3
)

# pb_df: genes x pseudobulk_samples matrix
# pb_obs: metadata for each pseudobulk sample (donor_id, cell_type, condition, n_cells)

# Save for downstream DESeq2 analysis (R or PyDESeq2)
pb_df.to_csv('pseudobulk_counts.csv')
pb_obs.to_csv('pseudobulk_metadata.csv')
```

## R Implementation with DESeq2

```r
library(DESeq2)
counts <- read.csv('pseudobulk_counts.csv', row.names=1)
meta <- read.csv('pseudobulk_metadata.csv', row.names=1)

# Basic design
dds <- DESeqDataSetFromMatrix(countData=counts, colData=meta, design=~ condition)

# With batch covariate (batch before condition)
dds <- DESeqDataSetFromMatrix(countData=counts, colData=meta, design=~ batch + condition)

# Paired design (same donors, before/after)
dds <- DESeqDataSetFromMatrix(countData=counts, colData=meta, design=~ donor_id + condition)

# Filter low-count genes, run, and shrink
keep <- rowSums(counts(dds) >= 10) >= 3
dds <- dds[keep,]
dds <- DESeq(dds)
res <- results(dds, contrast=c('condition', 'treated', 'control'))
resLFC <- lfcShrink(dds, coef="condition_treated_vs_control", type="apeglm")
```

## R Implementation with edgeR

```r
library(edgeR)
dge <- DGEList(counts=counts, group=meta$condition)
keep <- filterByExpr(dge, group=meta$condition)
dge <- dge[keep, , keep.lib.sizes=FALSE]
dge <- calcNormFactors(dge)
design <- model.matrix(~ batch + condition, data=meta)
dge <- estimateDisp(dge, design)
fit <- glmFit(dge, design)
lrt <- glmLRT(fit, coef=ncol(design))  # condition coefficient
topTags(lrt, n=Inf)
```

## Python Alternative: PyDESeq2

```python
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats

dds = DeseqDataSet(counts=pb_df.T, metadata=pb_obs, design='~ donor + condition')
dds.deseq2()
stat_res = DeseqStats(dds, contrast=['condition', 'treated', 'control'])
stat_res.summary()
```

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `min_cells` | >= 10 | Minimum cells per pseudobulk sample |
| `min_counts` | 10 | Minimum counts per gene |
| `lfcShrink` | apeglm | LFC shrinkage method (most accurate) |
| `padj` | < 0.05 | Adjusted p-value threshold |
| `log2FoldChange` | > 1 (or > 0.5) | Fold change threshold |

## Limitations

1. **Requires replicates**: Minimum 3 per condition recommended
2. **Loses cell-level resolution**: Cannot detect cell-state-specific DE
3. **Rare cell types**: May not have enough cells for aggregation
4. **Annotation dependent**: Results depend on cell type classification accuracy

## References

1. Squair et al. (2021) Nat Commun 12:5692 — Demonstrated pseudobulk superiority
2. Murphy & Skene (2022) Nat Commun — Muscat package for multi-sample DE
3. Harvard Chan Bioinformatics Core — Pseudobulk tutorial
