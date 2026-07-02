#!/usr/bin/env python3
"""
SCVI-tools Differential Expression Analysis

This script demonstrates differential expression analysis using SCVI-tools
with integrated batch correction.

Usage:
    python scvi_de_analysis.py input.h5ad --groupby cell_type --batch batch --output scvi_results/
"""

import argparse
import os
import scanpy as sc
import scvi
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt


def run_scvi_de(
    adata_path: str,
    groupby: str = "cell_type",
    batch_key: str = None,
    output_dir: str = "scvi_results",
    n_latent: int = 30,
    max_epochs: int = 400,
    mode: str = "change",
    delta: float = 0.5,
    proba_threshold: float = 0.95,
    lfc_threshold: float = 1.0,
):
    """
    Run SCVI-tools differential expression analysis.
    
    Parameters
    ----------
    adata_path : str
        Path to input AnnData file
    groupby : str
        Column defining groups for DE
    batch_key : str
        Column for batch correction (optional)
    output_dir : str
        Output directory
    n_latent : int
        Latent space dimension
    max_epochs : int
        Maximum training epochs
    mode : str
        DE mode: 'vanilla', 'change', or 'lfc'
    delta : float
        Effect size threshold for 'change' mode
    proba_threshold : float
        Probability threshold for significance
    lfc_threshold : float
        Log fold change threshold
    """
    
    # Load data
    print(f"Loading data from {adata_path}")
    adata = sc.read_h5ad(adata_path)
    
    # Ensure we have raw counts
    if adata.raw is not None:
        print("Using raw counts from adata.raw")
        adata.X = adata.raw.X.copy()
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Setup SCVI
    print(f"\nSetting up SCVI model...")
    scvi.model.SCVI.setup_anndata(
        adata,
        batch_key=batch_key,
        labels_key=groupby
    )
    
    # Create model
    model = scvi.model.SCVI(
        adata,
        n_latent=n_latent,
        n_layers=2,
        gene_likelihood="nb"
    )
    
    # Train model
    print(f"\nTraining SCVI model (max_epochs={max_epochs})...")
    model.train(
        max_epochs=max_epochs,
        early_stopping=True,
        early_stopping_patience=10
    )
    
    # Check training
    training_history = model.history['elbo_train']
    
    # Get latent representation
    print("\nExtracting latent representation...")
    adata.obsm["X_scVI"] = model.get_latent_representation()
    
    # Visualization with latent space
    sc.pp.neighbors(adata, use_rep="X_scVI")
    sc.tl.umap(adata)
    
    # Save UMAP
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    sc.pl.umap(adata, color=groupby, ax=axes[0], show=False, title=f"{groupby}")
    if batch_key:
        sc.pl.umap(adata, color=batch_key, ax=axes[1], show=False, title=f"{batch_key}")
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "scvi_umap.pdf"))
    plt.close()
    
    # Differential expression
    print(f"\nRunning differential expression (mode={mode})...")
    
    groups = adata.obs[groupby].unique()
    all_markers = {}
    
    for group in groups:
        print(f"  Processing {group}...")
        
        try:
            de_df = model.differential_expression(
                groupby=groupby,
                group1=group,
                group2=None,  # vs rest
                mode=mode,
                delta=delta,
                batch_correction=batch_key is not None
            )
            
            # Filter significant genes
            sig = de_df[
                (de_df["proba_de"] >= proba_threshold) &
                (de_df["lfc_mean"].abs() >= lfc_threshold)
            ].sort_values("proba_de", ascending=False)
            
            all_markers[group] = sig
            
            # Save individual results
            sig.to_csv(os.path.join(output_dir, f"scvi_markers_{group}.csv"))
            
            print(f"    Found {len(sig)} significant markers")
            
        except Exception as e:
            print(f"    Error processing {group}: {e}")
            continue
    
    # Create combined marker table
    print("\nCreating combined marker table...")
    combined_markers = []
    for group, markers in all_markers.items():
        markers = markers.copy()
        markers[groupby] = group
        combined_markers.append(markers)
    
    if combined_markers:
        combined_df = pd.concat(combined_markers)
        combined_df.to_csv(os.path.join(output_dir, "scvi_all_markers.csv"))
    
    # Create heatmap of top markers
    print("Creating marker heatmap...")
    top_markers_per_group = {}
    for group, markers in all_markers.items():
        top_genes = markers.nlargest(5, "lfc_mean").index.tolist()
        top_markers_per_group[group] = top_genes
    
    # Flatten for heatmap
    all_top_genes = []
    for genes in top_markers_per_group.values():
        all_top_genes.extend(genes)
    all_top_genes = list(dict.fromkeys(all_top_genes))  # Remove duplicates, preserve order
    
    if all_top_genes:
        sc.pl.heatmap(
            adata,
            var_names=all_top_genes[:50],  # Limit to 50 genes
            groupby=groupby,
            cmap="viridis",
            swap_axes=True,
            save="_scvi_markers.pdf"
        )
    
    # Save model
    model_path = os.path.join(output_dir, "scvi_model")
    model.save(model_path)
    print(f"\nSaved SCVI model to {model_path}")
    
    # Save AnnData with results
    adata.write_h5ad(os.path.join(output_dir, "scvi_analyzed.h5ad"))
    
    # Print summary
    print("\n=== SCVI DE Analysis Summary ===")
    for group, markers in all_markers.items():
        print(f"\n{group}:")
        print(f"  Total markers: {len(markers)}")
        if len(markers) > 0:
            print(f"  Top 5 markers:")
            for _, row in markers.head(5).iterrows():
                print(f"    {row.name}: proba_de={row['proba_de']:.3f}, lfc={row['lfc_mean']:.2f}")
    
    print(f"\nResults saved to {output_dir}")
    return model, all_markers


