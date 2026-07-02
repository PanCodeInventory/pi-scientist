---
name: spatial-commot
description: "Spatial transcriptomics cell-cell communication inference via COMMOT (Collective Optimal Transport). Infers signaling between spatially-resolved cells/spots using optimal transport theory with spatial distance constraints. Use this skill whenever a user wants to run COMMOT analysis, perform spatially-aware cell communication inference, analyze ligand-receptor interactions with spatial constraints, compute signaling direction vector fields, or identify communication-dependent genes in spatial transcriptomics data. Triggered by: COMMOT, commot, spatial cell communication, spatial CCC, optimal transport signaling, spatial ligand-receptor, 空间通讯, 空间细胞通讯, 空间配体受体, collective optimal transport, spatial signaling direction, communication-dependent genes, spatial CCC inference, 空间转录组通讯分析. Use instead of scanpy-cellcommunication when the data has spatial coordinates and spatial constraints matter."
---

# Spatial-COMMOT: Spatial Cell-Cell Communication via Collective Optimal Transport

Infer cell-cell communication (CCC) in spatial transcriptomics data using COMMOT — a method that models signaling as a collective optimal transport problem with spatial distance constraints. Unlike CellChat or CellPhoneDB which ignore spatial information, COMMOT explicitly restricts signaling to nearby cells and handles multi-species ligand-receptor competition through optimal transport theory.

**Citation:** Cang Z, Zhao Y, Almet AA, et al. "Screening cell–cell communication in spatial transcriptomics via collective optimal transport." *Nature Methods* 20, 218–228 (2023). DOI: [10.1038/s41592-022-01728-4](https://doi.org/10.1038/s41592-022-01728-4)

**Package:** `commot` v0.0.3 | PyPI: `pip install commot` | [GitHub](https://github.com/zcang/COMMOT) | [Docs](https://commot.readthedocs.io/)

## When to Use COMMOT vs Other CCC Methods

| Method | Spatial Awareness | Best For |
|--------|------------------|----------|
| **COMMOT** | ✅ Native — distance-constrained OT | Spatial TX data (Visium, MERFISH, etc.) where spatial proximity drives signaling |
| CellChat | ❌ Non-spatial | Non-spatial scRNA-seq, pathway-level analysis |
| CellPhoneDB | ❌ Non-spatial | Non-spatial scRNA-seq, statistical testing |
| Squidpy ligrec | ✅ Spatial neighbors | Quick spatial CCC, broad L-R database (OmniPath) |
| LIANA+ | ⚠️ Can wrap spatial methods | Multi-method consensus, many L-R databases |

**Choose COMMOT when:** you have spatial coordinates, need signaling direction vector fields, or want to model ligand-receptor competition spatially. Use scanpy-cellcommunication for non-spatial scRNA-seq data.

---

## Step 0: Assess Data Readiness

Before starting, verify the data has what COMMOT needs. Check the AnnData object:

```python
# Required: spatial coordinates
assert 'spatial' in adata.obsm, "COMMOT requires adata.obsm['spatial']"

# Required: normalized expression
# COMMOT works with log1p-normalized data

# Recommended: cluster/cell type annotations for downstream analysis
# (needed for cluster-level communication and dot plots)
```

If spatial coordinates are missing, COMMOT cannot be used — suggest scanpy-cellcommunication instead.

## Step 1: Clarify Analysis Goals with the User

Always discuss with the user before running analysis. Adapt question language to the user's language (Chinese or English).

**Q1 — Analysis scope:**
> "What spatial communication analysis do you want to perform?"
> - A) **Full screening**: Infer all L-R interactions across all cell types (broad discovery)
> - B) **Pathway-focused**: Investigate specific signaling pathways (e.g., TGF-β, WNT, EGF)
> - C) **Cell type pair**: Communication between specific cell types (e.g., fibroblast → tumor)
> - D) **Signaling direction**: Map the direction of signaling flows across tissue
> - E) **Communication impact**: Identify genes whose expression depends on signaling strength

