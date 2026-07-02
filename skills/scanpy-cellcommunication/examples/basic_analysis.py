#!/usr/bin/env python3
"""
LIANA+ Basic Analysis Example
==============================

Minimal working example of cell-cell communication analysis using LIANA+
with the pbmc68k_reduced dataset from scanpy.

Usage:
    python basic_analysis.py
"""

import scanpy as sc
import liana as li
import matplotlib.pyplot as plt
import warnings

warnings.filterwarnings("ignore")


def load_and_prepare_data():
    """Load pbmc68k data and prepare for LIANA+ analysis."""
    print("=" * 60)
    print("Step 1: Loading and preparing data")
    print("=" * 60)

    # Load pbmc68k reduced dataset
    adata = sc.datasets.pbmc68k_reduced()
    print(f"Loaded data: {adata.shape[0]} cells x {adata.shape[1]} genes")

    # The dataset already has 'bulk_labels' for cell type annotation
    # Rename for clarity
    if 'bulk_labels' in adata.obs.columns:
        adata.obs['cell_type'] = adata.obs['bulk_labels'].astype(str)
        print(f"Cell types: {adata.obs['cell_type'].unique().tolist()}")

    # Ensure raw counts exist
    if adata.raw is None:
        adata.raw = adata
        print("Copied current data to adata.raw")

    # Check cell counts per type
    print("\nCells per type:")
    print(adata.obs['cell_type'].value_counts())

    return adata


def run_liana_consensus(adata):
    """Run LIANA+ consensus rank aggregation."""
    print("\n" + "=" * 60)
    print("Step 2: Running LIANA+ consensus analysis")
    print("=" * 60)

    liana_res = li.mt.rank_aggregate(
        adata,
        groupby='cell_type',
        resource_name='consensus',
        expr_prop=0.1,
        use_raw=True,
        n_perms=100,
        min_cells=5,
        seed=42,
        verbose=True,
    )

    print(f"\nResults shape: {liana_res.shape}")
    print(f"Columns: {liana_res.columns.tolist()}")
    print(f"\nTop 10 interactions by magnitude_rank:")
    print(liana_res.nsmallest(10, 'magnitude_rank')[
        ['ligand', 'receptor', 'source', 'target',
         'magnitude_rank', 'specificity_rank']
    ].to_string(index=False))

    return liana_res


def visualize_results(liana_res):
    """Generate visualizations of CCC results."""
    print("\n" + "=" * 60)
    print("Step 3: Visualizing results")
    print("=" * 60)

    # Dot plot
    print("Generating dot plot...")
    li.pl.dotplot(
        liana_res,
        uns_keys=['magnitude_rank', 'specificity_rank'],
        figure_size=(10, 12),
        cmap='coolwarm',
        size_range=(0.5, 30),
        rotate_labels=True,
        title='PBMC68k Cell-Cell Communication',
    )
    plt.savefig("basic_dotplot.pdf", dpi=300, bbox_inches='tight')
    plt.savefig("basic_dotplot.png", dpi=150, bbox_inches='tight')
    plt.close()
    print("  Saved: basic_dotplot.pdf, basic_dotplot.png")

    # Heatmap
    print("Generating heatmap...")
    li.pl.heatmap(
        liana_res,
        uns_keys=['magnitude_rank'],
        figure_size=(10, 12),
        cmap='viridis',
    )
    plt.savefig("basic_heatmap.pdf", dpi=300, bbox_inches='tight')
    plt.savefig("basic_heatmap.png", dpi=150, bbox_inches='tight')
    plt.close()
    print("  Saved: basic_heatmap.pdf, basic_heatmap.png")


def filter_and_export(liana_res):
    """Filter top interactions and export results."""
    print("\n" + "=" * 60)
    print("Step 4: Filtering and exporting results")
    print("=" * 60)

    # High-confidence interactions: top 5% in both magnitude and specificity
    top = liana_res[
        (liana_res['magnitude_rank'] < 0.05) &
        (liana_res['specificity_rank'] < 0.05)
    ].sort_values('magnitude_rank')

    print(f"High-confidence interactions (magnitude < 0.05, specificity < 0.05): {len(top)}")
    print(f"\nTop 20 high-confidence interactions:")
    print(top.head(20)[
        ['ligand', 'receptor', 'source', 'target',
         'magnitude_rank', 'specificity_rank']
    ].to_string(index=False))

    # Export results
    liana_res.to_csv("basic_liana_results.csv", index=False)
    top.to_csv("basic_liana_top_interactions.csv", index=False)
    print("\nExported: basic_liana_results.csv, basic_liana_top_interactions.csv")


def main():
    """Run the complete basic analysis workflow."""
    print("\n" + "#" * 60)
    print("# LIANA+ Basic Analysis Example")
    print("# Dataset: pbmc68k_reduced")
    print("#" * 60 + "\n")

    # Step 1: Load data
    adata = load_and_prepare_data()

    # Step 2: Run LIANA+ consensus
    liana_res = run_liana_consensus(adata)

    # Step 3: Visualize
    visualize_results(liana_res)

    # Step 4: Filter and export
    filter_and_export(liana_res)

    print("\n" + "=" * 60)
    print("Analysis complete!")
    print("Output files:")
    print("  - basic_liana_results.csv")
    print("  - basic_liana_top_interactions.csv")
    print("  - basic_dotplot.pdf / .png")
    print("  - basic_heatmap.pdf / .png")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    main()
