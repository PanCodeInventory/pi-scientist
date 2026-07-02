#!/usr/bin/env Rscript

# =====================================================
# CellChat Comparative Analysis Example
# Compare cell-cell communication between conditions
# (e.g., Healthy vs Disease, Treatment vs Control)
# =====================================================

# Load required libraries
suppressPackageStartupMessages({
  library(CellChat)
  library(dplyr)
  library(ggplot2)
  library(gridExtra)
})

cat("========================================\n")
cat("CellChat Comparative Analysis Example\n")
cat("========================================\n\n")

cat("This example demonstrates how to:\n")
cat("  1. Analyze multiple conditions separately\n")
cat("  2. Merge CellChat objects\n")
cat("  3. Compare communication networks\n")
cat("  4. Identify differential interactions\n\n")

# =====================================================
# Step 1: Create Example Data for Two Conditions
# =====================================================

cat("Step 1: Creating example data for two conditions...\n")

# Create mock data for Control condition
set.seed(42)
n_cells <- 300
n_genes <- 500

create_mock_data <- function(condition, seed) {
  set.seed(seed)
  
  # Expression matrix
  expr <- matrix(
    rpois(n_genes * n_cells, lambda = 2),
    nrow = n_genes,
    ncol = n_cells
  )
  
  # Add condition-specific signals
  if (condition == "Treatment") {
    # Treatment has higher WNT signaling
    expr[1:5, ] <- expr[1:5, ] + rpois(5 * n_cells, lambda = 3)
  } else {
    # Control has higher BMP signaling
    expr[10:15, ] <- expr[10:15, ] + rpois(6 * n_cells, lambda = 3)
  }
  
  rownames(expr) <- c(
    paste0("WNT", 1:10),
    paste0("BMP", 1:10),
    paste0("VEGF", 1:10),
    paste0("Gene", 1:(n_genes - 30))
  )
  colnames(expr) <- paste0(condition, "_Cell", 1:n_cells)
  
  # Log normalize
  expr <- log1p(expr)
  
  # Cell types
  cell_types <- sample(
    c("T_cell", "B_cell", "Macrophage", "DC"),
    n_cells,
    replace = TRUE
  )
  
  # Metadata
  meta <- data.frame(
    cell_type = cell_types,
    condition = condition,
    row.names = colnames(expr)
  )
  
  list(expression = expr, metadata = meta)
}

# Create data for both conditions
control_data <- create_mock_data("Control", 42)
treatment_data <- create_mock_data("Treatment", 43)

cat(sprintf("Control: %d cells\n", ncol(control_data$expression)))
cat(sprintf("Treatment: %d cells\n", ncol(treatment_data$expression)))

# =====================================================
# Step 2: Create CellChat Objects for Each Condition
# =====================================================

cat("\nStep 2: Creating CellChat objects...\n")

# Control
cat("  - Processing Control...\n")
cellchat.control <- createCellChat(
  object = control_data$expression,
  meta = control_data$metadata,
  group.by = "cell_type"
)
cellchat.control@DB <- CellChatDB.human
cellchat.control <- subsetData(cellchat.control)
cellchat.control <- identifyOverExpressedGenes(cellchat.control)
cellchat.control <- identifyOverExpressedInteractions(cellchat.control)
cellchat.control <- computeCommunProb(cellchat.control, raw.use = TRUE)
cellchat.control <- filterCommunication(cellchat.control, min.cells = 5)
cellchat.control <- aggregateNet(cellchat.control)

# Treatment
cat("  - Processing Treatment...\n")
cellchat.treat <- createCellChat(
  object = treatment_data$expression,
  meta = treatment_data$metadata,
  group.by = "cell_type"
)
cellchat.treat@DB <- CellChatDB.human
cellchat.treat <- subsetData(cellchat.treat)
cellchat.treat <- identifyOverExpressedGenes(cellchat.treat)
cellchat.treat <- identifyOverExpressedInteractions(cellchat.treat)
cellchat.treat <- computeCommunProb(cellchat.treat, raw.use = TRUE)
cellchat.treat <- filterCommunication(cellchat.treat, min.cells = 5)
cellchat.treat <- aggregateNet(cellchat.treat)

