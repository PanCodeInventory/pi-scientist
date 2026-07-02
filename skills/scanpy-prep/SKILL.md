---
name: scanpy-prep
description: 'Data preparation for single-cell analysis: loading, quality control, normalization, and preprocessing. Use this as the FIRST step for any scRNA-seq analysis before clustering or DE. Triggered by: load scRNA-seq, QC single-cell, normalize single-cell, filter cells. This is an upstream peer of scanpy-cluster and scanpy-de — run this first, then feed the processed AnnData to downstream skills.'
---

# Scanpy-Prep: Data Loading, QC & Normalization

## Overview

The upstream preparation phase of single-cell analysis. Everything downstream (clustering, annotation, DE) depends on clean, properly normalized data. Apply this skill **first**, before any other single-cell analysis step.

## When to Use

Use this skill as the **mandatory first step** whenever the user:
- Loads scRNA-seq data (h5ad, 10X mtx, CSV)
- Asks to QC or filter single-cell data
- Needs to normalize or preprocess single-cell data
- Starts any new single-cell analysis project

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

### Understanding AnnData Structure

```python
adata.X          # Expression matrix (cells × genes)
adata.obs        # Cell metadata (DataFrame)
adata.var        # Gene metadata (DataFrame)
adata.uns        # Unstructured annotations (dict)
adata.obsm       # Multi-dimensional cell data (PCA, UMAP)
adata.raw        # Raw data backup

adata.obs_names  # Cell barcodes
adata.var_names  # Gene names
```

## Data Storage Standards ⚠️ MANDATORY

Every scRNA-seq project must follow this storage convention from the very first step.
Violating this will break downstream analyses (scVI, DESeq2, visualization).

### The Three Tiers of Data Storage

| Tier | Location | Content | When to Save | When to Use |
|------|----------|---------|-------------|-------------|
| **Working Matrix** | `adata.X` | Current state of data (changes at every step) | Always present | Default for all scanpy functions |
| **Raw Counts** | `adata.layers["counts"]` | Original integer counts (保险箱) | **Before** `normalize_total` | scVI, DESeq2, sctransform, SoupX |
| **Full Gene Snapshot** | `adata.raw` | log-normalized, all genes (冰箱) | **After** log1p, **before** HVG subset | Dotplot, heatmap, marker visualization |

### Lifecycle Diagram

```
① Load        ② Save counts     ③ Normalize     ④ Freeze raw    ⑤ HVG subset    ⑥ Scale
原始counts  →  layers["counts"]  normalize_total  raw=adata       subset HVG      scale(max=10)
             = adata.X.copy()   + log1p                          → 基因数减少

adata.X:      counts            counts        log-norm         log-norm          log-norm      scaled
              (原始)            (原始)        (全基因)          (全基因)           (仅HVG)       (仅HVG)

layers:       counts            counts ✅     counts ✅        counts ✅          counts ⚠️    counts ⚠️
              (手动存)          (完整基因)    (完整基因)        (完整基因)         (只剩HVG)     (只剩HVG)

raw:          空                空            空               🔒 log-norm       🔒 不变        🔒 不变
                                                                              (全基因)      (全基因)
```

### ⚠️ Critical Rules

1. **`layers["counts"]` MUST use `.copy()`** — without it, it's a reference that will change with `adata.X`
2. **`adata.raw = adata` MUST happen after log1p but before HVG subset** — this is the only correct position
3. **`layers["counts"]` will lose genes after HVG subset** — if you need full-gene counts for downstream (e.g. pseudobulk DESeq2), save separately before subsetting (see Advanced below)
4. **Never overwrite `adata.raw`** — it's set once; use `adata.raw.to_adata()` if you need to restore

### How to Access Each Tier

```python
# Working matrix (current state)
adata.X                          # scaled values after full pipeline

# Original counts (may be subset to HVG after step ⑤)
adata.layers["counts"]          # integer counts

# Full gene log-normalized (never changes after freezing)
adata.raw[:, "CD3E"].X           # ✅ works even if CD3E not in HVG
adata.raw[:, marker_genes].X    # ✅ full gene expression for plotting
adata.raw.to_adata()            # ✅ restore full AnnData from snapshot
```

### Advanced: Preserving Full-Gene Counts for Downstream

If downstream tools need **full-gene original counts** (e.g. pseudobulk → DESeq2):

```python
# BEFORE HVG subset: export full counts separately
adata.layers["counts_full"] = adata.layers["counts"].copy()
# OR: do not physically subset, use HVG as a mask
adata.var['highly_variable'] = adata.var['highly_variable']  # just flag, don't slice
```

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

# Filter cells and genes
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata = adata[adata.obs.pct_counts_mt < 20, :]  # Adjust threshold per tissue
```

**QC thresholds by tissue** (see `references/parameter_selection.md` for details):

| Tissue | MT% max | min_genes | max_genes | Notes |
|--------|---------|-----------|-----------|-------|
| PBMC/blood | 10-15% | 200-500 | 2500-5000 | Lower MT% expected |
| Brain | 5-10% | 200-500 | 3000-6000 | Very low MT% |
| Liver | 20-30% | 200-500 | 2000-4000 | Higher MT% normal |
| Tumor | 20-30% | 200-500 | 2000-6000 | Variable quality |
| Heart/muscle | 15-25% | 200-500 | 2000-4000 | High mitochondrial activity |

Automated QC script:
```bash
python scripts/qc_analysis.py input.h5ad --output filtered.h5ad \
    --mt-threshold 20 --min-genes 200 --min-cells 3
