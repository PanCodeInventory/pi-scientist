#!/usr/bin/env bash
#
# LIANA+ Environment Setup Script
# =================================
# Creates a mamba/conda environment with LIANA+ and all dependencies.
#
# Usage:
#   bash setup_environment.sh [ENV_NAME]
#
# Arguments:
#   ENV_NAME  - Name for the conda environment (default: liana_env)
#
# Examples:
#   bash setup_environment.sh
#   bash setup_environment.sh my_liana_project
#
# Requirements:
#   - mamba (recommended) or conda installed
#   - internet access for package downloads
#
set -euo pipefail

# =============================================
# Configuration
# =============================================
ENV_NAME="${1:-liana_env}"
PYTHON_VERSION="3.11"
CONDA_CHANNEL="conda-forge"
PIPKWARGS="--no-build-isolation"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================
# Helper Functions
# =============================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# =============================================
# Pre-flight Checks
# =============================================
log_info "LIANA+ Environment Setup"
log_info "========================="
log_info "Environment name: ${ENV_NAME}"
log_info "Python version: ${PYTHON_VERSION}"
log_info "Channel: ${CONDA_CHANNEL}"
echo ""

# Check for mamba or conda
if check_command mamba; then
    CONDA_CMD="mamba"
    log_info "Using mamba (fast solver)"
elif check_command conda; then
    CONDA_CMD="conda"
    log_warn "Using conda (slower than mamba). Consider installing mamba for faster setup."
    log_warn "  Install mamba: conda install -n base -c conda-forge mamba"
else
    log_error "Neither mamba nor conda found. Please install one first."
    log_error "  Miniconda: https://docs.conda.io/en/latest/miniconda.html"
    log_error "  Mambaforge: https://github.com/conda-forge/miniforge#mambaforge"
    exit 1
fi

# Check if environment already exists
if ${CONDA_CMD} env list | grep -q "^${ENV_NAME} "; then
    log_warn "Environment '${ENV_NAME}' already exists."
    read -p "  Remove and recreate? [y/N]: " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Removing existing environment..."
        ${CONDA_CMD} env remove -n "${ENV_NAME}" -y
    else
        log_info "Aborting. Use existing environment or provide a different name."
        exit 0
    fi
fi

# =============================================
# Create Environment
# =============================================
log_info "Creating conda environment: ${ENV_NAME} (Python ${PYTHON_VERSION})..."
${CONDA_CMD} create -n "${ENV_NAME}" -c "${CONDA_CHANNEL}" \
    python="${PYTHON_VERSION}" \
    -y

log_info "Activating environment..."
eval "$(${CONDA_CMD} shell.bash hook)"
${CONDA_CMD} activate "${ENV_NAME}"

# =============================================
# Install Core Dependencies
# =============================================
log_info "Installing core scientific packages..."
${CONDA_CMD} install -c "${CONDA_CHANNEL}" -y \
    numpy \
    pandas \
    scipy \
    matplotlib \
    seaborn \
    h5py \
    anndata \
    scanpy \
    squidpy

# =============================================
# Install LIANA+
# =============================================
log_info "Installing LIANA+ via pip..."
pip install liana ${PIPKWARGS}

# =============================================
# Install Optional Dependencies
# =============================================
log_info "Installing optional packages..."
pip install mygene ${PIPKWARGS}       # Gene ID conversion
pip install networkx ${PIPKWARGS}     # Network analysis
pip install plotly ${PIPKWARGS}       # Interactive plots
pip install kaleido ${PIPKWARGS}      # Plotly static export

# =============================================
# Verification
# =============================================
log_info "Verifying installation..."

# Check Python version
PYTHON_VER=$(python --version 2>&1)
log_info "  Python: ${PYTHON_VER}"

# Check scanpy
SC_VERSION=$(python -c "import scanpy; print(scanpy.__version__)" 2>/dev/null || echo "NOT INSTALLED")
log_info "  scanpy: ${SC_VERSION}"

# Check anndata
AD_VERSION=$(python -c "import anndata; print(anndata.__version__)" 2>/dev/null || echo "NOT INSTALLED")
log_info "  anndata: ${AD_VERSION}"

# Check liana
LI_VERSION=$(python -c "import liana; print(liana.__version__)" 2>/dev/null || echo "NOT INSTALLED")
log_info "  liana: ${LI_VERSION}"

# Check squidpy
SQ_VERSION=$(python -c "import squidpy; print(squidpy.__version__)" 2>/dev/null || echo "NOT INSTALLED")
log_info "  squidpy: ${SQ_VERSION}"

# Check mygene
MG_VERSION=$(python -c "import mygene; print(mygene.__version__)" 2>/dev/null || echo "NOT INSTALLED")
log_info "  mygene: ${MG_VERSION}"

# Verify LIANA+ can import
python -c "
import liana as li
from liana import resource
print('  LIANA+ import: OK')

# Check available resources
try:
    res = resource.select_resource(resource_name='consensus')
    print(f'  Consensus resource: {len(res)} interactions')
except Exception as e:
    print(f'  Resource loading: ERROR - {e}')
"

# =============================================
# Summary
# =============================================
echo ""
log_info "========================="
log_info "Setup Complete!"
log_info "========================="
echo ""
log_info "To activate the environment:"
echo "  ${CONDA_CMD} activate ${ENV_NAME}"
echo ""
log_info "To verify LIANA+ works:"
echo "  python -c \"import liana as li; print('LIANA+ version:', li.__version__)\""
echo ""
log_info "To run a quick test:"
echo "  python -c \""
echo "  import scanpy as sc; import liana as li"
echo "  adata = sc.datasets.pbmc68k_reduced()"
echo "  adata.obs['cell_type'] = adata.obs['bulk_labels'].astype(str)"
echo "  res = li.mt.rank_aggregate(adata, groupby='cell_type', n_perms=50)"
echo "  print(f'Found {len(res)} interactions')"
echo "  \""
echo ""
log_info "Environment location:"
${CONDA_CMD} info --envs | grep "${ENV_NAME}"
