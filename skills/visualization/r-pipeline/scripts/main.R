# BasicViz Pipeline - Main Runner
# Reads config.yaml, sets up Python once, loads the h5ad once, then calls the
# plot_*() function libraries. No Snakemake objects.
#
# Usage:
#   Rscript main.R                 # uses ./config.yaml
#   Rscript main.R my/config.yaml  # explicit config path
#
# Can be run from any directory; script paths resolve relative to this file.
suppressPackageStartupMessages({
    library(methods)
    library(yaml)
})

# --- Resolve this script's directory (robust to any working directory) ---
script_dir <- local({
    arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
    if (length(arg) >= 1) dirname(normalizePath(sub("^--file=", "", arg[1])))
    else "."
})
if (!file.exists(file.path(script_dir, "utils.R"))) {
    stop("Cannot locate utils.R next to main.R (expected in: ", script_dir, ")")
}

# --- Load function libraries ---
source(file.path(script_dir, "utils.R"))
source(file.path(script_dir, "generate_colors.R"))
source(file.path(script_dir, "plot_umap.R"))
source(file.path(script_dir, "plot_dotplot.R"))
source(file.path(script_dir, "plot_feature.R"))
source(file.path(script_dir, "plot_proportions.R"))
source(file.path(script_dir, "plot_river.R"))

# --- Dependency check: fail fast with actionable install commands ---
check_r_packages()

# --- Config ---
config_arg <- commandArgs(trailingOnly = TRUE)[1]
config_file <- if (!is.na(config_arg)) config_arg else "config.yaml"
if (!file.exists(config_file)) {
    stop("Config file not found: ", config_file,
         "\nRun from the directory containing config.yaml, or pass a path:",
         "\n  Rscript main.R path/to/config.yaml")
}
config <- read_yaml(config_file)

# Publication standard is 9pt (see shared/figure-standards.md); allow config override.
base_size <- if (!is.null(config$theme$font_size)) as.numeric(config$theme$font_size) else 9

dir.create(config$output_dir, showWarnings = FALSE, recursive = TRUE)

# --- Python + data: initialize ONCE, reuse across all plots ---
setup_python()
suppressPackageStartupMessages(library(anndata))
message("Loading h5ad: ", config$input_h5ad)
ad <- read_h5ad(config$input_h5ad)

# --- Step 1: Colors ---
message("--- Step 1: Generate Colors ---")
colors_file <- file.path(config$output_dir, "colors.yaml")
generate_colors(ad, config, colors_file)
color_map <- load_colors(colors_file)

# --- Step 2: Plots (function dispatch by type) ---
message("\n--- Step 2: Generate Plots ---")
plot_funcs <- list(
    umap       = plot_umap,
    dotplot    = plot_dotplot,
    feature    = plot_feature,
    proportion = plot_proportions,
    river      = plot_river
)

for (plot in config$plots) {
    if (is.null(plot_funcs[[plot$type]])) {
        warning("Unknown plot type: '", plot$type, "' (skipped). Supported: ",
                paste(names(plot_funcs), collapse = ", "))
        next
    }
    plot_out <- file.path(config$output_dir, paste0(plot$name, ".pdf"))
    message("\n>>> Plot: ", plot$name, " [", plot$type, "]")
    tryCatch(
        plot_funcs[[plot$type]](
            ad           = ad,
            color_map    = color_map,
            p_config     = plot,
            marker_config = config$dotplot$markers,
            output_file  = plot_out,
            base_size    = base_size
        ),
        error = function(e) {
            message("FAILED: ", plot$name, " - ", e$message)
            quit(status = 1)
        }
    )
}

message("\nAll Done! Results are in ", config$output_dir)
