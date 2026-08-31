# Napari Interactive Visualization

Interactive exploration of spatial transcriptomics data with napari. **Important:** Squidpy's original built-in napari plugin (`img.interactive(adata)`) is **deprecated since v1.4+**. All functionality has moved to the standalone `napari-spatialdata` package. The old approach still works for quick exploration but is no longer maintained.

## Installation

**Recommended (current): napari-spatialdata**
```bash
pip install napari-spatialdata[all]
```

**Legacy (deprecated but functional): Squidpy interactive**
```bash
pip install 'squidpy[interactive]'
```

## Two Approaches Compared

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

## Approach A: Legacy `img.interactive()` (Quick Exploration)

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

## Approach B: `napari-spatialdata` (Production, Multi-sample)

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

## Converting AnnData to SpatialData

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

## Napari Plugins Useful for Spatial Transcriptomics

| Plugin | Purpose | Install |
|--------|---------|---------|
| `napari-spatialdata` | Core spatial data viewer | `pip install napari-spatialdata[all]` |
| `napari-ome-zarr` | OME-Zarr image format | `pip install napari-ome-zarr` |
| `napari-animation` | Create animations from napari sessions | `pip install napari-animation` |
| `cellpose-napari` | Cellpose segmentation in napari | `pip install cellpose-napari` |

## When to Use Which Approach

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

## Common Issues & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `AttributeError: 'QtPointsControls' object has no attribute 'grid_layout'` | Qt version incompatibility with legacy napari plugin | Upgrade napari: `pip install napari --upgrade`, or migrate to `napari-spatialdata` |
| Napari window doesn't appear | Headless server / no display | Cannot use interactive napari; use `sq.pl.spatial_scatter()` for static plots |
| `ModuleNotFoundError: No module named 'spatialdata'` | `napari-spatialdata` needs SpatialData | `pip install spatialdata` |
| Slow rendering with large images | Image too large for GPU memory | Use lazy loading: `ImageContainer(path, lazy=True)`; reduce resolution before viewing |
| Segmentation masks not aligning with image | Coordinate transformation missing | Check `elements_to_coordinate_systems` in SpatialData; ensure transforms are defined |
