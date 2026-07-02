#!/bin/bash
# setup_env.sh - Setup a stable environment for BasicViz
# Strategy: Use Python 3.8 and 'defaults' channel for maximum legacy server compatibility
set -e

ENV_NAME="basicviz"

echo ">>> [1/4] Checking Conda..."
if ! command -v conda &> /dev/null; then
    echo "Error: Conda is not installed."
    exit 1
fi

echo ">>> [2/4] Resetting Environment '$ENV_NAME'..."
conda remove -n $ENV_NAME --all -y || true

echo ">>> [3/4] Creating Environment (Compatibility Mode)..."
# KEY CHANGES:
# 1. Channel: Use 'defaults' (more compatible binaries) instead of 'conda-forge'
# 2. Python: 3.8 (older, stable)
# 3. Numpy: <1.25 (to match Python 3.8 era)
conda create -n $ENV_NAME \
    python=3.8 \
    pandas \
    anndata \
    h5py \
    scipy \
    "numpy<1.25" \
    -c defaults -y

echo ">>> [4/4] Verifying installation..."
PY_PATH=$(conda run -n $ENV_NAME which python)
ENV_ROOT=$(conda run -n $ENV_NAME echo $CONDA_PREFIX)

conda run -n $ENV_NAME python -c "import numpy; print(f'Numpy: {numpy.__version__}')"
conda run -n $ENV_NAME python -c "import anndata; print(f'Anndata: {anndata.__version__}')"

echo ""
echo "======================================================="
echo "✅ Environment Setup Successful!"
echo ""
echo "Run the pipeline using this command:"
echo ""
echo "export RETICULATE_PYTHON=$PY_PATH"
# We still try to export LD_LIBRARY_PATH as a safety net
echo "export LD_LIBRARY_PATH=$ENV_ROOT/lib:\$LD_LIBRARY_PATH"
echo "Rscript main.R"
echo "======================================================="
