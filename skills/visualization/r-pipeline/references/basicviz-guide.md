# BasicViz Guide

Detailed reference for the **BasicViz** config-driven pipeline (scRNA-seq plots from `.h5ad`). For the high-level decision of *when* to use BasicViz vs scplotter vs ggplot2, see `SKILL.md`.

BasicViz reads `.h5ad` via reticulate and generates all plots from a single `config.yaml`, orchestrated by `r-pipeline/scripts/main.R`.

## Workflow

### Step 1: Inspect Data

```python
import anndata as ad
adata = ad.read_h5ad("data.h5ad")
print("obs columns:", list(adata.obs.columns))
print("Unique clusters:", adata.obs["cell_type_col"].unique().tolist())
print("Has UMAP:", "X_umap" in adata.obsm)
print("Genes sample:", adata.var_names[:10].tolist())
```

Extract: cluster/cell type column, comparison/grouping column, available genes.

### Step 2: Generate config.yaml

Copy the template from `r-pipeline/assets/config_template.yaml` and customize:

```yaml
input_h5ad: "path/to/data.h5ad"
output_dir: "results"

plots:
  - name: "umap_clusters"
    type: "umap"
    color_by: "cell_type"
    title: "Cell Clusters"
    palette: "elegant"
    point_size: 0.5

  - name: "composition"
    type: "proportion"
    group_by: "timepoint"
    fill_by: "cell_type"
    position: "fill"
    title: "Composition"

  - name: "markers"
    type: "dotplot"
    group_by: "cell_type"
    title: "Marker Expression"

  - name: "features"
    type: "feature"
    title: "Marker Features"

  - name: "river"
    type: "river"
    group_by: "timepoint"
    fill_by: "cell_type"
    title: "Composition Changes"

dotplot:
  markers:
    B cells:
      - Cd79a
      - Cd79b
      - Ms4a1
    T cells:
      - Cd3e
      - Cd4
```

**Validation rules:**
- `color_by`, `group_by`, `fill_by` must reference valid `adata.obs` columns
- `dotplot.markers` keys must EXACTLY match values in the `group_by` column (case-sensitive, whitespace-sensitive)
- Gene names must exist in `adata.var_names` (case-sensitive)
- `adata.obsm["X_umap"]` must exist for UMAP and feature plots

### Step 3: Set Up Environment

```bash
bash r-pipeline/scripts/setup_env.sh
export RETICULATE_PYTHON=$(conda run -n basicviz which python)
```

### Step 4: Run Pipeline

Run from the directory containing your `config.yaml`:

```bash
Rscript r-pipeline/scripts/main.R
```

Outputs PDF plots to `output_dir`. A `colors.yaml` is auto-generated for consistent coloring across runs.

## Plot Types

| Type | Required Params | Description |
|------|----------------|-------------|
| `umap` | `color_by` | UMAP with auto cluster labels at centroids, faceting, raster for >5000 cells |
| `proportion` | `group_by`, `fill_by` | Stacked bar (fill=relative %, stack=absolute counts) |
| `dotplot` | `group_by` | Marker gene dotplot with z-score color, % expressing dot size |
| `feature` | — | Multi-page PDF, one page per cluster from `dotplot.markers` |
| `river` | `group_by`, `fill_by` | Alluvial flow between conditions |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `numpy.core.multiarray failed` | numpy ≥2.0 incompatible | Run `setup_env.sh`; Python 3.8–3.10, numpy<2.0 |
| `X_umap not found in .obsm` | No UMAP coordinates | Run `sc.tl.umap(adata)` in Python first |
| `No valid genes found` | Gene name mismatch | Check case; use exact values from `adata.var_names` |
| `Missing colors for: ...` | New categories detected | Re-run pipeline; auto-generates missing colors |
| Empty/corrupt PDF | reticulate Python path mismatch | Explicitly set `RETICULATE_PYTHON` |
| Facet labels missing | Non-categorical column | `adata.obs[col] = adata.obs[col].astype(str)` |

## Bundled Scripts (`r-pipeline/scripts/`)

| File | Purpose |
|------|---------|
| `main.R` | Pipeline orchestrator |
| `setup_env.sh` | Conda env setup (Python 3.8, numpy<1.25) |
| `utils.R` | `theme_elegant()`, `get_palette_values()`, `setup_python()` |
| `generate_colors.R` | Auto-generate `colors.yaml` |
| `plot_umap.R` | UMAP with labels, facets, raster |
| `plot_proportions.R` | Stacked bar composition |
| `plot_dotplot.R` | Marker dotplot with colored facet strips |
| `plot_feature.R` | Multi-page feature expression |
| `plot_river.R` | Alluvial river plots |

## Related References

- **`scplotter-api.md`** — for specialized single-cell plots (TCR/BCR, spatial, cell-cell communication) that fall back to the scplotter package
- **`theme-and-colors.md`** — `theme_elegant()` and palette options used by BasicViz
