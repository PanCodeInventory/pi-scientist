# Best Practices for Single-Cell DE Analysis (2024-2025)

## Overview

This document summarizes current best practices for differential expression analysis in single-cell RNA-seq, based on recent benchmark studies and consensus recommendations from major frameworks.

## Key Benchmark Papers

### 1. Squair et al. (2021) Nature Communications 12:5692

**"Confronting false discoveries in single-cell differential expression"**

**Key Findings**:
- Methods ignoring biological replicate variation (Wilcoxon, t-test) produce biased results
- Can discover hundreds of DEGs in absence of real differences
- Pseudobulk methods (DESeq2, edgeR) and MAST with random effects are superior
- Cell-level tests suffer from pseudoreplication bias

**Recommendation**: Never use cell-level tests for multi-replicate studies

### 2. Nguyen et al. (2023) Nature Communications 14:1570

**"Benchmarking integration of single-cell differential expression"**

**Key Findings**:
- Batch effects, sequencing depth, and data sparsity substantially impact DE performance
- Batch covariate modeling improves analysis when batch effects are substantial
- For sparse data, batch correction rarely improves DE analysis

**Recommendation**: Include batch as covariate rather than pre-correcting for DE

### 3. Wu et al. (2025) Genome Biology 26:58

**"Exploring and mitigating shortcomings in single-cell differential expression"**

**Key Findings**:
- Four major "curses": excessive zeros, normalization, donor effects, cumulative biases
- Proposed GLIMES paradigm using raw UMI counts
- Current methods systematically underperform in specific scenarios

**Recommendation**: Use raw counts when possible; consider new methods like GLIMES

## Method Selection Decision Tree

```
START
  │
  ├── Have biological replicates (≥3 per condition)?
  │     │
  │     ├── YES ──> Use PSEUDOBULK + DESeq2/edgeR
  │     │            (Gold standard for FDR control)
  │     │
  │     └── NO ──> Complex batch structure?
  │                   │
  │                   ├── YES ──> Use SCVI-TOOLS
  │                   │           (Integrated batch correction)
  │                   │
  │                   └── NO ──> High dropout rate?
  │                                │
  │                                ├── YES ──> Use MAST
  │                                │
  │                                └── NO ──> Use WILCOXON
  │                                           (Quick markers)
```

## Common Pitfalls and Anti-Patterns

### ❌ Pitfall 1: Using Simple t-tests

**Problem**: 
- t-tests assume continuous, normally-distributed data
- scRNA-seq has 50-90% zeros per gene
- Poor variance estimation with few cells

**Evidence**: Squair et al. showed t-tests can produce hundreds of false positives

**Solution**: Use Wilcoxon (non-parametric) at minimum; prefer pseudobulk for rigorous analysis

### ❌ Pitfall 2: Pseudoreplication Bias

**Problem**:
- Treating each cell as independent replicate
- Ignores donor-level biological variation
- Severely underestimates variance

**Evidence**: 
```python
# WRONG: 10,000 cells from 3 donors
# Treats as n=10,000 replicates (inflated significance)
sc.tl.rank_genes_groups(adata, groupby="condition", method="wilcoxon")

# CORRECT: Aggregate to n=3 pseudobulk samples
pb = pseudobulk(adata, sample_col="donor_id")
# Then use DESeq2
```

**Solution**: Use pseudobulk aggregation for multi-donor studies

### ❌ Pitfall 3: Batch Correction Before DE

**Problem**:
- Batch correction can remove true biological signal
- Corrected data no longer reflects raw counts
- Statistical assumptions may be violated

**Evidence**: Nguyen et al. found batch correction rarely improves DE for sparse data

**Solution**: Include batch as covariate in the model, don't pre-correct

```r
# WRONG: Batch correct then DE
corrected <- combat(counts, batch=batch)
de_results <- deseq2(corrected)

# CORRECT: Include batch in design
dds <- DESeqDataSetFromMatrix(counts, metadata, design = ~ batch + condition)
```

### ❌ Pitfall 4: Ignoring Donor Effects

**Problem**:
- Donor variation persists after batch correction
- Confounded when donors are not balanced across conditions

**Solution**: Always include donor as covariate or random effect

```r
# Fixed effect
design = ~ donor + condition

# Random effect (MAST)
zlm(~ condition + (1|donor), sca)
```

### ❌ Pitfall 5: Over-filtering Genes

**Problem**:
- Aggressive filtering removes informative lowly-expressed genes
- May remove condition-specific genes

**Solution**: Use conservative filtering; rely on statistical testing to filter noise

```python
# TOO AGGRESSIVE
sc.pp.filter_genes(adata, min_cells=100)  # Removes 80% of genes

# REASONABLE
sc.pp.filter_genes(adata, min_cells=3)    # Removes only noise
```

## Recommended Thresholds

### Expression Filtering

| Parameter | Recommended Range | Notes |
|-----------|------------------|-------|
| `min_cells` / `min_cells_gene` | 3-10 | Lower for rare populations |
| `min_genes` / `min_cells_cell` | 200-500 | Higher for higher quality |
| `pct_counts_mt` | 5-20% | Depends on tissue type |

