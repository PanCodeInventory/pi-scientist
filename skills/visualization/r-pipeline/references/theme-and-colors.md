# Theme and Colors Reference

This document documents the shared theme and color palette from `utils.R`. These components form the visual foundation for the BasicViz and ggplot2 branches.

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

**Note:** the figure standard overrides the default `base_size` — see `shared/figure-standards.md` (Typography).

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
