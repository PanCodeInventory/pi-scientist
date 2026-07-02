# SCVI-tools Differential Expression Method

## Overview

SCVI-tools provides deep learning-based differential expression using variational autoencoders (VAEs). It models gene expression with a negative binomial likelihood, accounts for technical noise specific to scRNA-seq, and provides Bayesian posterior probabilities for DE. This method is particularly powerful when batch correction and DE analysis need to be integrated.

## When to Use

- Complex batch effects that require correction
- Few biological replicates (borrows strength across genes)
- Need for uncertainty quantification (Bayesian probabilities)
- When latent representation and DE are both needed
- Large-scale atlas comparisons

## When NOT to Use

- Simple marker gene identification (Wilcoxon is sufficient)
- Well-controlled experiments with sufficient replicates (pseudobulk preferred)
- When interpretable statistics are required

## Installation

```bash
pip install scvi-tools
```

## Basic Implementation

### Setup and Training

```python
import scanpy as sc
import scvi

# Load data
adata = sc.read_h5ad("processed.h5ad")

# Setup AnnData for SCVI
scvi.model.SCVI.setup_anndata(
    adata,
    batch_key="batch",           # Batch column (optional)
    labels_key="cell_type"       # Cell type column (optional)
)

# Create and train model
model = scvi.model.SCVI(
    adata,
    n_latent=30,                 # Latent dimension
    n_layers=2,                  # Encoder/decoder layers
    gene_likelihood="nb"         # Negative binomial (default)
)

# Train
model.train(
    max_epochs=400,
    early_stopping=True,
    early_stopping_patience=10
)

# Check training
model.history['elbo_train'].plot()
```

### Differential Expression: One-vs-One

```python
# Compare two specific groups
de_df = model.differential_expression(
    groupby="cell_type",
    group1="CD4_T",
    group2="CD8_T",
    mode="change",              # 'vanilla', 'change', 'lfc'
    delta=0.5,                  # Minimum effect size for 'change' mode
    batch_correction=True,
    n_samples=5000              # Posterior samples
)

# Filter significant genes
sig_genes = de_df[
    (de_df["proba_de"] > 0.95) &     # High probability
    (de_df["lfc_mean"].abs() > 1)     # Meaningful effect
]

print(f"Found {len(sig_genes)} significant DE genes")
print(sig_genes.head(10))
```

### Differential Expression: One-vs-Rest

```python
# Find marker genes for one group vs all others
de_markers = model.differential_expression(
    groupby="cell_type",
    group1="CD4_T",
    group2=None,                # None = rest of groups
    mode="change",
    delta=0.5
)

# Top markers
top_markers = de_markers[
    de_markers["proba_de"] > 0.95
].nlargest(20, "lfc_mean")

print(top_markers[["proba_de", "lfc_mean", "bayes_factor"]])
```

### Differential Expression: All Groups

```python
# Get markers for all groups
all_markers = {}

for group in adata.obs["cell_type"].unique():
    de = model.differential_expression(
        groupby="cell_type",
        group1=group,
        group2=None,
        mode="change"
    )
    all_markers[group] = de[de["proba_de"] > 0.95]

# Combine results
markers_df = pd.concat(all_markers, names=["cell_type", "gene"])
```

## Result Interpretation

SCVI-tools returns the following columns:

| Column | Description | Interpretation |
|--------|-------------|----------------|
| `proba_de` | Probability of DE | > 0.95 = significant |
| `bayes_factor` | Log Bayes factor | > 3 = strong evidence |
| `lfc_mean` | Mean log fold change | Effect size |
| `lfc_median` | Median log fold change | Robust effect size |
| `lfc_std` | Std of log fold change | Uncertainty |
| `is_de_fdr_0.05` | FDR-corrected significance | Alternative threshold |

```python
# Comprehensive filtering
sig_genes = de_df[
    (de_df["proba_de"] > 0.95) &
    (de_df["bayes_factor"] > 3) &
    (de_df["lfc_mean"].abs() > 1)
]
```

## Advanced Usage

### Condition Comparison with Batch Correction

```python
# Setup with condition and batch
scvi.model.SCVI.setup_anndata(
    adata,
    batch_key="batch",
    labels_key="condition"      # Use condition as labels
)

model = scvi.model.SCVI(adata)
model.train()

# DE with batch correction enabled
de_df = model.differential_expression(
    groupby="condition",
    group1="treated",
    group2="control",
    batch_correction=True,      # Correct for batch during DE
    mode="change",
    delta=0.5
)
```

### Cell-Type-Specific Condition Comparison

```python
# For each cell type, compare conditions
results_by_celltype = {}

for celltype in adata.obs["cell_type"].unique():
    # Subset to cell type
    adata_ct = adata[adata.obs["cell_type"] == celltype].copy()
    
    # Setup and train
    scvi.model.SCVI.setup_anndata(adata_ct, batch_key="batch")
    model_ct = scvi.model.SCVI(adata_ct)
    model_ct.train(max_epochs=200)
    
    # DE
    de = model_ct.differential_expression(
        groupby="condition",
        group1="treated",
        group2="control",
        batch_correction=True
    )
    
    results_by_celltype[celltype] = de[de["proba_de"] > 0.95]
```

### Using SCANVI for Semi-Supervised Analysis

```python
# SCANVI extends SCVI with cell type prediction
model = scvi.model.SCANVI.from_scvi_model(
    scvi_model,
    unlabeled_category="Unknown",
    adata=adata
)

model.train()

# Predict cell types
adata.obs["predicted_type"] = model.predict()

# Get latent representation
adata.obsm["X_scANVI"] = model.get_latent_representation()
```

