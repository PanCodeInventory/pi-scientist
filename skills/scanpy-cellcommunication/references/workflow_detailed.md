# LIANA+ Detailed Workflow

## Table of Contents

1. [Data Preparation](#data-preparation)
2. [Running Individual Methods](#running-individual-methods)
3. [Consensus Rank Aggregation](#consensus-rank-aggregation)
4. [Visualization Reference](#visualization-reference)
5. [Spatial Transcriptomics](#spatial-transcriptomics)
6. [Differential Communication Analysis](#differential-communication-analysis)
7. [Advanced Filtering and Subsetting](#advanced-filtering-and-subsetting)
8. [Custom Resources](#custom-resources)

---

## Data Preparation

### Requirements

LIANA+ expects a processed AnnData object with:

1. **Cell type annotations** in `adata.obs` (required)
2. **Raw counts** in `adata.raw.X` or `adata.X` (recommended)
3. **Sufficient cells per group** (minimum 5-10, recommended 20+)

### Loading and Validating Data

```python
import scanpy as sc
import liana as li
import pandas as pd

# Load pre-processed AnnData
adata = sc.read_h5ad("annotated_data.h5ad")

# Validate structure
print(f"Shape: {adata.shape}")
print(f"Cell types: {adata.obs['cell_type'].unique()}")
print(f"Cells per type:\n{adata.obs['cell_type'].value_counts()}")

# Ensure raw counts are available
if adata.raw is None:
    print("WARNING: No raw counts found. Copying current X to raw.")
    adata.raw = adata

# Check gene symbol format
print(f"First 10 genes: {adata.var_names[:10].tolist()}")
# Should be HGNC (human) or MGI (mouse) gene symbols
```

### Gene Symbol Conversion

If gene identifiers need conversion:

```python
# Convert Ensembl IDs to gene symbols
sc.pp.convert_genes_to_symbols(adata, from_type='ensembl', to_type='symbol')

# Or use mygene for more robust conversion
import mygene
mg = mygene.MyGeneInfo()
genes = adata.var_names.tolist()
mapped = mg.querymany(genes, scopes='ensembl.gene', fields='symbol', species='human')
id_map = {g['query']: g['symbol'] for g in mapped if 'symbol' in g}
adata.var_names = [id_map.get(g, g) for g in adata.var_names]
```

### Filtering Low-Abundance Cell Types

```python
# Remove cell types with too few cells
min_cells_per_type = 15
cell_counts = adata.obs['cell_type'].value_counts()
valid_types = cell_counts[cell_counts >= min_cells_per_type].index
adata = adata[adata.obs['cell_type'].isin(valid_types)]
print(f"Retained {adata.obs['cell_type'].nunique()} cell types")
```

---

## Running Individual Methods

LIANA+ provides access to individual CCC methods via `liana.mt`.

### CellPhoneDB

```python
# Run CellPhoneDB with custom parameters
cellphone_res = li.mt.cellphoneDB(
    adata,
    groupby='cell_type',
    resource_name='cellphonedb',
    n_perms=1000,       # increase for significance
    expr_prop=0.1,
    use_raw=True,
    seed=42,
)
# Key columns: ligand, receptor, source, target, cellphonedb_mean, cellphonedb_pvalue
```

### CellChat

```python
# Run CellChat
cellchat_res = li.mt.cellchat(
    adata,
    groupby='cell_type',
    resource_name='cellchatdb',
    expr_prop=0.1,
    use_raw=True,
)
# Key columns: ligand, receptor, source, target, cellchat_prob, cellchat_pvalue
```

### NATMI

```python
# Run NATMI
natmi_res = li.mt.natmi(
    adata,
    groupby='cell_type',
    resource_name='consensus',
    expr_prop=0.1,
    use_raw=True,
)
# Key columns: ligand, receptor, source, target, natmi_edge, natmi_weight
```

### Connectome

```python
# Run Connectome
connectome_res = li.mt.connectome(
    adata,
    groupby='cell_type',
    resource_name='connectomedb',
    expr_prop=0.1,
    use_raw=True,
)
```

### SingleCellSignalR

```python
# Run SingleCellSignalR
sca_res = li.mt.sca(
    adata,
    groupby='cell_type',
    resource_name='consensus',
    expr_prop=0.1,
    use_raw=True,
)
```

---

## Consensus Rank Aggregation

The primary recommended workflow uses `rank_aggregate` to combine all methods.

### Basic Consensus Run

```python
liana_res = li.mt.rank_aggregate(
    adata,
    groupby='cell_type',
    resource_name='consensus',
    expr_prop=0.1,
    use_raw=True,
    n_perms=1000,
    min_cells=5,
    return_all_lrs=False,
    seed=42,
    verbose=True,
)
```

### Understanding the Output

The result DataFrame contains:

| Column | Description |
|--------|-------------|
| `ligand` | Ligand gene symbol |
| `receptor` | Receptor gene symbol |
| `source` | Source cell type (produces ligand) |
| `target` | Target cell type (expresses receptor) |
| `magnitude_rank` | Rank-based consensus of communication strength |
| `specificity_rank` | Rank-based consensus of interaction specificity |
| `entity_interaction` | Interaction complex name |
| `methodname_score` | Per-method scores (e.g., `cellphonedb`, `cellchat`) |
| `n_methods` | Number of methods supporting the interaction |

### Interpreting Ranks

Both `magnitude_rank` and `specificity_rank` are in range [0, 1]:
- **Lower values = stronger/more specific interactions**
- 0.0 = strongest possible; 1.0 = weakest possible

```python
# Filter for top consensus interactions
top = liana_res[
    (liana_res['magnitude_rank'] < 0.05) &
    (liana_res['specificity_rank'] < 0.05)
].sort_values('magnitude_rank')

print(f"Found {len(top)} high-confidence interactions")
print(top[['ligand', 'receptor', 'source', 'target',
           'magnitude_rank', 'specificity_rank']].head(20))
```

---

## Visualization Reference

### Dot Plot (Primary Visualization)

```python
# Full dot plot with all interactions
li.pl.dotplot(
    liana_res,
    uns_keys=['magnitude_rank', 'specificity_rank'],
    figure_size=(10, 12),
    cmap='coolwarm',
    size_range=(0.5, 30),
    rotate_labels=True,
    title='Cell-Cell Communication',
)

# Subset to specific source-target pairs
li.pl.dotplot(
    liana_res,
    uns_keys=['magnitude_rank', 'specificity_rank'],
    source_labels=['CD4 T cells', 'B cells'],
    target_labels=['CD8 T cells', 'NK cells', 'Monocytes'],
    figure_size=(8, 10),
)
```

### Heatmap

```python
li.pl.heatmap(
    liana_res,
    uns_keys=['magnitude_rank'],
    figure_size=(10, 12),
    cmap='viridis',
    source_labels=['CD4 T cells', 'B cells'],
    target_labels=['CD8 T cells', 'NK cells'],
)
```

### Chord Diagram

```python
# Shows communication network between cell types
li.pl.chord_graph(
    liana_res,
    source_labels=['CD4 T cells', 'B cells'],
    target_labels=['CD8 T cells', 'NK cells'],
    figure_size=(8, 8),
)
```

### Tile Plot (Method Agreement)

```python
# Visualize per-method agreement for specific interactions
li.pl.tileplot(
    liana_res,
    source_labels=['CD4 T cells'],
    target_labels=['CD8 T cells'],
    figure_size=(10, 8),
    # Shows how each method scores the interaction
)
```

### Inspecting Specific Interactions

```python
# Get interactions for a specific ligand-receptor pair
specific = liana_res[
    (liana_res['ligand'] == 'CD40LG') &
    (liana_res['receptor'] == 'CD40')
]
print(specific[['source', 'target', 'magnitude_rank', 'specificity_rank']])

# Get all interactions between two cell types
pair_interactions = liana_res[
    (liana_res['source'] == 'CD4 T cells') &
    (liana_res['target'] == 'B cells')
].sort_values('magnitude_rank')
```

---

## Spatial Transcriptomics

### Spatial Bivariate Analysis

LIANA+ provides `liana.mt.bivar` for spatially-resolved communication analysis.

```python
import squidpy as sq
import liana as li

# Load spatial data (e.g., Visium)
adata_spatial = sc.datasets.visium_sge(sample_id="V1_Breast_Cancer_Block_A_Section_1")
adata_spatial = sq.datasets.sc_breast_cancer()

# Preprocess
sc.pp.calculate_qc_metrics(adata_spatial, inplace=True)
sc.pp.normalize_total(adata_spatial, target_sum=1e4)
sc.pp.log1p(adata_spatial)

# Run spatial bivariate analysis
# This identifies spatially co-expressed ligand-receptor pairs
bivar_res = li.mt.bivar(
    adata_spatial,
    groupby='cell_type',
    resource_name='consensus',
    n_perms=200,
    expr_prop=0.1,
    seed=42,
)
```

### Combining Spatial and Expression Results

```python
# Run standard LIANA+ on the same data
liana_res = li.mt.rank_aggregate(
    adata_spatial,
    groupby='cell_type',
    resource_name='consensus',
    expr_prop=0.1,
)

# Find interactions supported by both spatial and expression analysis
spatial_lr_pairs = set(zip(bivar_res['ligand'], bivar_res['receptor']))
expression_lr_pairs = set(zip(liana_res['ligand'], liana_res['receptor']))

# Intersections represent high-confidence spatially-validated interactions
validated = spatial_lr_pairs & expression_lr_pairs
print(f"Spatially validated interactions: {len(validated)}")
```

---

## Differential Communication Analysis

### Comparing Conditions

```python
# Split data by condition
adata_cond1 = adata[adata.obs['condition'] == 'control'].copy()
adata_cond2 = adata[adata.obs['condition'] == 'treatment'].copy()

# Run LIANA+ on each condition
res1 = li.mt.rank_aggregate(adata_cond1, groupby='cell_type', seed=42)
res2 = li.mt.rank_aggregate(adata_cond2, groupby='cell_type', seed=42)

# Compare specific interactions between conditions
interaction = 'CD40LG_CD40'
cond1_score = res1[res1['entity_interaction'].str.contains('CD40')]['magnitude_rank']
cond2_score = res2[res2['entity_interaction'].str.contains('CD40')]['magnitude_rank']

print(f"Control magnitude_rank: {cond1_score.median():.4f}")
print(f"Treatment magnitude_rank: {cond2_score.median():.4f}")
```

### Identifying Condition-Specific Interactions

```python
# Find interactions unique to one condition
lr_cond1 = set(zip(res1['ligand'], res1['receptor']))
lr_cond2 = set(zip(res2['ligand'], res2['receptor']))

unique_to_cond1 = lr_cond1 - lr_cond2
unique_to_cond2 = lr_cond2 - lr_cond1

print(f"Interactions unique to control: {len(unique_to_cond1)}")
print(f"Interactions unique to treatment: {len(unique_to_cond2)}")

# Filter for high-confidence unique interactions
top_unique = res2[
    (res2['ligand'].str[0].isin([l[0] for l in unique_to_cond2])) &
    (res2['magnitude_rank'] < 0.05)
]
```

---

## Advanced Filtering and Subsetting

### Filter by Pathway

```python
# LIANA resources often include pathway annotations
# Filter for immune-related interactions
immune_genes = {'CD40', 'CD40LG', 'CD28', 'CD80', 'CD86', 'CD274',
                'PDCD1', 'CTLA4', 'ICOS', 'ICOSLG', 'BTLA',
                'TNF', 'TNFRSF1A', 'TNFRSF1B', 'FAS', 'FASLG'}

immune_interactions = liana_res[
    liana_res['ligand'].isin(immune_genes) |
    liana_res['receptor'].isin(immune_genes)
]
```

### Filter by Method Agreement

```python
# Only keep interactions supported by 3+ methods
method_cols = [c for c in liana_res.columns if c not in
               ['ligand', 'receptor', 'source', 'target',
                'magnitude_rank', 'specificity_rank', 'entity_interaction']]

# Count non-null method scores
liana_res['n_methods'] = liana_res[method_cols].notna().sum(axis=1)
robust = liana_res[liana_res['n_methods'] >= 3].copy()
```

### Generate Network for Cytoscape

```python
# Export as edge list for network visualization
network = robust[robust['magnitude_rank'] < 0.1][
    ['source', 'target', 'ligand', 'receptor',
     'magnitude_rank', 'specificity_rank']
].copy()
network['interaction'] = network['ligand'] + '_' + network['receptor']
network.to_csv("communication_network.csv", index=False)
```

---

## Custom Resources

### Loading a Custom LR Resource

```python
from liana import resource

# Define custom resource as DataFrame
custom_lr = pd.DataFrame({
    'ligand': ['GENE_L1', 'GENE_L2'],
    'receptor': ['GENE_R1', 'GENE_R2'],
    'source': ['Database_A', 'Database_A'],
    'interaction': ['GENE_L1_GENE_R1', 'GENE_L2_GENE_R2'],
})

# Use with LIANA+
liana_res = li.mt.rank_aggregate(
    adata,
    groupby='cell_type',
    lr_resource=custom_lr,
)
```

### Browsing Available Resources

```python
# List all available resources
resource.select_resource(resource_name=None)

# Inspect a specific resource
consensus_res = resource.select_resource(resource_name='consensus')
print(f"Consensus resource: {len(consensus_res)} interactions")
print(consensus_res.columns.tolist())
```
