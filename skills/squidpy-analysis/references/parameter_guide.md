# Squidpy Parameter Guide

Detailed parameter reference for all major Squidpy functions. Recommendations are based on v1.8.1, publication best practices, and common bioinformatics use cases.

---

## `sq.gr.spatial_neighbors`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `adata` | AnnData | required | — | Must have `obsm['spatial']` coordinates |
| `coord_type` | `'grid'` / `'generic'` | `'grid'` | `'grid'` for Visium; `'generic'` for MERFISH, Slide-seq, Xenium | Controls neighbor selection algorithm |
| `n_neighs` | int | `6` | `6` (Visium), `10-20` (imaging platforms) | Number of nearest neighbors |
| `radius` | float or None | `None` | `None` for kNN; set for distance-based graph | Overrides `n_neighs` when set |
| `delaunay` | bool | `False` | `False` for Visium; `True` for uniform point patterns | Delaunay triangulation |
| `transform` | str or None | `None` | `None` (standard); `'spectral'` for coordinate embedding | Spectral embedding of coordinates |
| `set_diag` | bool | `False` | `False` | Self-connections |
| `key_added` | str | `'spatial'` | `'spatial'` | Storage key in `adata.obsp` |
| `n_rings` | int | `1` | `1` | Rings (grid mode only) |
| `copy` | bool | `False` | `False` | |
| `library_key` | str | `None` | Set for SpatialData input | |
| `table_key` | str | `None` | Set for SpatialData input | |
| `elements_to_coordinate_systems` | dict | `None` | Set for SpatialData multi-sample | |

### Platform Quick Reference

| Platform | coord_type | n_neighs | delaunay | radius |
|----------|-----------|----------|----------|--------|
| 10x Visium | grid | 6 | False | None |
| MERFISH (Vizgen) | generic | 15 | False | None |
| Slide-seqV2 | generic | 12 | False | None |
| Xenium | generic | 10 | False | None |
| seqFISH | generic | 10 | True | None |
| CosMx SMI | generic | 15 | False | None |
| Custom uniform | generic | 10 | True | None |

---

## `sq.gr.spatial_autocorr`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `mode` | `'moran'` / `'geary'` | `'moran'` | `'moran'` for first pass | Geary's C is more locally sensitive |
| `genes` | list or None | None | HVG list or top 2000-3000 by expression | All genes with `n_perms=0` for fast analytical |
| `n_perms` | int or None | None | 1000 for publication; None (analytical) for exploration | Analytical much faster but less accurate |
| `n_jobs` | int | `1` | `-1` (all cores) | Parallelism |
| `backend` | str | `'loky'` | `'loky'` | |
| `corr_method` | str or None | `'fdr_bh'` | `'fdr_bh'` | Benjamini-Hochberg correction |
| `transformation` | bool | `True` | `True` | Row-standardize weights |
| `two_tailed` | bool | `False` | `False` | Two-tailed p-values |
| `attr` | str | `'X'` | `'X'` (log-normalized expression) | |
| `copy` | bool | `False` | `False` | |

### Output Columns (moranI)

| Column | Meaning |
|--------|---------|
| `I` | Moran's I statistic (-1 to 1) |
| `pval_norm` | Normal-theory p-value |
| `pval_sim` | Simulation-based p-value |
| `pval_norm_fdr_bh` | FDR-corrected normal p-value |
| `pval_sim_fdr_bh` | FDR-corrected simulated p-value |
| `var_norm` | Normal-theory variance |
| `var_sim` | Simulation variance |

### Choosing `mode`

| Mode | Best For | Sensitivity |
|------|----------|------------|
| `moran` | Global spatial clustering, screening | High for large-scale patterns |
| `geary` | Local spatial patterns, outliers | High for local discontinuities |

---