**Q2 — Platform and distance:**
> "What spatial platform is this data from?" (Determines the distance threshold `dis_thr`)
> - 10x Visium (~55µm spots) → `dis_thr=200-300`
> - MERFISH/seqFISH (single-cell) → `dis_thr=30-75`
> - Slide-seq (10µm beads) → `dis_thr=30-100`
> - Xenium (subcellular) → `dis_thr=30-60`
> - Unknown → inspect coordinates: `np.ptp(adata.obsm['spatial'], axis=0)` to gauge scale

**Q3 — L-R database:**
> "Which ligand-receptor database?"
> - A) CellChatDB (recommended, ~2,000 pairs, good pathway annotations)
> - B) CellPhoneDB v4.0 (~1,000 pairs, well-validated)
> - C) Custom database (user provides L-R pairs)

**Q4 — Organism:**
> "Human or mouse?" (Determines database species filter)

Base recommendations on answers:
- Scope A + Visium → CellChatDB, `dis_thr=250`, `pathway_sum=True`
- Scope D + MERFISH → Full analysis with direction vector fields
- Scope E → Run spatial_communication first, then communication_impact
- Small dataset (<2,000 cells) → reduce `cot_nitermax=5000` for speed

Do NOT proceed until the user has answered Q1 and Q2 at minimum.

## Step 2: Preprocessing

```python
import commot as ct
import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Normalize expression (log1p is the standard for COMMOT)
sc.pp.normalize_total(adata, inplace=True)
sc.pp.log1p(adata)
adata.var_names_make_unique()

# If spatial distance not pre-computed, COMMOT computes it from adata.obsm['spatial']
# Pre-compute for reuse (optional but recommended for large datasets):
from scipy.spatial import distance_matrix
spatial_dist = distance_matrix(adata.obsm['spatial'], adata.obsm['spatial'])
adata.obsp['spatial_distance'] = scipy.sparse.csr_matrix(spatial_dist)
```

### Select and Filter L-R Database

```python
# Option A: Built-in CellChatDB (recommended)
df_ligrec = ct.pp.ligand_receptor_database(
    database='CellChat',
    species='human',               # or 'mouse'
    signaling_type='Secreted Signaling',  # or 'Cell-Cell Contact', 'ECM-Receptor', or None for all
)

# Option B: CellPhoneDB v4.0
df_ligrec = ct.pp.ligand_receptor_database(
    database='CellPhoneDB_v4.0',
    species='human',
)

# Option C: Custom database (3-column DataFrame: ligand, receptor, pathway)
df_ligrec = pd.DataFrame([
    ['TGFB1', 'TGFBR1_TGFBR2', 'TGFb'],
    ['EGF', 'EGFR', 'EGF'],
    ['VEGFA', 'KDR', 'VEGF'],
], columns=['ligand', 'receptor', 'pathway'])  # column names not strictly required

# Filter to genes present in data (recommended)
df_ligrec = ct.pp.filter_lr_database(
    df_ligrec, adata,
    heteromeric=True,           # if complexes present (e.g., TGFBR1_TGFBR2)
    min_cell_pct=0.05,          # require ≥5% of cells expressing the gene
)
```

## Step 3: Infer Spatial Communication

This is the core COMMOT analysis — solves the collective optimal transport problem.

### Basic Inference

```python
ct.tl.spatial_communication(
    adata,
    database_name='cellchat',     # identifier for storage keys
    df_ligrec=df_ligrec,
    dis_thr=250,                  # distance threshold (adjust to platform!)
    heteromeric=True,             # enable complex handling (e.g., TGFBR1_TGFBR2)
    heteromeric_rule='min',       # 'min' = all subunits must be expressed (conservative)
    pathway_sum=True,             # sum signaling per pathway (enables pathway-level analysis)
)
```

### Tuning the OT Parameters

The key parameters control the optimal transport optimization. Understand what they do before changing:

