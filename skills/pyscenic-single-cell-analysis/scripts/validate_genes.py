#!/usr/bin/env python3
"""
pySCENIC Gene Symbol Validation Tool

Validates overlap between user gene symbols and cisTarget database genes.
Low overlap (<80%) indicates gene naming mismatches that will cause pySCENIC failures.

Usage:
    python validate_genes.py --genes genes.txt --database hg38_10kbp*.feather
    python validate_genes.py --expression data.loom --database hg38_10kbp*.feather
"""

import argparse
import sys
from pathlib import Path
from typing import Set, Tuple

try:
    import pyarrow.feather as feather
except ImportError:
    print(
        "Error: pyarrow is required. Install with: pip install pyarrow", file=sys.stderr
    )
    sys.exit(1)

try:
    import pandas as pd
except ImportError:
    print(
        "Error: pandas is required. Install with: pip install pandas", file=sys.stderr
    )
    sys.exit(1)


def get_database_genes(feather_path: str) -> Set[str]:
    """Extract gene names from cisTarget database.

    Args:
        feather_path: Path to cisTarget feather database file

    Returns:
        Set of gene symbols (column names from feather file)
    """
    try:
        table = feather.read_table(feather_path)
        # Gene symbols are column names in cisTarget feather files
        genes = set(table.column_names)
        # Remove metadata columns if present
        genes.discard("Gene")
        genes.discard("gene")
        genes.discard("Motif_ID")
        genes.discard("motif_id")
        return genes
    except Exception as e:
        print(f"Error reading feather database: {e}", file=sys.stderr)
        sys.exit(1)


def get_user_genes_from_txt(txt_path: str) -> Set[str]:
    """Read genes from text file (one per line)."""
    try:
        with open(txt_path, "r") as f:
            genes = set(line.strip() for line in f if line.strip())
        return genes
    except Exception as e:
        print(f"Error reading text file: {e}", file=sys.stderr)
        sys.exit(1)


def get_user_genes_from_loom(loom_path: str) -> Set[str]:
    """Read gene names from loom file."""
    try:
        import loompy

        with loompy.connect(loom_path, mode="r") as ds:
            genes = set(ds.ra["Gene"] if "Gene" in ds.ra else ds.ra.get("gene", []))
        return genes
    except ImportError:
        print(
            "Error: loompy is required for .loom files. Install with: pip install loompy",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"Error reading loom file: {e}", file=sys.stderr)
        sys.exit(1)


def get_user_genes_from_h5ad(h5ad_path: str) -> Set[str]:
    """Read gene names from h5ad file."""
    try:
        import scanpy as sc

        adata = sc.read_h5ad(h5ad_path)
        genes = set(adata.var_names)
        return genes
    except ImportError:
        print(
            "Error: scanpy is required for .h5ad files. Install with: pip install scanpy",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"Error reading h5ad file: {e}", file=sys.stderr)
        sys.exit(1)


def get_user_genes(input_path: str) -> Set[str]:
    """Extract genes from user data file.

    Supports:
    - .txt: one gene per line
    - .loom: loom expression matrix
    - .h5ad: AnnData H5AD format

    Args:
        input_path: Path to user gene file

    Returns:
        Set of gene symbols from user data
    """
    path = Path(input_path)

    if not path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    suffix = path.suffix.lower()

    if suffix == ".txt":
        return get_user_genes_from_txt(input_path)
    elif suffix == ".loom":
        return get_user_genes_from_loom(input_path)
    elif suffix == ".h5ad":
        return get_user_genes_from_h5ad(input_path)
    else:
        print(f"Error: Unsupported file format: {suffix}", file=sys.stderr)
        print("Supported formats: .txt, .loom, .h5ad", file=sys.stderr)
        sys.exit(1)


def validate_overlap(
    user_genes: Set[str], db_genes: Set[str], threshold: float = 80
) -> Tuple[float, Set[str], Set[str]]:
    """Compare gene sets and calculate overlap.

    Args:
        user_genes: Set of user gene symbols
        db_genes: Set of database gene symbols
        threshold: Minimum acceptable overlap percentage (default 80)

    Returns:
        Tuple of (overlap_percentage, matched_genes, unmatched_genes)
    """
    if not user_genes:
        print("Error: No genes found in user data", file=sys.stderr)
        sys.exit(1)

    matched = user_genes & db_genes
    unmatched = user_genes - db_genes
    overlap_pct = (len(matched) / len(user_genes)) * 100 if user_genes else 0

    return overlap_pct, matched, unmatched


def print_report(
    user_genes: Set[str],
    db_genes: Set[str],
    overlap_pct: float,
    matched: Set[str],
    unmatched: Set[str],
    threshold: float = 80,
) -> None:
    """Print validation report to stdout."""

    print("\nGene Symbol Validation Report")
    print("=" * 50)
    print(f"User genes: {len(user_genes):,}")
    print(f"Database genes: {len(db_genes):,}")
    print(f"Overlap: {len(matched):,} ({overlap_pct:.1f}%)")

    if overlap_pct >= threshold:
        print(f"\n✓ PASS: Gene overlap above threshold ({threshold}%)")
    else:
        print(f"\n✗ FAIL: Low gene overlap ({overlap_pct:.1f}%)")
        print(f"\n⚠ WARNING: Gene overlap below threshold ({threshold}%)")
        print("\nCommon causes:")
        print("  - Ensembl IDs vs HGNC symbols mismatch")
        print("    (e.g., ENSG00000141510 vs TP53)")
        print("  - Gene version numbers in IDs")
        print("    (e.g., ENSG00000141510.16 vs ENSG00000141510)")
        print("  - Wrong species (human vs mouse)")
        print("  - Case sensitivity differences")
        print("\nRecommendation:")
        print("  Convert gene symbols using mygene.info or biomaRt")
        print("  Example (Python):")
        print("    import mygene")
        print("    mg = mygene.MyGeneInfo()")
        print("    results = mg.queryBySymbol(symbols)")

    if unmatched:
        print(f"\nUnmatched genes ({len(unmatched)} total):")
        # Show sample of unmatched
        sample_size = min(10, len(unmatched))
        for gene in sorted(list(unmatched))[:sample_size]:
            print(f"  - {gene}")
        if len(unmatched) > sample_size:
            print(f"  ... and {len(unmatched) - sample_size} more")

    print()


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )

    # Input options (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--genes", type=str, help="Path to gene list file (.txt, one gene per line)"
    )
    input_group.add_argument(
        "--expression", type=str, help="Path to expression matrix file (.loom or .h5ad)"
    )

    # Database
    parser.add_argument(
        "--database",
        type=str,
        required=True,
        help="Path to cisTarget feather database file",
    )

    # Threshold
    parser.add_argument(
        "--threshold",
        type=float,
        default=80,
        help="Minimum acceptable overlap percentage (default: 80)",
    )

    args = parser.parse_args()

    # Validate database exists
    db_path = Path(args.database)
    if not db_path.exists():
        print(f"Error: Database file not found: {args.database}", file=sys.stderr)
        sys.exit(1)

    # Get input file path
    input_path = args.genes if args.genes else args.expression

    # Load genes
    user_genes = get_user_genes(input_path)
    db_genes = get_database_genes(args.database)

    # Validate
    overlap_pct, matched, unmatched = validate_overlap(
        user_genes, db_genes, args.threshold
    )

    # Print report
    print_report(user_genes, db_genes, overlap_pct, matched, unmatched, args.threshold)

    # Exit code based on threshold
    if overlap_pct < args.threshold:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
