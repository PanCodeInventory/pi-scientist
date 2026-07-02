# Squidpy Code Examples

Full Python code patterns for all Squidpy modules. All examples follow publication-ready conventions:
- Random seeds set for reproducibility
- Dual-format figure output (PDF + PNG)
- Standard scanpy preprocessing pipeline
- Config-driven parameters where applicable

---

## Setup & Imports

```python
import scanpy as sc
import squidpy as sq
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib import rcParams

# Publication-ready figure defaults
rcParams['pdf.fonttype'] = 42
rcParams['ps.fonttype'] = 42
rcParams['font.family'] = 'sans-serif'
rcParams['font.sans-serif'] = ['Arial', 'Helvetica', 'DejaVu Sans']
rcParams['font.size'] = 14
rcParams['axes.titlesize'] = 16
rcParams['axes.labelsize'] = 14
rcParams['legend.fontsize'] = 12
rcParams['figure.figsize'] = (8, 6)
rcParams['figure.dpi'] = 150
rcParams['savefig.dpi'] = 150
rcParams['savefig.bbox'] = 'tight'
rcParams['savefig.pad_inches'] = 0.1

# Reproducibility
SEED = 42
np.random.seed(SEED)
```

---

## 1. Data Loading

### 1.1 10x Visium (Standard SpaceRanger Output)

```python
def load_visium(space_ranger_dir: str, sample_id: str = None):
    """Load 10x Visium data from SpaceRanger output directory.

    Expected structure:
    space_ranger_dir/
      ├── filtered_feature_bc_matrix/
      │   ├── barcodes.tsv.gz
      │   ├── features.tsv.gz
      │   └── matrix.mtx.gz
      ├── spatial/
      │   ├── tissue_positions_list.csv
      │   ├── scalefactors_json.json
      │   ├── tissue_hires_image.png
      │   └── tissue_lowres_image.png

    Supports SpaceRanger v3 format (Squidpy ≥ v1.8.0).
    """
    adata = sq.read.visium(space_ranger_dir)

    if sample_id:
        adata.obs['sample'] = sample_id

    print(f'Loaded: {adata.n_obs} spots × {adata.n_vars} genes')
    return adata


def load_visium_multisample(sample_dirs: dict) -> sc.AnnData:
    """Load multiple Visium samples and concatenate.

    Parameters
    ----------
    sample_dirs : dict
        {sample_id: path_to_spaceranger_output}
    """
    adatas = {}
    for sample_id, path in sample_dirs.items():
        adata = sq.read.visium(path)
        adata.obs['sample'] = sample_id
        adata.var_names_make_unique()
        adatas[sample_id] = adata

    # Concatenate with batch key
    adata = adatas[list(sample_dirs.keys())[0]].concatenate(
        list(adatas.values())[1:],
        batch_key='sample',
        join='inner',
    )
    print(f'Concatenated: {adata.n_obs} spots × {adata.n_vars} genes from {len(sample_dirs)} samples')
    return adata
```

### 1.2 MERFISH (Vizgen)

```python
def load_vizgen_merfish(vizgen_dir: str, sample_id: str = None):
    """Load Vizgen MERFISH data."""
    adata = sq.read.vizgen(vizgen_dir)
    if sample_id:
        adata.obs['sample'] = sample_id
    return adata
```

### 1.3 NanoString CosMx

```python
def load_nanostring_cosmx(data_dir: str, sample_id: str = None):
    """Load NanoString CosMx SMI data."""
    adata = sq.read.nanostring(data_dir)
    if sample_id:
        adata.obs['sample'] = sample_id
    return adata
```

---

## 2. Quality Control & Preprocessing

