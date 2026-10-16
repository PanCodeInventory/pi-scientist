#!/bin/bash
# setup_env.sh - Verify the environment for BasicViz (non-destructive).
#
# Modern stack (verified): R >= 4.2 + reticulate >= 1.40 + CRAN 'anndata' works
# with Python 3.9+ and numpy 2.x. The legacy Python 3.8 / numpy<2.0 conda env is
# no longer needed and this script does NOT create or remove any environments.
set -euo pipefail

# R_ENV_BIN is an environment's bin directory, not the base R on PATH.
R_SCRIPT="${R_ENV_BIN:+${R_ENV_BIN%/}/Rscript}"
R_SCRIPT="${R_SCRIPT:-$(command -v Rscript || true)}"
if [ -z "$R_SCRIPT" ] || [ ! -x "$R_SCRIPT" ]; then
    echo "Rscript not found. Set R_ENV_BIN=/path/to/env/bin or run this check via mamba run -n <env>." >&2
    exit 1
fi
echo ">>> [1/3] Checking R packages with $R_SCRIPT..."
if ! MISSING_R=$("$R_SCRIPT" -e '
pkgs <- c("ggplot2","dplyr","tibble","tidyr","scales","yaml","ggsci",
          "RColorBrewer","reticulate","anndata","cowplot","ggalluvial","ggrastr")
missing <- pkgs[!sapply(pkgs, requireNamespace, quietly = TRUE)]
cat(if (length(missing)) paste(missing, collapse = " ") else "")
'); then
    echo "R package check failed in $R_SCRIPT (not evidence that packages are installed)." >&2
    exit 1
fi

if [ -n "$MISSING_R" ]; then
    echo "Missing R packages: $MISSING_R"
    echo "Install with:"
    echo "  \"$R_SCRIPT\" -e 'install.packages(strsplit(\"$MISSING_R\", \" \")[[1]])'"
    MISSING=1
else
    echo "OK: all required R packages present."
fi

echo ""
echo ">>> [2/3] Checking Python (anndata)..."
PY_BIN="${RETICULATE_PYTHON:-$(command -v python3 || command -v python || true)}"
if [ -z "$PY_BIN" ]; then
    echo "No python3 found on PATH."
    MISSING=1
elif "$PY_BIN" -c "import anndata" 2>/dev/null; then
    echo "OK: anndata importable from $PY_BIN"
else
    echo "Python at $PY_BIN cannot import anndata. Either:"
    echo "  a) pip install into it:      $PY_BIN -m pip install anndata"
    echo "  b) or create a dedicated env (optional, not required for modern R):"
    echo "       conda create -n basicviz python=3.12 anndata -c conda-forge -y"
    echo "       export RETICULATE_PYTHON=\$(conda run -n basicviz which python)"
    MISSING=1
fi

echo ""
echo ">>> [3/3] Summary"
if [ -n "${MISSING:-}" ]; then
    echo "Some checks failed - fix the items above, then re-run this script."
    exit 1
fi
echo "Environment OK. If you use a dedicated conda env, export it first:"
echo "  export RETICULATE_PYTHON=\$(conda run -n basicviz which python)"
echo "Then run the pipeline:"
echo "  \"$R_SCRIPT\" main.R            # from the directory containing config.yaml"
echo "  \"$R_SCRIPT\" main.R cfg.yaml   # or with an explicit config path"
