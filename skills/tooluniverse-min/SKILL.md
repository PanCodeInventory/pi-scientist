---
name: tooluniverse-min
description: "Search biomedical literature and query TCGA/cancer clinical & survival data via the local `tu` CLI. Use whenever the user wants to: find papers / search PubMed / Europe PMC / Semantic Scholar / OpenAlex / arXiv / preprints (bioRxiv, medRxiv, OSF, Zenodo), OR query TCGA survival data / GDC / cBioPortal clinical data / Kaplan-Meier / Cox regression / TIMER2 immune analysis. Runs the bundled wrapper `./scripts/tu-min` which loads only ~106 verified-working curated tools (literature search + TCGA survival/clinical + preprints) — no NCBI-dependent tools (they fail through the local proxy). Triggers: 'search papers about', 'find literature on', 'TCGA survival', 'overall survival of', 'cBioPortal', 'cancer cohort data', 'kaplan-meier', 'get preprints', 'bioRxiv'."
---

# ToolUniverse (minimal: literature + TCGA survival + preprints)

Access biomedical literature, TCGA/cancer clinical & survival data, and preprints through the local `tu` CLI. A curated whitelist of **28 categories (~106 tools)** is pre-loaded — all verified working. No MCP server, no full 2524-tool registry, no NCBI-proxy-blocked tools.

## Prerequisite (one-time setup)

The wrapper `./scripts/tu-min` calls the `tu` CLI, which requires the Python `tooluniverse` package **and** a patch to its `cli.py` so the whitelist environment variables take effect. If `tu` is not installed, the wrapper prints a clear error.

Set it up once (creates a venv at `~/.venvs/tooluniverse`, installs tooluniverse from PyPI, applies the patch, verifies):

```bash
bash scripts/setup/install-python-deps.sh
```

See `README.md` in this skill directory for full setup details and troubleshooting.

## How to call

ALWAYS invoke the bundled wrapper, never bare `tu`:

```bash
./scripts/tu-min <subcommand> [args]
```

The wrapper sets `TOOLUNIVERSE_CATEGORIES` (whitelist) and `TOOLUNIVERSE_EXCLUDE_TOOLS` (drops the few known-broken tools: `EuropePMC_get_fulltext`, `Tool_RAG`, `Tool_Finder`). Pass `--json` for machine-readable output, `--raw` for compact JSON for piping.

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

1. **Discover** the right tool: `./scripts/tu-min find "<topic>"` or `./scripts/tu-min grep "<keyword>"`.
2. **Inspect** its signature: `./scripts/tu-min info <tool_name>` — note required params.
3. **Run** it: `./scripts/tu-min run <tool_name> <key=value ...>` or `./scripts/tu-min run <tool_name> '<json>'`.

When unsure of a tool's exact parameter names, ALWAYS run `info` first — guessing parameter names is the #1 cause of failed runs.

## Loaded categories (28) — all verified working

### A. TCGA / cancer clinical & survival (5 categories, 34 tools)
| Category | Key tools & use |
|----------|-----|
| `gdc` (10) | **NCI GDC — native TCGA.** `GDC_get_survival` ★ (KM survival data per cohort), `GDC_get_clinical_data` (stage/dx/follow-up), `GDC_get_gene_expression`, `GDC_get_mutation_frequency`, `GDC_get_cnv_data`, `GDC_list_projects`, `GDC_search_cases`, `GDC_list_files`, `GDC_get_ssm_by_gene`, `GDC_get_mutation_frequency_by_project`. |
| `cbioportal` (14) | **400+ cancer studies.** `cBioPortal_get_clinical_data` ★ (survival status/stage), `cBioPortal_get_clinical_attributes`, `cBioPortal_get_mutations`, `cBioPortal_get_copy_number_alterations`, `cBioPortal_get_molecular_profiles`, `cBioPortal_get_samples`/`patients`/`genes`/`cancer_studies`/`cancer_types`/`gene_panels`/`gene_panel_genes`/`sample_lists`/`gene_info`. |
| `cancer_prognosis` (4) | **Integration layer** — fetches OS/DFS arrays ready for plotting. `CancerPrognosis_get_survival_data` ★, `CancerPrognosis_get_gene_expression`, `CancerPrognosis_search_studies`, `CancerPrognosis_get_study_summary`. |
| `survival` (3) | **Local stats engine** — `Survival_kaplan_meier` ★, `Survival_log_rank_test` ★, `Survival_cox_regression`. Pure compute, no API. |
| `timer` (3) | **TCGA gene×immune×survival.** `TIMER2_survival_association` ★, `TIMER2_immune_estimation`, `TIMER2_gene_correlation`. |

