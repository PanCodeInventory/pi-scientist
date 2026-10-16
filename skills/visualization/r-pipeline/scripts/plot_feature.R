# BasicViz Pipeline - Feature Plot Function
# Multi-page UMAP feature plots for configured marker genes: one PDF page per
# cluster, each page an auto-arranged grid of single-gene expression panels.
#
# Function library (no Snakemake). Call from main.R as
#   plot_feature(ad, p_config, marker_config, output_file)
if (!exists("theme_elegant", mode = "function")) {
    utils_candidates <- c("utils.R", file.path("r-pipeline", "scripts", "utils.R"))
    utils_path <- utils_candidates[file.exists(utils_candidates)][1]
    if (is.na(utils_path)) stop("Source utils.R before this file.")
    source(utils_path)
}

suppressPackageStartupMessages({
    library(ggplot2)
    library(dplyr)
    library(tibble)
    library(cowplot) # For arranging plots
    library(grid)
})

plot_feature <- function(ad, color_map = list(), p_config, marker_config,
                         output_file, base_size = 9, ...) {
    if (is.null(ad$obsm[["X_umap"]])) stop("X_umap not found in .obsm")

    # Prepare UMAP Coords
    umap_df <- as_tibble(ad$obsm[["X_umap"]])[, 1:2]
    colnames(umap_df) <- c("UMAP_1", "UMAP_2")

    # Check Genes
    all_genes_in_config <- unique(unlist(marker_config))
    valid_genes <- all_genes_in_config[all_genes_in_config %in% rownames(ad$var)]

    if (length(valid_genes) == 0) stop("No valid genes found.")

    # Load Expression Matrix
    exp_mat <- as.matrix(ad[, valid_genes]$X)
    colnames(exp_mat) <- valid_genes

    master_df <- bind_cols(umap_df, as_tibble(exp_mat))

    # Open PDF Device
    cairo_pdf(output_file, width = 12, height = 10)

    # Iterate through Clusters
    for (cluster_name in names(marker_config)) {
        genes <- marker_config[[cluster_name]]
        genes <- genes[genes %in% valid_genes]

        if (length(genes) == 0) next

        message("Plotting page for: ", cluster_name)

        plot_list <- list()

        for (gene in genes) {
            # Subset data for this gene
            plot_data <- master_df %>%
                select(UMAP_1, UMAP_2, expr = .data[[gene]]) %>%
                arrange(expr)

            # Base Plot
            p <- ggplot(plot_data, aes(x = UMAP_1, y = UMAP_2, color = expr)) +
                geom_point(size = 0.2, stroke = 0) + # Small points for feature plot
                scale_color_viridis_c(option = "magma", name = "Exp") +
                labs(title = gene, x = NULL, y = NULL) +
                theme_elegant(base_size = base_size) +
                theme(
                    aspect.ratio = 1,
                    legend.position = "right",
                    axis.line = element_blank(),
                    axis.text = element_blank(),
                    axis.ticks = element_blank(),
                    panel.border = element_blank(),
                    plot.title = element_text(face = "bold.italic", size = 12, hjust = 0.5)
                )

            plot_list[[gene]] <- p
        }

        # Arrange Grid
        n_plots <- length(plot_list)
        ncol <- ceiling(sqrt(n_plots))
        nrow <- ceiling(n_plots / ncol)

        # Title for the page
        title_grob <- ggdraw() +
            draw_label(paste("Cluster:", cluster_name), fontface = 'bold', size = 16, x = 0.5, hjust = 0.5)

        # Combine
        final_grid <- plot_grid(plotlist = plot_list, ncol = ncol)
        page_plot <- plot_grid(title_grob, final_grid, ncol = 1, rel_heights = c(0.05, 1))

        print(page_plot)
    }

    dev.off()
    invisible(output_file)
}
