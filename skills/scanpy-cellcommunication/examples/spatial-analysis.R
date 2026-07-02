#!/usr/bin/env Rscript

# =====================================================
# Spatial Transcriptomics CellChat Analysis Example
# For 10x Visium, Slide-seq, or other spatial data
# =====================================================

# Load required libraries
suppressPackageStartupMessages({
  library(CellChat)
  library(Seurat)
  library(dplyr)
  library(ggplot2)
})

cat("========================================\n")
cat("CellChat Spatial Analysis Example\n")
cat("========================================\n\n")

cat("NOTE: This is a template for spatial analysis.\n")
cat("Replace with your actual spatial Seurat object.\n\n")

# =====================================================
# Step 1: Load Spatial Data
# =====================================================

cat("Step 1: Loading spatial data...\n")

# For 10x Visium data:
# LoadSpatialData <- function(data.dir, sample.name) {
#   data <- Load10X_Spatial(
#     data.dir = data.dir,
#     filename = "filtered_feature_bc_matrix.h5",
#     assay = "Spatial",
#     slice = sample.name
##   )
#   return(data)
# }

# Example: Create mock spatial data
cat("Creating example spatial data...\n")

# Create expression matrix
n_spots <- 500
n_genes <- 1000

expr_matrix <- matrix(
  rpois(n_genes * n_spots, lambda = 3),
  nrow = n_genes,
  ncol = n_spots
)
rownames(expr_matrix) <- c(
  paste0("SpatialGene", 1:500),
  "WNT1", "WNT2", "WNT3", "WNT5A",
  "BMP2", "BMP4", "BMP6",
  "VEGFA", "VEGFB",
  "FZD1", "FZD2", "BMPR1A", "FLT1",
  paste0("Gene", 1:(n_genes - 515))
)
colnames(expr_matrix) <- paste0("Spot", 1:n_spots)

# Add spatial coordinates
coords <- data.frame(
  row.names = colnames(expr_matrix),
  imagerow = rep(1:20, each = 25)[1:n_spots],
  imagecol = rep(1:25, 20)[1:n_spots]
)

# Create Seurat object with spatial info
spatial_obj <- CreateSeuratObject(counts = expr_matrix, assay = "Spatial")

# Add spatial coordinates
spatial_obj@images$slice1 <- CreateFOV(
  coords,
  assay = "Spatial"
)

# Add spatial domain annotations (e.g., from clustering)
spatial_obj$spatial_domain <- sample(
  c("Domain_A", "Domain_B", "Domain_C", "Domain_D"),
  n_spots,
  replace = TRUE
)

cat(sprintf("Spatial object created:\n"))
cat(sprintf("  - Spots: %d\n", ncol(spatial_obj)))
cat(sprintf("  - Genes: %d\n", nrow(spatial_obj)))
cat(sprintf("  - Spatial domains: %s\n",
            paste(unique(spatial_obj$spatial_domain), collapse = ", ")))

# =====================================================
# Step 2: Preprocess Spatial Data
# =====================================================

cat("\nStep 2: Preprocessing spatial data...\n")

# Normalize
spatial_obj <- NormalizeData(spatial_obj)

# Find variable features
spatial_obj <- FindVariableFeatures(spatial_obj)

# Scale data
spatial_obj <- ScaleData(spatial_obj)

cat("Preprocessing complete!\n")

# =====================================================
# Step 3: Create CellChat Object with Spatial Info
# =====================================================

cat("\nStep 3: Creating CellChat object...\n")

# Extract data
data.input <- GetAssayData(spatial_obj, slot = "data")
meta <- spatial_obj@meta.data

# Add spatial coordinates to metadata
meta$coord_x <- coords$imagerow
meta$coord_y <- coords$imagecol

# Create CellChat object using spatial domains as "cell types"
cellchat <- createCellChat(
  object = data.input,
  meta = meta,
  group.by = "spatial_domain"
)

cat(sprintf("CellChat object created:\n"))
cat(sprintf("  - Spots: %d\n", length(cellchat@idents)))
cat(sprintf("  - Spatial domains: %s\n",
            paste(unique(cellchat@idents), collapse = ", ")))

# =====================================================
# Step 4: Configure for Spatial Analysis
# =====================================================

cat("\nStep 4: Configuring for spatial analysis...\n")

# Set database
cellchat@DB <- CellChatDB.human

cat("Spatial-specific considerations:\n")
cat("  - Using spatial domains instead of cell types\n")
cat("  - Consider physical distance in interpretation\n")
cat("  - Look for neighborhood-specific signaling\n")

