# COMMOT Troubleshooting Guide

## Installation Issues

### Problem: `pip install commot` fails with dependency conflicts

**Cause:** COMMOT v0.0.3 has strict dependency requirements that may conflict with newer packages.

**Solution:**
```bash
# Create a dedicated environment
conda create -n commot python=3.9 -y
conda activate commot
pip install commot

# If pot version conflicts:
pip install "pot>=0.8.0,<0.10" commot --no-deps
pip install anndata scanpy pandas numpy scipy scikit-learn networkx leidenalg plotly matplotlib seaborn
```

### Problem: tradeSeq R integration fails

**Cause:** Requires specific R and package versions.

**Solution:**
```bash
# Install exact tested versions
pip install "rpy2==3.4.2" "anndata2ri==1.0.6"

# In R (version 3.6.3):
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("tradeSeq", version = "3.10")
```

If R integration can't be fixed, use `communication_impact()` (Python-only) instead of `communication_deg_detection()`.

---

## Data Preparation Issues

### Problem: No L-R pairs pass filtering

**Symptoms:** `filter_lr_database()` returns empty DataFrame.

**Diagnosis:**
```python
# Check gene name format
print(adata.var_names[:10])
# Check database gene names
print(df_ligrec.head())

# Check if gene names match
from commot.preprocessing import _get_gene_idx
# Genes in data but not database
db_genes = set(df_ligrec.iloc[:,0].tolist() + df_ligrec.iloc[:,1].tolist())
data_genes = set(adata.var_names)
missing = db_genes - data_genes
print(f"Database genes missing from data: {len(missing)} / {len(db_genes)}")
```

**Common causes and fixes:**

| Cause | Symptom | Fix |
|-------|---------|-----|
| Mouse data with human gene names | 0% match | Set `species='mouse'` in `ligand_receptor_database()` |
| Ensembl IDs instead of symbols | 0% match | Convert: `adata.var['gene_symbols']` → `adata.var_names` |
| Gene names have different case | ~50% match | `adata.var_names = adata.var_names.str.upper()` (human) or `.str.capitalize()` (mouse) |
| Version suffixes (e.g., "TGFb1.1") | Some missing | Strip suffixes: `adata.var_names = [g.split('.')[0] for g in adata.var_names]` |

**Quick fix:** Lower the filter threshold:
```python
df_ligrec = ct.pp.filter_lr_database(df_ligrec, adata, min_cell_pct=0.01)
```

### Problem: `adata.obsm['spatial']` not found

**Cause:** Spatial coordinates stored under a different key.

**Diagnosis:**
```python
print(adata.obsm.keys())
# Common alternatives: 'X_spatial', 'spatial_2d', 'coords'
```

**Fix:**
```python
adata.obsm['spatial'] = adata.obsm['X_spatial']
```

### Problem: Coordinates are in 3D

**Cause:** Some platforms (e.g., Stereo-seq) include Z coordinate.

**Fix:**
```python
adata.obsm['spatial'] = adata.obsm['spatial'][:, :2]  # Use only X, Y
```

---

## Runtime Issues

### Problem: Out of memory on large datasets

**Cause:** Distance matrix is O(n²) dense matrix.

**Solutions (in order of effectiveness):**

1. **Subset to a tissue region:**
```python
# Select a region of interest
mask = (adata.obsm['spatial'][:, 0] > 1000) & (adata.obsm['spatial'][:, 0] < 3000)
adata_sub = adata[mask].copy()
```

2. **Pre-compute sparse distance matrix:**
```python
from scipy.spatial import distance_matrix
from scipy.sparse import csr_matrix
dist = distance_matrix(adata.obsm['spatial'], adata.obsm['spatial'])
dist[dist > dis_thr] = 0  # Threshold
adata.obsp['spatial_distance'] = csr_matrix(dist)
del dist  # Free memory
```

3. **Reduce LR pairs:**
```python
# Filter more aggressively or select specific pathways
df_ligrec = df_ligrec[df_ligrec.iloc[:, 2].isin(['TGFb', 'WNT', 'EGF'])]
```

4. **Reduce iterations:**
```python
ct.tl.spatial_communication(adata, ..., cot_nitermax=3000)
```

### Problem: Computation is very slow

**Estimated runtimes:**
| Cells | LR Pairs | Dis_thr | Time (approx) |
|-------|----------|---------|---------------|
| 1,000 | 50 | 250 | ~30 sec |
| 3,000 | 100 | 250 | ~5 min |
| 5,000 | 200 | 250 | ~20 min |
| 10,000 | 200 | 250 | ~1.5 hr |
| 20,000+ | 200+ | 250 | Several hours |

