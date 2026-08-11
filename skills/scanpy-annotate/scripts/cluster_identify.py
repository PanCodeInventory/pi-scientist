#!/usr/bin/env python3

import argparse
import json
import os
import sys
from pathlib import Path


CLUSTER_KEYWORDS = ("cluster", "leiden", "louvain", "seurat")
DEFAULT_OUTPUT_DIRNAME = "cluster_identify_output"


def print_progress(message: str) -> None:
    print(f"[cluster-identify] {message}", file=sys.stderr)


def fail(message: str, exit_code: int = 1) -> None:
    print(f"[cluster-identify] ERROR: {message}", file=sys.stderr)
    raise SystemExit(exit_code)


def warn(message: str) -> None:
    print(f"[cluster-identify] WARNING: {message}", file=sys.stderr)


def require_module(module_name: str, install_hint: str):
    try:
        module = __import__(module_name, fromlist=["*"])
    except ImportError as exc:
        fail(f"Missing dependency '{module_name}'. Install with: {install_hint}")
        raise exc
    return module


def load_anndata_module():
    return require_module("anndata", "pip install anndata")


def load_scanpy_module():
    return require_module("scanpy", "pip install scanpy")


def load_numpy_module():
    return require_module("numpy", "pip install numpy")


def load_pandas_module():
    return require_module("pandas", "pip install pandas")


def load_matplotlib_modules():
    matplotlib = require_module("matplotlib", "pip install matplotlib")
    matplotlib.use("Agg")
    plt = require_module("matplotlib.pyplot", "pip install matplotlib")
    sns = None
    try:
        sns = __import__("seaborn")
    except ImportError:
        sns = None
    backend_pdf = require_module("matplotlib.backends.backend_pdf", "pip install matplotlib")
    return plt, backend_pdf.PdfPages, sns


def load_h5ad(path: str | Path, backed: str | None = None):
    ad = load_anndata_module()
    try:
        return ad.read_h5ad(path, backed=backed)
    except Exception as exc:
        fail(f"Failed to read h5ad file '{path}': {exc}")
        raise exc


def ensure_dir(path: str | Path) -> Path:
    path_obj = Path(path)
    path_obj.mkdir(parents=True, exist_ok=True)
    return path_obj


def default_output_dir_for_h5ad(h5ad_path: str | Path) -> Path:
    return Path(h5ad_path).resolve().parent / DEFAULT_OUTPUT_DIRNAME


def parse_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def normalize_cluster_value(value) -> str:
    return str(value)


def write_json(data) -> None:
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


def close_backed_adata(adata) -> None:
    file_obj = getattr(adata, "file", None)
    if file_obj is not None:
        file_obj.close()


def detect_organism(var_names, sample_size: int = 200):
    np = load_numpy_module()

    genes = list(var_names)
    if len(genes) > sample_size:
        indices = np.random.choice(len(genes), sample_size, replace=False)
        genes = [genes[i] for i in indices]

    genes = [str(g) for g in genes if g and str(g)[0].isalpha() and len(str(g)) > 1]
    if not genes:
        return "unknown", 0.0, "insufficient_gene_symbols"

    mt_human = sum(1 for g in genes if g.startswith("MT-"))
    mt_mouse = sum(1 for g in genes if g.startswith("mt-"))
    if mt_human > 0 and mt_mouse == 0:
        return "human", 0.95, "mitochondrial_prefix"
    if mt_mouse > 0 and mt_human == 0:
        return "mouse", 0.95, "mitochondrial_prefix"

    alpha_only = [g for g in genes if g.isalpha()]
    if not alpha_only:
        return "unknown", 0.0, "insufficient_gene_symbols"

    uppercase = sum(1 for g in alpha_only if g.isupper()) / len(alpha_only)
    titlecase = (
        sum(1 for g in alpha_only if len(g) > 1 and g[0].isupper() and g[1:].islower())
        / len(alpha_only)
    )

    if uppercase > 0.7:
        return "human", float(uppercase), "gene_casing"
    if titlecase > 0.7:
        return "mouse", float(titlecase), "gene_casing"
    if uppercase > titlecase:
        return "human", 0.6, "gene_casing_mixed"
    return "mouse", 0.6, "gene_casing_mixed"


