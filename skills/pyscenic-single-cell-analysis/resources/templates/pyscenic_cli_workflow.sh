#!/usr/bin/env bash
set -euo pipefail

# pySCENIC Complete CLI Workflow Template
# Usage: ./pyscenic_cli_workflow.sh <expr_mat.loom> <out_dir>

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <expr_mat.loom> <out_dir>" >&2
  exit 2
fi

EXPR_MTX="$1"
OUT_DIR="$2"

# EDIT THESE PATHS
DB_DIR="/path/to/cistarget_databases"
TF_FILE="${DB_DIR}/allTFs_hg38.txt"
RANKING_DB="${DB_DIR}/hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather"
MOTIF_ANNOTATIONS="${DB_DIR}/motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl"
NUM_WORKERS=20

mkdir -p "${OUT_DIR}"

python "$(dirname "$0")/../../scripts/validate_genes.py" \
  --expression "${EXPR_MTX}" \
  --database "${RANKING_DB}"

pyscenic grn \
  --num_workers "${NUM_WORKERS}" \
  -o "${OUT_DIR}/adjacencies.tsv" \
  "${EXPR_MTX}" \
  "${TF_FILE}"

pyscenic ctx \
  "${OUT_DIR}/adjacencies.tsv" \
  "${RANKING_DB}" \
  --annotations_fname "${MOTIF_ANNOTATIONS}" \
  --expression_mtx_fname "${EXPR_MTX}" \
  --output "${OUT_DIR}/regulons.csv" \
  --num_workers "${NUM_WORKERS}"

pyscenic aucell \
  "${EXPR_MTX}" \
  "${OUT_DIR}/regulons.csv" \
  -o "${OUT_DIR}/auc_mtx.loom" \
  --num_workers "${NUM_WORKERS}"

echo "Done: ${OUT_DIR}/auc_mtx.loom"
