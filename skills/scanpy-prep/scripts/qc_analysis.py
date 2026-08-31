#!/usr/bin/env python3
"""
Quality Control Analysis Script for Scanpy

Performs comprehensive quality control on single-cell RNA-seq data,
including calculating metrics, generating QC plots, and filtering cells.

Usage:
    python qc_analysis.py <input_file> [--output <output_file>]
"""

import argparse

import numpy as np
import scanpy as sc
from scipy import sparse
from scipy.stats import median_abs_deviation


def is_integer_valued(matrix, atol=1e-6):
    """Return True when all stored values are compatible with molecule counts."""
    values = matrix.data if sparse.issparse(matrix) else np.asarray(matrix)
    return np.allclose(values, np.round(values), atol=atol)


def calculate_qc_metrics(adata):
    """
    Calculate QC metrics without filtering cells or genes.

    Parameters:
    -----------
    adata : AnnData
        Annotated data matrix
    Returns:
    --------
    AnnData
        Annotated data matrix with QC metrics
    """
    # Identify mitochondrial genes (assumes gene names follow standard conventions)
    adata.var['mt'] = adata.var_names.str.startswith(('MT-', 'mt-', 'Mt-'))

    if not adata.var['mt'].any():
        print("WARNING: No mitochondrial genes matched MT-/mt-/Mt-. "
              "Check whether var_names contains gene symbols or Ensembl IDs.")

    # Calculate QC metrics
    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], percent_top=[20],
                                log1p=True, inplace=True)

    print("\n=== QC Metrics Summary ===")
    print(f"Total cells: {adata.n_obs}")
    print(f"Total genes: {adata.n_vars}")
    print(f"Mean genes per cell: {adata.obs['n_genes_by_counts'].mean():.2f}")
    print(f"Mean counts per cell: {adata.obs['total_counts'].mean():.2f}")
    print(f"Mean mitochondrial %: {adata.obs['pct_counts_mt'].mean():.2f}")

    return adata


def generate_qc_plots(adata, output_prefix='qc'):
    """
    Generate comprehensive QC plots.

    Parameters:
    -----------
    adata : AnnData
        Annotated data matrix
    output_prefix : str
        Prefix for saved figure files
    """
    # Create figure directory if it doesn't exist
    import os
    os.makedirs('figures', exist_ok=True)

    # Violin plots for QC metrics
    sc.pl.violin(adata, ['n_genes_by_counts', 'total_counts', 'pct_counts_mt'],
                 jitter=0.4, multi_panel=True, save=f'_{output_prefix}_violin.pdf')

    # Scatter plots
    sc.pl.scatter(adata, x='total_counts', y='pct_counts_mt',
                  save=f'_{output_prefix}_mt_scatter.pdf')
    sc.pl.scatter(adata, x='total_counts', y='n_genes_by_counts',
                  save=f'_{output_prefix}_genes_scatter.pdf')

    # Highest expressing genes
    sc.pl.highest_expr_genes(adata, n_top=20,
                              save=f'_{output_prefix}_highest_expr.pdf')

    print(f"\nQC plots saved to figures/ directory with prefix '{output_prefix}'")


def _mad_outliers(values, nmads):
    """Compute MAD outliers for one sample-sized vector."""
    median = np.nanmedian(values)
    mad = median_abs_deviation(values, nan_policy="omit")
    if not np.isfinite(mad) or mad == 0:
        return np.zeros(len(values), dtype=bool)
    return (values < median - nmads * mad) | (values > median + nmads * mad)


def is_outlier(adata, metric, nmads, sample_key=None):
    """Flag MAD outliers globally or independently within each sample."""
    values = adata.obs[metric].to_numpy()
    if sample_key is None:
        return _mad_outliers(values, nmads)
    if sample_key not in adata.obs:
        raise ValueError(f"Sample key '{sample_key}' not found in adata.obs")

    outliers = np.zeros(adata.n_obs, dtype=bool)
    groups = adata.obs.groupby(sample_key, observed=True).indices
    for positions in groups.values():
        positions = np.asarray(positions)
        outliers[positions] = _mad_outliers(values[positions], nmads)
    return outliers


