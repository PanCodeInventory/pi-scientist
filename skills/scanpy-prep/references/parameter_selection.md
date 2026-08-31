# Parameter Selection Guide for scRNA-seq Analysis

> **Compatibility**: The full-gene workflow requires Scanpy ≥1.10 because PCA uses `mask_var`. The `seurat_v3` and `seurat_v3_paper` flavors also require `scikit-misc` (`scanpy[skmisc]`).
>
> **来源依据**: This guide synthesizes parameter recommendations from authoritative sources:
> - [sc-best-practices.org](https://www.sc-best-practices.org) (Theis lab, 2024+)
> - Luecken & Theis (2019) _Mol Syst Biol_ 15:8746 — "Current best practices in single-cell RNA-seq analysis"
> - Scanpy official tutorials & API docs
> - Galaxy Training Network scRNA-seq tutorials
> - scverse/scanpy GitHub discussions (issues #3497, #2780, #935)
> - Germain et al. (2020) _Genome Biology_ — pipeComp benchmarking
> - chooseR (2021) _BMC Bioinformatics_ — clustering parameter selection via subsampling robustness

---

## Contents

1. [Decision Flow](#decision-flow-how-to-choose-parameters)
2. [Quality Control Parameters](#1-quality-control-parameters)
3. [Normalization Parameters](#2-normalization-parameters)
4. [Highly Variable Gene Selection](#3-highly-variable-gene-selection)
5. [Quick-Reference Workflows](#4-quick-reference-cheat-sheet)
6. [Validation Checklist](#5-parameter-validation-checklist)
7. [References](#6-references)

## Decision Flow: How to Choose Parameters

Use this decision tree to systematically determine parameters. For each step, check the data characteristics and follow the recommendation.

```
DATA LOADED
│
├─ STEP 1: QC THRESHOLDS
│  ├─ Perform QC per sample; distributions can differ substantially by batch
│  ├─ Default → permissive MAD filtering
│  │  ├─ 5 MADs for counts/genes/top-gene fraction
│  │  └─ 3 MADs for mitochondrial fraction
│  ├─ Inspect QC metrics jointly before removing cells
│  └─ Add a tissue-informed MT% hard cap only when biologically justified
│     └─ Use the single table in §1.3 as a starting point, not a universal rule
│
├─ STEP 2: NORMALIZATION
│  ├─ UMI data → sc.pp.normalize_total(target_sum=1e4) + sc.pp.log1p
│  ├─ Full-length (Smart-seq2) → Consider scran or sctransform
│  └─ Large datasets (>100K) → target_sum=1e4 is fine, or use 1e5 for deeper coverage
│
├─ STEP 3: HVG SELECTION
│  ├─ How many cells?
│  │  ├─ <5K cells → n_top_genes=2000
│  │  ├─ 5K–50K cells → n_top_genes=2000–3000
│  │  └─ >50K cells → n_top_genes=3000–5000
│  └─ Batch effects?
│     └─ Yes → use batch_key= parameter

```

---

## 1. Quality Control Parameters

### 1.1 Cell-Level QC

| Parameter | Recommended Range | How to Choose | Source |
|-----------|------------------|---------------|--------|
| `min_genes` | 200–1000 | Check violin plot of `n_genes_by_counts`. Set threshold where density drops sharply. Blood/PBMC: 200-500; complex tissues: 500-1000 | Luecken & Theis 2019 |
| `min_cells` | 3–10 | Conservative: 3. Stringent: 10. Genes in <3 cells provide no statistical power | scanpy default |
| `pct_counts_mt` | no universal cutoff | Apply per-sample 3-MAD detection by default; optionally add a justified hard cap from §1.3 | sc-best-practices.org |
| `max_genes` | 2500–6000 | Remove potential doublets with unusually high gene counts. Check upper tail of `n_genes_by_counts` distribution | scanpy PBMC tutorial |

### 1.2 MAD-Based Automatic Filtering (Recommended)

Per [sc-best-practices.org](https://www.sc-best-practices.org), use Median Absolute Deviation for objective thresholding:

```python
from scipy.stats import median_abs_deviation

def is_outlier(adata, metric: str, nmads: int):
    M = adata.obs[metric]
    outlier = (M < np.median(M) - nmads * median_abs_deviation(M)) | (
        np.median(M) + nmads * median_abs_deviation(M) < M
    )
    return outlier

# Apply: 5 MADs for counts/genes — permissive
adata.obs["outlier"] = (
    is_outlier(adata, "log1p_total_counts", 5)
    | is_outlier(adata, "log1p_n_genes_by_counts", 5)
    | is_outlier(adata, "pct_counts_in_top_20_genes", 5)
)
# 3 MADs for mitochondrial fraction — more stringent
adata.obs["mt_outlier"] = is_outlier(adata, "pct_counts_mt", 3)

# Optional only when justified for the tissue/sample; no universal default
mt_hard_cap = None
if mt_hard_cap is not None:
    adata.obs["mt_outlier"] |= adata.obs["pct_counts_mt"] > mt_hard_cap

adata = adata[(~adata.obs.outlier) & (~adata.obs.mt_outlier)].copy()
```

**Key principle**: Be permissive. Filter out only clear outliers. You can always re-filter after annotation.

### 1.3 Optional Tissue-Informed MT% Hard Caps

Use this as the **only threshold table in this skill**. Values are starting ranges for review after per-sample MAD detection, not validated universal cutoffs.

| Tissue | Illustrative hard-cap range | Notes |
|--------|-----------------------------|-------|
| PBMC / Blood | 5–10% | Inspect each sample; activated/stressed populations may differ |
| Brain / Neurons | around 5% | Avoid treating all brain cell types as identical |
| Heart / Muscle | 10–20% | Cardiomyocytes can have naturally high mitochondrial content |
| Tumor | 10–20% | Strong tissue, treatment, and viability dependence; prioritize MAD |
| Liver | 10–15% | Hepatocytes are metabolically active; inspect distributions jointly |
| Pancreas | 5–10% | Exocrine and endocrine populations can differ |

If no tissue-specific justification exists, omit the hard cap rather than silently choosing 5% or 20%.

### 1.4 Doublet Detection

- **Tools**: Scrublet (Python, `sc.pp.scrublet`), scDblFinder (R)
- Run doublet detection **per sample**, not on merged data
- Expected doublet rate ≈ 0.8% per 1,000 cells (10x Genomics formula)
- Filter out cells with doublet score > threshold (typically top N percentile)

---

## 2. Normalization Parameters

| Parameter | Value | When to Adjust |
|-----------|-------|---------------|
| `target_sum` | 10,000 (default) | Increase to 1e5 for deeper sequencing / full-length data. Decrease to 1e3 for very shallow data |
| Log transform | `sc.pp.log1p` | Standard for UMI data. For full-length, consider `scran` size factors |

**Decision guide**:
- UMI-based (10x, Drop-seq) → `normalize_total(target_sum=1e4)` + `log1p()`
- Full-length (Smart-seq2) → use `scran` size factor normalization or `sctransform`
- Want to preserve counts → save as `adata.layers["counts"]` before normalization


## 3. Highly Variable Gene Selection

### 3.1 Core Parameters

| Parameter | Default | Recommended Range | Guidance |
|-----------|---------|-------------------|----------|
| `n_top_genes` | None (all) | 2000–5000 | 2000 for simple tissues; 3000–5000 for complex tissues (brain, tumor); 5000+ for atlas-scale |
| `flavor` | `'seurat'` | `'seurat'` or `'seurat_v3'` | `seurat` is most common. `seurat_v3` better with count data. `cell_ranger` for 10x defaults |
| `min_mean` | 0.0125 | 0.0125–0.1 | Lower → include more lowly-expressed genes |
| `max_mean` | 3 | 3–8 | Higher → include more highly-expressed genes |
| `min_disp` | 0.5 | 0.5–1.0 | Higher → only keep most variable genes; lower → more genes |
| `batch_key` | None | batch column name | Essential when data has batch effects. Finds HVGs consistent across batches |

### 3.2 How to Assess HVG Selection

```python
sc.pp.highly_variable_genes(adata, n_top_genes=3000)
sc.pl.highly_variable_genes(adata)

# Keep all genes; use the mask only for PCA
sc.pp.pca(adata, n_comps=50, mask_var="highly_variable")
```

When `n_top_genes` is specified, mean and dispersion cutoffs are ignored. For `flavor="seurat_v3"`, pass integer-valued counts with `layer="counts"`; dispersion-based `flavor="seurat"` expects log-transformed data.

### 3.3 n_top_genes by Application

| Application | n_top_genes | Rationale |
|-------------|-------------|-----------|
| Exploratory analysis | 2000 | Fast, captures most biological signal |
| Detailed cell atlas | 3000–5000 | More genes = finer substructure detection |
| Trajectory/pseudotime | 2000–3000 | Balance between signal and noise |
| Gene regulatory network | 3000–5000 | Need broader gene coverage for TF-target inference |
| scVI / deep learning | 2000–4000 | Input feature count; higher = more memory |

---

## 4. Quick-Reference Cheat Sheet

### Standard PBMC Workflow (2,700 cells)

```python
# QC
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata = adata[adata.obs.pct_counts_mt < 10, :].copy()  # illustrative cap from section 1.3 (PBMC 5-10%); inspect per sample

# Normalization
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# HVG
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# PCA → Neighbors → UMAP
sc.pp.pca(adata, svd_solver='arpack', n_comps=50, mask_var='highly_variable')
sc.pp.neighbors(adata, n_neighbors=10, n_pcs=30)  # n_pcs from elbow
sc.tl.umap(adata)

# Clustering
sc.tl.leiden(adata, resolution=0.5)  # try 0.3, 0.5, 0.8
```

### Complex Tissue Atlas (100K+ cells)

```python
# QC
sc.pp.filter_cells(adata, min_genes=500)
sc.pp.filter_genes(adata, min_cells=10)
adata = adata[adata.obs.pct_counts_mt < 20, :].copy()  # only if tissue/sample review justifies this cap

# HVG
sc.pp.highly_variable_genes(adata, n_top_genes=4000, batch_key='sample')

# PCA → Neighbors
sc.pp.pca(adata, svd_solver='arpack', n_comps=100, mask_var='highly_variable')
sc.pp.neighbors(adata, n_neighbors=30, n_pcs=50)
sc.tl.umap(adata, min_dist=0.3, spread=3)

# Clustering
for res in [0.5, 0.8, 1.0, 1.5, 2.0]:
    sc.tl.leiden(adata, resolution=res, key_added=f'leiden_r{res}')
```

### Small / Specialized Dataset (<1,000 cells)

```python
# QC — be very permissive
sc.pp.filter_cells(adata, min_genes=100)
sc.pp.filter_genes(adata, min_cells=3)

# HVG
sc.pp.highly_variable_genes(adata, n_top_genes=1000, min_disp=0.3)

# PCA
sc.pp.pca(adata, n_comps=20, mask_var='highly_variable')  # limited by n_cells
sc.pp.neighbors(adata, n_neighbors=5, n_pcs=10)  # lower for small data

# Clustering
sc.tl.leiden(adata, resolution=0.3)  # start coarse
```

---

## 5. Parameter Validation Checklist

Before finalizing your analysis, verify:

- [ ] **QC**: Visualized QC metrics (violin, scatter) before and after filtering
- [ ] **PCA**: Checked elbow plot; n_pcs captures ≥85% variance
- [ ] **Neighbors**: Tested 2-3 n_neighbors values; UMAP doesn't look fragmented
- [ ] **Clustering**: Tested ≥4 resolutions; clusters are biologically interpretable
- [ ] **Markers**: Top DEGs per cluster match known cell type markers
- [ ] **Batch**: If multi-sample, checked that clusters aren't purely batch-driven
- [ ] **Doublets**: Applied doublet detection per sample and reviewed likely doublets
- [ ] **Full genes**: `adata.layers["counts"].shape == adata.shape` and `adata.n_vars > adata.var["highly_variable"].sum()`
- [ ] **Data semantics**: `.X` is full-gene log-normalized expression; `layers["counts"]` is integer-valued counts
- [ ] **Reproducibility**: Recorded package versions and set random states for stochastic steps

---

## 6. References

1. Luecken MD, Theis FJ. "Current best practices in single-cell RNA-seq analysis: a tutorial." _Mol Syst Biol._ 2019;15(6):e8746. doi:10.15252/msb.20188746
2. sc-best-practices.org — Theis lab, continuously updated best practices
3. Wolf FA, Angerer P, Theis FJ. "SCANPY: large-scale single-cell gene expression data analysis." _Genome Biol._ 2018;19(1):15.
4. Germain PL, Sonrel A, Robinson MD. "pipeComp, a general framework for the evaluation of computational pipelines, reveals performant single cell RNA-seq preprocessing tools." _Genome Biol._ 2020;21(1):227.
5. Patterson-Cross RB, et al. "Selecting single cell clustering parameter values using subsampling-based robustness metrics." _BMC Bioinformatics._ 2021;22:39. (chooseR)
6. Traag VA, Waltman L, van Eck NJ. "From Louvain to Leiden: guaranteeing well-connected communities." _Sci Rep._ 2019;9:5233.