| Parameter | Default | Effect of Increasing | When to Adjust |
|-----------|---------|---------------------|----------------|
| `dis_thr` | None | Allows longer-range signaling | Scale to platform resolution (most important parameter) |
| `cot_eps_p` | 0.1 | More diffuse transport (cells signal to more neighbors) | Lower (0.05) for sharper signaling; higher (0.2) if too sparse |
| `cot_rho` | 10.0 | Forces more mass to be transported (stronger signaling) | Lower (5) if too much noise; higher (20) if too few hits |
| `cot_nitermax` | 10000 | More iterations for convergence | Reduce (5000) for speed on large datasets |
| `cot_weights` | (0.25,0.25,0.25,0.25) | Weight the four COT levels | Default is balanced; use (1,0,0,0) for global-only |
| `smooth` | False | Spatially smooth expression before OT | Enable for noisy data; requires `smth_eta` |
| `cost_type` | 'euc' | 'euc_square' penalizes long distance more | 'euc_square' for shorter-range emphasis |

### Platform-Specific Starting Parameters

```python
# Visium (55µm spots)
ct.tl.spatial_communication(adata, database_name='cellchat', df_ligrec=df_ligrec,
    dis_thr=250, heteromeric=True, pathway_sum=True)

# MERFISH / seqFISH+ (single-cell)
ct.tl.spatial_communication(adata, database_name='cellchat', df_ligrec=df_ligrec,
    dis_thr=50, heteromeric=True, pathway_sum=True, cot_eps_p=0.05)

# Slide-seq (10µm beads)
ct.tl.spatial_communication(adata, database_name='cellchat', df_ligrec=df_ligrec,
    dis_thr=80, heteromeric=True, pathway_sum=True)

# Large dataset (>10,000 cells) — reduce iterations for speed
ct.tl.spatial_communication(adata, database_name='cellchat', df_ligrec=df_ligrec,
    dis_thr=250, heteromeric=True, pathway_sum=True, cot_nitermax=5000)
```

### What Gets Stored

After `spatial_communication`, the AnnData is enriched with:

| Location | Key | Content |
|----------|-----|---------|
| `adata.obsp` | `'commot-{db}-{lig}-{rec}'` | Sparse cell×cell signaling matrix; entry [i,j] = signaling from cell i → cell j |
| `adata.obsp` | `'commot-{db}-{pathway}'` | Pathway-summed signaling (if `pathway_sum=True`) |
| `adata.obsp` | `'commot-{db}-total-total'` | Total signaling across all pairs |
| `adata.obsm` | `'commot-{db}-sum-sender'` | DataFrame: total signal each cell sends per LR pair |
| `adata.obsm` | `'commot-{db}-sum-receiver'` | DataFrame: total signal each cell receives per LR pair |
| `adata.uns` | `'commot-{db}-info'` | Metadata: LR database used, distance threshold |

### Interpreting Signaling Scores

- The transport plan `P[i,j]` represents the "mass" of signaling from cell i (ligand sender) to cell j (receptor)
- Scores are **relative** — compare within the same run, not across datasets
- Higher sender sum → cell is a strong signaling source
- Higher receiver sum → cell is a strong signaling target
- For `heteromeric_rule='min'`, both subunits must be expressed → conservative estimates

## Step 4: Cluster-Level Communication

Summarize cell-level communication to cluster-level with statistical significance.

```python
# Standard cluster-level summary (label permutation p-values)
ct.tl.cluster_communication(
    adata,
    database_name='cellchat',
    clustering='cell_type',       # column in adata.obs with cluster labels
    n_permutations=500,           # increase to 1000+ for publication
    random_seed=42,
)

# Spatial permutation (accounts for spatial structure — more rigorous)
ct.tl.cluster_communication_spatial_permutation(
    adata,
    database_name='cellchat',
    df_ligrec=df_ligrec,
    clustering='cell_type',
    perm_type='within_cluster',   # or 'all_cell'
    n_permutations=100,
    random_seed=42,
    dis_thr=250,                  # must match original inference
    heteromeric=True,
    cot_nitermax=100,             # lower for permutation speed
)
```