def find_cluster_columns(obs_columns) -> list[str]:
    return [
        str(column)
        for column in obs_columns
        if any(keyword in str(column).lower() for keyword in CLUSTER_KEYWORDS)
    ]


def ensure_cluster_col(adata, cluster_col: str) -> None:
    if cluster_col not in adata.obs.columns:
        available = ", ".join(map(str, adata.obs.columns))
        fail(f"Cluster column '{cluster_col}' not found. Available columns: {available}")


def get_output_dir(args, h5ad_path: str | Path | None = None) -> Path:
    if getattr(args, "output_dir", None):
        return ensure_dir(args.output_dir)
    if h5ad_path is None:
        return ensure_dir(Path.cwd() / DEFAULT_OUTPUT_DIRNAME)
    return ensure_dir(default_output_dir_for_h5ad(h5ad_path))


def get_expression_matrix(adata):
    np = load_numpy_module()
    matrix = adata.X
    if hasattr(matrix, "toarray"):
        matrix = matrix.toarray()
    return np.asarray(matrix)


def get_expr_df(adata):
    pd = load_pandas_module()
    matrix = get_expression_matrix(adata)
    return pd.DataFrame(matrix, index=adata.obs_names.astype(str), columns=adata.var_names.astype(str))


def pick_feature_source(adata, genes: list[str]):
    source = adata
    source_genes = set(map(str, adata.var_names))
    if getattr(adata, "raw", None) is not None and any(g not in source_genes for g in genes):
        raw = adata.raw.to_adata()
        raw_genes = set(map(str, raw.var_names))
        if any(g in raw_genes for g in genes):
            source = raw
    return source


def rank_genes_groups_df(adata, group: str):
    pd = load_pandas_module()
    sc = load_scanpy_module()
    df = sc.get.rank_genes_groups_df(adata, group=group)
    rename_map = {
        "names": "gene",
        "logfoldchanges": "logfoldchange",
        "pvals": "pval",
        "pvals_adj": "pval_adj",
    }
    df = df.rename(columns=rename_map)
    required = ["gene", "logfoldchange", "pval", "pval_adj"]
    for column in required:
        if column not in df.columns:
            df[column] = pd.NA
    return df


def compute_pct_expression(adata, cluster_col: str, target_label: str, reference_labels: list[str] | None = None):
    np = load_numpy_module()
    expr_df = get_expr_df(adata)
    labels = adata.obs[cluster_col].astype(str)
    target_mask = labels == target_label
    if reference_labels is None:
        reference_mask = labels != target_label
    else:
        reference_mask = labels.isin(reference_labels)

    pct_in = ((expr_df.loc[target_mask] > 0).sum(axis=0) / max(int(target_mask.sum()), 1)).astype(float)
    pct_out = ((expr_df.loc[reference_mask] > 0).sum(axis=0) / max(int(reference_mask.sum()), 1)).astype(float)
    pct_in = pct_in.replace([np.inf, -np.inf], 0.0).fillna(0.0)
    pct_out = pct_out.replace([np.inf, -np.inf], 0.0).fillna(0.0)
    return pct_in, pct_out


def summarize_deg(df, cluster_label: str):
    sig = df[df["pval_adj"].fillna(1.0) < 0.05]
    top_gene = None if df.empty else str(df.iloc[0]["gene"])
    top_fc = None if df.empty else float(df.iloc[0]["logfoldchange"]) if df.iloc[0]["logfoldchange"] == df.iloc[0]["logfoldchange"] else None
    return {
        "cluster": cluster_label,
        "top_gene": top_gene,
        "log2fc": top_fc,
        "n_degs": int(len(sig)),
    }


def save_deg_table(adata, cluster_col: str, cluster_label: str, output_path: Path, reference_labels: list[str] | None = None):
    df = rank_genes_groups_df(adata, cluster_label)
    pct_in, pct_out = compute_pct_expression(adata, cluster_col, cluster_label, reference_labels=reference_labels)
    df["pct_in_cluster"] = df["gene"].map(pct_in).fillna(0.0)
    df["pct_out_cluster"] = df["gene"].map(pct_out).fillna(0.0)
    df = df[["gene", "logfoldchange", "pval", "pval_adj", "pct_in_cluster", "pct_out_cluster"]]
    df.to_csv(output_path, index=False)
    return df


