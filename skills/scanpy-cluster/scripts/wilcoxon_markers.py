#!/usr/bin/env python3
"""
Wilcoxon Marker Gene Identification Workflow

This script demonstrates marker gene identification using Wilcoxon rank-sum test
in Scanpy. Suitable for cell type annotation and quick exploration.

Usage:
    python wilcoxon_markers.py input.h5ad --groupby cell_type --output markers/
"""

import argparse
import os
import scanpy as sc
import pandas as pd


def run_wilcoxon_markers(
    adata_path: str,
    groupby: str = "cell_type",
    output_dir: str = "markers",
    min_fold_change: float = 1.5,
    min_in_group_fraction: float = 0.25,
    max_out_group_fraction: float = 0.5,
    n_genes: int = 20,
):
    """
    Run Wilcoxon rank-sum test for marker gene identification.
    
    Parameters
    ----------
    adata_path : str
        Path to input AnnData file (.h5ad)
    groupby : str
        Column in adata.obs defining groups
    output_dir : str
        Directory to save marker gene results
    min_fold_change : float
        Minimum absolute log2 fold change
    min_in_group_fraction : float
        Minimum fraction of cells expressing gene in target group
    max_out_group_fraction : float
        Maximum fraction of cells expressing gene in reference groups
    n_genes : int
        Number of top genes to visualize
    """
    
    # Load data
    print(f"Loading data from {adata_path}")
    adata = sc.read_h5ad(adata_path)
    
    # Ensure data is log-normalized
    if adata.raw is not None:
        print("Using raw counts for visualization")
    else:
        print("Warning: No raw counts found. Using current .X")
    
    # Run Wilcoxon rank-sum test
    print(f"\nRunning Wilcoxon DE analysis (groupby={groupby})")
    sc.tl.rank_genes_groups(
        adata,
        groupby=groupby,
        method="wilcoxon",
        n_genes=adata.n_vars,
        key_added="wilcoxon_markers"
    )
    
    # Filter by fold change and expression
    print(f"Filtering results (logFC > {min_fold_change}, in_group > {min_in_group_fraction})")
    sc.tl.filter_rank_genes_groups(
        adata,
        key="wilcoxon_markers",
        min_fold_change=min_fold_change,
        min_in_group_fraction=min_in_group_fraction,
        max_out_group_fraction=max_out_group_fraction,
        key_added="wilcoxon_filtered"
    )
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Extract and save results for each group
    groups = adata.obs[groupby].unique()
    
    for group in groups:
        print(f"\nProcessing group: {group}")
        
        # Get filtered results
        try:
            df = sc.get.rank_genes_groups_df(
                adata, 
                group=group, 
                key="wilcoxon_filtered"
            )
        except Exception:
            # Fallback to unfiltered if filtering removed all genes
            df = sc.get.rank_genes_groups_df(
                adata, 
                group=group, 
                key="wilcoxon_markers"
            )
        
        # Apply additional filtering
        df_filtered = df[
            (df["pvals_adj"] < 0.05) & 
            (df["logfoldchanges"].abs() >= min_fold_change)
        ].copy()
        
        # Save results
        output_path = os.path.join(output_dir, f"markers_{group}.csv")
        df_filtered.to_csv(output_path, index=False)
        print(f"  Saved {len(df_filtered)} markers to {output_path}")
        
        # Print top markers
        print(f"  Top {min(n_genes, len(df_filtered))} markers:")
        top = df_filtered.head(n_genes)
        for _, row in top.iterrows():
            print(f"    {row['names']}: logFC={row['logfoldchanges']:.2f}, padj={row['pvals_adj']:.2e}")
    
    # Generate visualizations
    print("\nGenerating visualizations...")
    
    # UMAP with groups
    if "X_umap" in adata.obsm:
        sc.pl.umap(adata, color=groupby, save="_groups.pdf")
    
    # Rank genes groups plot
    sc.pl.rank_genes_groups(
        adata,
        n_genes=n_genes,
        key="wilcoxon_markers",
        save="_wilcoxon.pdf"
    )
    
    # Dot plot
    sc.pl.rank_genes_groups_dotplot(
        adata,
        n_genes=5,
        key="wilcoxon_markers",
        save="_dotplot.pdf"
    )
    
    # Heatmap
    sc.pl.rank_genes_groups_heatmap(
        adata,
        n_genes=10,
        key="wilcoxon_markers",
        show_gene_labels=True,
        save="_heatmap.pdf"
    )
    
    # Save processed AnnData
    output_h5ad = os.path.join(output_dir, "adata_with_markers.h5ad")
    adata.write_h5ad(output_h5ad)
    print(f"\nSaved AnnData with marker results to {output_h5ad}")
    
    print("\nDone!")
    return adata


def main():
    parser = argparse.ArgumentParser(
        description="Run Wilcoxon marker gene identification"
    )
    parser.add_argument("input", help="Input AnnData file (.h5ad)")
    parser.add_argument("--groupby", default="cell_type", help="Grouping column")
    parser.add_argument("--output", default="markers", help="Output directory")
    parser.add_argument("--min-fc", type=float, default=1.5, help="Min log2 fold change")
    parser.add_argument("--min-pct", type=float, default=0.25, help="Min in-group fraction")
    parser.add_argument("--n-genes", type=int, default=20, help="Number of genes to show")
    
    args = parser.parse_args()
    
    run_wilcoxon_markers(
        adata_path=args.input,
        groupby=args.groupby,
        output_dir=args.output,
        min_fold_change=args.min_fc,
        min_in_group_fraction=args.min_pct,
        n_genes=args.n_genes
    )


if __name__ == "__main__":
    main()