**Interpretation**: Cluster-level p-values test whether the observed communication between two cell types is stronger than expected by random label shuffling. Spatial permutation is more rigorous because it preserves spatial structure.

## Step 5: Signaling Direction Analysis

Compute and visualize the direction of signaling flows — one of COMMOT's unique strengths.

```python
# Compute direction vectors
ct.tl.communication_direction(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',          # or lr_pair=('TGFB1','TGFBR1_TGFBR2')
    k=5,                          # k nearest neighbors for direction computation
)

# Visualize as cell-level quiver plot
ct.pl.plot_cell_communication(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',
    plot_method='cell',           # 'cell' | 'grid' | 'stream'
    background='summary',         # 'summary' | 'cluster' | 'image'
    summary='sender',             # 'sender' | 'receiver'
    ndsize=1,
    scale=1.0,
    filename='ccc_direction_TGFb.pdf',
)

# Streamline plot (good for tissue-scale flows)
ct.pl.plot_cell_communication(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',
    plot_method='stream',
    background='image',           # with H&E background for Visium
    stream_density=1.0,
    stream_linewidth=1,
)

# Grid-interpolated direction field
ct.pl.plot_cell_communication(
    adata,
    database_name='cellchat',
    lr_pair=('TGFB1', 'TGFBR1_TGFBR2'),
    plot_method='grid',
    background='cluster',
    clustering='cell_type',
    grid_density=1.0,
)
```

### Direction Vector Interpretation

- Each vector points from a sender cell toward the cells that receive the most signal from it
- **Sender summary**: arrows show where each cell's signal flows to
- **Receiver summary**: arrows show from which cells each cell receives signal
- Long vectors in coherent directions indicate organized tissue-level signaling
- Chaotic/short vectors suggest local, disorganized signaling

## Step 6: Cluster Communication Visualization

```python
# Network diagram: cluster-to-cluster communication
ct.pl.plot_cluster_communication_network(
    adata,
    uns_names=['commot-cellchat-cluster_communication'],
    clustering='cell_type',
    filename='cluster_network.pdf',
)

# Dotplot: cluster pairs × LR pairs
ct.pl.plot_cluster_communication_dotplot(
    adata,
    database_name='cellchat',
    clustering='cell_type',
    filename='cluster_dotplot.pdf',
)
```

## Step 7: Downstream Analysis (Optional)

### Communication Impact on Gene Expression

Identify genes whose expression correlates with signaling strength.

```python
# Partial correlation method (fast)
df_impact = ct.tl.communication_impact(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',
    method='partial_corr',
    corr_method='spearman',
)

# Tree-based importance (more robust but slower)
df_impact = ct.tl.communication_impact(
    adata,
    database_name='cellchat',
    method='treebased_score',
    tree_method='rf',
    tree_ntrees=100,
)

# Visualize top impacted genes
ct.pl.plot_communication_impact(df_impact)
```

### Communication-Dependent Genes (requires R/tradeSeq)

Identify genes with expression patterns that follow the signaling gradient — requires R with tradeSeq installed (`pip install commot[tradeSeq]`).

```python
df_deg, df_yhat = ct.tl.communication_deg_detection(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',
    summary='receiver',
    nknots=6,
    n_deg_genes=200,
    deg_pvalue_cutoff=0.05,
)

# Cluster DEGs by expression pattern along signaling gradient
df_deg_clustered = ct.tl.communication_deg_clustering(df_deg, df_yhat)

# Visualize
ct.pl.plot_communication_dependent_genes(df_deg, df_yhat)
```

### Spatial Autocorrelation of Signaling

Test whether signaling directions show spatial clustering.

```python
ct.tl.communication_spatial_autocorrelation(
    adata,
    database_name='cellchat',
    pathway_name='TGFb',
    method='Moran',
    n_permutations=999,
)
```

### Grouping Similar Communication Patterns

