# MAST Method for Single-Cell DE

## Overview

MAST (Model-based Analysis of Single-cell Transcriptomics) uses a two-part hurdle model that separately models:
1. **Discrete part**: Probability of expression (zero vs non-zero)
2. **Continuous part**: Expression level conditional on expression

This explicitly handles the zero-inflation (dropouts) characteristic of scRNA-seq data.

## When to Use

- Few cells per condition with high dropout rates
- Complex experimental designs with multiple batches/replicates
- When explicit zero-inflation modeling is needed
- Studies requiring mixed-effects models

## When NOT to Use

- Large datasets where speed is critical (Wilcoxon is faster)
- Multi-replicate studies where pseudobulk is applicable
- When Python-only workflow is required (MAST is R-based)

## Installation

```r
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("MAST")
```

## Basic Implementation

### Prepare Data from Scanpy

```python
import scanpy as sc
import pandas as pd

adata = sc.read_h5ad("processed.h5ad")
pd.DataFrame(adata.X.T, index=adata.var_names, columns=adata.obs_names).to_csv("counts.csv")
adata.obs.to_csv("metadata.csv")
```

### Create SingleCellAssay and Run DE

```r
library(MAST)

counts <- read.csv("counts.csv", row.names = 1)
metadata <- read.csv("metadata.csv", row.names = 1)

sca <- FromMatrix(
    exprsArray = as.matrix(counts),
    cData = metadata,
    fData = data.frame(gene = rownames(counts))
)

# Simple condition comparison
zlmFit <- zlm(~ condition, sca = sca)
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

## Advanced Implementation

### With Covariates

```r
zlmFit <- zlm(~ batch + condition + percent_mito, sca = sca)
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

### With Random Effects (Mixed Model)

```r
# Include donor as random effect (recommended for multi-donor studies)
zlmFit <- zlm(~ condition + (1 | donor_id), sca = sca, method = "glmer")
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

## Result Interpretation

MAST returns multiple components:

| Component | Description |
|-----------|-------------|
| `logFC` | Log fold change (continuous part) |
| `H` | Hurdle test p-value (discrete + continuous) |
| `C` | Continuous test only |
| `D` | Discrete test only |

**Recommended**: Use the hurdle test (`H` component) for final results, as it combines both discrete and continuous signals.

```r
hurdle_results <- summaryFit$datatable %>%
    filter(component == "H", contrast == "conditiontreated") %>%
    mutate(padj = p.adjust(`Pr(>Chisq)`, method = "BH"))
```

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `method` | "glmer" | Use when random effects are needed |
| `min.cells` | 3 | Minimum cells expressing gene |
| `p.adjust` | "BH" | Multiple testing correction |
| `logFC threshold` | > 1 | Biological significance |

## Limitations

1. **R-only**: No native Python implementation
2. **Slower than Wilcoxon**: Especially with random effects
3. **Memory intensive**: For large datasets
4. **Complex output**: Multiple components to interpret

## References

1. Finak et al. (2015) Genome Biology — Original MAST paper
2. MAST vignette: https://bioconductor.org/packages/release/bioc/vignettes/MAST/inst/doc/MAITAnalysis.html
3. Squair et al. (2021) Nat Commun — MAST with random effects benchmark
