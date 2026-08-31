# Wilcoxon Rank-Sum Method for Single-Cell DE

## Overview

The Wilcoxon rank-sum test (Mann-Whitney U test) is a non-parametric method for comparing gene expression between groups. It is the default method in Scanpy's `rank_genes_groups` and is suitable for quick marker gene identification.

## When to Use

- Quick marker gene identification for cell type annotation
- Large datasets (>10,000 cells) where speed is critical
- Initial exploration before more sophisticated analysis

## When NOT to Use

- Multi-replicate studies (use pseudobulk instead — cell-level tests suffer pseudoreplication)
- When rigorous FDR control is required for publication
- Studies with complex experimental designs

## Basic Implementation

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

## Result Structure

Results are stored in `adata.uns['rank_genes_groups']`:

| Field | Description |
|-------|-------------|
| `names` | Gene names ranked by significance |
| `scores` | Test statistics (U-statistic for Wilcoxon) |
| `logfoldchanges` | Log2 fold change |
| `pvals` | Raw p-values |
| `pvals_adj` | Benjamini-Hochberg adjusted p-values |

## Parameter Tuning

### Pre-filtering

```python
# Filter genes expressed in minimum number of cells
sc.pp.filter_genes(adata, min_cells=3)
```

### Post-hoc Filtering

```python
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=2,           # Minimum |log2FC|
    min_in_group_fraction=0.25,  # Min fraction expressing in target group
    max_out_group_fraction=0.5   # Max fraction in reference group
)
```

### Custom Reference Group

```python
sc.tl.rank_genes_groups(
    adata,
    groupby="condition",
    groups=["treated"],          # Target group(s)
    reference="control",         # Reference group
    method="wilcoxon"
)
```

## Limitations

1. **Pseudoreplication**: Treats each cell as independent, ignoring donor-level variation
2. **Zero-inflation**: Does not explicitly model dropout
3. **No covariate adjustment**: Cannot include batch/donor as covariates in the test
4. **Inflated FDR**: In multi-replicate studies, can produce hundreds of false positives

For multi-replicate studies, use `references/pseudobulk-method.md`.