cat("Individual analysis complete!\n")

# =====================================================
# Step 3: Merge CellChat Objects
# =====================================================

cat("\nStep 3: Merging CellChat objects...\n")

# Create list
cellchat.list <- list(
  Control = cellchat.control,
  Treatment = cellchat.treat
)

# Merge
cellchat.merged <- mergeCellChat(
  cellchat.list,
  add.names = names(cellchat.list),
  cell.prefix = TRUE
)

cat(sprintf("Merged object contains %d datasets\n", length(cellchat.list)))

# =====================================================
# Step 4: Comparative Visualization
# =====================================================

cat("\nStep 4: Generating comparative visualizations...\n")

output_dir <- "comparative_analysis_output"
if (!dir.exists(output_dir)) {
  dir.create(output_dir, recursive = TRUE)
}

# 4.1 Individual network plots
cat("  - Creating individual network plots...\n")

pdf(file.path(output_dir, "01_networks_comparison.pdf"), width = 16, height = 8)
par(mfrow = c(1, 2))

# Control network
groupSize.ctrl <- as.numeric(table(cellchat.control@idents))
netVisual_circle(
  cellchat.control@net$count,
  vertex.weight = groupSize.ctrl,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Control - Communication Network"
)

# Treatment network
groupSize.treat <- as.numeric(table(cellchat.treat@idents))
netVisual_circle(
  cellchat.treat@net$count,
  vertex.weight = groupSize.treat,
  weight.scale = TRUE,
  label.edge = FALSE,
  title.name = "Treatment - Communication Network"
)

dev.off()

# 4.2 Differential network
cat("  - Creating differential network plot...\n")

tryCatch({
  pdf(file.path(output_dir, "02_differential_network.pdf"), width = 10, height = 10)
  netVisual_diffInteraction(
    cellchat.merged,
    weight.max = NULL,
    measure = "count",
    comparison = c(1, 2),
    title.name = "Differential Interactions (Treatment vs Control)"
  )
  dev.off()
}, error = function(e) {
  cat("    Warning: Could not create differential network\n")
})

# 4.3 Comparative bubble plot
cat("  - Creating comparative bubble plot...\n")

tryCatch({
  pdf(file.path(output_dir, "03_comparative_bubble.pdf"), width = 14, height = 12)
  netVisual_bubble(
    cellchat.merged,
    comparison = c(1, 2),
    angle.x = 45,
    remove.isolate = TRUE
  )
  dev.off()
}, error = function(e) {
  cat("    Warning: Could not create bubble plot\n")
})

# =====================================================
# Step 5: Pathway Comparison
# =====================================================

cat("\nStep 5: Comparing signaling pathways...\n")

# Get pathways from both conditions
pathways.ctrl <- cellchat.control@netP$pathways
pathways.treat <- cellchat.treat@netP$pathways

# Find common and unique pathways
common_pathways <- intersect(pathways.ctrl, pathways.treat)
unique_ctrl <- setdiff(pathways.ctrl, pathways.treat)
unique_treat <- setdiff(pathways.treat, pathways.ctrl)

cat(sprintf("Common pathways: %d\n", length(common_pathways)))
cat(sprintf("Unique to Control: %d\n", length(unique_ctrl)))
cat(sprintf("Unique to Treatment: %d\n", length(unique_treat)))

# Visualize common pathways
if (length(common_pathways) > 0) {
  cat("  - Visualizing common pathways...\n")
  
  for (pathway in common_pathways[1:min(3, length(common_pathways))]) {
    tryCatch({
      pdf(file.path(output_dir, 
                    sprintf("04_pathway_%s_comparison.pdf", pathway)),
          width = 16, height = 8)
      
      par(mfrow = c(1, 2))
      
      # Control
      netVisual_aggregate(
        cellchat.control,
        signaling = pathway,
        layout = "circle",
        title.name = paste(pathway, "- Control")
      )
      
      # Treatment
      netVisual_aggregate(
        cellchat.treat,
        signaling = pathway,
        layout = "circle",
        title.name = paste(pathway, "- Treatment")
      )
      
      dev.off()
    }, error = function(e) {
      cat(sprintf("    Warning: Could not compare %s\n", pathway))
    })
  }
}

