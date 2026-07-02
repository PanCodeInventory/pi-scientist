#!/usr/bin/env python3
"""
COMMOT Downstream Analysis — Communication Impact & DEG Detection

After running spatial_communication (Step 3), use this script for downstream:
1. Communication impact analysis (which genes are influenced by signaling)
2. Communication-dependent gene detection (requires R/tradeSeq)
3. Spatial autocorrelation of signaling
4. Grouping similar communication patterns

Prerequisite: Run basic_visium.py or basic_merfish.py first to get
              the AnnData with communication results.
"""

import commot as ct
import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# Configuration
# ============================================================================
INPUT_FILE = "commot_visium_final.h5ad"     # Output from basic analysis
DATABASE_NAME = "cellchat"
CLUSTERING_KEY = "cell_type"
OUTPUT_PREFIX = "commot_downstream"

# ============================================================================
# Load data with communication results
# ============================================================================
print("Loading COMMOT results...")
adata = sc.read_h5ad(INPUT_FILE)
print(f"Data: {adata.n_obs} cells × {adata.n_vars} genes")

# Verify communication results exist
assert f'commot-{DATABASE_NAME}-info' in adata.uns, \
    f"No COMMOT results found for '{DATABASE_NAME}'. Run basic analysis first."

sender = adata.obsm[f'commot-{DATABASE_NAME}-sum-sender']
print(f"Active L-R pairs: {len([c for c in sender.columns if sender[c].sum() > 0])}")

# Get available pathways
info = adata.uns[f'commot-{DATABASE_NAME}-info']
pathways = info['df_ligrec'].iloc[:, 2].unique()
print(f"Available pathways: {pathways[:10]}")

# ============================================================================
# Analysis 1: Communication Impact on Gene Expression
# ============================================================================
print("\n" + "=" * 60)
print("Analysis 1: Communication Impact")
print("=" * 60)

# For each major pathway, identify genes whose expression correlates with signaling
impact_results = {}

for pw in pathways[:5]:  # Top 5 pathways
    try:
        # Method A: Partial correlation (fast)
        df_impact = ct.tl.communication_impact(
            adata,
            database_name=DATABASE_NAME,
            pathway_name=pw,
            method='partial_corr',
            corr_method='spearman',
        )
        
        if df_impact is not None and len(df_impact) > 0:
            # Top impacted genes
            top_genes = df_impact.head(20)
            impact_results[pw] = top_genes
            print(f"\n{pw} — Top impacted genes:")
            print(top_genes[['gene', 'score']].head(10).to_string(index=False))
        
        # Visualize
        try:
            fig, ax = plt.subplots(figsize=(12, 8))
            ct.pl.plot_communication_impact(df_impact)
            plt.title(f'Communication Impact: {pw}')
            plt.tight_layout()
            plt.savefig(f"{OUTPUT_PREFIX}_impact_{pw}.png", dpi=200, bbox_inches='tight')
            plt.savefig(f"{OUTPUT_PREFIX}_impact_{pw}.pdf", bbox_inches='tight')
            plt.close()
        except Exception as e:
            print(f"  Visualization skipped for {pw}: {e}")
    
    except Exception as e:
        print(f"  Impact analysis failed for {pw}: {e}")

# ============================================================================
# Analysis 2: Communication-Dependent Genes (requires R/tradeSeq)
# ============================================================================
print("\n" + "=" * 60)
print("Analysis 2: Communication-Dependent Genes")
print("=" * 60)

# Check if R/tradeSeq is available
deg_available = False
try:
    import rpy2.robjects as ro
    deg_available = True
    print("R/tradeSeq interface available.")
except ImportError:
    print("R/tradeSeq not available. Skipping DEG detection.")
    print("To enable: pip install commot[tradeSeq]")

