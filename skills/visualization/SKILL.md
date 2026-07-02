---
name: visualization
description: "Make publication-quality scientific figures in R — single-cell scRNA-seq plots (UMAP, dotplot, composition, feature, river), general statistical charts (box, line, scatter, dot, heatmap, violin, bar, histogram, ridge, enrichment bubble), and genomics plots (volcano, MA, Manhattan, PCA). Use when the user wants scientific or publication figures, single-cell visualizations, enrichment plots, or genomics visualizations. Not for front-end/web charts, dashboards, schematics, architecture diagrams, or 3D surfaces — write code directly for those."
---

# Visualization — Publication Figures in R

One language (R), three branches by what the user is plotting. All branches share one visual standard and one theme.

## Branch — pick the one matching the user's data and goal

| User data / goal | Branch | Reference (read it before coding) |
|------------------|--------|-----------------------------------|
| scRNA-seq `.h5ad` → UMAP / dotplot / composition / feature / river | **BasicViz** (config-driven) | `r-pipeline/references/basicviz-guide.md` |
| Seurat / Giotto → TCR/BCR repertoire, spatial, cell-cell communication, RNA velocity | **scplotter** | `r-pipeline/references/scplotter-api.md` |
| General data → box / line / scatter / dot / heatmap / violin / bar / histogram / density / ridge / stacked area / facet / enrichment bubble | **ggplot2 + clusterProfiler** | `r-pipeline/references/ggplot2-patterns.md` |
| Genomics results → volcano / MA / Manhattan / PCA | **ggplot2 genomics** | `r-pipeline/references/ggplot2-genomics.md` |

If none match — front-end charts, dashboards, schematics, architecture diagrams, 3D surfaces, large point clouds — this skill does not cover it; write code directly and do not enter the skill.

## Gate — applied once, before every figure

**`shared/figure-standards.md`** is the single source of truth for format (PDF vector / TIFF raster, never JPEG), DPI (300), the 24-color Elegant Muted palette, continuous colormaps (`viridis`/`plasma`/`cividis`, never jet), typography (sans-serif, labels 9pt / ticks 7pt / title 10pt bold), figure dimensions (single column 85mm × 2.5–3.0"), and statistics. Read it; every figure this skill produces must pass its **Pre-submission Checklist** (the last section of that file).

All three branches reuse `theme_elegant()` and `get_palette_values()` from `r-pipeline/scripts/utils.R` (see `theme-and-colors.md`), so figures are visually consistent by default — never hand-roll colors or theme elements.

## Done — when the figure meets all three

1. It follows the branch's reference (config schema for BasicViz, API for scplotter, patterns for ggplot2).
2. It passes the `figure-standards.md` Pre-submission Checklist.
3. It reuses `theme_elegant()` + `get_palette_values()` — no bespoke palette or theme.
