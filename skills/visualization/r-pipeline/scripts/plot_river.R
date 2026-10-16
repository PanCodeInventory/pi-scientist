# BasicViz Pipeline - River Plot Function
# Alluvial proportion plots to compare composition changes across groups.
#
# Function library (no Snakemake). Call from main.R as
#   plot_river(ad, color_map, p_config, output_file)
if (!exists("theme_elegant", mode = "function")) {
    utils_candidates <- c("utils.R", file.path("r-pipeline", "scripts", "utils.R"))
    utils_path <- utils_candidates[file.exists(utils_candidates)][1]
    if (is.na(utils_path)) stop("Source utils.R before this file.")
    source(utils_path)
}

suppressPackageStartupMessages({
    library(ggplot2)
    library(ggalluvial)
    library(dplyr)
    library(tidyr)
    library(scales)
})

plot_river <- function(ad, color_map = list(), p_config, output_file,
                       base_size = 9, ...) {
    meta <- as_tibble(ad$obs)

    # Params
    group_by <- p_config[["group_by"]]
    fill_by <- p_config[["fill_by"]]
    title <- p_config[["title"]]

    # Prepare Data (Calculate Proportions)
    plot_data <- meta %>%
      group_by(.data[[group_by]], .data[[fill_by]]) %>%
      tally() %>%
      group_by(.data[[group_by]]) %>%
      mutate(prop = n / sum(n)) %>%
      ungroup()

    # Consistent Ordering
    categories <- sort(unique(as.character(plot_data[[fill_by]])))
    if (all(grepl("^[0-9]+$", categories))) {
        categories <- as.character(sort(as.numeric(categories)))
    }
    plot_data[[fill_by]] <- factor(plot_data[[fill_by]], levels = categories)

    plot_data[[group_by]] <- factor(plot_data[[group_by]], levels = sort(unique(plot_data[[group_by]])))

    # Label Beautification
    format_label <- function(x) {
        if (x == "cluster_annot") return("Cluster")
        return(x)
    }

    # Plot
    p <- ggplot(plot_data,
           aes(x = .data[[group_by]], y = prop,
               stratum = .data[[fill_by]],
               alluvium = .data[[fill_by]],
               fill = .data[[fill_by]],
               label = .data[[fill_by]])) +

      # Flow
      geom_flow(stat = "alluvium", lode.guidance = "frontback",
                color = "white", alpha = 0.6, width = 0.4) +

      # Stratum
      geom_stratum(width = 0.4, alpha = 1, color = "white") +

      # Y-axis (Percent)
      scale_y_continuous(labels = percent, expand = c(0, 0)) +

      # Colors
      scale_fill_custom(fill_by, color_map, plot_data[[fill_by]]) +

      # Labels
      labs(title = title,
           x = format_label(group_by),
           y = "Proportion",
           fill = format_label(fill_by)) +

      # Theme
      theme_elegant(base_size = base_size) +
      theme(
          legend.position = "right",
          axis.line.x = element_blank(),
          panel.grid.major.y = element_line(color = "grey95")
      )

    # Save
    ggsave(output_file, plot = p, width = 8, height = 6, device = cairo_pdf)
    invisible(output_file)
}
