#!/usr/bin/env python3
"""
Complete Single-Cell Analysis Template

This template provides a complete workflow for single-cell RNA-seq analysis
using scanpy, from data loading through clustering and cell type annotation.

Customize the parameters and sections as needed for your specific dataset.

For detailed parameter selection guidance, see references/parameter_selection.md
"""

import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import median_abs_deviation

# ============================================================================
# CONFIGURATION
# ============================================================================

# File paths
INPUT_FILE = 'data/raw_counts.h5ad'  # Change to your input file
OUTPUT_DIR = 'results/'
FIGURES_DIR = 'figures/'

# ---------------------------------------------------------------------------
# QC parameters — See references/parameter_selection.md Section 1
# ---------------------------------------------------------------------------
# min_genes: 200 for PBMC, 500+ for complex tissues, 100 for small datasets
# min_cells: 3 (conservative) to 10 (stringent)
# pct_mt: 5% for PBMC, 8-10% for standard, 20% for tumors. Use MAD-based for objectivity.
MIN_GENES = 200
MIN_CELLS = 3
MT_THRESHOLD = 5

# Set to True to use MAD-based adaptive filtering (recommended for >5K cells)
USE_MAD_FILTERING = False

# ---------------------------------------------------------------------------
# HVG selection — See references/parameter_selection.md Section 3
# ---------------------------------------------------------------------------
# n_top_genes: 2000 for simple tissues, 3000-5000 for complex (brain, tumor, atlas)
N_TOP_GENES = 2000

# ---------------------------------------------------------------------------
# PCA components — See references/parameter_selection.md Section 4.1
# ---------------------------------------------------------------------------
# Rule of thumb: capture 85-90% variance. Check elbow plot!
# 15-30 for simple data, 30-40 for moderate, 40-50+ for complex. Default: 50 then inspect.
N_PCS = 40

# ---------------------------------------------------------------------------
# Neighborhood graph — See references/parameter_selection.md Section 5
# ---------------------------------------------------------------------------
# <5K cells: 10-15 | 5K-30K: 15 | 30K-100K: 20-30 | >100K: 30-50
# Lower = more local detail; higher = more global structure
N_NEIGHBORS = 15

# ---------------------------------------------------------------------------
# Clustering — See references/parameter_selection.md Section 6
# ---------------------------------------------------------------------------
# 0.3-0.5 for coarse (3-10 clusters), 0.5-1.0 for standard, 1.0-2.0 for fine substructure
# ALWAYS test multiple: [0.3, 0.5, 0.8, 1.0, 1.2, 1.5]
LEIDEN_RESOLUTION = 0.5

# Scanpy settings
sc.settings.verbosity = 3
sc.settings.set_figure_params(dpi=80, facecolor='white')
sc.settings.figdir = FIGURES_DIR

# ============================================================================
# 1. LOAD DATA
# ============================================================================

print("=" * 80)
print("LOADING DATA")
print("=" * 80)

# Load data (adjust based on your file format)
adata = sc.read_h5ad(INPUT_FILE)
# adata = sc.read_10x_mtx('data/filtered_gene_bc_matrices/')  # For 10X data
# adata = sc.read_csv('data/counts.csv')  # For CSV data

print(f"Loaded: {adata.n_obs} cells x {adata.n_vars} genes")

# Make var names unique (important if gene symbols have duplicates)
adata.var_names_make_unique()

# ============================================================================
# 2. QUALITY CONTROL
# ============================================================================

print("\n" + "=" * 80)
print("QUALITY CONTROL")
print("=" * 80)

# Identify mitochondrial genes (MT- for human, mt- for mouse)
# Also identify ribosomal and hemoglobin genes for comprehensive QC
adata.var['mt'] = adata.var_names.str.startswith('MT-')
adata.var['ribo'] = adata.var_names.str.startswith(('RPS', 'RPL'))
adata.var['hb'] = adata.var_names.str.contains(r'^HB[ABDEGMQZ]\d*(?!\w)')

