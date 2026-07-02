#!/usr/bin/env python3
"""
LIANA+ Analysis Template
=========================

Full workflow template for cell-cell communication analysis using LIANA+.
Copy and customize this template for new analyses.

Usage:
    cp analysis_template.py my_analysis.py
    # Edit CONFIG section below, then:
    python my_analysis.py
"""

import os
import time
import warnings

import matplotlib
matplotlib.use('Agg')

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scanpy as sc

warnings.filterwarnings("ignore")

# ============================================================================
# CONFIGURATION — Edit these parameters for your analysis
# ============================================================================

CONFIG = {
    # --- Input ---
    "input_path": "data/annotated_data.h5ad",   # Path to AnnData file
    "groupby": "cell_type",                      # Cell type column in adata.obs

    # --- Output ---
    "output_dir": "liana_output",                # Output directory
    "prefix": "liana",                           # File name prefix
    "fig_dpi": 300,                              # Figure DPI
    "fig_format": "pdf",                         # pdf, png, or svg

    # --- LIANA+ Parameters ---
    "resource_name": "consensus",                # LR resource
    "expr_prop": 0.1,                           # Min expression proportion
    "use_raw": True,                             # Use adata.raw.X
    "n_perms": 1000,                            # Permutations (CellPhoneDB)
    "min_cells": 5,                              # Min cells per group
    "seed": 42,                                  # Random seed

    # --- Filtering ---
    "magnitude_threshold": 0.05,                 # magnitude_rank cutoff
    "specificity_threshold": 0.05,               # specificity_rank cutoff
    "min_methods": 3,                            # Min methods supporting interaction

    # --- Cell Type Selection (None = all) ---
    "source_labels": None,                       # e.g., ["CD4 T cells", "B cells"]
    "target_labels": None,                       # e.g., ["CD8 T cells", "NK cells"]

    # --- Visualization ---
    "generate_plots": True,                      # Set False to skip plots
    "plot_types": ["dotplot", "heatmap", "chord"],  # Which plots to generate
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def print_header(text):
    """Print a formatted section header."""
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}")


def setup_output_dir(output_dir):
    """Create output directory if it doesn't exist."""
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output directory: {output_dir}")


def load_data(config):
    """Load and validate AnnData file."""
    print_header("Step 1: Loading Data")

    input_path = config["input_path"]
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    adata = sc.read_h5ad(input_path)
    print(f"  Loaded: {adata.shape[0]} cells x {adata.shape[1]} genes")

    # Validate groupby column
    groupby = config["groupby"]
    if groupby not in adata.obs.columns:
        raise ValueError(
            f"Groupby column '{groupby}' not found in adata.obs. "
            f"Available: {adata.obs.columns.tolist()}"
        )

    # Print cell type summary
    cell_counts = adata.obs[groupby].value_counts()
    print(f"  Cell types ({len(cell_counts)}):")
    for ct, count in cell_counts.items():
        flag = " ⚠️ (< min_cells)" if count < config["min_cells"] else ""
        print(f"    {ct}: {count}{flag}")

    # Check raw counts
    if config["use_raw"] and adata.raw is None:
        print("  WARNING: adata.raw is None. Copying current X to raw.")
        adata.raw = adata

    return adata


def run_liana(adata, config):
    """Run LIANA+ consensus rank aggregation."""
    print_header("Step 2: Running LIANA+ Consensus Analysis")

    import liana as li

    result = li.mt.rank_aggregate(
        adata,
        groupby=config["groupby"],
        resource_name=config["resource_name"],
        expr_prop=config["expr_prop"],
        use_raw=config["use_raw"],
        n_perms=config["n_perms"],
        min_cells=config["min_cells"],
        seed=config["seed"],
        verbose=True,
    )

    print(f"  Total interactions: {len(result)}")
    print(f"  Columns: {result.columns.tolist()}")

    return result


def filter_results(result, config):
    """Filter results by thresholds and cell type selection."""
    print_header("Step 3: Filtering Results")

    filtered = result.copy()

    # Filter by cell types
    if config["source_labels"]:
        valid = [s for s in config["source_labels"] if s in filtered['source'].unique()]
        filtered = filtered[filtered['source'].isin(valid)]
        print(f"  Filtered to {len(valid)} source types: {valid}")

    if config["target_labels"]:
        valid = [t for t in config["target_labels"] if t in filtered['target'].unique()]
        filtered = filtered[filtered['target'].isin(valid)]
        print(f"  Filtered to {len(valid)} target types: {valid}")

    # Filter by consensus ranks
    has_mag = 'magnitude_rank' in filtered.columns
    has_spec = 'specificity_rank' in filtered.columns

    if has_mag and has_spec:
        top = filtered[
            (filtered['magnitude_rank'] < config["magnitude_threshold"]) &
            (filtered['specificity_rank'] < config["specificity_threshold"])
        ]
        print(f"  Top interactions (mag < {config['magnitude_threshold']}, "
              f"spec < {config['specificity_threshold']}): {len(top)}")
    else:
        top = filtered
        print(f"  Total (no rank filtering): {len(top)}")

    # Filter by method agreement
    method_cols = [c for c in filtered.columns
                   if c not in ['ligand', 'receptor', 'source', 'target',
                                'magnitude_rank', 'specificity_rank',
                                'entity_interaction', 'n_methods']]

    if method_cols and config["min_methods"] > 0:
        filtered['n_methods'] = filtered[method_cols].notna().sum(axis=1)
        robust = filtered[filtered['n_methods'] >= config["min_methods"]]
        print(f"  Method-agreement filter (>= {config['min_methods']} methods): "
              f"{len(robust)} interactions")
    else:
        robust = top

    return filtered, top, robust


