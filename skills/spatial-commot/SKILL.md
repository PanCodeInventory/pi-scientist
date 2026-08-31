---
name: spatial-commot
description: "COMMOT — spatial cell-cell communication via collective optimal transport. Use when the user wants spatial CCC, signaling direction vector fields, or communication-dependent genes. Use instead of scanpy-cellcommunication when spatial coordinates matter."
---

# Spatial-COMMOT: Spatial Cell-Cell Communication via Collective Optimal Transport

Infer cell-cell communication (CCC) in spatial transcriptomics data using COMMOT — a method that models signaling as a collective optimal transport problem under a **spatial constraint**. Unlike CellChat or CellPhoneDB, which ignore spatial information, COMMOT restricts signaling to nearby cells and handles multi-species ligand-receptor competition through optimal transport theory.

**Citation:** Cang Z, Zhao Y, Almet AA, et al. "Screening cell–cell communication in spatial transcriptomics via collective optimal transport." *Nature Methods* 20, 218–228 (2023). DOI: [10.1038/s41592-022-01728-4](https://doi.org/10.1038/s41592-022-01728-4)

**Package:** `commot` v0.0.3 | PyPI: `pip install commot` | [GitHub](https://github.com/zcang/COMMOT) | [Docs](https://commot.readthedocs.io/)

**Related methods:** CellChatDB — Jin et al., *Nat Commun* 2021, DOI [10.1038/s41467-021-21246-9](https://doi.org/10.1038/s41467-021-21246-9) · CellPhoneDB v4.0 — Efremova et al., *Nat Protoc* 2020, DOI [10.1038/s41596-020-0292-x](https://doi.org/10.1038/s41596-020-0292-x) · Optimal Transport — Peyré & Cuturi, *Foundations and Trends* 2019, DOI [10.1561/2200000073](https://doi.org/10.1561/2200000073)

## When to Use COMMOT vs Other CCC Methods

COMMOT is the right tool when the data has a **spatial constraint** (coordinates exist and proximity drives signaling), when you need signaling direction vector fields, or when ligand-receptor competition matters. For the full comparison matrix (COMMOT vs CellChat vs CellPhoneDB vs Squidpy ligrec vs LIANA+) and when to choose each, read `references/methods_comparison.md`.

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

**Done when:** `adata.obsm['spatial']` exists, expression is log1p-normalized, and the data has ≥500 spatial locations after QC (or you have redirected the user to scanpy-cellcommunication).

## Step 1: Clarify Analysis Goals with the User

Always discuss with the user before running analysis.

**Q1 — Analysis scope:**
> "What spatial communication analysis do you want to perform?"
> - A) **Full screening**: Infer all L-R interactions across all cell types (broad discovery)
> - B) **Pathway-focused**: Investigate specific signaling pathways (e.g., TGF-β, WNT, EGF)
> - C) **Cell type pair**: Communication between specific cell types (e.g., fibroblast → tumor)
> - D) **Signaling direction**: Map the direction of signaling flows across tissue
> - E) **Communication impact**: Identify genes whose expression depends on signaling strength

**Q2 — Platform and distance:**
> "What spatial platform is this data from?" (Determines the distance threshold `dis_thr` — read the platform table in `references/parameter_guide.md` for the mapping.)

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

**Done when:** the user has answered Q1 and Q2 at minimum, and you have written down the chosen scope, platform, `dis_thr`, database, and species.

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

**Done when:** `df_ligrec` is non-empty after filtering (at least one LR pair passes `min_cell_pct ≥ 0.05`). If it is empty, read `references/troubleshooting.md` ("No L-R pairs pass filtering") before proceeding.

## Step 3: Infer Spatial Communication

### Basic Inference

```python
ct.tl.spatial_communication(
    adata,
    database_name='cellchat',     # identifier for storage keys
    df_ligrec=df_ligrec,
    dis_thr=250,                  # set from the platform table in references/parameter_guide.md
    heteromeric=True,             # enable complex handling (e.g., TGFBR1_TGFBR2)
    heteromeric_rule='min',       # 'min' = all subunits must be expressed (conservative)
    pathway_sum=True,             # sum signaling per pathway (enables pathway-level analysis)
)
```

Set `dis_thr` from the platform table in `references/parameter_guide.md` (the single source of truth for platform→`dis_thr`). For tuning the OT solver parameters (`cot_eps_p`, `cot_rho`, `cot_nitermax`, `cot_weights`, `smooth`, `cost_type`), read `references/parameter_guide.md`.

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

**Done when:** `dis_thr` is set (not None), and `adata.obsp['commot-{db}-total-total']` and `adata.obsm['commot-{db}-sum-sender']` exist with at least one LR pair having non-zero signaling.

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

**Done when:** cluster-level results are stored in `adata.uns` with `n_permutations ≥ 500` (label permutation; ≥1000 for publication) and the `dis_thr` used matches Step 3.

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

**Done when:** direction vectors exist in `adata.obsm['commot-{db}-direction-sender']` and `adata.obsm['commot-{db}-direction-receiver']`, and at least one plot file has been written.

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

**Done when:** both `cluster_network.pdf` and `cluster_dotplot.pdf` exist on disk.

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

**Done when:** each chosen downstream analysis has produced its output (e.g., `df_impact` non-empty, `df_deg`/`df_yhat` returned, or the autocorrelation p-value computed).

## Step 8: Custom Visualization and Report

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

**Done when:** the report states the database, `dis_thr`, OT parameters, and number of significant pairs; intermediate AnnData has been saved at each major step; and all key figures exist in both PNG and PDF.

## Troubleshooting

If a run fails — `filter_lr_database` returns empty, `dis_thr` is mis-scaled, computation is too slow, memory errors, or plots come out empty — read `references/troubleshooting.md` for the diagnosis and fix.

## Parameter Reference

For the complete function-by-function API (all parameters and defaults), read `references/api_reference.md`. For tuning guidance (how to choose `dis_thr`, `cot_eps_p`, `cot_rho`, `cot_nitermax`, smoothing, heteromeric rules), read `references/parameter_guide.md`.

## Reference Files

- `references/api_reference.md` — Complete function-by-function API documentation with all parameters
- `references/parameter_guide.md` — Parameter tuning guide, including the platform→`dis_thr` table
- `references/methods_comparison.md` — COMMOT vs CellChat vs CellPhoneDB vs Squidpy ligrec vs LIANA+
- `references/troubleshooting.md` — Common errors, edge cases, and solutions
- `examples/basic_visium.py` — Complete Visium analysis script
- `examples/basic_merfish.py` — Complete MERFISH analysis script
- `examples/downstream_analysis.py` — Communication impact, DEG detection, grouping
- `assets/analysis_template.py` — Minimal runnable template (fill in config, run end-to-end)
- `scripts/setup_environment.sh` — Creates a conda environment with all dependencies