```python
def qc_spatial(adata, min_genes=200, min_counts=500, max_mt_pct=20):
    """QC and filter spatial transcriptomics data."""
    # Compute QC metrics
    sc.pp.calculate_qc_metrics(adata, inplace=True)

    # Plot QC
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    sc.pl.spatial(adata, color='n_genes_by_counts', ax=axes[0], show=False)
    axes[0].set_title('Genes per Spot')
    sc.pl.spatial(adata, color='total_counts', ax=axes[1], show=False)
    axes[1].set_title('UMI Counts per Spot')
    sc.pl.spatial(adata, color='pct_counts_mt', ax=axes[2], show=False)
    axes[2].set_title('% Mitochondrial')
    plt.tight_layout()
    fig.savefig('figures/qc_spatial.pdf')
    fig.savefig('figures/qc_spatial.png', dpi=150)
    plt.close(fig)

    # Filter
    sc.pp.filter_cells(adata, min_genes=min_genes)
    sc.pp.filter_cells(adata, min_counts=min_counts)

    # Mitochondrial genes (platform-adaptive)
    if any(adata.var_names.str.startswith('MT-')):
        adata.var['mt'] = adata.var_names.str.startswith('MT-')
    elif any(adata.var_names.str.startswith('mt-')):
        adata.var['mt'] = adata.var_names.str.startswith('mt-')
    else:
        adata.var['mt'] = False

    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], inplace=True)
    adata = adata[adata.obs['pct_counts_mt'] < max_mt_pct].copy()

    # Remove MT genes for downstream analysis
    adata = adata[:, ~adata.var['mt']].copy()

    print(f'After QC: {adata.n_obs} spots × {adata.n_vars} genes')
    return adata


def preprocess_spatial(adata, n_top_genes=2000, n_comps=50):
    """Standard preprocessing: normalize, log-transform, HVG, PCA."""
    # Preserve raw counts
    adata.layers['counts'] = adata.X.copy()

    # Normalize to 10,000 counts per spot
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    adata.raw = adata  # store log-normalized data for downstream (ligrec, etc.)

    # Filter genes
    sc.pp.filter_genes(adata, min_cells=3)

    # Highly variable genes
    sc.pp.highly_variable_genes(adata, n_top_genes=n_top_genes, flavor='seurat_v3')
    print(f'Selected {adata.var.highly_variable.sum()} HVGs')

    # PCA
    sc.tl.pca(adata, n_comps=n_comps, svd_solver='arpack')
    sc.pl.pca_variance_ratio(adata, n_pcs=n_comps, save='_variance.pdf')

    return adata
```

---

## 3. Spatial Graph Construction

```python
def build_spatial_graph(adata, platform='visium', n_neighs=None, radius=None):
    """Build spatial neighbor graph based on platform.

    Parameters
    ----------
    platform : str
        'visium', 'merfish', 'slideseq', 'xenium', or 'generic'
    n_neighs : int or None
        Number of nearest neighbors. If None, uses platform-appropriate default.
    radius : float or None
        If set, uses radius-based graph instead of kNN.
    """
    platform_defaults = {
        'visium': {'coord_type': 'grid', 'n_neighs': 6},
        'merfish': {'coord_type': 'generic', 'n_neighs': 15},
        'slideseq': {'coord_type': 'generic', 'n_neighs': 12},
        'xenium': {'coord_type': 'generic', 'n_neighs': 10},
        'generic': {'coord_type': 'generic', 'n_neighs': 15},
    }

    config = platform_defaults.get(platform, platform_defaults['generic'])

    if n_neighs is not None:
        config['n_neighs'] = n_neighs

    sq.gr.spatial_neighbors(
        adata,
        coord_type=config['coord_type'],
        n_neighs=config['n_neighs'],
        radius=radius,
        key_added='spatial',
    )

    n_edges = adata.obsp['spatial_connectivities'].sum()
    print(f'Spatial graph: {n_edges} total edges '
          f'({n_edges / adata.n_obs:.1f} edges/spot on average)')

    return adata
```

---

## 4. Spatially Variable Genes (Moran's I)

```python
def find_spatial_genes_moran(
    adata,
    n_top_genes=3000,
    n_perms=1000,
    corr_method='fdr_bh',
    fdr_threshold=0.05,
    min_I=0.1,
    out_dir='results/',
):
    """Identify spatially variable genes using Moran's I.

    Runs on top n_top_genes (by HVG/dispersion) for efficiency.
    Uses permutation-based p-values for accuracy.
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    # Select genes: prefer HVG, fall back to top by mean expression
    if 'highly_variable' in adata.var.columns:
        genes = adata.var_names[adata.var['highly_variable']][:n_top_genes]
    else:
        mean_expr = np.array(adata.X.mean(axis=0)).flatten()
        top_idx = np.argsort(mean_expr)[-n_top_genes:]
        genes = adata.var_names[top_idx]

    print(f'Testing {len(genes)} genes for spatial autocorrelation')

    sq.gr.spatial_autocorr(
        adata,
        mode='moran',
        genes=genes,
        n_perms=n_perms,
        corr_method=corr_method,
        transformation=True,
    )

    # Extract results
    moran_df = adata.uns['moranI'].copy()
    moran_df.index = adata.var_names  # ensure gene names

    sig_genes = moran_df[
        (moran_df[f'pval_norm_{corr_method}'] < fdr_threshold) &
        (moran_df['I'] > min_I)
    ].sort_values('I', ascending=False)

    n_sig = len(sig_genes)
    print(f'Found {n_sig} significant SVGs '
          f'(FDR < {fdr_threshold}, I > {min_I})')

    # Save results
    moran_df.to_csv(f'{out_dir}/moran_all_genes.csv')
    sig_genes.to_csv(f'{out_dir}/moran_significant_genes.csv')

    # Plot top SVGs
    top_n = min(10, n_sig)
    if top_n > 0:
        fig, axes = plt.subplots(2, 5, figsize=(20, 10))
        axes = axes.flatten()
        for i, gene in enumerate(sig_genes.index[:10]):
            sc.pl.spatial(adata, color=gene, ax=axes[i], show=False, title=gene)
            axes[i].set_title(f'{gene}\nI={sig_genes.loc[gene, "I"]:.3f}')
        for j in range(i + 1, 10):
            axes[j].axis('off')
        plt.tight_layout()
        fig.savefig(f'{out_dir}/top_spatial_genes.pdf')
        fig.savefig(f'{out_dir}/top_spatial_genes.png', dpi=150)
        plt.close(fig)

    return sig_genes
```

