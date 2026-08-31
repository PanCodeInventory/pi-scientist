# ggplot2 Publication Patterns

Common publication-quality charts for general (non-single-cell) data: box, line, heatmap, violin, bar, faceted panels, and enrichment bubble plots. All examples reuse the shared `theme_elegant()` theme and `get_palette_values()` palette defined in `r-pipeline/scripts/utils.R` (see `theme-and-colors.md`).

**Visual standards** (format, DPI, typography, layout): `shared/figure-standards.md` is the single source of truth — apply it here.

## Setup

```r
source("r-pipeline/scripts/utils.R")   # loads theme_elegant(), get_palette_values()
library(ggplot2)

# Shared defaults
 theme_base <- theme_elegant(base_size = 9)   # match 9pt label standard
 colors <- get_palette_values("elegant", n = n_levels)
```

---

## Box + Individual Points

```r
ggplot(df, aes(x = group, y = value, fill = group)) +
  geom_boxplot(outlier.shape = NA, alpha = 0.6) +
  geom_jitter(width = 0.15, color = "black", alpha = 0.3, size = 0.8) +
  scale_fill_manual(values = colors) +
  labs(y = "Value (units)", x = NULL) +
  theme_base
```

`outlier.shape = NA` on the boxplot prevents double-plotting outliers that the jitter already shows.

## Line with Confidence Interval

```r
ggplot(df, aes(x = time, y = value, color = treatment, group = treatment)) +
  geom_smooth(method = "loess", se = TRUE, level = 0.95, alpha = 0.15) +
  geom_point(size = 1.2) +
  scale_color_manual(values = colors) +
  labs(x = "Time (hours)", y = "Measurement (AU)") +
  theme_base
```

For precomputed CIs, use `geom_ribbon(aes(ymin = lo, ymax = hi), alpha = 0.2)` instead of `geom_smooth`.

## Heatmap / Correlation Matrix

For correlation matrices and expression heatmaps, **`ComplexHeatmap`** is the strongest option in the R ecosystem (Python has no true equivalent).

```r
library(ComplexHeatmap)
library(circlize)

corr <- cor(df)
col_fun <- colorRamp2(c(-1, 0, 1), c("#4393C3", "white", "#D6604D"))  # RdBu-style, diverging

Heatmap(
  corr,
  name = "r",
  col = col_fun,
  cell_fun = function(j, i, x, y, width, height, fill)
    grid.text(sprintf("%.2f", corr[i, j]), x, y, gp = gpar(fontsize = 7)),
  column_names_gp = gpar(fontsize = 7),
  row_names_gp    = gpar(fontsize = 7),
  show_row_dend = FALSE, show_column_dend = FALSE
)
```

For a quick ggplot2 tile heatmap (no dendrogram):

```r
ggplot(corr_df, aes(Var1, Var2, fill = value)) +
  geom_tile(color = "white", linewidth = 0.3) +
  geom_text(aes(label = sprintf("%.2f", value)), size = 2.2) +
  scale_fill_gradient2(low = "#4393C3", mid = "white", high = "#D6604D", midpoint = 0) +
  coord_fixed() +
  labs(x = NULL, y = NULL) +
  theme_base + theme(axis.text.x = element_text(angle = 45, hjust = 1))
```

## Violin

```r
ggplot(df, aes(x = group, y = value, fill = condition)) +
  geom_violin(alpha = 0.6, trim = FALSE) +
  stat_summary(fun = median, geom = "point", size = 1) +
  scale_fill_manual(values = colors) +
  labs(y = "Expression (AU)", x = NULL) +
  theme_base
```

## Bar with Error Bars

```r
summary <- df %>%
  group_by(treatment) %>%
  summarise(mean = mean(response), sd = sd(response), n = n(),
            se = sd / sqrt(n))

ggplot(summary, aes(x = treatment, y = mean, fill = treatment)) +
  geom_col(alpha = 0.8) +
  geom_errorbar(aes(ymin = mean - se, ymax = mean + se), width = 0.2) +
  scale_fill_manual(values = colors) +
  labs(y = "Response (units)", x = NULL) +
  theme_base
```

## Faceted Multi-Panel

ggplot2's facet system is the cleanest way to make multi-panel figures — use it instead of stitching panels by hand.

```r
ggplot(df, aes(x = x, y = y, color = group)) +
  geom_point(size = 1) +
  geom_smooth(method = "lm", se = FALSE) +
  facet_wrap(~ category, ncol = 3) +
  scale_color_manual(values = colors) +
  labs(x = "X (units)", y = "Y (units)") +
  theme_base
```

For panel labels (A/B/C), add `strip.text` styling via `theme()` or post-process with `cowplot::plot_grid(..., labels = "AUTO")`.

## Scatter with Regression

For correlations, dose-response, and continuous-vs-continuous relationships.

```r
ggplot(df, aes(x = x, y = y, color = group)) +
  geom_point(alpha = 0.6, size = 1.2) +
  geom_smooth(method = "lm", se = TRUE, alpha = 0.15) +
  scale_color_manual(values = colors) +
  labs(x = "X (units)", y = "Y (units)") +
  theme_base
```

Add the correlation in the panel with `ggpubr::stat_cor(aes(label = ..r.label..))` or annotate manually. Use `geom_smooth(method = "loess")` for non-linear trends; `lm` only when the relationship is plausibly linear.

## Dot Plot (Cleveland)

For comparing many groups/categories where a bar chart would lose resolution. Each value is a point on a line; easier to read precise values than bars.

