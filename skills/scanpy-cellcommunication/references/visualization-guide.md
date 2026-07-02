# CellChat Visualization Guide

Comprehensive guide for visualizing cell-cell communication results.

## Visualization Overview

CellChat provides multiple visualization types:
- Network visualizations (circle, hierarchy, chord)
- Heatmaps for pathway activity
- Bubble plots for interaction details
- Scatter plots for signaling roles
- Violin/dot plots for gene expression

## Network Visualizations

### Circle Network Plots

**Basic Circle Plot:**
```r
# Get cell population sizes
groupSize <- as.numeric(table(cellchat@idents))

# Create circle plot
gg <- netVisual_circle(
  cellchat@net$count,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Cell Communication Network"
)
```

**Customization Options:**
```r
# Custom colors
color.use <- c(
  "T_cell" = "#E41A1C",
  "B_cell" = "#377EB8", 
  "Macrophage" = "#4DAF4A",
  "DC" = "#984EA3"
)

netVisual_circle(
  cellchat@net$count,
  color.use = color.use,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  edge.width.max = 8,  # Maximum edge width
  vertex.size.max = 15  # Maximum vertex size
)
```

**Filtering Specific Interactions:**
```r
# Show only specific cell type interactions
netVisual_circle(
  cellchat@net$count,
  sources.use = c("T_cell", "B_cell"),
  targets.use = c("Macrophage", "DC"),
  remove.isolate = TRUE  # Remove isolated nodes
)
```

### Hierarchical Network Plots

**Basic Hierarchy:**
```r
netVisual_aggregate(
  cellchat,
  signaling = "WNT",
  layout = "hierarchy",
  vertex.receiver = seq(1, 3)  # First 3 cell types as targets
)
```

**Bidirectional Hierarchy:**
```r
# Show both incoming and outgoing signals
netVisual_aggregate(
  cellchat,
  signaling = "WNT",
  layout = "hierarchy",
  vertex.receiver = seq(1, 4),
  sources.use = c("T_cell", "B_cell"),
  targets.use = c("Macrophage", "DC", "Fibroblast")
)
```

### Chord Diagrams

**Basic Chord:**
```r
netVisual_aggregate(
  cellchat,
  signaling = "VEGF",
  layout = "chord",
  title.name = "VEGF Signaling"
)
```

**Chord with Filtering:**
```r
netVisual_chord_cell(
  cellchat,
  sources.use = c("T_cell", "B_cell"),
  targets.use = c("Macrophage"),
  signaling = "WNT"
)
```

**Gene-Level Chord:**
```r
# Show individual LR pairs as chords
netVisual_chord_gene(
  cellchat,
  sources.use = c("T_cell"),
  targets.use = c("Macrophage"),
  signaling = "WNT",
  lab.cex = 0.6  # Label size
)
```

## Heatmap Visualizations

### Communication Heatmaps

**Basic Heatmap:**
```r
# Aggregate communication heatmap
netVisual_heatmap(
  cellchat,
  signaling = "WNT",
  color.heatmap = "Reds",  # Color scheme
  measure = "count"  # or "weight", "count"
)
```

**Multiple Pathways:**
```r
# Compare multiple pathways
pathways <- c("WNT", "BMP", "VEGF", "NOTCH")

for (pathway in pathways) {
  p <- netVisual_heatmap(
    cellchat,
    signaling = pathway,
    color.heatmap = "Reds",
    title.name = paste(pathway, "Signaling")
  )
  print(p)
}
```

### Signaling Role Heatmaps

**Outgoing Signals:**
```r
netAnalysis_signalingRole_heatmap(
  cellchat,
  pattern = "outgoing",
  color.heatmap = "Reds",
  width = 10,
  height = 8
)
```

**Incoming Signals:**
```r
netAnalysis_signalingRole_heatmap(
  cellchat,
  pattern = "incoming",
  color.heatmap = "Blues"
)
```

**Combined View:**
```r
# Show both outgoing and incoming
netAnalysis_signalingRole_heatmap(
  cellchat,
  pattern = "all",
  color.heatmap = "Purples"
)
```

## Bubble Plots

### Basic Bubble Plot

**All Interactions:**
```r
netVisual_bubble(
  cellchat,
  remove.isolate = TRUE,
  max.dataset = NULL,
  min.quantile = 0.05,
  max.quantile = 0.95
)
```

### Filtered Bubble Plots

**By Cell Types:**
```r
netVisual_bubble(
  cellchat,
  sources.use = c("T_cell", "B_cell", "NK_cell"),
  targets.use = c("Macrophage", "DC", "Monocyte"),
  remove.isolate = TRUE
)
```

