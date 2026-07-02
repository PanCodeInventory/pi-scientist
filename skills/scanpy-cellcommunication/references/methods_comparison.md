# LIANA+ Methods Comparison

## Overview

LIANA+ integrates multiple cell-cell communication (CCC) inference methods, each with distinct statistical approaches, assumptions, and strengths. The consensus ranking (`magnitude_rank`, `specificity_rank`) aggregates across methods to produce robust interaction scores.

This document provides a detailed comparison to help select appropriate methods for specific analyses.

---

## Method Comparison Table

| Method | Key Score | Statistical Basis | Speed | Best For | Limitations |
|--------|-----------|-------------------|-------|----------|-------------|
| **CellPhoneDB** | `cellphonedb` (mean p-value) | Permutation-based | Slow | Significance testing, rigorous statistics | Computationally expensive; requires many permutations |
| **CellChat** | `cellchat` (probability) | Probabilistic model | Medium | Signaling pathway analysis, communication probability | Pathway-centric; may miss non-canonical interactions |
| **NATMI** | `natmi` (weighted product) | Expression-weighted product | Fast | Weighted expression analysis, network topology | No built-in significance testing |
| **Connectome** | `connectome` (weighted mean) | Expression-weighted mean with specificity | Fast | Edge specificity analysis | May over-weight high-expression genes |
| **SingleCellSignalR** | `sca` (network score) | Network-based scoring | Medium | Network topology, signaling flow | Complex scoring; harder to interpret |
| **log2FC** | `log2fc` | Log2 fold-change | Very Fast | Quick screening, differential expression | No specificity adjustment; sensitive to outliers |
| **Geometric Mean** | `geometric_mean` | Geometric mean of per-method scores | Fast | Balanced aggregation across methods | Depends on quality of constituent methods |
| **Consensus Rank** | `magnitude_rank`, `specificity_rank` | Rank-based aggregation | Medium | Robust, publication-quality analysis | Requires running multiple methods |

---

## Detailed Method Descriptions

### CellPhoneDB

**Approach:** CellPhoneDB uses a permutation-based statistical framework to assess the significance of ligand-receptor interactions. It randomly permutes cell type labels to generate a null distribution, then compares observed interaction scores against this null.

**Scoring:**
- Computes the mean expression of ligand in source and receptor in target
- Performs `n_perms` permutations of cell labels
- Returns mean p-value and p-value significance

**Strengths:**
- Statistically rigorous with permutation testing
- Well-established in the field (widely cited)
- Controls for cell type composition effects

**Weaknesses:**
- Computationally expensive (1000+ permutations recommended)
- Results can vary between runs if seed not fixed
- Requires sufficient cells per group for reliable permutations

**When to use:**
- Publication-quality analysis requiring significance testing
- Datasets with balanced cell type proportions
- When statistical rigor is the primary concern

**Typical parameters:**
```python
li.mt.cellphoneDB(adata, groupby='cell_type', n_perms=1000, expr_prop=0.1)
```

---

### CellChat

**Approach:** CellChat employs a probabilistic model to quantify communication probability between cell populations. It accounts for the number of cells in each population and models the likelihood of interaction.

**Scoring:**
- Calculates communication probability based on expression levels
- Adjusts for cell population sizes
- Provides pathway-level aggregation

**Strengths:**
- Probabilistic framework handles varying cell type sizes
- Pathway-centric view useful for biological interpretation
- Fast computation compared to CellPhoneDB

**Weaknesses:**
- Dependent on CellChat's curated resource (may miss interactions)
- Pathway-centric view may obscure individual LR pair details
- Probability scores can be difficult to calibrate across datasets

**When to use:**
- Pathway-level communication analysis
- Datasets with highly imbalanced cell type proportions
- When signaling pathway interpretation is needed

**Typical parameters:**
```python
li.mt.cellchat(adata, groupby='cell_type', resource_name='cellchatdb', expr_prop=0.1)
```

---

### NATMI

**Approach:** NATMI (NAïve Traffic Model for Inter-cellular communication) calculates the strength of ligand-receptor interactions as the weighted product of ligand and receptor expression across cell populations, with specificity weighting.

**Scoring:**
- Computes ligand expression in source × receptor expression in target
- Applies specificity weighting based on how restricted expression is to the source-target pair
- Returns edge strength and specificity scores

**Strengths:**
- Fast computation (no permutations needed)
- Intuitive scoring (expression-based)
- Provides both strength and specificity metrics
- Good for network visualization

**Weaknesses:**
- No statistical significance testing
- Sensitive to expression outliers
- May overestimate interactions for highly expressed genes

**When to use:**
- Quick exploration of communication patterns
- Network visualization and topology analysis
- When computational speed is important
- Large datasets where CellPhoneDB is too slow

**Typical parameters:**
```python
li.mt.natmi(adata, groupby='cell_type', resource_name='consensus', expr_prop=0.1)
```

---

### Connectome

**Approach:** Connectome calculates the expression-weighted mean of ligand-receptor pairs across cell populations, with edge specificity scores that measure how uniquely an interaction occurs between specific source-target pairs.

**Scoring:**
- Weighted mean expression of ligand-receptor complex
- Edge specificity measures how restricted the interaction is
- Designed for network analysis

**Strengths:**
- Fast computation
- Provides specificity metric
- Well-suited for network graph construction

