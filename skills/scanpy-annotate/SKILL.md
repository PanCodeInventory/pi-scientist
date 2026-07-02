---
name: scanpy-annotate
description: 'Cell type annotation for single-cell data: from quick manual marker-based mapping to systematic evidence-driven identification with the cluster-identify pipeline. Use this AFTER scanpy-cluster when you have Leiden clusters and marker genes. Triggered by: cell type annotation, 细胞注释, 细胞类型鉴定, 这是什么细胞, annotate clusters, cell identity, cluster annotation, cell phenotyping, 分群注释, 鉴定细胞, cluster-identify, cell type identification, GO enrichment annotation, 注释细胞类型, what cell type is this, identify cell populations. For basic clustering and marker genes without annotation, use scanpy-cluster. For differential expression between conditions, use scanpy-de.'
---

# Scanpy-Annotate: Cell Type Annotation

## Overview

Systematic cell type annotation from single-cell data. Two tiers: (1) quick manual annotation for well-known cell types, (2) the cluster-identify pipeline for novel or complex populations requiring evidence-driven multi-step validation with GO/KEGG enrichment, pathway scoring, and TF activity analysis.

**Prerequisites**: Run **scanpy-prep** then **scanpy-cluster** first. The AnnData must have Leiden clusters, UMAP coordinates, and marker genes computed.

## Quick Manual Annotation

For routine analyses where cell types are well-characterized (PBMC, blood, known tissues):

```python
# Define marker genes for known cell types
marker_genes = ['CD3D', 'CD14', 'MS4A1', 'NKG7', 'FCGR3A']

# Visualize markers on UMAP
sc.pl.umap(adata, color=marker_genes, use_raw=True)
sc.pl.dotplot(adata, var_names=marker_genes, groupby='leiden')

# Manual mapping: cluster ID → cell type
cluster_to_celltype = {
    '0': 'CD4 T cells',
    '1': 'CD14+ Monocytes',
    '2': 'B cells',
    '3': 'CD8 T cells',
}
adata.obs['cell_type'] = adata.obs['leiden'].map(cluster_to_celltype)
sc.pl.umap(adata, color='cell_type', legend_loc='on data')
```

**Important**: Use at least 3 markers per cell type. Single-gene annotations are unreliable.

If cell types are unclear or novel, switch to the cluster-identify pipeline below.

## Cluster-Identify Pipeline

For complex, novel, or ambiguous populations, use the evidence-driven pipeline at `scripts/cluster_identify.py` (943 lines).

**Two analysis modes**:
- **Mode A — Cell Type Identification**: DEGs per cluster → biological inference → independent expression validation → annotated h5ad
- **Mode B — Subpopulation Characterization**: DEGs → GO/KEGG enrichment + pathway scoring (ssGSEA) + TF activity (decoupler) → functional profile report

### Environment

```bash
pip install scanpy anndata gseapy decoupler
# For PDF reports: quarto install tinytex
```

### Step 0: Inspect Data and Ask User

Always start by inspecting the h5ad:

```bash
python scripts/cluster_identify.py inspect <h5ad_path>
```

This auto-detects:
- **Organism** (human/mouse) from gene name casing and mitochondrial prefixes
- **Cluster column** (leiden, louvain, seurat_clusters, etc.)
- **Data availability** (UMAP, raw counts, number of clusters)

Then ask the user **3 questions**:

**Q1** — Confirm auto-detection:
> "Detected {n} clusters (column: '{col}'), organism: {org}. Correct?"

If organism is wrong, ask user to specify.

**Q2** — Analysis type:
> "What analysis?"
> - A) Identify cell types for all clusters
> - B) Deep characterization of specific subpopulations

**Q3** — (Only if B) Target clusters:
> "Which clusters? Available: {cluster_list}"

### Step 1: Differential Gene Expression

```bash
# Mode A: every cluster vs rest
python scripts/cluster_identify.py deg <h5ad_path> \
  --cluster-col leiden --output-dir <output_dir>

# Mode B: target clusters vs reference
python scripts/cluster_identify.py deg <h5ad_path> \
  --cluster-col leiden --output-dir <output_dir> \
  --target-clusters 3,7 --reference-clusters all
```

Saves per-cluster DEG tables to `{output_dir}/deg/`. Read the top 20 genes per cluster and form biological inferences.

### Step 2A: Cell Type Inference and Validation (Mode A)

