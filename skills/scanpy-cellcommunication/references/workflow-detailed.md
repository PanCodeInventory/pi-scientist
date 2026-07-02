# CellChat Detailed Workflow Guide

## Complete Analysis Pipeline

This guide provides a comprehensive walkthrough of CellChat analysis with detailed explanations.

## Phase 1: Environment Preparation

### System Requirements

- **Memory**: At least 16GB RAM recommended for large datasets (>10,000 cells)
- **Storage**: 2-5GB for installation and temporary files
- **Time**: Full analysis takes 30 minutes to 2 hours depending on dataset size

### Environment Activation

```bash
# Activate conda environment
mamba activate cellchat

# Verify R installation
R --version

# Start R
R
```

## Phase 2: Data Input Formats

### Format 1: Seurat Object (Recommended)

Seurat is the most common input format for single-cell data.

```r
# Load required libraries
library(CellChat)
library(Seurat)
library(dplyr)

# Load Seurat object
seurat_obj <- readRDS("path/to/your/seurat_object.rds")

# Check cell type annotations
table(seurat_obj$cell_type)

# Extract normalized data and metadata
data.input <- GetAssayData(seurat_obj, slot = "data")  # log-normalized data
meta <- seurat_obj@meta.data

# Create CellChat object
cellchat <- createCellChat(
  object = data.input,
  meta = meta,
  group.by = "cell_type"  # Column name for cell type labels
)
```

### Format 2: Expression Matrix

Direct matrix input for non-Seurat workflows.

```r
# Load expression matrix (genes x cells)
expression_matrix <- readRDS("expression_matrix.rds")

# Load cell labels
cell_labels <- read.csv("cell_labels.csv")$cell_type

# Create metadata frame
meta <- data.frame(
  labels = cell_labels,
  row.names = colnames(expression_matrix)
)

# Create CellChat object
cellchat <- createCellChat(
  object = expression_matrix,
  meta = meta,
  group.by = "labels"
)
```

### Format 3: Spatial Transcriptomics

For spatial data analysis.

```r
# Load spatial data
spatial_data <- readRDS("spatial_seurat.rds")

# Extract data
data.input <- GetAssayData(spatial_data, slot = "data")
meta <- spatial_data@meta.data

# Include spatial coordinates if available
meta$coord_x <- spatial_data@images$slice1@coordinates$imagerow
meta$coord_y <- spatial_data@images$slice1@coordinates$imagecol

# Create CellChat object
cellchat <- createCellChat(
  object = data.input,
  meta = meta,
  group.by = "cell_type"
)
```

## Phase 3: Database Setup and Customization

### Understanding CellChatDB

CellChatDB contains three types of molecular interactions:

1. **Secreted Signaling**: Paracrine and autocrine signaling
2. **Contact-dependent**: Cell-cell contact interactions
3. ** ECM-Receptor**: Extracellular matrix interactions

```r
# Load database
CellChatDB <- CellChatDB.human  # or CellChatDB.mouse

# View structure
str(CellChatDB)

# Database components:
# - interaction: Ligand-receptor pairs
# - complex: Multi-subunit complexes
# - cofactor: Co-factors (agonists/antagonists)
# - geneInfo: Gene information
```

### Database Subsetting

Focus on specific interaction types:

```r
# Use only secreted signaling
cellchat@DB <- subsetDB(CellChatDB, search = "Secreted Signaling")

# Exclude specific pathways
cellchat@DB <- CellChatDB
excluded_pathways <- c("MHC-I", "MHC-II")
cellchat@DB$interaction <- cellchat@DB$interaction[
  !cellchat@DB$interaction$pathway_name %in% excluded_pathways, 
]
```

### Custom Database

Add custom ligand-receptor pairs:

