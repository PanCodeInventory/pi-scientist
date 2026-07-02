# Theme and Colors Reference

This document documents the shared theme, color palette, and Python setup utilities from `utils.R`. These components form the visual foundation for all BasicViz plots.

## theme_elegant()

Creates a clean, publication-ready theme based on `theme_minimal()` with L-shaped axes and no gridlines.

### Signature

```r
theme_elegant(base_size = 14, base_family = "sans")
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_size` | 14 | Base font size in points |
| `base_family` | "sans" | Font family (e.g., "sans", "serif", "mono") |

### Component Configuration

#### Plot Title
- **Face**: bold
- **Size**: 1.2× base_size (16.8pt at default)
- **Horizontal justification**: 0 (left-aligned)
- **Margin**: 10pt bottom margin

#### Plot Subtitle
- **Size**: 0.9× base_size (12.6pt at default)
- **Color**: grey30
- **Margin**: 10pt bottom margin

#### Plot Caption
- **Size**: 0.8× base_size (11.2pt at default)
- **Color**: grey50
- **Horizontal justification**: 1 (right-aligned)

#### Axis Elements
- **Axis titles**: bold face, 0.9× base_size
- **Axis text**: black color, 0.8× base_size
- **Axis lines**: black, 0.8 linewidth, L-shaped (no box border)
- **Axis ticks**: black, 0.8 linewidth

#### Grid
- **Major grid**: blank (removed)
- **Minor grid**: blank (removed)

#### Legend
- **Position**: right
- **Title**: bold face, 0.8× base_size
- **Text**: 0.8× base_size
- **Key size**: 1 line unit
- **Frame**: blank (removed)

#### Background
- **Plot background**: white fill, no border
- **Panel background**: white fill, no border
- **Panel border**: blank (removed)

### Usage Example

```r
ggplot(data, aes(x = variable1, y = variable2, color = group)) +
  geom_point() +
  theme_elegant() +
  labs(title = "Distribution Overview", subtitle = "Sample visualization")
```

---

## Color Palettes (get_palette_values())

Retrieves color palettes for categorical data visualization. Handles auto-extension when requested color count exceeds palette length.

### Signature

```r
get_palette_values(palette_name = "elegant", n = 5)
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `palette_name` | "elegant" | Palette name (see supported palettes below) |
| `n` | 5 | Number of colors to return |

### Supported Palettes

#### Default "elegant" / "muted" Palette

The primary palette with 24 low-saturation, high-contrast colors. Use "elegant", "muted", "default", or `NULL` to access this palette. The full 24-color hex list and the rules for when to use it live in **`shared/figure-standards.md` → Color Palette** — that file is the single source of truth for palette values.

#### Named Scientific Palettes (via ggsci)

| Palette | Source | Colors |
|---------|--------|--------|
| `"npg"` | Nature Publishing Group | 10 |
| `"jco"` | Journal of Clinical Oncology | 10 |
| `"igv"` | Integrative Genomics Viewer | 51 |

#### RColorBrewer Integration

Any palette from `brewer.pal.info` works directly:

```r
get_palette_values("Set1", n = 9)   # Qualitative
get_palette_values("Blues", n = 9)  # Sequential
get_palette_values("RdYlBu", n = 11) # Diverging
```

The function automatically retrieves the maximum available colors for the requested palette.

#### Fallback Behavior

For unknown palette names:
- If `n <= 24`: returns the elegant palette
- If `n > 24`: generates colors via `scales::hue_pal()`

### Auto-Extension

When `n` exceeds the native palette length, colors are interpolated using `colorRampPalette()`:

```r
# Request 30 colors from a 24-color palette
colors <- get_palette_values("elegant", n = 30)
# Returns 30 colors via smooth interpolation
```

### Usage Examples

```r
# Get default elegant colors
colors <- get_palette_values("elegant", n = 5)

# Use Nature Publishing Group palette
npg_colors <- get_palette_values("npg", n = 8)

# Auto-extend Brewer palette
brewer_extended <- get_palette_values("Accent", n = 20)

# Apply in ggplot
ggplot(data, aes(x, y, color = category)) +
  geom_point() +
  scale_color_manual(values = get_palette_values("jco", n = 6))
```

---

## Color Management

Loads custom color mappings from YAML and applies them to plots with intelligent fallback behavior.

### load_colors()

Loads color mappings from a YAML file.

```r
load_colors <- function(colors_yaml_path)
```

Returns an empty list if the file doesn't exist, allowing graceful degradation.

### scale_color_custom()

Applies custom color mappings to discrete color aesthetics with missing value detection.

```r
scale_color_custom(col_name, color_map, data_vec = NULL, labels = NULL)
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `col_name` | Column name to look up in `color_map` |
| `color_map` | List loaded via `load_colors()` |
| `data_vec` | Optional data vector for missing color detection |
| `labels` | Optional custom legend labels |

#### Missing Color Detection

When `data_vec` is provided, the function identifies categories in the data that lack color assignments:

```r
# Detects: missing <- setdiff(unique(data_vec), names(mapping))
```

#### Missing Color Fallback

Missing colors are filled from `elegant_pal_values`, excluding already-assigned colors:

1. Compute available colors: `setdiff(elegant_pal_values, used_colors)`
2. If insufficient, wrap around to include the full palette
3. Assign sequentially to missing categories

#### No Mapping Fallback

If no color map exists for the column, falls back to `scale_color_viridis_d()`.

#### NA Handling

Missing values always map to `"grey90"`.

### scale_fill_custom()

Applies custom color mappings to fill aesthetics. Simpler than `scale_color_custom()` without missing detection.

```r
scale_fill_custom(col_name, color_map, data_vec = NULL)
```

Falls back to `scale_fill_viridis_d()` if no mapping exists.

### Usage Example

```r
# Load color mappings
color_map <- load_colors("colors.yaml")

# Apply to plot with missing color detection
ggplot(data, aes(x, y, color = cell_type)) +
  geom_point() +
  scale_color_custom(
    col_name = "cell_type",
    color_map = color_map,
    data_vec = data$cell_type,
    labels = c("B cell", "T cell", "NK cell")
  )
```

### colors.yaml Format

```yaml
cell_type:
  CD4_T: "#4E79A7"
  CD8_T: "#F28E2B"
  B_cell: "#E15759"
  NK: "#76B7B2"
```

---

## setup_python()

Initializes the Python environment for reticulate with path isolation to prevent conflicts.

### Signature

```r
setup_python()
```

### Setup Sequence

#### 1. RETICULATE_PYTHON Environment Variable

Checks for `RETICULATE_PYTHON` environment variable. If not set, falls back to `python3` then `python` via `Sys.which()`.

#### 2. The "Chdir Dance" Pattern

Prevents Python from adding the current working directory to `sys.path`, which can cause module import conflicts.

```
1. Save current working directory
2. Change to "/" (safe harbor) BEFORE any Python initialization
3. Call use_python() to initialize
4. Clean sys.path to remove the original CWD
5. Return to original directory
```

#### 3. sys.path Cleanup

Executes Python code to remove the original working directory from `sys.path`:

```python
import sys
import os
bad_path = '/original/working/directory'
sys.path = [p for p in sys.path if p != '' and os.path.abspath(p) != os.path.abspath(bad_path)]
```

#### 4. Warning Suppression

Sets `options(warn = -1)` after setup to suppress routine warnings during Python interop.

### Usage Example

```r
# Call once at script start
setup_python()

# Now safe to use reticulate
library(reticulate)
py_config()
```

### Error Handling

Wrap initialization in try-catch to gracefully handle missing Python installations. Errors are reported as messages, not fatal failures.
