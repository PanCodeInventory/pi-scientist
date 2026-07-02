# Parameter Selection Guide for scRNA-seq Analysis

> **来源依据**: This guide synthesizes parameter recommendations from authoritative sources:
> - [sc-best-practices.org](https://www.sc-best-practices.org) (Theis lab, 2024+)
> - Luecken & Theis (2019) _Mol Syst Biol_ 15:8746 — "Current best practices in single-cell RNA-seq analysis"
> - Scanpy official tutorials & API docs
> - Galaxy Training Network scRNA-seq tutorials
> - scverse/scanpy GitHub discussions (issues #3497, #2780, #935)
> - Germain et al. (2020) _Genome Biology_ — pipeComp benchmarking
> - chooseR (2021) _BMC Bioinformatics_ — clustering parameter selection via subsampling robustness

---

## Decision Flow: How to Choose Parameters

Use this decision tree to systematically determine parameters. For each step, check the data characteristics and follow the recommendation.

```
DATA LOADED
│
├─ STEP 1: QC THRESHOLDS
│  ├─ What's the tissue type?
│  │  ├─ PBMC/blood → MT% < 8-10%, min_genes ≥ 200
│  │  ├─ Brain/neurons → MT% < 5% (neurons have naturally low MT)
│  │  ├─ Tumor → MT% can be higher; use MAD-based adaptive filtering
│  │  └─ Other → Use MAD-based (5 MAD for counts/genes, 3 MAD for MT%)
│  └─ Dataset size?
│     ├─ <5K cells → manual inspection + conservative filtering
│     └─ >5K cells → MAD-based automatic filtering
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
│
├─ STEP 4: PCA COMPONENTS (n_pcs)
│  ├─ Check sc.pl.pca_variance_ratio(adata, log=True)
│  │  ├─ Elbow at ∼10 PCs → use 15-20 PCs
│  │  ├─ Elbow at ∼20 PCs → use 30-40 PCs
│  │  └─ Elbow at ∼50+ PCs → use 50 PCs (data is complex)
│  ├─ General rule: capture 85-90% variance
│  └─ Default starting point: n_pcs=30 (for PBMC-sized data), n_pcs=50 (for complex tissues)
│
├─ STEP 5: NEIGHBORS (n_neighbors)
│  ├─ Cell count?
│  │  ├─ <5K cells → n_neighbors=10-15
│  │  ├─ 5K–30K cells → n_neighbors=15 (default)
│  │  ├─ 30K–100K cells → n_neighbors=20-30
│  │  └─ >100K cells → n_neighbors=30-50
│  └─ Goal: capture global structure → higher (30+)
│     Goal: capture fine subtypes → lower (10-15)
│
├─ STEP 6: CLUSTERING RESOLUTION
│  ├─ Expected cell types?
│  │  ├─ Few types (e.g., 3-5) → resolution=0.3-0.5
│  │  ├─ Moderate (5-15 types) → resolution=0.5-1.0
│  │  └─ Many types (>15, e.g., brain) → resolution=1.0-2.0
│  └─ Always try multiple: [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]
│     → Inspect each with sc.pl.umap(color='leiden_r{X}')
│     → Choose resolution that separates known populations without over-splitting
│
└─ STEP 7: DIFFERENTIAL EXPRESSION
   ├─ Default: sc.tl.rank_genes_groups(adata, 'leiden', method='wilcoxon')
   ├─ For publication: method='wilcoxon' (recommended by sc-best-practices)
   └─ For speed on large data: method='t-test'
```

---

## 1. Quality Control Parameters

### 1.1 Cell-Level QC

| Parameter | Recommended Range | How to Choose | Source |
|-----------|------------------|---------------|--------|
| `min_genes` | 200–1000 | Check violin plot of `n_genes_by_counts`. Set threshold where density drops sharply. Blood/PBMC: 200-500; complex tissues: 500-1000 | Luecken & Theis 2019 |
| `min_cells` | 3–10 | Conservative: 3. Stringent: 10. Genes in <3 cells provide no statistical power | scanpy default |
| `pct_counts_mt` | 5–20% | PBMC: 5-8%. Tumor/stressed tissue: up to 20%. Use MAD-based automated threshold when possible. Check scatter plot of MT% vs total_counts | sc-best-practices.org |
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
adata.obs["mt_outlier"] = is_outlier(adata, "pct_counts_mt", 3) | (
    adata.obs["pct_counts_mt"] > 8  # hard cap at 8%
)
adata = adata[(~adata.obs.outlier) & (~adata.obs.mt_outlier)].copy()
```

**Key principle**: Be permissive. Filter out only clear outliers. You can always re-filter after annotation.

### 1.3 Tissue-Specific QC Tips

| Tissue | MT% cutoff | Notes |
|--------|-----------|-------|
| PBMC / Blood | 5–10% | Standard reference; well-characterized |
| Brain / Neurons | 5% | Neurons have naturally low MT expression |
| Heart / Muscle | 10–20% | Cardiomyocytes have high mitochondrial content — don't over-filter |
| Tumor | 10–20% | High metabolic activity = higher MT; use MAD-based |
| Liver | 10–15% | Hepatocytes are metabolically active |
| Pancreas | 5–10% | Exocrine cells may have higher MT |

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

### 2.1 Data Storage Timing (CRITICAL)

The order of operations determines what data is available to downstream tools.
Follow this exact sequence:

```
 ① Load data              adata.X = raw counts
 │
 ② adata.layers["counts"] = adata.X.copy()    ← BEFORE normalize
 │   adata.X = raw counts (unchanged)
 │   adata.layers["counts"] = raw counts (frozen copy)
 │
 ③ sc.pp.normalize_total(adata)
 │   sc.pp.log1p(adata)
 │   adata.X = log-normalized (all genes)
 │   adata.layers["counts"] = raw counts (unchanged) ✅
 │
 ④ adata.raw = adata                            ← AFTER log1p, BEFORE subset
 │   adata.raw = frozen snapshot of log-norm (all genes + var)
 │
 ⑤ sc.pp.highly_variable_genes(adata)
 │   adata.X = log-normalized (all genes, HVG flagged)
 │
 ⑥ adata = adata[:, adata.var.highly_variable]  ← subset happens here
 │   adata.X = log-normalized (HVG only)
 │   adata.layers["counts"] = raw counts (HVG only) ⚠️ genes lost!
 │   adata.raw = log-normalized (ALL genes) ✅ preserved
 │
 ⑦ sc.pp.scale(adata, max_value=10)
     adata.X = scaled (HVG only)
     adata.layers["counts"] = raw counts (HVG only)
     adata.raw = log-normalized (ALL genes) ✅
```

**Which tier to use for which downstream tool:**

| Downstream Tool | Data Source | Why |
|----------------|-------------|-----|
| scVI / scANVI | `adata.layers["counts"]` | Negative binomial model requires raw counts |
| DESeq2 (pseudobulk) | `adata.layers["counts"]` | Needs raw counts for NB test |
| sctransform | `adata.layers["counts"]` | Models raw counts directly |
| PCA / UMAP / Leiden | `adata.X` | Uses scaled HVG matrix |
| Dotplot / Heatmap | `adata.raw` (via `use_raw=True`) | Needs full gene set for markers |
| Marker gene check | `adata.raw` | Markers may not be in HVG list |
| SoupX / cellbender | `adata.layers["counts"]` | Ambient RNA correction needs raw matrix |

---

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
sc.pp.highly_variable_genes(adata, n_top_genes=2000)
sc.pl.highly_variable_genes(adata)  # Check: most HVGs should have log(mean) > 0.01
```

If >90% of genes are flagged as HV (blue in the plot), increase `min_disp`. If <10% are flagged, decrease `min_mean`.

### 3.3 n_top_genes by Application

| Application | n_top_genes | Rationale |
|-------------|-------------|-----------|
| Exploratory analysis | 2000 | Fast, captures most biological signal |
| Detailed cell atlas | 3000–5000 | More genes = finer substructure detection |
| Trajectory/pseudotime | 2000–3000 | Balance between signal and noise |
| Gene regulatory network | 3000–5000 | Need broader gene coverage for TF-target inference |
| scVI / deep learning | 2000–4000 | Input feature count; higher = more memory |

---

## 4. Dimensionality Reduction

### 4.1 PCA: Number of Components (n_pcs)

**Primary decision rule**: Use the elbow plot.

```python
sc.tl.pca(adata, svd_solver='arpack')
sc.pl.pca_variance_ratio(adata, log=True, n_pcs=50)
```

**Heuristics** (fallback when elbow is ambiguous):

| Dataset complexity | Recommended n_pcs | Indicator |
|-------------------|-------------------|-----------|
| Simple (PBMC, sorted cells) | 15–30 | Few distinct cell types; elbow sharp at <15 PCs |
| Moderate (tissue biopsy) | 30–40 | Multiple cell types; elbow at 15–30 PCs |
| Complex (brain, tumor, atlas) | 40–50 | Many cell types; elbow at 30–50+ PCs |
| Large atlas (>100K cells) | 50–100 | Consider computing PCs on a subset first |

**From sc-best-practices.org**: "The number of PCs is commonly set to the number of PCs that explain 90% or 95% of variance in your data."

### 4.2 UMAP Parameters

| Parameter | Default | Recommendation |
|-----------|---------|---------------|
| `n_neighbors` | 15 | See Section 5 below |
| `min_dist` | 0.5 | 0.1–0.5: lower = tighter clusters; 0.5–1.0: higher = more spread |
| `spread` | 1.0 | Increase to 2-5 for very large datasets |
| `random_state` | 0 | Always set for reproducibility |

### 4.3 t-SNE Parameters

| Parameter | Default | Recommendation |
|-----------|---------|---------------|
| `perplexity` | 30 | 5–50: lower emphasizes local structure; higher emphasizes global. Default 30 works for most. Rule: perplexity < n_cells/3 |

---

## 5. Neighborhood Graph: n_neighbors

This is one of the most impactful parameters. It controls the trade-off between local detail and global structure.

### 5.1 Decision Table

| n_cells | n_neighbors | Rationale |
|---------|-------------|-----------|
| <1,000 | 5–10 | Very small dataset; need to capture any structure |
| 1,000–5,000 | 10–15 | Standard range for small datasets |
| 5,000–30,000 | 15 (default) | scanpy default; works well for PBMC-scale data |
| 30,000–100,000 | 20–30 | More cells = more neighbors needed for stable graph |
| >100,000 | 30–50 | Atlas-scale; emphasize global structure |

### 5.2 Goal-Dependent Tuning

| Goal | n_neighbors | Effect |
|------|-------------|--------|
| Detect fine subtypes | 5–15 | Higher resolution of small populations |
| Map global relationships | 30–50 | Smoother embeddings; continuum preserved |
| Balance (standard) | 15–20 | Good for most analyses |

### 5.3 How to Test

Try 3 values and visually inspect UMAP:

```python
for n in [10, 15, 30]:
    sc.pp.neighbors(adata, n_neighbors=n, n_pcs=30, key_added=f'neighbors_n{n}')
    sc.tl.umap(adata, neighbors_key=f'neighbors_n{n}')
    sc.pl.umap(adata, color='leiden', title=f'n_neighbors={n}')
```

**Signs n_neighbors is too low**: Many tiny disconnected clusters; UMAP looks fragmented.
**Signs n_neighbors is too high**: Clusters merge together; loss of distinct populations.

---

## 6. Clustering Resolution

### 6.1 Leiden Resolution Guide

| Resolution | Expected # Clusters | Typical Use Case |
|-----------|---------------------|------------------|
| 0.2–0.3 | 3–5 | Very coarse: major lineages only |
| 0.4–0.6 | 5–10 | Standard PBMC: major immune types |
| 0.6–0.8 | 10–15 | Subtype detection within lineages |
| 0.8–1.2 | 15–25 | Detailed subtypes; tissue-resident populations |
| 1.2–2.0 | 25–50+ | Fine substructure; brain cell atlas |
| >2.0 | 50+ | Very fine; may over-split; use with caution |

### 6.2 Systematic Resolution Testing

**Always test multiple resolutions**:

```python
for res in [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]:
    sc.tl.leiden(adata, resolution=res, key_added=f'leiden_r{res}')

# Compare visually
sc.pl.umap(adata, color=[f'leiden_r{r}' for r in [0.5, 0.8, 1.0, 1.5]], ncols=2)
```

### 6.3 How to Pick the Right Resolution

Ask these questions:
1. **Are known marker genes cleanly separated?** — check `sc.pl.dotplot(adata, marker_genes, groupby='leiden_r{X}')`
2. **Are clusters merging that should be separate?** — resolution too low
3. **Are single populations splitting into many clusters?** — resolution too high
4. **Do DEGs between neighboring clusters make biological sense?** — if not, merge or lower resolution

### 6.4 Automated Resolution Selection

Python tools for automatic resolution selection:

```python
# Method 1: scib — optimizes clustering against known labels or metrics
import scib
best_res = scib.metrics.cluster_optimal_resolution(
    adata, cluster_key='leiden',
    resolutions=[0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]
)
```

**chooseR** (R package): Uses subsampling-based robustness metrics. Run clustering at each resolution on subsamples; assess cluster stability. Choose resolution with best stability.

---

## 7. Differential Expression Parameters

| Parameter | Recommendation | Source |
|-----------|---------------|--------|
| `method` | `'wilcoxon'` | Recommended for publication; non-parametric, robust |
| `method` (alternative) | `'t-test'` | Faster for large datasets; assumes normality |
| `method` (advanced) | `'logreg'` | Logistic regression; can include covariates |
| `n_genes` | All (default) | Filter p-values post-hoc |
| `corr_method` | `'benjamini-hochberg'` | Standard FDR correction |

**When to use which method**:
- Most cases → `method='wilcoxon'` (recommended by sc-best-practices)
- Very large data (>200K cells) → `method='t-test'` or `method='t-test_overestim_var'`
- With batch/condition covariates → `method='logreg'`
- Publication figures → `method='wilcoxon'`

---

## 8. Quick-Reference Cheat Sheet

### Standard PBMC Workflow (2,700 cells)

```python
# QC
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
adata = adata[adata.obs.pct_counts_mt < 5, :]

# Normalization
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# HVG
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# PCA → Neighbors → UMAP
sc.tl.pca(adata, svd_solver='arpack', n_comps=50)
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
adata = adata[adata.obs.pct_counts_mt < 20, :]  # permissive

# HVG
sc.pp.highly_variable_genes(adata, n_top_genes=4000, batch_key='sample')

# PCA → Neighbors
sc.tl.pca(adata, svd_solver='arpack', n_comps=100)
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
sc.tl.pca(adata, n_comps=20)  # limited by n_cells
sc.pp.neighbors(adata, n_neighbors=5, n_pcs=10)  # lower for small data

# Clustering
sc.tl.leiden(adata, resolution=0.3)  # start coarse
```

---

## 9. Parameter Validation Checklist

Before finalizing your analysis, verify:

- [ ] **QC**: Visualized QC metrics (violin, scatter) before and after filtering
- [ ] **PCA**: Checked elbow plot; n_pcs captures ≥85% variance
- [ ] **Neighbors**: Tested 2-3 n_neighbors values; UMAP doesn't look fragmented
- [ ] **Clustering**: Tested ≥4 resolutions; clusters are biologically interpretable
- [ ] **Markers**: Top DEGs per cluster match known cell type markers
- [ ] **Batch**: If multi-sample, checked that clusters aren't purely batch-driven
- [ ] **Doublets**: Applied doublet detection and removed likely doublets
- [ ] **Reproducibility**: Set random_state for PCA, neighbors, UMAP, leiden

---

## 10. References

1. Luecken MD, Theis FJ. "Current best practices in single-cell RNA-seq analysis: a tutorial." _Mol Syst Biol._ 2019;15(6):e8746. doi:10.15252/msb.20188746
2. sc-best-practices.org — Theis lab, continuously updated best practices
3. Wolf FA, Angerer P, Theis FJ. "SCANPY: large-scale single-cell gene expression data analysis." _Genome Biol._ 2018;19(1):15.
4. Germain PL, Sonrel A, Robinson MD. "pipeComp, a general framework for the evaluation of computational pipelines, reveals performant single cell RNA-seq preprocessing tools." _Genome Biol._ 2020;21(1):227.
5. Patterson-Cross RB, et al. "Selecting single cell clustering parameter values using subsampling-based robustness metrics." _BMC Bioinformatics._ 2021;22:39. (chooseR)
6. Traag VA, Waltman L, van Eck NJ. "From Louvain to Leiden: guaranteeing well-connected communities." _Sci Rep._ 2019;9:5233.
