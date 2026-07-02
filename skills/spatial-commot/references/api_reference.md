# COMMOT API Reference

Complete function-by-function API documentation for the `commot` package v0.0.3.

## Module: `ct.pp` (Preprocessing)

### `ct.pp.ligand_receptor_database(database, species, ...)`

Load a built-in ligand-receptor interaction database.

**Parameters:**
- `database` (str): `'CellChat'` or `'CellPhoneDB_v4.0'`
- `species` (str): `'human'`, `'mouse'`, or `'zebrafish'` (CellChat only)
- `signaling_type` (str, optional): `'Secreted Signaling'`, `'Cell-Cell Contact'`, `'ECM-Receptor'`, or `None` (all types)
- `heteromeric_delimiter` (str): Delimiter for complex subunits, default `'_'`

**Returns:** DataFrame with 3 columns: ligand, receptor, pathway

**Databases:**
| Database | Species | Approximate Pairs |
|----------|---------|-------------------|
| CellChatDB | human | ~2,000 |
| CellChatDB | mouse | ~2,000 |
| CellChatDB | zebrafish | ~1,500 |
| CellPhoneDB v4.0 | human | ~1,000 |
| CellPhoneDB v4.0 | mouse | ~1,000 |

**Usage:**
```python
df_ligrec = ct.pp.ligand_receptor_database(
    database='CellChat',
    species='human',
    signaling_type='Secreted Signaling',
)
```

---

### `ct.pp.filter_lr_database(df_ligrec, adata, ...)`

Filter L-R pairs based on gene expression detection in the dataset.

**Parameters:**
- `df_ligrec` (DataFrame): Output from `ligand_receptor_database()` or custom DataFrame
- `adata` (AnnData): Expression data
- `heteromeric` (bool): Whether complexes are present, default `False`
- `heteromeric_delimiter` (str): Complex subunit delimiter, default `'_'`
- `heteromeric_rule` (str): `'min'` or `'ave'` for complex expression
- `filter_criteria` (str): `'min_cell_pct'` or `'min_cell'`
- `min_cell_pct` (float): Minimum fraction of cells expressing, default `0.05`
- `min_cell` (int): Minimum number of cells expressing, default `100`

**Returns:** Filtered DataFrame

```python
df_filtered = ct.pp.filter_lr_database(
    df_ligrec, adata,
    heteromeric=True,
    filter_criteria='min_cell_pct',
    min_cell_pct=0.05,
)
```

---

### `ct.pp.infer_spatial_information(adata_sc, adata_sp, ...)`

Map scRNA-seq data onto spatial coordinates using structured optimal transport (from Cang & Nie 2020). Used when spatial data lacks gene coverage.

**Parameters:**
- `adata_sc` (AnnData): Single-cell RNA-seq reference
- `adata_sp` (AnnData): Spatial transcriptomics data
- `cost_sc_sp` (ndarray, optional): Cost matrix between sc and spatial cells
- `cost_sc` (ndarray, optional): Cost matrix within sc cells
- `cost_sp` (ndarray, optional): Cost matrix within spatial cells
- `ot_alpha` (float): Structured OT weight, default `0.2`
- `ot_rho` (float): Unbalanced penalty, default `0.05`
- `ot_epsilon` (float): Entropy regularization, default `0.01`

---

## Module: `ct.tl` (Tools)

### `ct.tl.spatial_communication(adata, database_name, df_ligrec, ...)`

**Main function**: Infer cell-cell communication via collective optimal transport.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `adata` | AnnData | — | Must have `.obsm['spatial']` and normalized `.X` |
| `database_name` | str | None | Name for storage keys (e.g., `'cellchat'`) |
| `df_ligrec` | DataFrame | None | L-R pairs (3 columns: ligand, receptor, pathway) |
| `pathway_sum` | bool | False | Sum signaling per pathway |
| `heteromeric` | bool | False | Handle protein complexes |
| `heteromeric_rule` | str | 'min' | 'min' (conservative) or 'ave' (average) |
| `heteromeric_delimiter` | str | '_' | Subunit separator in complex names |
| `dis_thr` | float/dict | None | Spatial distance threshold. Scalar for all pairs, or dict `{(lig,rec): threshold}` |
| `cost_scale` | dict | None | Per-pair cost weights `{(lig,rec): weight}` |
| `cost_type` | str | 'euc' | 'euc' or 'euc_square' |
| `cot_eps_p` | float | 0.1 | Entropy regularization for transport plan |
| `cot_eps_mu` | float | None | Entropy for unmatched source (=eps_p if None) |
| `cot_eps_nu` | float | None | Entropy for unmatched target (=eps_p if None) |
| `cot_rho` | float | 10.0 | Penalty for unmatched mass |
| `cot_nitermax` | int | 10000 | Maximum OT iterations |
| `cot_weights` | tuple | (0.25,0.25,0.25,0.25) | Weights for 4 COT levels |
| `smooth` | bool | False | Spatial expression smoothing |
| `smth_eta` | float | None | Smoothing kernel bandwidth |
| `smth_nu` | float | None | Smoothing kernel sharpness |
| `smth_kernel` | str | 'exp' | 'exp' or 'lorentz' kernel |
| `copy` | bool | False | Return copy vs in-place |

