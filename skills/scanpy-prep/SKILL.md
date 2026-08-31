---
name: scanpy-prep
description: 'Upstream prep for scRNA-seq analysis: load, QC/filter, and normalize single-cell data, then hand the processed AnnData to scanpy-cluster or scanpy-de. Use when the user loads scRNA-seq data, asks to QC or filter single-cell data, or needs normalization/preprocessing.'
compatibility: 'Requires scanpy>=1.10. seurat_v3 and seurat_v3_paper HVG flavors additionally require scikit-misc (install scanpy[skmisc]).'
---

# Scanpy-Prep: Data Loading, QC & Normalization

## Overview

The **upstream** preparation phase of single-cell analysis. Apply this skill **first**, before any other single-cell analysis step.

## Quick Start

### Import and Setup

```python
import scanpy as sc
import pandas as pd
import numpy as np

sc.settings.verbosity = 3
sc.settings.set_figure_params(dpi=80, facecolor='white')
sc.settings.figdir = './figures/'
```

### Loading Data

```python
# From 10X Genomics
adata = sc.read_10x_mtx('path/to/data/')
adata = sc.read_10x_h5('path/to/data.h5')

# From h5ad (AnnData format)
adata = sc.read_h5ad('path/to/data.h5ad')

# From CSV
adata = sc.read_csv('path/to/data.csv')
```

## Data Storage Contract ⚠️ MANDATORY

Keep the complete analysis gene universe in the main AnnData. HVGs are a feature-selection mask for PCA and clustering, not a reason to delete non-HVG genes.

### Canonical Storage

| Location | Content | Gene coverage | Use |
|----------|---------|---------------|-----|
| `adata.X` | library-size normalized, `log1p` expression | **all retained genes** | plotting, marker testing, gene scoring |
| `adata.layers["counts"]` | original integer-valued counts | **all retained genes** | pseudobulk, DESeq2, scVI, count models |
| `adata.var["highly_variable"]` | Boolean feature mask | typically 2,000–5,000 `True` | PCA and clustering feature selection |
| `adata.obsm["X_pca"]` | PCA coordinates computed from HVGs | cells × PCs | neighbors, UMAP, Leiden |
| `adata.raw` | optional full-gene log-normalized compatibility snapshot | all retained genes | legacy code using `use_raw=True` |

`adata.raw` is **not raw counts**. Raw counts belong only in `layers["counts"]`.

### Lifecycle

```
① Load counts → ② cell QC → ③ save full counts → ④ normalize + log1p
                                            ↓
                 layers["counts"] = full-gene integer-valued counts
                 X = full-gene log-normalized expression
                                            ↓
                 ⑤ mark HVGs (do not slice genes)
                                            ↓
                 ⑥ PCA(mask_var="highly_variable")

Final n_vars stays equal to the retained full-gene universe.
Only the PCA input is restricted to HVGs.
```

### Critical Rules

1. Validate that the selected input matrix is integer-valued counts before labeling it `counts`.
2. Save counts with `adata.layers["counts"] = adata.X.copy()` before normalization.
3. **Do not run** `adata = adata[:, adata.var.highly_variable]` in the canonical workflow.
4. **Do not create** `layers["counts_full"]`; every layer is aligned to `X` and is sliced with AnnData.
5. Do not run `regress_out` or zero-centered `scale` on the full matrix by default; they can overcorrect and/or densify sparse data.
6. If a compatibility snapshot is needed, use `adata.raw = adata.copy()`, document that it contains log-normalized values, and read a gene from it as `adata.raw[:, "CD3E"].X`.

### What “All Genes” Means

Physical gene filtering such as `sc.pp.filter_genes(min_cells=3)` still removes genes. To preserve the complete input feature universe, record a QC flag instead of slicing:

```python
adata.var["qc_pass"] = adata.var["n_cells_by_counts"] >= 3
```

At minimum, explicitly report whether “all genes” means all input genes or all genes retained after gene QC.

---

## Quality Control

Identify and filter low-quality cells and genes:

```python
# Identify mitochondrial genes (human: MT-, mouse: mt-)
adata.var['mt'] = adata.var_names.str.startswith('MT-')

# Calculate QC metrics
sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], inplace=True)

# Visualize QC metrics
sc.pl.violin(adata, ['n_genes_by_counts', 'total_counts', 'pct_counts_mt'],
             jitter=0.4, multi_panel=True)

# Inspect distributions before filtering and prefer per-sample MAD filtering.
# If a tissue-informed hard cap is justified, apply it explicitly, for example:
# adata = adata[adata.obs["pct_counts_mt"] < 10, :].copy()
```