# Calculate QC metrics
sc.pp.calculate_qc_metrics(adata, qc_vars=['mt', 'ribo', 'hb'],
                            percent_top=[20], log1p=True, inplace=True)

# Visualize QC metrics before filtering
sc.pl.violin(adata, ['n_genes_by_counts', 'total_counts', 'pct_counts_mt'],
             jitter=0.4, multi_panel=True, save='_qc_before_filtering')

sc.pl.scatter(adata, x='total_counts', y='pct_counts_mt', save='_qc_mt')
sc.pl.scatter(adata, x='total_counts', y='n_genes_by_counts', save='_qc_genes')

# Filter cells and genes
print(f"\nBefore filtering: {adata.n_obs} cells, {adata.n_vars} genes")

if USE_MAD_FILTERING:
    # MAD-based adaptive filtering (recommended by sc-best-practices.org)
    # 5 MADs for count/gene metrics (permissive), 3 MADs for MT% (stringent)
    def is_outlier(adata, metric: str, nmads: int):
        M = adata.obs[metric]
        outlier = (M < np.median(M) - nmads * median_abs_deviation(M)) | (
            np.median(M) + nmads * median_abs_deviation(M) < M
        )
        return outlier

    adata.obs["outlier"] = (
        is_outlier(adata, "log1p_total_counts", 5)
        | is_outlier(adata, "log1p_n_genes_by_counts", 5)
        | is_outlier(adata, "pct_counts_in_top_20_genes", 5)
    )
    adata.obs["mt_outlier"] = is_outlier(adata, "pct_counts_mt", 3) | (
        adata.obs["pct_counts_mt"] > 8
    )
    adata = adata[(~adata.obs.outlier) & (~adata.obs.mt_outlier)].copy()
    print(f"  MAD filtering removed {sum(adata.obs.outlier | adata.obs.mt_outlier)} cells")
else:
    # Manual threshold-based filtering
    sc.pp.filter_cells(adata, min_genes=MIN_GENES)
    sc.pp.filter_genes(adata, min_cells=MIN_CELLS)
    adata = adata[adata.obs.pct_counts_mt < MT_THRESHOLD, :]

print(f"After filtering: {adata.n_obs} cells, {adata.n_vars} genes")

# ============================================================================
# 3. NORMALIZATION
# ============================================================================

print("\n" + "=" * 80)
print("NORMALIZATION")
print("=" * 80)

# Save raw counts for later differential expression
adata.layers["counts"] = adata.X.copy()

# Normalize to 10,000 counts per cell
sc.pp.normalize_total(adata, target_sum=1e4)

# Log-transform
sc.pp.log1p(adata)

# Store normalized data
adata.raw = adata

# ============================================================================
# 4. FEATURE SELECTION
# ============================================================================

print("\n" + "=" * 80)
print("FEATURE SELECTION")
print("=" * 80)

# Identify highly variable genes
# For multi-sample data, add: batch_key='sample'
sc.pp.highly_variable_genes(adata, n_top_genes=N_TOP_GENES)

# Visualize
sc.pl.highly_variable_genes(adata, save='_hvg')

print(f"Selected {sum(adata.var.highly_variable)} highly variable genes")

# Subset to highly variable genes
adata = adata[:, adata.var.highly_variable]

# ============================================================================
# 5. SCALING AND REGRESSION
# ============================================================================

print("\n" + "=" * 80)
print("SCALING AND REGRESSION")
print("=" * 80)

# Regress out unwanted sources of variation
sc.pp.regress_out(adata, ['total_counts', 'pct_counts_mt'])

# Scale data (clip to max_value=10 as recommended)
sc.pp.scale(adata, max_value=10)

# ============================================================================
# 6. DIMENSIONALITY REDUCTION
# ============================================================================

print("\n" + "=" * 80)
print("DIMENSIONALITY REDUCTION")
print("=" * 80)

