# Figure Standards

Shared standards for all visualization output from this skill.

## File Format & Resolution

| Content Type | Format | DPI |
|-------------|--------|-----|
| Plots, graphs, diagrams | **PDF** (vector, preferred) or **PNG** | 300 |
| Photos, microscopy, heatmaps | **TIFF** or **PNG** | 300 |

**Rules:**
- Never use JPEG for scientific figures (compression artifacts)
- Export in PDF for publication; PNG for preview/sharing
- Embed fonts in PDF output

## Color Palette

**Default: Elegant Muted** — 24 low-saturation, high-contrast colors suitable for multi-cluster scRNA-seq and general categorical data.

```
#4E79A7  #F28E2B  #E15759  #76B7B2  #59A14F  #EDC948
#B07AA1  #FF9DA7  #9C755F  #BAB0AC  #882E72  #1965B0
#7BAFDE  #4EB265  #CAE0AB  #F7F056  #EE8026  #DC050C
#72190E  #4271BD  #984EA3  #FFFF33  #A65628  #F781BF
```

When >24 categories needed, interpolate with `colorRampPalette()` (R); `get_palette_values()` already auto-extends via this method.

**Continuous data**: Use `viridis` (default), `plasma`, or `cividis`. Never `jet` or `rainbow`.

**Enrichment bubble plots**: Use `YlOrRd` (Yellow → Orange → Red). Low significance = light yellow, high significance = deep red. **Never use diverging colormaps** (`RdBu_r`, `PuOr`, `coolwarm`) for enrichment — the white/light middle segment is invisible against white backgrounds.

**Diverging data**: Use `RdBu_r` or `PuOr`. Avoid red-green combinations.

## Typography

| Element | Spec |
|---------|------|
| Font family | Sans-serif (Arial, Helvetica) |
| Axis labels | 9 pt, sentence case with units: `"Expression (log2 CPM)"` |
| Tick labels | 7 pt |
| Title | 10 pt bold |
| Legend text | 7 pt |
| Panel labels | 10 pt bold (A, B, C — uppercase for most journals) |

## Layout

| Element | Rule |
|---------|------|
| Legend | No frame; position = "best" (auto, outside data area if possible) |
| Spines | Remove top + right; keep left + bottom |
| Grid | No gridlines unless essential for readability |
| Multi-panel | Bold labels (A/B/C) in top-left or top-center; consistent sizing across panels |
| Background | White (`#FFFFFF`), no transparency |

## Statistics

- Always include error bars: specify SD, SEM, or 95% CI in figure caption
- Show individual data points alongside summary statistics when feasible (n < ~200)
- Significance markers: `*` p<0.05, `**` p<0.01, `***` p<0.001

## Figure Dimensions

| Layout | Width (mm) | Width (inches) | Typical height |
|--------|-----------|----------------|----------------|
| Single column | 85 | 3.35 | 2.5–3.0" |
| Full page width | 175 | 6.89 | 4.0–7.0" |

Aspect ratio: 4:3 or golden ratio (1.618:1) recommended.

## Enrichment Bubble Plots

Specific design standards for enrichment analysis (GO/KEGG/Hallmark/Reactome) bubble plots:

| Element | Standard | Rationale |
|---------|----------|----------|
| Colormap | `YlOrRd` | Sequential yellow→red, no invisible white middle |
| Bubble size | Auto-scaled per plot: linear map gene_count → [20, 300] px² | Different gene sets have vastly different size ranges; fixed scale makes small sets invisible or large sets overflow |
| Edge color | `#555555` (dark gray), width 0.3 | Ensures bubbles visible against white background |
| Alpha | 0.85–0.9 | Slight transparency for overlapping bubbles |
| Threshold lines | None | Clean, uncluttered |
| Legend | Colorbar for single-database plots; database color legend for combined plots; no size legend | Minimal, publication-ready |

**Auto-scaling formula** (map gene counts to a fixed pixel range so small and large sets stay visible):
```
MIN_SIZE, MAX_SIZE = 20, 300
size = MIN_SIZE + (gene_count - count_min) / (count_max - count_min) * (MAX_SIZE - MIN_SIZE)
```
In ggplot2, this is `scale_size_continuous(range = c(2, 8))`; in `enrichplot::dotplot`, bubble size is auto-scaled by default — do not override it with a fixed multiplier.

**Common bubble plot layouts**:
- **Single**: One enrichment database, top 15 terms
- **Combined**: Multiple databases merged (KEGG=red, Hallmark=orange, GO_BP=teal, Reactome=green), top 20
- **Matrix**: Up/Down regulation side-by-side for same database, top 15 per direction

**Anti-patterns**:
- `RdYlBu_r` / `RdBu_r` for enrichment → white middle invisible
- Fixed `s = gene_count × constant` → bubbles too small for small gene sets, too large for large ones
- White `edgecolors='white'` → bubbles vanish into background
- Grey dashed threshold lines → visual clutter with no information gain

## Pre-submission Checklist

- [ ] PDF vector format for plots; 300 DPI for raster
- [ ] Text ≥7pt at final print size; sans-serif; units in labels
- [ ] Colorblind-safe palette; interpretable in grayscale
- [ ] Error bars defined in caption; individual points shown when feasible
- [ ] Panel labels bold + consistent; legend clear + frameless
- [ ] No chart junk: no 3D, shadows, excessive gridlines
- [ ] Fonts embedded in PDF