---

## 5. Spatial Clustering

```python
def spatial_clustering(
    adata,
    use_spatial_graph=True,
    resolution=1.0,
    n_pcs=None,
    key_added='spatial_domain',
):
    """Cluster spots into spatial domains.

    When use_spatial_graph=True, uses the spatial neighbor graph
    for clustering (SpatialLeiden if available, else scanpy Leiden
    with spatial connectivities).
    """
    # Dimensionality reduction
    if n_pcs is None:
        n_pcs = min(50, adata.n_vars - 1)

    sc.pp.neighbors(adata, n_pcs=n_pcs)

    # Spatial-aware clustering
    if use_spatial_graph:
        try:
            # SpatialLeiden (Squidpy ≥ v1.8.0)
            import spatialleiden
            sq.gr.spatial_neighbors(adata, coord_type='grid', n_neighs=6)
            sc.tl.leiden(
                adata,
                resolution=resolution,
                key_added=key_added,
                neighbors_key='spatial',
            )
        except ImportError:
            # Fallback: use spatial connectivities
            sc.tl.leiden(
                adata,
                resolution=resolution,
                key_added=key_added,
                neighbors_key='spatial',
            )
    else:
        sc.tl.leiden(
            adata,
            resolution=resolution,
            key_added=key_added,
        )

    n_clusters = adata.obs[key_added].nunique()
    print(f'Identified {n_clusters} spatial domains')

    # Visualize
    sq.pl.spatial_scatter(
        adata, color=key_added, shape=None, size=1.2,
        save=f'_{key_added}.pdf',
    )

    return adata


def find_domain_markers(adata, domain_key='spatial_domain', method='wilcoxon'):
    """Identify marker genes for each spatial domain."""
    sc.tl.rank_genes_groups(
        adata, groupby=domain_key, method=method, use_raw=True,
    )

    # Extract results DataFrame
    markers_df = sc.get.rank_genes_groups_df(adata, group=None)
    markers_df.to_csv(f'results/domain_markers.csv', index=False)

    # Plot top markers per domain
    sc.pl.rank_genes_groups_dotplot(
        adata, n_genes=4, groupby=domain_key, save='_domain_markers.pdf',
    )

    return markers_df
```

---

## 6. Neighborhood Enrichment

```python
def analyze_neighborhood_enrichment(
    adata,
    cluster_key='spatial_domain',
    n_perms=5000,
    seed=42,
    out_dir='results/',
):
    """Permutation test for cluster spatial co-localization."""
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.nhood_enrichment(
        adata,
        cluster_key=cluster_key,
        n_perms=n_perms,
        seed=seed,
    )

    # Heatmap of z-scores
    fig, ax = plt.subplots(figsize=(10, 8))
    sq.pl.nhood_enrichment(
        adata, cluster_key=cluster_key,
        mode='zscore', annotate=True, ax=ax,
    )
    fig.savefig(f'{out_dir}/nhood_enrichment_zscore.pdf')
    fig.savefig(f'{out_dir}/nhood_enrichment_zscore.png', dpi=150)
    plt.close(fig)

    # Count matrix
    fig, ax = plt.subplots(figsize=(10, 8))
    sq.pl.nhood_enrichment(
        adata, cluster_key=cluster_key,
        mode='count', annotate=True, ax=ax,
    )
    fig.savefig(f'{out_dir}/nhood_enrichment_count.pdf')
    plt.close(fig)

    # Export results
    result = adata.uns[f'{cluster_key}_nhood_enrichment']
    result['zscore'].to_csv(f'{out_dir}/nhood_zscore.csv')
    result['count'].to_csv(f'{out_dir}/nhood_count.csv')

    # Report significant enrichments
    zscore_df = result['zscore']
    sig_pairs = []
    for cluster_a in zscore_df.index:
        for cluster_b in zscore_df.columns:
            z = zscore_df.loc[cluster_a, cluster_b]
            if cluster_a != cluster_b and abs(z) > 1.96:
                direction = 'enriched' if z > 0 else 'depleted'
                sig_pairs.append({
                    'cluster_a': cluster_a,
                    'cluster_b': cluster_b,
                    'zscore': z,
                    'direction': direction,
                })

    sig_df = pd.DataFrame(sig_pairs).sort_values('zscore', ascending=False)
    sig_df.to_csv(f'{out_dir}/significant_neighbor_pairs.csv', index=False)
    print(f'Found {len(sig_pairs)} significant neighbor pairs (|z| > 1.96)')

    return sig_df
```

