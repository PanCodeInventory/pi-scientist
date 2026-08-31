# Leiden Resolution Selection

Resolution selection is part of clustering, not upstream preparation. Always start from a prepared AnnData containing `obsm["X_pca"]` and a neighbor graph derived from it.

## Default: Unsupervised and Biological Validation

When no independent reference labels exist, do not optimize clustering against labels derived from the same data. Compare several resolutions and evaluate:

1. cluster stability under cell subsampling or repeated graph construction;
2. coherent canonical-marker expression;
3. separation of known populations without splitting driven only by QC, sample, or batch;
4. minimum cluster support per biological replicate;
5. whether differential signals between adjacent clusters are biologically interpretable.

```python
resolutions = [0.3, 0.5, 0.8, 1.0, 1.2, 1.5]
for resolution in resolutions:
    key = f"leiden_r{resolution}"
    sc.tl.leiden(
        adata,
        resolution=resolution,
        key_added=key,
        flavor="igraph",
        n_iterations=2,
        random_state=0,
    )

sc.pl.umap(
    adata,
    color=[f"leiden_r{r}" for r in resolutions],
    ncols=2,
)
```

There is no universal mapping from Leiden resolution to a fixed number of biologically valid cell types.

## Supervised scIB Optimization

Use `scib.metrics.cluster_optimal_resolution` only when `adata.obs` contains an **independent, trusted biological label column**. The default metric is NMI against `label_key`, so this is supervised benchmark optimization rather than an unsupervised method for discovering the true resolution.

```python
import scib

best_res, best_score, score_table = (
    scib.metrics.cluster_optimal_resolution(
        adata,
        label_key="reference_cell_type",
        cluster_key="leiden_opt",
        resolutions=[0.3, 0.5, 0.8, 1.0, 1.2, 1.5],
        use_rep="X_pca",
        return_all=True,
    )
)
```

Required behavior and side effects:

- `label_key` is mandatory and names the biological labels used by the optimization metric.
- Candidate clusterings are written to `adata.obs[f"{cluster_key}_{resolution}"]`, such as `leiden_opt_0.5`.
- The selected clustering is written to `adata.obs[cluster_key]`, here `adata.obs["leiden_opt"]`.
- Choose a new `cluster_key` or explicitly use `force=True` if overwriting is intended.
- `use_rep` may trigger neighbor recomputation when it differs from the representation recorded in the existing neighbor graph.

Without independent labels, use stability and biological validation instead of inventing a `label_key` from the clusters being optimized.

## References

- scIB API: https://scib.readthedocs.io/en/latest/api/scib.metrics.cluster_optimal_resolution.html
- Scanpy Leiden API: https://scanpy.readthedocs.io/en/stable/generated/scanpy.tl.leiden.html