**By Signaling Pathways:**
```r
netVisual_bubble(
  cellchat,
  signaling = c("WNT", "BMP", "VEGF", "PDGF", "TGFb"),
  remove.isolate = TRUE
)
```

**By Specific LR Pairs:**
```r
# Define specific LR pairs
pairLR.use <- extractEnrichedLR(cellchat, signaling = c("WNT", "BMP"))

netVisual_bubble(
  cellchat,
  pairLR.use = pairLR.use,
  remove.isolate = TRUE
)
```

### Comparative Bubble Plots

**Compare Conditions:**
```r
# For merged datasets
netVisual_bubble(
  cellchat.merged,
  sources.use = NULL,
  targets.use = NULL,
  comparison = c(1, 2),  # Compare first two datasets
  angle.x = 45  # Rotate x-axis labels
)
```

## Scatter Plots

### Signaling Role Scatter

**Basic Scatter:**
```r
netAnalysis_signalingRole_scatter(cellchat)
```

**By Specific Pathway:**
```r
netAnalysis_signalingRole_scatter(
  cellchat,
  signaling = "WNT",
  color.use = NULL,
  label.size = 4
)
```

**Multiple Pathways:**
```r
pathways <- c("WNT", "BMP", "VEGF")

for (pathway in pathways) {
  p <- netAnalysis_signalingRole_scatter(
    cellchat,
    signaling = pathway,
    label.size = 3.5
  )
  print(p)
}
```

### Centrality Scatter

**Outgoing Centrality:**
```r
# Identify dominant senders
netAnalysis_signalingRole_scatter(
  cellchat,
  signaling = "all",
  pattern = "outgoing"
)
```

**Incoming Centrality:**
```r
# Identify dominant receivers
netAnalysis_signalingRole_scatter(
  cellchat,
  signaling = "all",
  pattern = "incoming"
)
```

## Gene Expression Plots

### Violin Plots

**Basic Violin:**
```r
plotGeneExpression(
  cellchat,
  signaling = "WNT",
  enriched.only = TRUE,  # Only enriched genes
  group.by = "cell_type"
)
```

**Multiple Pathways:**
```r
pathways <- cellchat@netP$pathways[1:6]  # First 6 pathways

plotGeneExpression(
  cellchat,
  signaling = pathways,
  enriched.only = TRUE,
  group.by = "cell_type",
  ncol = 3  # 3 columns in output
)
```

**Custom Colors:**
```r
plotGeneExpression(
  cellchat,
  signaling = "WNT",
  enriched.only = TRUE,
  color.use = c("T_cell" = "red", "B_cell" = "blue")
)
```

### Dot Plots

**Gene Expression Dot Plot:**
```r
plotGeneExpression(
  cellchat,
  signaling = "BMP",
  enriched.only = TRUE,
  group.by = "cell_type",
  plot.type = "dot"
)
```

## Embedding Plots

### Pathway Embedding

**Functional Similarity:**
```r
# Compute similarity
cellchat <- computeNetSimilarity(cellchat, type = "functional")
cellchat <- netClustering(cellchat, type = "functional")

# Plot embedding
netVisual_embedding(
  cellchat,
  type = "functional",
  label.size = 3.5,
  do.label = TRUE
)
```

**Structural Similarity:**
```r
cellchat <- computeNetSimilarity(cellchat, type = "structural")
cellchat <- netClustering(cellchat, type = "structural")

netVisual_embedding(
  cellchat,
  type = "structural",
  label.size = 3.5
)
```

**Pairwise Comparison:**
```r
# For merged datasets
netVisual_embeddingPairwise(
  cellchat.merged,
  type = "functional",
  comparison = c(1, 2)
)
```

## Comparative Visualizations

### Differential Analysis

**Differential Circle Plot:**
```r
netVisual_diffInteraction(
  cellchat.merged,
  weight.max = NULL,
  measure = "count",
  comparison = c(1, 2)
)
```

**Differential Heatmap:**
```r
netVisual_diffInteraction(
  cellchat.merged,
  measure = "weight",
  comparison = c(1, 2)
)
```

**Differential Bubble:**
```r
netVisual_bubble(
  cellchat.merged,
  comparison = c(1, 2),
  max.dataset = NULL,
  min.quantile = 0.05,
  max.quantile = 0.95
)
```

### Information Flow Comparison

**Rank Plot:**
```r
rankNet(
  cellchat.merged,
  mode = "comparison",
  stacked = FALSE,
  do.stat = TRUE,
  comparison = c(1, 2)
)
```

