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

Inspect `.X`, layers and `.raw` separately: they may have different gene identifiers
and normalization. Scanpy `score_genes`/`rank_genes_groups` with `use_raw=None` can
silently select `.raw`. If the marker symbols and intended normalized matrix are in
`.X` but `.raw.var_names` are Ensembl IDs, explicitly use `use_raw=False`; do not
set it blindly when `.X` contains counts/scaled values. BasicViz uses `.X` and
`adata.var_names`, so verify those semantics before plotting.

AnnData round trips can convert string obs columns to categorical. Before patching
new labels, add categories or convert to pandas `string`; use
`obs[col].astype("string").fillna("Unknown")`, not `astype(str)` (which can turn
missing values into literal `"nan"`). Verify mappings and missingness after reload.

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

The pipeline needs R ≥ 4.2 with the CRAN packages (`reticulate`, `anndata`, `ggplot2`, …) and any Python ≥ 3.9 that can `import anndata` (numpy 2.x is fine with reticulate ≥ 1.40). Verify with:

```bash
export R_ENV_BIN=/path/to/r-environment/bin  # optional; otherwise uses PATH Rscript
export RETICULATE_PYTHON=/path/to/python-environment/bin/python
bash r-pipeline/scripts/setup_env.sh   # checks this R, not base R
# Alternative: mamba run -n <r-env> bash r-pipeline/scripts/setup_env.sh
```

### Step 4: Run Pipeline

```bash
# from the directory containing your config.yaml (default),
# or pass an explicit config path — the pipeline can be launched from anywhere:
"${R_ENV_BIN:+${R_ENV_BIN%/}/}Rscript" r-pipeline/scripts/main.R
"${R_ENV_BIN:+${R_ENV_BIN%/}/}Rscript" /abs/path/to/r-pipeline/scripts/main.R path/to/config.yaml
```

Python and the h5ad are initialized/loaded **once** and shared across all plots. Outputs PDF plots to `output_dir`. A `colors.yaml` is auto-generated for consistent coloring across runs.

Complete delivery with the shared, tested conversion/QC helper rather than writing
another converter. Pass this run's PDFs explicitly:

```bash
python <visualization-skill>/shared/figure_qc.py --render output_dir/umap_clusters.pdf output_dir/features.pdf
```

This creates 400-DPI PNGs; multi-page feature/dotplot PDFs are split into per-page
PNG/PDF pairs. See `shared/figure-standards.md` for dependencies, checks and the
**visual review pending** label when no visual-capable reviewer is available.

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
| `numpy.core.multiarray failed` | Ancient reticulate (<1.40) vs numpy 2.x | Update reticulate (`install.packages('reticulate')`); no need for the old Python 3.8 env |
| `X_umap not found in .obsm` | No UMAP coordinates | Run `sc.tl.umap(adata)` in Python first |
| `No valid genes found` | Gene name mismatch | Check case; use exact values from `adata.var_names` |
| `Missing colors for: ...` | New categories detected | Re-run pipeline; auto-generates missing colors |
| Empty/corrupt PDF | reticulate Python path mismatch | Explicitly set `RETICULATE_PYTHON` |
| Missing R package at startup | `check_r_packages()` fails fast | Run the `install.packages(c(...))` command it prints |
| New labels cannot be assigned | AnnData reload produced categorical obs | Add the new categories or convert to pandas `string`; preserve missing values before mapping |

## Direct Function Calls (agent reference)

The scripts are plain function libraries — no Snakemake objects. Agents can source and call a single plot function directly:

```r
source("r-pipeline/scripts/utils.R")
source("r-pipeline/scripts/plot_umap.R")
setup_python(); library(anndata)
ad <- read_h5ad("data.h5ad")
plot_umap(ad, color_map = list(),
          p_config = list(color_by = "cell_type", point_size = 0.5),
          output_file = "umap.pdf", base_size = 9)
```

All plot functions share the signature `(ad, color_map, p_config, output_file, base_size = 9, ...)`; `plot_dotplot()`/`plot_feature()` additionally take `marker_config`. When sourcing a plot file standalone, source `utils.R` first (or run from the scripts directory).

## Bundled Scripts (`r-pipeline/scripts/`)

| File | Purpose |
|------|---------|
| `main.R` | Orchestrator: config, dep check, single Python/h5ad init, function dispatch |
| `setup_env.sh` | Non-destructive environment verifier (R pkgs + Python anndata) |
| `utils.R` | `theme_elegant()`, `get_palette_values()`, `setup_python()`, `check_r_packages()` |
| `generate_colors.R` | `generate_colors()` — auto-generate `colors.yaml` |
| `plot_umap.R` | `plot_umap()` — UMAP with labels, facets, raster |
| `plot_proportions.R` | `plot_proportions()` — stacked bar composition |
| `plot_dotplot.R` | `plot_dotplot()` — marker dotplot with colored facet strips |
| `plot_feature.R` | `plot_feature()` — multi-page feature expression |
| `plot_river.R` | `plot_river()` — alluvial river plots |

## Related References

- **`scplotter-api.md`** — for specialized single-cell plots (TCR/BCR, spatial, cell-cell communication) that fall back to the scplotter package
- **`theme-and-colors.md`** — `theme_elegant()` and palette options used by BasicViz
