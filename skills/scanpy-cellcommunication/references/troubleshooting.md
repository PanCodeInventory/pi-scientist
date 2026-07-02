# CellChat Troubleshooting Guide

Common issues and solutions when using CellChat.

## Installation Issues

### Issue 1: NMF Installation Fails

**Symptoms:**
```
ERROR: compilation failed for package 'NMF'
```

**Solutions:**

1. **Install from GitHub:**
```r
Sys.setenv(R_REMOTES_NO_ERRORS_FROM_WARNINGS = "true")
devtools::install_github("renozao/NMF")
```

2. **Install dependencies first:**
```r
install.packages(c("Rcpp", "RcppArmadillo", "rngtools", "gridBase", "registry"))
install.packages("NMF")
```

3. **Use conda environment with system dependencies:**
```bash
mamba install -n cellchat -c conda-forge r-nmf
```

### Issue 2: circlize/ComplexHeatmap Installation Fails

**Symptoms:**
```
ERROR: dependencies 'GlobalOptions', 'GetoptLong' are not available
```

**Solutions:**

1. **Install from GitHub:**
```r
devtools::install_github("jokergoo/GlobalOptions")
devtools::install_github("jokergoo/GetoptLong")
devtools::install_github("jokergoo/circlize")
devtools::install_github("jokergoo/ComplexHeatmap")
```

2. **Install via Bioconductor:**
```r
BiocManager::install("ComplexHeatmap")
```

### Issue 3: CellChat Installation Fails on macOS

**Symptoms:**
Compilation errors, X11-related errors

**Solutions:**

1. **Install XQuartz:**
```bash
brew install --cask xquartz
```

2. **Restart R after XQuartz installation**

3. **Set compiler flags:**
```r
Sys.setenv(R_REMOTES_NO_ERRORS_FROM_WARNINGS = "true")
Sys.setenv(PKG_CXXFLAGS = "-Wno-deprecated-declarations")
```

### Issue 4: RCurl Installation Fails

**Symptoms:**
```
ld: cannot find -lcurl
```

**Solutions:**

1. **Install system curl:**
```bash
# Ubuntu/Debian
sudo apt-get install libcurl4-openssl-dev

# CentOS/RHEL
sudo yum install libcurl-devel

# macOS
brew install curl
```

2. **Install via conda:**
```bash
mamba install -n cellchat -c conda-forge r-rcurl
```

## Runtime Issues

### Issue 5: Out of Memory Error

**Symptoms:**
```
Error: cannot allocate vector of size X GB
```

**Solutions:**

1. **Use population.size parameter:**
```r
cellchat <- computeCommunProb(cellchat, population.size = TRUE)
```

2. **Process in chunks:**
```r
# Split cell types into groups
cell_types <- unique(cellchat@idents)
groups <- split(cell_types, ceiling(seq_along(cell_types)/3))

# Analyze each group separately
for (group in groups) {
  subset_chat <- subsetCellChat(cellchat, idents.use = group)
  subset_chat <- computeCommunProb(subset_chat)
  # Save results
}
```

3. **Increase R memory limit:**
```r
# On Unix systems
unix::rlimit_as(1e12)  # Set to 1TB (if available)
```

4. **Use sparse matrices:**
```r
cellchat <- computeCommunProb(cellchat, raw.use = TRUE, type = "triMean")
```

### Issue 6: computeCommunProb Takes Too Long

**Symptoms:**
Analysis running for hours without completion

**Solutions:**

1. **Enable parallel processing:**
```r
library(future)
plan("multisession", workers = 4)
cellchat <- computeCommunProb(cellchat)
```

2. **Reduce permutation tests:**
```r
cellchat <- computeCommunProb(cellchat, nrun = 100)  # Default is 100
```

3. **Use fast algorithm:**
```r
cellchat <- identifyOverExpressedGenes(cellchat, do.fast = TRUE)
```

4. **Subset data:**
```r
# Analyze only major cell types
major_types <- c("T_cell", "B_cell", "Macrophage")
cellchat <- subsetCellChat(cellchat, idents.use = major_types)
```

### Issue 7: No Interactions Detected

**Symptoms:**
```
Warning: No significant interactions found
```

**Solutions:**

1. **Check cell type annotations:**
```r
table(cellchat@idents)
# Ensure sufficient cells per type (>10)
```

2. **Lower filtering thresholds:**
```r
cellchat <- filterCommunication(cellchat, min.cells = 5)
```

3. **Check gene expression:**
```r
# Verify known markers are expressed
markers <- c("WNT1", "WNT2", "FZD1", "FZD2")
expr <- GetAssayData(cellchat, slot = "data")
print(rowMeans(expr[markers, ]))
```

4. **Adjust overexpression thresholds:**
```r
cellchat <- identifyOverExpressedGenes(
  cellchat,
  min.pct = 0.05,  # Lower from default 0.1
  min.diff.pct = 0.05  # Lower from default 0.1
)
```

## Visualization Issues

### Issue 8: netVisual_circle Returns Empty Plot

**Symptoms:**
Plot appears but no network shown

**Solutions:**

1. **Check if network exists:**
```r
print(cellchat@net$count)
# Should show non-zero values
```

2. **Ensure aggregateNet was run:**
```r
cellchat <- aggregateNet(cellchat)
```

3. **Try different layout:**
```r
netVisual_heatmap(cellchat, signaling = "WNT")
```

### Issue 9: Colors Not Applied Correctly

**Symptoms:**
Plot uses default colors instead of custom palette

**Solutions:**

1. **Check color vector:**
```r
color.use <- c("T_cell" = "#E41A1C", "B_cell" = "#377EB8")
# Ensure all cell types have colors
color.use <- color.use[unique(cellchat@idents)]
```

