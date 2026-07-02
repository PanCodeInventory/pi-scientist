# Pseudobulk Method for Single-Cell DE

## Overview

Pseudobulk analysis aggregates single-cell counts to the sample level, then applies well-validated bulk RNA-seq differential expression methods (DESeq2, edgeR, limma). This approach properly accounts for biological variation between replicates and is the **gold standard** for multi-subject scRNA-seq studies.

## When to Use

- **Multi-subject studies** with biological replicates (strongly recommended)
- Cell-type-specific DE between conditions
- When controlling false discovery rate is critical
- Paired designs (before/after treatment, same patients)
- Studies requiring rigorous statistical inference

## When NOT to Use

- Single-sample studies without replicates
- When cell type annotation is uncertain
- Rare cell types with few cells per sample

## Core Principle

```
Single-cell data                    Pseudobulk
┌─────────────────┐                ┌─────────┐
│ Sample A, Cell 1│                │         │
│ Sample A, Cell 2│ ──aggregate──> │ Sample A│
│ Sample A, Cell 3│                │         │
└─────────────────┘                └─────────┘

Then apply bulk RNA-seq methods (DESeq2, edgeR)
```

## Python Implementation

### Step 1: Generate Pseudobulk Matrix

```python
import scanpy as sc
from decoupler import pseudobulk

# Create pseudobulk by donor and cell type
pb_df, pb_obs = pseudobulk(
    adata,
    sample_col='donor_id',       # Biological replicate identifier
    groupby='cell_type',          # Cell type annotation
    layer='counts',               # Raw counts layer
    min_cells=10,                 # Minimum cells per pseudobulk
    min_counts=10                 # Minimum counts per gene
)

# pb_df: genes x pseudobulk_samples matrix
# pb_obs: metadata for each pseudobulk sample
```

### Step 2: Prepare for DESeq2

```python
import pandas as pd

# Transpose to samples x genes (DESeq2 format)
counts_df = pb_df.T

# Create sample metadata
metadata = pb_obs[['donor_id', 'cell_type', 'condition']].copy()
metadata = metadata.drop_duplicates()

# Ensure alignment
assert counts_df.index.equals(metadata.index)
```

### Step 3: Export to R for DESeq2

```python
# Save for R analysis
counts_df.to_csv("pseudobulk_counts.csv")
metadata.to_csv("pseudobulk_metadata.csv")
```

## R Implementation with DESeq2

### Basic DESeq2 Analysis

```r
library(DESeq2)
library(tidyverse)

# Load pseudobulk data
counts <- read.csv("pseudobulk_counts.csv", row.names = 1)
metadata <- read.csv("pseudobulk_metadata.csv", row.names = 1)

# Create DESeq2 object
dds <- DESeqDataSetFromMatrix(
    countData = counts,
    colData = metadata,
    design = ~ condition
)

# Filter low-count genes
keep <- rowSums(counts(dds) >= 10) >= 3
dds <- dds[keep,]

# Run DE analysis
dds <- DESeq(dds)

# Get results
res <- results(dds, contrast = c("condition", "treated", "control"))

# Apply LFC shrinkage
resLFC <- lfcShrink(dds, coef = "condition_treated_vs_control", type = "apeglm")

# View results
resLFC %>%
    as.data.frame() %>%
    filter(padj < 0.05, abs(log2FoldChange) > 1) %>%
    arrange(padj)
```

### With Batch Covariate

```r
# Include batch in design
dds <- DESeqDataSetFromMatrix(
    countData = counts,
    colData = metadata,
    design = ~ batch + condition  # Batch before condition
)

dds <- DESeq(dds)
res <- results(dds, name = "condition_treated_vs_control")
```

### Paired Design (Same Donors)

```r
# For paired samples (e.g., before/after treatment)
dds <- DESeqDataSetFromMatrix(
    countData = counts,
    colData = metadata,
    design = ~ donor_id + condition  # Donor as blocking factor
)

dds <- DESeq(dds)
res <- results(dds, name = "condition_after_vs_before")
```

## R Implementation with edgeR

### Basic edgeR Analysis

```r
library(edgeR)

# Create DGEList object
dge <- DGEList(counts = counts, group = metadata$condition)

# Filter low-count genes
keep <- filterByExpr(dge, group = metadata$condition)
dge <- dge[keep, , keep.lib.sizes=FALSE]

# Normalize
dge <- calcNormFactors(dge)

# Create design matrix
design <- model.matrix(~ condition, data = metadata)

# Estimate dispersion
dge <- estimateDisp(dge, design)

# Fit model
fit <- glmFit(dge, design)

# Test
lrt <- glmLRT(fit, coef = 2)  # condition coefficient

# Results
topTags(lrt, n = Inf)
```

### With Batch Covariate (edgeR)

