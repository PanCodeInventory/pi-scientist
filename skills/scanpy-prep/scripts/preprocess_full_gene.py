#!/usr/bin/env python3
"""Full-gene Scanpy preprocessing without physical HVG subsetting.

The output contract is:
- ``adata.X``: full-gene normalize_total + log1p expression
- ``adata.layers['counts']``: full-gene integer-valued counts
- ``adata.var['highly_variable']``: feature mask
- ``adata.obsm['X_pca']``: PCA computed from the HVG mask
- ``adata.raw``: optional compatibility snapshot of log-normalized expression

Usage:
    python preprocess_full_gene.py qc_filtered.h5ad -o processed_full_gene.h5ad \
        --n-top-genes 3000 --batch-key sample
"""

import argparse
from importlib.metadata import version

import numpy as np
import scanpy as sc
from packaging.version import Version
from scipy import sparse


MIN_SCANPY_VERSION = Version("1.10")


def require_scanpy_version():
    """Fail early when mask_var is unavailable."""
    installed = Version(version("scanpy"))
    if installed < MIN_SCANPY_VERSION:
        raise RuntimeError(
            f"scanpy>={MIN_SCANPY_VERSION} is required for PCA mask_var; "
            f"found scanpy=={installed}."
        )


def is_integer_valued(matrix, atol=1e-6):
    """Return True when all stored values are compatible with molecule counts."""
    values = matrix.data if sparse.issparse(matrix) else np.asarray(matrix)
    return np.allclose(values, np.round(values), atol=atol)


def choose_counts(adata, counts_layer):
    """Select a count matrix explicitly and copy it into the canonical layer."""
    if counts_layer is not None:
        if counts_layer not in adata.layers:
            raise ValueError(
                f"Counts layer '{counts_layer}' not found. "
                f"Available layers: {list(adata.layers.keys())}"
            )
        counts = adata.layers[counts_layer]
    elif "counts" in adata.layers:
        counts = adata.layers["counts"]
    else:
        counts = adata.X

    if not is_integer_valued(counts):
        raise ValueError(
            "The selected matrix is not integer-valued. Provide the original "
            "count representation with --counts-layer."
        )

    adata.layers["counts"] = counts.copy()
    adata.X = adata.layers["counts"].copy()


def preprocess(
    adata,
    *,
    counts_layer=None,
    target_sum=1e4,
    n_top_genes=3000,
    flavor="seurat",
    batch_key=None,
    n_comps=50,
    compatibility_raw=True,
):
    """Apply normalization and HVG-masked PCA while retaining every gene."""
    require_scanpy_version()
    adata = adata.copy()
    adata.var_names_make_unique()
    adata.obs_names_make_unique()

    if batch_key is not None and batch_key not in adata.obs:
        raise ValueError(
            f"Batch key '{batch_key}' not found in adata.obs. "
            f"Available columns: {list(adata.obs.columns)}"
        )

    choose_counts(adata, counts_layer)

    sc.pp.normalize_total(adata, target_sum=target_sum)
    sc.pp.log1p(adata)

    hvg_kwargs = {
        "n_top_genes": n_top_genes,
        "flavor": flavor,
        "batch_key": batch_key,
    }
    if flavor in {"seurat_v3", "seurat_v3_paper"}:
        hvg_kwargs["layer"] = "counts"
    sc.pp.highly_variable_genes(adata, **hvg_kwargs)

    if compatibility_raw:
        # This is a log-normalized compatibility snapshot, never raw counts.
        adata.raw = adata.copy()

    max_comps = min(adata.n_obs, int(adata.var["highly_variable"].sum())) - 1
    if max_comps < 1:
        raise ValueError("Not enough cells or HVGs to compute PCA")
    sc.pp.pca(
        adata,
        n_comps=min(n_comps, max_comps),
        mask_var="highly_variable",
    )

    adata.uns["scanpy_prep"] = {
        "data_contract": "full-gene-v1",
        "X": "normalize_total_log1p_full_gene",
        "counts_layer": "counts",
        "hvg_storage": "var.highly_variable_mask_without_subsetting",
        "target_sum": float(target_sum),
        "n_top_genes": int(n_top_genes),
        "hvg_flavor": flavor,
        "batch_key": batch_key if batch_key is not None else "",
        "compatibility_raw": bool(compatibility_raw),
        "pca_from_hvg_mask": True,
    }

    n_hvg = int(adata.var["highly_variable"].sum())
    if adata.layers["counts"].shape != adata.shape:
        raise AssertionError("counts layer is not aligned with the full-gene matrix")
    if n_hvg >= adata.n_vars:
        raise ValueError(
            f"HVG selection retained {n_hvg}/{adata.n_vars} genes; expected a "
            "strict feature subset. Check n_top_genes and the input matrix."
        )
    if adata.is_view:
        raise AssertionError("Output must be a materialized AnnData, not a view")

    return adata


def main():
    parser = argparse.ArgumentParser(
        description="Normalize full-gene counts and compute PCA from an HVG mask"
    )
    parser.add_argument("input", help="Input count/QC AnnData (.h5ad)")
    parser.add_argument("-o", "--output", default="processed_full_gene.h5ad")
    parser.add_argument(
        "--counts-layer",
        default=None,
        help="Source layer for counts (default: counts when present, otherwise X)",
    )
    parser.add_argument("--target-sum", type=float, default=1e4)
    parser.add_argument("--n-top-genes", type=int, default=3000)
    parser.add_argument(
        "--flavor",
        choices=["seurat", "cell_ranger", "seurat_v3", "seurat_v3_paper"],
        default="seurat",
    )
    parser.add_argument("--batch-key", default=None)
    parser.add_argument("--n-comps", type=int, default=50)
    parser.add_argument(
        "--no-raw",
        action="store_true",
        help="Do not create the optional full-gene log-normalized .raw snapshot",
    )
    parser.add_argument(
        "--compression", choices=["gzip", "lzf"], default="gzip"
    )
    args = parser.parse_args()

    print(f"Loading: {args.input}")
    adata = sc.read_h5ad(args.input)
    print(f"Input: {adata.n_obs} cells × {adata.n_vars} genes")

    adata = preprocess(
        adata,
        counts_layer=args.counts_layer,
        target_sum=args.target_sum,
        n_top_genes=args.n_top_genes,
        flavor=args.flavor,
        batch_key=args.batch_key,
        n_comps=args.n_comps,
        compatibility_raw=not args.no_raw,
    )

    n_hvg = int(adata.var["highly_variable"].sum())
    print(f"Output: {adata.n_obs} cells × {adata.n_vars} full genes")
    print(f"HVG mask: {n_hvg} genes")
    print(f"Counts: {adata.layers['counts'].shape}")
    if "X_pca" in adata.obsm:
        print(f"PCA: {adata.obsm['X_pca'].shape}")

    adata.write_h5ad(args.output, compression=args.compression)
    print(f"Saved: {args.output}")


if __name__ == "__main__":
    main()