2. **Use named colors:**
```r
netVisual_circle(cellchat@net$count, 
                 color.use = scales::hue_pal()(length(unique(cellchat@idents))))
```

### Issue 10: Text Labels Overlapping

**Symptoms:**
Cell type names overlap in visualizations

**Solutions:**

1. **Rotate labels:**
```r
netVisual_bubble(cellchat, angle.x = 45)
```

2. **Reduce label size:**
```r
netVisual_circle(cellchat@net$count, label.cex = 0.7)
```

3. **Use abbreviations:**
```r
# Rename cell types to shorter names
cellchat@meta$labels <- abbreviate(cellchat@meta$cell_type, minlength = 4)
```

## Data Issues

### Issue 11: createCellChat Error - "No cells found"

**Symptoms:**
```
Error in createCellChat: no cells found
```

**Solutions:**

1. **Check data dimensions:**
```r
dim(expression_matrix)  # Should be genes x cells
```

2. **Verify metadata:**
```r
head(meta)
# Ensure rownames(meta) == colnames(expression_matrix)
all(rownames(meta) == colnames(expression_matrix))
```

3. **Check for NA values:**
```r
sum(is.na(expression_matrix))
sum(is.na(meta$cell_type))
```

### Issue 12: Seurat Object Compatibility Issues

**Symptoms:**
Errors when using Seurat v4 or v5 objects

**Solutions:**

1. **Check Seurat version:**
```r
packageVersion("Seurat")
```

2. **Extract data properly:**
```r
# For Seurat v4/v5
if ("RNA" %in% names(seurat_obj@assays)) {
  data.input <- GetAssayData(seurat_obj, slot = "data")
} else {
  # For newer versions
  data.input <- seurat_obj[["RNA"]]$data
}
```

3. **Update CellChat:**
```r
devtools::install_github("jinworks/CellChat")
```

## Database Issues

### Issue 13: CellChatDB Not Loading

**Symptoms:**
```
Error: object 'CellChatDB.human' not found
```

**Solutions:**

1. **Load CellChat first:**
```r
library(CellChat)
cellchat@DB <- CellChatDB.human
```

2. **Check database:**
```r
data(CellChatDB.human)
ls(pattern = "CellChatDB")
```

### Issue 14: Custom Database Not Working

**Symptoms:**
Custom interactions not included in results

**Solutions:**

1. **Verify database structure:**
```r
str(cellchat@DB$interaction)
# Should have columns: interaction_name, pathway_name, ligand, receptor
```

2. **Check gene names match:**
```r
# Ensure custom genes are in expression data
custom_genes <- c("CustomLigand", "CustomReceptor")
all(custom_genes %in% rownames(cellchat@data))
```

## Comparative Analysis Issues

### Issue 15: mergeCellChat Error

**Symptoms:**
```
Error: cellchat objects have different databases
```

**Solutions:**

1. **Ensure consistent databases:**
```r
# Set same database for all objects
cellchat1@DB <- CellChatDB.human
cellchat2@DB <- CellChatDB.human
```

2. **Check cell type names:**
```r
# Ensure consistent naming
unique(cellchat1@idents)
unique(cellchat2@idents)
```

### Issue 16: Comparative Visualization Fails

**Symptoms:**
Errors when comparing multiple datasets

**Solutions:**

1. **Check merged object:**
```r
length(cellchat.merged@meta)
# Should show multiple datasets
```

2. **Specify comparison correctly:**
```r
netVisual_diffInteraction(cellchat.merged, comparison = c(1, 2))
```

## Platform-Specific Issues

### Issue 17: Windows Path Issues

**Symptoms:**
File path errors on Windows

**Solutions:**

1. **Use forward slashes:**
```r
output_dir <- "C:/Users/username/cellchat_output"
# Not: "C:\\Users\\username\\cellchat_output"
```

2. **Use file.path:**
```r
file.path("C:", "Users", "username", "cellchat_output")
```

### Issue 18: Linux Permission Errors

**Symptoms:**
```
Permission denied
```

**Solutions:**

1. **Check write permissions:**
```bash
ls -la /path/to/output/
```

2. **Change output directory:**
```r
output_dir <- path.expand("~/cellchat_output")
```

## Performance Optimization

### Tips for Large Datasets (>50,000 cells)

1. **Pre-filter cell types:**
```r
# Keep only major cell types (>1000 cells)
cell_counts <- table(seurat_obj$cell_type)
major_types <- names(cell_counts[cell_counts > 1000])
seurat_subset <- subset(seurat_obj, cell_type %in% major_types)
```

2. **Use sparse matrices:**
```r
cellchat <- computeCommunProb(cellchat, raw.use = TRUE)
```

3. **Sample cells if needed:**
```r
# Randomly sample 10,000 cells
set.seed(42)
cells_keep <- sample(colnames(seurat_obj), 10000)
seurat_subset <- subset(seurat_obj, cells = cells_keep)
```

4. **Process in parallel:**
```r
library(future)
plan("multisession", workers = 8)
options(future.globals.maxSize = 10 * 1024^3)  # 10GB
```

## Getting Help

### Resources

1. **GitHub Issues:** https://github.com/jinworks/CellChat/issues
2. **Documentation:** https://github.com/jinworks/CellChat/tree/master/tutorial
3. **Nature Protocols:** https://www.nature.com/articles/s41596-024-01045-4

### Reporting Bugs

When reporting issues, include:
- R version: `R.version.string`
- CellChat version: `packageVersion("CellChat")`
- Error message (full traceback)
- Minimal reproducible example
- Session info: `sessionInfo()`

### Debug Mode

Enable verbose output for debugging:
```r
options(CellChat.verbose = TRUE)
cellchat <- computeCommunProb(cellchat)
```
