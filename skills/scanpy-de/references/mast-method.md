# MAST Method for Single-Cell DE

## Overview

MAST (Model-based Analysis of Single-cell Transcriptomics) is a statistical framework specifically designed for single-cell data. It uses a two-part hurdle model that separately models:
1. **Discrete part**: Probability of expression (zero vs non-zero)
2. **Continuous part**: Expression level conditional on expression

This approach explicitly handles the zero-inflation (dropouts) characteristic of scRNA-seq data.

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
# From Bioconductor
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("MAST")
```

## Basic Implementation

### Prepare Data from Scanpy

```python
import scanpy as sc
import anndata2ri
import pandas as pd

# Export AnnData to R
adata = sc.read_h5ad("processed.h5ad")

# Save components for R
pd.DataFrame(adata.X.T, index=adata.var_names, columns=adata.obs_names).to_csv("counts.csv")
adata.obs.to_csv("metadata.csv")
```

### Create SingleCellAssay Object

```r
library(MAST)
library(Matrix)

# Load data
counts <- read.csv("counts.csv", row.names = 1)
metadata <- read.csv("metadata.csv", row.names = 1)

# Convert to SingleCellAssay
sca <- FromMatrix(
    exprsArray = as.matrix(counts),
    cData = metadata,           # Cell metadata
    fData = data.frame(gene = rownames(counts))  # Gene metadata
)

# Check the object
print(sca)
```

### Basic Differential Expression

```r
# Simple condition comparison
zlmFit <- zlm(~ condition, sca = sca)

# Likelihood ratio test
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")

# Extract results
results <- summaryFit$datatable

# Get significant genes
contrast <- results[results$contrast == "conditiontreated", ]
hurdle_results <- contrast[contrast$component == "H", ]  # Hurdle component
sig_genes <- hurdle_results[hurdle_results$`Pr(>Chisq)` < 0.05, ]
```

## Advanced Implementation

### With Covariates

```r
# Include batch and other covariates
zlmFit <- zlm(~ batch + condition + percent_mito, sca = sca)

# Test only the condition effect
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

### With Random Effects (Mixed Model)

```r
# Include donor as random effect (recommended for multi-donor studies)
zlmFit <- zlm(
    ~ condition + (1 | donor_id),
    sca = sca,
    method = "glmer"  # Use glmer for random effects
)

summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

### Cell-Type-Specific Analysis

```r
# Filter to specific cell type
sca_subset <- subset(sca, cell_type == "CD4_T")

# Run DE within cell type
zlmFit <- zlm(~ condition, sca = sca_subset)
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")
```

## Complete Workflow Example

```r
library(MAST)
library(Seurat)
library(tidyverse)

# Option 1: From Seurat object
seurat <- readRDS("seurat_object.rds")
sca <- as.SingleCellExperiment(seurat)

# Option 2: From scratch
counts <- Read10X("data/")
metadata <- read.csv("metadata.csv", row.names = 1)

sca <- FromMatrix(
    exprsArray = counts,
    cData = metadata,
    fData = data.frame(gene = rownames(counts))
)

# Filter lowly expressed genes
expressed_genes <- rowSums(assay(sca) > 0) >= 3
sca <- sca[expressed_genes, ]

# Define contrasts
cond <- factor(colData(sca)$condition)
colData(sca)$condition <- cond

# Run DE
zlmFit <- zlm(~ batch + condition, sca = sca)
summaryFit <- summary(zlmFit, doLRT = "conditiontreated")

# Format results
results_df <- summaryFit$datatable %>%
    filter(component == "logFC") %>%
    select(gene, contrast, logFC = `logFC`, pvalue = `Pr(>Chisq)`) %>%
    mutate(padj = p.adjust(pvalue, method = "BH")) %>%
    filter(padj < 0.05, abs(logFC) > 1) %>%
    arrange(padj)