def filter_data(adata, qc_mode="mad", mt_threshold=None, sample_key=None,
                min_genes=200, max_genes=None, min_counts=None,
                max_counts=None, min_cells=3, subset_genes=False):
    """
    Filter cells and genes based on QC thresholds.

    Parameters:
    -----------
    adata : AnnData
        Annotated data matrix
    qc_mode : {'mad', 'manual', 'none'}
        Cell-filtering strategy. MAD is the default permissive strategy.
    mt_threshold : float, optional
        Optional mitochondrial hard cap. Required in manual mode.
    sample_key : str, optional
        Observation column for per-sample MAD filtering.
    min_genes : int
        Minimum number of genes per cell
    max_genes : int, optional
        Maximum number of genes per cell
    min_counts : int, optional
        Minimum number of counts per cell
    max_counts : int, optional
        Maximum number of counts per cell
    min_cells : int
        Minimum number of cells per gene

    Returns:
    --------
    AnnData
        Filtered annotated data matrix
    """
    n_cells_before = adata.n_obs
    n_genes_before = adata.n_vars

    if qc_mode == "mad":
        adata.obs['qc_outlier'] = (
            is_outlier(adata, 'log1p_total_counts', 5, sample_key)
            | is_outlier(adata, 'log1p_n_genes_by_counts', 5, sample_key)
            | is_outlier(adata, 'pct_counts_in_top_20_genes', 5, sample_key)
        )
        adata.obs['mt_outlier'] = is_outlier(
            adata, 'pct_counts_mt', 3, sample_key
        )
        if mt_threshold is not None:
            adata.obs['mt_outlier'] |= adata.obs['pct_counts_mt'] > mt_threshold
        keep_cells = ~(adata.obs['qc_outlier'] | adata.obs['mt_outlier'])
    elif qc_mode == "manual":
        if mt_threshold is None:
            raise ValueError("--mt-threshold is required when --qc-mode=manual")
        keep_cells = (
            (adata.obs['n_genes_by_counts'] >= min_genes)
            & (adata.obs['pct_counts_mt'] < mt_threshold)
        )
        if max_genes is not None:
            keep_cells &= adata.obs['n_genes_by_counts'] < max_genes
        if min_counts is not None:
            keep_cells &= adata.obs['total_counts'] >= min_counts
        if max_counts is not None:
            keep_cells &= adata.obs['total_counts'] < max_counts
        adata.obs['qc_outlier'] = ~keep_cells
        adata.obs['mt_outlier'] = adata.obs['pct_counts_mt'] >= mt_threshold
    elif qc_mode == "none":
        keep_cells = np.ones(adata.n_obs, dtype=bool)
        adata.obs['qc_outlier'] = False
        adata.obs['mt_outlier'] = False
    else:
        raise ValueError(f"Unsupported qc_mode: {qc_mode}")

    if np.count_nonzero(keep_cells) == 0:
        raise ValueError(
            "QC removed every cell. Inspect QC distributions and relax the criteria."
        )
    adata = adata[keep_cells, :].copy()

    # Preserve the full feature universe by default. The flag can be used by
    # downstream analyses without deleting low-expression genes from counts.
    n_cells = np.asarray((adata.X > 0).sum(axis=0)).ravel()
    adata.var['n_cells_after_cell_qc'] = n_cells
    adata.var['qc_pass'] = n_cells >= min_cells
    if subset_genes:
        adata = adata[:, adata.var['qc_pass']].copy()

    print(f"\n=== Filtering Results ===")
    print(f"Cells: {n_cells_before} -> {adata.n_obs} ({adata.n_obs/n_cells_before*100:.1f}% retained)")
    print(f"Genes: {n_genes_before} -> {adata.n_vars} ({adata.n_vars/n_genes_before*100:.1f}% retained)")
    print(f"Genes passing min_cells={min_cells}: {int(adata.var['qc_pass'].sum())}")

    return adata