```r
# Create custom interaction
 custom_interaction <- data.frame(
  interaction_name = "CustomLigand_CustomReceptor",
  pathway_name = "CUSTOM_PATHWAY",
  ligand = "CustomLigand",
  receptor = "CustomReceptor",
  agonist = "",
  antagonist = "",
  co_A_receptor = "",
  co_I_receptor = "",
  evidence = "Literature",
  annotation = "Secreted Signaling"
)

# Add to database
cellchat@DB$interaction <- rbind(cellchat@DB$interaction, custom_interaction)
```

## Phase 4: Data Preprocessing

### Expression Processing

```r
# Subset data to variable genes
cellchat <- subsetData(cellchat)

# Identify overexpressed genes
# This step identifies genes significantly higher than average
cellchat <- identifyOverExpressedGenes(
  cellchat,
  features = c("ligand", "receptor"),  # Focus on ligands and receptors
  min.pct = 0.1,  # Minimum percentage of cells expressing the gene
  min.diff.pct = 0.1,  # Minimum difference in expression percentage
  do.fast = TRUE  # Use fast algorithm
)
```

### Parameter Tuning

Adjust thresholds based on data quality:

```r
# For high-quality data (lower thresholds)
cellchat <- identifyOverExpressedGenes(
  cellchat,
  min.pct = 0.05,
  min.diff.pct = 0.05,
  min.cells = 5
)

# For noisy data (higher thresholds)
cellchat <- identifyOverExpressedGenes(
  cellchat,
  min.pct = 0.2,
  min.diff.pct = 0.2,
  min.cells = 20
)
```

## Phase 5: Communication Probability Calculation

### Core Algorithm

CellChat uses a probabilistic model based on:

1. **Expression Level**: Average expression of ligand and receptor
2. **Co-expression**: Cells co-expressing both ligand and receptor
3. **Interaction Strength**: Downstream target gene expression

```r
# Calculate communication probabilities
cellchat <- computeCommunProb(
  cellchat,
  raw.use = TRUE,  # Use raw counts for probability calculation
  population.size = FALSE,  # Don't weight by population size
  type = "triMean",  # Use trimean for robust aggregation
  trim = 0.1  # Trim proportion for trimean
)
```

### Alternative Methods

```r
# Using mean instead of trimean
cellchat <- computeCommunProb(cellchat, type = "mean")

# Using median (more robust to outliers)
cellchat <- computeCommunProb(cellchat, type = "median")

# Weight by population size (for imbalanced cell types)
cellchat <- computeCommunProb(cellchat, population.size = TRUE)
```

### Filtering Communications

```r
# Filter by minimum number of cells
cellchat <- filterCommunication(
  cellchat,
  min.cells = 10,  # Minimum cells in sender and receiver groups
  min.prob = 0.05  # Minimum communication probability
)
```

## Phase 6: Network Construction

### Aggregate Networks

```r
# Create aggregated network
cellchat <- aggregateNet(cellchat)

# Network components
# cellchat@net$count: Number of interactions between cell types
# cellchat@net$weight: Strength of interactions
# cellchat@net$prob: Communication probabilities
```

### Network Properties

```r
# View network statistics
count_matrix <- cellchat@net$count
weight_matrix <- cellchat@net$weight

# Calculate network metrics
total_interactions <- sum(count_matrix)
mean_interactions <- mean(count_matrix[count_matrix > 0])
max_interactions <- max(count_matrix)

print(paste("Total interactions:", total_interactions))
print(paste("Mean interactions (non-zero):", round(mean_interactions, 2)))
```

## Phase 7: Visualization Strategies

### 7.1 Overview Visualizations

**Circle Network Plot:**
```r
# Basic circle plot
groupSize <- as.numeric(table(cellchat@idents))
netVisual_circle(
  cellchat@net$count,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Number of Interactions",
  color.use = scales::hue_pal()(length(unique(cellchat@idents)))
)
```

**Comparison of Count vs Weight:**
```r
par(mfrow = c(1, 2))
netVisual_circle(cellchat@net$count, title.name = "Number of Interactions")
netVisual_circle(cellchat@net$weight, title.name = "Interaction Weights")
```