---

## 7. Co-occurrence Analysis

```python
def analyze_co_occurrence(
    adata,
    cluster_key='spatial_domain',
    interval=50,
    out_dir='results/',
):
    """Distance-dependent co-occurrence analysis."""
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.co_occurrence(adata, cluster_key=cluster_key, interval=interval)

    result = adata.uns[f'{cluster_key}_co_occurrence']
    occ_df = pd.DataFrame(
        result['occ'],
        index=result['cluster_order'],
        columns=result['interval'],
    )

    # Line plot for selected clusters
    clusters = adata.obs[cluster_key].cat.categories[:8]  # first 8
    fig, ax = plt.subplots(figsize=(10, 6))
    sq.pl.co_occurrence(
        adata, cluster_key=cluster_key,
        clusters=clusters, ax=ax,
    )
    fig.savefig(f'{out_dir}/co_occurrence.pdf')
    fig.savefig(f'{out_dir}/co_occurrence.png', dpi=150)
    plt.close(fig)

    occ_df.to_csv(f'{out_dir}/co_occurrence_probabilities.csv')
    return occ_df
```

---

## 8. Ligand-Receptor Analysis

```python
def analyze_ligand_receptor(
    adata,
    cluster_key='cell_type',
    n_perms=1000,
    corr_method='fdr_bh',
    out_dir='results/',
):
    """Identify significant ligand-receptor interactions between clusters.

    REQUIREMENT: adata.raw must contain log-normalized counts
    (sc.pp.normalize_total + sc.pp.log1p applied before .raw was set).
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    # Verify raw data is available
    if adata.raw is None:
        raise ValueError(
            'adata.raw is None. Run sc.pp.normalize_total + sc.pp.log1p '
            'on the full data, then set adata.raw = adata BEFORE '
            'subsetting to HVGs.'
        )

    sq.gr.ligrec(
        adata,
        cluster_key=cluster_key,
        n_perms=n_perms,
        corr_method=corr_method,
        corr_axis='clusters',
        use_raw=True,
        seed=42,
    )

    # Visualization: dot plot with filtering
    fig, ax = plt.subplots(figsize=(14, 10))
    sq.pl.ligrec(
        adata, cluster_key=cluster_key,
        means_range=(3, np.inf),
        pvalue_threshold=0.05,
        dendrogram=True,
        ax=ax,
    )
    fig.savefig(f'{out_dir}/ligrec_dotplot.pdf', bbox_inches='tight')
    fig.savefig(f'{out_dir}/ligrec_dotplot.png', dpi=150, bbox_inches='tight')
    plt.close(fig)

    # Export results
    lr_result = adata.uns[f'{cluster_key}_ligrec']
    if isinstance(lr_result, dict):
        for key, df in lr_result.items():
            df.to_csv(f'{out_dir}/ligrec_{key}.csv')

    return lr_result
```

---

## 9. Ripley's Statistics

```python
def analyze_ripley(
    adata,
    cluster_key='cell_type',
    mode='L',
    n_simulations=100,
    max_dist=None,
    out_dir='results/',
):
    """Ripley's spatial point pattern analysis."""
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.ripley(
        adata,
        cluster_key=cluster_key,
        mode=mode,
        n_simulations=n_simulations,
        max_dist=max_dist,
    )

    fig, ax = plt.subplots(figsize=(10, 6))
    sq.pl.ripley(
        adata, cluster_key=cluster_key,
        mode=mode, plot_sims=True, ax=ax,
    )
    fig.savefig(f'{out_dir}/ripley_{mode}.pdf')
    fig.savefig(f'{out_dir}/ripley_{mode}.png', dpi=150)
    plt.close(fig)

    return adata
```

---

## 10. Centrality Scores

```python
def analyze_centrality(
    adata,
    cluster_key='spatial_domain',
    out_dir='results/',
):
    """Compute network centrality measures per cluster."""
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.centrality_scores(adata, cluster_key=cluster_key)

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    for ax, score in zip(axes, ['closeness_centrality', 'average_clustering', 'degree_centrality']):
        sq.pl.centrality_scores(adata, cluster_key=cluster_key, score=score, ax=ax)

    plt.tight_layout()
    fig.savefig(f'{out_dir}/centrality_scores.pdf')
    plt.close(fig)

    # Export scores
    result = adata.uns[f'{cluster_key}_centrality_scores']
    result.to_csv(f'{out_dir}/centrality_scores.csv')

    return result
```

