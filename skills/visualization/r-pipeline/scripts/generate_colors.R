# BasicViz Pipeline - Color Generator
# Builds a consistent categorical color mapping (colors.yaml) covering every
# color_by / group_by / fill_by column referenced in config plots.
#
# Function library (no Snakemake): called by main.R as
#   generate_colors(ad, config, colors_file)
# Standalone use: source("utils.R") first, then this file.
if (!exists("theme_elegant", mode = "function")) {
    utils_candidates <- c("utils.R", file.path("r-pipeline", "scripts", "utils.R"))
    utils_path <- utils_candidates[file.exists(utils_candidates)][1]
    if (is.na(utils_path)) stop("Source utils.R before this file.")
    source(utils_path)
}

generate_colors <- function(ad, config, colors_file) {
    plots_list <- if (is.null(config$plots)) list() else config$plots

    # 1. Identify columns needing colors
    cat_cols <- c()
    for (p in plots_list) {
        if (!is.null(p$color_by)) cat_cols <- c(cat_cols, p$color_by)
        if (!is.null(p$group_by)) cat_cols <- c(cat_cols, p$group_by)
        if (!is.null(p$fill_by))  cat_cols <- c(cat_cols, p$fill_by)
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

            for (p in plots_list) {
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

    write_yaml(final_colors, colors_file)
    message("Colors saved to ", colors_file)
    invisible(colors_file)
}
