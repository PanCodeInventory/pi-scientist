---
name: scanpy-cluster
description: 'Downstream single-cell analysis: dimensionality reduction, clustering, marker gene identification, and cell type annotation. Use this AFTER scanpy-prep when the data is QCed and normalized. Triggered by: UMAP, t-SNE, PCA, Leiden, Louvain, clustering, cell clusters, 聚类, 降维, marker genes, 标记基因, cell type annotation, 细胞注释, 细胞类型鉴定, cell identity, 这是什么细胞, find markers, rank genes, cluster annotation, dotplot, heatmap, neighborhood graph, cell phenotyping, 分群, 分群注释. For differential expression between conditions, use scanpy-de instead.'
---

# Scanpy-Cluster: Dimensionality Reduction, Clustering & Annotation

## Overview

The downstream phase of single-cell analysis. Takes a QCed and normalized AnnData (from scanpy-prep) and runs dimensionality reduction, clustering, marker gene identification, and cell type annotation. This skill covers both basic annotation and the advanced cluster-identify pipeline.

## Prerequisite

Run **scanpy-prep** first. The input AnnData must already have:
- QC filters applied
- Normalized (`sc.pp.normalize_total` + `sc.pp.log1p`)
- Raw counts saved (`adata.raw = adata`)
- HVG selected and data scaled

## Dimensionality Reduction

```python
# PCA
sc.tl.pca(adata, svd_solver='arpack')
sc.pl.pca_variance_ratio(adata, log=True)  # Check elbow plot to pick n_pcs

# Compute neighborhood graph
sc.pp.neighbors(adata, n_neighbors=10, n_pcs=40)

# UMAP for visualization
sc.tl.umap(adata)
sc.pl.umap(adata, color='leiden')

# Alternative: t-SNE
sc.tl.tsne(adata)
```

**Key decision**: How many PCs? Let the elbow plot guide you. Default for 10X data: 30-50 PCs. For atlas-scale: 50-100 PCs.

## Clustering

```python
# Leiden clustering (recommended over Louvain)
sc.tl.leiden(adata, resolution=0.5)
sc.pl.umap(adata, color='leiden', legend_loc='on data')

# Try multiple resolutions to find optimal granularity
for res in [0.3, 0.5, 0.8, 1.0]:
    sc.tl.leiden(adata, resolution=res, key_added=f'leiden_{res}')
```

**Resolution guide**: 0.3-0.5 for broad populations, 0.8-1.2 for fine subpopulations, start at 0.5 and adjust.

## Marker Gene Identification

```python
# Find marker genes for each cluster
sc.tl.rank_genes_groups(adata, 'leiden', method='wilcoxon')

# Visualize results
sc.pl.rank_genes_groups(adata, n_genes=25, sharey=False)
sc.pl.rank_genes_groups_heatmap(adata, n_genes=10)
sc.pl.rank_genes_groups_dotplot(adata, n_genes=5)

# Get results as DataFrame
markers = sc.get.rank_genes_groups_df(adata, group='0')
```

## Cell Type Annotation

### Quick Manual Annotation

For routine analyses with well-known cell types:

```python
# Define marker genes for known cell types
marker_genes = ['CD3D', 'CD14', 'MS4A1', 'NKG7', 'FCGR3A']

# Visualize markers
sc.pl.umap(adata, color=marker_genes, use_raw=True)
sc.pl.dotplot(adata, var_names=marker_genes, groupby='leiden')

# Manual annotation
cluster_to_celltype = {
    '0': 'CD4 T cells',
    '1': 'CD14+ Monocytes',
    '2': 'B cells',
    '3': 'CD8 T cells',
}
adata.obs['cell_type'] = adata.obs['leiden'].map(cluster_to_celltype)
sc.pl.umap(adata, color='cell_type', legend_loc='on data')
```

### Advanced Annotation

For systematic, evidence-driven annotation with independent validation, GO/KEGG enrichment, pathway scoring, and TF analysis, use **scanpy-annotate** — a dedicated skill that wraps the cluster-identify pipeline. Trigger it with questions like "这些是什么细胞？", "annotate clusters", "cell type identification".

## Publication-Quality Plots

```python
sc.settings.set_figure_params(dpi=300, frameon=False, figsize=(5, 5))

# UMAP with legend
sc.pl.umap(adata, color='cell_type', palette='Set2',
           legend_loc='on data', legend_fontsize=12,
           frameon=False, save='_publication.pdf')

# Dot plot
sc.pl.dotplot(adata, var_names=genes, groupby='cell_type', save='_dotplot.pdf')

# Heatmap
sc.pl.heatmap(adata, var_names=genes, groupby='cell_type',
              swap_axes=True, show_gene_labels=True, save='_markers.pdf')
```

For comprehensive plotting guidance, read `references/plotting_guide.md`.

## Key Parameters

| Parameter | Guide | When to Adjust |
|-----------|-------|----------------|
| `n_pcs` | Elbow plot | 30-50 for 10X; 50-100 for atlas |
| `n_neighbors` | 10-30 | Lower for small datasets, higher for large |
| `resolution` | 0.3-1.2 | Start at 0.5; higher = more clusters |

For detailed parameter selection: `references/parameter_selection.md`.

## Common Pitfalls

1. **Not using `use_raw=True`**: Plotting normalized expression instead of raw counts — always use `use_raw=True` for marker gene visualization
2. **Blind resolution**: Using default 1.0 without trying alternatives — test 3-4 values and visually compare
3. **Leiden vs Louvain**: Louvain can produce disconnected communities — use Leiden instead
4. **Over-clustering**: Too many small clusters become uninterpretable — validate each cluster has >50 cells and consistent markers

For annotation pitfalls, see scanpy-annotate.

## Next Steps

After clustering and basic marker identification:
- **scanpy-annotate** — systematic cell type annotation with cluster-identify pipeline
- **scanpy-de** — if you need differential expression between conditions
- **CellChat Analysis** / **liana-analysis** — cell-cell communication analysis
- **pySCENIC** — transcription factor regulon analysis
- **gene-prognosis-scan** — clinical relevance of marker genes