### 7.2 Signaling Pathway Visualization

**Hierarchical Layout:**
```r
# Show hierarchy of cell types
netVisual_aggregate(
  cellchat,
  signaling = "WNT",
  layout = "hierarchy",
  vertex.receiver = seq(1, 4),  # First 4 cell types as targets
  sources.use = c("CellType1", "CellType2"),  # Filter sources
  targets.use = c("CellType3", "CellType4")  # Filter targets
)
```

**Chord Diagram:**
```r
# Chord diagram for specific pathway
netVisual_aggregate(
  cellchat,
  signaling = "VEGF",
  layout = "chord",
  signaling.name = paste(pathway, "Signaling")
)
```

### 7.3 Individual LR Pair Visualization

```r
# Extract LR pairs for pathway
pairLR <- extractEnrichedLR(
  cellchat,
  signaling = pathway,
  geneLR.return = FALSE
)

# Visualize first LR pair
netVisual_individual(
  cellchat,
  signaling = pathway,
  pairLR.use = pairLR[1, ],
  layout = "circle",
  sources.use = NULL,
  targets.use = NULL
)
```

### 7.4 Bubble Plots

```r
# All interactions
netVisual_bubble(
  cellchat,
  sources.use = NULL,
  targets.use = NULL,
  signaling = NULL,
  pairLR.use = NULL,
  remove.isolate = TRUE,  # Remove isolated interactions
  max.dataset = NULL,
  min.quantile = 0.05,
  max.quantile = 0.95
)

# Specific cell type pairs
netVisual_bubble(
  cellchat,
  sources.use = c("T_cell", "B_cell"),
  targets.use = c("Macrophage", "DC"),
  signaling = c("WNT", "BMP", "VEGF")
)
```

## Phase 8: Advanced Network Analysis

### 8.1 Centrality Analysis

Calculate network centrality to identify key cell types:

```r
# Compute centrality scores
cellchat <- netAnalysis_computeCentrality(
  cellchat,
  slot.name = "netP",
  net = cellchat@net$prob,
  net.name = "weighted"
)

# Visualize signaling roles
netAnalysis_signalingRole_scatter(cellchat)

# Heatmap of signaling roles
netAnalysis_signalingRole_heatmap(cellchat, pattern = "outgoing")
netAnalysis_signalingRole_heatmap(cellchat, pattern = "incoming")
```

### 8.2 Pathway Clustering

Group similar pathways based on functional similarity:

```r
# Compute pathway similarity
cellchat <- computeNetSimilarity(
  cellchat,
  type = "functional",  # or "structural"
  comparison = NULL
)

# Cluster pathways
cellchat <- netClustering(
  cellchat,
  type = "functional",
  comparison = NULL,
  k = 4  # Number of clusters
)

# Visualize pathway embedding
netVisual_embedding(
  cellchat,
  type = "functional",
  label.size = 3.5,
  do.label = TRUE
)
```

### 8.3 Dominant Pathway Identification

```r
# Identify dominant senders and receivers
netAnalysis_signalingRole_scatter(cellchat)

# Contribution of each cell type to each pathway
contribution <- netAnalysis_contribution(cellchat, signaling = "WNT")
print(contribution)
```

## Phase 9: Gene Expression Visualization

### 9.1 Violin Plots

```r
# Expression of signaling genes
plotGeneExpression(
  cellchat,
  signaling = "WNT",
  enriched.only = TRUE,  # Show only enriched genes
  group.by = "cell_type"
)
```

### 9.2 Dot Plots

```r
# Similar to Seurat DotPlot
plotGeneExpression(
  cellchat,
  signaling = "BMP",
  enriched.only = TRUE,
  group.by = "cell_type",
  plot.type = "dot"  # or "violin"
)
```

## Phase 10: Comparative Analysis

### 10.1 Merging Multiple Datasets

