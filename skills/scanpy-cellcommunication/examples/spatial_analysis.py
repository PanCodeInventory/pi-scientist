#!/usr/bin/env python3
"""
LIANA+ Spatial Analysis Example
================================

Spatial bivariate analysis of cell-cell communication using LIANA+
with spatial transcriptomics data.

This example demonstrates:
1. Loading spatial data (Visium or similar)
2. Running spatial bivariate analysis (liana.mt.bivar)
3. Cross-validating with expression-based LIANA+ results
4. Visualizing spatially-resolved communication

Usage:
    python spatial_analysis.py [--sample SAMPLE_ID]

Requirements:
    pip install liana squidpy scanpy
"""

import argparse
import scanpy as sc
import squidpy as sq
import liana as li
import matplotlib.pyplot as plt
import numpy as np
import warnings

warnings.filterwarnings("ignore")


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="LIANA+ spatial bivariate analysis example"
    )
    parser.add_argument(
        "--sample",
        type=str,
        default="V1_Breast_Cancer_Block_A_Section_1",
        help="Visium sample ID (default: V1_Breast_Cancer_Block_A_Section_1)",
    )
    parser.add_argument(
        "--n-perms",
        type=int,
        default=200,
        help="Number of permutations for bivar analysis (default: 200)",
    )
    parser.add_argument(
        "--expr-prop",
        type=float,
        default=0.1,
        help="Minimum expression proportion (default: 0.1)",
    )
    parser.add_argument(
        "--output-prefix",
        type=str,
        default="spatial",
        help="Prefix for output files (default: spatial)",
    )
    return parser.parse_args()


def load_spatial_data(sample_id):
    """Load and prepare spatial transcriptomics data."""
    print("=" * 60)
    print("Step 1: Loading spatial transcriptomics data")
    print("=" * 60)

    # Load Visium spatial data
    adata = sc.datasets.visium_sge(sample_id=sample_id, include_hires_tiff=False)
    print(f"Loaded spatial data: {adata.shape[0]} cells x {adata.shape[1]} genes")

    # Get cell type annotations (from squdipy breast cancer dataset)
    # In practice, use your own annotated data
    # adata.obs['cell_type'] = adata.obs['cell_type']  # or your annotation

    # Check available annotations
    print(f"Available obs columns: {adata.obs.columns.tolist()}")
    print(f"Spatial coordinates shape: {adata.obsm.get('spatial', np.array([])).shape}")

    # Standard preprocessing for spatial data
    sc.pp.calculate_qc_metrics(adata, inplace=True)
    sc.pp.filter_genes(adata, min_cells=10)
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)

    # Save raw for LIANA
    adata.raw = adata

    return adata


def run_spatial_bivar(adata, n_perms=200, expr_prop=0.1):
    """Run spatial bivariate analysis."""
    print("\n" + "=" * 60)
    print("Step 2: Running spatial bivariate analysis")
    print("=" * 60)

    # Determine groupby column
    groupby = 'cell_type' if 'cell_type' in adata.obs.columns else 'cluster'

    if groupby not in adata.obs.columns:
        # Create simple clusters if no annotation exists
        print(f"No '{groupby}' column found. Creating Leiden clusters...")
        sc.pp.highly_variable_genes(adata, n_top_genes=2000)
        adata_sub = adata[:, adata.var.highly_variable]
        sc.tl.pca(adata_sub)
        sc.pp.neighbors(adata_sub)
        sc.tl.leiden(adata_sub, resolution=0.5)
        adata.obs['cluster'] = adata_sub.obs['leiden']
        groupby = 'cluster'

    print(f"Using groupby: '{groupby}'")
    print(f"Groups: {adata.obs[groupby].unique().tolist()}")

    # Run spatial bivariate analysis
    bivar_res = li.mt.bivar(
        adata,
        groupby=groupby,
        resource_name='consensus',
        n_perms=n_perms,
        expr_prop=expr_prop,
        seed=42,
    )

    print(f"\nSpatial bivariate results: {bivar_res.shape[0]} interactions")
    if len(bivar_res) > 0:
        print(f"Columns: {bivar_res.columns.tolist()}")
        print(f"\nTop 10 spatially correlated LR pairs:")
        print(bivar_res.head(10).to_string(index=False))

    return bivar_res, groupby


def run_expression_liana(adata, groupby):
    """Run expression-based LIANA+ for cross-validation."""
    print("\n" + "=" * 60)
    print("Step 3: Running expression-based LIANA+ for cross-validation")
    print("=" * 60)

    liana_res = li.mt.rank_aggregate(
        adata,
        groupby=groupby,
        resource_name='consensus',
        expr_prop=0.1,
        use_raw=True,
        n_perms=100,
        seed=42,
        verbose=False,
    )

    print(f"Expression-based results: {liana_res.shape[0]} interactions")

    return liana_res


