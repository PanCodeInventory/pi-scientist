---
name: scanpy-cluster
description: 'Clustering and cell type annotation of single-cell data: neighbor graph, UMAP/t-SNE, marker genes. For differential expression use scanpy-de.'
---

# Scanpy-Cluster: Dimensionality Reduction, Clustering & Annotation

## Overview

The downstream graph-analysis phase. It takes a full-gene AnnData with HVG-derived `X_pca` from scanpy-prep, then constructs neighbors, embeddings, clusters, markers, and annotations. PCA/HVG preprocessing is not repeated here.

## Prerequisite

Run **scanpy-prep** first. The input AnnData should follow the full-gene contract:
- QC filters applied
- `adata.X`: full-gene normalized (`normalize_total` + `log1p`) expression
- `adata.layers["counts"]`: full-gene integer-valued counts
- `adata.var["highly_variable"]`: HVG mask without physical gene subsetting
- `adata.obsm["X_pca"]`: PCA produced by scanpy-prep

Fail early rather than silently recomputing PCA:

```python
if "X_pca" not in adata.obsm:
    raise ValueError(
        "X_pca is missing. Run scanpy-prep or explicitly rerun its PCA stage."
    )
```

## Graph Construction and Embedding

```python
# Build the graph explicitly from the upstream PCA representation
sc.pp.neighbors(adata, n_neighbors=10, n_pcs=40, use_rep="X_pca")

# UMAP for visualization
sc.tl.umap(adata)
sc.pl.umap(adata, color='leiden')

# Alternative visualization from the same upstream PCA
sc.tl.tsne(adata, use_rep="X_pca", random_state=0)
```

**Key decision**: choose how many existing PCs enter the neighbor graph. Inspect the PCA diagnostics produced upstream; do not recompute PCA merely to change `n_pcs`.

## Clustering

```python
# Leiden clustering
sc.tl.leiden(adata, resolution=0.5)
sc.pl.umap(adata, color='leiden', legend_loc='on data')

# Try multiple resolutions to find optimal granularity
for res in [0.3, 0.5, 0.8, 1.0]:
    sc.tl.leiden(adata, resolution=res, key_added=f'leiden_{res}')
```

**Resolution guide**: compare multiple values and validate stability and marker coherence; there is no universal mapping from resolution to a fixed number of cell types. See `references/resolution_selection.md`.

## Marker Gene Identification

```python
# Find marker genes for each cluster
sc.tl.rank_genes_groups(
    adata, 'leiden', method='wilcoxon', use_raw=False
)  # full-gene log-normalized X

# Visualize results
sc.pl.rank_genes_groups(adata, n_genes=25, sharey=False)
sc.pl.rank_genes_groups_heatmap(adata, n_genes=10)
sc.pl.rank_genes_groups_dotplot(adata, n_genes=5)

# Get results as DataFrame
markers = sc.get.rank_genes_groups_df(adata, group='0')
```

## Cell Type Annotation

Annotation is complete only when every cluster is mapped to a cell type backed by at least one marker gene.

### Quick Manual Annotation

```python
# Define marker genes for known cell types
marker_genes = ['CD3D', 'CD14', 'MS4A1', 'NKG7', 'FCGR3A']

# Visualize markers
sc.pl.umap(adata, color=marker_genes, use_raw=False)
sc.pl.dotplot(adata, var_names=marker_genes, groupby='leiden', use_raw=False)

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

For a curated marker gene database (PanglaoDB/HPCA/CellMarker), read `references/marker_database.py`.

### Advanced Annotation

For systematic, evidence-driven annotation with independent validation, GO/KEGG enrichment, pathway scoring, and TF analysis, use **scanpy-annotate** — a dedicated skill that wraps the cluster-identify pipeline. Trigger it with questions like "这些是什么细胞？", "annotate clusters", "cell type identification".

## Publication-Quality Plots

```python
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
| `n_pcs` | Upstream PCA diagnostics | Number of existing PCs used for neighbors |
| `n_neighbors` | 10-30 | Lower for small datasets, higher for large |
| `resolution` | 0.3-1.2 | Start at 0.5; higher = more clusters |

For PCA/neighbor heuristics, consult `scanpy-prep/references/parameter_selection.md`; for clustering resolution, read `references/resolution_selection.md`.

## Common Pitfalls

1. **Confusing `.raw` with counts**: Marker visualization and Wilcoxon testing use full-gene log-normalized `X`; count models use `layers["counts"]`.
2. **Testing only HVGs**: Verify `adata.n_vars > adata.var["highly_variable"].sum()` before marker analysis.
3. **Leiden vs Louvain**: Louvain can produce disconnected communities — use Leiden instead.
4. **Over-clustering**: Validate small clusters with coherent markers and QC metrics rather than a universal size cutoff.

For annotation pitfalls, see scanpy-annotate.

## Next Steps

After clustering and basic marker identification:
- **scanpy-annotate** — systematic cell type annotation with cluster-identify pipeline
- **scanpy-de** — differential expression between conditions
- **CellChat Analysis** / **liana-analysis** — cell-cell communication analysis
- **pySCENIC** — transcription factor regulon analysis
- **gene-prognosis-scan** — clinical relevance of marker genes
