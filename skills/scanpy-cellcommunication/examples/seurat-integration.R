#!/usr/bin/env Rscript

# =====================================================
# CellChat Seurat Integration Example
# Complete workflow integrating CellChat with Seurat analysis
# =====================================================

# Load required libraries
suppressPackageStartupMessages({
  library(CellChat)
  library(Seurat)
  library(dplyr)
  library(ggplot2)
})

# Set random seed
set.seed(42)

cat("========================================\n")
cat("CellChat Seurat Integration Example\n")
cat("========================================\n\n")

# =====================================================
# IMPORTANT: Replace with your actual Seurat object
# =====================================================

# Example loading (modify path as needed):
# seurat_obj <- readRDS("path/to/your/seurat_object.rds")

# For demonstration, create a mock Seurat object
cat("Creating example Seurat object...\n")
cat("In real usage, load your actual Seurat object instead.\n\n")

# Create example data
data.matrix <- matrix(
  rpois(2000 * 300, lambda = 2),
  nrow = 2000,
  ncol = 300
)
rownames(data.matrix) <- paste0("Gene", 1:2000)
colnames(data.matrix) <- paste0("Cell", 1:300)

# Create Seurat object
seurat_obj <- CreateSeuratObject(counts = data.matrix, project = "Example")

# Add cell type annotations
seurat_obj$cell_type <- sample(
  c("T_cell_CD4", "T_cell_CD8", "B_cell", "Macrophage", "DC", "NK_cell"),
  ncol(seurat_obj),
  replace = TRUE
)

# Add sample information
seurat_obj$sample <- sample(c("Sample1", "Sample2"), ncol(seurat_obj), replace = TRUE)

# Normalize data
seurat_obj <- NormalizeData(seurat_obj)
seurat_obj <- FindVariableFeatures(seurat_obj)
seurat_obj <- ScaleData(seurat_obj)
seurat_obj <- RunPCA(seurat_obj, features = VariableFeatures(object = seurat_obj))
seurat_obj <- FindNeighbors(seurat_obj, dims = 1:10)
seurat_obj <- FindClusters(seurat_obj, resolution = 0.5)
seurat_obj <- RunUMAP(seurat_obj, dims = 1:10)

cat("Example Seurat object created:\n")
cat(sprintf("  - Cells: %d\n", ncol(seurat_obj)))
cat(sprintf("  - Genes: %d\n", nrow(seurat_obj)))
cat(sprintf("  - Cell types: %d\n", length(unique(seurat_obj$cell_type))))
cat(sprintf("  - Samples: %d\n\n", length(unique(seurat_obj$sample))))

# =====================================================
# Step 1: Check Seurat Object
# =====================================================

cat("Step 1: Verifying Seurat object...\n")

# Check required metadata
if (!"cell_type" %in% colnames(seurat_obj@meta.data)) {
  stop("Error: 'cell_type' column not found in metadata!")
}

cat("Available metadata columns:\n")
print(colnames(seurat_obj@meta.data))

cat("\nCell type distribution:\n")
print(table(seurat_obj$cell_type))

# Check data slot
if ("RNA" %in% names(seurat_obj@assays)) {
  cat("\nRNA assay found\n")
  if ("data" %in% slotNames(seurat_obj@assays$RNA)) {
    cat("Normalized data slot found\n")
  }
}

# =====================================================
# Step 2: Extract Data for CellChat
# =====================================================

cat("\nStep 2: Extracting data from Seurat object...\n")

# Extract normalized expression data
data.input <- GetAssayData(seurat_obj, slot = "data")
cat(sprintf("Expression matrix: %d genes x %d cells\n", 
            nrow(data.input), ncol(data.input)))

# Extract metadata
meta <- seurat_obj@meta.data
cat(sprintf("Metadata: %d cells x %d columns\n", nrow(meta), ncol(meta)))

# =====================================================
# Step 3: Create CellChat Object
# =====================================================

cat("\nStep 3: Creating CellChat object...\n")

