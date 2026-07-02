#!/usr/bin/env python3
"""
LIANA+ Automated Ligand-Receptor Analysis CLI
===============================================

Command-line tool for automated cell-cell communication analysis using LIANA+.

Usage:
    python lr_analysis.py input.h5ad --groupby cell_type --output results/

Examples:
    # Basic analysis
    python lr_analysis.py data.h5ad --groupby cell_type

    # With custom parameters
    python lr_analysis.py data.h5ad --groupby cell_type \
        --resource consensus --expr-prop 0.15 --n-perms 1000 \
        --output results/ --prefix my_analysis

    # Filter specific cell types
    python lr_analysis.py data.h5ad --groupby cell_type \
        --sources "CD4 T cells,B cells" --targets "CD8 T cells"

    # Run specific method only
    python lr_analysis.py data.h5ad --groupby cell_type \
        --method cellphoneDB --n-perms 500
"""

import argparse
import os
import sys
import time
import warnings

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for CLI

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="LIANA+ automated ligand-receptor analysis CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python lr_analysis.py data.h5ad --groupby cell_type
  python lr_analysis.py data.h5ad -g cell_type -o results/ -p analysis
  python lr_analysis.py data.h5ad -g cell_type --method cellphoneDB --n-perms 500
  python lr_analysis.py data.h5ad -g cell_type --sources "T cells,B cells" --targets "NK cells"
        """,
    )

    # Required arguments
    parser.add_argument(
        "input",
        type=str,
        help="Path to input AnnData file (.h5ad)",
    )

    parser.add_argument(
        "-g", "--groupby",
        type=str,
        required=True,
        help="Column in adata.obs for cell type grouping",
    )

    # Output options
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="liana_results",
        help="Output directory (default: liana_results)",
    )
    parser.add_argument(
        "-p", "--prefix",
        type=str,
        default="liana",
        help="Prefix for output files (default: liana)",
    )

    # Analysis parameters
    parser.add_argument(
        "--resource",
        type=str,
        default="consensus",
        help="LR resource name (default: consensus)",
        choices=[
            "consensus", "cellphonedb", "cellchatdb",
            "connectomedb", "icellnet", "guide2pharma",
        ],
    )
    parser.add_argument(
        "--method",
        type=str,
        default=None,
        help="Run specific method only (default: all via rank_aggregate)",
        choices=[
            "rank_aggregate", "cellphoneDB", "cellchat",
            "natmi", "connectome", "sca", "log2fc",
        ],
    )
    parser.add_argument(
        "--expr-prop",
        type=float,
        default=0.1,
        help="Minimum expression proportion (default: 0.1)",
    )
    parser.add_argument(
        "--n-perms",
        type=int,
        default=1000,
        help="Number of permutations for CellPhoneDB (default: 1000)",
    )
    parser.add_argument(
        "--min-cells",
        type=int,
        default=5,
        help="Minimum cells per group (default: 5)",
    )
    parser.add_argument(
        "--use-raw",
        action="store_true",
        default=True,
        help="Use adata.raw.X (default: True)",
    )
    parser.add_argument(
        "--no-raw",
        action="store_true",
        default=False,
        help="Do NOT use adata.raw.X; use adata.X instead",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )

    # Filtering options
    parser.add_argument(
        "--sources",
        type=str,
        default=None,
        help="Comma-separated list of source cell types to include",
    )
    parser.add_argument(
        "--targets",
        type=str,
        default=None,
        help="Comma-separated list of target cell types to include",
    )
    parser.add_argument(
        "--mag-threshold",
        type=float,
        default=0.05,
        help="Magnitude rank threshold for top interactions (default: 0.05)",
    )
    parser.add_argument(
        "--spec-threshold",
        type=float,
        default=0.05,
        help="Specificity rank threshold for top interactions (default: 0.05)",
    )

    # Visualization options
    parser.add_argument(
        "--no-plots",
        action="store_true",
        default=False,
        help="Skip plot generation",
    )
    parser.add_argument(
        "--fig-dpi",
        type=int,
        default=300,
        help="Figure DPI (default: 300)",
    )
    parser.add_argument(
        "--fig-format",
        type=str,
        default="pdf",
        choices=["pdf", "png", "svg"],
        help="Figure format (default: pdf)",
    )

    return parser.parse_args()


def load_data(input_path, groupby):
    """Load AnnData and validate structure."""
    import scanpy as sc

    print(f"Loading data from: {input_path}")
    if not os.path.exists(input_path):
        print(f"ERROR: File not found: {input_path}")
        sys.exit(1)

    adata = sc.read_h5ad(input_path)
    print(f"  Shape: {adata.shape[0]} cells x {adata.shape[1]} genes")

    if groupby not in adata.obs.columns:
        print(f"ERROR: Groupby column '{groupby}' not found in adata.obs")
        print(f"  Available columns: {adata.obs.columns.tolist()}")
        sys.exit(1)

    cell_counts = adata.obs[groupby].value_counts()
    print(f"  Cell types ({groupby}): {len(cell_counts)}")
    print(f"  Cells per type:")
    for ct, count in cell_counts.items():
        print(f"    {ct}: {count}")

    if adata.raw is None:
        print("  WARNING: No raw counts found. Using adata.X.")

    return adata


def run_analysis(adata, args):
    """Run LIANA+ analysis based on arguments."""
    import liana as li

    use_raw = args.use_raw and not args.no_raw

    if args.method and args.method != "rank_aggregate":
        # Run specific method
        print(f"\nRunning method: {args.method}")
        method_func = getattr(li.mt, args.method)
        result = method_func(
            adata,
            groupby=args.groupby,
            resource_name=args.resource,
            expr_prop=args.expr_prop,
            use_raw=use_raw,
            n_perms=args.n_perms,
            seed=args.seed,
        )
    else:
        # Run consensus rank aggregate
        print(f"\nRunning consensus rank aggregation")
        result = li.mt.rank_aggregate(
            adata,
            groupby=args.groupby,
            resource_name=args.resource,
            expr_prop=args.expr_prop,
            use_raw=use_raw,
            n_perms=args.n_perms,
            min_cells=args.min_cells,
            seed=args.seed,
            verbose=True,
        )

    print(f"  Found {len(result)} interactions")
    return result


def filter_results(result, args):
    """Filter results based on thresholds and cell type selections."""
    print(f"\nFiltering results...")

    # Filter by cell types
    if args.sources:
        sources = [s.strip() for s in args.sources.split(",")]
        valid_sources = [s for s in sources if s in result['source'].unique()]
        if len(valid_sources) < len(sources):
            missing = set(sources) - set(valid_sources)
            print(f"  WARNING: Source types not found: {missing}")
        result = result[result['source'].isin(valid_sources)]
        print(f"  Filtered to sources: {valid_sources}")

    if args.targets:
        targets = [t.strip() for t in args.targets.split(",")]
        valid_targets = [t for t in targets if t in result['target'].unique()]
        if len(valid_targets) < len(targets):
            missing = set(targets) - set(valid_targets)
            print(f"  WARNING: Target types not found: {missing}")
        result = result[result['target'].isin(valid_targets)]
        print(f"  Filtered to targets: {valid_targets}")

    # Filter by magnitude and specificity
    has_mag = 'magnitude_rank' in result.columns
    has_spec = 'specificity_rank' in result.columns

    if has_mag and has_spec:
        top = result[
            (result['magnitude_rank'] < args.mag_threshold) &
            (result['specificity_rank'] < args.spec_threshold)
        ]
        print(f"  Top interactions (mag < {args.mag_threshold}, spec < {args.spec_threshold}): {len(top)}")
    else:
        top = result
        print(f"  No consensus ranks found (single method run). Total: {len(top)}")

    return result, top


def generate_plots(result, top, args):
    """Generate visualizations."""
    import liana as li

    if args.no_plots:
        print("\nSkipping plot generation (--no-plots)")
        return

    print(f"\nGenerating plots...")

    has_mag = 'magnitude_rank' in result.columns
    has_spec = 'specificity_rank' in result.columns

    # Dot plot
    try:
        uns_keys = [k for k in ['magnitude_rank', 'specificity_rank'] if k in result.columns]
        if uns_keys:
            source_labels = [s.strip() for s in args.sources.split(",")] if args.sources else None
            target_labels = [t.strip() for t in args.targets.split(",")] if args.targets else None

            li.pl.dotplot(
                result,
                uns_keys=uns_keys,
                source_labels=source_labels,
                target_labels=target_labels,
                figure_size=(10, 12),
            )
            dotplot_path = os.path.join(args.output, f"{args.prefix}_dotplot.{args.fig_format}")
            plt.savefig(dotplot_path, dpi=args.fig_dpi, bbox_inches='tight')
            plt.close()
            print(f"  Saved: {dotplot_path}")
    except Exception as e:
        print(f"  WARNING: Dot plot failed: {e}")

    # Heatmap
    try:
        if has_mag:
            li.pl.heatmap(
                result,
                uns_keys=['magnitude_rank'],
                figure_size=(10, 12),
            )
            heatmap_path = os.path.join(args.output, f"{args.prefix}_heatmap.{args.fig_format}")
            plt.savefig(heatmap_path, dpi=args.fig_dpi, bbox_inches='tight')
            plt.close()
            print(f"  Saved: {heatmap_path}")
    except Exception as e:
        print(f"  WARNING: Heatmap failed: {e}")

    # Chord diagram
    try:
        source_labels = [s.strip() for s in args.sources.split(",")] if args.sources else None
        target_labels = [t.strip() for t in args.targets.split(",")] if args.targets else None

        li.pl.chord_graph(
            result,
            source_labels=source_labels,
            target_labels=target_labels,
        )
        chord_path = os.path.join(args.output, f"{args.prefix}_chord.{args.fig_format}")
        plt.savefig(chord_path, dpi=args.fig_dpi, bbox_inches='tight')
        plt.close()
        print(f"  Saved: {chord_path}")
    except Exception as e:
        print(f"  WARNING: Chord diagram failed: {e}")


def save_results(result, top, args):
    """Save results to CSV files."""
    print(f"\nSaving results...")

    os.makedirs(args.output, exist_ok=True)

    # Full results
    full_path = os.path.join(args.output, f"{args.prefix}_all_interactions.csv")
    result.to_csv(full_path, index=False)
    print(f"  Saved: {full_path}")

    # Top interactions
    top_path = os.path.join(args.output, f"{args.prefix}_top_interactions.csv")
    top.to_csv(top_path, index=False)
    print(f"  Saved: {top_path}")


def print_summary(result, top, elapsed):
    """Print analysis summary."""
    print(f"\n{'=' * 60}")
    print(f"Analysis Summary")
    print(f"{'=' * 60}")
    print(f"  Total interactions: {len(result)}")
    print(f"  Top interactions:   {len(top)}")
    print(f"  Elapsed time:       {elapsed:.1f}s")

    if len(top) > 0:
        print(f"\n  Top 10 interactions:")
        display_cols = ['ligand', 'receptor', 'source', 'target']
        if 'magnitude_rank' in top.columns:
            display_cols += ['magnitude_rank']
        if 'specificity_rank' in top.columns:
            display_cols += ['specificity_rank']
        available_cols = [c for c in display_cols if c in top.columns]
        print(top.head(10)[available_cols].to_string(index=False))

    print(f"{'=' * 60}")


def main():
    """Main entry point."""
    args = parse_args()
    start_time = time.time()

    print(f"{'#' * 60}")
    print(f"# LIANA+ Automated Analysis")
    print(f"# Input: {args.input}")
    print(f"# Groupby: {args.groupby}")
    print(f"{'#' * 60}\n")

    # Load data
    adata = load_data(args.input, args.groupby)

    # Run analysis
    result = run_analysis(adata, args)

    # Filter results
    result_filtered, top = filter_results(result, args)

    # Generate plots
    generate_plots(result_filtered, top, args)

    # Save results
    save_results(result_filtered, top, args)

    # Print summary
    elapsed = time.time() - start_time
    print_summary(result_filtered, top, elapsed)


if __name__ == '__main__':
    main()
