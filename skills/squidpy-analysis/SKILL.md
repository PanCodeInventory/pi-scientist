---
name: squidpy-analysis
description: "Squidpy v1.8 spatial omics — spatial statistics, image analysis, and ligand-receptor inference. Triggered by: squidpy, spatial autocorrelation, Moran's I, spatial neighbors, nhood_enrichment, ligrec, ligand-receptor, co-occurrence, Ripley's K, sepal, spatial graph, visium, sq.gr, sq.im, sq.pl, cell-cell interaction, tissue image."
---

# Squidpy Spatial Omics Analysis

Comprehensive guide to Squidpy — the scverse framework for spatial single-cell and spatial transcriptomics data analysis. Squidpy provides three core modules: `gr` (graph & spatial statistics), `im` (image analysis), and `pl` (visualization), plus data reading (`read`) and tools (`tl`).

**Citation:** Palla, Spitzer, Klein et al., *Squidpy: a scalable framework for spatial omics analysis*, Nature Methods 19(2):171–178, 2022. DOI: [10.1038/s41592-021-01358-2](https://doi.org/10.1038/s41592-021-01358-2)

## Version & Installation

**Current version: 1.8.1** (2026-02-09). Requires Python ≥ 3.11.

```bash
pip install squidpy                              # core
pip install 'squidpy[interactive]'                # with napari-spatialdata
conda install -c conda-forge squidpy              # conda
pip install 'squidpy[leiden]'                     # optional Leiden clustering
```

Key dependencies: `scanpy>=1.9.3`, `anndata>=0.9`, `spatialdata>=0.7.1`, `numba>=0.56.4`, `scikit-image>=0.25`, `networkx>=2.6`, `omnipath>=1.0.7`, `xarray>=2024.10`, `zarr>=3`.

---

## LOOK UP, DON'T GUESS

When uncertain about any Squidpy function parameter, default, or behavior, consult the official API docs or source before writing code. Parameters and defaults evolve across versions — what held in v1.4 may differ in v1.8.1.

## Module Organization

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `sq.gr` | Graph & spatial statistics | spatial_neighbors, spatial_autocorr, nhood_enrichment, co_occurrence, ligrec, ripley, centrality_scores, sepal, interaction_matrix, mask_graph, niche |
| `sq.im` | Image analysis | ImageContainer, process, segment, calculate_image_features |
| `sq.pl` | Plotting & visualization | spatial_scatter, spatial_segment, nhood_enrichment, co_occurrence, ligrec, interaction_matrix, centrality_scores, ripley, var_by_distance, extract |
| `sq.tl` | Tools | sliding_window, var_by_distance |
| `sq.read` | Data loading | visium, vizgen, nanostring |
| `sq.datasets` | Built-in data | Visium H&E/fluorescence, seqFISH, MERFISH, Slide-seqV2, IMC, MIBI-TOF |

---

## Core Workflow

```
Load Data (sq.read.visium / sq.read.vizgen)
    |
    v
Preprocessing (scanpy: normalize, log1p, HVG, PCA)
    |
    v
Spatial Graph (sq.gr.spatial_neighbors)
    |
    ├── Spatial Autocorrelation (sq.gr.spatial_autocorr)
    ├── Spatial Clustering (Leiden/SpatialLeiden with spatial graph)
    ├── Neighborhood Enrichment (sq.gr.nhood_enrichment)
    ├── Co-occurrence Analysis (sq.gr.co_occurrence)
    ├── Ligand-Receptor (sq.gr.ligrec)
    ├── Ripley's Statistics (sq.gr.ripley)
    ├── Centrality Scores (sq.gr.centrality_scores)
    └── Sepal SV Genes (sq.gr.sepal)
    |
    v
Image Analysis (optional: sq.im.segment, sq.im.calculate_image_features)
    |
    v
Visualization (sq.pl.*)
```

---

## Module 1: `sq.gr` — Graph & Spatial Statistics

### `sq.gr.spatial_neighbors()` — Spatial Graph Construction

Builds the spatial connectivity graph — the foundation for all downstream `sq.gr` and `sq.pl` functions. Must be called before any spatial statistics.

**Platform-specific configuration:**

| Platform | `coord_type` | `n_neighs` | `delaunay` | Rationale |
|----------|-------------|------------|------------|-----------|
| **10x Visium** | `'grid'` | **6** | `False` | Hexagonal grid; 6 nearest spots match grid topology |
| **MERFISH/seqFISH** | `'generic'` | **10–20** | `False` | Single-cell resolution; tune to sample density |
| **Slide-seqV2** | `'generic'` | **10–15** | `False` | 10µm beads; ~15 neighbors balances local/global |
| **Xenium** | `'generic'` | **8–15** | `False` | Subcellular; fewer neighbors for fine structures |
| **Custom imaging** | `'generic'` | **10–20** | `True` (if spatial coverage is uniform) | Delaunay works well for uniform point patterns |

**Additional parameters:**
- `radius=None` — radius-based neighbor selection (overrides n_neighs)
- `transform=None` — `'spectral'` embeds coordinates in spectral space before graph construction
- `set_diag=False` — whether to include self-connections
- `key_added='spatial'` — storage key in `adata.obsp`

**Output:** stores `adata.obsp['spatial_connectivities']` and `adata.obsp['spatial_distances']`.

**For SpatialData objects** (v1.6.3+): pass `sdata` directly with `library_key`, `table_key`, `elements_to_coordinate_systems`.

```python
# Visium standard
sq.gr.spatial_neighbors(adata, coord_type='grid', n_neighs=6)

# Generic platform (MERFISH, Slide-seq, Xenium)
sq.gr.spatial_neighbors(adata, coord_type='generic', n_neighs=15)

# Radius-based (allows variable n_neighbors)
sq.gr.spatial_neighbors(adata, coord_type='generic', radius=100)
```

---

### `sq.gr.spatial_autocorr()` — Spatially Variable Genes

Identifies genes with non-random spatial expression patterns using **Moran's I** or **Geary's C**.

**When to use:** First-pass screening for spatially variable genes (SVGs). Moran's I is computationally efficient and suitable for large gene panels. For non-linear spatial patterns in grid-based data, prefer `sq.gr.sepal()`.

**Parameters:**
- `mode='moran'` — `'moran'` (default) or `'geary'`
- `genes=None` — defaults to `adata.var['highly_variable']` or all genes
- `n_perms=None` — number of permutations; `None` uses analytical approximation (fast), `100-1000` gives simulated p-values
- `corr_method='fdr_bh'` — multiple testing correction
- `transformation=True` — row-standardize the weights matrix
- `two_tailed=False`
- `attr='X'` — data layer: `'X'`, `'obs'`, or `'obsm'`

**Output:** `adata.uns['moranI']` with columns: `I`, `pval_norm`, `pval_sim`, `pval_norm_fdr_bh`, `var_norm`, `var_sim`.

**Interpretation:**
- `I > 0`: positive spatial autocorrelation (clustering)
- `I ≈ 0`: random spatial distribution
- `I < 0`: checkerboard/dispersed pattern (rare in transcriptomics)

**Thresholds:** `|I| > 0.3` with `pval_norm_fdr_bh < 0.05` indicates strong spatial patterning. For publication, use `n_perms=1000` with FDR correction.

```python
# Fast analytical p-values on HVG
sq.gr.spatial_autocorr(adata, mode='moran')

# With permutation p-values (more accurate)
sq.gr.spatial_autocorr(adata, mode='moran', n_perms=1000, corr_method='fdr_bh')

# Geary's C (more sensitive to local patterns)
sq.gr.spatial_autocorr(adata, mode='geary', n_perms=500)
```

**Citation:** Rey & Anselin, 2010 (PySAL).

---

### `sq.gr.nhood_enrichment()` — Neighborhood Enrichment

Permutation-based test for whether cell-type/cluster pairs co-localize more or less than expected by chance.

**When to use:** After clustering to identify interacting cell types/domains. Answers: "Does cluster A tend to neighbor cluster B?"

**Parameters:**
- `cluster_key` — column in `adata.obs` with cluster labels
- `n_perms=1000` — permutations (increase to 5000 for publication)
- `connectivity_key=None` — defaults to `'spatial_connectivities'`
- `numba_parallel=False` — parallel acceleration via numba
- `seed=None` — for reproducibility

**Output:** `adata.uns['{cluster_key}_nhood_enrichment']` with `zscore` and `count` matrices.

**Interpretation:**
- `zscore > 1.96` ≈ p < 0.05 enrichment
- `zscore > 3` ≈ p < 0.001 strong enrichment
- `zscore < -1.96` ≈ p < 0.05 depletion (spatial avoidance)
- `zscore ≈ 0`: random adjacency

```python
sq.gr.nhood_enrichment(adata, cluster_key='leiden', n_perms=5000, seed=42)
sq.pl.nhood_enrichment(adata, cluster_key='leiden')
```

**Minimum sample:** ≥ 5 observations per cluster for reliable permutation.

---

### `sq.gr.co_occurrence()` — Co-occurrence Probability vs. Distance

Computes probability of observing cluster B at increasing distances from cluster A. Unlike `nhood_enrichment`, this works directly on coordinates (no graph needed) and reveals distance-dependent relationships.

**Re-implemented in v1.6.6** for major performance improvements.

**Parameters:**
- `cluster_key` — cluster labels in `adata.obs`
- `spatial_key='spatial'` — coordinates in `adata.obsm`
- `interval=50` — number of distance bins (or numpy array of thresholds)
- `n_splits=None` — split for parallel computation

**Output:** `adata.uns['{cluster_key}_co_occurrence']` with `occ` (probability matrix) and `interval` (distance thresholds).

**Interpretation:** Ratio > 1 means clusters appear together more than expected at that distance.

```python
sq.gr.co_occurrence(adata, cluster_key='leiden', interval=50)
sq.pl.co_occurrence(adata, cluster_key='leiden', clusters=['0', '1', '2'])
```

**nhood_enrichment vs. co_occurrence:**

| Aspect | nhood_enrichment | co_occurrence |
|--------|-----------------|---------------|
| Method | Graph-based, permutation test | Distance-based, conditional probability |
| Requires graph | Yes | No |
| Distance info | Binary (neighbor or not) | Multi-scale distance bins |
| Speed | Fast | Slower |
| Best for | Discrete enrichment testing | Distance-dependent patterns |

---

### `sq.gr.ligrec()` — Ligand-Receptor Interaction Analysis

Fast reimplementation of the CellPhoneDB permutation test. Identifies statistically significant ligand-receptor interactions between cell clusters in spatial context.

**When to use:** After clustering and annotation, to map cell communication networks.

**Parameters:**
- `cluster_key` — cluster labels
- `interactions=None` — uses OmniPath database by default (~14,000 L-R pairs)
- `threshold=0.01` — expression threshold for gene detection
- `n_perms=1000` — permutations
- `corr_method=None` — multiple testing correction (`'fdr_bh'` recommended)
- `corr_axis='clusters'` — axis for correction
- `use_raw=True` — use `adata.raw` for expression values
- `gene_symbols=None` — gene ID column in `adata.var`
- `transmitter_fn=None`, `receiver_fn=None` — compute complex expression aggregations

**Database:** OmniPath (Türei et al., 2016, Nat Methods), covering CellPhoneDB, CellChatDB, ICELLNET, etc.

**Key requirement:** Data in `adata.raw` must be log-normalized (`sc.pp.normalize_total` + `sc.pp.log1p`). Set `use_raw=True`.

```python
# Basic analysis
sq.gr.ligrec(adata, cluster_key='cell_type', n_perms=1000)

# With FDR correction and filtered visualization
sq.gr.ligrec(adata, cluster_key='cell_type', n_perms=1000, corr_method='fdr_bh')
sq.pl.ligrec(
    adata, cluster_key='cell_type',
    means_range=(3, np.inf),   # only strong interactions
    pvalue_threshold=0.05,
    source_groups=['T_cell', 'Macrophage'],
    target_groups=['Tumor'],
    dendrogram=True,
)
```

**Citation:** Efremova et al. 2020, Nat Protocols.

---

### `sq.gr.ripley()` — Ripley's Spatial Statistics

Spatial point pattern analysis — tests whether spatial distribution of points deviates from Complete Spatial Randomness (CSR).

**When to use:** To characterize spatial clustering/dispersion patterns. Best for imaging-based platforms with single-cell resolution.

**Modes:**
- `'F'` — Empty space function: distances from random points to nearest cluster cell
- `'G'` — Nearest neighbor distance function: distances between same-cluster cells
- `'L'` — Variance-stabilized K-function (recommended): L(t) vs. t

**Interpretation:**
- `L(t) > t`: spatial clustering at scale `t`
- `L(t) ≈ t`: CSR at scale `t`
- `L(t) < t`: spatial dispersion at scale `t`

```python
sq.gr.ripley(adata, cluster_key='cell_type', mode='L', n_simulations=100)
sq.pl.ripley(adata, cluster_key='cell_type', mode='L', plot_sims=True)
```

**Citation:** Baddeley, Rubak & Turner, 2015.

---

### `sq.gr.centrality_scores()` — Graph Centrality

Computes network centrality measures per cluster in the spatial graph. Identifies clusters that are spatially central, form dense communities, or bridge different regions.

**Metrics:**
- `closeness_centrality` — how close a cluster is to all others (spatial centrality)
- `average_clustering` — how densely connected within the cluster
- `degree_centrality` — number of connections

**Citation:** Hagberg et al. 2008 (NetworkX); Kamimoto et al. 2020 (CellOracle).

```python
sq.gr.centrality_scores(adata, cluster_key='leiden')
sq.pl.centrality_scores(adata, cluster_key='leiden')
```

---

### `sq.gr.sepal()` — Sepal Spatially Variable Genes

Identifies SVGs using a diffusion-based model. Captures non-linear spatial patterns that Moran's I may miss.

**When to use:** Alternative to Moran's I for grid-based platforms (Visium, ST, Dbit-seq). Requires specifying grid type.

**Parameters:**
- `max_neighs=6` — 6 for hexagonal (Visium), 4 for square grid
- `n_iter=30000` — diffusion iterations
- `dt=0.001` — time step
- `thresh=1e-8` — convergence threshold

**Note:** v1.6.6 fixed a significant numba compilation bug that could alter results. Ensure you use ≥ v1.6.6.

```python
# Visium (hexagonal grid)
sq.gr.sepal(adata, max_neighs=6)

# Square grid platform (ST, Dbit-seq)
sq.gr.sepal(adata, max_neighs=4)
```

**Which SVG method to choose:**

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Moran's I** | Fast, analytical p-values, well-understood | Linear only, global measure | First-pass screening |
| **Sepal** | Captures non-linear patterns | Grid-based only, slower | Grid platforms with complex patterns |
| **SpatialDE** (ext.) | Flexible Gaussian process | ~1000× slower, complex install | When computational time permits |

---

### `sq.gr.interaction_matrix()` — Cluster Interaction Matrix

Computes adjacency frequency/count matrix between clusters.

```python
sq.gr.interaction_matrix(adata, cluster_key='leiden', normalized=True)
sq.pl.interaction_matrix(adata, cluster_key='leiden', annotate=True)
```

---

### `sq.gr.mask_graph()` — Graph Masking

Masks the spatial graph using polygon regions from SpatialData objects. Useful for restricting analysis to specific tissue regions.

```python
sq.gr.mask_graph(sdata, table_key='table', polygon_mask=my_polygon)
```

---

## Module 2: `sq.im` — Image Analysis

### `sq.im.ImageContainer` — Image Data Structure

Wraps `xarray.Dataset` with dimensions `(y, x, z, channels)`. Supports lazy loading via Dask for large H&E/IF images.

**Key methods:**
- `add_img()` — add image layer
- `apply()` — apply function to layer
- `crop_center()` / `crop_corner()` — extract image crops
- `generate_spot_crops()` — generate crops around spatial coordinates
- `generate_equal_crops()` — tile-based cropping
- `features_summary()`, `features_texture()`, `features_histogram()`, `features_segmentation()`, `features_custom()` — feature extraction backends
- `show()` — display image via matplotlib
- `save()` / `load()` — persist to `.zarr`

```python
# Load high-res tissue image
img = sq.im.ImageContainer(adata.uns['spatial']['V1']['images']['hires'])

# Lazy-load large images
img = sq.im.ImageContainer('path/to/large_image.tiff', lazy=True)

# Generate crops around spots
crops = img.generate_spot_crops(
    adata, library_id='V1',
    crop_size=(100, 100),
    obs_names=adata.obs_names[:10],
)
```

---

### `sq.im.process()` — Image Processing

Apply transformations to image layers.

```python
# Gaussian smoothing
sq.im.process(img, layer='image', method='smooth', sigma=2)

# RGB to grayscale
sq.im.process(img, layer='image', method='gray')

# Custom processing
from skimage.filters import sobel
sq.im.process(img, layer='image', method=sobel)
```

---

### `sq.im.segment()` — Image Segmentation

Segment cells/nuclei in tissue images.

**Built-in methods:**
- `'watershed'` — skimage watershed (default)

**External segmenters:**
- **Cellpose** (recommended for nuclei): `pip install cellpose`, then wrap as custom function
- **StarDist**: separate tutorial available

```python
# Built-in watershed segmentation
sq.im.segment(img, layer='image', method='watershed', channel=0)

# Cellpose wrapper
from cellpose import models
cp_model = models.Cellpose(model_type='nuclei')

def cellpose_segment(arr):
    masks, flows, styles, diams = cp_model.eval(arr, diameter=30, channels=[0, 0])
    return masks

sq.im.segment(img, layer='image', method=cellpose_segment)
```

---

### `sq.im.calculate_image_features()` — Feature Extraction

Extract image features per spatial observation (spot/cell).

**Feature types:**

| Feature | Description | Use Case |
|---------|-------------|----------|
| `'summary'` | Per-channel statistics (mean, std, quantiles) | General morphology |
| `'texture'` | GLCM texture (contrast, dissimilarity, homogeneity, energy, correlation) | Tissue texture, ECM patterns |
| `'histogram'` | Histogram bin counts | Intensity distributions |
| `'segmentation'` | Mask statistics (area, perimeter, eccentricity, solidity) | Cell morphology |
| `'custom'` | User-defined function | Specialized features |

**Multi-scale extraction** (recommended):
```python
# Extract summary features at two scales
sq.im.calculate_image_features(
    adata, img.compute(),
    features='summary',
    scale=1.0,
    key_added='img_features',
)
sq.im.calculate_image_features(
    adata, img.compute(),
    features='summary',
    scale=2.0,
    key_added='img_features',
)

# Combine with texture features
sq.im.calculate_image_features(
    adata, img.compute(),
    features=['summary', 'texture'],
    features_kwargs={'texture': {'distances': [1, 2, 4]}},
)
```

---

## Module 3: `sq.pl` — Plotting

| Function | Purpose | Key Parameters |
|----------|---------|---------------|
| `pl.spatial_scatter()` | Gene expression/clusters on tissue | `color`, `shape`, `img`, `size`, `crop_coord`, `library_id`, `cmap` |
| `pl.spatial_segment()` | With segmentation overlay | `seg`, `seg_cell_id`, `seg_contourpx`, `seg_outline` |
| `pl.nhood_enrichment()` | Neighborhood enrichment heatmap | `mode='zscore'/'count'`, `annotate`, `cmap`, `dendrogram` |
| `pl.co_occurrence()` | Co-occurrence vs. distance line plot | `clusters`, per-cluster conditional probability |
| `pl.ligrec()` | Ligand-receptor dot plot | `source_groups`, `target_groups`, `means_range`, `pvalue_threshold`, `dendrogram` |
| `pl.interaction_matrix()` | Interaction frequency heatmap | `annotate`, `method`, `dendrogram` |
| `pl.centrality_scores()` | Centrality bar plot | `score` |
| `pl.ripley()` | Ripley's statistics with envelopes | `mode`, `plot_sims` |
| `pl.var_by_distance()` | Variable vs. distance regression | `var`, `anchor_key`, `covariate`, `order` |
| `pl.extract()` | Move obsm to obs for scanpy | `obsm_key`, `prefix` |

All `sq.pl` functions return `matplotlib` axes and support standard matplotlib customization.

```python
# Basic spatial scatter with image
sq.pl.spatial_scatter(adata, color=['gene_A', 'gene_B', 'leiden'], img=True)

# Ligrec dot plot with dendrogram clustering
sq.pl.ligrec(
    adata, cluster_key='cell_type',
    means_range=(3, np.inf),
    pvalue_threshold=0.05,
    dendrogram=True,
)

# nhood enrichment with annotations
sq.pl.nhood_enrichment(adata, cluster_key='leiden', mode='zscore', annotate=True)
```

---

## Module 4: `sq.tl` — Tools

- **`tl.sliding_window()`** — Analyze spatial data using sliding windows
- **`tl.var_by_distance()`** — Compute design matrix for regression against distance to anchor points (e.g., tumor boundary)

```python
# Regression against distance to anchor
sq.tl.var_by_distance(adata, anchor_key='tumor_boundary')
sq.pl.var_by_distance(adata, var='MKI67', anchor_key='tumor_boundary')
```

---

## Module 5: `sq.read` — Data Loading

| Function | Platform | Notes |
|----------|----------|-------|
| `sq.read.visium()` | 10x Visium | Supports SpaceRanger v3 format (v1.8.0+) |
| `sq.read.vizgen()` | Vizgen MERFISH | |
| `sq.read.nanostring()` | NanoString CosMx | |

```python
# Standard Visium loading
adata = sq.read.visium('/path/to/spaceranger_output/')

# MERFISH
adata = sq.read.vizgen('/path/to/vizgen_output/')
```

---

## Statistical Method Guidance

### Spatial Autocorrelation (Moran's I)

| Aspect | Recommendation |
|--------|---------------|
| **Gene selection** | Run on highly variable genes first, or all genes with `n_perms=0` for fast analytical p-values |
| **Multiple testing** | FDR (Benjamini-Hochberg) — `corr_method='fdr_bh'` |
| **Significance** | `pval_norm_fdr_bh < 0.05` |
| **Strong spatial pattern** | `|I| > 0.3` with FDR < 0.05 |
| **Permutations** | `n_perms=1000` for publication; `n_perms=0` (analytical) for exploration |

### Neighborhood Enrichment

| Aspect | Recommendation |
|--------|---------------|
| **Permutations** | `n_perms=5000` for publication; `1000` for exploration |
| **Minimum per cluster** | ~5 observations for reliable p-values |
| **Significance** | `|z-score| > 1.96` ≈ p < 0.05; `|z-score| > 3` ≈ p < 0.001 |
| **Seed** | Always set `seed=42` for reproducibility |

### Ligand-Receptor (`ligrec`)

| Aspect | Recommendation |
|--------|---------------|
| **Expression data** | Log-normalized in `adata.raw`; set `use_raw=True` |
| **Permutations** | `n_perms=1000` minimum |
| **Correction** | `corr_method='fdr_bh'` when testing many cluster pairs |
| **Visualization filter** | `means_range=(3, inf)` — show only strong interactions |
| **Score threshold** | `pvalue_threshold=0.05` |

---

## Integration with External Tools

- **scanpy**: Squidpy is scanpy-native. Standard pipeline: scanpy preprocessing → `sq.gr.spatial_neighbors()` → scanpy clustering → `sq.gr.nhood_enrichment()` → `sq.pl.*`
- **SpatialData** (v1.6.3+): Most `sq.gr.*` functions accept `SpatialData` objects directly for multi-sample analysis.
- **Cell2location**: Use Squidpy for preprocessing + spatial graph + visualization of deconvolution results via `sq.pl.spatial_scatter()`
- **Tangram**: Use `sq.im.segment()` to count nuclei per Visium spot → pass to Tangram as `cell_count` for improved deconvolution
- **napari**: Interactive spatial data visualization. See the dedicated [Napari Interactive Visualization](#napari-interactive-visualization) section below for complete setup and usage.
- **Cellpose/StarDist**: Wrap as custom segmentation functions in `sq.im.segment()`

---

## Napari Interactive Visualization

Interactive exploration of spatial transcriptomics data with napari. **Important:** Squidpy's original built-in napari plugin (`img.interactive(adata)`) is **deprecated since v1.4+**. All functionality has moved to the standalone `napari-spatialdata` package. The old approach still works for quick exploration but is no longer maintained.

### Installation

**Recommended (current): napari-spatialdata**
```bash
pip install napari-spatialdata[all]
```

**Legacy (deprecated but functional): Squidpy interactive**
```bash
pip install 'squidpy[interactive]'
```

### Two Approaches Compared

| Aspect | Legacy: `img.interactive(adata)` | Current: `napari-spatialdata` |
|--------|--------------------------------|-------------------------------|
| Package | `squidpy[interactive]` | `napari-spatialdata` |
| Data input | `ImageContainer` + `AnnData` | `SpatialData` object |
| Status | Deprecated since v1.4+ | Actively maintained |
| Widgets | Gene/obs/obsm browser | View widget + Scatter widget + Elements browser |
| Annotation | SHIFT+E saves shape to `adata.obs` | Lasso tool + Annotate button to `adata.obs` |
| Screenshot | `viewer.screenshot()` | `interactive.screenshot()` |
| Documentation | Squidpy deprecated tutorial | [spatialdata.scverse.org](https://spatialdata.scverse.org/projects/napari/en/latest/) |

---

### Approach A: Legacy `img.interactive()` (Quick Exploration)

Best for rapid, one-off exploration when you already have an `AnnData` object with its `ImageContainer`.

```python
import squidpy as sq

adata = sq.datasets.visium_hne_adata()
img = sq.datasets.visium_hne_image()

# Launch napari viewer — a separate window opens
viewer = img.interactive(adata)

# Take a screenshot from the notebook
viewer.screenshot(canvas_only=True)  # canvas only
viewer.screenshot(canvas_only=False)  # full GUI with widgets
```

**Capabilities in the GUI:**
- **Genes tab** — search and double-click to visualize expression of any gene in `adata.X`, `adata.raw`, or other layers
- **Observations tab** — visualize categorical/continuous columns from `adata.obs` (clusters, QC metrics, annotations)
- **Features tab** — visualize `adata.obsm` columns (PCA components, image features, spatial embeddings)
- **Shape annotation** — draw polygons with the Shapes layer tool, then press `SHIFT+E` to save as a boolean column in `adata.obs`
- **Layer management** — toggle visibility (eye icon), adjust opacity, delete layers (bin icon)

**Shape annotation workflow:**
```python
# 1. In the napari GUI: select Shapes layer (trapezoid icon) → add polygons
# 2. Draw polygons around region(s) of interest on the tissue
# 3. Press SHIFT+E → annotation saved as boolean in viewer.adata.obs
# 4. Access the annotation back in Python:
print(viewer.adata.obs.columns)  # find your new column, e.g. 'ROI_brain_shapes'
sq.pl.spatial_scatter(viewer.adata, color=['ROI_brain_shapes', 'cluster'])
```

---

### Approach B: `napari-spatialdata` (Production, Multi-sample)

The modern approach. Works with `SpatialData` objects — the scverse universal spatial data framework. Supports multi-sample, multi-modal data with coordinate transformations.

```python
from napari_spatialdata import Interactive
from spatialdata import SpatialData

# Load SpatialData object (from .zarr or built from AnnData + images)
sdata = SpatialData.read('path/to/data.zarr')

# Launch interactive napari session
interactive = Interactive(sdata)
interactive.run()
```

**Elements browser (bottom-left):**
- Select a **Coordinate System** — shows all elements (Images, Labels, Points, Shapes) aligned to that system
- Click an **Element** — loads it as a napari layer
- Example: select `"point23"` → click `"point23_image"` to load the tissue image, click `"point23_labels"` to load segmentation masks

**View widget (right side):**
- Shows `obs`, `var`, `obsm` for the selected layer's AnnData table
- Double-click any value to add it as a colored layer on the viewer
- Example: select the labels layer → double-click `"CD14"` in View → expression overlaid on tissue

**Scatter widget (Plugins → napari-spatialdata → Scatter):**
- Interactive 2D scatter plot of spatial coordinates
- Choose x/y axes from `obsm` (e.g., spatial coordinates), color by `obs` values
- **Lasso tool** — select regions in the scatter plot; click **Annotate** to save as `adata.obs` column
- New annotations appear in the View widget and can be overlaid on tissue

**Full annotation workflow with Scatter:**
```python
# 1. Load image and labels into napari via Elements browser
# 2. Open Scatter widget: Plugins → napari-spatialdata → Scatter
# 3. Select obsm['spatial'] for x/y axes, color by obs['cell_size']
# 4. Click "Plot" to generate scatter
# 5. Use lasso tool to select a region of interest in the scatter plot
# 6. Click "Annotate" — choose a column name for the new annotation
# 7. The annotation now appears in:
#    - View widget → Observations (bottom) → double-click to overlay on tissue
#    - sdata.table.obs (accessible programmatically)
```

**Screenshot from notebook:**
```python
import matplotlib.pyplot as plt
plt.imshow(interactive.screenshot())
plt.axis('off')
```

---

### Converting AnnData to SpatialData

If your data is in AnnData format (e.g., from `sq.read.visium()`), convert to SpatialData for the modern napari approach:

```python
import spatialdata as sd
from spatialdata import SpatialData

# From Squidpy-loaded Visium AnnData
adata = sq.read.visium('spaceranger_output/')
img = sq.im.ImageContainer(adata.uns['spatial']['V1']['images']['hires'])

# Build SpatialData object
sdata = SpatialData(
    images={'tissue_hires': img.data},
    table=adata,
)

# Now use napari-spatialdata
from napari_spatialdata import Interactive
Interactive(sdata).run()
```

### Napari Plugins Useful for Spatial Transcriptomics

| Plugin | Purpose | Install |
|--------|---------|---------|
| `napari-spatialdata` | Core spatial data viewer | `pip install napari-spatialdata[all]` |
| `napari-ome-zarr` | OME-Zarr image format | `pip install napari-ome-zarr` |
| `napari-animation` | Create animations from napari sessions | `pip install napari-animation` |
| `cellpose-napari` | Cellpose segmentation in napari | `pip install cellpose-napari` |

### When to Use Which Approach

| Scenario | Recommended Approach |
|----------|---------------------|
| Quick look at a single Visium sample | Legacy `img.interactive(adata)` |
| Multi-sample comparison | `napari-spatialdata` |
| Production pipeline with SpatialData | `napari-spatialdata` |
| Interactive cell type annotation | `napari-spatialdata` (Scatter widget) |
| Tissue region annotation (pathology) | Either — both support polygon → obs |
| Notebook-based exploration with screenshots | Either — both support `screenshot()` |
| Headless environments (no display) | Neither — use `sq.pl.spatial_scatter()` instead |

---

### Common Issues & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `AttributeError: 'QtPointsControls' object has no attribute 'grid_layout'` | Qt version incompatibility with legacy napari plugin | Upgrade napari: `pip install napari --upgrade`, or migrate to `napari-spatialdata` |
| Napari window doesn't appear | Headless server / no display | Cannot use interactive napari; use `sq.pl.spatial_scatter()` for static plots |
| `ModuleNotFoundError: No module named 'spatialdata'` | `napari-spatialdata` needs SpatialData | `pip install spatialdata` |
| Slow rendering with large images | Image too large for GPU memory | Use lazy loading: `ImageContainer(path, lazy=True)`; reduce resolution before viewing |
| Segmentation masks not aligning with image | Coordinate transformation missing | Check `elements_to_coordinate_systems` in SpatialData; ensure transforms are defined |

## Quantified Minimums

- Build spatial neighbor graph with `sq.gr.spatial_neighbors()` before any spatial statistics
- For Moran's I: report I statistic, p-value, and FDR-corrected p-value
- For nhood_enrichment: use at least `n_perms=1000`
- For ligrec: data must be in `adata.raw` with log-normalized counts
- Set random seed (`seed=42`) in all permutation-based functions
- Save AnnData objects between analysis steps (reproducibility)
- Produce dual-format figures (PNG + PDF/SVG) for all spatial plots

---

## Key References

| Topic | Citation | DOI |
|-------|----------|-----|
| **Squidpy** | Palla et al., Nat Methods 2022 | 10.1038/s41592-021-01358-2 |
| **Spatial autocorrelation** | Rey & Anselin, PySAL 2010 | 10.1007/978-3-642-03647-7_11 |
| **Ligand-receptor** | Efremova et al., Nat Protocols 2020 | 10.1038/s41596-020-0292-x |
| **OmniPath** | Türei et al., Nat Methods 2016 | 10.1038/nmeth.4077 |
| **Sepal** | Anderson & Lundeberg, Bioinformatics 2021 | 10.1093/bioinformatics/btab164 |
| **Ripley's** | Baddeley, Rubak & Turner, 2015 | ISBN 978-1-4822-1020-0 |
| **Cellpose** | Stringer et al., Nat Methods 2021 | 10.1038/s41592-020-01018-x |

---

## Reference Files

- [code_examples.md](references/code_examples.md) — Full Python code for all modules with publication-ready patterns
- [parameter_guide.md](references/parameter_guide.md) — Detailed parameter reference for every function

---

## Version History (Recent, Key Changes)

| Version | Date | Key Changes |
|---------|------|-------------|
| **1.8.1** | 2026-02-09 | Fix pandas 3 CoW policy; spatialdata ≥ 0.7.1 |
| **1.8.0** | 2026-02-03 | SpatialLeiden clustering; SpaceRanger v3; spectral transform fix |
| **1.7.0** | 2025-12-06 | zarr ≥ 3.0.0; improved complex tissue detection |
| **1.6.6** | 2025-12-02 | co_occurrence() re-implemented; zarr v3; Sepal numba fix; Python ≥ 3.11 |
| **1.6.5** | 2025-03-16 | niche calculation function |
| **1.6.4** | 2025-03-12 | Leiden as optional dependency |
| **1.6.3** | 2025-02-20 | SpatialData download; var_by_distance fixes |