**Weaknesses:**
- May over-weight highly expressed genes
- Less sensitive to rare but important interactions
- No statistical testing

**When to use:**
- Building communication networks for visualization
- When specificity of interactions is the primary interest
- As a complement to other methods

**Typical parameters:**
```python
li.mt.connectome(adata, groupby='cell_type', resource_name='connectomedb', expr_prop=0.1)
```

---

### SingleCellSignalR (SCA)

**Approach:** SingleCellSignalR uses a network-based scoring system that models signaling flow between cell populations, accounting for both direct and indirect communication pathways.

**Scoring:**
- Network-based propagation of signaling activity
- Accounts for multi-step communication cascades
- Provides a holistic view of communication networks

**Strengths:**
- Captures indirect communication effects
- Network-aware scoring
- Comprehensive signaling analysis

**Weaknesses:**
- Complex scoring mechanism, harder to interpret
- Computationally moderate
- May include indirect interactions that are difficult to validate

**When to use:**
- When indirect communication pathways are of interest
- Network-level signaling analysis
- Complex tissue systems with multi-step signaling

**Typical parameters:**
```python
li.mt.sca(adata, groupby='cell_type', resource_name='consensus', expr_prop=0.1)
```

---

### log2FC

**Approach:** The log2 fold-change method scores interactions based on the log2 fold-change of ligand expression in source cells versus non-source cells, combined with receptor expression in target cells.

**Scoring:**
- Log2 fold-change of ligand expression (source vs. all other cells)
- Combined with receptor expression level in target
- Very fast computation

**Strengths:**
- Extremely fast
- Intuitive interpretation (fold-change based)
- Good for quick screening

**Weaknesses:**
- No specificity adjustment
- Sensitive to outliers and zero-inflation
- Not suitable for publication-quality analysis alone
- Does not account for receptor specificity

**When to use:**
- Quick initial screening of potential interactions
- Large-scale exploration before detailed analysis
- When computational resources are limited

**Typical parameters:**
```python
li.mt.log2fc(adata, groupby='cell_type', resource_name='consensus', expr_prop=0.1)
```

---

## Consensus Ranking

### How It Works

LIANA+'s `rank_aggregate` runs all available methods and produces two consensus metrics:

1. **`magnitude_rank`**: Aggregates the magnitude of communication across methods using rank-based statistics. Lower values indicate stronger overall communication.

2. **`specificity_rank`**: Aggregates the specificity of interactions (how uniquely they occur between source-target pairs) using rank-based statistics. Lower values indicate more specific interactions.

### Why Consensus Matters

Individual CCC methods have different assumptions and sensitivities:
- An interaction ranked highly by CellPhoneDB (significant) but not by NATMI (low expression) may be statistically real but biologically weak
- An interaction ranked highly by both CellPhoneDB and NATMI is likely a robust, biologically meaningful interaction

The consensus approach:
- Reduces false positives by requiring agreement across methods
- Provides more stable rankings across runs
- Captures both statistical significance and biological relevance

### Method Agreement Analysis

```python
# Count how many methods support each interaction
method_cols = [c for c in liana_res.columns if c not in
               ['ligand', 'receptor', 'source', 'target',
                'magnitude_rank', 'specificity_rank', 'entity_interaction']]

liana_res['n_methods'] = liana_res[method_cols].notna().sum(axis=1)

# Interactions supported by all methods
fully_supported = liana_res[liana_res['n_methods'] == len(method_cols)]
print(f"Fully supported interactions: {len(fully_supported)}")

# Interactions supported by single method only (potential false positives)
single_method = liana_res[liana_res['n_methods'] == 1]
print(f"Single-method interactions: {len(single_method)}")
```

---

## Recommended Workflows

### For Publication-Quality Analysis

1. Run `rank_aggregate` with default settings
2. Filter for interactions with `magnitude_rank < 0.05` AND `specificity_rank < 0.05`
3. Check method agreement (prefer interactions supported by 3+ methods)
4. Validate top interactions against known biology
5. Use dot plots and heatmaps for visualization

### For Quick Exploration

1. Run `log2fc` or `natmi` for fast initial screening
2. Identify candidate interactions
3. Validate with `rank_aggregate` on a subset
4. Use chord diagrams for network overview

### For Spatial Transcriptomics

1. Run `bivar` for spatial correlation analysis
2. Cross-validate with `rank_aggregate` for expression-based confirmation
3. Focus on interactions with both spatial and expression support

### For Differential Communication

1. Run `rank_aggregate` on each condition separately
2. Compare magnitude_rank changes between conditions
3. Identify condition-specific interactions
4. Validate with pathway enrichment analysis

---

## Method Selection Guide

| Scenario | Recommended Primary Method | Supplement |
|----------|---------------------------|------------|
| Publication | `rank_aggregate` (consensus) | CellPhoneDB, CellChat |
| Quick screening | `log2fc` | `natmi` |
| Pathway analysis | `cellchat` | `rank_aggregate` |
| Network visualization | `natmi` or `connectome` | `rank_aggregate` |
| Spatial analysis | `bivar` | `rank_aggregate` |
| Large datasets (>100k cells) | `log2fc` + `natmi` | `rank_aggregate` with fewer methods |
| Rare cell types | `natmi` (lower `expr_prop`) | `rank_aggregate` |
| Statistical rigor | `cellphoneDB` | `rank_aggregate` |
