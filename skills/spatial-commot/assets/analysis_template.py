#!/usr/bin/env python3
"""
COMMOT Analysis Template — Quick Start

A minimal template for running COMMOT on spatial transcriptomics data.
Fill in the configuration section and run.

Usage:
    python analysis_template.py
"""

import commot as ct
import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ============================================================
# CONFIGURATION — Edit this section for your data
# ============================================================
INPUT = "your_data.h5ad"           # Path to AnnData with spatial coords
SPECIES = "human"                   # 'human' or 'mouse'
DB = "CellChat"                     # 'CellChat' or 'CellPhoneDB_v4.0'
DIS_THR = 250                       # Distance threshold (Visium: 250, MERFISH: 50)
CLUSTER_KEY = "cell_type"           # Cluster column in adata.obs
DB_NAME = "cellchat"                # Storage key name (arbitrary)
OUT = "commot_results"              # Output file prefix

# ============================================================
# ANALYSIS
# ============================================================

# Load and normalize
adata = sc.read_h5ad(INPUT)
adata.var_names_make_unique()
sc.pp.normalize_total(adata, inplace=True)
sc.pp.log1p(adata)

# Load L-R database and filter
df_lr = ct.pp.ligand_receptor_database(database=DB, species=SPECIES)
df_lr = ct.pp.filter_lr_database(df_lr, adata, heteromeric=True, min_cell_pct=0.05)

# Run COMMOT
ct.tl.spatial_communication(
    adata, database_name=DB_NAME, df_ligrec=df_lr,
    dis_thr=DIS_THR, heteromeric=True, pathway_sum=True,
)

# Cluster-level summary
if CLUSTER_KEY in adata.obs.columns:
    ct.tl.cluster_communication(
        adata, database_name=DB_NAME,
        clustering=CLUSTER_KEY, n_permutations=500, random_seed=42,
    )

# Visualize top signaling
sender = adata.obsm[f'commot-{DB_NAME}-sum-sender']
adata.obs['total_sender'] = sender['s-total-total'].values

fig, ax = plt.subplots(figsize=(10, 8))
sc.pl.spatial(adata, color='total_sender', cmap='Reds', ax=ax, show=False,
              title='Total Signaling (Sender)')
plt.savefig(f'{OUT}_signaling.png', dpi=200, bbox_inches='tight')
plt.savefig(f'{OUT}_signaling.pdf', bbox_inches='tight')

# Save
adata.write_h5ad(f'{OUT}.h5ad')
print(f"Done. Results saved to {OUT}.h5ad")