**Speed-up strategies:**
1. Reduce `cot_nitermax` to 3000-5000
2. Use fewer LR pairs (filter to specific pathways)
3. Subset to regions of interest
4. Use `cot_weights=(1.0, 0, 0, 0)` for global COT only (skip other levels)

---

## Result Interpretation Issues

### Problem: All signaling scores are near zero

**Diagnosis:**
```python
sender = adata.obsm['commot-cellchat-sum-sender']
print(sender.describe())
# Check if 's-total-total' column has non-zero values
```

**Possible causes:**
1. `dis_thr` too small — cells can't reach any neighbors
   ```python
   dists = scipy.spatial.distance_matrix(adata.obsm['spatial'], adata.obsm['spatial'])
   print(f"Median nearest-neighbor distance: {np.median(np.sort(dists, axis=1)[:, 1]):.1f}")
   print(f"Set dis_thr > {np.percentile(dists[dists > 0], 50):.1f}")
   ```

2. `cot_rho` too low — solver doesn't transport enough mass
   - Increase `cot_rho` to 15-20

3. Expression too low — genes filtered out
   - Lower `min_cell_pct` in `filter_lr_database`

### Problem: Every cell signals to every other cell (no spatial pattern)

**Cause:** `dis_thr` too large relative to tissue size.

**Fix:** Reduce `dis_thr` to 2-5× the median nearest-neighbor distance.

### Problem: Signaling direction vectors appear random/chaotic

**Diagnosis:**
```python
# Check if signaling is spatially structured
import squidpy as sq
sq.gr.spatial_autocorr(adata, genes=['s-total-total'])  # Won't work directly, but concept
```

**Fixes:**
1. Increase `k` in `communication_direction()` from 5 to 10-15
2. Use `plot_method='stream'` for smoother visualization
3. Use `plot_method='grid'` with `grid_knn=10` for interpolated view
4. Enable spatial smoothing: `smooth=True, smth_eta=50-100`

### Problem: Heteromeric complexes not found

**Symptoms:** Complexes like `TGFBR1_TGFBR2` show zero signaling.

**Diagnosis:**
```python
# Check if all subunits are present
for gene in ['TGFBR1', 'TGFBR2']:
    if gene in adata.var_names:
        n_expr = (adata[:, gene].X > 0).sum()
        print(f"{gene}: {n_expr} cells expressing ({100*n_expr/adata.n_obs:.1f}%)")
    else:
        print(f"{gene}: NOT FOUND in data")
```

**Fix:** If subunit genes are missing from the data, the complex cannot be scored. Consider:
1. Using `heteromeric_rule='ave'` (more permissive)
2. Removing that LR pair from the database
3. Checking if gene names differ (case, synonyms)

---

## Visualization Issues

### Problem: `plot_cell_communication` shows empty plot

**Cause:** `communication_direction()` not run first.

**Fix:**
```python
ct.tl.communication_direction(adata, database_name='cellchat', pathway_name='TGFb')
ct.pl.plot_cell_communication(adata, database_name='cellchat', pathway_name='TGFb')
```

### Problem: Arrows too small/large in vector field

**Fix:** Adjust `scale` parameter:
```python
# Longer arrows
ct.pl.plot_cell_communication(adata, ..., scale=0.5)

# Shorter arrows
ct.pl.plot_cell_communication(adata, ..., scale=2.0)
```

### Problem: Streamplot fails with "grid must be regular" error

**Cause:** Non-uniform spatial coordinates.

**Fix:** Use `plot_method='grid'` instead, or subsample to a regular grid:
```python
ct.pl.plot_cell_communication(adata, ..., plot_method='grid', grid_density=0.5)
```

---

## Edge Cases

### Multiple spatial libraries (multi-section Visium)

COMMOT treats all cells as a single spatial field. If you have multiple sections:
```python
# Option A: Run separately per section
for section in adata.obs['section_id'].unique():
    mask = adata.obs['section_id'] == section
    adata_sec = adata[mask].copy()
    ct.tl.spatial_communication(adata_sec, ...)

# Option B: Run on all cells (may connect across sections — usually wrong)
# Only if sections are from the same tissue with overlapping coordinates
```

### Very small datasets (<100 cells)

COMMOT may produce unreliable results. Consider:
1. Using Squidpy ligrec instead (permutation-based, works with small n)
2. Reducing `n_permutations` for cluster-level tests
3. Interpreting results as exploratory only

### Missing `pathway` column in custom database

If providing a 2-column DataFrame (ligand, receptor only):
```python
# Add a dummy pathway column
df_ligrec['pathway'] = 'custom'
# Or use 3 columns from the start
```