**Output in AnnData:**
- `adata.obsp['commot-{db}-{lig}-{rec}']`: Sparse cell×cell transport matrix
- `adata.obsp['commot-{db}-{pathway}']`: Pathway-level transport (if `pathway_sum=True`)
- `adata.obsp['commot-{db}-total-total']`: Total signaling
- `adata.obsm['commot-{db}-sum-sender']`: DataFrame of sender marginals
- `adata.obsm['commot-{db}-sum-receiver']`: DataFrame of receiver marginals
- `adata.uns['commot-{db}-info']`: Metadata dict

---

### `ct.tl.communication_direction(adata, database_name, ...)`

Compute signaling direction vector fields from the transport plans.

**Parameters:**
- `adata` (AnnData): With communication already inferred
- `database_name` (str): Database name matching `spatial_communication`
- `pathway_name` (str, optional): Specific pathway
- `lr_pair` (tuple, optional): Specific LR pair as `(ligand, receptor)`
- `k` (int): Number of nearest neighbors for direction computation, default `5`
- `pos_idx` (ndarray): Coordinate indices for 2D plotting, default `np.array([0,1])`
- `copy` (bool): Return copy

**Output:** Adds direction vectors to `adata.obsm['commot-{db}-direction-sender']` and `adata.obsm['commot-{db}-direction-receiver']`

---

### `ct.tl.cluster_communication(adata, database_name, ...)`

Summarize cell-level communication to cluster-level with label permutation p-values.

**Parameters:**
- `adata` (AnnData)
- `database_name` (str)
- `pathway_name` (str, optional)
- `lr_pair` (tuple, optional)
- `clustering` (str): Column in `adata.obs` with cluster labels
- `n_permutations` (int): Number of permutations, default `100`
- `random_seed` (int): Random seed, default `1`
- `copy` (bool)

**Output:** Stored in `adata.uns` with cluster-level communication scores and p-values.

---

### `ct.tl.cluster_communication_spatial_permutation(adata, df_ligrec, database_name, ...)`

Cluster-level CCC with spatial permutation (more rigorous than label permutation).

**Parameters:** All parameters from `spatial_communication` plus:
- `clustering` (str): Cluster column
- `perm_type` (str): `'within_cluster'` or `'all_cell'`
- `n_permutations` (int): Default `100`
- `random_seed` (int): Default `1`
- `verbose` (bool): Default `True`
- `cot_nitermax` (int): Default `100` (lower for permutation speed)

---

### `ct.tl.communication_impact(adata, database_name, ...)`

Analyze the impact of signaling on gene expression.

**Parameters:**
- `adata` (AnnData)
- `database_name` (str)
- `pathway_name` (str, optional)
- `pathway_sum_only` (bool): Default `False`
- `method` (str): `'partial_corr'`, `'semipartial_corr'`, or `'treebased_score'`
- `corr_method` (str): `'spearman'` or `'pearson'`
- `tree_method` (str): `'rf'` or `'gbt'`
- `tree_ntrees` (int): Default `100`
- `tree_repeat` (int): Default `100`
- `tree_max_depth` (int): Default `5`

**Returns:** DataFrame with impact scores per (signaling component, target gene) pair

---

### `ct.tl.communication_deg_detection(adata, database_name, ...)`

Identify communication-dependent genes using GAM (tradeSeq).

**Requires:** R ≥ 3.6.3, tradeSeq 1.0.1, rpy2 3.4.2, anndata2ri 1.0.6

**Parameters:**
- `adata` (AnnData)
- `database_name` (str)
- `pathway_name` (str, optional)
- `summary` (str): `'receiver'` or `'sender'`
- `lr_pair` (tuple): Default `('total', 'total')`
- `nknots` (int): GAM knots, default `6`
- `n_var_genes` (int, optional): Number of variable genes to test
- `n_deg_genes` (int, optional): Top genes to return
- `n_points` (int): Smoothing points, default `50`
- `deg_pvalue_cutoff` (float): Default `0.05`

**Returns:** Tuple of (df_deg, df_yhat) — DEG statistics and fitted values

---

