# BasicViz Pipeline - Main Runner
# Orchestrates color generation and plot scripts from a flattened scripts directory
suppressPackageStartupMessages({
    library(methods)
    library(yaml)
})

# Load Config
config <- read_yaml("config.yaml")

# Ensure output directory exists
dir.create(config$output_dir, showWarnings = FALSE, recursive = TRUE)

# Define Snakemake Class
setClass("Snakemake",
         slots = c(
           input = "list",
           output = "list",
           params = "list",
           wildcards = "list",
           config = "list",
           log = "list"
         )
)

# Helper to run script
run_script <- function(script_path, input, output, params=list(), log_file="run.log") {
  message(paste("\n>>> Running:", script_path))
  
  # Create log directory if needed
  log_path <- file.path(config$output_dir, "logs")
  dir.create(log_path, showWarnings = FALSE, recursive = TRUE)
  full_log_path <- file.path(log_path, paste0(basename(script_path), ".log"))
  
  # Create snakemake object in global env
  # We use assignment to global environment so the sourced script can see it
  assign("snakemake", new("Snakemake",
                    input = input,
                    output = output,
                    params = params,
                    config = config,
                    log = list(full_log_path)), envir = .GlobalEnv)
  
  tryCatch({
    source(script_path, local = FALSE)
  }, error = function(e) {
    message("Error running ", script_path, ": ", e$message)
    quit(status=1)
  })
}

# 1. Generate Colors
message("--- Step 1: Generate Colors ---")
colors_file <- file.path(config$output_dir, "colors.yaml")
run_script("generate_colors.R",
           input = list(h5ad = config$input_h5ad),
           output = list(colors = colors_file))

# 2. Loop through plots
message("\n--- Step 2: Generate Plots ---")
for (plot in config$plots) {
  plot_out <- file.path(config$output_dir, paste0(plot$name, ".pdf"))
  
  if (plot$type == "umap") {
    run_script("plot_umap.R",
               input = list(h5ad = config$input_h5ad, colors = colors_file),
               output = list(plot = plot_out),
               params = list(plot_config = plot))
               
  } else if (plot$type == "proportion") {
    run_script("plot_proportions.R",
               input = list(h5ad = config$input_h5ad, colors = colors_file),
               output = list(plot = plot_out),
               params = list(plot_config = plot))
               
  } else if (plot$type == "dotplot") {
    run_script("plot_dotplot.R",
               input = list(h5ad = config$input_h5ad, colors = colors_file),
               output = list(plot = plot_out),
               params = list(plot_config = plot))
               
  } else if (plot$type == "feature") {
    run_script("plot_feature.R",
               input = list(h5ad = config$input_h5ad, colors = colors_file),
               output = list(plot = plot_out),
               params = list(plot_config = plot))
               
  } else if (plot$type == "river") {
    run_script("plot_river.R",
               input = list(h5ad = config$input_h5ad, colors = colors_file),
               output = list(plot = plot_out),
               params = list(plot_config = plot))
  }
}

message("\nAll Done! Results are in ", config$output_dir)