**Part 1 — Agent Inference:**

Read each cluster's top DEGs and infer cell type using biological knowledge:

```
Cluster 0 top genes: CCR7, LEF1, IL7R, CD4, TCF7
→ Canonical naive CD4+ T cell markers
→ Inference: CD4+ Naive T cells
→ Validation genes: CD3D, CD4, CCR7
```

**Part 2 — Independent Expression Validation:**

```bash
python scripts/cluster_identify.py validate <h5ad_path> \
  --cluster-col leiden --output-dir <output_dir> \
  --genes CD3D,CD4,CCR7,MS4A1,CD14,NKG7 \
  --gene-groups "Cluster0=CD3D,CD4,CCR7" "Cluster1=MS4A1,CD79A" "Cluster2=CD14,LYZ"
```

Generates:
- `validation_plots/dotplot.pdf` — all clusters × all validation genes
- `validation_plots/feature_umap.pdf` — each gene on UMAP
- `validation_plots/violin_plots.pdf` — expression distribution per cluster

This validation is **independent** from the DEG analysis — you're checking expression in the original data to confirm your inference. If validation fails, revise and pick different genes.

### Step 2B: Subpopulation Characterization (Mode B)

For each target cluster, run three independent analyses:

**GO/KEGG enrichment** (what biological processes?):

```bash
python scripts/cluster_identify.py enrich <output_dir>/deg/cluster_X_genes.csv \
  --organism human --output-dir <output_dir>/enrichment
```

**Pathway activity scoring** (what signaling state?):

```bash
python scripts/cluster_identify.py gsva <h5ad_path> \
  --cluster-col leiden --target-clusters 3,7 --output-dir <output_dir>/pathway
```

**TF activity inference** (what regulators drive it?):

```bash
python scripts/cluster_identify.py tf <h5ad_path> \
  --cluster-col leiden --organism human --output-dir <output_dir>/tf
```

### Step 3: Compile Results

Create an `annotations.csv` with columns:
- `cluster`: cluster ID
- `identity`: inferred cell type
- `confidence`: high / medium / needs_review
- `evidence`: brief evidence chain
- `representative_genes`: validation genes used

Then generate the report:

```bash
python scripts/cluster_identify.py report <output_dir> \
  --annotations annotations.csv --h5ad <h5ad_path>
```

Generates `cluster_identity_report.pdf` and `cluster_identity_report.md`.

Present the annotation results to the user. **Do NOT automatically write back.**

### Step 4: Write Back to h5ad (Only When User Confirms)

When the user explicitly requests to save:

```bash
python scripts/cluster_identify.py write <h5ad_path> \
  --annotations annotations.csv --cluster-col leiden \
  --output annotated.h5ad
```

Adds to `obs`: `cluster_identity`, `identity_confidence`. Original data is never modified.

## Gene Set Scoring

```python
# Score cells for custom gene sets
gene_set = ['CD3D', 'CD3E', 'CD3G']
sc.tl.score_genes(adata, gene_set, score_name='T_cell_score')
sc.pl.umap(adata, color='T_cell_score')
```

## Gene Set Sources

| Gene Set | Source | Citation |
|----------|--------|----------|
| GO terms | gseapy → Enrichr/GO | Gene Ontology Consortium |
| KEGG pathways | gseapy → KEGG | Kanehisa et al., 2012 |
| Hallmark pathways | MSigDB via gseapy | Liberzon et al., 2015 |
| TF regulons | CollecTRI via decoupler | Muller et al., Nat Commun 2023 |

## Common Pitfalls

1. **Single-marker annotation**: Annotating cell types based on one gene — use at least 3 markers per cell type
2. **Skipping validation**: Inferring cell type from DEGs without checking expression in original data — the cluster-identify pipeline enforces independent validation with the `validate` subcommand
3. **Auto-writing to h5ad**: Never write annotations without user confirmation — always present results first and wait for the user to approve
4. **Mode confusion**: Mode A (cell type identification) and Mode B (subpopulation characterization) are different questions — don't mix their outputs
5. **Annotation at wrong resolution**: Cell types may be apparent at coarser resolutions but lost at finer ones — try multiple Leiden resolutions before annotating

## Next Steps

After annotation:
- **scanpy-de** — differential expression between conditions within annotated cell types
- **CellChat Analysis** — cell-cell communication between annotated populations
- **pySCENIC** — TF regulon analysis on annotated subpopulations