---

## 11. Interaction Matrix

```python
def analyze_interaction_matrix(
    adata,
    cluster_key='spatial_domain',
    normalized=True,
    out_dir='results/',
):
    """Cluster interaction frequency matrix."""
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.interaction_matrix(
        adata, cluster_key=cluster_key, normalized=normalized,
    )

    fig, ax = plt.subplots(figsize=(8, 8))
    sq.pl.interaction_matrix(
        adata, cluster_key=cluster_key,
        annotate=True, ax=ax,
    )
    fig.savefig(f'{out_dir}/interaction_matrix.pdf')
    plt.close(fig)

    # Export
    inter_mat = adata.uns[f'{cluster_key}_interactions']
    inter_mat.to_csv(f'{out_dir}/interaction_matrix.csv')

    return inter_mat
```

---

## 12. Image Feature Extraction

```python
def extract_image_features(
    adata,
    img,
    features=None,
    scales=(1.0, 2.0),
    out_dir='results/',
):
    """Extract morphological features from tissue image.

    Parameters
    ----------
    adata : AnnData
        Spatial data.
    img : sq.im.ImageContainer
        High-resolution tissue image.
    features : list
        Feature types: 'summary', 'texture', 'histogram', 'segmentation'.
        Default: ['summary', 'texture'].
    scales : tuple
        Scales for multi-scale extraction. (1.0, 2.0) recommended.
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    if features is None:
        features = ['summary', 'texture']

    features_kwargs = {
        'texture': {'distances': [1, 2, 4]},
    }

    for scale in scales:
        key = f'img_features_scale{scale}'
        sq.im.calculate_image_features(
            adata,
            img.compute(),
            features=features,
            features_kwargs=features_kwargs,
            scale=scale,
            key_added=key,
        )
        print(f'Extracted {len(adata.obsm[key])} features at scale={scale}')

    # Combine multi-scale features for downstream analysis
    # Extract summary stats for each spot
    for scale in scales:
        key = f'img_features_scale{scale}'
        features_df = pd.DataFrame(
            adata.obsm[key].values,
            index=adata.obs_names,
        )
        features_df.columns = [f'{c}_s{scale}' for c in features_df.columns]
        features_df.to_csv(f'{out_dir}/image_features_scale{scale}.csv')

    return adata
```

---

## 13. Sepal Spatially Variable Genes

```python
def find_spatial_genes_sepal(
    adata,
    max_neighs=6,  # 6 for hexagonal (Visium), 4 for square grid
    n_iter=30000,
    dt=0.001,
    thresh=1e-8,
    out_dir='results/',
):
    """Identify SVGs using Sepal diffusion model.

    For Visium: max_neighs=6
    For square grids (ST, Dbit-seq): max_neighs=4
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.gr.sepal(
        adata,
        max_neighs=max_neighs,
        n_iter=n_iter,
        dt=dt,
        thresh=thresh,
    )

    # Results stored per gene; check for completion
    if 'sepal_score' in adata.var.columns:
        sepal_genes = adata.var.sort_values('sepal_score', ascending=False)
        sepal_genes.to_csv(f'{out_dir}/sepal_scores.csv')
        print(f'Sepal completed. Top genes: {sepal_genes.head(10).index.tolist()}')
    else:
        print('Sepal scores not found. Check adata.var.')

    return adata
```

---

## 14. Distance-Based Regression (`var_by_distance`)

```python
def regress_by_distance(
    adata,
    anchor_key,  # boolean column in .obs marking anchor points
    var_key,      # variable name (gene or obs column) to regress
    covariate=None,
    order=1,
    out_dir='results/',
):
    """Regress a variable against distance to anchor points.

    e.g., regress MKI67 expression against distance to tumor boundary.
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    sq.tl.var_by_distance(
        adata,
        anchor_key=anchor_key,
        covariate=covariate,
    )

    fig, ax = plt.subplots(figsize=(8, 6))
    sq.pl.var_by_distance(
        adata, var=var_key,
        anchor_key=anchor_key, covariate=covariate,
        order=order, ax=ax,
    )
    fig.savefig(f'{out_dir}/var_by_distance_{var_key}.pdf')
    plt.close(fig)

    return adata
```

---

## 15. Image Segmentation + Feature Extraction Pipeline

