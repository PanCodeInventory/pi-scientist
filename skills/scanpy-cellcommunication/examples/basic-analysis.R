#!/usr/bin/env Rscript

# =====================================================
# CellChat Basic Analysis Example
# Minimal working example for cell-cell communication analysis
# =====================================================

# Load required libraries
suppressPackageStartupMessages({
  library(CellChat)
  library(dplyr)
  library(ggplot2)
})

# Set random seed for reproducibility
set.seed(42)

# =====================================================
# Step 1: Create Example Data (Replace with your actual data)
# =====================================================

cat("Creating example data...\n")

# Create a simple example expression matrix (genes x cells)
# In real usage, replace this with your actual expression data
set.seed(42)
n_genes <- 500
n_cells <- 200

# Create gene names (include some known ligands and receptors)
genes <- c(
  "WNT1", "WNT2", "WNT3", "WNT4", "WNT5A", "WNT6", "WNT7A", "WNT7B",
  "FZD1", "FZD2", "FZD3", "FZD4", "FZD5", "FZD6", "FZD7", "FZD8",
  "LRP5", "LRP6",
  "BMP2", "BMP4", "BMP6", "BMP7",
  "BMPR1A", "BMPR1B", "BMPR2",
  "VEGFA", "VEGFB", "VEGFC",
  "FLT1", "KDR", "FLT4",
  paste0("GENE_", 1:(n_genes - 31))
)

# Create cell names
cells <- paste0("Cell_", 1:n_cells)

# Create expression matrix with some structure
expr_matrix <- matrix(
  rpois(n_genes * n_cells, lambda = 2),
  nrow = n_genes,
  ncol = n_cells
)
rownames(expr_matrix) <- genes
colnames(expr_matrix) <- cells

# Add some cell type-specific expression patterns
# T cells - high WNT expression
# B cells - high BMP expression
# Macrophages - high VEGF expression

cell_types <- sample(c("T_cell", "B_cell", "Macrophage", "DC"), 
                     n_cells, 
                     replace = TRUE, 
                     prob = c(0.3, 0.3, 0.2, 0.2))

# Add cell type-specific signals
for (i in 1:n_cells) {
  if (cell_types[i] == "T_cell") {
    expr_matrix[1:10, i] <- expr_matrix[1:10, i] + rpois(10, lambda = 5)  # WNT genes
  } else if (cell_types[i] == "B_cell") {
    expr_matrix[19:23, i] <- expr_matrix[19:23, i] + rpois(5, lambda = 5)  # BMP genes
  } else if (cell_types[i] == "Macrophage") {
    expr_matrix[26:28, i] <- expr_matrix[26:28, i] + rpois(3, lambda = 5)  # VEGF genes
  }
}

# Log-normalize (simplified)
expr_matrix <- log1p(expr_matrix)

# Create metadata
meta <- data.frame(
  cell_type = cell_types,
  row.names = cells
)

cat(sprintf("Created dataset: %d genes x %d cells\n", n_genes, n_cells))
cat("Cell type distribution:\n")
print(table(cell_types))

# =====================================================
# Step 2: Create CellChat Object
# =====================================================

cat("\nCreating CellChat object...\n")

cellchat <- createCellChat(
  object = expr_matrix,
  meta = meta,
  group.by = "cell_type"
)

cat(sprintf("CellChat object created with %d cells\n", length(cellchat@idents)))

# =====================================================
# Step 3: Set Database
# =====================================================

cat("\nSetting up CellChatDB...\n")

# Use human database (even though this is example data)
cellchat@DB <- CellChatDB.human

cat(sprintf("Database loaded with %d interactions\n", 
            nrow(cellchat@DB$interaction)))

# =====================================================
# Step 4: Preprocessing
# =====================================================

cat("\nPreprocessing data...\n")

cellchat <- subsetData(cellchat)
cellchat <- identifyOverExpressedGenes(cellchat)
cellchat <- identifyOverExpressedInteractions(cellchat)