def compare_spatial_expression(bivar_res, liana_res, output_prefix):
    """Compare spatial and expression-based results."""
    print("\n" + "=" * 60)
    print("Step 4: Comparing spatial and expression results")
    print("=" * 60)

    if len(bivar_res) == 0:
        print("No spatial results to compare.")
        return

    # Get LR pairs from each analysis
    spatial_pairs = set(zip(bivar_res['ligand'], bivar_res['receptor']))
    expression_pairs = set(zip(liana_res['ligand'], liana_res['receptor']))

    # Find overlapping interactions
    validated = spatial_pairs & expression_pairs
    spatial_only = spatial_pairs - expression_pairs
    expression_only = expression_pairs - spatial_pairs

    print(f"\nSpatial interactions: {len(spatial_pairs)}")
    print(f"Expression interactions: {len(expression_pairs)}")
    print(f"Overlap (validated): {len(validated)}")
    print(f"Spatial only: {len(spatial_only)}")
    print(f"Expression only: {len(expression_only)}")

    # Get validated interaction details
    if len(validated) > 0:
        validated_df = liana_res[
            liana_res.apply(lambda r: (r['ligand'], r['receptor']) in validated, axis=1)
        ].sort_values('magnitude_rank')

        print(f"\nTop 20 spatially validated interactions:")
        print(validated_df.head(20)[
            ['ligand', 'receptor', 'source', 'target',
             'magnitude_rank', 'specificity_rank']
        ].to_string(index=False))

        validated_df.to_csv(f"{output_prefix}_validated_interactions.csv", index=False)

    # Export all results
    bivar_res.to_csv(f"{output_prefix}_bivar_results.csv", index=False)
    liana_res.to_csv(f"{output_prefix}_liana_results.csv", index=False)

    return validated


def visualize_spatial(adata, bivar_res, output_prefix):
    """Visualize spatial communication results."""
    print("\n" + "=" * 60)
    print("Step 5: Visualizing spatial results")
    print("=" * 60)

    if len(bivar_res) == 0:
        print("No spatial results to visualize.")
        return

    # Spatial scatter plot of cell types
    fig, ax = plt.subplots(figsize=(10, 8))
    groupby = 'cell_type' if 'cell_type' in adata.obs.columns else 'cluster'
    sc.pl.spatial(
        adata,
        color=groupby,
        ax=ax,
        show=False,
        title=f"Spatial Distribution ({groupby})",
    )
    plt.savefig(f"{output_prefix}_spatial_layout.pdf", dpi=300, bbox_inches='tight')
    plt.savefig(f"{output_prefix}_spatial_layout.png", dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Saved: {output_prefix}_spatial_layout.pdf/.png")

    # Top spatial LR pair expression
    if len(bivar_res) > 0:
        top_lr = bivar_res.iloc[0]
        ligand, receptor = top_lr['ligand'], top_lr['receptor']

        # Plot ligand and receptor expression spatially
        genes_to_plot = [g for g in [ligand, receptor] if g in adata.var_names]
        if genes_to_plot:
            fig, axes = plt.subplots(1, len(genes_to_plot), figsize=(5 * len(genes_to_plot), 5))
            if len(genes_to_plot) == 1:
                axes = [axes]
            for ax, gene in zip(axes, genes_to_plot):
                sc.pl.spatial(
                    adata,
                    color=gene,
                    ax=ax,
                    show=False,
                    cmap='magma',
                    title=f"{gene} expression",
                )
            plt.tight_layout()
            plt.savefig(f"{output_prefix}_top_lr_spatial.pdf", dpi=300, bbox_inches='tight')
            plt.close()
            print(f"  Saved: {output_prefix}_top_lr_spatial.pdf")


def main():
    """Run the complete spatial analysis workflow."""
    args = parse_args()

    print("\n" + "#" * 60)
    print("# LIANA+ Spatial Analysis Example")
    print(f"# Sample: {args.sample}")
    print(f"# Permutations: {args.n_perms}")
    print("#" * 60 + "\n")

    # Step 1: Load spatial data
    adata = load_spatial_data(args.sample)

    # Step 2: Run spatial bivariate analysis
    bivar_res, groupby = run_spatial_bivar(
        adata,
        n_perms=args.n_perms,
        expr_prop=args.expr_prop,
    )

    # Step 3: Run expression-based LIANA+
    liana_res = run_expression_liana(adata, groupby)

    # Step 4: Compare spatial and expression results
    validated = compare_spatial_expression(
        bivar_res, liana_res, args.output_prefix
    )

    # Step 5: Visualize
    visualize_spatial(adata, bivar_res, args.output_prefix)

    print("\n" + "=" * 60)
    print("Spatial analysis complete!")
    print("Output files:")
    print(f"  - {args.output_prefix}_bivar_results.csv")
    print(f"  - {args.output_prefix}_liana_results.csv")
    print(f"  - {args.output_prefix}_validated_interactions.csv")
    print(f"  - {args.output_prefix}_spatial_layout.pdf/.png")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    main()