print(head(results_df, 20))
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
# Get hurdle test results
hurdle_results <- summaryFit$datatable %>%
    filter(component == "H", contrast == "conditiontreated") %>%
    mutate(padj = p.adjust(`Pr(>Chisq)`, method = "BH"))
```

## Visualization

### GSEA with MAST Results

```r
library(fgsea)

# Prepare ranked gene list
ranked_genes <- hurdle_results %>%
    arrange(logFC) %>%
    deframe()  # gene -> logFC

# Run GSEA
pathways <- gmtPathways("pathways.gmt")
fgsea_results <- fgsea(pathways, ranked_genes, minSize = 15, maxSize = 500)

# Plot
plotGseaTable(fgsea_results, pathways, ranked_genes)
```

### Heatmap of DE Genes

```r
library(pheatmap)

# Get top DE genes
top_genes <- hurdle_results %>%
    filter(padj < 0.05) %>%
    top_n(50, abs(logFC)) %>%
    pull(gene)

# Subset expression matrix
expr_subset <- assay(sca)[top_genes, ]

# Plot
pheatmap(
    expr_subset,
    annotation_col = data.frame(condition = colData(sca)$condition),
    scale = "row"
)
```

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `method` | "glmer" | Use when random effects are needed |
| `min.cells` | 3 | Minimum cells expressing gene |
| `p.adjust` | "BH" | Multiple testing correction |
| `logFC threshold` | > 1 | Biological significance |

## Python Alternatives

MAST is R-based. For Python workflows:

### Option 1: diffxpy (Archived)

```python
# pip install diffxpy
import diffxpy.api as de

# Two-part hurdle test (similar to MAST)
result = de.test.two_part(
    data=adata.X.T,
    grouping=adata.obs["condition"].values
)
```

### Option 2: rpy2 Bridge

```python
import rpy2.robjects as ro
from rpy2.robjects import pandas2ri
from rpy2.robjects.packages import importr

# Activate pandas conversion
pandas2ri.activate()
mast = importr('MAST')

# Transfer data to R
ro.globalenv['counts'] = adata.X.T
ro.globalenv['metadata'] = adata.obs

# Run MAST
ro.r('''
    library(MAST)
    sca <- FromMatrix(counts, metadata)
    zlmFit <- zlm(~ condition, sca)
    results <- summary(zlmFit, doLRT = "conditiontreated")
''')

# Get results back
results = ro.r('results$datatable')
```

## Performance Considerations

| Dataset Size | Approximate Time |
|--------------|------------------|
| 1,000 cells | 1-2 minutes |
| 10,000 cells | 10-20 minutes |
| 100,000 cells | 1-2 hours |

**Tip**: For large datasets, consider:
1. Subsetting to cell type of interest
2. Pre-filtering genes
3. Using parallel processing

```r
# Parallel processing
library(BiocParallel)
register(MulticoreParam(8))

zlmFit <- zlm(~ condition, sca, parallel = TRUE)
```

## Advantages

1. **Explicit zero-inflation modeling**: Handles dropouts correctly
2. **Mixed-effects support**: Can include donor as random effect
3. **Covariate adjustment**: Flexible model specification
4. **Well-validated**: Widely used and cited

## Limitations

1. **R-only**: No native Python implementation
2. **Slower than Wilcoxon**: Especially with random effects
3. **Memory intensive**: For large datasets
4. **Complex output**: Multiple components to interpret

## Comparison with Other Methods

| Feature | MAST | Wilcoxon | Pseudobulk |
|---------|------|----------|------------|
| Zero-inflation | Yes | No | Aggregation |
| Random effects | Yes | No | Yes |
| Speed | Medium | Fast | Fast |
| FDR control | Good | Poor (multi-rep) | Excellent |
| Replicates needed | 1+ | 1 | 3+ |

## References

1. Finak et al. (2015) Genome Biology - Original MAST paper
2. MAST vignette: https://bioconductor.org/packages/release/bioc/vignettes/MAST/inst/doc/MAITAnalysis.html
3. Squair et al. (2021) Nat Commun - MAST with random effects benchmark