# =====================================================
# Step 5: Preprocessing
# =====================================================

cat("\nStep 5: Preprocessing...\n")

cellchat <- subsetData(cellchat)
cellchat <- identifyOverExpressedGenes(cellchat)
cellchat <- identifyOverExpressedInteractions(cellchat)

cat("Preprocessing complete!\n")

# =====================================================
# Step 6: Compute Communication Probabilities
# =====================================================

cat("\nStep 6: Computing communication probabilities...\n")

cellchat <- computeCommunProb(cellchat, raw.use = TRUE)
cellchat <- filterCommunication(cellchat, min.cells = 10)

cat("Communication network inference complete!\n")

# =====================================================
# Step 7: Visualization
# =====================================================

cat("\nStep 7: Generating visualizations...\n")

output_dir <- "spatial_cellchat_output"
if (!dir.exists(output_dir)) {
  dir.create(output_dir, recursive = TRUE)
}

# Create aggregated network
cellchat <- aggregateNet(cellchat)
groupSize <- as.numeric(table(cellchat@idents))

# Network circle plot
cat("  - Creating network visualization...\n")
pdf(file.path(output_dir, "01_spatial_network.pdf"), width = 10, height = 10)
netVisual_circle(
  cellchat@net$count,
  vertex.weight = groupSize,
  weight.scale = TRUE,
  title.name = "Spatial Domain Communication"
)
dev.off()

# Bubble plot
cat("  - Creating bubble plot...\n")
pdf(file.path(output_dir, "02_spatial_bubble.pdf"), width = 14, height = 12)
netVisual_bubble(cellchat, remove.isolate = TRUE)
dev.off()

# =====================================================
# Step 8: Pathway Analysis
# =====================================================

cat("\nStep 8: Analyzing signaling pathways...\n")

pathways <- cellchat@netP$pathways
cat(sprintf("Detected %d pathways\n", length(pathways)))

# Visualize top pathways
top_pathways <- pathways[1:min(3, length(pathways))]

for (pathway in top_pathways) {
  cat(sprintf("  - Processing: %s\n", pathway))
  tryCatch({
    pdf(file.path(output_dir, 
                  sprintf("03_pathway_%s.pdf", pathway)))
    netVisual_aggregate(
      cellchat,
      signaling = pathway,
      layout = "circle",
      title.name = paste(pathway, "in Spatial Domains")
    )
    dev.off()
  }, error = function(e) {
    cat(sprintf("    Warning: Could not visualize %s\n", pathway))
  })
}

# =====================================================
# Step 9: Spatial-Specific Analysis
# =====================================================

cat("\nStep 9: Performing spatial-specific analyses...\n")

# Analyze communication between neighboring domains
cat("  - Analyzing domain-to-domain communication...\n")

# Create adjacency matrix based on spatial coordinates
domain_comm <- cellchat@net$count
cat("Domain communication counts:\n")
print(domain_comm)

# Identify highly communicating domain pairs
high_comm <- which(domain_comm > median(domain_comm[domain_comm > 0]), 
                   arr.ind = TRUE)
cat(sprintf("\nHigh communication domain pairs: %d\n", nrow(high_comm)))

# =====================================================
# Step 10: Save Results
# =====================================================

cat("\nStep 10: Saving results...\n")

# Save object
saveRDS(cellchat, file.path(output_dir, "spatial_cellchat.rds"))

# Export network
df.net <- subsetCommunication(cellchat)
write.csv(df.net, file.path(output_dir, "spatial_communication.csv"))

# Export pathways
write.csv(data.frame(Pathway = pathways),
          file.path(output_dir, "spatial_pathways.csv"))

# =====================================================
# Summary
# =====================================================

cat("\n========================================\n")
cat("Spatial CellChat Analysis Complete!\n")
cat("========================================\n")
cat(sprintf("Output: %s/\n", output_dir))
cat("\nSpatial-specific notes:\n")
cat("  - Communication reflects domain-level interactions\n")
cat("  - Consider physical proximity in interpretation\n")
cat("  - Compare with tissue histology if available\n")
cat("  - Spatial gradients may indicate signaling sources\n")
cat("========================================\n")

cat("\nRecommended next steps:\n")
cat("  1. Overlay communication network on spatial coordinates\n")
cat("  2. Correlate with known tissue structures\n")
cat("  3. Identify signaling gradients across tissue\n")
cat("  4. Compare multiple spatial samples\n")
