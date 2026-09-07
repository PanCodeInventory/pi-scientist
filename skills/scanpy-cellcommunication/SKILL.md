---
name: scanpy-cellcommunication
description: 'Cell-cell communication (CCC) inference from single-cell data. Use after cell types are annotated. Triggered by: cell-cell communication, 细胞通讯, ligand-receptor, cellchat, liana, signaling network.'
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

LIANA+ consensus scores are more robust than any single method; if using CellChat alone, validate key findings with an orthogonal approach.

Both require validated cell-type annotations. Reuse existing annotations; use **scanpy-annotate** when they are missing or need revision.

## Method Selection

One decision, made here: CellChat (R) for pathway-level insight, LIANA+ (Python) for consensus discovery.

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

**CellChat** — deep signaling pathway dissection, publication-quality network diagrams, comparative analysis across conditions with pathway-centric insight.

**LIANA+** — quick discovery in the Python ecosystem, method comparison/validation, spatial transcriptomics, consensus across CellPhoneDB + CellChat + NATMI + other methods simultaneously.

## Step 0: Inspect Inputs and Resolve Scientific Scope

The main agent normally inspects data and performs the requested analysis directly. Use the request and previous decisions first; inspect available cell types, organism, samples, and condition metadata before asking questions. No plan file or fixed questionnaire is required.

Resolve the choices that affect the biological question:
- **Goal**: broad discovery, targeted source–target interactions, a specific pathway, or condition comparison.
- **Scope**: all cell-type pairs or named sources/targets/pairs; list available labels from the relevant `adata.obs` column when clarification is needed.
- **Design**: for condition comparisons, identify the contrast, biological replicates, pairing, and potential confounders. Do not treat cells as independent biological replicates.
- **Method and organism**: reuse an agreed CellChat/LIANA+ choice and verified species. Discuss an unresolved consequential method choice; when technical selection is delegated, recommend and justify it using Method Selection above.

Clarify missing or conflicting scientific choices before the affected computation, without re-asking settled constraints or requiring a fixed number of answers. Routine implementation details can use documented defaults. Conceptual questions can be answered without starting an analysis.

Recommendations:
- Broad discovery + Python preference → LIANA+ with the requested cell-type pairs
- Pathway-focused question → CellChat with that pathway
- Condition comparison → run independently per condition, then compare while respecting sample-level replication
- Small dataset (<5 cell types) → either works; large dataset (>15 types) → LIANA+ is faster

Record the selected scope, database, expression source, and validation checks with the results; validate outputs and biological interpretation rather than relying on a successful exit alone.

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

Chord diagrams, signaling-role heatmaps, comparative diffInteraction plots, and more: read `references/visualization-guide.md`.

### Troubleshooting

NMF install failures, out-of-memory errors, empty plots, and more: read `references/troubleshooting.md`.

### Database

Custom databases, subsetting by pathway/category, gene-name mapping: read `references/database-reference.md`.

For the full CellChat pipeline (input formats, custom databases, comparative analysis), read: `references/cellchat-workflow-detailed.md`.

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

CellPhoneDB, CellChat, NATMI, Connectome, log2FC, and more — full comparison and when-to-use: read `references/methods_comparison.md`.

### Spatial Analysis

Spatial bivariate analysis (`li.mt.bivar`) and cross-validation with expression results: read `references/liana-workflow-detailed.md` (§5 Spatial Transcriptomics).

### Key Parameters

| Parameter | Default | When to Adjust |
|-----------|---------|----------------|
| `expr_prop` | 0.1 | Raise to 0.2 for noisy data; lower to 0.05 for rare cell types |
| `n_perms` | 1000 | Increase for publication (>1000); decrease for quick tests |
| `min_cells` | 5 | Raise if cell types have <10 cells |
| `resource_name` | 'consensus' | Use 'cellphonedb' or 'cellchatdb' for single-resource analysis |

For the full LIANA+ pipeline (individual methods, differential communication, custom resources), read: `references/liana-workflow-detailed.md`. Complete function signatures and parameters: read `references/api_reference.md`.

## Examples & Scripts

Runnable end-to-end scripts: `examples/` (CellChat + LIANA+ basic, comparative, spatial, Seurat integration), `scripts/` (environment setup, LIANA+ CLI), `assets/analysis_template.py` (LIANA+ template).

## Shared Best Practices

1. **Always use raw counts**: Both methods expect un-normalized expression. Set `use_raw=TRUE` / `use_raw=True`.
2. **Filter small cell populations**: Groups with <10 cells produce unreliable statistics. Merge or remove them first.
3. **Validate with known biology**: Cross-reference top interactions against literature for the tissue/cell types under study. Prioritize pathways with multiple supported interactions — single strong hits without biological context may be noise.
4. **Check gene symbols**: CellChat uses Seurat gene names; LIANA+ expects HGNC symbols. Human vs mouse databases use different gene names — convert if needed.
5. **Compare conditions separately**: Run analysis on each condition independently, then compare — don't mix conditions in a single run.

## Common Pitfalls

1. **expr_prop too strict**: Setting >0.2 filters out real rare interactions
2. **Forgetting population.size**: In CellChat, not accounting for population size inflates interactions from abundant cell types

## Next Steps

After identifying communication networks:
- **scanpy-de** — check if key ligands/receptors are differentially expressed
- **gene-prognosis-scan** — clinical relevance of identified signaling genes
- **pySCENIC** — TF activity driving the signaling programs
