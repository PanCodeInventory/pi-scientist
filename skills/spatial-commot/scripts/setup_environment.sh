#!/bin/bash
# COMMOT Environment Setup Script
# Creates a conda environment with all required dependencies

set -e

echo "Creating COMMOT analysis environment..."
echo "========================================"

# Create conda environment
ENV_NAME="${1:-commot}"
conda create -n "$ENV_NAME" python=3.9 -y
conda activate "$ENV_NAME"

# Core dependencies
pip install "commot>=0.0.3"
pip install "scanpy>=1.8.2"
pip install "anndata>=0.7.6"
pip install "squidpy>=1.2.0"
pip install "matplotlib>=3.5"
pip install "seaborn>=0.11"

# Optional: R/tradeSeq for communication-dependent gene analysis
echo ""
echo "To enable communication-dependent gene analysis (optional):"
echo "  1. Install R 3.6.3"
echo "  2. In R: BiocManager::install('tradeSeq', version='3.10')"
echo "  3. pip install rpy2==3.4.2 anndata2ri==1.0.6"
echo "  4. pip install 'commot[tradeSeq]'"

echo ""
echo "Environment '$ENV_NAME' created successfully."
echo "Activate: conda activate $ENV_NAME"