```python
def segment_and_extract_features(
    adata, img, segment_method='watershed',
    crop_size=(100, 100),
    features=('summary', 'texture', 'segmentation'),
    out_dir='results/',
):
    """Complete segmentation + feature extraction pipeline.

    1. Segment nuclei/cells in tissue image
    2. Extract morphological features per spatial spot
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    # Step 1: Segment
    sq.im.segment(
        img, layer='image',
        method=segment_method,
        channel=0,  # DAPI / nuclear channel
    )

    # Step 2: Generate spot crops
    crops = img.generate_spot_crops(
        adata, library_id=list(adata.uns['spatial'].keys())[0],
        crop_size=crop_size,
    )

    # Step 3: Extract features at multiple scales
    for scale in (1.0, 2.0):
        sq.im.calculate_image_features(
            adata, crops,
            features=list(features),
            scale=scale,
            key_added=f'img_features_s{scale}',
        )

    # Step 4: Save
    for scale in (1.0, 2.0):
        key = f'img_features_s{scale}'
        df = pd.DataFrame(
            adata.obsm[key].values,
            index=adata.obs_names,
        )
        df.columns = [f'{c}_s{scale}' for c in df.columns]
        df.to_csv(f'{out_dir}/features_scale{scale}.csv')

    print('Segmentation + feature extraction complete.')
    return adata
```

---

## 16. Complete End-to-End Workflow (Visium)

```python
def squidpy_visium_workflow(
    space_ranger_dir: str,
    sample_id: str,
    out_dir: str = 'results/',
):
    """Complete Squidpy analysis for a 10x Visium sample.

    Steps:
    1. Load & QC
    2. Preprocess
    3. Build spatial graph
    4. Spatial clustering
    5. Marker gene analysis
    6. Spatial variable genes (Moran's I)
    7. Neighborhood enrichment
    8. Co-occurrence
    9. Ligand-receptor (if cell types available)
    10. Image feature extraction (optional, if H&E image)
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    # 1. Load
    adata = load_visium(space_ranger_dir, sample_id)

    # 2. QC
    adata = qc_spatial(adata)

    # 3. Preprocess
    adata = preprocess_spatial(adata)

    # 4. Build spatial graph
    adata = build_spatial_graph(adata, platform='visium')

    # 5. Spatial clustering
    adata = spatial_clustering(adata, use_spatial_graph=True)

    # 6. Domain markers
    markers = find_domain_markers(adata)
    markers.to_csv(f'{out_dir}/domain_markers.csv')

    # 7. Spatially variable genes
    svg_df = find_spatial_genes_moran(adata, out_dir=out_dir)

    # 8. Neighborhood enrichment
    enrich_df = analyze_neighborhood_enrichment(
        adata, cluster_key='spatial_domain', out_dir=out_dir,
    )

    # 9. Co-occurrence
    cooc_df = analyze_co_occurrence(
        adata, cluster_key='spatial_domain', out_dir=out_dir,
    )

    # 10. Save processed data
    adata.write_h5ad(f'{out_dir}/{sample_id}_processed.h5ad')

    print(f'Workflow complete. Results in {out_dir}/')
    return adata
```

---

## Integration Patterns

### Squidpy + Cell2location

```python
def squidpy_cell2location_workflow(
    adata_spatial,  # Squidpy-loaded Visium data
    adata_ref,      # scRNA-seq reference with cell_type column
    cell_type_col='cell_type',
    out_dir='results/',
):
    """Integration: Squidpy preprocessing → Cell2location deconvolution → Squidpy visualization."""
    import cell2location
    from cell2location.models import RegressionModel, Cell2location

    # Step 1: Squidpy preprocessing
    adata_spatial = qc_spatial(adata_spatial)
    adata_spatial = preprocess_spatial(adata_spatial)
    adata_spatial = build_spatial_graph(adata_spatial, platform='visium')

    # Step 2: Cell2location reference signatures
    adata_ref.var['MT_gene'] = adata_ref.var_names.str.startswith(('MT-', 'mt-'))
    adata_ref = adata_ref[:, ~adata_ref.var['MT_gene']].copy()

    RegressionModel.setup_anndata(adata_ref, labels_key=cell_type_col, batch_key='sample')
    mod_ref = RegressionModel(adata_ref)
    mod_ref.train(max_epochs=250, use_gpu=True)

    ref_signatures = mod_ref.export_posterior_quantiles(
        adata_ref,
        sample_kwargs={'num_samples': 1000, 'batch_size': 2500, 'use_gpu': True},
    )

    # Step 3: Deconvolution
    shared_genes = adata_spatial.var_names.intersection(ref_signatures.columns)
    adata_vis_sub = adata_spatial[:, shared_genes].copy()
    ref_for_c2l = ref_signatures[shared_genes].T

    Cell2location.setup_anndata(adata_vis_sub, batch_key='sample')
    mod = Cell2location(
        adata_vis_sub, cell_state_df=ref_for_c2l,
        N_cells_per_location=8, detection_alpha=200,
    )
    mod.train(max_epochs=30000, use_gpu=True)

    adata_vis_sub = mod.export_posterior(
        adata_vis_sub,
        sample_kwargs={'num_samples': 1000, 'batch_size': 5000, 'use_gpu': True},
    )

    # Step 4: Copy back and visualize with Squidpy
    adata_spatial.obsm['means_cell_abundance_w_sf'] = adata_vis_sub.obsm['means_cell_abundance_w_sf']

    abundances = adata_spatial.obsm['means_cell_abundance_w_sf']
    for ct in abundances.columns[:10]:
        adata_spatial.obs[f'ct_{ct}'] = abundances[ct]
        sq.pl.spatial_scatter(
            adata_spatial, color=f'ct_{ct}',
            cmap='magma', size=1.2,
            save=f'_celltype_{ct}.pdf',
        )

    return adata_spatial
```