def command_inspect(args) -> None:
    print_progress(f"Inspecting {args.h5ad_path}")
    adata = load_h5ad(args.h5ad_path, backed="r")
    try:
        organism, confidence, method = detect_organism(adata.var_names, sample_size=100)
        report = {
            "n_cells": int(adata.n_obs),
            "n_genes": int(adata.n_vars),
            "obs_columns": [str(col) for col in adata.obs.columns],
            "obsm_keys": [str(key) for key in adata.obsm.keys()],
            "has_raw": getattr(adata, "raw", None) is not None,
            "has_umap": "X_umap" in adata.obsm,
            "organism": organism,
            "organism_confidence": round(float(confidence), 3),
            "organism_method": method,
            "cluster_columns": find_cluster_columns(adata.obs.columns),
            "var_names_sample": [str(v) for v in list(adata.var_names[:10])],
        }
        write_json(report)
    finally:
        close_backed_adata(adata)


def command_deg(args) -> None:
    sc = load_scanpy_module()
    pd = load_pandas_module()

    print_progress(f"Running DEG analysis for {args.h5ad_path}")
    adata = load_h5ad(args.h5ad_path)
    ensure_cluster_col(adata, args.cluster_col)

    output_dir = get_output_dir(args, args.h5ad_path)
    deg_dir = ensure_dir(output_dir / "deg")
    target_clusters = parse_csv_list(args.target_clusters)
    reference_clusters = parse_csv_list(args.reference_clusters)
    labels = adata.obs[args.cluster_col].astype(str)
    all_clusters = [str(v) for v in labels.astype(str).unique().tolist()]

    summary_rows = []
    deg_counts = {}

    if not target_clusters:
        sc.tl.rank_genes_groups(adata, groupby=args.cluster_col, method="wilcoxon")
        for cluster_label in all_clusters:
            out_path = deg_dir / f"cluster_{cluster_label}_degs.csv"
            df = save_deg_table(adata, args.cluster_col, cluster_label, out_path)
            summary_rows.append(summarize_deg(df, cluster_label))
            deg_counts[cluster_label] = int((df["pval_adj"].fillna(1.0) < 0.05).sum())
    else:
        for target in target_clusters:
            if target not in set(all_clusters):
                warn(f"Target cluster '{target}' not found; skipping")
                continue

            if not reference_clusters or reference_clusters == ["all"]:
                subset = adata.copy()
                sc.tl.rank_genes_groups(
                    subset,
                    groupby=args.cluster_col,
                    groups=[target],
                    reference="rest",
                    method="wilcoxon",
                )
                ref_labels = [cluster for cluster in all_clusters if cluster != target]
                out_path = deg_dir / f"cluster_{target}_degs.csv"
                df = save_deg_table(subset, args.cluster_col, target, out_path, reference_labels=ref_labels)
            else:
                ref_labels = [cluster for cluster in reference_clusters if cluster in set(all_clusters) and cluster != target]
                if not ref_labels:
                    warn(f"No valid reference clusters remain for target '{target}'; skipping")
                    continue
                subset_mask = labels.isin([target] + ref_labels)
                subset = adata[subset_mask].copy()
                subset.obs["__deg_group__"] = [
                    target if value == target else "__reference__" for value in subset.obs[args.cluster_col].astype(str)
                ]
                sc.tl.rank_genes_groups(
                    subset,
                    groupby="__deg_group__",
                    groups=[target],
                    reference="__reference__",
                    method="wilcoxon",
                )
                out_path = deg_dir / f"cluster_{target}_degs.csv"
                df = rank_genes_groups_df(subset, target)
                pct_in, pct_out = compute_pct_expression(subset, args.cluster_col, target, reference_labels=ref_labels)
                df["pct_in_cluster"] = df["gene"].map(pct_in).fillna(0.0)
                df["pct_out_cluster"] = df["gene"].map(pct_out).fillna(0.0)
                df = df[["gene", "logfoldchange", "pval", "pval_adj", "pct_in_cluster", "pct_out_cluster"]]
                df.to_csv(out_path, index=False)

            summary_rows.append(summarize_deg(df, target))
            deg_counts[target] = int((df["pval_adj"].fillna(1.0) < 0.05).sum())

    summary_df = pd.DataFrame(summary_rows, columns=["cluster", "top_gene", "log2fc", "n_degs"])
    summary_path = deg_dir / "all_degs_summary.csv"
    summary_df.to_csv(summary_path, index=False)

    for cluster_label, count in sorted(deg_counts.items()):
        print_progress(f"Cluster {cluster_label}: {count} DEGs (adjusted p < 0.05)")

    write_json(
        {
            "deg_dir": str(deg_dir),
            "summary_csv": str(summary_path),
            "deg_counts": deg_counts,
        }
    )