# PCA — compute more components than needed, then inspect elbow plot
sc.tl.pca(adata, svd_solver='arpack', n_comps=50)
sc.pl.pca_variance_ratio(adata, log=True, n_pcs=50, save='_pca_variance')

print("Inspect the PCA elbow plot at figures/pca_variance_pca_variance.pdf")
print("Adjust N_PCS based on where the elbow occurs (aim for 85-90% variance)")

# Compute neighborhood graph
# Always set random_state for reproducibility
sc.pp.neighbors(adata, n_neighbors=N_NEIGHBORS, n_pcs=N_PCS, random_state=0)

# UMAP
sc.tl.umap(adata, random_state=0)

# Visualize initial UMAP
sc.pl.umap(adata, color=['total_counts', 'pct_counts_mt', 'n_genes_by_counts'],
           save='_qc_on_umap')

# ============================================================================
# 7. CLUSTERING (Multiple Resolutions)
# ============================================================================

print("\n" + "=" * 80)
print("CLUSTERING")
print("=" * 80)

# Test multiple resolutions to find optimal granularity
# See references/parameter_selection.md Section 6 for guidance
resolutions = [0.3, 0.5, 0.8, 1.0, 1.2, 1.5]

for res in resolutions:
    sc.tl.leiden(adata, resolution=res, key_added=f'leiden_r{res}', random_state=0)
    n_clusters = len(adata.obs[f'leiden_r{res}'].unique())
    print(f"  Resolution {res}: {n_clusters} clusters")

# Visualize all resolutions
sc.pl.umap(adata, color=[f'leiden_r{r}' for r in resolutions[:4]], ncols=2,
           legend_loc='on data', save='_multi_resolution')

# Set default clustering to LEIDEN_RESOLUTION
adata.obs['leiden'] = adata.obs[f'leiden_r{LEIDEN_RESOLUTION}']
print(f"\nDefault clustering (resolution={LEIDEN_RESOLUTION}): "
      f"{len(adata.obs['leiden'].unique())} clusters")

# ============================================================================
# 8. MARKER GENE IDENTIFICATION
# ============================================================================

print("\n" + "=" * 80)
print("MARKER GENE IDENTIFICATION")
print("=" * 80)

# Find marker genes using Wilcoxon (recommended for publication)
sc.tl.rank_genes_groups(adata, 'leiden', method='wilcoxon')

# Visualize top markers
sc.pl.rank_genes_groups(adata, n_genes=25, sharey=False, save='_markers')
sc.pl.rank_genes_groups_heatmap(adata, n_genes=10, save='_markers_heatmap')
sc.pl.rank_genes_groups_dotplot(adata, n_genes=5, save='_markers_dotplot')

# Get top markers for each cluster
for cluster in adata.obs['leiden'].unique():
    print(f"\nCluster {cluster} top markers:")
    markers = sc.get.rank_genes_groups_df(adata, group=cluster).head(10)
    print(markers[['names', 'scores', 'pvals_adj']].to_string(index=False))

# ============================================================================
# 9. CELL TYPE ANNOTATION
# ============================================================================

print("\n" + "=" * 80)
print("CELL TYPE ANNOTATION")
print("=" * 80)

# Two approaches available:
#
# A) QUICK MANUAL ANNOTATION (below) — good for well-known cell types
# B) EVIDENCE-DRIVEN ANNOTATION — use scripts/cluster_identify.py for:
#    - Systematic DEG → inference → validation workflow
#    - GO/KEGG enrichment, pathway scoring, TF analysis
#    - PDF+Markdown report generation
#    See SKILL.md "Advanced Cell Type Identification" section for full workflow.

# Example marker genes for common cell types (customize for your data)
marker_genes = {
    'T cells': ['CD3D', 'CD3E', 'CD3G'],
    'B cells': ['MS4A1', 'CD79A', 'CD79B'],
    'Monocytes': ['CD14', 'LYZ', 'S100A8'],
    'NK cells': ['NKG7', 'GNLY', 'KLRD1'],
    'Dendritic cells': ['FCER1A', 'CST3'],
}