### Squidpy + Tangram (with nuclei counting)

```python
def squidpy_tangram_prep(adata, img, crop_size=(134, 134)):
    """Count nuclei per Visium spot using Squidpy + Cellpose for Tangram."""
    from cellpose import models

    # Segment nuclei
    cp_model = models.Cellpose(model_type='nuclei')

    def cellpose_segment(arr):
        masks = cellpose_segment_arr(arr, cp_model)
        return masks

    sq.im.segment(img, layer='image', method=cellpose_segment)

    # Count nuclei per spot crop
    crops = img.generate_spot_crops(adata, crop_size=crop_size)
    nuclei_counts = np.zeros(adata.n_obs, dtype=int)
    for i, crop in enumerate(crops):
        nuclei_counts[i] = (crop.compute() > 0).sum()

    adata.obs['nuclei_count'] = nuclei_counts
    return adata
```

---

## 17. Napari Interactive Visualization

### 17.1 Legacy: Squidpy img.interactive() (Deprecated)

```python
def launch_napari_legacy(adata, img):
    """Launch napari viewer via Squidpy's deprecated interactive API.

    DEPRECATED since Squidpy v1.4+. Use for quick exploration only.
    All functionality migrated to napari-spatialdata.

    Parameters
    ----------
    adata : AnnData
        Spatial data with obsm['spatial'], obs, obsm, X.
    img : sq.im.ImageContainer
        High-resolution tissue image.

    Returns
    -------
    viewer : Interactive viewer wrapper

    Usage in GUI:
        - Genes tab: double-click any gene to visualize expression on tissue
        - Observations tab: visualize clusters, QC metrics, annotations
        - Features tab: visualize PCA components, image features
        - Shapes layer: draw polygons → press SHIFT+E → saved to adata.obs
        - Layer mgmt: toggle visibility, adjust opacity, delete layers
    """
    viewer = img.interactive(adata)

    # Screenshot from notebook
    from IPython.display import display
    display(viewer.screenshot(canvas_only=True))

    # After annotation in GUI (SHIFT+E), access results:
    # viewer.adata now contains new obs column with annotation
    print('Annotate regions in napari then press SHIFT+E')
    print('Results saved to viewer.adata.obs')

    return viewer


def interactive_gene_exploration(adata, img, gene_list=None):
    """Launch napari with pre-selected genes for exploration."""
    viewer = img.interactive(adata)

    # Take screenshots of specific genes programmatically
    # (genes are added via GUI; screenshots capture current view)
    viewer.screenshot(canvas_only=False)

    return viewer


def annotate_tissue_regions(adata, img):
    """Workflow: manually annotate tissue regions in napari, then analyze.

    Steps:
    1. Launch viewer
    2. In GUI: Shapes layer → add polygons → draw ROIs
    3. Press SHIFT+E → annotation saved to viewer.adata.obs
    4. Close napari and continue analysis in Python
    """
    viewer = img.interactive(adata)

    # After user annotates and closes napari:
    # viewer.adata.obs will contain the annotation (e.g., 'ROI_brain_shapes')
    # The annotation is boolean: True = spot inside polygon, False = outside

    # Visualize annotation with Squidpy
    if hasattr(viewer, 'adata'):
        new_cols = [c for c in viewer.adata.obs.columns
                    if c not in adata.obs.columns]
        if new_cols:
            print(f'Found annotation: {new_cols}')
            sq.pl.spatial_scatter(
                viewer.adata,
                color=['cluster'] + new_cols,
                save='_annotated_regions.pdf',
            )

    return viewer.adata
```

### 17.2 Modern: napari-spatialdata (Recommended)

