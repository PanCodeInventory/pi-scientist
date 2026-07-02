"""Attach pySCENIC outputs to a Scanpy AnnData object.

This template assumes you already produced AUCell scores (cells x regulons)
as a pandas DataFrame (index=cell IDs).
"""

from __future__ import annotations

import importlib
import pandas as pd


def _require_scanpy():
    """Import scanpy at runtime so this template stays importable."""
    return importlib.import_module("scanpy")


def attach_aucell_to_anndata(adata, auc_mtx: pd.DataFrame):
    """Add AUCell matrix to AnnData.

    Stores:
    - `adata.obsm['X_aucell']`: numpy array aligned to `adata.obs_names`
    - `adata.uns['aucell_regulons']`: regulon names (columns)
    """

    auc_mtx = auc_mtx.loc[adata.obs_names]
    adata.obsm["X_aucell"] = auc_mtx.to_numpy()
    adata.uns["aucell_regulons"] = list(auc_mtx.columns)
    return adata


def load_h5ad(path: str):
    """Convenience loader when you do have scanpy installed."""
    sc = _require_scanpy()
    return sc.read_h5ad(path)