def parse_gene_group_specs(gene_groups: list[str] | None) -> dict[str, list[str]]:
    parsed = {}
    for item in gene_groups or []:
        if "=" not in item:
            warn(f"Skipping malformed gene-group '{item}'")
            continue
        key, value = item.split("=", 1)
        parsed[key.strip()] = parse_csv_list(value)
    return parsed


def fallback_dotplot(expr_df, labels, genes, output_path: Path):
    plt, _, sns = load_matplotlib_modules()
    pd = load_pandas_module()
    records = []
    for cluster in labels.astype(str).unique():
        cluster_mask = labels.astype(str) == cluster
        cluster_expr = expr_df.loc[cluster_mask, genes]
        for gene in genes:
            values = cluster_expr[gene]
            records.append(
                {
                    "cluster": cluster,
                    "gene": gene,
                    "avg_expr": float(values.mean()),
                    "pct_expr": float((values > 0).mean()),
                }
            )
    plot_df = pd.DataFrame(records)
    fig, ax = plt.subplots(figsize=(max(6, len(genes) * 0.8), max(4, plot_df["cluster"].nunique() * 0.5)))
    if sns is not None:
        sns.scatterplot(
            data=plot_df,
            x="gene",
            y="cluster",
            size="pct_expr",
            hue="avg_expr",
            sizes=(30, 300),
            palette="viridis",
            ax=ax,
        )
    else:
        x_positions = {gene: idx for idx, gene in enumerate(genes)}
        y_levels = list(plot_df["cluster"].drop_duplicates())
        y_positions = {cluster: idx for idx, cluster in enumerate(y_levels)}
        scatter = ax.scatter(
            [x_positions[g] for g in plot_df["gene"]],
            [y_positions[c] for c in plot_df["cluster"]],
            s=[30 + 270 * v for v in plot_df["pct_expr"]],
            c=plot_df["avg_expr"],
            cmap="viridis",
        )
        ax.set_xticks(list(x_positions.values()), list(x_positions.keys()), rotation=45, ha="right")
        ax.set_yticks(list(y_positions.values()), list(y_positions.keys()))
        fig.colorbar(scatter, ax=ax, label="avg_expr")
    ax.set_title("DotPlot")
    fig.tight_layout()
    fig.savefig(output_path)
    plt.close(fig)


def fallback_umap(adata, genes, output_path: Path):
    plt, PdfPages, _ = load_matplotlib_modules()
    expr_df = get_expr_df(adata)
    umap = adata.obsm["X_umap"]
    with PdfPages(output_path) as pdf:
        for gene in genes:
            fig, ax = plt.subplots(figsize=(6, 5))
            scatter = ax.scatter(umap[:, 0], umap[:, 1], c=expr_df[gene], s=5, cmap="viridis")
            ax.set_title(gene)
            ax.set_xlabel("UMAP1")
            ax.set_ylabel("UMAP2")
            fig.colorbar(scatter, ax=ax, label="expression")
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)


def fallback_violin(expr_df, labels, genes, output_path: Path):
    plt, PdfPages, sns = load_matplotlib_modules()
    pd = load_pandas_module()
    with PdfPages(output_path) as pdf:
        for gene in genes:
            fig, ax = plt.subplots(figsize=(max(6, labels.nunique() * 0.6), 4))
            plot_df = pd.DataFrame({"cluster": labels.astype(str), "expression": expr_df[gene].values})
            if sns is not None:
                sns.violinplot(data=plot_df, x="cluster", y="expression", ax=ax, inner="quart")
            else:
                groups = [plot_df.loc[plot_df["cluster"] == cluster, "expression"].values for cluster in plot_df["cluster"].unique()]
                ax.violinplot(groups, showmeans=True)
                ax.set_xticks(range(1, len(groups) + 1), plot_df["cluster"].unique(), rotation=45)
            ax.set_title(gene)
            ax.set_xlabel("cluster")
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)