cellchat <- createCellChat(
  object = data.input,
  meta = meta,
  group.by = "cell_type"  # Column containing cell type labels
)

cat(sprintf("CellChat object created:\n"))
cat(sprintf("  - Cells: %d\n", length(cellchat@idents)))
cat(sprintf("  - Cell types: %s\n", 
            paste(unique(cellchat@idents), collapse = ", ")))

# =====================================================
# Step 4: Configure Database
# =====================================================

cat("\nStep 4: Configuring CellChatDB...\n")

# Set database
cellchat@DB <- CellChatDB.human

cat(sprintf("Database configured:\n"))
cat(sprintf("  - Interactions: %d\n", nrow(cellchat@DB$interaction)))
cat(sprintf("  - Categories: %s\n", 
            paste(unique(cellchat@DB$interaction$annotation), collapse = ", ")))

# =====================================================
# Step 5: Preprocessing
# =====================================================

cat("\nStep 5: Preprocessing data...\n")

cellchat <- subsetData(cellchat)
cellchat <- identifyOverExpressedGenes(
  cellchat,
  features = c("ligand", "receptor"),
  min.pct = 0.1,
  min.diff.pct = 0.1
)
cellchat <- identifyOverExpressedInteractions(cellchat)

cat("Preprocessing complete!\n")

# =====================================================
# Step 6: Inference
# =====================================================

cat("\nStep 6: Inferring communication network...\n")
cat("This may take a few minutes...\n")

cellchat <- computeCommunProb(cellchat, raw.use = TRUE)
cellchat <- filterCommunication(cellchat, min.cells = 10)

cat("Communication network inference complete!\n")

# =====================================================
# Step 7: Visualization Setup
# =====================================================

cat("\nStep 7: Setting up visualizations...\n")

# Create output directory
output_dir <- "seurat_cellchat_output"
if (!dir.exists(output_dir)) {
  dir.create(output_dir, recursive = TRUE)
}

# Create aggregated network
cellchat <- aggregateNet(cellchat)
groupSize <- as.numeric(table(cellchat@idents))

cat(sprintf("Output directory: %s/\n", output_dir))

# =====================================================
# Step 8: Generate Visualizations
# =====================================================

cat("\nStep 8: Generating visualizations...\n")

# 8.1 Network circle plot
cat("  - Creating network circle plot...\n")
pdf(file.path(output_dir, "01_network_circle.pdf"), width = 10, height = 10)
netVisual_circle(
  cellchat@net$count,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Cell Communication Network"
)
dev.off()

# 8.2 Weighted network
cat("  - Creating weighted network plot...\n")
pdf(file.path(output_dir, "02_network_weighted.pdf"), width = 10, height = 10)
netVisual_circle(
  cellchat@net$weight,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Interaction Weights"
)
dev.off()

# 8.3 Bubble plot
cat("  - Creating bubble plot...\n")
pdf(file.path(output_dir, "03_bubble_plot.pdf"), width = 14, height = 12)
netVisual_bubble(cellchat, remove.isolate = TRUE)
dev.off()

# =====================================================
# Step 9: Pathway Analysis
# =====================================================

cat("\nStep 9: Analyzing signaling pathways...\n")

pathways <- cellchat@netP$pathways
cat(sprintf("Detected %d signaling pathways\n", length(pathways)))
cat("Top pathways:\n")
print(head(pathways, 5))

# Visualize top pathways
top_n <- min(5, length(pathways))
cat(sprintf("\nVisualizing top %d pathways...\n", top_n))