## `sq.gr.nhood_enrichment`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `cluster_key` | str | required | Domain/cell-type annotation column | |
| `n_perms` | int | `1000` | `5000` for publication; `1000` for exploration | Higher = more stable p-values |
| `connectivity_key` | str or None | None | Default (spatial_connectivities) | |
| `numba_parallel` | bool | `False` | `False` (numba threading can conflict) | Enable only for large data |
| `seed` | int or None | None | `42` for reproducibility | Always set for publication |
| `copy` | bool | `False` | `False` | |

### Output Keys in `adata.uns`

| Key | Content |
|-----|---------|
| `zscore` | Cluster x cluster Z-score matrix |
| `count` | Cluster x cluster raw count matrix |

### Interpretation Guide

| Z-score Range | Interpretation |
|--------------|----------------|
| `z > 3.0` | Very strong enrichment (p < 0.001) |
| `1.96 < z < 3.0` | Significant enrichment (p < 0.05) |
| `-1.96 < z < 1.96` | Not significant |
| `-3.0 < z < -1.96` | Significant depletion (p < 0.05) |
| `z < -3.0` | Very strong depletion (p < 0.001) |

---

## `sq.gr.co_occurrence`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `cluster_key` | str | required | Domain/cell-type annotation column | |
| `spatial_key` | str | `'spatial'` | Default | Coordinates in `adata.obsm` |
| `interval` | int or array | `50` | `50` for Visium; finer for single-cell | Distance bins |
| `n_splits` | int or None | None | `1` for small data; `10` for >50k spots | Parallel computation |
| `copy` | bool | `False` | `False` | |

### Output Keys

| Key | Content |
|-----|---------|
| `occ` | (N_clusters x N_bins x N_clusters) probability tensor |
| `interval` | Distance thresholds (N_bins) |
| `cluster_order` | Cluster labels |

---

## `sq.gr.ligrec`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `cluster_key` | str | required | Cell type or cluster annotation | |
| `interactions` | DataFrame or None | None | None for default OmniPath DB | Custom: DataFrame with `ligand`, `receptor` columns |
| `threshold` | float | `0.01` | `0.01` | Expression threshold (log-normalized space) |
| `n_perms` | int | `1000` | `1000-5000` | Higher for more trustworthy p-values |
| `corr_method` | str or None | None | `'fdr_bh'` | Recommended when testing many pairs |
| `corr_axis` | str | `'clusters'` | `'clusters'` | |
| `use_raw` | bool | `True` | `True` | Requires `adata.raw` with log-normalized counts |
| `gene_symbols` | str or None | None | Set if gene IDs differ from var_names | |
| `seed` | int or None | None | `42` | |
| `n_jobs` | int | `1` | `-1` | |
| `alpha` | float | `0.5` | `0.5` | Complex aggregation parameter |
| `copy` | bool | `False` | `False` | |
| `transmitter_fn` | callable | None | Set for custom complex computation | |
| `receiver_fn` | callable | None | Set for custom complex computation | |

### Critical: `use_raw=True` Requirements

The data in `adata.raw.X` must be log-normalized:
1. `sc.pp.normalize_total(adata, target_sum=1e4)` on full gene set
2. `sc.pp.log1p(adata)`
3. `adata.raw = adata.copy()` (store ALL genes, log-normalized)
4. THEN subset to HVGs for dimensional reduction

If `adata.raw` doesn't exist, `ligrec` will fail or produce incorrect results.

---

## `sq.gr.ripley`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `mode` | `'F'`/`'G'`/`'L'` | required | `'L'` for easiest interpretation | |
| `cluster_key` | str | required | Cluster/type annotation | |
| `n_simulations` | int | `100` | `100` minimum for confidence envelope | |
| `n_observations` | int | `1000` | `1000` | Monte Carlo sample size |
| `max_dist` | int or None | None | Set for tissue-size-appropriate limit | |
| `n_steps` | int | `50` | `50` | Distance steps for evaluation |
| `metric` | str | `'euclidean'` | `'euclidean'` | |
| `copy` | bool | `False` | `False` | |

### Mode Selection

