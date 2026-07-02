#!/usr/bin/env python3
"""
COMMOT Spatial Cell-Cell Communication — MERFISH / Single-Cell Resolution Example

Analysis pipeline for single-cell resolution spatial transcriptomics (MERFISH,
seqFISH+, Slide-seq, Xenium) using COMMOT. Key differences from Visium:
- Smaller distance threshold (30-75µm instead of 200-300)
- More cells, potentially longer computation
- Single-cell resolution allows finer signaling patterns
"""

import commot as ct
import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import distance_matrix
from scipy.sparse import csr_matrix
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# Configuration — MERFISH / single-cell resolution
# ============================================================================
INPUT_FILE = "merfish_data.h5ad"
SPECIES = "mouse"
DATABASE = "CellChat"
SIGNALING_TYPE = None
DIS_THR = 50                               # Smaller threshold for single-cell resolution
CLUSTERING_KEY = "cell_type"
N_PERMUTATIONS = 500
RANDOM_SEED = 42
OUTPUT_PREFIX = "commot_merfish"

# ============================================================================
# Step 1: Load and preprocess
# ============================================================================
print("Loading MERFISH data...")
adata = sc.read_h5ad(INPUT_FILE)
adata.var_names_make_unique()
print(f"Data: {adata.n_obs} cells × {adata.n_vars} genes")

# Check coordinate scale
coords = adata.obsm['spatial']
print(f"Coordinates range: X=[{coords[:,0].min():.0f}, {coords[:,0].max():.0f}], "
      f"Y=[{coords[:,1].min():.0f}, {coords[:,1].max():.0f}]")

# Compute nearest-neighbor distance to verify dis_thr
from scipy.spatial import cKDTree
tree = cKDTree(coords)
nn_dists, _ = tree.query(coords, k=2)  # k=2 because k=1 is self
nn_dists = nn_dists[:, 1]  # exclude self
print(f"Median NN distance: {np.median(nn_dists):.1f}")
print(f"Using dis_thr={DIS_THR} ({DIS_THR/np.median(nn_dists):.1f}× median NN distance)")

# Normalize
sc.pp.normalize_total(adata, inplace=True)
sc.pp.log1p(adata)

# ============================================================================
# Step 2: Load and filter L-R database
# ============================================================================
print("\nLoading L-R database...")
df_ligrec = ct.pp.ligand_receptor_database(
    database=DATABASE,
    species=SPECIES,
    signaling_type=SIGNALING_TYPE,
)

# For MERFISH with limited gene panels, filter more aggressively
df_ligrec = ct.pp.filter_lr_database(
    df_ligrec, adata,
    heteromeric=True,
    filter_criteria='min_cell_pct',
    min_cell_pct=0.03,  # More permissive for targeted panels
)
print(f"L-R pairs after filtering: {len(df_ligrec)}")

if len(df_ligrec) == 0:
    print("ERROR: No L-R pairs found. Check gene name compatibility.")
    print("Available genes:", adata.var_names[:20].tolist())
    exit(1)

# ============================================================================
# Step 3: Spatial communication inference
# ============================================================================
print("\nInferring spatial communication...")

# For large single-cell datasets, reduce iterations
n_cells = adata.n_obs
if n_cells > 10000:
    n_iter = 3000
    print(f"Large dataset ({n_cells} cells): using cot_nitermax={n_iter}")
else:
    n_iter = 10000

database_name = 'cellchat'

ct.tl.spatial_communication(
    adata,
    database_name=database_name,
    df_ligrec=df_ligrec,
    dis_thr=DIS_THR,
    heteromeric=True,
    heteromeric_rule='min',
    pathway_sum=True,
    cot_eps_p=0.05,          # Slightly lower for single-cell resolution
    cot_rho=10.0,
    cot_nitermax=n_iter,
)

# Verify results
sender = adata.obsm[f'commot-{database_name}-sum-sender']
active_pairs = [c for c in sender.columns if c.startswith('s-') and c != 's-total-total' and sender[c].sum() > 0]
print(f"Active L-R pairs: {len(active_pairs)}")

adata.write_h5ad(f"{OUTPUT_PREFIX}_communication.h5ad")

# ============================================================================
# Step 4: Cluster communication
# ============================================================================
if CLUSTERING_KEY in adata.obs.columns:
    print("\nComputing cluster-level communication...")
    ct.tl.cluster_communication(
        adata,
        database_name=database_name,
        clustering=CLUSTERING_KEY,
        n_permutations=N_PERMUTATIONS,
        random_seed=RANDOM_SEED,
    )

# ============================================================================
# Step 5: Direction analysis and visualization
# ============================================================================
print("\nComputing signaling directions...")

# Get pathways
info = adata.uns[f'commot-{database_name}-info']
pathways = info['df_ligrec'].iloc[:, 2].unique()

for pw in pathways[:5]:
    try:
        ct.tl.communication_direction(
            adata,
            database_name=database_name,
            pathway_name=pw,
            k=8,  # Slightly higher k for smoother directions
        )
        
        # Stream plot (good for tissue-scale patterns in single-cell data)
        fig, ax = plt.subplots(1, 1, figsize=(12, 10))
        ct.pl.plot_cell_communication(
            adata,
            database_name=database_name,
            pathway_name=pw,
            plot_method='stream',
            background='summary',
            summary='sender',
            stream_density=1.5,
            stream_linewidth=1,
            ax=ax,
        )
        plt.title(f'{pw} Signaling Streamlines')
        plt.savefig(f"{OUTPUT_PREFIX}_{pw}_stream.png", dpi=200, bbox_inches='tight')
        plt.close()
        
        # Cell-level quiver plot
        fig, ax = plt.subplots(1, 1, figsize=(12, 10))
        ct.pl.plot_cell_communication(
            adata,
            database_name=database_name,
            pathway_name=pw,
            plot_method='cell',
            background='summary',
            summary='sender',
            ndsize=0.3,
            scale=0.8,
            ax=ax,
        )
        plt.title(f'{pw} Signaling Direction')
        plt.savefig(f"{OUTPUT_PREFIX}_{pw}_cell.png", dpi=200, bbox_inches='tight')
        plt.close()
        
        print(f"  {pw}: direction plots saved")
    except Exception as e:
        print(f"  {pw}: skipped ({e})")

# ============================================================================
# Step 6: Visualize top interactions spatially
# ============================================================================
sender = adata.obsm[f'commot-{database_name}-sum-sender']
receiver = adata.obsm[f'commot-{database_name}-sum-receiver']

lr_cols = [c for c in sender.columns if c.startswith('s-') and sender[c].sum() > 0]
lr_cols.sort(key=lambda c: sender[c].sum(), reverse=True)

for col in lr_cols[:8]:
    lr_name = col[2:]
    adata.obs[f'sig_{lr_name}'] = sender[col].values + receiver[f'r-{lr_name}'].values

    fig, ax = plt.subplots(1, 1, figsize=(10, 8))
    sc.pl.spatial(adata, color=f'sig_{lr_name}', cmap='viridis', ax=ax, show=False,
                  title=f'Signaling: {lr_name}', size=10)
    plt.savefig(f"{OUTPUT_PREFIX}_LR_{lr_name.replace('-', '_')}.png", dpi=200, bbox_inches='tight')
    plt.close()

print(f"\nTop 5 LR pairs: {[c[2:] for c in lr_cols[:5]]}")

# ============================================================================
# Save final
# ============================================================================
adata.write_h5ad(f"{OUTPUT_PREFIX}_final.h5ad")
print(f"\nAnalysis complete. Output: {OUTPUT_PREFIX}_*")
