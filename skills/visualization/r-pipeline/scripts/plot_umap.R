# BasicViz Pipeline - UMAP Plot Generator
# Generates dimensionality reduction plots with labels, faceting, and raster support
suppressPackageStartupMessages({
    source("utils.R")
})

setup_python()

suppressPackageStartupMessages({
    library(anndata)
    library(ggplot2)
    library(tibble)
    library(dplyr)
})

# Inputs
input_file <- snakemake@input[["h5ad"]]
colors_file <- snakemake@input[["colors"]]
output_file <- snakemake@output[["plot"]]
p_config <- snakemake@params[["plot_config"]]

# Load Data
ad <- read_h5ad(input_file)
color_map <- load_colors(colors_file)

if (is.null(ad$obsm[["X_umap"]])) stop("X_umap not found in .obsm")

# Prepare DF
umap_df <- as_tibble(ad$obsm[["X_umap"]])[, 1:2]
colnames(umap_df) <- c("UMAP_1", "UMAP_2")
umap_df <- bind_cols(umap_df, as_tibble(ad$obs))

# Config
color_by <- p_config[["color_by"]]
facet_by <- p_config[["facet_by"]]
pt_size <- ifelse(is.null(p_config[["point_size"]]), 0.3, as.numeric(p_config[["point_size"]]))
do_raster <- nrow(umap_df) > 5000 

# --- Labeling Logic ---
is_categorical <- !is.numeric(umap_df[[color_by]])
label_data <- NULL
custom_labels <- NULL

if (is_categorical) {
    categories <- sort(unique(as.character(umap_df[[color_by]])))
    if (all(grepl("^[0-9]+$", categories))) {
        categories <- as.character(sort(as.numeric(categories)))
    }
    umap_df[[color_by]] <- factor(umap_df[[color_by]], levels = categories)
    
    cluster_ids <- seq_along(categories)
    names(cluster_ids) <- categories
    
    custom_labels <- paste0(cluster_ids, ": ", names(cluster_ids))
    names(custom_labels) <- names(cluster_ids)
    
    # Calculate centroids per Facet if facet_by is present
    group_cols <- c(color_by)
    if (!is.null(facet_by)) {
        group_cols <- c(group_cols, facet_by)
    }
    
    label_data <- umap_df %>%
        group_by(across(all_of(group_cols))) %>%
        summarise(
            UMAP_1 = median(UMAP_1),
            UMAP_2 = median(UMAP_2),
            count = n(),
            .groups = "drop"
        ) %>%
        mutate(label = cluster_ids[as.character(.data[[color_by]])])
}

# --- Axis Positions ---
x_range <- max(umap_df$UMAP_1) - min(umap_df$UMAP_1)
y_range <- max(umap_df$UMAP_2) - min(umap_df$UMAP_2)
axis_len_x <- x_range / 5
axis_len_y <- y_range / 5
origin_x <- min(umap_df$UMAP_1) - x_range * 0.05
origin_y <- min(umap_df$UMAP_2) - y_range * 0.05

axis_data <- data.frame(
    x = c(origin_x, origin_x),
    y = c(origin_y, origin_y),
    xend = c(origin_x + axis_len_x, origin_x),
    yend = c(origin_y, origin_y + axis_len_y)
)

# Base Plot
p <- ggplot(umap_df, aes(x = UMAP_1, y = UMAP_2, color = .data[[color_by]]))

# Points
has_ggrastr <- requireNamespace("ggrastr", quietly = TRUE)
if (do_raster && has_ggrastr) {
    p <- p + ggrastr::rasterise(geom_point(size = pt_size, alpha = 0.8, stroke = 0), dpi = 300)
} else {
    p <- p + geom_point(size = pt_size, alpha = 0.8, stroke = 0)
}

# Aesthetics
legend_title <- NULL
if (is_categorical && grepl("cluster|annot|type|leiden", color_by, ignore.case = TRUE)) {
    legend_title <- "Cluster"
}

p <- p + 
  labs(title = NULL, x = NULL, y = NULL, color = legend_title) +
  theme_elegant() +
  theme(
      aspect.ratio = 1,
      legend.position = "right",
      axis.line = element_blank(),
      axis.text = element_blank(),
      axis.ticks = element_blank(),
      axis.title = element_blank(),
      panel.border = element_blank()
  )

# Add Custom Small Axes
p <- p + 
    geom_segment(data = axis_data, aes(x=x, y=y, xend=xend, yend=yend), 
                 arrow = arrow(length = unit(0.15, "cm"), type = "closed"), 
                 color = "black", linewidth = 0.8, inherit.aes = FALSE) +
    annotate("text", x = origin_x + axis_len_x/2, y = origin_y - y_range*0.03, 
             label = "UMAP 1", fontface="bold", size=3, hjust=0.5) +
    annotate("text", x = origin_x - x_range*0.03, y = origin_y + axis_len_y/2, 
             label = "UMAP 2", fontface="bold", size=3, angle=90, hjust=0.5)

# Faceting
if (!is.null(facet_by)) {
    p <- p + facet_wrap(vars(.data[[facet_by]])) +
         theme(
             strip.background = element_rect(fill = "grey95", color = NA),
             strip.text = element_text(face = "bold", size = 12),
             panel.spacing = unit(1, "lines")
         )
}

# Colors & Legend
if (!is_categorical) {
    p <- p + scale_color_viridis_c(option = "magma")
} else {
    current_labels <- waiver()
    if (grepl("cluster|annot|type|leiden", color_by, ignore.case = TRUE)) {
        current_labels <- custom_labels
    }
    
    p <- p + scale_color_custom(color_by, color_map, umap_df[[color_by]], labels = current_labels) +
             guides(color = guide_legend(override.aes = list(size = 4, alpha = 1), ncol = 1))
             
    # FIXED: Removed '&& is.null(facet_by)' so labels appear even when faceting
    if (!is.null(label_data) && grepl("cluster|annot|type|leiden", color_by, ignore.case = TRUE)) {
        p <- p + geom_label(
            data = label_data,
            aes(label = label),
            color = "black",
            fill = alpha("white", 0.7),
            fontface = "bold",
            size = 4,
            label.size = 0, 
            show.legend = FALSE
        )
    }
}

# Dynamic Width
plot_width <- 8
if (!is.null(facet_by)) {
    n_facets <- length(unique(umap_df[[facet_by]]))
    plot_width <- 5 * n_facets
}

ggsave(output_file, plot = p, width = plot_width, height = 6, device = cairo_pdf)