### `ct.tl.communication_spatial_autocorrelation(adata, keys, ...)`

Moran's I test for spatial autocorrelation of signaling vector fields.

**Parameters:**
- `adata` (AnnData)
- `keys` (list): Communication keys to test
- `method` (str): Default `'Moran'`
- `normalize_vf` (bool): Default `False`
- `summary` (str): `'sender'` or `'receiver'`
- `weight_k` (int): Default `10`
- `n_permutations` (int): Default `999`

---

### `ct.tl.cluster_position(adata, clustering, ...)`

Assign spatial positions to clusters for network visualization.

**Parameters:**
- `adata` (AnnData)
- `clustering` (str): Cluster column
- `method` (str): `'geometric_mean'` or `'representative_point'`

---

### `ct.tl.group_cluster_communication(adata, clustering, ...)`

Group LR pairs by similarity of their cluster-level communication patterns.

**Parameters:**
- `adata` (AnnData)
- `clustering` (str)
- `dissimilarity_method` (str): `'jaccard'`, `'jaccard_weighted'`, or `'global_structure'`
- `leiden_k` (int): Default `5`
- `leiden_resolution` (float): Default `1.0`

---

### `ct.tl.group_cell_communication(adata, keys, ...)`

Group cell-level communication networks.

**Parameters:**
- `adata` (AnnData)
- `keys` (list)
- `dissimilarity_method` (str): `'graphwave'`
- `bin_method` (str): `'gaussian_mixture'` or `'kmeans'`
- `leiden_k` (int): Default `2`

---

## Module: `ct.pl` (Plotting)

### `ct.pl.plot_cell_communication(adata, database_name, ...)`

Plot spatial signaling direction vector fields.

**Key Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `adata` | AnnData | — | With communication + direction computed |
| `database_name` | str | None | Database name |
| `pathway_name` | str | None | Pathway to plot |
| `lr_pair` | tuple | None | Specific LR pair |
| `keys` | list | None | Multiple keys to average |
| `plot_method` | str | 'cell' | 'cell' (quiver), 'grid' (interpolated), 'stream' (streamlines) |
| `background` | str | 'summary' | 'summary', 'cluster', or 'image' |
| `background_legend` | bool | False | Show background legend |
| `clustering` | str | None | Cluster column (for background='cluster') |
| `summary` | str | 'sender' | 'sender' or 'receiver' background coloring |
| `cmap` | str | 'coolwarm' | Colormap |
| `cluster_cmap` | dict | None | Custom cluster→color mapping |
| `pos_idx` | ndarray | [0,1] | Spatial coordinate indices |
| `ndsize` | float | 1 | Node size |
| `scale` | float | 1.0 | Arrow scale (smaller = longer) |
| `normalize_v` | bool | False | Normalize vectors to uniform length |
| `normalize_v_quantile` | float | 0.95 | Quantile for normalization |
| `arrow_color` | str | '#333333' | Arrow color |
| `grid_density` | float | 1.0 | Grid density (for grid method) |
| `grid_knn` | int | None | KNN for grid interpolation |
| `grid_scale` | float | 1.0 | Grid kernel scale |
| `grid_thresh` | float | 1.0 | Grid interpolation threshold |
| `grid_width` | float | 0.005 | Grid arrow width |
| `stream_density` | float | 1.0 | Streamline density |
| `stream_linewidth` | float | 1 | Streamline width |
| `stream_cutoff_perc` | float | 5 | Percentile cutoff for weak vectors |
| `filename` | str | None | Save path (e.g., 'plot.pdf') |
| `ax` | Axes | None | Existing matplotlib axes |

**Returns:** matplotlib Axes object

---

### `ct.pl.plot_cluster_communication_network(adata, uns_names, clustering, ...)`

Network graph showing cluster-to-cluster communication.

**Parameters:**
- `adata` (AnnData)
- `uns_names` (list): Keys in `adata.uns` with cluster communication results
- `clustering` (str): Cluster column

---

### `ct.pl.plot_cluster_communication_dotplot(adata, database_name, clustering, ...)`

Dotplot matrix of cluster pairs × LR pairs.

**Parameters:**
- `adata` (AnnData)
- `database_name` (str)
- `clustering` (str): Cluster column

---

### `ct.pl.plot_communication_dependent_genes(df_deg, df_yhat, ...)`

Heatmap of signaling-dependent gene expression patterns.

**Parameters:**
- `df_deg`: DEG statistics from `communication_deg_detection`
- `df_yhat`: Fitted values from `communication_deg_detection`

---

### `ct.pl.plot_communication_impact(df_impact, ...)`

Heatmap of communication impact scores.

**Parameters:**
- `df_impact`: DataFrame from `communication_impact`