def command_validate(args) -> None:
    print_progress(f"Generating validation plots for {args.h5ad_path}")
    adata = load_h5ad(args.h5ad_path)
    ensure_cluster_col(adata, args.cluster_col)

    output_dir = get_output_dir(args, args.h5ad_path)
    plot_dir = ensure_dir(output_dir / "validation_plots")
    gene_groups = parse_gene_group_specs(args.gene_groups)
    requested_genes = parse_csv_list(args.genes)
    feature_source = pick_feature_source(adata, requested_genes)
    source_genes = set(map(str, feature_source.var_names))
    genes = [gene for gene in requested_genes if gene in source_genes]
    missing = [gene for gene in requested_genes if gene not in source_genes]

    for gene in missing:
        warn(f"Gene '{gene}' not found; skipping")
    if not genes:
        fail("None of the requested genes were found in var_names or raw.var_names")
    if "X_umap" not in adata.obsm:
        fail("UMAP coordinates not found in adata.obsm['X_umap']")

    gene_group_path = output_dir / "gene_groups.json"
    gene_group_path.write_text(json.dumps(gene_groups, indent=2) + "\n", encoding="utf-8")

    dotplot_path = plot_dir / "dotplot.pdf"
    feature_umap_path = plot_dir / "feature_umap.pdf"
    violin_path = plot_dir / "violin_plots.pdf"

    try:
        sc = load_scanpy_module()
        plt, _, _ = load_matplotlib_modules()
        dotplot = sc.pl.dotplot(feature_source, var_names=genes, groupby=args.cluster_col, show=False, return_fig=True)
        dotplot.savefig(dotplot_path)
        plt.close(dotplot.fig)

        sc.pl.umap(feature_source, color=genes, ncols=3, show=False)
        plt.gcf().savefig(feature_umap_path)
        plt.close(plt.gcf())

        sc.pl.violin(feature_source, keys=genes, groupby=args.cluster_col, rotation=45, show=False)
        plt.gcf().savefig(violin_path)
        plt.close(plt.gcf())
    except SystemExit:
        raise
    except Exception as exc:
        warn(f"Scanpy plotting failed ({exc}); falling back to matplotlib")
        expr_df = get_expr_df(feature_source)
        labels = feature_source.obs[args.cluster_col]
        fallback_dotplot(expr_df, labels, genes, dotplot_path)
        fallback_umap(feature_source, genes, feature_umap_path)
        fallback_violin(expr_df, labels, genes, violin_path)

    write_json(
        {
            "plot_dir": str(plot_dir),
            "dotplot": str(dotplot_path),
            "feature_umap": str(feature_umap_path),
            "violin_plots": str(violin_path),
            "gene_groups_json": str(gene_group_path),
            "used_genes": genes,
            "missing_genes": missing,
        }
    )


def read_gene_list_from_csv(gene_csv_path: str | Path):
    pd = load_pandas_module()
    gene_df = pd.read_csv(gene_csv_path)
    if "gene" not in gene_df.columns:
        fail(f"Gene CSV '{gene_csv_path}' must contain a 'gene' column")
    genes = [str(gene).strip() for gene in gene_df["gene"].dropna().tolist() if str(gene).strip()]
    if not genes:
        fail(f"Gene CSV '{gene_csv_path}' has no usable genes in the 'gene' column")
    return genes


def normalize_enrichr_organism(organism: str) -> str:
    mapping = {"human": "Human", "mouse": "Mouse"}
    organism_lower = organism.lower()
    if organism_lower not in mapping:
        fail("Organism must be 'human' or 'mouse'")
    return mapping[organism_lower]


