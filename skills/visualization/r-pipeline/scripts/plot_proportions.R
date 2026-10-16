# BasicViz Pipeline - Proportion Plot Function
# Stacked composition charts: position "fill" = relative %, "stack" = absolute counts.
#
# Function library (no Snakemake). Call from main.R as
#   plot_proportions(ad, color_map, p_config, output_file)
if (!exists("theme_elegant", mode = "function")) {
    utils_candidates <- c("utils.R", file.path("r-pipeline", "scripts", "utils.R"))
    utils_path <- utils_candidates[file.exists(utils_candidates)][1]
    if (is.na(utils_path)) stop("Source utils.R before this file.")
    source(utils_path)
}

suppressPackageStartupMessages({
    library(ggplot2)
    library(dplyr)
    library(tidyr)
    library(scales)
})

plot_proportions <- function(ad, color_map = list(), p_config, output_file,
                             base_size = 9, ...) {
    meta <- as_tibble(ad$obs)

    # Params
    group_by <- p_config[["group_by"]]
    fill_by <- p_config[["fill_by"]]
    pos_type <- ifelse(is.null(p_config[["position"]]), "fill", p_config[["position"]])
    title <- p_config[["title"]]

    # Prepare Data
    plot_data <- meta %>%
      group_by(.data[[group_by]], .data[[fill_by]]) %>%
      tally() %>%
      group_by(.data[[group_by]]) %>%
      mutate(
          prop = n / sum(n),
          pct_label = paste0(round(prop * 100, 0), "%")
      ) %>%
      ungroup()

    plot_data$pct_label[plot_data$prop < 0.05] <- ""

    # Consistent Ordering
    categories <- sort(unique(as.character(plot_data[[fill_by]])))
    if (all(grepl("^[0-9]+$", categories))) {
        categories <- as.character(sort(as.numeric(categories)))
    }
    plot_data[[fill_by]] <- factor(plot_data[[fill_by]], levels = categories)

    # Plot
    y_col <- ifelse(pos_type == "fill", "prop", "n")
    y_lab <- ifelse(pos_type == "fill", "Proportion", "Count")

    format_label <- function(x) {
        if (x == "cluster_annot") return("Cluster")
        return(x)
    }

    p <- ggplot(plot_data, aes(x = .data[[group_by]], y = .data[[y_col]], fill = .data[[fill_by]])) +
      # Alpha = 0.9 makes the bars look less heavy and matches the UMAP style
      geom_bar(stat = "identity", position = pos_type, color = "white", width = 0.8, alpha = 0.9) +
      scale_y_continuous(expand = expansion(mult = c(0, 0.05)), labels = if(pos_type=="fill") percent else comma) +
      labs(
          title = title,
          x = format_label(group_by),
          y = y_lab,
          fill = format_label(fill_by)
      ) +
      theme_elegant(base_size = base_size) +
      scale_fill_custom(fill_by, color_map, plot_data[[fill_by]]) +
      theme(axis.text.x = element_text(angle = 45, hjust = 1))

    ggsave(output_file, plot = p, width = 6, height = 6, device = cairo_pdf)
    invisible(output_file)
}
