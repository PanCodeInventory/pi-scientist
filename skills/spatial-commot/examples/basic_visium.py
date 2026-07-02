#!/usr/bin/env python3
"""
COMMOT Spatial Cell-Cell Communication Analysis — 10x Visium Example

Complete analysis pipeline for Visium spatial transcriptomics data using COMMOT.
Demonstrates: database loading, spatial communication inference, cluster-level
analysis, direction vectors, and visualization.

Citation: Cang et al., Nature Methods 20, 218-228 (2023)
          DOI: 10.1038/s41592-022-01728-4
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
# Configuration — adjust these for your dataset
# ============================================================================
INPUT_FILE = "spatial_data.h5ad"          # or spaceranger directory
SPECIES = "mouse"                          # 'human' or 'mouse'
DATABASE = "CellChat"                      # 'CellChat' or 'CellPhoneDB_v4.0'
SIGNALING_TYPE = None                      # None=all, 'Secreted Signaling', etc.
DIS_THR = 250                              # Distance threshold for Visium (~55µm spots)
CLUSTERING_KEY = "cell_type"               # Column in adata.obs with annotations
N_PERMUTATIONS = 500                       # For cluster-level p-values
RANDOM_SEED = 42
OUTPUT_PREFIX = "commot_visium"

# ============================================================================
# Step 1: Load and preprocess data
# ============================================================================
print("=" * 60)
print("Step 1: Loading and preprocessing data")
print("=" * 60)

# Option A: Load from h5ad
try:
    adata = sc.read_h5ad(INPUT_FILE)
except Exception:
    # Option B: Load from SpaceRanger output
    adata = sc.datasets.visium_sge(sample_id='V1_Mouse_Brain_Sagittal_Posterior')

adata.var_names_make_unique()
print(f"Data shape: {adata.shape}")
print(f"Spatial coordinates range: {adata.obsm['spatial'].min(axis=0)} - {adata.obsm['spatial'].max(axis=0)}")

# Normalize
sc.pp.normalize_total(adata, inplace=True)
sc.pp.log1p(adata)

# Pre-compute spatial distance matrix (optional but recommended for reuse)
spatial_dist = distance_matrix(adata.obsm['spatial'], adata.obsm['spatial'])
adata.obsp['spatial_distance'] = csr_matrix(spatial_dist)
del spatial_dist  # Free memory

# Verify distance scale
dists = adata.obsp['spatial_distance'].data
print(f"Median NN distance: {np.median(dists):.1f}")
print(f"Distance threshold: {DIS_THR}")

# ============================================================================
# Step 2: Load and filter ligand-receptor database
# ============================================================================
print("\n" + "=" * 60)
print("Step 2: Loading L-R database")
print("=" * 60)

df_ligrec = ct.pp.ligand_receptor_database(
    database=DATABASE,
    species=SPECIES,
    signaling_type=SIGNALING_TYPE,
)
print(f"Total L-R pairs in database: {len(df_ligrec)}")
print(f"Pathways: {df_ligrec.iloc[:, 2].nunique()}")

# Filter to genes present in data
df_ligrec = ct.pp.filter_lr_database(
    df_ligrec, adata,
    heteromeric=True,
    heteromeric_delimiter='_',
    filter_criteria='min_cell_pct',
    min_cell_pct=0.05,
)
print(f"L-R pairs after filtering: {len(df_ligrec)}")

# ============================================================================
# Step 3: Infer spatial communication (core COMMOT analysis)
# ============================================================================
print("\n" + "=" * 60)
print("Step 3: Inferring spatial communication via collective OT")
print("=" * 60)

database_name = 'cellchat'

ct.tl.spatial_communication(
    adata,
    database_name=database_name,
    df_ligrec=df_ligrec,
    dis_thr=DIS_THR,
    heteromeric=True,
    heteromeric_rule='min',
    heteromeric_delimiter='_',
    pathway_sum=True,
    cot_eps_p=0.1,
    cot_rho=10.0,
    cot_nitermax=10000,
    cot_weights=(0.25, 0.25, 0.25, 0.25),
)

# Check results
sender = adata.obsm[f'commot-{database_name}-sum-sender']
receiver = adata.obsm[f'commot-{database_name}-sum-receiver']
total_col = 's-total-total'
print(f"Total sender signaling - mean: {sender[total_col].mean():.4f}, max: {sender[total_col].max():.4f}")
print(f"Total receiver signaling - mean: {receiver['r-total-total'].mean():.4f}, max: {receiver['r-total-total'].max():.4f}")
print(f"LR pairs with signaling: {len([c for c in sender.columns if c.startswith('s-') and c != 's-total-total' and sender[c].sum() > 0])}")

# Save intermediate results
adata.write_h5ad(f"{OUTPUT_PREFIX}_step3_communication.h5ad")

# ============================================================================
# Step 4: Cluster-level communication summary
# ============================================================================
print("\n" + "=" * 60)
print("Step 4: Cluster-level communication")
print("=" * 60)

if CLUSTERING_KEY in adata.obs.columns:
    ct.tl.cluster_communication(
        adata,
        database_name=database_name,
        clustering=CLUSTERING_KEY,
        n_permutations=N_PERMUTATIONS,
        random_seed=RANDOM_SEED,
    )
    print(f"Cluster-level communication computed for {adata.obs[CLUSTERING_KEY].nunique()} clusters")
else:
    print(f"Warning: '{CLUSTERING_KEY}' not found in adata.obs. Skipping cluster analysis.")

# ============================================================================
# Step 5: Signaling direction analysis
# ============================================================================
print("\n" + "=" * 60)
print("Step 5: Computing signaling direction vectors")
print("=" * 60)

# Get top pathways by total signaling
pathway_cols = [c for c in sender.columns if c.startswith('s-') and c != 's-total-total'
                and 'pathway' in c.lower() or not '_' in c.split('-', 1)[1]]

# Compute direction for top pathways
top_pathways = []
info = adata.uns[f'commot-{database_name}-info']
if 'df_ligrec' in info:
    pathways = info['df_ligrec'].iloc[:, 2].unique()
    for pw in pathways[:5]:  # Top 5 pathways
        try:
            ct.tl.communication_direction(
                adata,
                database_name=database_name,
                pathway_name=pw,
                k=5,
            )
            top_pathways.append(pw)
            print(f"  Direction computed for: {pw}")
        except Exception as e:
            print(f"  Skipped {pw}: {e}")

# ============================================================================
# Step 6: Visualization
# ============================================================================
print("\n" + "=" * 60)
print("Step 6: Generating visualizations")
print("=" * 60)

# 6a: Total signaling on tissue
adata.obs['total_sender'] = sender['s-total-total'].values
adata.obs['total_receiver'] = receiver['r-total-total'].values

fig, axes = plt.subplots(1, 2, figsize=(16, 7))
sc.pl.spatial(adata, color='total_sender', cmap='Reds', ax=axes[0], show=False,
              title='Total Signaling (Sender)', vmin=0)
sc.pl.spatial(adata, color='total_receiver', cmap='Blues', ax=axes[1], show=False,
              title='Total Signaling (Receiver)', vmin=0)
plt.tight_layout()
plt.savefig(f"{OUTPUT_PREFIX}_total_signaling.png", dpi=200, bbox_inches='tight')
plt.savefig(f"{OUTPUT_PREFIX}_total_signaling.pdf", bbox_inches='tight')
plt.close()
print("  Saved: total signaling spatial plots")

# 6b: Signaling direction for top pathways
for pw in top_pathways:
    for plot_method in ['cell', 'stream']:
        try:
            fig, ax = plt.subplots(1, 1, figsize=(10, 10))
            ct.pl.plot_cell_communication(
                adata,
                database_name=database_name,
                pathway_name=pw,
                plot_method=plot_method,
                background='summary',
                summary='sender',
                ndsize=0.5,
                scale=1.0,
                ax=ax,
            )
            plt.title(f'{pw} Signaling Direction ({plot_method})')
            plt.savefig(f"{OUTPUT_PREFIX}_{pw}_direction_{plot_method}.png", dpi=200, bbox_inches='tight')
            plt.savefig(f"{OUTPUT_PREFIX}_{pw}_direction_{plot_method}.pdf", bbox_inches='tight')
            plt.close()
            print(f"  Saved: {pw} direction ({plot_method})")
        except Exception as e:
            print(f"  Skipped {pw} {plot_method}: {e}")

# 6c: Cluster communication network
if CLUSTERING_KEY in adata.obs.columns:
    try:
        ct.pl.plot_cluster_communication_network(
            adata,
            uns_names=[f'commot-{database_name}-cluster_communication'],
            clustering=CLUSTERING_KEY,
            filename=f'{OUTPUT_PREFIX}_cluster_network.pdf',
        )
        print("  Saved: cluster communication network")
    except Exception as e:
        print(f"  Skipped cluster network: {e}")

# 6d: Top LR pairs spatial expression
lr_cols = [c for c in sender.columns if c.startswith('s-') and sender[c].sum() > 0]
lr_cols.sort(key=lambda c: sender[c].sum(), reverse=True)

for col in lr_cols[:6]:
    lr_name = col[2:]  # Remove 's-' prefix
    adata.obs[f'sender_{lr_name}'] = sender[col].values
    rec_col = f'r-{lr_name}'
    if rec_col in receiver.columns:
        adata.obs[f'receiver_{lr_name}'] = receiver[rec_col].values

    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    sc.pl.spatial(adata, color=f'sender_{lr_name}', cmap='Reds', ax=axes[0], show=False,
                  title=f'Sender: {lr_name}', vmin=0)
    if f'receiver_{lr_name}' in adata.obs.columns:
        sc.pl.spatial(adata, color=f'receiver_{lr_name}', cmap='Blues', ax=axes[1], show=False,
                      title=f'Receiver: {lr_name}', vmin=0)
    plt.tight_layout()
    plt.savefig(f"{OUTPUT_PREFIX}_LR_{lr_name.replace('-', '_')}.png", dpi=200, bbox_inches='tight')
    plt.close()

print(f"  Saved top {min(6, len(lr_cols))} LR pair spatial plots")

# ============================================================================
# Step 7: Save final results
# ============================================================================
print("\n" + "=" * 60)
print("Step 7: Saving final results")
print("=" * 60)

adata.write_h5ad(f"{OUTPUT_PREFIX}_final.h5ad")

# Summary report
print("\n" + "=" * 60)
print("ANALYSIS COMPLETE — Summary")
print("=" * 60)
print(f"Dataset: {adata.n_obs} cells/spots × {adata.n_vars} genes")
print(f"L-R database: {DATABASE} ({SPECIES})")
print(f"Distance threshold: {DIS_THR}")
print(f"L-R pairs analyzed: {len(df_ligrec)}")
print(f"L-R pairs with signaling: {len(lr_cols)}")
print(f"Top LR pairs: {[c[2:] for c in lr_cols[:10]]}")
if CLUSTERING_KEY in adata.obs.columns:
    print(f"Clusters: {adata.obs[CLUSTERING_KEY].nunique()}")
print(f"Output files: {OUTPUT_PREFIX}_*.png, {OUTPUT_PREFIX}_*.pdf")
print(f"Saved AnnData: {OUTPUT_PREFIX}_final.h5ad")
