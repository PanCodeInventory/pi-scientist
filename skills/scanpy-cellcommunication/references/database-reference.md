# CellChatDB Reference Guide

Comprehensive guide to understanding and customizing the CellChat database.

## Database Overview

CellChatDB is a manually curated database of ligand-receptor interactions for cell-cell communication analysis.

### Database Versions

- **CellChatDB.human**: Human interactions (default)
- **CellChatDB.mouse**: Mouse interactions

## Database Structure

### Core Components

```r
# Load database
data(CellChatDB.human)

# Database components:
# - interaction: Main ligand-receptor pairs
# - complex: Multi-subunit complexes
# - cofactor: Co-factors (agonists/antagonists)
# - geneInfo: Gene annotations
```

### Interaction Table

```r
# View interaction structure
head(CellChatDB.human$interaction)

# Key columns:
# - interaction_name: "Ligand_Receptor" format
# - pathway_name: Signaling pathway category
# - ligand: Ligand gene symbol
# - receptor: Receptor gene symbol
# - evidence: Literature evidence
# - annotation: Interaction type
```

### Categories

CellChatDB contains three main categories:

1. **Secreted Signaling** (Paracrine/Autocrine)
   - Soluble ligands binding to membrane receptors
   - Examples: WNT, BMP, VEGF, TGFb

2. **Contact-dependent** (Juxtacrine)
   - Direct cell-cell contact required
   - Examples: NOTCH, CADM, CDH

3. **ECM-Receptor** (Extracellular Matrix)
   - Matrix protein interactions
   - Examples: Collagen, Laminin, Fibronectin

## Database Statistics

```r
# Overall statistics
db <- CellChatDB.human

# Total interactions
cat("Total interactions:", nrow(db$interaction), "\n")

# By category
cat("\nBy category:\n")
print(table(db$interaction$annotation))

# By pathway
cat("\nBy pathway:\n")
pathway_counts <- table(db$interaction$pathway_name)
print(sort(pathway_counts, decreasing = TRUE)[1:20])

# Number of unique ligands/receptors
cat("\nUnique ligands:", length(unique(db$interaction$ligand)), "\n")
cat("Unique receptors:", length(unique(db$interaction$receptor)), "\n")
```

## Customizing the Database

### Subsetting by Category

```r
# Use only secreted signaling
cellchat@DB <- subsetDB(CellChatDB, search = "Secreted Signaling")

# Use only contact-dependent
cellchat@DB <- subsetDB(CellChatDB, search = "Cell-Cell Contact")

# Use only ECM
cellchat@DB <- subsetDB(CellChatDB, search = "ECM-Receptor")
```

### Subsetting by Pathway

```r
# Include only specific pathways
included_pathways <- c("WNT", "BMP", "VEGF", "TGFb")
cellchat@DB$interaction <- cellchat@DB$interaction[
  cellchat@DB$interaction$pathway_name %in% included_pathways,
]

# Exclude specific pathways
excluded_pathways <- c("MHC-I", "MHC-II")
cellchat@DB$interaction <- cellchat@DB$interaction[
  !(cellchat@DB$interaction$pathway_name %in% excluded_pathways),
]
```

### Custom Interactions

Adding custom ligand-receptor pairs:

```r
# Create custom interaction
custom_interaction <- data.frame(
  interaction_name = "CustomLigand_CustomReceptor",
  pathway_name = "CUSTOM_PATHWAY",
  ligand = "CustomLigand",
  receptor = "CustomReceptor",
  agonist = "",
  antagonist = "",
  co_A_receptor = "",
  co_I_receptor = "",
  evidence = "Custom",
  annotation = "Secreted Signaling",
  row.names = NULL
)

# Add to database
cellchat@DB$interaction <- rbind(
  cellchat@DB$interaction,
  custom_interaction
)

# Verify addition
cat("Added interactions:", nrow(custom_interaction), "\n")
cat("Total interactions now:", nrow(cellchat@DB$interaction), "\n")
```

### Multi-subunit Complexes

Some interactions involve multi-protein complexes:

```r
# View complex definitions
head(CellChatDB.human$complex)

# Example: TGFb complex
# TGFb receptor consists of TGFBR1 + TGFBR2

# Complex structure:
# - complex_name: Complex identifier
# - components: Gene symbols separated by ":"
```

### Co-factors

Agonists and antagonists:

```r
# View cofactors
head(CellChatDB.human$cofactor)

# Types:
# - agonist: Enhances signaling
# - antagonist: Inhibits signaling
# - co_A_receptor: Co-activator receptor
# - co_I_receptor: Co-inhibitor receptor
```

## Pathway Categories

### Major Signaling Pathways

1. **Growth Factor Signaling**
   - EGF, FGF, HGF, IGF, PDGF, VEGF

2. **Morphogen Signaling**
   - WNT, BMP, TGFb, Hedgehog, Notch

3. **Immune Signaling**
   - Cytokines, Chemokines, Interleukins, Interferons

4. **ECM Signaling**
   - Collagen, Laminin, Fibronectin, Proteoglycans

5. **Neurotransmitter Signaling**
   - Glutamate, GABA, Acetylcholine, Dopamine

6. **Hormone Signaling**
   - Insulin, Leptin, Adiponectin

7. **Contact-dependent**
   - Cadherins, Selectins, Immunoglobulins

## Database Updates

### Check Database Version

```r
# Database version information
attr(CellChatDB.human, "version")
attr(CellChatDB.human, "date")
```

### Update Database

CellChatDB is updated with new CellChat versions:

```r
# Reinstall CellChat for latest database
devtools::install_github("jinworks/CellChat")

# Reload
data(CellChatDB.human)
```

### Custom Database Files

Create and use custom database files:

```r
# Save custom database
saveRDS(cellchat@DB, file = "my_custom_database.rds")

# Load custom database
custom_db <- readRDS("my_custom_database.rds")
cellchat@DB <- custom_db
```

## Gene Name Mapping

### Human to Mouse Conversion

```r
# Convert human gene names to mouse
cellchat <- updateCellChatDB(cellchat, type = "mouse")
```

### Handling Gene Aliases

```r
# Check if genes are in database
db_genes <- unique(c(
  CellChatDB.human$interaction$ligand,
  CellChatDB.human$interaction$receptor
))

# Your data genes
my_genes <- rownames(cellchat@data)

# Find overlaps
overlapping_genes <- intersect(my_genes, db_genes)
missing_genes <- setdiff(my_genes, db_genes)

cat("Overlapping genes:", length(overlapping_genes), "\n")
cat("Missing genes:", length(missing_genes), "\n")
```

## Database Quality Control

### Validate Database

```r
# Check for required columns
required_cols <- c(
  "interaction_name",
  "pathway_name",
  "ligand",
  "receptor",
  "annotation"
)

missing_cols <- setdiff(required_cols, colnames(cellchat@DB$interaction))
if (length(missing_cols) > 0) {
  warning("Missing columns: ", paste(missing_cols, collapse = ", "))
}

# Check for NA values
na_count <- sum(is.na(cellchat@DB$interaction[, required_cols]))
cat("NA values in required columns:", na_count, "\n")

# Check for empty strings
empty_count <- sum(cellchat@DB$interaction$ligand == "" |
                     cellchat@DB$interaction$receptor == "")
cat("Empty ligand/receptor entries:", empty_count, "\n")
```

### Filter by Evidence

```r
# Keep only high-confidence interactions (if evidence column exists)
if ("evidence" %in% colnames(cellchat@DB$interaction)) {
  high_confidence <- c("literature", "experimental", "curated")
  cellchat@DB$interaction <- cellchat@DB$interaction[
    cellchat@DB$interaction$evidence %in% high_confidence,
  ]
}
```

## Species-Specific Considerations

### Human Database

- Gene symbols: HGNC approved symbols
- Complexes: Human protein complexes
- Pathways: Human-centric pathway definitions

### Mouse Database

- Gene symbols: MGI approved symbols
- Ortholog mapping from human
- Some pathways may differ

### Cross-species Analysis

```r
# Convert between species
# Note: Requires ortholog mapping
cellchat_human <- createCellChat(...)
cellchat_human@DB <- CellChatDB.human

# For mouse data
cellchat_mouse <- createCellChat(...)
cellchat_mouse@DB <- CellChatDB.mouse
```

## Troubleshooting Database Issues

### Issue: Genes Not Found

**Symptoms:**
Many genes in your data are not in CellChatDB

**Solutions:**

1. **Check gene naming:**
```r
# Check if using official symbols
your_genes <- rownames(cellchat@data)
db_genes <- unique(c(CellChatDB.human$interaction$ligand,
                     CellChatDB.human$interaction$receptor))

# Find matches
cat("Matching genes:", length(intersect(your_genes, db_genes)), "\n")
```

2. **Update gene symbols:**
```r
# Use biomaRt for ID conversion
library(biomaRt)
ensembl <- useMart("ensembl", dataset = "hsapiens_gene_ensembl")
# Convert IDs as needed
```

3. **Add missing interactions:**
```r
# Manually add known interactions for missing genes
new_interactions <- data.frame(
  interaction_name = "YourGene_YourReceptor",
  pathway_name = "UNKNOWN",
  ligand = "YourGene",
  receptor = "YourReceptor",
  ...
)
```

### Issue: Database Not Loading

**Symptoms:**
```
Error: object 'CellChatDB.human' not found
```

**Solutions:**

1. **Load CellChat first:**
```r
library(CellChat)
data(CellChatDB.human)
```

2. **Check data directory:**
```r
data(package = "CellChat")
```

3. **Reinstall CellChat:**
```r
devtools::install_github("jinworks/CellChat")
```

### Issue: Complex Interactions Not Working

**Symptoms:**
Multi-subunit interactions not detected

**Solutions:**

1. **Check complex definitions:**
```r
# View complex definitions
print(CellChatDB.human$complex)

# Ensure all subunits are expressed
subunits <- strsplit(CellChatDB.human$complex$components, "_")
```

2. **Add custom complexes:**
```r
# Define new complex
custom_complex <- data.frame(
  complex_name = "CustomComplex",
  components = "GeneA_GeneB_GeneC"
)

CellChatDB.human$complex <- rbind(
  CellChatDB.human$complex,
  custom_complex
)
```

## Best Practices

### Database Selection

1. **Choose appropriate species** (human vs mouse)
2. **Consider interaction types** relevant to your study
3. **Filter by evidence level** if needed
4. **Update regularly** for latest interactions

### Custom Database Tips

1. **Document custom additions** with evidence
2. **Validate interactions** experimentally when possible
3. **Share custom databases** for reproducibility
4. **Version control** custom databases
5. **Test thoroughly** before using in analyses

### Performance Considerations

1. **Subset by pathway** for focused analysis
2. **Remove rare interactions** to speed up computation
3. **Cache database** in memory if running multiple analyses
4. **Use species-appropriate** database to avoid ortholog mapping overhead