# =====================================================
# Step 6: Rank Pathways
# =====================================================

cat("\nStep 6: Ranking pathway information flow...\n")

tryCatch({
  pdf(file.path(output_dir, "05_pathway_ranking.pdf"), width = 12, height = 8)
  
  rankNet(
    cellchat.merged,
    mode = "comparison",
    stacked = FALSE,
    do.stat = TRUE,
    comparison = c(1, 2)
  )
  
  dev.off()
  
  # Stacked version
  pdf(file.path(output_dir, "06_pathway_ranking_stacked.pdf"), 
      width = 12, height = 8)
  
  rankNet(
    cellchat.merged,
    mode = "comparison",
    stacked = TRUE,
    do.stat = TRUE
  )
  
  dev.off()
  
}, error = function(e) {
  cat("  Warning: Could not rank pathways\n")
})

# =====================================================
# Step 7: Export Results
# =====================================================

cat("\nStep 7: Exporting results...\n")

# Save merged object
saveRDS(cellchat.merged, file.path(output_dir, "cellchat_merged.rds"))

# Export individual networks
df.net.ctrl <- subsetCommunication(cellchat.control)
df.net.treat <- subsetCommunication(cellchat.treat)

write.csv(df.net.ctrl, 
          file.path(output_dir, "control_network.csv"), 
          row.names = FALSE)
write.csv(df.net.treat, 
          file.path(output_dir, "treatment_network.csv"), 
          row.names = FALSE)

# Pathway information
write.csv(
  data.frame(
    Pathway = common_pathways,
    In_Control = TRUE,
    In_Treatment = TRUE
  ),
  file.path(output_dir, "common_pathways.csv"),
  row.names = FALSE
)

# Summary statistics
summary_stats <- data.frame(
  Metric = c(
    "Control Total Interactions",
    "Treatment Total Interactions",
    "Common Pathways",
    "Unique Control Pathways",
    "Unique Treatment Pathways"
  ),
  Value = c(
    sum(cellchat.control@net$count),
    sum(cellchat.treat@net$count),
    length(common_pathways),
    length(unique_ctrl),
    length(unique_treat)
  )
)

write.csv(summary_stats, 
          file.path(output_dir, "comparison_summary.csv"),
          row.names = FALSE)

# =====================================================
# Summary
# =====================================================

cat("\n========================================\n")
cat("Comparative Analysis Complete!\n")
cat("========================================\n\n")

cat(sprintf("Output directory: %s/\n\n", output_dir))

cat("Generated files:\n")
cat("  - 01_networks_comparison.pdf (side-by-side networks)\n")
cat("  - 02_differential_network.pdf (differential interactions)\n")
cat("  - 03_comparative_bubble.pdf (bubble plot comparison)\n")
cat("  - 04_pathway_*.pdf (pathway comparisons)\n")
cat("  - 05_pathway_ranking.pdf (information flow ranking)\n")
cat("  - 06_pathway_ranking_stacked.pdf (stacked ranking)\n")
cat("  - cellchat_merged.rds (merged analysis object)\n")
cat("  - *_network.csv (communication networks)\n")
cat("  - comparison_summary.csv (statistics)\n\n")

cat("Key findings:\n")
cat(sprintf("  - Control interactions: %d\n", sum(cellchat.control@net$count)))
cat(sprintf("  - Treatment interactions: %d\n", sum(cellchat.treat@net$count)))
cat(sprintf("  - Common pathways: %d\n", length(common_pathways)))
cat(sprintf("  - Unique to Control: %d\n", length(unique_ctrl)))
cat(sprintf("  - Unique to Treatment: %d\n", length(unique_treat)))

cat("\nNext steps:\n")
cat("  1. Review differential network for condition-specific changes\n")
cat("  2. Examine bubble plots for altered LR pairs\n")
cat("  3. Compare pathway rankings between conditions\n")
cat("  4. Validate findings with biological knowledge\n")
cat("\n")
