"""pySCENIC Python API workflow template.

This is an outline meant to be adapted.
Use raw counts (integers) for GRN inference.
"""

from __future__ import annotations

import importlib
from typing import Any

import pandas as pd


def run_pyscenic_python_api(expr_df: pd.DataFrame, tf_names: list[str]):
    """Run a minimal pySCENIC-like pipeline (outline).

    Parameters
    - expr_df: cells x genes expression (raw counts)
    - tf_names: list of TF gene symbols present in expr_df.columns
    """

    # Import at runtime so this template stays importable without deps.
    grnboost2: Any = importlib.import_module("arboreto.algo").grnboost2
    modules_from_adjacencies: Any = importlib.import_module(
        "pyscenic.utils"
    ).modules_from_adjacencies

    # 1) GRN inference
    adjacencies = grnboost2(expression_data=expr_df, tf_names=tf_names)

    # 2) Build co-expression modules from adjacencies
    modules = modules_from_adjacencies(adjacencies, expr_df)

    # 3) Motif pruning (requires cisTarget ranking DB + motif annotations)
    # prune2df = importlib.import_module("pyscenic.prune").prune2df
    # df2regulons = importlib.import_module("pyscenic.prune").df2regulons
    # pruned_df = prune2df(
    #     dbs=[ranking_db_path],
    #     modules=modules,
    #     motif_annotations_fname=motif_annotations_path,
    # )
    # regulons = df2regulons(pruned_df)

    # 4) AUCell scoring
    # aucell = importlib.import_module("pyscenic.aucell").aucell
    # auc_mtx = aucell(expr_df, regulons)
    # return auc_mtx

    return adjacencies, modules