def command_enrich(args) -> None:
    gp = require_module("gseapy", "pip install gseapy")
    output_dir = ensure_dir(args.output_dir)
    genes = read_gene_list_from_csv(args.gene_csv_path)
    enrichr_org = normalize_enrichr_organism(args.organism)
    kegg_library = "KEGG_2021_Human" if args.organism.lower() == "human" else "KEGG_2021_Mouse"

    print_progress(f"Running enrichment on {len(genes)} genes")
    go_res = gp.enrichr(
        gene_list=genes,
        gene_sets="GO_Biological_Process_2021",
        organism=enrichr_org,
        outdir=None,
    )
    kegg_res = gp.enrichr(
        gene_list=genes,
        gene_sets=kegg_library,
        organism=enrichr_org,
        outdir=None,
    )

    go_path = output_dir / "go_enrichment.csv"
    kegg_path = output_dir / "kegg_enrichment.csv"
    dotplot_path = output_dir / "enrichment_dotplot.pdf"
    go_res.results.to_csv(go_path, index=False)
    kegg_res.results.to_csv(kegg_path, index=False)

    try:
        ax = gp.barplot(go_res.results.head(10), title="Top GO Biological Process Terms")
        ax.figure.tight_layout()
        ax.figure.savefig(dotplot_path)
        ax.figure.clf()
    except Exception as exc:
        warn(f"Could not create enrichment dotplot/barplot: {exc}")

    write_json(
        {
            "go_enrichment": str(go_path),
            "kegg_enrichment": str(kegg_path),
            "enrichment_dotplot": str(dotplot_path),
        }
    )


def maybe_normalize_for_pathways(adata) -> None:
    np = load_numpy_module()
    sc = load_scanpy_module()
    matrix = adata.X
    if hasattr(matrix, "toarray"):
        preview = matrix[: min(200, adata.n_obs), : min(200, adata.n_vars)].toarray()
    else:
        preview = matrix[: min(200, adata.n_obs), : min(200, adata.n_vars)]
    preview = np.asarray(preview)
    if preview.size == 0:
        return
    if float(preview.max()) > 50 or float(preview.mean()) > 5:
        print_progress("Applying normalize_total + log1p before ssGSEA/TF scoring")
        sc.pp.normalize_total(adata, target_sum=1e4)
        sc.pp.log1p(adata)


def resolve_hallmark_library(var_names):
    gp = require_module("gseapy", "pip install gseapy")
    organism, _, _ = detect_organism(var_names)
    library_org = "Human" if organism != "mouse" else "Mouse"
    try:
        hallmark = gp.parser.get_library(name="MSigDB_Hallmark_2020", organism=library_org)
    except Exception:
        hallmark = gp.get_library(name="MSigDB_Hallmark_2020", organism=library_org)
    return hallmark, organism


