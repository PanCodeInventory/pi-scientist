# BasicViz Pipeline - Color Generator
# Builds consistent categorical color mappings for downstream plots
suppressPackageStartupMessages({
    source("utils.R")
})

# CRITICAL: Setup python BEFORE loading anndata to prevent numpy import errors
setup_python()

suppressPackageStartupMessages({
    library(anndata)
    library(yaml)
})

# Setup Snakemake I/O
input_file <- snakemake@input[["h5ad"]]
output_file <- snakemake@output[["colors"]]
config <- snakemake@config

message("Loading h5ad: ", input_file)
ad <- read_h5ad(input_file)

# 1. Identify columns needing colors
cat_cols <- c()
if (!is.null(config$plots)) {
    for (p in config$plots) {
        if (!is.null(p$color_by)) cat_cols <- c(cat_cols, p$color_by)
        if (!is.null(p$group_by)) cat_cols <- c(cat_cols, p$group_by)
        if (!is.null(p$fill_by)) cat_cols <- c(cat_cols, p$fill_by)
    }
}
cat_cols <- unique(cat_cols)

# 2. Load overrides from config
final_colors <- list()
if (!is.null(config$colors)) {
    final_colors <- config$colors
}

# 3. Generate missing colors
for (col in cat_cols) {
    if (!col %in% colnames(ad$obs)) next
    
    if (is.numeric(ad$obs[[col]]) && length(unique(ad$obs[[col]])) > 50) next
    
    vals <- sort(unique(as.character(ad$obs[[col]])))
    n_vals <- length(vals)
    
    if (is.null(final_colors[[col]])) final_colors[[col]] <- list()
    
    existing_vals <- names(final_colors[[col]])
    missing_vals <- setdiff(vals, existing_vals)
    
    if (length(missing_vals) > 0) {
        message("Generating colors for ", col, " (", length(missing_vals), " new values)")
        
        pal_name <- "npg"
        if (n_vals > 10) pal_name <- "igv"
        if (n_vals > 20) pal_name <- "ucscgb"
        
        for (p in config$plots) {
             if (identical(p$color_by, col) || identical(p$group_by, col)) {
                 if (!is.null(p$palette)) pal_name <- p$palette
                 break
             }
        }
        
        full_pal <- get_palette_values(pal_name, n_vals)
        names(full_pal) <- vals
        
        for (val in missing_vals) {
            final_colors[[col]][[val]] <- full_pal[[val]]
        }
    }
}

write_yaml(final_colors, output_file)
message("Colors saved to ", output_file)
