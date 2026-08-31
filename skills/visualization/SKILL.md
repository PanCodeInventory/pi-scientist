---
name: visualization
description: "Publication-quality scientific figures in R. Use when the user wants single-cell visualizations, TCR/BCR repertoire, spatial, cell-cell communication, or RNA velocity plots; general statistical charts (box, scatter, line, heatmap, violin, bar); enrichment plots; or genomics visualizations."
---

# Visualization — Publication Figures in R

Three branches by what the user is plotting.

## Branch — pick the one matching the user's data and goal

| User data / goal | Branch | Reference (read it before coding) |
|------------------|--------|-----------------------------------|
| scRNA-seq `.h5ad` → UMAP / dotplot / composition / feature / river | **BasicViz** (config-driven) | `r-pipeline/references/basicviz-guide.md` |
| Seurat / Giotto → TCR/BCR repertoire, spatial, cell-cell communication, RNA velocity | **scplotter** | `r-pipeline/references/scplotter-api.md` |
| General data → box / line / scatter / dot / heatmap / violin / bar / histogram / density / ridge / stacked area / facet / enrichment bubble | **ggplot2 + clusterProfiler** | `r-pipeline/references/ggplot2-patterns.md` |
| Genomics results → volcano / MA / Manhattan / PCA | **ggplot2 genomics** | `r-pipeline/references/ggplot2-genomics.md` |

If none match — front-end charts, dashboards, schematics, architecture diagrams, 3D surfaces, large point clouds — this skill does not cover it.

## Gate — applied once, before every figure

**`shared/figure-standards.md`** is the single source of truth for every figure this skill produces. Read it before coding.

The BasicViz and ggplot2 branches reuse `theme_elegant()` from `r-pipeline/scripts/utils.R` (see `theme-and-colors.md`); the scplotter branch uses scplotter's own theming.

## Done — when the figure meets all three

1. Every plot in the figure is produced by a function/pattern named in the branch's reference — no ad-hoc plotting code.
2. It passes all 32 standards in `figure-standards.md` (the Pre-submission Checklist is the minimum).
3. It uses the branch's theme — `theme_elegant()` for BasicViz/ggplot2, scplotter's own theming for scplotter — no bespoke theme.
