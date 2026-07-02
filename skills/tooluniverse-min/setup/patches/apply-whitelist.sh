#!/usr/bin/env bash
# apply-whitelist.sh — 给 tooluniverse 的 cli.py 应用白名单/排除开关改动。
#
# 用法：
#   bash apply-whitelist.sh [PYTHON] [VENV]
#
#   PYTHON  可选。用于定位已安装 tooluniverse 的 python（默认：python3）
#   VENV    可选。venv 目录，用于 PYTHON 解析（默认：无）
#
# 示例：
#   bash apply-whitelist.sh                              # 用 python3 探测
#   bash apply-whitelist.sh /path/venv/bin/python        # 指定 python
#   bash apply-whitelist.sh python3                      # 用系统 python3
#
# 也支持在 tooluniverse 源码根目录直接运行（探测 src/tooluniverse/cli.py）。
#
# 改动内容：编辑 _get_tu() 函数，增加两个环境变量开关：
#   TOOLUNIVERSE_CATEGORIES    — 逗号分隔，只加载这些类别
#   TOOLUNIVERSE_EXCLUDE_TOOLS — 逗号分隔，排除这些工具
# 幂等：已改过则跳过；结构不匹配则报错退出（不破坏文件）。

set -euo pipefail

PYTHON="${1:-python3}"
CLIPY=""

# 探测策略 1：源码开发布局（当前工作目录是 tooluniverse 源码根）
if [ -f "src/tooluniverse/cli.py" ]; then
    CLIPY="$(pwd)/src/tooluniverse/cli.py"

# 探测策略 2：已安装的包（通过 python 定位 site-packages）
else
    if ! CLIPY="$("$PYTHON" -c 'import tooluniverse, os; print(os.path.join(os.path.dirname(tooluniverse.__file__), "cli.py"))' 2>/dev/null)"; then
        echo "ERROR: 无法定位 cli.py。" >&2
        echo "  - 若在源码目录：请 cd 到 tooluniverse 源码根（含 src/tooluniverse/）" >&2
        echo "  - 若已 pip install：传入能 import tooluniverse 的 python 路径" >&2
        echo "    例: bash apply-whitelist.sh /path/venv/bin/python" >&2
        exit 1
    fi
    if [ ! -f "$CLIPY" ]; then
        echo "ERROR: 定位到 $CLIPY 但文件不存在" >&2
        exit 1
    fi
fi

echo "目标文件: $CLIPY"

python3 - "$CLIPY" <<'PYEOF'
import sys
path = sys.argv[1]
src = open(path).read()

if "TOOLUNIVERSE_CATEGORIES" in src:
    print("SKIP: cli.py 已含白名单改动，无需重复应用。")
    sys.exit(0)

old = (
    "    tu = ToolUniverse()\n"
    "    if not tu.all_tool_dict:\n"
    "        tu._auto_load_tools_if_empty()\n"
    "    return tu\n"
)
if old not in src:
    print("ERROR: 未找到原始 _get_tu() 代码块，无法自动应用。", file=sys.stderr)
    print("       该 tooluniverse 版本的 cli.py 结构与预期不符。", file=sys.stderr)
    print("       请手动编辑（参考 patches/cli-whitelist.patch）。", file=sys.stderr)
    sys.exit(1)

new = (
    "    tu = ToolUniverse()\n"
    "    # Whitelist / exclusion driven by env vars (comma-separated):\n"
    "    #   TOOLUNIVERSE_CATEGORIES    — if set, load only these categories.\n"
    "    #   TOOLUNIVERSE_EXCLUDE_TOOLS — drop these individual tool names after load.\n"
    "    # Category keys are case-sensitive (EuropePMC, OpenAlex are capitalized).\n"
    "    # When neither is set, behavior is unchanged (auto-loads every built-in\n"
    "    # category) — backward compatible.\n"
    "    cats_env = os.environ.get(\"TOOLUNIVERSE_CATEGORIES\", \"\").strip()\n"
    "    excl_env = os.environ.get(\"TOOLUNIVERSE_EXCLUDE_TOOLS\", \"\").strip()\n"
    "    cats = [c.strip() for c in cats_env.split(\",\") if c.strip()] or None\n"
    "    excl = [c.strip() for c in excl_env.split(\",\") if c.strip()] or None\n"
    "    if cats is not None or excl is not None:\n"
    "        tu.load_tools(categories=cats, exclude_tools=excl)\n"
    "    elif not tu.all_tool_dict:\n"
    "        tu._auto_load_tools_if_empty()\n"
    "    return tu\n"
)

src = src.replace(old, new, 1)
open(path, "w").write(src)
print("OK: 已应用白名单改动。")
PYEOF