cat("Preprocessing complete!\n")

# =====================================================
# Step 5: Compute Communication Probabilities
# =====================================================

cat("\nComputing communication probabilities...\n")
cat("This may take a few minutes...\n")

cellchat <- computeCommunProb(cellchat, raw.use = TRUE)
cellchat <- filterCommunication(cellchat, min.cells = 5)

cat("Communication network inference complete!\n")

# =====================================================
# Step 6: Network Visualization
# =====================================================

cat("\nGenerating visualizations...\n")

# Create output directory
output_dir <- "cellchat_output"
if (!dir.exists(output_dir)) {
  dir.create(output_dir)
}

# Create aggregated network
cellchat <- aggregateNet(cellchat)
groupSize <- as.numeric(table(cellchat@idents))

# 6.1 Circle plot
cat("  - Creating circle plot...\n")
pdf(file.path(output_dir, "01_network_circle.pdf"), width = 8, height = 8)
netVisual_circle(
  cellchat@net$count,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Cell Communication Network"
)
dev.off()

# 6.2 Bubble plot
cat("  - Creating bubble plot...\n")
pdf(file.path(output_dir, "02_bubble_plot.pdf"), width = 12, height = 10)
netVisual_bubble(cellchat, remove.isolate = TRUE)
dev.off()

# =====================================================
# Step 7: Pathway Analysis
# =====================================================

cat("\nAnalyzing signaling pathways...\n")

# Get detected pathways
pathways <- cellchat@netP$pathways
cat(sprintf("Detected %d signaling pathways:\n", length(pathways)))
print(head(pathways, 10))

# Visualize top pathways
top_pathways <- pathways[1:min(3, length(pathways))]

for (i in seq_along(top_pathways)) {
  pathway <- top_pathways[i]
  cat(sprintf("  - Processing pathway: %s\n", pathway))
  
  tryCatch({
    pdf(file.path(output_dir, 
                  sprintf("03_pathway_%s.pdf", pathway)),
        width = 8, height = 8)
    netVisual_aggregate(
      cellchat,
      signaling = pathway,
      layout = "circle",
      title.name = paste(pathway, "Signaling")
    )
    dev.off()
  }, error = function(e) {
    cat(sprintf("    Warning: Could not visualize %s\n", pathway))
  })
}

# =====================================================
# Step 8: Save Results
# =====================================================

cat("\nSaving results...\n")

# Save CellChat object
saveRDS(cellchat, file.path(output_dir, "cellchat_object.rds"))

# Export communication network
df.net <- subsetCommunication(cellchat)
write.csv(df.net, file.path(output_dir, "communication_network.csv"),
          row.names = FALSE)

# Save pathway information
write.csv(
  data.frame(Pathway = pathways),
  file.path(output_dir, "signaling_pathways.csv"),
  row.names = FALSE
)

# =====================================================
# Summary
# =====================================================

cat("\n")
cat("========================================\n")
cat("CellChat Basic Analysis Complete!\n")
cat("========================================\n")
cat(sprintf("Output directory: %s/\n", output_dir))
cat(sprintf("Figures saved:\n"))
cat(sprintf("  - 01_network_circle.pdf\n"))
cat(sprintf("  - 02_bubble_plot.pdf\n"))
cat(sprintf("  - 03_pathway_*.pdf (%d pathways)\n", length(top_pathways)))
cat(sprintf("Data files:\n"))
cat(sprintf("  - cellchat_object.rds\n"))
cat(sprintf("  - communication_network.csv\n"))
cat(sprintf("  - signaling_pathways.csv\n"))
cat("========================================\n")

# Print network statistics
cat("\nNetwork Statistics:\n")
cat(sprintf("Total interactions: %d\n", sum(cellchat@net$count)))
cat(sprintf("Cell type pairs with communication: %d\n", 
            sum(cellchat@net$count > 0)))
cat(sprintf("Average interactions per pair: %.2f\n",
            mean(cellchat@net$count[cellchat@net$count > 0])))