| Mode | What It Measures | Use When |
|------|-----------------|----------|
| `F` | Empty space function: distances from random points to nearest cluster cell | Characterizing gaps |
| `G` | Nearest neighbor distance: same-cluster cell distances | Testing intra-cluster clustering |
| `L` | Variance-stabilized Ripley's K | General spatial pattern characterization |

---

## `sq.gr.centrality_scores`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `cluster_key` | str | required | Cluster/type label column | |
| `score` | str or list or None | None | None (all three scores) | |
| `copy` | bool | `False` | `False` | |

### Available Scores

| Score | What It Measures | Biological Interpretation |
|-------|-----------------|--------------------------|
| `closeness_centrality` | Average distance to all other nodes | How central is the cluster spatially? |
| `average_clustering` | Density of intra-cluster connections | Does the cluster form compact communities? |
| `degree_centrality` | Number of connections | How connected is the cluster? |

---

## `sq.gr.sepal`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `max_neighs` | int | `6` | `6` (hex Visium); `4` (square grid) | Matches grid topology |
| `n_iter` | int | `30000` | `30000` | Diffusion iterations |
| `dt` | float | `0.001` | `0.001` | Time step for diffusion |
| `thresh` | float | `1e-8` | `1e-8` | Convergence threshold |
| `copy` | bool | `False` | `False` | |
| `connectivity_key` | str | `'spatial_connectivities'` | Default | |

---

## `sq.gr.interaction_matrix`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `cluster_key` | str | required | Cluster labels | |
| `normalized` | bool | `False` | `True` for cross-sample comparison | Row-normalizes each cluster |
| `connectivity_key` | str | `'spatial_connectivities'` | Default | |
| `weights` | bool | `False` | `False` | Use edge weights |
| `copy` | bool | `False` | `False` | |

---

## `sq.im.calculate_image_features`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `features` | str or list | `'summary'` | `['summary', 'texture']` (basic); add `'segmentation'` if masks available | |
| `features_kwargs` | dict | `{}` | `{'texture': {'distances': [1, 2, 4]}}` | |
| `scale` | float | `1.0` | `1.0` and `2.0` (multi-scale) | |
| `key_added` | str | `'img_features'` | Include scale: `'img_features_s{scale}'` | |
| `mask` | np.ndarray or None | None | Required for `'segmentation'` features | |
| `n_jobs` | int | `1` | `-1` | |
| `lazy` | bool | `True` | `True` | Dask lazy computation |
| `chunks` | int or None | None | Tune for large images | |

### Feature Types

| Feature | Description | Best For |
|---------|-------------|----------|
| `summary` | Mean, std, quantiles per channel | General tissue morphology |
| `texture` | GLCM: contrast, dissimilarity, homogeneity, energy, correlation | ECM patterns, tissue organization |
| `histogram` | Intensity histogram bins | Overall intensity distribution |
| `segmentation` | Mask shape: area, perimeter, eccentricity | Cell/nucleus morphology |
| `custom` | User-defined function output | Specialized features |

### Recommended Combinations

| Goal | Features | Scale |
|------|----------|-------|
| Basic morphology | `['summary']` | `[1.0]` |
| Tissue architecture | `['summary', 'texture']` | `[1.0, 2.0]` |
| Cell morphology | `['summary', 'texture', 'segmentation']` | `[1.0]` |
| Deep phenotyping | `['summary', 'texture', 'histogram', 'segmentation']` | `[1.0, 2.0, 4.0]` |

---

## `sq.pl.spatial_scatter`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `color` | str or list | required | Gene names or obs column | |
| `shape` | str or None | `None` | `'hexagon'` for Visium aesthetics | |
| `size` | float | `1.0` | `1.2` for publication | |
| `img` | np.ndarray or bool | `False` | `True` to auto-show tissue image | |
| `library_id` | str or None | None | Set for multi-sample data | |
| `crop_coord` | tuple or None | None | `(xmin, xmax, ymin, ymax)` | |
| `scale_factor` | float or None | None | `False` to disable scaling | |
| `cmap` | str | `'viridis'` | `'magma'` for abundance | |
| `alpha` | float | `0.5` | `0.5` (img); `1.0` (no img) | |
| `groups` | list or None | None | Filter to specific cluster groups | |
| `ax` | Axes or None | None | Existing matplotlib axes | |
| `dpi` | int | `80` | `150` for publication | |