for (i in 1:top_n) {
  pathway <- pathways[i]
  cat(sprintf("  - Processing: %s\n", pathway))
  
  tryCatch({
    # Circle layout
    pdf(file.path(output_dir, 
                  sprintf("04_pathway_%s_circle.pdf", pathway)),
        width = 10, height = 10)
    netVisual_aggregate(
      cellchat,
      signaling = pathway,
      layout = "circle",
      title.name = paste(pathway, "Signaling")
    )
    dev.off()
    
    # Hierarchy layout
    pdf(file.path(output_dir,
                  sprintf("05_pathway_%s_hierarchy.pdf", pathway)),
        width = 12, height = 10)
    netVisual_aggregate(
      cellchat,
      signaling = pathway,
      layout = "hierarchy",
      title.name = paste(pathway, "Signaling (Hierarchy)")
    )
    dev.off()
  }, error = function(e) {
    cat(sprintf("    Warning: Could not visualize %s\n", pathway))
  })
}

# =====================================================
# Step 10: Network Analysis
# =====================================================

cat("\nStep 10: Computing network centrality...\n")

cellchat <- netAnalysis_computeCentrality(cellchat, slot.name = "netP")

# Signaling role scatter plot
pdf(file.path(output_dir, "06_signaling_roles.pdf"), width = 10, height = 8)
netAnalysis_signalingRole_scatter(cellchat)
dev.off()

# Signaling role heatmap
pdf(file.path(output_dir, "07_signaling_roles_heatmap.pdf"), width = 12, height = 8)
netAnalysis_signalingRole_heatmap(cellchat, pattern = "outgoing")
dev.off()

# =====================================================
# Step 11: Export Results
# =====================================================

cat("\nStep 11: Exporting results...\n")

# Save CellChat object
saveRDS(cellchat, file.path(output_dir, "cellchat_object.rds"))

# Export communication network
df.net <- subsetCommunication(cellchat)
write.csv(df.net, file.path(output_dir, "communication_network.csv"),
          row.names = FALSE)
cat(sprintf("  - Exported %d interactions\n", nrow(df.net)))

# Export pathway information
write.csv(
  data.frame(Pathway = pathways),
  file.path(output_dir, "signaling_pathways.csv"),
  row.names = FALSE
)

# Export LR pairs
lr_pairs <- extractEnrichedLR(cellchat, geneLR.return = TRUE)
write.csv(lr_pairs, file.path(output_dir, "ligand_receptor_pairs.csv"))

# =====================================================
# Step 12: Summary Statistics
# =====================================================

cat("\nStep 12: Generating summary...\n")

# Network statistics
count_matrix <- cellchat@net$count
weight_matrix <- cellchat@net$weight

total_interactions <- sum(count_matrix)
nonzero_pairs <- sum(count_matrix > 0)
avg_interactions <- mean(count_matrix[count_matrix > 0])

summary_text <- sprintf("
CellChat Analysis Summary
========================
Input Data:
  - Seurat cells: %d
  - Seurat genes: %d
  - Cell types: %d

CellChat Object:
  - Cells analyzed: %d
  - Signaling pathways: %d

Network Statistics:
  - Total interactions: %d
  - Cell type pairs with communication: %d
  - Average interactions per pair: %.2f
  - Total pathways detected: %d

Output Files:
  - Figures: 7+ PDF files
  - Data tables: 4 CSV files
  - R object: cellchat_object.rds
", ncol(seurat_obj), nrow(seurat_obj), 
   length(unique(seurat_obj$cell_type)),
   length(cellchat@idents), length(pathways),
   total_interactions, nonzero_pairs, avg_interactions,
   length(pathways))

cat(summary_text)

# Save summary to file
writeLines(summary_text, file.path(output_dir, "analysis_summary.txt"))

# =====================================================
# Complete
# =====================================================

cat("\n========================================\n")
cat("Seurat-CellChat Integration Complete!\n")
cat("========================================\n")
cat(sprintf("All results saved to: %s/\n", output_dir))
cat("\nKey output files:\n")
cat("  - cellchat_object.rds (complete analysis object)\n")
cat("  - communication_network.csv (all interactions)\n")
cat("  - 01-07_*.pdf (visualizations)\n")
cat("\nNext steps:\n")
cat("  1. Review PDF figures in output directory\n")
cat("  2. Load cellchat_object.rds for further analysis\n")
cat("  3. Import CSV files into Python/R for custom analysis\n")
cat("========================================\n")