```r
# Design with batch
design <- model.matrix(~ batch + condition, data = metadata)

dge <- estimateDisp(dge, design)
fit <- glmFit(dge, design)
lrt <- glmLRT(fit, coef = ncol(design))  # Last coefficient is condition
```

## Python Alternative: PyDESeq2

```python
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats

# Create DESeq2 object
dds = DeseqDataSet(
    counts=counts_df,
    metadata=metadata,
    design_factors="condition"
)

# Run DE
dds.deseq2()

# Get statistics
stat_res = DeseqStats(dds, contrast=["condition", "treated", "control"])
results = stat_res.summary()

# Filter significant genes
sig_genes = results[
    (results["padj"] < 0.05) & 
    (results["log2FoldChange"].abs() > 1)
]
```

## Cell-Type-Specific Analysis

```python
# Analyze each cell type separately
results_by_celltype = {}

for celltype in adata.obs['cell_type'].unique():
    # Subset to cell type
    adata_ct = adata[adata.obs['cell_type'] == celltype].copy()
    
    # Generate pseudobulk
    pb_df, pb_obs = pseudobulk(
        adata_ct,
        sample_col='donor_id',
        groupby='cell_type',
        layer='counts',
        min_cells=10
    )
    
    # Run DESeq2 (via R or PyDESeq2)
    # ... DE analysis code ...
    
    results_by_celltype[celltype] = results
```

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `min_cells` | 10-20 | Minimum cells per pseudobulk sample |
| `min_counts` | 10 | Minimum counts per gene |
| `lfcShrink` | apeglm | LFC shrinkage method (most accurate) |
| `padj` | < 0.05 | Adjusted p-value threshold |
| `log2FoldChange` | > 1 (or > 0.5) | Fold change threshold |

## Complete Workflow Example

```python
import scanpy as sc
from decoupler import pseudobulk
import subprocess

# 1. Load and preprocess
adata = sc.read_h5ad("processed_data.h5ad")

# 2. Ensure raw counts are available
if adata.raw is not None:
    adata.layers['counts'] = adata.raw.X.copy()

# 3. Generate pseudobulk for all cell types
pb_df, pb_obs = pseudobulk(
    adata,
    sample_col='donor_id',
    groupby='cell_type',
    layer='counts',
    min_cells=10,
    min_counts=10
)

# 4. Prepare for R
pb_df.T.to_csv("results/pseudobulk_counts.csv")
pb_obs.to_csv("results/pseudobulk_metadata.csv")

# 5. Run DESeq2 (R script)
subprocess.run(["Rscript", "scripts/run_deseq2.R"])
```

Corresponding R script (`run_deseq2.R`):

```r
library(DESeq2)

# Load data
counts <- read.csv("results/pseudobulk_counts.csv", row.names = 1)
metadata <- read.csv("results/pseudobulk_metadata.csv", row.names = 1)

# Run DESeq2
dds <- DESeqDataSetFromMatrix(counts, metadata, design = ~ condition)
dds <- DESeq(dds)
res <- results(dds, contrast = c("condition", "treated", "control"))
resLFC <- lfcShrink(dds, coef = "condition_treated_vs_control", type = "apeglm")

# Save results
write.csv(as.data.frame(resLFC), "results/deseq2_results.csv")
```

## Visualization

### Volcano Plot

```r
library(ggplot2)

res_df <- as.data.frame(resLFC)
res_df$significance <- ifelse(
    res_df$padj < 0.05 & abs(res_df$log2FoldChange) > 1,
    ifelse(res_df$log2FoldChange > 0, "Up", "Down"),
    "NS"
)

ggplot(res_df, aes(x = log2FoldChange, y = -log10(padj), color = significance)) +
    geom_point(alpha = 0.6) +
    scale_color_manual(values = c("Up" = "red", "Down" = "blue", "NS" = "grey")) +
    geom_vline(xintercept = c(-1, 1), linetype = "dashed") +
    geom_hline(yintercept = -log10(0.05), linetype = "dashed") +
    theme_minimal()
```

### MA Plot

```r
plotMA(resLFC, ylim = c(-5, 5))
```

## Advantages Over Cell-Level Methods

1. **Proper FDR control**: Models biological replicate variation
2. **Well-validated statistics**: DESeq2/edgeR are extensively tested
3. **Covariate adjustment**: Can include batch, donor, other factors
4. **Robust to dropout**: Aggregation reduces zero-inflation impact

## Limitations

1. **Requires replicates**: Minimum 3 per condition recommended
2. **Loses cell-level resolution**: Cannot detect cell-state-specific DE
3. **Rare cell types**: May not have enough cells for aggregation
4. **Annotation dependent**: Results depend on cell type classification accuracy

## References

1. Squair et al. (2021) Nat Commun 12:5692 - Demonstrated pseudobulk superiority
2. Murphy & Skene (2022) Nat Commun - Muscat package for multi-sample DE
3. Harvard Chan Bioinformatics Core - Pseudobulk tutorial