```r
# Create list of CellChat objects
cellchat.list <- list(
  Control = cellchat.control,
  Treatment = cellchat.treat
)

# Merge datasets
cellchat.merged <- mergeCellChat(
  cellchat.list,
  add.names = names(cellchat.list),
  cell.prefix = TRUE
)
```

### 10.2 Comparative Visualizations

**Differential Interaction Network:**
```r
# Compare interaction counts
netVisual_diffInteraction(
  cellchat.merged,
  weight.max = NULL,
  measure = "count",  # or "weight"
  comparison = c(1, 2)
)
```

**Differential Bubble Plot:**
```r
netVisual_bubble(
  cellchat.merged,
  sources.use = NULL,
  targets.use = NULL,
  comparison = c(1, 2),
  angle.x = 45
)
```

**Pathway Comparison:**
```r
# Compare specific pathway
gg1 <- netVisual_bubble(
  cellchat.merged,
  comparison = c(1, 2),
  signaling = "WNT"
) + ggtitle("WNT Pathway")

print(gg1)
```

### 10.3 Pathway Similarity Comparison

```r
# Compute and compare pathway similarities
cellchat.merged <- computeNetSimilarityPairwise(
  cellchat.merged,
  type = "functional"
)

# Visualize similarity
netVisual_embeddingPairwise(
  cellchat.merged,
  type = "functional",
  comparison = c(1, 2)
)
```

## Phase 11: Export and Reporting

### 11.1 Save CellChat Object

```r
# Save complete object
saveRDS(cellchat, file = "cellchat_analysis.rds")

# Save specific components
saveRDS(cellchat@net, "cellchat_network.rds")
saveRDS(cellchat@netP, "cellchat_pathways.rds")
```

### 11.2 Export Tables

```r
# Extract communication network
df.net <- subsetCommunication(cellchat)
write.csv(df.net, "communication_network.csv", row.names = FALSE)

# Extract LR pairs
lr_pairs <- extractEnrichedLR(cellchat, geneLR.return = TRUE)
write.csv(lr_pairs, "ligand_receptor_pairs.csv")

# Extract pathway contributions
pathway_contrib <- netAnalysis_contribution(cellchat, signaling = "all")
write.csv(pathway_contrib, "pathway_contributions.csv")
```

### 11.3 Generate Report

```r
# Create summary report
cat("CellChat Analysis Summary\n")
cat("========================\n\n")
cat(paste("Dataset:", cellchat@meta$dataset[1]), "\n")
cat(paste("Number of cells:", length(cellchat@idents)), "\n")
cat(paste("Number of cell types:", length(unique(cellchat@idents))), "\n")
cat(paste("Signaling pathways identified:", length(cellchat@netP$pathways)), "\n")
cat(paste("Total interactions:", sum(cellchat@net$count)), "\n")
```

## Best Practices Summary

1. **Data Quality**: Ensure proper normalization and cell type annotation
2. **Database Selection**: Choose appropriate species and interaction types
3. **Parameter Tuning**: Adjust thresholds based on data characteristics
4. **Validation**: Cross-reference with known biology
5. **Visualization**: Use multiple plot types for comprehensive interpretation
6. **Comparative Analysis**: Include controls when possible
7. **Documentation**: Save parameters and intermediate results

## Performance Optimization

### For Large Datasets (>50,000 cells)

```r
# Use fast algorithms
cellchat <- identifyOverExpressedGenes(cellchat, do.fast = TRUE)

# Reduce memory usage
cellchat <- computeCommunProb(
  cellchat,
  raw.use = TRUE,
  population.size = TRUE  # More memory efficient
)

# Process in chunks if needed
# Split by cell type and analyze subsets
```

### Parallel Processing

```r
# Enable parallel processing
library(future)
plan("multisession", workers = 4)

# Run with parallelism
cellchat <- computeCommunProb(cellchat, nrun = 100)
```

## References

- Jin et al., Nature Communications 2021
- Jin et al., Nature Protocols 2024
- CellChat GitHub: https://github.com/jinworks/CellChat