**Stacked Bar Plot:**
```r
rankNet(
  cellchat.merged,
  mode = "comparison",
  stacked = TRUE,
  do.stat = TRUE
)
```

## Custom Visualization Functions

### Creating Publication-Ready Figures

**Multi-Panel Figure:**
```r
# Set up PDF output
pdf("cellchat_figures.pdf", width = 12, height = 10)

# Create multi-panel layout
par(mfrow = c(2, 2))

# Panel 1: Overall network
netVisual_circle(cellchat@net$count, 
                 title.name = "A. Overall Communication Network")

# Panel 2: WNT pathway
netVisual_aggregate(cellchat, signaling = "WNT", 
                    layout = "circle",
                    title.name = "B. WNT Signaling")

# Panel 3: BMP pathway
netVisual_aggregate(cellchat, signaling = "BMP",
                    layout = "circle", 
                    title.name = "C. BMP Signaling")

# Panel 4: Signaling roles
netAnalysis_signalingRole_scatter(cellchat, 
                                  title = "D. Signaling Roles")

dev.off()
```

### Custom Color Schemes

**Define Custom Palette:**
```r
# Create custom color palette
cell_type_colors <- c(
  "T_cell_CD4" = "#E41A1C",
  "T_cell_CD8" = "#FF7F00",
  "B_cell" = "#377EB8",
  "Plasma_cell" = "#6BAED6",
  "Macrophage_M1" = "#4DAF4A",
  "Macrophage_M2" = "#74C476",
  "Monocyte" = "#984EA3",
  "DC" = "#F781BF",
  "NK_cell" = "#999999",
  "Neutrophil" = "#BC80BD"
)

# Apply to visualizations
netVisual_circle(
  cellchat@net$count,
  color.use = cell_type_colors
)
```

## Interactive Visualizations

### Using plotly (Optional)

```r
library(plotly)

# Create ggplot object
gg <- netVisual_circle(cellchat@net$count)

# Convert to interactive plot
ggplotly(gg)
```

## Saving Visualizations

### High-Resolution Output

**PDF Format:**
```r
pdf("cellchat_network.pdf", width = 10, height = 8)
netVisual_circle(cellchat@net$count)
dev.off()
```

**PNG Format:**
```r
png("cellchat_network.png", width = 1200, height = 960, res = 150)
netVisual_circle(cellchat@net$count)
dev.off()
```

**SVG Format:**
```r
svg("cellchat_network.svg", width = 10, height = 8)
netVisual_circle(cellchat@net$count)
dev.off()
```

### Multiple Figures

```r
# Create figure directory
dir.create("figures", showWarnings = FALSE)

# Generate all pathway visualizations
pathways <- cellchat@netP$pathways

for (pathway in pathways) {
  pdf(file.path("figures", paste0("pathway_", pathway, ".pdf")),
      width = 8, height = 8)
  
  netVisual_aggregate(cellchat, signaling = pathway, layout = "circle")
  
  dev.off()
}
```

## Troubleshooting Visualizations

### Common Issues

**1. Text Overlap:**
```r
# Reduce label size
netVisual_circle(cellchat@net$count, label.cex = 0.7)

# Rotate labels
netVisual_bubble(cellchat, angle.x = 45)
```

**2. Too Many Cell Types:**
```r
# Group similar cell types
cellchat@meta$cell_group <- ifelse(
  cellchat@meta$cell_type %in% c("CD4_T", "CD8_T"),
  "T_cell",
  cellchat@meta$cell_type
)

# Recreate with grouped labels
cellchat_grouped <- createCellChat(
  object = data.input,
  meta = cellchat@meta,
  group.by = "cell_group"
)
```

**3. Empty Plots:**
```r
# Check if interactions exist
print(cellchat@net$count)

# Reduce filtering thresholds
cellchat <- filterCommunication(cellchat, min.cells = 5)
```

**4. Color Issues:**
```r
# Check color palette
colors <- scales::hue_pal()(length(unique(cellchat@idents)))
print(colors)

# Use RColorBrewer
library(RColorBrewer)
colors <- brewer.pal(n = 8, name = "Set1")
```

## Best Practices

1. **Consistent Colors**: Use same color scheme across all figures
2. **Clear Labels**: Ensure all cell type names are readable
3. **Appropriate Size**: Match figure size to content complexity
4. **High Resolution**: Use vector formats (PDF/SVG) for publications
5. **Legend Placement**: Position legends to avoid obscuring data
6. **Multiple Views**: Show same data with different visualization types
7. **Filtering**: Remove sparse interactions to reduce clutter
8. **Color Contrast**: Ensure sufficient contrast for accessibility