def generate_visualizations(result, config):
    """Generate publication-quality visualizations."""
    if not config["generate_plots"]:
        print_header("Step 4: Visualization")
        print("  Skipped (generate_plots = False)")
        return

    print_header("Step 4: Generating Visualizations")

    import liana as li

    output_dir = config["output_dir"]
    prefix = config["prefix"]
    dpi = config["fig_dpi"]
    fmt = config["fig_format"]
    source_labels = config["source_labels"]
    target_labels = config["target_labels"]

    uns_keys = [k for k in ['magnitude_rank', 'specificity_rank']
                if k in result.columns]

    for plot_type in config["plot_types"]:
        try:
            filepath = os.path.join(output_dir, f"{prefix}_{plot_type}.{fmt}")

            if plot_type == "dotplot":
                li.pl.dotplot(
                    result,
                    uns_keys=uns_keys,
                    source_labels=source_labels,
                    target_labels=target_labels,
                    figure_size=(10, 12),
                    cmap='coolwarm',
                    size_range=(0.5, 30),
                    rotate_labels=True,
                )

            elif plot_type == "heatmap":
                li.pl.heatmap(
                    result,
                    uns_keys=uns_keys,
                    source_labels=source_labels,
                    target_labels=target_labels,
                    figure_size=(10, 12),
                    cmap='viridis',
                )

            elif plot_type == "chord":
                li.pl.chord_graph(
                    result,
                    source_labels=source_labels,
                    target_labels=target_labels,
                    figure_size=(8, 8),
                )

            else:
                print(f"  Unknown plot type: {plot_type}")
                continue

            plt.savefig(filepath, dpi=dpi, bbox_inches='tight')
            plt.close()
            print(f"  Saved: {filepath}")

        except Exception as e:
            print(f"  ERROR generating {plot_type}: {e}")


def save_results(filtered, top, robust, config):
    """Save all results to CSV."""
    print_header("Step 5: Saving Results")

    output_dir = config["output_dir"]
    prefix = config["prefix"]

    files = {
        f"{prefix}_all_interactions.csv": filtered,
        f"{prefix}_top_interactions.csv": top,
        f"{prefix}_robust_interactions.csv": robust,
    }

    for filename, df in files.items():
        filepath = os.path.join(output_dir, filename)
        df.to_csv(filepath, index=False)
        print(f"  Saved: {filepath} ({len(df)} rows)")


def print_summary(filtered, top, robust, elapsed, config):
    """Print final summary."""
    print_header("Summary")
    print(f"  Input:       {config['input_path']}")
    print(f"  Groupby:     {config['groupby']}")
    print(f"  Resource:    {config['resource_name']}")
    print(f"  All interactions:    {len(filtered)}")
    print(f"  Top interactions:    {len(top)}")
    print(f"  Robust interactions: {len(robust)}")
    print(f"  Elapsed:     {elapsed:.1f}s")
    print(f"  Output:      {config['output_dir']}/")

    if len(top) > 0:
        print(f"\n  Top 10 interactions:")
        display_cols = ['ligand', 'receptor', 'source', 'target']
        for col in ['magnitude_rank', 'specificity_rank']:
            if col in top.columns:
                display_cols.append(col)
        available_cols = [c for c in display_cols if c in top.columns]
        print(top.head(10)[available_cols].to_string(index=False))


# ============================================================================
# MAIN WORKFLOW
# ============================================================================


def main():
    """Execute the complete LIANA+ analysis workflow."""
    start_time = time.time()

    print("#" * 60)
    print("# LIANA+ Cell-Cell Communication Analysis")
    print("#" * 60)
    print(f"# Config: resource={CONFIG['resource_name']}, "
          f"expr_prop={CONFIG['expr_prop']}, n_perms={CONFIG['n_perms']}")
    print("#" * 60)

    # Setup
    setup_output_dir(CONFIG["output_dir"])

    # Step 1: Load data
    adata = load_data(CONFIG)

    # Step 2: Run LIANA+
    result = run_liana(adata, CONFIG)

    # Step 3: Filter results
    filtered, top, robust = filter_results(result, CONFIG)

    # Step 4: Visualize
    generate_visualizations(filtered, CONFIG)

    # Step 5: Save results
    save_results(filtered, top, robust, CONFIG)

    # Summary
    elapsed = time.time() - start_time
    print_summary(filtered, top, robust, elapsed, CONFIG)

    print(f"\n{'#' * 60}")
    print("# Analysis Complete!")
    print("#" * 60 + "\n")


if __name__ == '__main__':
    main()
