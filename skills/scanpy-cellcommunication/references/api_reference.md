# LIANA+ API Quick Reference

## Module Overview

LIANA+ is organized into three main modules:
- **`liana.mt`** — Methods: CCC inference methods and consensus ranking
- **`liana.pl`** — Plotting: Publication-ready visualizations
- **`liana.rs`** — Resources: Ligand-receptor resource management

---

## `liana.mt` — Methods Module

### `liana.mt.rank_aggregate`

Primary function: Run consensus CCC analysis across multiple methods.

```python
liana.mt.rank_aggregate(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'consensus',
    lr_resource: Optional[pd.DataFrame] = None,
    expr_prop: float = 0.1,
    use_raw: bool = True,
    n_perms: int = 1000,
    min_cells: int = 5,
    return_all_lrs: bool = False,
    seed: int = 0,
    verbose: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `adata` | AnnData | required | Annotated data matrix |
| `groupby` | str | required | Column in `adata.obs` for cell grouping |
| `resource_name` | str | `'consensus'` | Name of LR resource to use |
| `lr_resource` | DataFrame | None | Custom LR resource (overrides `resource_name`) |
| `expr_prop` | float | `0.1` | Min expression proportion per group |
| `use_raw` | bool | `True` | Use `adata.raw.X` |
| `n_perms` | int | `1000` | Permutations for CellPhoneDB |
| `min_cells` | int | `5` | Minimum cells per group |
| `return_all_lrs` | bool | `False` | Return all LR pairs regardless of expression |
| `seed` | int | `0` | Random seed |
| `verbose` | bool | `True` | Print progress |

**Returns:** `pd.DataFrame` with columns: `ligand`, `receptor`, `source`, `target`, `magnitude_rank`, `specificity_rank`, plus per-method score columns.

---

### `liana.mt.cellphoneDB`

```python
liana.mt.cellphoneDB(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'cellphonedb',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    n_perms: int = 1000,
    seed: int = 0,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `cellphonedb` (mean significance), `cellphonedb_pvalue`

---

### `liana.mt.cellchat`

```python
liana.mt.cellchat(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'cellchatdb',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `cellchat` (probability), `cellchat_pvalue`

---

### `liana.mt.natmi`

```python
liana.mt.natmi(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'consensus',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `natmi` (weighted expression product), `natmi_spec` (specificity)

---

### `liana.mt.connectome`

```python
liana.mt.connectome(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'connectomedb',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `connectome` (expression-weighted mean)

---

### `liana.mt.sca` (SingleCellSignalR)

```python
liana.mt.sca(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'consensus',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `sca` (network-based score)

---

### `liana.mt.log2fc`

```python
liana.mt.log2fc(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'consensus',
    expr_prop: float = 0.1,
    use_raw: bool = True,
    **kwargs,
) -> pd.DataFrame
```

**Key output columns:** `log2fc` (log2 fold-change score)

---

### `liana.mt.bivar` (Spatial Bivariate)

```python
liana.mt.bivar(
    adata: AnnData,
    groupby: str,
    resource_name: str = 'consensus',
    n_perms: int = 200,
    expr_prop: float = 0.1,
    seed: int = 42,
    **kwargs,
) -> pd.DataFrame
```

**Use case:** Spatial transcriptomics — identifies ligand-receptor pairs with spatially correlated expression.

---

## `liana.pl` — Plotting Module

### `liana.pl.dotplot`

Primary visualization: Bubble/dot plot of CCC interactions.

```python
liana.pl.dotplot(
    liana_res: pd.DataFrame,
    uns_keys: list = ['magnitude_rank', 'specificity_rank'],
    source_labels: Optional[list] = None,
    target_labels: Optional[list] = None,
    figure_size: tuple = (8, 10),
    cmap: str = 'coolwarm',
    size_range: tuple = (0.5, 30),
    rotate_labels: bool = True,
    title: Optional[str] = None,
    **kwargs,
)
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `liana_res` | DataFrame | required | Output from `rank_aggregate` |
| `uns_keys` | list | `['magnitude_rank', 'specificity_rank']` | Which metrics to plot |
| `source_labels` | list | None | Subset source cell types |
| `target_labels` | list | None | Subset target cell types |
| `figure_size` | tuple | `(8, 10)` | Figure dimensions (width, height) |
| `cmap` | str | `'coolwarm'` | Colormap for scores |
| `size_range` | tuple | `(0.5, 30)` | Dot size range |
| `rotate_labels` | bool | True | Rotate axis labels |
| `title` | str | None | Plot title |

---

### `liana.pl.heatmap`

```python
liana.pl.heatmap(
    liana_res: pd.DataFrame,
    uns_keys: list = ['magnitude_rank'],
    source_labels: Optional[list] = None,
    target_labels: Optional[list] = None,
    figure_size: tuple = (10, 12),
    cmap: str = 'viridis',
    **kwargs,
)
```

---

### `liana.pl.chord_graph`

```python
liana.pl.chord_graph(
    liana_res: pd.DataFrame,
    source_labels: Optional[list] = None,
    target_labels: Optional[list] = None,
    figure_size: tuple = (8, 8),
    **kwargs,
)
```

**Use case:** Shows communication network topology between cell types as a chord diagram.

---

### `liana.pl.tileplot`

```python
liana.pl.tileplot(
    liana_res: pd.DataFrame,
    source_labels: Optional[list] = None,
    target_labels: Optional[list] = None,
    figure_size: tuple = (10, 8),
    **kwargs,
)
```

**Use case:** Visualizes per-method agreement for each interaction as a tile grid.

---

## `liana.rs` — Resources Module

### `liana.resource.select_resource`

```python
from liana import resource

# List available resources
resource.select_resource(resource_name=None)

# Load a specific resource
lr_df = resource.select_resource(resource_name='consensus')

# Get resource info
print(f"Interactions: {len(lr_df)}")
print(f"Columns: {lr_df.columns.tolist()}")
print(f"Sample:\n{lr_df.head()}")
```

### Available Resources

| Resource Name | Interactions | Description |
|---------------|-------------|-------------|
| `consensus` | ~5000+ | Aggregated from multiple curated databases |
| `cellphonedb` | ~4000+ | CellPhoneDB v5 database |
| `cellchatdb` | ~3000+ | CellChat v2 database |
| `connectomedb` | ~2500+ | ConnectomeDB 2020 |
| `icellnet` | ~3000+ | iCellNet database |
| `guide2pharma` | ~600+ | Guide2Pharma curated drug-target interactions |
| `baccin2019` | ~2000+ | Baccin et al. 2019 |
| `moreno2023` | ~1500+ | Moreno et al. 2023 |

### Creating Custom Resources

```python
import pandas as pd

custom_resource = pd.DataFrame({
    'ligand': ['GENE_A', 'GENE_B'],
    'receptor': ['GENE_X', 'GENE_Y'],
    'source': ['custom_db'],
    'interaction': ['GENE_A_GENE_X', 'GENE_B_GENE_Y'],
})

# Use directly in rank_aggregate
liana_res = li.mt.rank_aggregate(
    adata,
    groupby='cell_type',
    lr_resource=custom_resource,
)
```

---

## Quick Lookup: Common Patterns

### Run analysis with all defaults
```python
liana_res = li.mt.rank_aggregate(adata, groupby='cell_type')
```

### Run with custom resource and parameters
```python
liana_res = li.mt.rank_aggregate(
    adata,
    groupby='cell_type',
    resource_name='cellchatdb',
    expr_prop=0.15,
    n_perms=2000,
    min_cells=10,
)
```

### Quick visualization
```python
li.pl.dotplot(liana_res, figure_size=(8, 10))
```

### Filter top interactions
```python
top = liana_res[
    (liana_res['magnitude_rank'] < 0.05) &
    (liana_res['specificity_rank'] < 0.05)
].sort_values('magnitude_rank')
```

### Export results
```python
liana_res.to_csv('liana_results.csv', index=False)
top.to_csv('liana_top.csv', index=False)
```