# Visualize marker genes
for cell_type, genes in marker_genes.items():
    available_genes = [g for g in genes if g in adata.raw.var_names]
    if available_genes:
        sc.pl.umap(adata, color=available_genes, use_raw=True,
                   save=f'_{cell_type.replace(" ", "_")}')

# Manual annotation — customize based on DEG results
cluster_to_celltype = {
    '0': 'CD4 T cells',
    '1': 'CD14+ Monocytes',
    '2': 'B cells',
    '3': 'CD8 T cells',
    '4': 'NK cells',
    # Add more mappings based on your marker analysis
}

# Apply annotations
adata.obs['cell_type'] = adata.obs['leiden'].map(cluster_to_celltype)
adata.obs['cell_type'] = adata.obs['cell_type'].fillna('Unknown')

# Visualize annotated cell types
sc.pl.umap(adata, color='cell_type', legend_loc='on data', save='_celltypes')

# ============================================================================
# 10. ADDITIONAL ANALYSES (OPTIONAL)
# ============================================================================

print("\n" + "=" * 80)
print("ADDITIONAL ANALYSES")
print("=" * 80)

# PAGA trajectory analysis
sc.tl.paga(adata, groups='leiden')
sc.pl.paga(adata, color='leiden', save='_paga')

# Diffusion pseudotime (requires setting a root cell)
# adata.uns['iroot'] = np.flatnonzero(adata.obs['leiden'] == '0')[0]
# sc.tl.dpt(adata)
# sc.pl.umap(adata, color='dpt_pseudotime', save='_pseudotime')

# Gene set scoring
# example_gene_set = ['CD3D', 'CD3E', 'CD3G']
# sc.tl.score_genes(adata, example_gene_set, score_name='T_cell_score')
# sc.pl.umap(adata, color='T_cell_score', save='_gene_set_score')

# ============================================================================
# 11. SAVE RESULTS
# ============================================================================

print("\n" + "=" * 80)
print("SAVING RESULTS")
print("=" * 80)

import os
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Save processed AnnData object
adata.write(f'{OUTPUT_DIR}/processed_data.h5ad')
print(f"Saved processed data to {OUTPUT_DIR}/processed_data.h5ad")

# Export metadata
adata.obs.to_csv(f'{OUTPUT_DIR}/cell_metadata.csv')
adata.var.to_csv(f'{OUTPUT_DIR}/gene_metadata.csv')
print(f"Saved metadata to {OUTPUT_DIR}/")

# Export marker genes
for cluster in adata.obs['leiden'].unique():
    markers = sc.get.rank_genes_groups_df(adata, group=cluster)
    markers.to_csv(f'{OUTPUT_DIR}/markers_cluster_{cluster}.csv', index=False)
print(f"Saved marker genes to {OUTPUT_DIR}/")

# ============================================================================
# 12. SUMMARY
# ============================================================================

print("\n" + "=" * 80)
print("ANALYSIS SUMMARY")
print("=" * 80)

print(f"\nFinal dataset:")
print(f"  Cells: {adata.n_obs}")
print(f"  Genes: {adata.n_vars}")
print(f"  Clusters: {len(adata.obs['leiden'].unique())}")

print(f"\nParameters used:")
print(f"  MIN_GENES: {MIN_GENES}, MIN_CELLS: {MIN_CELLS}")
print(f"  MT_THRESHOLD: {MT_THRESHOLD}%, MAD filtering: {USE_MAD_FILTERING}")
print(f"  N_TOP_GENES: {N_TOP_GENES}, N_PCS: {N_PCS}")
print(f"  N_NEIGHBORS: {N_NEIGHBORS}, LEIDEN_RESOLUTION: {LEIDEN_RESOLUTION}")

print(f"\nCell type distribution:")
print(adata.obs['cell_type'].value_counts())

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
print("\nTip: For advanced cell type identification, run:")
print("  python scripts/cluster_identify.py inspect results/processed_data.h5ad")