```python
# Group LR pairs with similar cluster-level patterns
ct.tl.group_cluster_communication(
    adata,
    clustering='cell_type',
    dissimilarity_method='jaccard',
    leiden_resolution=1.0,
)
```

## Step 8: Custom Visualization with scanpy/squidpy

COMMOT's built-in plots work well, but for publication figures, you may want custom visualizations:

```python
# Plot sender signaling on tissue
sender_df = adata.obsm['commot-cellchat-sum-sender']
adata.obs['TGFB1_sender'] = sender_df['s-TGFB1-TGFBR1_TGFBR2'].values
sc.pl.spatial(adata, color='TGFB1_sender', cmap='Reds', title='TGFB1 Signaling (Sender)')

# Plot receiver signaling
receiver_df = adata.obsm['commot-cellchat-sum-receiver']
adata.obs['TGFB1_receiver'] = receiver_df['r-TGFB1-TGFBR1_TGFBR2'].values
sc.pl.spatial(adata, color='TGFB1_receiver', cmap='Blues', title='TGFB1 Signaling (Receiver)')

# Identify top interacting cell type pairs
# Extract cluster-level communication and create a heatmap
```

For detailed visualization patterns, read: `references/visualization-guide.md`

## Common Pitfalls and Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| No L-R pairs pass filtering | Gene names don't match database | Check `adata.var_names` vs database gene symbols; try `filter_lr_database` with lower `min_cell_pct=0.01` |
| `dis_thr` too large/small | Not scaled to platform | Inspect coordinate range: `np.ptp(adata.obsm['spatial'], axis=0)`. Visium: 200-300, single-cell: 30-75 |
| Too few significant interactions | `cot_rho` too low | Increase `cot_rho` to 15-20 to force more signaling |
| Computation too slow | Large dataset + many LR pairs | Reduce `cot_nitermax=5000`, filter LR pairs, subset to HVGs |
| Memory error | O(n²) distance matrix | Pre-compute sparse distance, or subset regions |
| Sparse signaling in plots | `cot_eps_p` too low | Increase `cot_eps_p=0.2` for more diffuse transport |
| Direction vectors chaotic | k too small in `communication_direction` | Increase `k=10` for smoother directions |
| DEG analysis fails | R/tradeSeq not installed | Install: `pip install commot[tradeSeq]` with R 3.6.3 + tradeSeq 1.0.1 |
| Heteromeric pairs excluded | Missing subunit | Check that all subunit genes are in `adata.var_names` |

## Parameter Quick Reference

### `ct.tl.spatial_communication` Key Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `adata` | AnnData | — | Must have `.obsm['spatial']` |
| `database_name` | str | None | Storage key prefix |
| `df_ligrec` | DataFrame | None | 3-column: ligand, receptor, pathway |
| `pathway_sum` | bool | False | Sum signaling per pathway |
| `heteromeric` | bool | False | Enable complex subunit handling |
| `heteromeric_rule` | str | 'min' | 'min' (conservative) or 'ave' |
| `heteromeric_delimiter` | str | '_' | Separator for complex names |
| `dis_thr` | float/dict | None | Spatial distance threshold (scalar or per-LR-pair dict) |
| `cost_type` | str | 'euc' | 'euc' or 'euc_square' |
| `cost_scale` | dict | None | Per-LR-pair cost weights |
| `cot_eps_p` | float | 0.1 | Entropy regularization |
| `cot_rho` | float | 10.0 | Unbalanced mass penalty |
| `cot_nitermax` | int | 10000 | Max OT solver iterations |
| `cot_weights` | tuple | (0.25,0.25,0.25,0.25) | Weights for 4 COT levels |
| `smooth` | bool | False | Spatial expression smoothing |
| `smth_eta` | float | None | Smoothing kernel bandwidth |
| `smth_nu` | float | None | Smoothing kernel sharpness |
| `smth_kernel` | str | 'exp' | 'exp' or 'lorentz' kernel |
| `copy` | bool | False | Return copy vs modify in place |