def compare_groups(
    model,
    groupby: str,
    group1: str,
    group2: str,
    output_path: str = None,
    proba_threshold: float = 0.95,
    lfc_threshold: float = 1.0,
):
    """
    Compare two specific groups using trained SCVI model.
    
    Parameters
    ----------
    model : scvi.model.SCVI
        Trained SCVI model
    groupby : str
        Grouping column
    group1, group2 : str
        Groups to compare
    output_path : str
        Path to save results
    """
    
    print(f"\nComparing {group1} vs {group2}...")
    
    de_df = model.differential_expression(
        groupby=groupby,
        group1=group1,
        group2=group2,
        mode="change",
        delta=0.5
    )
    
    # Classify genes
    de_df["direction"] = "NS"
    de_df.loc[
        (de_df["proba_de"] >= proba_threshold) & 
        (de_df["lfc_mean"] > lfc_threshold),
        "direction"
    ] = "Up"
    de_df.loc[
        (de_df["proba_de"] >= proba_threshold) & 
        (de_df["lfc_mean"] < -lfc_threshold),
        "direction"
    ] = "Down"
    
    # Summary
    n_up = (de_df["direction"] == "Up").sum()
    n_down = (de_df["direction"] == "Down").sum()
    
    print(f"  Up-regulated in {group1}: {n_up}")
    print(f"  Down-regulated in {group1}: {n_down}")
    
    # Create volcano plot
    plt.figure(figsize=(10, 6))
    colors = {"Up": "red", "Down": "blue", "NS": "grey"}
    for direction in ["Up", "Down", "NS"]:
        subset = de_df[de_df["direction"] == direction]
        plt.scatter(
            subset["lfc_mean"],
            -np.log10(1 - subset["proba_de"] + 1e-10),
            c=colors[direction],
            alpha=0.6,
            label=f"{direction} ({len(subset)})"
        )
    
    plt.axvline(x=0, color="grey", linestyle="--", alpha=0.5)
    plt.xlabel("Log Fold Change")
    plt.ylabel("-log10(1 - proba_de)")
    plt.title(f"{group1} vs {group2}")
    plt.legend()
    
    if output_path:
        plt.savefig(output_path)
        print(f"  Saved volcano plot to {output_path}")
    
    plt.close()
    
    return de_df


def main():
    parser = argparse.ArgumentParser(
        description="Run SCVI-tools differential expression analysis"
    )
    parser.add_argument("input", help="Input AnnData file (.h5ad)")
    parser.add_argument("--groupby", default="cell_type", help="Grouping column")
    parser.add_argument("--batch", default=None, help="Batch column for correction")
    parser.add_argument("--output", default="scvi_results", help="Output directory")
    parser.add_argument("--n-latent", type=int, default=30, help="Latent dimension")
    parser.add_argument("--max-epochs", type=int, default=400, help="Max training epochs")
    parser.add_argument("--mode", default="change", choices=["vanilla", "change", "lfc"])
    parser.add_argument("--delta", type=float, default=0.5, help="Effect size threshold")
    parser.add_argument("--proba", type=float, default=0.95, help="Probability threshold")
    
    args = parser.parse_args()
    
    run_scvi_de(
        adata_path=args.input,
        groupby=args.groupby,
        batch_key=args.batch,
        output_dir=args.output,
        n_latent=args.n_latent,
        max_epochs=args.max_epochs,
        mode=args.mode,
        delta=args.delta,
        proba_threshold=args.proba
    )


if __name__ == "__main__":
    main()