### B. Biomedical literature search (14 categories, 60 tools)
| Category | Key tools & use |
|----------|-----|
| `pubmed` (5) | **PubMed (NCBI E-utilities).** `PubMed_search_articles` ★, `PubMed_get_article`, `PubMed_get_related`, `PubMed_get_cited_by`, `PubMed_get_links`. |
| `EuropePMC` (5) | Europe PMC. `EuropePMC_search_articles` ★, `EuropePMC_get_citations`, `EuropePMC_get_references`, `EuropePMC_get_fulltext_snippets`, `EuropePMC_get_full_text`. (Note: `EuropePMC_get_fulltext` is excluded — NCBI proxy failure.) |
| `OpenAlex` (10) | OpenAlex works/authors/institutions/sources. `openalex_literature_search` ★, `openalex_search_works`, `openalex_get_work_by_doi`, + authors/institutions/sources. |
| `semantic_scholar` (2) + `semantic_scholar_ext` (7) | Semantic Scholar. `SemanticScholar_search_papers`, `SemanticScholar_get_paper`, `SemanticScholar_search_authors`, `_get_recommendations`, `_get_paper_citations`/`_references`/`_author_papers`. |
| `crossref` (8) | Crossref works/journals/funders/members. `Crossref_search_works`, `Crossref_get_work`, + journals/funders/types/members. |
| `pmc` (1) | PubMed Central **full-text**. `PMC_search_papers`. |
| `core` (2) | Open-access repository aggregator. `CORE_search_papers`, `CORE_get_fulltext_snippets`. |
| `arxiv` (2) | `ArXiv_search_papers`, `ArXiv_get_pdf_snippets`. |
| `dblp` (3) | CS bibliography. `DBLP_search_publications`/`_authors`/`_venues`. |
| `doaj` (1) + `hal` (1) | `DOAJ_search_articles`, `HAL_search_archive`. |
| `unpaywall` (2) | Open-access PDF URLs. `Unpaywall_get_full_text_url`, `Unpaywall_check_oa_status`. |

### C. Preprints & repositories (5 categories, 10 tools)
| Category | Tools |
|----------|-------|
| `biorxiv` (1) + `biorxiv_ext` (1) | `BioRxiv_get_preprint`, `BioRxiv_list_recent_preprints`. |
| `medrxiv` (1) | `MedRxiv_get_preprint`. |
| `osf_preprints` (1) | `OSF_search_preprints` (multi-provider). |
| `zenodo` (5) | `Zenodo_search_records`, `Zenodo_get_record`, `Zenodo_get_record_files`, `Zenodo_list_licenses`, `Zenodo_get_license`. |

### D. Infrastructure (4 categories, ~9 tools)
`compact_mode` (`list_tools`/`grep_tools`/`get_tool_info`/`execute_tool` — the discovery machinery), `tool_finder` (`Tool_Finder_Keyword`, `Tool_Finder_LLM` [needs LLM API key]), `special_tools`, `url` + `file_download` (webpage fetch, file download).

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

### C. Kaplan-Meier + log-rank test on your own arrays (local, no API)

