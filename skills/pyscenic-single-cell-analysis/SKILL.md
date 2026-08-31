---
name: pyscenic-single-cell-analysis
description: "pySCENIC gene regulatory network inference from scRNA-seq data. Use when running pySCENIC/SCENIC on scRNA-seq data (regulon inference, AUCell)."
---

# Overview

Core workflow (3 steps):
- GRN inference: infer TF -> target links from expression
- cisTarget pruning: keep targets supported by TF motif enrichment (cisTarget databases)
- AUCell scoring: score regulon activity per cell

Raw counts vs normalized data (critical):
- Raw counts are the integer UMI/read counts from sequencing (no log1p, no scaling, no CPM/TPM/RPKM).
- If you run pySCENIC on normalized/log-transformed values, GRN inference is often distorted.
- In Scanpy, this typically means using `adata.raw.X` (if it stores raw counts) or a dedicated raw-count layer created before normalization.

This skill does NOT cover:
- SCENIC+ (region-based / ATAC-seq integrated analysis)

# Workflow

Install:
```bash
pip install pyscenic==0.12.1
```

Download required databases (see full list + mouse equivalents in `docs/DATABASES.md`).

Run the pipeline in this order. The runnable, parameterized CLI commands are in `resources/templates/pyscenic_cli_workflow.sh` (edit the DB paths at the top).

1) Validate gene symbols BEFORE running (prevents "0 regulons" silent failures):
```bash
python scripts/validate_genes.py --expression expr_mat.loom --database hg38_10kbp*.feather
```
If overlap is low (<80%), fix gene IDs (Ensembl vs HGNC/MGI, version suffixes, wrong species) before proceeding.

2) GRN inference (`pyscenic grn`) → `adjacencies.tsv`.

3) cisTarget pruning (`pyscenic ctx`) → `regulons.csv`. Completion criterion: `regulons.csv` must be non-empty; if empty, stop and run `scripts/validate_genes.py`.

4) AUCell scoring (`pyscenic aucell`) → `auc_mtx.loom`.

Keep intermediate files (`adjacencies.tsv`, `regulons.csv`) for debugging.

# Python API

Adapt `resources/templates/pyscenic_python_workflow.py` (grnboost2 → modules_from_adjacencies → prune2df/df2regulons → aucell).

# Scanpy integration

Attach AUC values to `adata.obsm` — see `resources/templates/scanpy_integration.py`.

# Reference

- Databases (Human + Mouse, URLs, checksums, download commands): `docs/DATABASES.md`
- Troubleshooting (0 regulons, memory errors, wrong input layer, etc.): `docs/TROUBLESHOOTING.md`
- Gene symbol validation script: `scripts/validate_genes.py`

Versions:
- pySCENIC: 0.12.1
- cisTarget DBs: mc_v10_clust (feather v2)