def command_gsva(args) -> None:
    gp = require_module("gseapy", "pip install gseapy")
    pd = load_pandas_module()
    print_progress(f"Running ssGSEA for {args.h5ad_path}")

    adata = load_h5ad(args.h5ad_path)
    ensure_cluster_col(adata, args.cluster_col)
    target_clusters = parse_csv_list(args.target_clusters)
    if not target_clusters:
        fail("--target-clusters is required")

    output_dir = get_output_dir(args, args.h5ad_path)
    maybe_normalize_for_pathways(adata)
    expr_df = get_expr_df(adata).T
    hallmark_dict, organism = resolve_hallmark_library(adata.var_names)
    print_progress(f"Using {organism} Hallmark gene sets")

    res = gp.ssgsea(data=expr_df, gene_sets=hallmark_dict, outdir=None, sample_norm_method="rank")
    res2d = res.res2d.copy()
    sample_col = "Name" if "Name" in res2d.columns else "Sample"
    score_col = "NES" if "NES" in res2d.columns else "ES"
    if sample_col not in res2d.columns or "Term" not in res2d.columns:
        fail("Unexpected ssGSEA output format from gseapy")

    cell_scores = res2d.pivot(index="Term", columns=sample_col, values=score_col)
    cluster_labels = adata.obs[args.cluster_col].astype(str)
    cluster_score_matrix = cell_scores.T.copy()
    cluster_score_matrix[args.cluster_col] = cluster_labels.reindex(cluster_score_matrix.index)
    cluster_avg = cluster_score_matrix.groupby(args.cluster_col).mean(numeric_only=True).T

    scores_path = output_dir / "gsva_scores.csv"
    cluster_avg.to_csv(scores_path)

    top_frames = []
    for cluster in target_clusters:
        if cluster not in cluster_avg.columns:
            warn(f"Target cluster '{cluster}' not found in cluster averages; skipping")
            continue
        reference = cluster_avg.drop(columns=[cluster])
        if reference.empty:
            warn(f"Target cluster '{cluster}' has no reference clusters; skipping")
            continue
        diff = cluster_avg[cluster] - reference.mean(axis=1)
        top_df = diff.sort_values(ascending=False).head(20).reset_index()
        top_df.columns = ["pathway", "score_delta"]
        top_df.to_csv(output_dir / f"gsva_cluster_{cluster}_top_pathways.csv", index=False)
        top_frames.append(top_df.assign(cluster=cluster))

    plt, _, sns = load_matplotlib_modules()
    selected_pathways = []
    for frame in top_frames:
        selected_pathways.extend(frame["pathway"].head(10).tolist())
    selected_pathways = list(dict.fromkeys(selected_pathways))[:30]
    heatmap_path = output_dir / "gsva_heatmap.pdf"
    if selected_pathways:
        heatmap_data = cluster_avg.loc[selected_pathways]
        fig, ax = plt.subplots(figsize=(max(6, heatmap_data.shape[1] * 1.2), max(6, heatmap_data.shape[0] * 0.3)))
        if sns is not None:
            sns.heatmap(heatmap_data, cmap="vlag", center=0, ax=ax)
        else:
            im = ax.imshow(heatmap_data.values, aspect="auto", cmap="vlag")
            ax.set_xticks(range(len(heatmap_data.columns)), heatmap_data.columns, rotation=45, ha="right")
            ax.set_yticks(range(len(heatmap_data.index)), heatmap_data.index)
            fig.colorbar(im, ax=ax)
        ax.set_title("Top Differential Pathways")
        fig.tight_layout()
        fig.savefig(heatmap_path)
        plt.close(fig)

    write_json(
        {
            "gsva_scores": str(scores_path),
            "gsva_heatmap": str(heatmap_path),
            "target_clusters": target_clusters,
        }
    )


def command_tf(args) -> None:
    dc = require_module("decoupler", "pip install decoupler")
    pd = load_pandas_module()
    print_progress(f"Running TF activity analysis for {args.h5ad_path}")

    adata = load_h5ad(args.h5ad_path)
    ensure_cluster_col(adata, args.cluster_col)
    output_dir = get_output_dir(args, args.h5ad_path)
    maybe_normalize_for_pathways(adata)

    net = dc.op.collectri(organism=args.organism.lower())
    mat = get_expr_df(adata).T
    acts = dc.run_ulm(mat=mat, net=net)

    tf_by_cell = None
    if hasattr(acts, "to_df"):
        tf_by_cell = acts.to_df().T
    elif isinstance(acts, pd.DataFrame):
        tf_by_cell = acts.T if set(acts.columns) == set(mat.columns) else acts
    if tf_by_cell is None:
        raise RuntimeError("Unsupported decoupler output format")

    tf_by_cell = tf_by_cell.T
    tf_by_cell[args.cluster_col] = adata.obs[args.cluster_col].astype(str).reindex(tf_by_cell.index)
    tf_cluster_avg = tf_by_cell.groupby(args.cluster_col).mean(numeric_only=True).T

    activity_path = output_dir / "tf_activity.csv"
    tf_cluster_avg.to_csv(activity_path)

    summary_rows = []
    for cluster in tf_cluster_avg.columns:
        top_df = tf_cluster_avg[cluster].sort_values(ascending=False).head(20).reset_index()
        top_df.columns = ["tf", "activity_score"]
        top_df.to_csv(output_dir / f"tf_cluster_{cluster}_top.csv", index=False)
        summary_rows.append(top_df.head(10).assign(cluster=cluster))

    plt, _, sns = load_matplotlib_modules()
    barplot_path = output_dir / "tf_barplot.pdf"
    if summary_rows:
        top_plot_df = pd.concat(summary_rows, ignore_index=True)
        plot_df = top_plot_df.groupby("cluster", group_keys=False).head(5)
        fig, ax = plt.subplots(figsize=(10, max(4, len(plot_df) * 0.3)))
        if sns is not None:
            sns.barplot(data=plot_df, x="activity_score", y="tf", hue="cluster", dodge=False, ax=ax)
        else:
            ax.barh(plot_df["tf"], plot_df["activity_score"])
        ax.set_title("Top TF Activities")
        fig.tight_layout()
        fig.savefig(barplot_path)
        plt.close(fig)

    write_json({"tf_activity": str(activity_path), "tf_barplot": str(barplot_path)})