```bash
# KM estimates (operation field required)
./scripts/tu-min run Survival_kaplan_meier '{"operation":"kaplan_meier","durations":[5,10,15,20,25,30,12,8,22,18],"event_observed":[1,0,1,1,0,1,1,0,0,1]}'

# Log-rank test comparing two groups (params: durations_a/events_a/durations_b/events_b)
./scripts/tu-min run Survival_log_rank_test '{"operation":"log_rank_test","durations_a":[5,10,15,20,25],"events_a":[1,0,1,1,0],"durations_b":[3,7,12,18,9],"events_b":[1,1,1,0,1]}'
```

### D. Browse recent bioRxiv preprints

```bash
./scripts/tu-min info BioRxiv_list_recent_preprints   # check exact params first
./scripts/tu-min run BioRxiv_list_recent_preprints '{"server":"biorxiv","range":30}'
```

## Notes

- **Gated tools**: some tools (e.g. NCBI rate limits) benefit from API keys in the environment. `./scripts/tu-min status` reports the gated count; a tool needing a key returns an error pointing to the env var (e.g. `NCBI_API_KEY`).
- **Case-sensitive category keys**: `EuropePMC` and `OpenAlex` are capitalized. If you edit the whitelist in the wrapper, preserve casing exactly — a misspelled category name triggers a silent fallback that loads ALL tools.
- **Excluded tools** (set via `TOOLUNIVERSE_EXCLUDE_TOOLS` in the wrapper): `EuropePMC_get_fulltext` (NCBI proxy unreachable), `Tool_RAG`/`Tool_Finder` (need `pip install tooluniverse[embedding]`). Re-enable the latter by installing the deps and dropping them from the exclude list.
- **No NCBI-blocked categories**: `pubtator` (PubTator3), `pubtator3_ext`, `litvar`, and `europepmc_annotations`/`epmc_annotations` were intentionally removed per scope. If your network can reach NCBI, add `pubtator,litvar,epmc_annotations,europepmc_annotations,europepmc_citations,opencitations,icite,scite,retraction` back to the whitelist in the wrapper.
- **Temporary full access**: if you ever need a tool outside the whitelist, run bare `tu` (not the wrapper) — it loads all 2524 tools. Make sure `tu` is on your PATH or invoke it by full path.
- **Proxy**: all external API calls (PubMed/GDC/cBioPortal etc.) MUST be routed through the local proxy. The wrapper defaults to port **7890** (mihomo mixed-port).  If calls hang or return empty, first check: `ss -tlnp | grep clash` or `netstat -tlnp | grep mihomo` to confirm the active port, then update the wrapper's `http_proxy`/`https_proxy` lines if it differs. The most common mismatch is 7897 (legacy) vs 7890 (current mihomo).
- **No MCP server**: this skill replaces the previous MCP-server integration. Tool schemas never sit in the agent context; everything runs on-demand via the CLI.

## Production Lessons (from pan-cancer TCGA analysis)

### L1: In-process API for batch jobs (>100 calls)

Calling `tu run` via subprocess adds **~6–8s Python startup overhead per call**. For a 924-call pan-cancer survival scan, that's ~2h overhead vs ~17min total. When bulk-calling the same tool many times, use the in-process `tooluniverse.ToolUniverse` API directly from your analysis script's Python interpreter:

```python
import os, json
from tooluniverse import ToolUniverse

# Mirror the tu-min wrapper env vars exactly
os.environ["TOOLUNIVERSE_CATEGORIES"] = "timer,gdc,cancer_prognosis,survival,..."
os.environ["TOOLUNIVERSE_EXCLUDE_TOOLS"] = "EuropePMC_get_fulltext,Tool_RAG,Tool_Finder"
os.environ["http_proxy"] = "http://127.0.0.1:7890"
os.environ["https_proxy"] = "http://127.0.0.1:7890"

client = ToolUniverse()
result = client.run_one_function("TIMER2_survival_association",
    {"operation":"survival_association","cancer":"BRCA","gene":"TP53"})
```