There is no universal MT% threshold. Use per-sample MAD outlier detection by default and consult the single source-of-truth table in `references/parameter_selection.md` only for optional tissue-informed hard caps.

Automated QC script (MAD by default, preserves genes, writes `var["qc_pass"]`):
```bash
python scripts/qc_analysis.py input.h5ad --output qc_filtered.h5ad \
    --qc-mode mad --sample-key sample --min-cells 3
# Omit --sample-key for a true single-sample object.

# Manual mode requires an explicitly justified threshold:
python scripts/qc_analysis.py input.h5ad --output qc_filtered.h5ad \
    --qc-mode manual --mt-threshold 10 --min-genes 200
```

Then run full-gene normalization and HVG-masked PCA:
```bash
python scripts/preprocess_full_gene.py qc_filtered.h5ad \
    --output processed_full_gene.h5ad --n-top-genes 3000 \
    --batch-key sample
```

## Normalization and Preprocessing

Follow this order while keeping the full gene universe in `X` and `layers["counts"]`.

```python
# Step 1: save full-gene counts before normalization
adata.layers["counts"] = adata.X.copy()

# Step 2: full-gene normalized expression
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# Step 3: identify HVGs but DO NOT subset AnnData
sc.pp.highly_variable_genes(
    adata,
    n_top_genes=3000,
    batch_key="sample",  # remove when there is only one sample
)
sc.pl.highly_variable_genes(adata)

# Step 4: optional compatibility snapshot; this is log-normalized, not counts
adata.raw = adata.copy()

# Step 5: PCA uses only HVGs while AnnData retains all genes
sc.pp.pca(adata, n_comps=50, mask_var="highly_variable")
```

For `flavor="seurat_v3"`, supply count data explicitly:

```python
sc.pp.highly_variable_genes(
    adata,
    flavor="seurat_v3",
    layer="counts",
    n_top_genes=3000,
    batch_key="sample",
)
```

Do not regress or scale the full matrix by default. If a justified analysis requires those transformations, create a temporary HVG-only object and transfer only its PCA coordinates:

```python
adata_hvg = adata[:, adata.var["highly_variable"]].copy()
sc.pp.regress_out(adata_hvg, ["total_counts", "pct_counts_mt"])
sc.pp.scale(adata_hvg, max_value=10)
sc.pp.pca(adata_hvg, n_comps=50)
adata.obsm["X_pca"] = adata_hvg.obsm["X_pca"].copy()
del adata_hvg
```

Parameter ranges — tissue-informed MT% caps, MAD settings, `target_sum`, and `n_top_genes` by dataset size — live in `references/parameter_selection.md`.

### Completion Criterion — Verify Storage After Pipeline

This check is the pipeline's completion criterion: run it after the final step, and every assertion must pass before Save Processed Data.

```python
n_hvg = int(adata.var["highly_variable"].sum())
print(f"adata shape: {adata.shape}")
print(f"counts shape: {adata.layers['counts'].shape}")
print(f"HVGs: {n_hvg} / {adata.n_vars}")
print(f"PCA shape: {adata.obsm['X_pca'].shape}")

assert adata.layers["counts"].shape == adata.shape
assert pd.api.types.is_integer_dtype(adata.layers["counts"].dtype)
assert adata.n_vars > n_hvg
assert "X_pca" in adata.obsm
assert not adata.is_view
if adata.raw is not None:
    assert adata.raw.n_vars == adata.n_vars
```

## Save Processed Data

```python
# Save the processed AnnData for downstream skills
adata.write('processed.h5ad')

# Export metadata
adata.obs.to_csv('results/cell_metadata.csv')
```

## After This Skill

Once **upstream** prep is complete, the processed AnnData is ready for:
- **scanpy-cluster** — neighbors, UMAP, Leiden clustering, marker genes, and cell type annotation, starting from the existing `X_pca`
- **scanpy-de** — differential expression between conditions (pseudobulk, SCVI, Wilcoxon, MAST)

## Common Pitfalls

1. **Trusting an arbitrary input `X`**: An existing H5AD may already be normalized. Validate integer-valued counts or require an explicit count layer before normalization.
2. **Scaling the full matrix**: Zero-centered scaling can densify sparse data. PCA can use the HVG mask without scaling all genes.
3. **Regressing by default**: `regress_out` can overcorrect and is not a universal preprocessing requirement.
4. **Blindly applying thresholds**: QC varies by tissue and sample; inspect distributions and filter permissively.
