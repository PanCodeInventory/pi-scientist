---
name: tooluniverse-min
description: "Use the local `tu` CLI (ToolUniverse) to search biomedical literature & preprints (PubMed, Europe PMC, Semantic Scholar, OpenAlex, arXiv, bioRxiv, medRxiv) or query TCGA/cancer clinical & survival data (GDC, cBioPortal, Kaplan-Meier, Cox regression, TIMER2)."
---

# ToolUniverse (minimal: literature + TCGA survival + preprints)

Access biomedical literature, TCGA/cancer clinical & survival data, and preprints through the local `tu` CLI. A curated whitelist of **28 categories (~106 tools)** is pre-loaded — all verified working. No MCP server, no full 2524-tool registry, no NCBI-proxy-blocked tools.

## Prerequisite (one-time setup)

The wrapper `./scripts/tu-min` calls the `tu` CLI, which requires the Python `tooluniverse` package **and** a patch to its `cli.py` so the whitelist environment variables take effect.

Set it up once (creates a venv at `~/.venvs/tooluniverse`, installs tooluniverse from PyPI, applies the patch, verifies):

```bash
bash setup/install-python-deps.sh
```

See `README.md` in this skill directory for full setup details and troubleshooting.

## How to call

ALWAYS invoke the bundled wrapper, never bare `tu`:

```bash
./scripts/tu-min <subcommand> [args]
```

The wrapper sets `TOOLUNIVERSE_CATEGORIES` (whitelist) and `TOOLUNIVERSE_EXCLUDE_TOOLS` (a few known-broken tools — see the wrapper). Pass `--json` for machine-readable output, `--raw` for compact JSON for piping.

> Path note: examples use the relative path `./scripts/tu-min`. Resolve it against this skill's directory (shown in your `<available_skills>` section). All tool calls go through this wrapper so the whitelist is enforced.

## The five commands

| Command | Purpose | Example |
|---------|---------|---------|
| `tu-min list` | Enumerate available tools/categories | `./scripts/tu-min list --mode categories` |
| `tu-min grep "<term>"` | Search tool names/descriptions by text or regex | `./scripts/tu-min grep "survival" --field description` |
| `tu-min info <tool> [<tool>...]` | Show a tool's parameters + examples | `./scripts/tu-min info GDC_get_survival` |
| `tu-min find "<natural language>"` | Keyword search across all loaded tools | `./scripts/tu-min find "kaplan meier breast cancer"` |
| `tu-min run <tool> <args>` | Execute a tool. Args as `key=value` pairs OR one JSON string | `./scripts/tu-min run PubMed_search_articles query="p53" limit=5` |

### Workflow

1. **Discover** the tool: `./scripts/tu-min find "<topic>"` or `./scripts/tu-min grep "<keyword>"`. Done when you have the one tool whose `info` description matches the request — confirm it before running.
2. **Inspect** its signature: `./scripts/tu-min info <tool_name>` — note required params. Never guess parameter names; ALWAYS run `info` first (guessing is the #1 cause of failed runs).
3. **Run** it: `./scripts/tu-min run <tool_name> <key=value ...>` or `./scripts/tu-min run <tool_name> '<json>'.`

## Worked examples

### A. Find papers, then check open-access availability

```bash
./scripts/tu-min run PubMed_search_articles '{"query":"p53 apoptosis","limit":5}'
# For a DOI from results, get the OA PDF link:
./scripts/tu-min run Unpaywall_get_full_text_url '{"doi":"10.1038/..."}'
```

### B. TCGA overall survival for breast cancer

```bash
# Native GDC KM survival data for a cohort
./scripts/tu-min run GDC_get_survival '{"project_id":"TCGA-BRCA"}'

# OR integration layer (per-patient OS/DFS arrays):
./scripts/tu-min run CancerPrognosis_get_survival_data '{"operation":"get_survival_data","cancer":"BRCA","max_patients":50}'
```

## Notes

- **Gated tools**: some tools (e.g. NCBI rate limits) benefit from API keys in the environment. `./scripts/tu-min status` reports the gated count; a tool needing a key returns an error pointing to the env var (e.g. `NCBI_API_KEY`).
- **Case-sensitive category keys**: `EuropePMC` and `OpenAlex` are capitalized. If you edit the whitelist in the wrapper, preserve casing exactly — a misspelled category name triggers a silent fallback that loads ALL tools.
- **No NCBI-blocked categories**: `pubtator` (PubTator3), `pubtator3_ext`, `litvar`, and `europepmc_annotations`/`epmc_annotations` were intentionally removed per scope. If your network can reach NCBI, add `pubtator,litvar,epmc_annotations,europepmc_annotations,europepmc_citations,opencitations,icite,scite,retraction` back to the whitelist in the wrapper.
- **Temporary full access**: if you ever need a tool outside the whitelist, run bare `tu` (not the wrapper) — it loads all 2524 tools. Make sure `tu` is on your PATH or invoke it by full path.
- **Proxy**: all external API calls (PubMed/GDC/cBioPortal etc.) MUST be routed through the local proxy. The wrapper defaults to port **7890** (mihomo mixed-port).  If calls hang or return empty, first check: `ss -tlnp | grep clash` or `netstat -tlnp | grep mihomo` to confirm the active port, then update the wrapper's `http_proxy`/`https_proxy` lines if it differs. The most common mismatch is 7897 (legacy) vs 7890 (current mihomo).
- Tool schemas never sit in the agent context; everything runs on-demand via the CLI.

## Batch analysis (>100 calls)

For bulk in-process batch jobs — pan-cancer scans or >100 calls to the same tool — see [`BATCH.md`](BATCH.md): the in-process `ToolUniverse()` API, concurrency, and response-shape gotchas. Single calls through the wrapper don't need it.
