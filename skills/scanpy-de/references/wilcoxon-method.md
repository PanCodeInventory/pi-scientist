# Wilcoxon Rank-Sum Method for Single-Cell DE

## Overview

The Wilcoxon rank-sum test (Mann-Whitney U test) is a non-parametric method for comparing gene expression between groups. It is the default method in Scanpy's `rank_genes_groups` function and is suitable for quick marker gene identification.

## When to Use

- Quick marker gene identification for cell type annotation
- Large datasets (>10,000 cells) where speed is critical
- Initial exploration before more sophisticated analysis
- When data doesn't meet normality assumptions

## When NOT to Use

- Multi-replicate studies (use pseudobulk instead)
- When rigorous FDR control is required for publication
- Studies with complex experimental designs

## Basic Implementation

```python
import scanpy as sc

# Run Wilcoxon rank-sum test
sc.tl.rank_genes_groups(
    adata,
    groupby="cell_type",        # Column in adata.obs defining groups
    method="wilcoxon",          # Statistical test
    reference="rest",           # Compare each group against all others
    n_genes=adata.n_vars        # Test all genes
)

# Visualize results
sc.pl.rank_genes_groups(adata, n_genes=20, sharey=False)

# Access results as DataFrame
result_df = sc.get.rank_genes_groups_df(adata, group="0")
print(result_df.head(10))
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

# Filter genes with minimum mean expression
sc.pp.filter_genes(adata, min_mean=0.0125)
```

### Post-hoc Filtering

```python
# Run DE first
sc.tl.rank_genes_groups(adata, groupby="cell_type", method="wilcoxon")

# Filter by fold change and expression fraction
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=2,           # Minimum |log2FC|
    min_in_group_fraction=0.25,  # Min fraction expressing in target group
    max_out_group_fraction=0.5   # Max fraction in reference group
)

# Visualize filtered results
sc.pl.rank_genes_groups(adata, key="rank_genes_groups_filtered", n_genes=10)
```

### Custom Reference Group

```python
# Compare specific groups
sc.tl.rank_genes_groups(
    adata,
    groupby="condition",
    groups=["treated"],          # Target group(s)
    reference="control",         # Reference group
    method="wilcoxon"
)
```

## Visualization Options

### Dot Plot

```python
sc.pl.rank_genes_groups_dotplot(
    adata,
    n_genes=5,
    values_to_plot="logfoldchanges",
    cmap='bwr',
    vmin=-4, vmax=4,
    min_logfoldchange=2
)
```

### Heatmap

```python
sc.pl.rank_genes_groups_heatmap(
    adata,
    n_genes=10,
    groupby="cell_type",
    cmap="viridis",
    show_gene_labels=True
)
```

### Matrix Plot

```python
sc.pl.rank_genes_groups_matrixplot(
    adata,
    n_genes=5,
    values_to_plot="logfoldchanges",
    cmap='bwr',
    vmin=-4, vmax=4,
    min_logfoldchange=2,
    colorbar_title='log2 fold change'
)
```

### Violin Plot

```python
sc.pl.rank_genes_groups_violin(
    adata,
    groups="0",
    n_genes=5
)
```

### Stacked Violin

```python
sc.pl.rank_genes_groups_stacked_violin(
    adata,
    n_genes=3,
    groupby="cell_type"
)
```

## Handling Batch Effects

### Option A: Pre-correction with ComBat

```python
# Correct for batch effects before DE
sc.pp.combat(adata, key="batch", covariates=["cell_cycle_phase"])

# Then run DE on corrected data
sc.tl.rank_genes_groups(adata, groupby="cell_type", method="wilcoxon")
```

### Option B: Stratified Analysis

```python
# Run DE separately for each batch
for batch in adata.obs["batch"].unique():
    batch_mask = adata.obs["batch"] == batch
    adata_batch = adata[batch_mask].copy()
    
    sc.tl.rank_genes_groups(adata_batch, groupby="cell_type", method="wilcoxon")
    
    # Store results with batch prefix
    adata.uns[f'rank_genes_groups_{batch}'] = adata_batch.uns['rank_genes_groups']
```

## Complete Workflow Example

```python
import scanpy as sc

# 1. Preprocessing
sc.pp.filter_genes(adata, min_cells=10)
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# 2. Batch correction (if needed)
if "batch" in adata.obs.columns:
    sc.pp.combat(adata, key="batch")

# 3. Run differential expression
sc.tl.rank_genes_groups(
    adata,
    groupby="cell_type",
    method="wilcoxon",
    n_genes=adata.n_vars
)

# 4. Filter low-quality hits
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=1.5,
    min_in_group_fraction=0.3
)

# 5. Extract and save results
for group in adata.obs["cell_type"].cat.categories:
    df = sc.get.rank_genes_groups_df(adata, group=group)
    sig_genes = df[
        (df["pvals_adj"] < 0.05) & 
        (df["logfoldchanges"].abs() > 1)
    ]
    sig_genes.to_csv(f"markers_{group}.csv")
    print(f"{group}: {len(sig_genes)} significant genes")
```

## Performance Considerations

| Dataset Size | Approximate Time |
|--------------|------------------|
| 1,000 cells | < 1 second |
| 10,000 cells | 5-10 seconds |
| 100,000 cells | 1-2 minutes |
| 1,000,000 cells | 10-20 minutes |

## Troubleshooting

### Issue: No significant genes found

**Causes**:
- Groups too similar
- Filtering too strict
- Insufficient cells per group

**Solutions**:
```python
# Lower thresholds
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=0.5,
    min_in_group_fraction=0.1
)

# Check group sizes
print(adata.obs["cell_type"].value_counts())
```

### Issue: Too many significant genes

**Causes**:
- Pseudoreplication bias (multiple donors)
- Groups highly different

**Solutions**:
```python
# Increase thresholds
sc.tl.filter_rank_genes_groups(
    adata,
    min_fold_change=2,
    min_in_group_fraction=0.5,
    max_out_group_fraction=0.25
)

# Consider pseudobulk approach for multi-donor studies
```

## Limitations

1. **Pseudoreplication**: Treats each cell as independent, ignoring donor-level variation
2. **Zero-inflation**: Does not explicitly model dropout
3. **No covariate adjustment**: Cannot include batch/donor as covariates in the test
4. **Inflated FDR**: In multi-replicate studies, can produce hundreds of false positives

For multi-replicate studies, refer to `references/pseudobulk-method.md`.
