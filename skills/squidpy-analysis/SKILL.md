---
name: squidpy-analysis
description: "Squidpy spatial omics. Use when the user mentions squidpy, spatial autocorrelation / Moran's I, neighborhood enrichment, ligand-receptor / ligrec, co-occurrence, Ripley's K, sepal, or spatial graph."
---

# Squidpy Spatial Omics Analysis

## Version & Installation

**Current version: 1.8.1** (2026-02-09). Requires Python ≥ 3.11.

```bash
pip install squidpy                              # core
pip install 'squidpy[interactive]'                # with napari-spatialdata
conda install -c conda-forge squidpy              # conda
pip install 'squidpy[leiden]'                     # optional Leiden clustering
```

Key dependencies: `scanpy>=1.9.3`, `anndata>=0.9`, `spatialdata>=0.7.1`, `numba>=0.56.4`, `scikit-image>=0.25`, `networkx>=2.6`, `omnipath>=1.0.7`, `xarray>=2024.10`, `zarr>=3`.

## Version notes

- `spatial_neighbors` accepts `SpatialData` objects directly (≥ 1.6.3).
- `co_occurrence` re-implemented for performance (≥ 1.6.6).
- `sepal` numba compilation bug fixed (≥ 1.6.6).
- `read.visium` supports SpaceRanger v3 (≥ 1.8.0).
- Squidpy's built-in napari plugin (`img.interactive`) is deprecated since 1.4+; use `napari-spatialdata`.

## verify

**verify** — when uncertain about any Squidpy parameter, default, or behaviour, check the official API docs or source before writing code. Repeated at each function below: reach for the same check every run.

## Module Organization

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `sq.gr` | Graph & spatial statistics | spatial_neighbors, spatial_autocorr, nhood_enrichment, co_occurrence, ligrec, ripley, centrality_scores, sepal, interaction_matrix, mask_graph, niche |
| `sq.im` | Image analysis | ImageContainer, process, segment, calculate_image_features |
| `sq.pl` | Plotting & visualization | spatial_scatter, spatial_segment, nhood_enrichment, co_occurrence, ligrec, interaction_matrix, centrality_scores, ripley, var_by_distance, extract |
| `sq.tl` | Tools | sliding_window, var_by_distance |
| `sq.read` | Data loading | visium, vizgen, nanostring |
| `sq.datasets` | Built-in data | Visium H&E/fluorescence, seqFISH, MERFISH, Slide-seqV2, IMC, MIBI-TOF |

## Non-negotiables

- Every `sq.gr.*` spatial-statistics call is preceded by `sq.gr.spatial_neighbors()` (except `co_occurrence`, which reads coordinates directly).
- Every permutation-based call (`nhood_enrichment`, `ligrec`, `spatial_autocorr` with `n_perms > 0`) sets `seed`.
- Every `ligrec` call has log-normalized `adata.raw` and `use_raw=True`.
- Every spatial plot is saved dual-format (PDF + PNG).

## `sq.gr` — Graph & Spatial Statistics

- **`spatial_neighbors()`** — builds the spatial connectivity graph; must run before any spatial statistics. **verify** platform `coord_type`/`n_neighs` before calling.
- **`spatial_autocorr()`** — Moran's I / Geary's C for spatially variable genes. **verify** `mode`, `n_perms`, `corr_method`.
- **`nhood_enrichment()`** — permutation test for cluster co-localization. **verify** `n_perms`, `seed`.
- **`co_occurrence()`** — distance-dependent co-occurrence probability (works on coordinates, no graph). **verify** `interval`.
- **`ligrec()`** — ligand-receptor permutation test (CellPhoneDB-style). **verify** `adata.raw` is log-normalized and `use_raw=True`.
- **`ripley()`** — Ripley's F/G/L spatial point-pattern statistics. **verify** `mode`.
- **`centrality_scores()`** — network centrality per cluster. **verify** `score`.
- **`sepal()`** — diffusion-based SVGs for grid platforms. **verify** `max_neighs` (6 hex / 4 square).
- **`interaction_matrix()`** — cluster adjacency frequency matrix. **verify** `normalized`.
- **`mask_graph()`** — mask the graph with SpatialData polygons.

## `sq.im` — Image Analysis

- **`ImageContainer`** — wraps `xarray.Dataset`; lazy loading via Dask. **verify** crop/feature methods before use.
- **`process()`** — apply transformations (smooth, gray, custom). **verify** `method`.
- **`segment()`** — watershed (built-in) or Cellpose/StarDist wrapper. **verify** `method`, `channel`.
- **`calculate_image_features()`** — per-spot features (summary, texture, histogram, segmentation, custom). **verify** `features`, `scale`.

## `sq.pl` — Plotting

- **`spatial_scatter()`** — gene/cluster expression on tissue. **verify** `color`, `img`, `crop_coord`.
- **`spatial_segment()`** — with segmentation overlay. **verify** `seg`, `seg_cell_id`.
- **`nhood_enrichment()`** — enrichment heatmap. **verify** `mode`, `annotate`.
- **`co_occurrence()`** — co-occurrence vs. distance line plot. **verify** `clusters`.
- **`ligrec()`** — L-R dot plot. **verify** `means_range`, `pvalue_threshold`.
- **`interaction_matrix()`** — interaction heatmap. **verify** `annotate`.
- **`centrality_scores()`** — centrality bar plot. **verify** `score`.
- **`ripley()`** — Ripley's with envelopes. **verify** `mode`, `plot_sims`.
- **`var_by_distance()`** — variable vs. distance regression. **verify** `var`, `anchor_key`.
- **`extract()`** — move obsm to obs for scanpy. **verify** `obsm_key`.

All `sq.pl` functions return matplotlib axes.

## `sq.tl` — Tools

- **`sliding_window()`** — sliding-window spatial analysis.
- **`var_by_distance()`** — design matrix for regression against distance to anchors.

## `sq.read` — Data Loading

- **`visium()`** — 10x Visium.
- **`vizgen()`** — Vizgen MERFISH.
- **`nanostring()`** — NanoString CosMx.

## Integration with External Tools

- **scanpy**: scanpy preprocessing → `sq.gr.spatial_neighbors()` → clustering → `sq.gr.nhood_enrichment()` → `sq.pl.*`.
- **SpatialData**: most `sq.gr.*` accept `SpatialData` directly.
- **Cell2location**: Squidpy for preprocessing + spatial graph + visualization of deconvolution results.
- **Tangram**: `sq.im.segment()` to count nuclei per spot → pass as `cell_count`.
- **napari**: interactive visualization — see [napari.md](references/napari.md).
- **Cellpose/StarDist**: wrap as custom segmentation functions in `sq.im.segment()`.

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

## Reference Files

- [parameter_guide.md](references/parameter_guide.md) — parameter tables for every function live here; **verify** any parameter against this file before writing code.
- [code_examples.md](references/code_examples.md) — full runnable Python for every module lives here; copy the publication-ready patterns.
- [napari.md](references/napari.md) — napari interactive visualization (legacy `img.interactive` and `napari-spatialdata`).