### `ct.pl.plot_cell_communication` Key Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `plot_method` | str | 'cell' | 'cell', 'grid', or 'stream' |
| `background` | str | 'summary' | 'summary', 'cluster', or 'image' |
| `summary` | str | 'sender' | 'sender' or 'receiver' coloring |
| `scale` | float | 1.0 | Arrow scale (smaller = longer arrows) |
| `normalize_v` | bool | False | Normalize vectors to uniform length |
| `stream_density` | float | 1.0 | Streamline density |
| `grid_density` | float | 1.0 | Grid point density |

For the complete parameter reference, read: `references/api_reference.md`

## Workflow Summary

```
Spatial Transcriptomics Data (AnnData + spatial coords)
    │
    ├─ Step 0: Verify adata.obsm['spatial'] exists
    ├─ Step 1: Discuss goals with user (scope, platform, database, organism)
    │
    ├─ Step 2: Preprocessing
    │   ├─ normalize_total + log1p
    │   ├─ Select L-R database (CellChat / CellPhoneDB / custom)
    │   └─ Filter L-R pairs by gene detection
    │
    ├─ Step 3: Core COMMOT inference
    │   └─ ct.tl.spatial_communication(adata, dis_thr=..., heteromeric=True, pathway_sum=True)
    │
    ├─ Step 4: Cluster-level summary
    │   ├─ ct.tl.cluster_communication (label permutation)
    │   └─ ct.tl.cluster_communication_spatial_permutation (spatial permutation)
    │
    ├─ Step 5: Signaling direction
    │   ├─ ct.tl.communication_direction
    │   └─ ct.pl.plot_cell_communication (cell/grid/stream)
    │
    ├─ Step 6: Cluster communication visualization
    │   ├─ ct.pl.plot_cluster_communication_network
    │   └─ ct.pl.plot_cluster_communication_dotplot
    │
    ├─ Step 7: Downstream (optional)
    │   ├─ Communication impact (partial_corr / tree-based)
    │   ├─ Communication-dependent genes (tradeSeq)
    │   ├─ Spatial autocorrelation of signaling
    │   └─ Group similar communication patterns
    │
    └─ Step 8: Custom visualization + report
```

## Reference Files

- `references/api_reference.md` — Complete function-by-function API documentation with all parameters
- `references/parameter_guide.md` — Detailed parameter tuning guide with platform-specific recommendations
- `references/methods_comparison.md` — COMMOT vs CellChat vs CellPhoneDB vs Squidpy ligrec vs LIANA+
- `references/troubleshooting.md` — Common errors, edge cases, and solutions
- `examples/basic_visium.py` — Complete Visium analysis script
- `examples/basic_merfish.py` — Complete MERFISH analysis script
- `examples/downstream_analysis.py` — Communication impact, DEG detection, grouping

## Quantified Minimums

- Distance threshold `dis_thr` must be set (not None) — the most critical parameter
- At least 500 spatial locations after QC for reliable statistics
- Use `n_permutations ≥ 500` for cluster-level p-values (≥1000 for publication)
- Filter L-R pairs to those with `min_cell_pct ≥ 0.05` (5% of cells expressing)
- Report: which database, distance threshold, OT parameters, and number of significant pairs
- Save intermediate AnnData at each major step for reproducibility
- Produce dual-format figures (PNG + PDF) for all key visualizations

## Key References

| Topic | Citation | DOI |
|-------|----------|-----|
| **COMMOT method** | Cang et al., *Nat Methods* 2023 | 10.1038/s41592-022-01728-4 |
| **CellChatDB** | Jin et al., *Nat Commun* 2021 | 10.1038/s41467-021-21246-9 |
| **CellPhoneDB v4.0** | Efremova et al., *Nat Protoc* 2020 | 10.1038/s41596-020-0292-x |
| **Optimal Transport** | Peyré & Cuturi, *Foundations and Trends* 2019 | 10.1561/2200000073 |