### DE Result Filtering

| Parameter | Recommended Value | Notes |
|-----------|------------------|-------|
| `padj` / `pvals_adj` | < 0.05 | BH-FDR corrected |
| `log2FoldChange` | > 1 (or > 0.5) | Depends on biological question |
| `min.pct` (Seurat) | 0.01-0.10 | Higher for cleaner results |
| `logfc.threshold` | 0.1-0.25 | Seurat v5 default is 0.1 |
| `proba_de` (SCVI) | > 0.95 | Bayesian probability |

### Pseudobulk Parameters

| Parameter | Recommended Value | Notes |
|-----------|------------------|-------|
| `min_cells` | 10-20 | Per pseudobulk sample |
| `min_counts` | 10 | Per gene |
| `min.replicates` | 3 | Per condition |

## Method-Specific Best Practices

### Wilcoxon (Scanpy/Seurat)

```python
# ✅ GOOD: For marker gene identification
sc.tl.rank_genes_groups(adata, groupby="cell_type", method="wilcoxon")
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=1.5,
    min_in_group_fraction=0.25
)

# ❌ BAD: For condition comparison with multiple donors
sc.tl.rank_genes_groups(adata, groupby="condition", method="wilcoxon")
# This ignores donor structure!
```

### Pseudobulk (DESeq2/edgeR)

```r
# ✅ GOOD: Proper design with covariates
dds <- DESeqDataSetFromMatrix(
    counts, metadata,
    design = ~ batch + donor + condition
)
dds <- DESeq(dds)
res <- lfcShrink(dds, coef="condition_treated_vs_control", type="apeglm")

# ✅ GOOD: Paired design
design = ~ donor + condition  # Same donor, different conditions
```

### MAST

```r
# ✅ GOOD: With random effects for multi-donor
zlmFit <- zlm(~ condition + (1|donor), sca, method="glmer")

# ✅ GOOD: With covariates
zlmFit <- zlm(~ batch + condition + percent_mito, sca)
```

### SCVI-tools

```python
# ✅ GOOD: Batch correction integrated with DE
scvi.model.SCVI.setup_anndata(adata, batch_key="batch")
model = scvi.model.SCVI(adata)
model.train()

de_df = model.differential_expression(
    groupby="condition",
    batch_correction=True,  # Correct during DE
    mode="change",
    delta=0.5
)

# ✅ GOOD: Use probability threshold
sig = de_df[de_df["proba_de"] > 0.95]
```

## Quality Control Checklist

Before running DE analysis:

- [ ] Raw counts preserved (not just normalized)
- [ ] Cell type annotations verified
- [ ] Batch/donor information recorded
- [ ] Sufficient cells per group (≥10 for Wilcoxon, ≥3 replicates for pseudobulk)
- [ ] QC filtering appropriate for tissue type
- [ ] Method selected based on experimental design

After running DE analysis:

- [ ] Results make biological sense
- [ ] Known marker genes detected
- [ ] Fold changes reasonable
- [ ] Multiple testing correction applied
- [ ] Results validated by independent method (if critical)

## Reporting Guidelines

When reporting scRNA-seq DE results, include:

1. **Method used**: Wilcoxon / Pseudobulk + DESeq2 / MAST / SCVI
2. **Rationale for method choice**: Based on experimental design
3. **Covariates included**: Batch, donor, etc.
4. **Filtering thresholds**: min_cells, logFC, padj
5. **Number of replicates**: Per condition and cell type
6. **Validation**: Biological or computational

### Example Methods Section

> Differential expression analysis was performed using pseudobulk aggregation followed by DESeq2 (Love et al., 2014). Cells were aggregated by donor and cell type, requiring a minimum of 10 cells per pseudobulk sample. Genes with fewer than 10 total counts were excluded. The DESeq2 model included batch and condition as fixed effects. Log fold changes were shrunk using the apeglm method. Genes with adjusted p-value < 0.05 (Benjamini-Hochberg) and absolute log2 fold change > 1 were considered differentially expressed.

## Summary Table: Method Recommendations

| Study Design | Method | FDR Control | Speed | Complexity |
|--------------|--------|-------------|-------|------------|
| Single sample, cell types | Wilcoxon | Moderate | Fast | Low |
| Multi-donor, condition effect | Pseudobulk | Excellent | Medium | Medium |
| Few cells, high dropout | MAST | Good | Medium | Medium |
| Complex batches + DE | SCVI-tools | Good | Slow | High |

## References

1. Squair et al. (2021) Nat Commun 12:5692 - doi:10.1038/s41467-021-25960-2
2. Nguyen et al. (2023) Nat Commun 14:1570 - doi:10.1038/s41467-023-37126-3
3. Wu et al. (2025) Genome Biology 26:58 - doi:10.1186/s13059-025-03525-6
4. Single-cell Best Practices - https://www.sc-best-practices.org/
5. Harvard Chan Bioinformatics Core - https://hbctraining.github.io/Pseudobulk-for-scRNAseq/