```

## Normalization and Preprocessing

**⚠️ Follow this exact order.** Each step's position in the pipeline is critical.

```python
# ──────────────────────────────────────────────────
# Step 1: Save raw counts (BEFORE normalization)
# MUST use .copy() — without it, this is just a reference
# ──────────────────────────────────────────────────
adata.layers["counts"] = adata.X.copy()

# ──────────────────────────────────────────────────
# Step 2: Normalize + log-transform
# ──────────────────────────────────────────────────
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# ──────────────────────────────────────────────────
# Step 3: Freeze full-gene snapshot (AFTER log1p, BEFORE HVG subset)
# Stores: log-normalized values + ALL genes + ALL var metadata
# This is the ONLY correct position for adata.raw
# ──────────────────────────────────────────────────
adata.raw = adata

# ──────────────────────────────────────────────────
# Step 4: Identify highly variable genes
# ──────────────────────────────────────────────────
sc.pp.highly_variable_genes(adata, n_top_genes=2000)
sc.pl.highly_variable_genes(adata)

# ──────────────────────────────────────────────────
# Step 5: Subset to HVG (WARNING: layers["counts"] also gets subset!)
# ──────────────────────────────────────────────────
adata = adata[:, adata.var.highly_variable]

# ──────────────────────────────────────────────────
# Step 6: Regress out unwanted variation (optional — only if needed)
# ──────────────────────────────────────────────────
sc.pp.regress_out(adata, ['total_counts', 'pct_counts_mt'])

# ──────────────────────────────────────────────────
# Step 7: Scale data (max_value=10 clips extreme values)
# ──────────────────────────────────────────────────
sc.pp.scale(adata, max_value=10)
```

### Verify Storage After Pipeline

```python
# Quick sanity check — run this after the full pipeline
print(f"adata.X shape: {adata.X.shape}")                    # (n_cells, n_hvg)
print(f"adata.X dtype: {adata.X.dtype}")                   # float32 or float64
print(f"layers['counts'] shape: {adata.layers['counts'].shape}")  # same as X
print(f"layers['counts'] dtype: {adata.layers['counts'].dtype}")  # integer
print(f"adata.raw shape: {adata.raw.n_obs} × {adata.raw.n_vars}")  # n_cells × ALL genes
print(f"raw X range: [{adata.raw.X.min():.2f}, {adata.raw.X.max():.2f}]")  # log-norm range
```

## Save Processed Data

```python
# Save the processed AnnData for downstream skills
adata.write('processed.h5ad')

# Export metadata
adata.obs.to_csv('results/cell_metadata.csv')
```

## After This Skill

Once prep is complete, the processed AnnData is ready for:
- **scanpy-cluster** — PCA, UMAP, Leiden clustering, marker genes, cell type annotation
- **scanpy-de** — differential expression between conditions (pseudobulk, SCVI, Wilcoxon, MAST)

If the user's goal is immediately clear, proactively ask whether to continue with clustering or DE.

## Key Parameters

| Parameter | Default | When to Adjust |
|-----------|---------|----------------|
| `min_genes` | 200 | Raise for high-quality data, lower for poor quality |
| `pct_counts_mt` | 20% | Raise for liver/heart, lower for brain/blood |
| `target_sum` | 1e4 | Standard for 10X data |
| `n_top_genes` | 2000 | Reduce for small datasets (<3000 cells), increase for atlas |
| `max_value` | 10 | Standard — clips extreme scaled values |

For detailed parameter guidance, read `references/parameter_selection.md`.

## Common Pitfalls

1. **Forgetting `.copy()` on `layers["counts"]`**: Without `.copy()`, `adata.layers["counts"]` is just a reference to `adata.X` — when `adata.X` changes during normalization, your "saved" counts are destroyed. **Always**: `adata.layers["counts"] = adata.X.copy()`
2. **Setting `adata.raw` at the wrong time**: `adata.raw = adata` must happen **after** log1p and **before** HVG subset. Too early → raw contains unnormalized data. Too late → raw is missing genes that were filtered out.
3. **Blindly applying default thresholds**: Mitochondrial content varies dramatically by tissue — adjust per tissue type
4. **Filtering too aggressively**: Over-filtering can remove rare cell types — check distributions before cutting
5. **Regressing out too much**: Only regress `total_counts` and `pct_counts_mt` unless there's a strong batch effect — over-correction removes biological signal
6. **Using batch correction in prep**: Batch correction belongs in scanpy-cluster (after HVG) or scanpy-de (within SCVI model), not here
7. **Assuming `layers["counts"]` has all genes after HVG subset**: It doesn't — `layers` is sliced along with `adata.X` when you subset genes. Use `adata.raw` for full-gene access, or save a separate copy before subsetting.
