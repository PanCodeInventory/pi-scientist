#!/usr/bin/env Rscript

# =====================================================
# CellChat Environment Setup Script
# Run this script to set up CellChat environment
# =====================================================

cat("========================================\n")
cat("CellChat Environment Setup\n")
cat("========================================\n\n")

# Check R version
cat("Checking R version...\n")
r_version <- R.version.string
cat(sprintf("R version: %s\n", r_version))

# Check if version is >= 4.0
if (as.numeric(R.version$major) < 4) {
  warning("R version 4.0+ recommended for CellChat")
}

# =====================================================
# Step 1: Set CRAN Mirror (China Mirror for faster download)
# =====================================================

cat("\nSetting CRAN mirror...\n")
options(repos = c(CRAN = "https://mirrors.tuna.tsinghua.edu.cn/CRAN/"))
cat("Using Tsinghua University CRAN mirror\n")

# =====================================================
# Step 2: Install BiocManager
# =====================================================

cat("\nInstalling BiocManager...\n")
if (!requireNamespace("BiocManager", quietly = TRUE)) {
  install.packages("BiocManager", ask = FALSE)
}
cat("BiocManager installed successfully\n")

# Set Bioconductor version
BiocManager::version()

# =====================================================
# Step 3: Set Environment Variable
# =====================================================

cat("\nSetting environment variables...\n")
Sys.setenv(R_REMOTES_NO_ERRORS_FROM_WARNINGS = "true")
cat("Set R_REMOTES_NO_ERRORS_FROM_WARNINGS = true\n")

# =====================================================
# Step 4: Install Critical Dependencies
# =====================================================

cat("\nInstalling critical dependencies...\n")

# Install devtools for GitHub packages
if (!requireNamespace("devtools", quietly = TRUE)) {
  cat("  - Installing devtools...\n")
  install.packages("devtools", ask = FALSE)
}

# Install NMF (may fail from CRAN, use GitHub as backup)
cat("  - Installing NMF...\n")
tryCatch({
  install.packages("NMF", ask = FALSE)
}, error = function(e) {
  cat("    NMF from CRAN failed, trying GitHub...\n")
  devtools::install_github("renozao/NMF", upgrade = "never")
})

# Install circlize and ComplexHeatmap from GitHub
cat("  - Installing circlize...\n")
tryCatch({
  devtools::install_github("jokergoo/circlize", upgrade = "never")
}, error = function(e) {
  cat("    Warning: circlize installation may have issues\n")
})

cat("  - Installing ComplexHeatmap...\n")
tryCatch({
  devtools::install_github("jokergoo/ComplexHeatmap", upgrade = "never")
}, error = function(e) {
  cat("    Warning: ComplexHeatmap installation may have issues\n")
})

# =====================================================
# Step 5: Install Bioconductor Packages
# =====================================================

cat("\nInstalling Bioconductor packages...\n")

bioc_packages <- c(
  "BiocGenerics",
  "BiocNeighbors",
  "SummarizedExperiment",
  "SingleCellExperiment"
)

cat(sprintf("  - Installing: %s\n", paste(bioc_packages, collapse = ", ")))
BiocManager::install(bioc_packages, ask = FALSE, update = FALSE)

# =====================================================
# Step 6: Install CRAN Dependencies
# =====================================================

cat("\nInstalling CRAN dependencies...\n")

cran_packages <- c(
  "dplyr",
  "igraph",
  "ggplot2",
  "future",
  "future.apply",
  "pbapply",
  "irlba",
  "ggalluvial",
  "stringr",
  "svglite",
  "Matrix",
  "ggrepel",
  "RColorBrewer",
  "cowplot",
  "RSpectra",
  "Rcpp",
  "reticulate",
  "scales",
  "sna",
  "reshape2",
  "FNN",
  "shape",
  "magrittr",
  "patchwork",
  "colorspace",
  "plyr",
  "ggpubr",
  "ggnetwork",
  "collapse"
)

cat(sprintf("  - Installing %d packages...\n", length(cran_packages)))

for (pkg in cran_packages) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    tryCatch({
      install.packages(pkg, ask = FALSE, quiet = TRUE)
      cat(sprintf("    ✓ %s\n", pkg))
    }, error = function(e) {
      cat(sprintf("    ✗ %s (failed)\n", pkg))
    })
  } else {
    cat(sprintf("    ✓ %s (already installed)\n", pkg))
  }
}

# =====================================================
# Step 7: Install CellChat
# =====================================================

cat("\nInstalling CellChat...\n")
cat("  - Downloading from GitHub (jinworks/CellChat)...\n")

tryCatch({
  devtools::install_github("jinworks/CellChat", upgrade = "never")
  cat("  ✓ CellChat installed successfully\n")
}, error = function(e) {
  cat("  ✗ CellChat installation failed\n")
  cat("  Error: ", conditionMessage(e), "\n")
  cat("\nTroubleshooting:\n")
  cat("  1. Check internet connection\n")
  cat("  2. Try: Sys.setenv(R_REMOTES_NO_ERRORS_FROM_WARNINGS = 'true')\n")
  cat("  3. Install missing dependencies manually\n")
})

# =====================================================
# Step 8: Verification
# =====================================================

cat("\n========================================\n")
cat("Verifying Installation\n")
cat("========================================\n\n")

cat("Checking installed packages...\n")

required_packages <- c("CellChat", "dplyr", "igraph", "ggplot2", "NMF")
all_installed <- TRUE

for (pkg in required_packages) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    ver <- packageVersion(pkg)
    cat(sprintf("  ✓ %s (v%s)\n", pkg, as.character(ver)))
  } else {
    cat(sprintf("  ✗ %s (NOT INSTALLED)\n", pkg))
    all_installed <- FALSE
  }
}

# Test CellChat loading
cat("\nTesting CellChat loading...\n")
tryCatch({
  library(CellChat)
  cat("  ✓ CellChat loaded successfully\n")
  cat(sprintf("  Version: %s\n", as.character(packageVersion("CellChat"))))
  
  # Test database loading
  cat("  Testing database access...\n")
  db <- CellChatDB.human
  cat(sprintf("  ✓ Database loaded (%d interactions)\n", nrow(db$interaction)))
  
}, error = function(e) {
  cat("  ✗ CellChat loading failed\n")
  cat("  Error: ", conditionMessage(e), "\n")
  all_installed <- FALSE
})

# =====================================================
# Summary
# =====================================================

cat("\n========================================\n")
if (all_installed) {
  cat("✓ Setup Complete!\n")
} else {
  cat("⚠ Setup Incomplete\n")
  cat("Some packages may need manual installation\n")
}
cat("========================================\n\n")

cat("Next steps:\n")
cat("  1. Restart R session\n")
cat("  2. Load CellChat: library(CellChat)\n")
cat("  3. Run examples from: examples/\n")
cat("  4. See tutorial: references/workflow-detailed.md\n")

cat("\nFor issues:\n")
cat("  - Check: references/troubleshooting.md\n")
cat("  - GitHub: https://github.com/jinworks/CellChat/issues\n")
cat("\n")