def main():
    parser = argparse.ArgumentParser(description='QC analysis for single-cell data')
    parser.add_argument('input', help='Input file (h5ad, 10X mtx, csv, etc.)')
    parser.add_argument('--output', default='qc_filtered.h5ad',
                        help='Output file name (default: qc_filtered.h5ad)')
    parser.add_argument(
        '--qc-mode', choices=['mad', 'manual', 'none'], default='mad',
        help='Cell QC strategy (default: mad)'
    )
    parser.add_argument(
        '--mt-threshold', type=float, default=None,
        help='Optional MT%% hard cap; required for manual mode (no universal default)'
    )
    parser.add_argument(
        '--sample-key', default=None,
        help='obs column for per-sample MAD filtering (recommended for multi-sample data)'
    )
    parser.add_argument('--min-genes', type=int, default=200,
                        help='Min genes per cell in manual mode (default: 200)')
    parser.add_argument('--min-cells', type=int, default=3,
                        help='Min cells per gene for var["qc_pass"] (default: 3)')
    parser.add_argument('--max-genes', type=int, default=None,
                        help='Optional maximum genes per cell')
    parser.add_argument('--counts-layer', default=None,
                        help='Existing layer containing raw counts; required when X is normalized')
    parser.add_argument('--subset-genes', action='store_true',
                        help='Physically remove genes failing min-cells (default: flag only)')
    parser.add_argument('--skip-plots', action='store_true',
                        help='Skip generating QC plots')

    args = parser.parse_args()

    # Configure scanpy
    sc.settings.verbosity = 2
    sc.settings.set_figure_params(dpi=300, facecolor='white')
    sc.settings.figdir = './figures/'

    print(f"Loading data from: {args.input}")

    # Load data based on file extension
    if args.input.endswith('.h5ad'):
        adata = sc.read_h5ad(args.input)
    elif args.input.endswith('.h5'):
        adata = sc.read_10x_h5(args.input)
    elif args.input.endswith('.csv'):
        adata = sc.read_csv(args.input)
    else:
        # Try reading as 10X mtx directory
        adata = sc.read_10x_mtx(args.input)

    adata.var_names_make_unique()
    adata.obs_names_make_unique()
    print(f"Loaded data: {adata.n_obs} cells x {adata.n_vars} genes")

    # Select and validate the count representation. Never silently label a
    # normalized matrix as raw counts.
    if args.counts_layer is not None:
        if args.counts_layer not in adata.layers:
            raise ValueError(
                f"Counts layer '{args.counts_layer}' not found. "
                f"Available layers: {list(adata.layers.keys())}"
            )
        adata.X = adata.layers[args.counts_layer].copy()

    if not is_integer_valued(adata.X):
        raise ValueError(
            "The selected matrix is not integer-valued and does not appear to "
            "contain raw counts. Pass --counts-layer with the correct layer."
        )

    adata.layers["counts"] = adata.X.copy()
    print(f"Saved full-gene counts to adata.layers['counts'] (shape: {adata.layers['counts'].shape})")

    # Calculate QC metrics
    adata = calculate_qc_metrics(adata)

    # Generate QC plots (before filtering)
    if not args.skip_plots:
        print("\nGenerating QC plots (before filtering)...")
        generate_qc_plots(adata, output_prefix='qc_before')

    # Filter data
    adata = filter_data(adata, qc_mode=args.qc_mode,
                        mt_threshold=args.mt_threshold,
                        sample_key=args.sample_key,
                        min_genes=args.min_genes, max_genes=args.max_genes,
                        min_cells=args.min_cells,
                        subset_genes=args.subset_genes)

    # This script intentionally stops after QC. Use preprocess_full_gene.py for
    # normalization, HVG masking, and optional PCA without deleting non-HVGs.

    # Generate QC plots (after filtering)
    if not args.skip_plots:
        print("\nGenerating QC plots (after filtering)...")
        generate_qc_plots(adata, output_prefix='qc_after')

    # Verify data storage state
    print(f"\n=== Data Storage State ===")
    print(f"adata.X shape: {adata.X.shape}, dtype: {adata.X.dtype}")
    if "counts" in adata.layers:
        print(f"layers['counts'] shape: {adata.layers['counts'].shape}, dtype: {adata.layers['counts'].dtype}")
    if adata.raw is not None:
        print(f"adata.raw: {adata.raw.n_obs} × {adata.raw.n_vars}")
    else:
        print("adata.raw: not set (optional log-normalized compatibility snapshot)")

    # Save filtered data
    print(f"\nSaving filtered data to: {args.output}")
    adata.write_h5ad(args.output)

    print("\n=== QC Analysis Complete ===")


if __name__ == "__main__":
    main()