```python
def launch_napari_spatialdata(sdata, headless=False):
    """Launch napari with napari-spatialdata plugin.

    Parameters
    ----------
    sdata : spatialdata.SpatialData
        SpatialData object containing images, labels, points, shapes, tables.
    headless : bool
        If True, return without launching GUI (for testing/CI).

    Returns
    -------
    interactive : napari_spatialdata.Interactive

    Usage:
        - Elements browser (bottom-left): select coordinate system → click element
        - View widget (right): browse obs/var/obsm → double-click to overlay
        - Scatter widget (Plugins menu): 2D scatter with lasso → annotate
    """
    from napari_spatialdata import Interactive

    interactive = Interactive(sdata)

    if not headless:
        interactive.run()  # opens napari window

    return interactive


def napari_view_widget_workflow(sdata):
    """Load data and use View widget for expression exploration.

    1. Load elements via Elements browser
    2. View widget shows AnnData obs/var/obsm for selected layer
    3. Double-click values to overlay on tissue
    """
    from napari_spatialdata import Interactive

    interactive = Interactive(sdata)
    interactive.run()

    # After interaction:
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.imshow(interactive.screenshot())
    ax.axis('off')
    fig.savefig('figures/napari_screenshot.pdf')
    plt.close(fig)

    return interactive


def napari_scatter_annotation_workflow(sdata, obs_color='cell_size'):
    """Use Scatter widget for cluster annotation.

    Steps:
    1. Load image + labels in Elements browser
    2. Open Scatter widget: Plugins → napari-spatialdata → Scatter
    3. Select obsm['spatial'] for axes, color by obs column
    4. Click "Plot" to render scatter
    5. Use lasso tool to select ROI
    6. Click "Annotate" → name the new annotation column
    7. New column appears in View widget → double-click to overlay
    """
    from napari_spatialdata import Interactive

    interactive = Interactive(sdata)
    interactive.run()

    # After annotation, access results:
    # sdata.table.obs contains the new annotation column
    print('Use lasso tool in Scatter widget to annotate, then click Annotate')
    print(f'Current obs columns: {sdata.table.obs.columns.tolist()}')

    return interactive
```

### 17.3 AnnData → SpatialData Conversion

```python
def convert_anndata_to_spatialdata(adata, img=None, sample_id='sample1'):
    """Convert Squidpy-loaded AnnData + ImageContainer to SpatialData.

    This enables use of napari-spatialdata (the modern, maintained viewer).

    Parameters
    ----------
    adata : AnnData
        Spatial data from sq.read.visium() or similar.
    img : sq.im.ImageContainer or None
        High-resolution tissue image. If None, attempts to extract from adata.uns.
    sample_id : str
        Sample identifier for the SpatialData table.

    Returns
    -------
    spatialdata.SpatialData
    """
    import spatialdata as sd
    from spatialdata import SpatialData
    from spatialdata.models import Image2DModel, Labels2DModel, TableModel
    import numpy as np

    # Extract image if not provided
    if img is None:
        # Try to find image in adata.uns['spatial']
        spatial_key = list(adata.uns['spatial'].keys())[0]
        hires_img = adata.uns['spatial'][spatial_key]['images']['hires']
        img = sq.im.ImageContainer(hires_img)

    # Register image as a SpatialData Image element
    image_element = Image2DModel.parse(
        img.data if hasattr(img, 'data') else np.array(img),
        dims=('y', 'x', 'c'),
    )

    # Register AnnData as a Table element
    adata.obs['region'] = sample_id  # required for SpatialData linking
    table_element = TableModel.parse(
        adata,
        region=sample_id,
        region_key='region',
        instance_key=adata.obs_names.name or 'spot_id',
    )

    # Build SpatialData object
    sdata = SpatialData(
        images={sample_id: image_element},
        table=table_element,
    )

    print(f'SpatialData: {sdata}')
    return sdata
```

### 17.4 Headless Screenshot Capture

```python
def capture_napari_screenshots(adata, img, gene_list, out_dir='figures/'):
    """Launch napari, visualize genes, capture screenshots, close.

    For headless/CI environments, napari won't render the GUI.
    Use this only in environments with a display.

    For truly headless: use sq.pl.spatial_scatter() instead.
    """
    import os
    os.makedirs(out_dir, exist_ok=True)

    viewer = img.interactive(adata)

    # Note: genes must be added via GUI (double-click), not programmatically.
    # This function demonstrates the screenshot API.

    viewer.screenshot(canvas_only=True)

    return viewer
```

## Figure Saving Utility

```python
def save_figure(fig, basename, out_dir='results/', dpi=150):
    """Save figure in both PDF and PNG formats."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    fig.savefig(f'{out_dir}/{basename}.pdf', bbox_inches='tight')
    fig.savefig(f'{out_dir}/{basename}.png', dpi=dpi, bbox_inches='tight')
    plt.close(fig)
    print(f'Saved: {out_dir}/{basename}.pdf')
```
