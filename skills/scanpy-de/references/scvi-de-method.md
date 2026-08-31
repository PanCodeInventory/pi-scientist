# SCVI-tools Differential Expression Method

## Overview

SCVI-tools provides deep learning-based DE using variational autoencoders (VAEs). It models gene expression with a negative binomial likelihood and provides Bayesian posterior probabilities for DE. It is the right choice when batch correction and DE analysis need to be integrated.

## When to Use

- Complex batch effects that require correction
- Few biological replicates (borrows strength across genes)
- Need for uncertainty quantification (Bayesian probabilities)

## When NOT to Use

- Simple marker gene identification (Wilcoxon is sufficient)
- Well-controlled experiments with sufficient replicates (pseudobulk preferred)
- When interpretable statistics are required

## Installation

```bash
pip install scvi-tools
```

## Basic Implementation

```python
import scanpy as sc
import scvi

# Setup AnnData for SCVI (counts layer, not .raw)
scvi.model.SCVI.setup_anndata(
    adata,
    batch_key="batch",           # Batch column (optional)
    labels_key="cell_type",      # Cell type column (optional)
    layer="counts"
)

# Create and train model
model = scvi.model.SCVI(adata, n_latent=30, n_layers=2, gene_likelihood="nb")
model.train(max_epochs=400, early_stopping=True, early_stopping_patience=10)

# Differential expression between two groups
de_df = model.differential_expression(
    groupby="cell_type",
    group1="CD4_T",
    group2="CD8_T",
    mode="change",              # 'vanilla', 'change', 'lfc'
    delta=0.5,                  # Minimum effect size for 'change' mode
    batch_correction=True,
    n_samples=5000
)

# Filter significant genes
sig_genes = de_df[
    (de_df["proba_de"] > 0.95) &
    (de_df["lfc_mean"].abs() > 1)
]
```

## Condition Comparison with Batch Correction

```python
scvi.model.SCVI.setup_anndata(adata, batch_key="batch", labels_key="condition", layer="counts")
model = scvi.model.SCVI(adata)
model.train()

de_df = model.differential_expression(
    groupby="condition",
    group1="treated",
    group2="control",
    batch_correction=True,      # Correct for batch during DE
    mode="change",
    delta=0.5
)
```

## Result Interpretation

| Column | Description | Interpretation |
|--------|-------------|----------------|
| `proba_de` | Probability of DE | > 0.95 = significant |
| `bayes_factor` | Log Bayes factor | > 3 = strong evidence |
| `lfc_mean` | Mean log fold change | Effect size |
| `lfc_median` | Median log fold change | Robust effect size |
| `is_de_fdr_0.05` | FDR-corrected significance | Alternative threshold |

## Mode Selection

| Mode | Description | Use Case |
|------|-------------|----------|
| `vanilla` | Standard posterior comparison | Quick analysis |
| `change` | Probability of change > delta | Most common, threshold-based |
| `lfc` | Focused on log fold change | When effect size matters most |

## Key Parameters

| Parameter | Recommended Value | Description |
|-----------|------------------|-------------|
| `n_latent` | 10-30 | Latent space dimension |
| `n_layers` | 1-2 | Encoder/decoder depth |
| `max_epochs` | 200-400 | Training epochs |
| `delta` | 0.5 | Effect size threshold |
| `proba_de` | > 0.95 | Probability threshold |
| `batch_correction` | True | Enable batch correction |

## Limitations

1. **Black box**: Less interpretable than classical methods
2. **Training required**: Adds computation time
3. **Hyperparameter sensitivity**: Results depend on model quality
4. **Not for simple tasks**: Overkill for basic marker identification

## References

1. Lopez et al. (2018) Nat Methods — Original scVI paper
2. Gayoso et al. (2022) Nat Biotechnol — SCVI-tools framework
3. Documentation: https://docs.scvi-tools.org/