```r
ggplot(summary, aes(x = value, y = reorder(term, value))) +
  geom_point(size = 2.5, color = get_palette_values("elegant", n = 1)) +
  geom_segment(aes(x = 0, xend = value, y = term, yend = term),
               color = "grey70", linewidth = 0.4) +
  labs(x = "Value (units)", y = NULL) +
  theme_base
```

Lollipop style (point + thin segment) is preferred over bare points for ordered comparison. For grouped Cleveland dots, add `color = group` and `position = position_dodge(0.5)`.

## Histogram / Density

For inspecting distributions: expression, p-values, QC metrics.

```r
# Histogram with overlay
ggplot(df, aes(x = value, fill = group)) +
  geom_histogram(alpha = 0.5, position = "identity", bins = 30) +
  scale_fill_manual(values = colors) +
  labs(x = "Value (units)", y = "Count") +
  theme_base

# Density (better when comparing many groups)
ggplot(df, aes(x = value, fill = group)) +
  geom_density(alpha = 0.4) +
  scale_fill_manual(values = colors) +
  labs(x = "Value (units)", y = "Density") +
  theme_base
```

Use **density** when comparing ≥3 groups (histograms overlap into mud); histogram when you need raw counts or integer bins. For p-value distributions, check the uniform flat shape expected under the null — a peak near 0 signals enrichment.

## Stacked Area

For cumulative change over a continuous time variable (prefer over stacked bar when x is continuous).

```r
ggplot(df, aes(x = time, y = value, fill = component)) +
  geom_area(position = "stack") +
  scale_fill_manual(values = colors) +
  labs(x = "Time (units)", y = "Cumulative value", fill = NULL) +
  theme_base
```

For relative composition over time, use `position = "fill"` (stacks to 1.0).

## Ridge Plot

For comparing many distributions side-by-side (avoids the cluttered-overlap of many violins). Requires `ggridges`.

```r
library(ggridges)

ggplot(df, aes(x = value, y = group, fill = group)) +
  geom_density_ridges(alpha = 0.7, scale = 1.1) +
  scale_fill_manual(values = colors, guide = "none") +
  labs(x = "Value (units)", y = NULL) +
  theme_base
```

Set `scale` slightly > 1 to let adjacent ridges overlap (the visual signature of the format). Drop the y-axis legend (the ridges self-label). Best for 5–20 groups; below 5 use violins, above 20 it gets cramped.

---

## Enrichment Bubble Plots

For GO / KEGG / Hallmark / Reactome enrichment. **Use `clusterProfiler` + `enrichplot`** — they are the de-facto standard companion to enrichment analysis and produce publication-ready output directly.

Full design spec is below (Key design rules). Apply those decisions in R:

### Standard dotplot (single database)

```r
library(clusterProfiler)
library(enrichplot)

# `ego` is a standard enrichGO / gseaResult object
dotplot(ego, showCategory = 15, color = "p.adjust") +
  scale_color_gradient(low = "#DC050C", high = "#F7F056") +  # YlOrRd-like, high sig = red
  theme_base
```

`enrichplot::dotplot` auto-scales bubble size by gene count per plot — exactly the behavior the standards require. Do not override `size` with a fixed multiplier.

### Combined multi-database

Merge results from KEGG / Hallmark / GO_BP / Reactome into one plot, colored by source database:

```r
library(dplyr)

combined <- list(KEGG = kegg_res, Hallmark = hallmark_res,
                 GO_BP = gobp_res, Reactome = reactome_res) %>%
  bind_rows(.id = "database") %>%
  mutate(term_short = substr(Description, 1, 55),
         neg_log_p = -log10(p.adjust))

library_colors <- c(KEGG = "#E15759", Hallmark = "#F28E2B",
                    GO_BP = "#76B7B2", Reactome = "#59A14F")

ggplot(combined %>% slice_max(neg_log_p, n = 20), aes(x = neg_log_p, y = reorder(term_short, neg_log_p))) +
  geom_point(aes(size = Count, color = database), alpha = 0.9, stroke = 0.3) +
  scale_color_manual(values = library_colors, name = "Database") +
  scale_size_continuous(range = c(2, 8), name = "Gene count") +
  labs(x = "-log10(adjusted p-value)", y = NULL) +
  guides(color = guide_legend(override.aes = list(size = 4))) +
  theme_base
```

### Matrix (up/down side-by-side)

```r
ggplot(combined, aes(x = direction, y = reorder(term_short, neg_log_p),
                     size = Count, color = neg_log_p)) +
  geom_point(alpha = 0.9, stroke = 0.3) +
  scale_color_gradient(low = "#F7F056", high = "#DC050C") +
  scale_size_continuous(range = c(2, 8)) +
  facet_grid(database ~ ., scales = "free_y", space = "free_y") +
  labs(x = NULL, y = NULL, color = "-log10(padj)", size = "Gene count") +
  theme_base
```

### Key design rules

| Element | Choice | Why |
|---------|--------|-----|
| Color | Sequential yellow→red (`#F7F056`→`#DC050C`, or `YlOrRd`) | High significance reads as deep red |
| Bubble size | Auto-scaled per plot (`scale_size_continuous(range = ...)`) | Gene-set sizes vary 10×–80× across databases; fixed scale breaks readability |
| Edge | `stroke = 0.3` (thin gray) | Ensures bubbles separate against white background |
| Threshold lines | None | Clean look; significance is encoded by color/position |

### Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| `RdBu_r` / diverging colormap | White middle invisible on white bg | Use sequential `YlOrRd` or the yellow→red gradient above |
| `size = Count * k` fixed | Small gene sets → invisible dots | `scale_size_continuous(range = c(2, 8))` (auto-scale) |
| White bubble edges | Bubbles vanish into background | Thin gray `stroke = 0.3` |
| Grey dashed threshold lines | Clutter without information | Remove |
