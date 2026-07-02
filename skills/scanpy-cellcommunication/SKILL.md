---
name: scanpy-cellcommunication
description: 'Cell-cell communication (CCC) inference from single-cell data. Two approaches: CellChat (R, pathway-level visualization, probabilistic modeling) and LIANA+ (Python, multi-method consensus scoring across 8+ methods). Use this AFTER scanpy-cluster and scanpy-annotate when cell types are known. Triggered by: cell-cell communication, 细胞通讯, 配体受体, ligand-receptor, intercellular communication, cellchat, liana, CellPhoneDB, NATMI, CCC inference, signaling network, 细胞互作, LR interaction, cell communication analysis, run CellChat, run LIANA, 信号通路推断.'
---

# Scanpy-CellCommunication: Cell-Cell Communication Inference

## Overview

Infer ligand-receptor interactions between cell types from scRNA-seq data. Two complementary approaches:

| | CellChat | LIANA+ |
|---|----------|--------|
| **Language** | R | Python |
| **Approach** | Probabilistic model + pathway analysis | Multi-method consensus (8+ methods) |
| **Strengths** | Rich pathway-level visualization, signaling role analysis | Robust consensus scoring, method comparison |
| **Best for** | Deep biological interpretation of specific pathways | Comprehensive discovery, method benchmarking |
| **Environment** | `mamba activate cellchat` | `pip install liana` or mamba |

Both require annotated cell types — run **scanpy-annotate** first.

## Method Selection

```
           Want pathway-level insight?
                  /              \
                YES                NO
                 |                  |
          Use CellChat         Want Python?
          (R-based)               /      \
                                YES       NO
                                 |         |
                           Use LIANA+   Use CellChat
                           (consensus)  (default)
```

**When to use CellChat**: Deep signaling pathway dissection, publication-quality network diagrams, comparative analysis across conditions with pathway-centric insight.

**When to use LIANA+**: Quick discovery in Python ecosystem, method comparison/validation, spatial transcriptomics, when you need consensus across CellPhoneDB + CellChat + NATMI + other methods simultaneously.

## Step 0: Gather Requirements

Before running any analysis, **always ask the user** to clarify their intent. The same data can be analyzed in fundamentally different ways depending on the biological question. Adapt question wording to the user's language (Chinese or English).

**Q1 — Analysis goal:**
> "What do you want to learn from cell communication analysis?"
>
> - A) Discovery: find all significant interactions between all cell types (broad screening)
> - B) Targeted: check if specific cell types communicate (e.g., T cells → tumor cells)
> - C) Pathway-focused: investigate a specific signaling pathway (e.g., TGF-β, WNT, Notch)
> - D) Condition comparison: compare communication between two conditions/treatments

**Q2 — Cell types of interest:**
> "Which cell types are you interested in?"
>
> - All pairs (source × target = all combinations)
> - Specific sources (which cell types send signals?)
> - Specific targets (which cell types receive signals?)
> - Specific pairs (e.g., Macrophage → T cells only)

If the AnnData is accessible, first list the available cell types from `adata.obs['cell_type'].unique()` before asking.

**Q3 — Technical direction:**
> "Which approach?"
>
> - A) CellChat (R) — deeper pathway analysis, richer viz, but requires R
> - B) LIANA+ (Python) — multi-method consensus, stays in Python, but less pathway detail
> - C) Both — run LIANA+ first for discovery, then CellChat for validation/highlights

**Q4 — Organism (if not auto-detected):**
> "Human or mouse?" (Determines database: CellChatDB.human vs CellChatDB.mouse / LIANA+ resource)

Base your recommendations on the answers:
- Goal A (discovery) + Python preference → LIANA+ with all cell type pairs
- Goal C (pathway) → CellChat with that pathway
- Goal D (comparison) → run independently per condition, then compare
- Small dataset (<5 cell types) → either works; large dataset (>15 types) → LIANA+ is faster

Do NOT proceed to run analysis until the user has answered at minimum Q1 and Q2.

## CellChat (R)

### Setup

```bash
mamba activate cellchat
R
```

```r
library(CellChat)
library(Seurat)
library(dplyr)
```

### Quick Workflow

```r
# 1. Create CellChat object
data.input <- GetAssayData(seurat_obj, slot = "data")
meta <- seurat_obj@meta.data
cellchat <- createCellChat(object = data.input, meta = meta, group.by = "cell_type")

# 2. Set database (human or mouse)
cellchat@DB <- CellChatDB.human

# 3. Preprocess
cellchat <- subsetData(cellchat)
cellchat <- identifyOverExpressedGenes(cellchat)
cellchat <- identifyOverExpressedInteractions(cellchat)

# 4. Infer communication
cellchat <- computeCommunProb(cellchat, raw.use = TRUE)
cellchat <- filterCommunication(cellchat, min.cells = 10)

# 5. Visualize
cellchat <- aggregateNet(cellchat)
groupSize <- as.numeric(table(cellchat@idents))
netVisual_circle(cellchat@net$count, vertex.weight = groupSize)

# Bubble plot
netVisual_bubble(cellchat, remove.isolate = TRUE)

# 6. Pathway analysis
cellchat <- netAnalysis_computeCentrality(cellchat, slot.name = "netP")
netVisual_aggregate(cellchat, signaling = "WNT", layout = "circle")
```

