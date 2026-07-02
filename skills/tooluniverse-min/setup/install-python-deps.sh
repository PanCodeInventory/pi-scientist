#!/usr/bin/env bash
# install-python-deps.sh — one-time Python-side setup for the tooluniverse-min skill.
#
# What this does (idempotent — safe to re-run):
#   1. Create a venv (default ~/.venvs/tooluniverse, override with $VENV_PATH)
#   2. Install tooluniverse from PyPI (with all deps)
#   3. Apply the cli.py whitelist patch (so TOOLUNIVERSE_CATEGORIES /
#      TOOLUNIVERSE_EXCLUDE_TOOLS env vars in the wrapper actually take effect)
#   4. Verify (tu status / whitelist count / PubMed end-to-end)
#
# It does NOT copy the skill (the skill is already bundled with the plugin) and
# does NOT rewrite the wrapper's TU= path (the wrapper auto-detects `tu`).
#
# Usage:
#   bash install-python-deps.sh
#   VENV_PATH=/opt/tu PYTHON_VER=3.11 bash install-python-deps.sh
#
# Prerequisite:
#   uv installed — https://astral.sh/uv  (curl -LsSf https://astral.sh/uv/install.sh | sh)

set -euo pipefail

VENV_PATH="${VENV_PATH:-$HOME/.venvs/tooluniverse}"
PYTHON_VER="${PYTHON_VER:-3.12}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_SCRIPT="$SCRIPT_DIR/patches/apply-whitelist.sh"

G='\033[32m'; R='\033[31m'; Y='\033[33m'; B='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗ $1${N}" >&2; }
info() { echo -e "${B}→${N} $1"; }

echo -e "${B}═══ tooluniverse-min Python 依赖部署 ═══${N}"
echo "  venv: $VENV_PATH"
echo ""

command -v uv >/dev/null 2>&1 || { fail "未找到 uv。请先安装：curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
[ -f "$APPLY_SCRIPT" ] || { fail "未找到 patches/apply-whitelist.sh：$APPLY_SCRIPT"; exit 1; }

# ── Step 1: venv ──────────────────────────────────────────────────────────
if [ -f "$VENV_PATH/bin/tu" ] || [ -x "$VENV_PATH/bin/python" ]; then
    ok "venv 已存在，跳过创建"
else
    info "创建 venv (Python ${PYTHON_VER})..."
    uv venv "$VENV_PATH" --python "$PYTHON_VER"
    ok "venv 创建完成"
fi

# ── Step 2: install tooluniverse ───────────────────────────────────────────
if "$VENV_PATH/bin/python" -c "import tooluniverse" 2>/dev/null; then
    VER=$("$VENV_PATH/bin/python" -c "import tooluniverse; print(getattr(tooluniverse,'__version__','?'))")
    ok "tooluniverse 已安装（v${VER}），跳过"
else
    info "从 PyPI 安装 tooluniverse（含依赖，首次较慢）..."
    VIRTUAL_ENV="$VENV_PATH" uv pip install tooluniverse
    ok "安装完成"
fi

# ── Step 3: apply cli.py whitelist patch ───────────────────────────────────
info "应用 cli.py 白名单改动..."
if bash "$APPLY_SCRIPT" "$VENV_PATH/bin/python" 2>&1 | grep -qE "OK|SKIP"; then
    ok "cli.py 改动已就绪"
else
    fail "应用 cli.py 改动失败（见上方输出）"
    exit 1
fi

# ── Step 4: verify ─────────────────────────────────────────────────────────
echo ""
echo -e "${B}═══ 验证 ═══${N}"

info "1/3  tu 基础功能..."
VER=$("$VENV_PATH/bin/tu" status 2>&1 | grep "version:" | head -1 || echo "失败")
echo "       $VER"

# 完整白名单（与 scripts/tu-min wrapper 保持一致）—— 必须包含 compact_mode
# 等基础设施类别，否则 `tu run`/`tu list` 自身会因 execute_tool 缺失而崩溃。
WL_CATS="compact_mode,tool_finder,special_tools,url,file_download,gdc,cbioportal,cancer_prognosis,survival,timer,pubmed,EuropePMC,semantic_scholar,semantic_scholar_ext,OpenAlex,crossref,pmc,core,dblp,doaj,hal,unpaywall,arxiv,biorxiv,biorxiv_ext,medrxiv,osf_preprints,zenodo"
WL_EXCL="EuropePMC_get_fulltext,Tool_RAG,Tool_Finder"

info "2/3  白名单生效（应显示 ~28 类别 / 95-106 工具）..."
TOOLUNIVERSE_CATEGORIES="$WL_CATS" TOOLUNIVERSE_EXCLUDE_TOOLS="$WL_EXCL" \
"$VENV_PATH/bin/tu" list --mode categories 2>&1 | grep -iE "categories|tools loaded" | head -3 | sed 's/^/       /'

info "3/3  端到端（PubMed 搜索，走完整白名单）..."
RESULT=$(TOOLUNIVERSE_CATEGORIES="$WL_CATS" TOOLUNIVERSE_EXCLUDE_TOOLS="$WL_EXCL" \
    "$VENV_PATH/bin/tu" run PubMed_search_articles '{"query":"p53","limit":1}' 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d.get('status','?'), '| first pmid:', d.get('data',[{}])[0].get('pmid','?'))" 2>/dev/null \
    || echo "失败（可能网络/代理问题）")
echo "       $RESULT"

echo ""
ok "Python 依赖部署完成！"
echo ""
echo -e "${B}下一步：${N}skill 已随插件打包，wrapper 会自动探测 $VENV_PATH/bin/tu。"
echo "  agent 通过 ./scripts/tu-min 调用，无需进一步配置。"
