# BasicViz Pipeline - DotPlot Generator
# Builds grouped expression dot plots with colored facet strips
suppressPackageStartupMessages({
    source("utils.R")
})

# CRITICAL: Setup python BEFORE loading anndata
setup_python()

suppressPackageStartupMessages({
    library(anndata)
    library(ggplot2)
    library(dplyr)
    library(tidyr)
    library(tibble)
    library(grid)
    library(gtable)
})

# Inputs
input_file <- snakemake@input[["h5ad"]]
colors_file <- snakemake@input[["colors"]]
output_file <- snakemake@output[["plot"]]
p_config <- snakemake@params[["plot_config"]]
marker_config <- snakemake@config[["dotplot"]][["markers"]]

# Load Data
ad <- read_h5ad(input_file)
color_map <- load_colors(colors_file)
group_by <- p_config[["group_by"]]

# 1. Prepare Gene List
all_config_genes <- unlist(marker_config)
valid_genes <- unique(all_config_genes[all_config_genes %in% rownames(ad$var)])
if (length(valid_genes) == 0) stop("No valid genes found.")

# 2. Extract Data
exp_mat <- as.matrix(ad[, valid_genes]$X)
meta_groups <- ad$obs[[group_by]]

df_list <- list()
unique_groups <- sort(unique(as.character(meta_groups)))

for (grp in unique_groups) {
    cells <- which(meta_groups == grp)
    if (length(cells) == 0) next
    sub_mat <- exp_mat[cells, , drop=FALSE]
    avg <- colMeans(sub_mat)
    pct <- colSums(sub_mat > 0) / length(cells) * 100
    df_list[[grp]] <- data.frame(group = grp, gene = colnames(sub_mat), avg_exp = avg, pct_exp = pct)
}

base_df <- do.call(rbind, df_list)
rownames(base_df) <- NULL

# Scale
base_df <- base_df %>%
    group_by(gene) %>%
    mutate(scaled_exp = scale(avg_exp)[,1]) %>%
    ungroup()
base_df$scaled_exp[base_df$scaled_exp > 2.5] <- 2.5
base_df$scaled_exp[base_df$scaled_exp < -2.5] <- -2.5

# 3. Construct Final Plot DF
final_df_list <- list()
group_levels <- names(marker_config)

for (grp_name in group_levels) {
    target_genes <- marker_config[[grp_name]]
    target_genes <- target_genes[target_genes %in% valid_genes]
    if (length(target_genes) > 0) {
        sub_df <- base_df %>% filter(gene %in% target_genes)
        sub_df$gene_group <- grp_name
        final_df_list[[grp_name]] <- sub_df
    }
}
plot_df <- bind_rows(final_df_list)

# 4. Order Factors
present_groups <- group_levels[group_levels %in% unique(plot_df$gene_group)]
plot_df$gene_group <- factor(plot_df$gene_group, levels = present_groups)

unique_clusters <- sort(unique(as.character(plot_df$group)))
common_groups <- intersect(present_groups, unique_clusters)
remaining_groups <- setdiff(unique_clusters, common_groups)
ordered_y <- c(common_groups, remaining_groups)
plot_df$group <- factor(plot_df$group, levels = rev(ordered_y))

plot_df$gene <- factor(plot_df$gene, levels = unique(all_config_genes))

# 5. Plot
p <- ggplot(plot_df, aes(x = gene, y = group)) +
    geom_point(aes(size = pct_exp, color = scaled_exp)) +
    scale_color_gradientn(colors = rev(brewer.pal(11, "RdBu")), name = "Z-Score") +
    scale_size_continuous(range = c(0, 6), name = "% Expressed") +
    labs(title = NULL, x = NULL, y = NULL) +
    
    facet_grid(. ~ gene_group, scales = "free_x", space = "free_x") +
    
    theme_elegant() +
    theme(
        axis.text.x = element_text(angle = 45, hjust = 1, color = "black", size = 9),
        axis.text.y = element_text(color = "black", face = "plain", size = 10),
        strip.text = element_text(face = "bold", size = 9, color = "white"),
        strip.background = element_rect(fill = "grey80", color = NA),
        panel.spacing = unit(0.1, "lines"),
        panel.border = element_rect(color = "grey80", fill = NA, linewidth = 0.5),
        axis.line = element_blank()
    )

# 6. Apply Colors to Strips (Deep Recursive Logic)
cluster_colors <- unlist(color_map[[group_by]])
if (is.null(cluster_colors)) {
    cluster_colors <- setNames(scales::hue_pal()(length(present_groups)), present_groups)
}

g <- ggplot_gtable(ggplot_build(p))
strip_idx <- grep("strip-t", g$layout$name)
strip_idx <- strip_idx[order(g$layout$l[strip_idx])]

# Enhanced recursive function
color_rects_recursively <- function(grob, color) {
    if (inherits(grob, "rect") || inherits(grob, "rectGrob")) {
        grob$gp$fill <- color
        return(grob)
    }
    if (!is.null(grob$children)) {
        for (i in seq_along(grob$children)) {
            grob$children[[i]] <- color_rects_recursively(grob$children[[i]], color)
        }
    }
    if (!is.null(grob$grobs)) {
        for (i in seq_along(grob$grobs)) {
            grob$grobs[[i]] <- color_rects_recursively(grob$grobs[[i]], color)
        }
    }
    return(grob)
}

message("\n--- Coloring Facet Strips ---")
for (i in seq_along(strip_idx)) {
    if (i > length(present_groups)) break
    idx <- strip_idx[i]
    group_name <- present_groups[i]
    col <- cluster_colors[group_name]
    
    if (!is.null(col) && !is.na(col)) {
        message(paste("Coloring", group_name, "->", col))
        g$grobs[[idx]] <- color_rects_recursively(g$grobs[[idx]], col)
    }
}

# 7. Save
n_genes_total <- nrow(unique(plot_df[, c("gene", "gene_group")]))
w <- n_genes_total * 0.3 + 2
h <- length(unique(plot_df$group)) * 0.3 + 2

cairo_pdf(output_file, width = w, height = h)
grid.draw(g)
dev.off()