### Key Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `raw.use` | TRUE | Use raw counts for communication probability |
| `min.cells` | 10 | Minimum cells to filter interactions |
| `population.size` | TRUE | Account for cell population size |
| `type` | "triMean" | Expression aggregation method |

### Common Visualizations

```r
# Chord diagram
netVisual_chord_cell(cellchat, signaling = "TGFb")

# Heatmap of signaling roles
netAnalysis_signalingRole_heatmap(cellchat, pattern = "outgoing")

# Comparative analysis (condition1 vs condition2)
netVisual_diffInteraction(cellchat1, cellchat2)
```

### Troubleshooting

NMF install fails:
```r
Sys.setenv(R_REMOTES_NO_ERRORS_FROM_WARNINGS = "true")
devtools::install_github("renozao/NMF")
```

For detailed workflow, read: `references/workflow-detailed.md`

## LIANA+ (Python)

### Setup

```bash
pip install liana
# or: mamba install -c conda-forge liana
```

### Quick Workflow

```python
import scanpy as sc
import liana as li

# Load annotated data (must have cell_type in obs)
adata = sc.read_h5ad("annotated_data.h5ad")

# Run consensus across all methods
liana_res = li.mt.rank_aggregate(
    adata,
    groupby='cell_type',
    resource_name='consensus',
    expr_prop=0.1,        # min fraction of cells expressing gene
    use_raw=True,          # use raw counts
    n_perms=1000,
    verbose=True,
)

# Results: ligand, receptor, source, target, magnitude_rank, specificity_rank
```

### Visualize

```python
# Dot plot (top interactions)
li.pl.dotplot(
    liana_res,
    uns_keys=['magnitude_rank', 'specificity_rank'],
    source_labels=['B cells', 'CD4 T cells'],
    target_labels=['CD8 T cells', 'NK cells'],
)

# Chord diagram
li.pl.chord_graph(liana_res,
    source_labels=['B cells', 'CD4 T cells'],
    target_labels=['CD8 T cells', 'NK cells'],
)

# Method agreement tile plot
li.pl.tileplot(liana_res,
    source_labels=['B cells'], target_labels=['CD8 T cells'],
)
```

### Consensus Scoring

Two complementary metrics:

- **`magnitude_rank`**: Overall communication strength (lower = stronger). Combines expression level + interaction probability across methods.
- **`specificity_rank`**: How specific the interaction is to this source-target pair (lower = more specific).

Filter for robust hits:
```python
top = liana_res[(liana_res['magnitude_rank'] < 0.05) &
                (liana_res['specificity_rank'] < 0.05)]
```

### Available Methods in LIANA+

| Method | Score Column | Description |
|--------|-------------|-------------|
| CellPhoneDB | `cellphonedb` | Permutation-based statistical testing |
| CellChat | `cellchat` | Probabilistic model (same method, Python wrapper) |
| NATMI | `natmi` | Weighted expression product |
| Connectome | `connectome` | Edge specificity scoring |
| log2FC | `log2fc` | Fold-change based |
| Consensus | (meta) | Rank aggregation across all methods |

### Spatial Analysis

```python
# Spatial bivariate analysis
li.mt.bivar(adata, groupby='cell_type',
            resource_name='consensus', use_raw=True)
```

### Key Parameters

| Parameter | Default | When to Adjust |
|-----------|---------|----------------|
| `expr_prop` | 0.1 | Raise to 0.2 for noisy data; lower to 0.05 for rare cell types |
| `n_perms` | 1000 | Increase for publication (>1000); decrease for quick tests |
| `min_cells` | 5 | Raise if cell types have <10 cells |
| `resource_name` | 'consensus' | Use 'cellphonedb' or 'cellchatdb' for single-resource analysis |

## Shared Best Practices

1. **Always use raw counts**: Both methods expect un-normalized expression. Set `use_raw=TRUE` / `use_raw=True`.
2. **Filter small cell populations**: Groups with <10 cells produce unreliable statistics. Merge or remove them first.
3. **Validate with known biology**: Cross-reference top interactions against literature for the tissue/cell types under study.
4. **Check gene symbols**: CellChat uses Seurat gene names; LIANA+ expects HGNC symbols. Convert if needed.
5. **Compare conditions separately**: Run analysis on each condition independently, then compare — don't mix conditions in a single run.
6. **Method consensus > single method**: LIANA+ consensus scores are more robust than any individual method. If using CellChat alone, validate key findings with at least one orthogonal approach.

## Common Pitfalls

1. **Missing cell type annotations**: Both methods require labeled cells — run scanpy-annotate first
2. **Gene symbol mismatches**: Human vs mouse databases have different gene names
3. **expr_prop too strict**: Setting >0.3 filters out real rare interactions
4. **Over-interpreting isolated hits**: Single strong interactions without biological context may be noise — prioritize pathways with multiple supported interactions
5. **Forgetting population.size**: In CellChat, not accounting for population size inflates interactions from abundant cell types

## Next Steps

After identifying communication networks:
- **scanpy-de** — check if key ligands/receptors are differentially expressed
- **gene-prognosis-scan** — clinical relevance of identified signaling genes
- **pySCENIC** — TF activity driving the signaling programs