def command_write(args) -> None:
    pd = load_pandas_module()
    adata = load_h5ad(args.h5ad_path)
    ensure_cluster_col(adata, args.cluster_col)
    annotations = pd.read_csv(args.annotations)
    required = {"cluster", "identity", "confidence"}
    missing = required - set(annotations.columns)
    if missing:
        fail(f"Annotations CSV missing required columns: {', '.join(sorted(missing))}")

    identity_map = {
        normalize_cluster_value(row["cluster"]): row["identity"] for _, row in annotations.iterrows()
    }
    confidence_map = {
        normalize_cluster_value(row["cluster"]): row["confidence"] for _, row in annotations.iterrows()
    }
    cluster_labels = adata.obs[args.cluster_col].apply(normalize_cluster_value)
    adata.obs["cluster_identity"] = cluster_labels.map(identity_map).fillna("unannotated")
    adata.obs["identity_confidence"] = cluster_labels.map(confidence_map).fillna("unannotated")
    adata.write_h5ad(args.output)

    summary = adata.obs["cluster_identity"].value_counts(dropna=False).to_dict()
    print_progress(f"Wrote annotated AnnData to {args.output}")
    write_json(
        {
            "output": str(args.output),
            "n_cells": int(adata.n_obs),
            "identity_counts": {str(key): int(value) for key, value in summary.items()},
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cluster identify pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect", help="Inspect an h5ad file")
    inspect_parser.add_argument("h5ad_path")
    inspect_parser.set_defaults(func=command_inspect)

    deg_parser = subparsers.add_parser("deg", help="Run cluster differential expression")
    deg_parser.add_argument("h5ad_path")
    deg_parser.add_argument("--cluster-col", required=True)
    deg_parser.add_argument("--output-dir")
    deg_parser.add_argument("--target-clusters")
    deg_parser.add_argument("--reference-clusters", default="all")
    deg_parser.set_defaults(func=command_deg)

    validate_parser = subparsers.add_parser("validate", help="Generate validation plots")
    validate_parser.add_argument("h5ad_path")
    validate_parser.add_argument("--cluster-col", required=True)
    validate_parser.add_argument("--output-dir")
    validate_parser.add_argument("--genes", required=True)
    validate_parser.add_argument("--gene-groups", nargs="*")
    validate_parser.set_defaults(func=command_validate)

    enrich_parser = subparsers.add_parser("enrich", help="Run enrichment analysis")
    enrich_parser.add_argument("gene_csv_path")
    enrich_parser.add_argument("--organism", required=True)
    enrich_parser.add_argument("--output-dir", required=True)
    enrich_parser.set_defaults(func=command_enrich)

    gsva_parser = subparsers.add_parser("gsva", help="Run ssGSEA pathway scoring")
    gsva_parser.add_argument("h5ad_path")
    gsva_parser.add_argument("--cluster-col", required=True)
    gsva_parser.add_argument("--target-clusters", required=True)
    gsva_parser.add_argument("--output-dir")
    gsva_parser.set_defaults(func=command_gsva)

    tf_parser = subparsers.add_parser("tf", help="Run TF activity analysis")
    tf_parser.add_argument("h5ad_path")
    tf_parser.add_argument("--cluster-col", required=True)
    tf_parser.add_argument("--organism", required=True)
    tf_parser.add_argument("--output-dir")
    tf_parser.set_defaults(func=command_tf)

    write_parser = subparsers.add_parser("write", help="Write annotations back to h5ad")
    write_parser.add_argument("h5ad_path")
    write_parser.add_argument("--annotations", required=True)
    write_parser.add_argument("--cluster-col", required=True)
    write_parser.add_argument("--output", required=True)
    write_parser.set_defaults(func=command_write)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except KeyboardInterrupt:
        fail("Interrupted by user")
    except SystemExit:
        raise
    except Exception as exc:
        fail(str(exc))


if __name__ == "__main__":
    main()