⚠️ You MUST also install matplotlib/seaborn/statsmodels/lifelines into the same venv that has tooluniverse, so one Python runs both the API client and the plotting/stats stack.

### L2: Separate stdout from stderr when parsing JSON

`tu run` (and the in-process API) writes **scipy RuntimeWarnings to stderr** (e.g., log-rank degenerate-event cases with p=nan). If you merge stdout+stderr with `2>&1` and pipe to `jq`/`json.loads()`, parsing breaks on the interleaved warning text. Always keep stderr separate and parse ONLY stdout.

### L3: Retry transient tool errors

Under concurrency, TIMER2 can transiently return `"Gene not found"` for genes that actually exist and work fine single-threaded (e.g., LHFPL2/BRCA). Tool-level error payloads (`{"status":"error",...}`) should be retried (up to `max_retries`), not treated as fatal. Genuine absences (e.g., gene truly unknown to cBioPortal) will consistently fail after retries.

### L4: tmux wrapper exit-code capture

When piping a Python script through `tee` for logging, `$?` captures `tee`'s exit (always 0), not the script's. Use `set -o pipefail` + `PIPESTATUS[0]` to capture the real exit code:

```bash
set -o pipefail
python script.py 2>&1 | tee log.txt
exit_code=${PIPESTATUS[0]}
```

### L5: Concurrency with ThreadPoolExecutor works

The in-process `ToolUniverse` client is NOT thread-safe (singleton state), but `concurrent.futures.ThreadPoolExecutor` with a **per-thread client instantiation** pattern works for I/O-bound API calls. 6 workers gave ~1.2s effective per-call time vs ~6s sequential.

### L6: CancerPrognosisTool response shapes

- **get_gene_expression** returns `{"expression": [{"sampleId", "patientId", "value"}, ...]}`. Deduplicate by keeping primary tumor samples (`sampleId` ending in `-01`). Use `patientId` for merging with survival data (not `sampleId`).
- **get_survival_data** returns `{"patients": [{"patientId", "os_time", "os_status"}, ...]}`. `os_time` is in months. `os_status="DECEASED"` → event=1; `"LIVING"` → event=0.
- Parameters: `cancer` (TCGA code), `gene` (HGNC symbol for expression), `operation`, `max_samples`/`max_patients`.

### L7: Tool name format dual-personality

The same tool has **different names** depending on execution mode:
- CLI: `tu run CancerPrognosis_get_gene_expression cancer=KIRC gene=TP53`
- In-process: `ToolUniverse().run_one_function({"tool_name": "CancerPrognosisTool", "arguments": {"operation": "get_gene_expression", ...}})`

When switching between modes, always verify the correct format. The `tool_name` field in in-process API uses the **PascalCase class name** (e.g., `CancerPrognosisTool`, `TIMER2Tool`, `SurvivalTool`) not the CLI's snake_case operation name.

### L8: HGNC withdrawn symbol resolution

Old/withdrawn HGNC symbols (ITFG3→FAM234A, CCDC114→ODAD1, HFE2→HJV — ~10-15% of genes from older datasets) fail on Ensembl `/lookup/symbol/` with HTTP 400. Use two-step HGNC API fallback:
1. `GET https://rest.genenames.org/search/{symbol}` → get `hgnc_id`
2. `GET https://rest.genenames.org/fetch/hgnc_id/{id}` → get current `symbol`, `ensembl_gene_id`, `prev_symbol`
3. Cross-validate: Ensembl `GET /lookup/id/{ensembl_id}`

### L9: Always export all 6 proxy variables

Different Python HTTP libraries respect different case conventions:
```bash
export HTTP_PROXY=http://127.0.0.1:7890  HTTPS_PROXY=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890  https_proxy=http://127.0.0.1:7890
export ALL_PROXY=socks5h://127.0.0.1:7890  all_proxy=socks5h://127.0.0.1:7890
```
Missing any one case variant causes silent failures in tools using that library.
