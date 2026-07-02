library(ggplot2)
library(dplyr)
library(ggsci)
library(RColorBrewer)
library(scales)
library(yaml)
library(grid)
# NOTE: reticulate is NOT loaded globally to prevent early initialization

# --- 1. Python Environment Setup ---
setup_python <- function() {
    if (!requireNamespace("reticulate", quietly = TRUE)) {
        stop("Package 'reticulate' is required but not installed.")
    }
    library(reticulate)

    python_path <- Sys.getenv("RETICULATE_PYTHON")
    if (python_path == "") {
        python_path <- Sys.which("python3")
        if (python_path == "") python_path <- Sys.which("python")
    }
    
    if (python_path != "") {
        Sys.setenv(RETICULATE_PYTHON = python_path)
        
        # === CRITICAL FIX: The Chdir Dance ===
        initial_wd <- getwd()
        
        tryCatch({
            # 1. Move to safe harbor BEFORE ANY PYTHON INIT
            setwd("/")
            
            # 2. Initialize Python
            use_python(python_path, required = TRUE)
            
            # 3. Clean sys.path (Remove CWD from python path if it got added)
            py_run_string(sprintf("
import sys
import os
bad_path = '%s'
sys.path = [p for p in sys.path if p != '' and os.path.abspath(p) != os.path.abspath(bad_path)]
", initial_wd))
            
        }, error = function(e) {
            message("Warning: Python setup failed: ", e$message)
        }, finally = {
            # 4. Return to project directory
            setwd(initial_wd)
        })
    }
    options(warn = -1)
}

# --- 2. Elegant Theme (L-Shape) ---
theme_elegant <- function(base_size = 14, base_family = "sans") {
  theme_minimal(base_size = base_size, base_family = base_family) +
    theme(
      plot.title = element_text(face = "bold", size = rel(1.2), hjust = 0, margin = margin(b = 10)),
      plot.subtitle = element_text(size = rel(0.9), color = "grey30", margin = margin(b = 10)),
      plot.caption = element_text(size = rel(0.8), color = "grey50", hjust = 1),
      axis.title = element_text(face = "bold", size = rel(0.9)),
      axis.text = element_text(size = rel(0.8), color = "black"),
      axis.line = element_line(color = "black", linewidth = 0.8), 
      axis.ticks = element_line(color = "black", linewidth = 0.8),
      panel.grid.major = element_blank(), 
      panel.grid.minor = element_blank(),
      legend.position = "right",
      legend.title = element_text(face = "bold", size = rel(0.8)),
      legend.text = element_text(size = rel(0.8)),
      legend.key.size = unit(1, "lines"),
      legend.frame = element_blank(),
      plot.background = element_rect(fill = "white", color = NA),
      panel.background = element_rect(fill = "white", color = NA),
      panel.border = element_blank()
    )
}

# --- 3. Custom Muted Palette (Low Saturation, High Contrast) ---
elegant_pal_values <- c(
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", 
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
  "#882E72", "#1965B0", "#7BAFDE", "#4EB265", "#CAE0AB", 
  "#F7F056", "#EE8026", "#DC050C", "#72190E", "#4271BD",
  "#984EA3", "#FFFF33", "#A65628", "#F781BF"
)

get_palette_values <- function(palette_name = "elegant", n = 5) {
  pal <- NULL
  
  if (is.null(palette_name) || palette_name %in% c("default", "elegant", "muted")) {
     pal <- elegant_pal_values
  } else if (palette_name == "npg") {
     pal <- pal_npg("nrc")(10)
  } else if (palette_name == "jco") {
     pal <- pal_jco("default")(10)
  } else if (palette_name == "igv") {
     pal <- pal_igv("default")(51)
  }
  
  if (is.null(pal) && palette_name %in% rownames(brewer.pal.info)) {
    max_n <- brewer.pal.info[palette_name, "maxcolors"]
    pal <- brewer.pal(min(n, max_n), palette_name)
  }
  
  if (is.null(pal)) {
      if (n <= length(elegant_pal_values)) {
          pal <- elegant_pal_values
      } else {
          pal <- scales::hue_pal()(n)
      }
  }
  
  if (length(pal) < n) {
    pal <- colorRampPalette(pal)(n)
  }
  
  return(pal[1:n])
}

# --- 4. Color Management ---
load_colors <- function(colors_yaml_path) {
  if (file.exists(colors_yaml_path)) return(read_yaml(colors_yaml_path))
  return(list())
}

scale_color_custom <- function(col_name, color_map, data_vec = NULL, labels = NULL) {
  args <- list(na.value = "grey90")
  
  if (!is.null(color_map[[col_name]])) {
    mapping <- unlist(color_map[[col_name]])
    if (!is.null(data_vec)) {
      missing <- setdiff(unique(data_vec), names(mapping))
      if (length(missing) > 0) {
        warning(paste("Missing colors for:", paste(missing, collapse=", ")))
        used_colors <- as.character(mapping)
        available_colors <- setdiff(elegant_pal_values, used_colors)
        if (length(available_colors) < length(missing)) {
            available_colors <- c(available_colors, elegant_pal_values)
        }
        fallback <- setNames(available_colors[1:length(missing)], missing)
        mapping <- c(mapping, fallback)
      }
    }
    args$values <- mapping
  } else {
    return(scale_color_viridis_d())
  }

  if (!is.null(labels)) args$labels <- labels
  
  do.call(scale_color_manual, args)
}

scale_fill_custom <- function(col_name, color_map, data_vec = NULL) {
  if (!is.null(color_map[[col_name]])) {
    mapping <- unlist(color_map[[col_name]])
    return(scale_fill_manual(values = mapping, na.value = "grey90"))
  }
  return(scale_fill_viridis_d())
}
