# tooluniverse-min — setup guide

This skill wraps the `tu` CLI with a curated whitelist of **28 categories / ~106 tools** (TCGA survival & clinical, biomedical literature, preprints). It replaces the heavier MCP-server integration: no tool schemas sit in the agent context, everything runs on demand via the CLI.

> This README is for **installation / troubleshooting only**. The agent reads `SKILL.md` for usage. Both live in this directory.

---

## Prerequisite: the `tu` CLI

The wrapper `./scripts/tu-min` is just a thin env-var setter around the real `tu` executable. `tu` is provided by the Python package **`tooluniverse`** (`pip install tooluniverse`), BUT two things must both be true or the whitelist silently fails:

1. `tooluniverse` is installed in some Python environment, AND
2. its `cli.py` is **patched** so that the `TOOLUNIVERSE_CATEGORIES` / `TOOLUNIVERSE_EXCLUDE_TOOLS` environment variables are honored. Without the patch, `_get_tu()` ignores those vars and auto-loads every built-in category (≈ the full registry), defeating the point of the whitelist.

The bundled setup script does both.

## One-time setup

Prerequisite: [`uv`](https://astral.sh/uv) installed.

```bash
bash setup/install-python-deps.sh
```

What it does (idempotent):

1. Creates a venv at `~/.venvs/tooluniverse` (override: `VENV_PATH=/opt/tu`)
2. `pip install tooluniverse` from PyPI
3. Applies the `cli.py` whitelist patch (`setup/patches/apply-whitelist.sh`)
4. Verifies: `tu status` → whitelist count → PubMed end-to-end

The wrapper auto-detects `tu` in this order: `$TU` env var → `tu` on PATH → `~/.venvs/tooluniverse/bin/tu`. So after running the script above, no further config is needed.

## Verifying it works

```bash
./scripts/tu-min status                       # tu version + gated tool count
./scripts/tu-min list --mode categories       # should show ~28 categories
./scripts/tu-min run PubMed_search_articles '{"query":"p53","limit":1}'
```

If `list` shows far more than ~28 categories, the patch did NOT apply — re-run `install-python-deps.sh` (it skips if already patched, so check its output for `SKIP` vs `OK`).

## Troubleshooting

### `ERROR: 'tu' CLI not found`
The wrapper couldn't locate `tu`. Either run `install-python-deps.sh`, or set `TU` explicitly:
```bash
TU=/path/to/venv/bin/tu ./scripts/tu-min status
```

### Whitelist not taking effect (2500+ tools load)
The `cli.py` patch is missing or got overwritten by a reinstall. Re-run:
```bash
bash setup/patches/apply-whitelist.sh ~/.venvs/tooluniverse/bin/python
```
If it reports `ERROR: 未找到原始 _get_tu() 代码块`, the installed tooluniverse version's `cli.py` structure differs from what the patch expects — apply `patches/cli-whitelist.patch` manually or pin `tooluniverse==1.2.6`.

### Tool calls hang or return empty
External tools (PubMed, GDC, cBioPortal) hit the public internet. All API requests MUST go through the local proxy — the wrapper sets `http_proxy`/`https_proxy` to `http://127.0.0.1:7890` (mihomo mixed-port). Check the proxy is up before debugging the skill.

### Need a tool that's outside the whitelist
Run bare `tu` (not the wrapper) — it loads all ~2524 tools:
```bash
~/.venvs/tooluniverse/bin/tu run <tool> '<args>'
```

## What changed vs. the old MCP integration

| | MCP mode (old) | CLI skill mode (this) |
|---|---|---|
| Server | `uvx --refresh tooluniverse` MCP server | none — direct CLI |
| Tools in agent context | 5 MCP tools + schemas | 0 — agent calls `./scripts/tu-min` via `bash` |
| Tools loaded | all ~2524 | 28 categories / ~106 (whitelist) |
| Whitelist mechanism | none | `TOOLUNIVERSE_CATEGORIES` + `TOOLUNIVERSE_EXCLUDE_TOOLS` env vars (requires the `cli.py` patch) |

The `cli.py` patch is the linchpin: it adds ~10 lines to `_get_tu()` in `tooluniverse/cli.py` reading those two env vars. See `setup/patches/cli-whitelist.patch` for the exact diff.