---

## `sq.pl.nhood_enrichment`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `mode` | `'zscore'`/`'count'` | `'zscore'` | `'zscore'` for significance | |
| `annotate` | bool | `False` | `True` for publication | Show values in cells |
| `cmap` | str | `'bwr'` for zscore | Default | Blue-White-Red diverging |
| `dendrogram` | bool | `False` | `True` for publication | Hierarchical clustering of rows/columns |
| `method` | str or None | `None` | `'ward'` or `'average'` | Linkage method |
| `figsize` | tuple or None | `None` | `(12, 10)` for many clusters | |

---

## `sq.pl.ligrec`

| Parameter | Type | Default | Recommended | Notes |
|-----------|------|---------|-------------|-------|
| `means_range` | tuple or None | `(0, inf)` | `(3, inf)` for strong interactions | Filter by mean expression |
| `pvalue_threshold` | float or None | `0.05` | `0.05` | Filter by p-value |
| `source_groups` | list or None | None | Filter source clusters | |
| `target_groups` | list or None | None | Filter target clusters | |
| `dendrogram` | bool | `False` | `True` | Cluster rows/columns |
| `alpha` | float | `0.001` | Very small | Noise threshold |
| `swap_axes` | bool | `False` | `True` for tall figures | |
| `figsize` | tuple or None | `None` | `(14, 10)` for many interactions | |

---

## General Best Practices

1. **Set random seeds**: `seed=42` in `nhood_enrichment`, `ligrec`
2. **FDR correction**: Always use `corr_method='fdr_bh'` for Moran's I and ligrec with many clusters
3. **Multi-scale features**: Extract image features at both `scale=1.0` and `scale=2.0`
4. **Save intermediates**: `.write_h5ad()` between major analysis steps
5. **Dual-format figures**: Save as both PDF (vector) and PNG (raster) — `dpi=150`
6. **Log-normalized raw**: Always set `adata.raw` before subsetting to HVGs for ligrec
7. **Platform awareness**: Use correct `coord_type` and `n_neighs` for spatial graph
8. **Version pinning**: Squidpy v1.8.1 requires Python ≥ 3.11; pin versions in environment

---

## Choosing the Right Method

### SVG Detection

| Scenario | Method | Rationale |
|----------|--------|-----------|
| Quick screening of many genes | `spatial_autocorr(mode='moran', n_perms=0)` | Analytical p-values; very fast |
| Publication-ready SVG list | `spatial_autocorr(mode='moran', n_perms=1000)` | Permutation p-values; FDR correction |
| Visium with complex patterns | `sepal()` | Diffusion-based; captures non-linear patterns |
| Single-cell resolution (MERFISH) | `spatial_autocorr(mode='moran')` | Moran's I works well with many points |

### Spatial Relationship Analysis

| Scenario | Method | Rationale |
|----------|--------|-----------|
| Which clusters are neighbors? | `nhood_enrichment()` (z-score) | Simple enrichment/depletion |
| At what distance do clusters interact? | `co_occurrence()` | Distance-dependent probability |
| Is the cluster pattern clustered or dispersed? | `ripley(mode='L')` | CSR deviation envelopes |
| How central is each cluster? | `centrality_scores()` | Network centrality metrics |

### Cell Communication

| Scenario | Method | Rationale |
|----------|--------|-----------|
| Which L-R pairs between annotated types? | `ligrec()` | CellPhoneDB-style permutation test |
| L-R pairs for specific clusters | `ligrec(source_groups=..., target_groups=...)` | Targeted analysis |
| All-vs-all with FDR correction | `ligrec(corr_method='fdr_bh')` | Comprehensive screen |