if deg_available:
    for pw in pathways[:3]:
        try:
            df_deg, df_yhat = ct.tl.communication_deg_detection(
                adata,
                database_name=DATABASE_NAME,
                pathway_name=pw,
                summary='receiver',
                nknots=6,
                n_deg_genes=200,
                deg_pvalue_cutoff=0.05,
            )
            
            if df_deg is not None and len(df_deg) > 0:
                print(f"\n{pw} — {len(df_deg)} communication-dependent genes")
                
                # Cluster DEGs by expression pattern
                try:
                    df_deg_clustered = ct.tl.communication_deg_clustering(df_deg, df_yhat)
                    print(f"  DEGs clustered into patterns")
                except Exception as e:
                    print(f"  DEG clustering skipped: {e}")
                
                # Visualize
                try:
                    ct.pl.plot_communication_dependent_genes(df_deg, df_yhat)
                    plt.savefig(f"{OUTPUT_PREFIX}_deg_{pw}.png", dpi=200, bbox_inches='tight')
                    plt.close()
                except Exception:
                    pass
        
        except Exception as e:
            print(f"  DEG detection failed for {pw}: {e}")
            print("  This usually means R/tradeSeq is not properly installed.")

# ============================================================================
# Analysis 3: Spatial Autocorrelation of Signaling
# ============================================================================
print("\n" + "=" * 60)
print("Analysis 3: Spatial Autocorrelation of Signaling Vectors")
print("=" * 60)

for pw in pathways[:3]:
    try:
        # Check if direction was computed
        dir_key_sender = f'commot-{DATABASE_NAME}-direction-sender'
        if dir_key_sender in adata.obsm:
            ct.tl.communication_spatial_autocorrelation(
                adata,
                database_name=DATABASE_NAME,
                pathway_name=pw,
                method='Moran',
                n_permutations=999,
            )
            print(f"  {pw}: spatial autocorrelation computed")
    except Exception as e:
        print(f"  {pw}: skipped ({e})")

# ============================================================================
# Analysis 4: Group Similar Communication Patterns
# ============================================================================
print("\n" + "=" * 60)
print("Analysis 4: Grouping Similar Communication Patterns")
print("=" * 60)

if CLUSTERING_KEY in adata.obs.columns:
    try:
        ct.tl.group_cluster_communication(
            adata,
            clustering=CLUSTERING_KEY,
            dissimilarity_method='jaccard',
            leiden_resolution=1.0,
        )
        print("  Cluster communication patterns grouped by similarity")
    except Exception as e:
        print(f"  Grouping failed: {e}")

# ============================================================================
# Analysis 5: Custom Summary Statistics
# ============================================================================
print("\n" + "=" * 60)
print("Analysis 5: Summary Statistics")
print("=" * 60)

sender = adata.obsm[f'commot-{DATABASE_NAME}-sum-sender']
receiver = adata.obsm[f'commot-{DATABASE_NAME}-sum-receiver']

# Top senders and receivers
lr_cols = [c for c in sender.columns if c.startswith('s-') and c != 's-total-total']
lr_cols.sort(key=lambda c: sender[c].sum(), reverse=True)

print("\nTop 10 LR pairs by total signaling:")
print(f"{'LR Pair':<30} {'Total Sender':>12} {'Total Receiver':>14} {'Mean Sender':>12}")
for col in lr_cols[:10]:
    lr_name = col[2:]
    rec_col = f'r-{lr_name}'
    total_s = sender[col].sum()
    total_r = receiver[rec_col].sum() if rec_col in receiver.columns else 0
    mean_s = sender[col].mean()
    print(f"{lr_name:<30} {total_s:>12.2f} {total_r:>14.2f} {mean_s:>12.4f}")

# Per-cluster signaling summary
if CLUSTERING_KEY in adata.obs.columns:
    print(f"\nPer-cluster total signaling:")
    adata.obs['total_sender'] = sender['s-total-total'].values
    adata.obs['total_receiver'] = receiver['r-total-total'].values
    
    cluster_summary = adata.obs.groupby(CLUSTERING_KEY).agg({
        'total_sender': ['mean', 'sum', 'count'],
        'total_receiver': ['mean', 'sum'],
    }).round(4)
    print(cluster_summary.to_string())

# ============================================================================
# Save results
# ============================================================================
adata.write_h5ad(f"{OUTPUT_PREFIX}_final.h5ad")
print(f"\nResults saved to {OUTPUT_PREFIX}_final.h5ad")
print("Analysis complete.")