### Exporting Latent Representation

```python
# Get latent space for downstream analysis
latent = model.get_latent_representation()
adata.obsm["X_scVI"] = latent

# Use for visualization
sc.pp.neighbors(adata, use_rep="X_scVI")
sc.tl.umap(adata)
sc.pl.umap(adata, color=["cell_type", "batch"])
```

## Complete Workflow Example

```python
import scanpy as sc
import scvi
import pandas as pd

# 1. Load data
adata = sc.read_h5ad("filtered.h5ad")

# 2. Ensure raw counts are in .X
if adata.raw is not None:
    adata.X = adata.raw.X.copy()

# 3. Setup SCVI
scvi.model.SCVI.setup_anndata(
    adata,
    batch_key="donor_id",
    labels_key="cell_type"
)

# 4. Train model
model = scvi.model.SCVI(
    adata,
    n_latent=30,
    n_layers=2,
    gene_likelihood="nb"
)

model.train(
    max_epochs=400,
    early_stopping=True,
    early_stopping_patience=10,
    plan_kwargs={'lr': 1e-3}
)

# 5. Get latent representation
adata.obsm["X_scVI"] = model.get_latent_representation()

# 6. Visualization
sc.pp.neighbors(adata, use_rep="X_scVI")
sc.tl.umap(adata)
sc.pl.umap(adata, color=["cell_type", "batch"])

# 7. Differential expression
all_markers = {}
for ct in adata.obs["cell_type"].unique():
    de = model.differential_expression(
        groupby="cell_type",
        group1=ct,
        group2=None,
        mode="change",
        delta=0.5
    )
    all_markers[ct] = de[de["proba_de"] > 0.95].nlargest(50, "lfc_mean")

# 8. Save results
for ct, markers in all_markers.items():
    markers.to_csv(f"markers/scvi_{ct}_markers.csv")

# 9. Save model
model.save("scvi_model/")
adata.write("results/scvi_analyzed.h5ad")
```

## Loading Pre-trained Model

```python
# Load saved model
model = scvi.model.SCVI.load("scvi_model/", adata)

# Continue training or run DE
de_df = model.differential_expression(...)
```

## Mode Selection

SCVI-tools offers three DE modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `vanilla` | Standard posterior comparison | Quick analysis |
| `change` | Probability of change > delta | Most common, threshold-based |
| `lfc` | Focused on log fold change | When effect size matters most |

```python
# Change mode (recommended)
de_change = model.differential_expression(
    groupby="cell_type",
    group1="A", group2="B",
    mode="change",
    delta=0.5              # Detect changes > 0.5 log units
)

# LFC mode
de_lfc = model.differential_expression(
    groupby="cell_type",
    group1="A", group2="B",
    mode="lfc",
    delta=1.0              # Focus on fold change > 2x
)
```

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `n_latent` | 10-30 | Latent space dimension |
| `n_layers` | 1-2 | Encoder/decoder depth |
| `max_epochs` | 200-400 | Training epochs |
| `delta` | 0.5 | Effect size threshold |
| `proba_de` | > 0.95 | Probability threshold |
| `n_samples` | 5000 | Posterior samples |
| `batch_correction` | True | Enable batch correction |

## Visualization

### Volcano Plot

```python
import matplotlib.pyplot as plt
import numpy as np

plt.figure(figsize=(10, 6))
plt.scatter(
    de_df["lfc_mean"],
    -np.log10(1 - de_df["proba_de"]),
    c=de_df["proba_de"] > 0.95,
    cmap="coolwarm",
    alpha=0.6
)
plt.axvline(x=0, color="grey", linestyle="--")
plt.xlabel("Log Fold Change")
plt.ylabel("-log10(1 - proba_de)")
plt.title("SCVI Differential Expression")
plt.colorbar(label="Significant (proba_de > 0.95)")
```

### Heatmap of Top DE Genes

```python
top_genes = de_df.nlargest(20, "lfc_mean").index.tolist()

sc.pl.heatmap(
    adata,
    var_names=top_genes,
    groupby="cell_type",
    cmap="viridis",
    swap_axes=True
)
```

## Advantages

1. **Integrated batch correction**: DE computed on batch-corrected latent space
2. **Uncertainty quantification**: Bayesian probabilities, not just p-values
3. **Borrows strength**: Works with few replicates
4. **Flexible**: Multiple modes for different use cases
5. **Scalable**: Handles millions of cells

## Limitations

1. **Black box**: Less interpretable than classical methods
2. **Training required**: Adds computation time
3. **Hyperparameter sensitivity**: Results depend on model quality
4. **Not for simple tasks**: Overkill for basic marker identification

## Comparison with Other Methods

| Feature | SCVI-tools | Wilcoxon | Pseudobulk |
|---------|------------|----------|------------|
| Batch correction | Integrated | Pre-required | Not needed |
| Replicates needed | 1+ | 1 | 3+ |
| FDR control | Bayesian | BH | Classical |
| Speed (training) | Slow | Instant | Fast |
| Speed (DE) | Fast | Fast | Fast |
| Uncertainty | Yes | No | Partial |

## References

1. Lopez et al. (2018) Nat Methods - Original scVI paper
2. Gayoso et al. (2022) Nat Biotechnol - SCVI-tools framework
3. Documentation: https://docs.scvi-tools.org/
