---
name: pyscenic-single-cell-analysis
description: "Guide pySCENIC gene regulatory network inference from scRNA-seq data. Use when analyzing transcription factor activity, inferring regulons, running SCENIC pipeline, or calculating AUCell scores. Covers Human and Mouse with CLI and Python API."
---

# Overview

pySCENIC infers transcription factor (TF) activity and gene regulatory networks from single-cell RNA-seq (scRNA-seq) expression matrices.

Core workflow (3 steps):
- GRN inference: infer TF -> target links from expression
- cisTarget pruning: keep targets supported by TF motif enrichment (cisTarget databases)
- AUCell scoring: score regulon activity per cell

Key concepts:
- Regulon: a TF plus its predicted target genes (after motif-based pruning)
- AUCell score: per-cell enrichment score of a regulon's targets

Raw counts vs normalized data (critical):
- Raw counts are the integer UMI/read counts from sequencing (no log1p, no scaling, no CPM/TPM/RPKM).
- If you run pySCENIC on normalized/log-transformed values, GRN inference is often distorted.
- In Scanpy, this typically means using `adata.raw.X` (if it stores raw counts) or a dedicated raw-count layer created before normalization.

This skill does NOT cover:
- SCENIC+ (region-based / ATAC-seq integrated analysis)
- Creating custom cisTarget databases
- Nextflow/VSN pipeline orchestration

# Quick Start

Install:
```bash
pip install pyscenic==0.12.1
```

Download required databases (see full list + mouse equivalents in `docs/DATABASES.md`).

Minimal CLI run (Human hg38 example):
```bash
# Step 1: GRN
pyscenic grn --num_workers 20 -o adjacencies.tsv expr_mat.loom allTFs_hg38.txt

# Step 2: cisTarget
pyscenic ctx adjacencies.tsv hg38_10kbp*.feather \
  --annotations_fname motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl \
  --expression_mtx_fname expr_mat.loom \
  --output regulons.csv \
  --num_workers 20

# Step 3: AUCell
pyscenic aucell expr_mat.loom regulons.csv -o auc_mtx.loom --num_workers 20
```

# Detailed Instructions

1) Validate gene symbols BEFORE running (prevents "0 regulons" silent failures):
```bash
python scripts/validate_genes.py \
  --expression expr_mat.loom \
  --database hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather
```
If overlap is low (<80%), fix gene IDs (Ensembl vs HGNC/MGI, version suffixes, wrong species) before proceeding.

2) Full CLI workflow tips:
- Use `--num_workers` based on RAM; the `ctx` step is typically the memory bottleneck.
- Start with a single ranking database (10kb) first; add more only after you get sensible regulons.
- Keep intermediate files (`adjacencies.tsv`, `regulons.csv`) for debugging.

3) Python API workflow (outline):
```python
from arboreto.algo import grnboost2
from pyscenic.utils import modules_from_adjacencies
from pyscenic.prune import prune2df, df2regulons
from pyscenic.aucell import aucell

# 1) grnboost2(...) -> adjacencies
# 2) modules_from_adjacencies(...) -> modules
# 3) prune2df(...) + df2regulons(...) -> regulons
# 4) aucell(...) -> per-cell regulon activity
```

4) Scanpy integration (common pattern):
- Run pySCENIC to produce AUC values, then attach to `adata.obsm` (see `resources/templates/scanpy_integration.py`).

# Reference

- Databases (Human + Mouse, URLs, checksums, download commands): `docs/DATABASES.md`
- Troubleshooting (0 regulons, memory errors, wrong input layer, etc.): `docs/TROUBLESHOOTING.md`
- Gene symbol validation script: `scripts/validate_genes.py`
- Templates: `resources/templates/`

Versions:
- pySCENIC: 0.12.1
- cisTarget DBs: mc_v10_clust (feather v2)
