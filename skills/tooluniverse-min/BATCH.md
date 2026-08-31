# Batch analysis — in-process ToolUniverse API

For bulk jobs (>100 calls to the same tool, e.g. a pan-cancer survival scan), calling `tu run` via subprocess adds ~6–8s Python startup per call. Use the in-process `tooluniverse.ToolUniverse` API from your analysis script's Python interpreter instead.

## L1: In-process API for batch jobs

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

## L2: Separate stdout from stderr when parsing JSON

`tu run` (and the in-process API) writes **scipy RuntimeWarnings to stderr** (e.g., log-rank degenerate-event cases with p=nan). If you merge stdout+stderr with `2>&1` and pipe to `jq`/`json.loads()`, parsing breaks on the interleaved warning text. Always keep stderr separate and parse ONLY stdout.

## L3: Retry transient tool errors

Under concurrency, TIMER2 can transiently return `"Gene not found"` for genes that actually exist and work fine single-threaded (e.g., LHFPL2/BRCA). Tool-level error payloads (`{"status":"error",...}`) should be retried (up to `max_retries`), not treated as fatal. Genuine absences (e.g., gene truly unknown to cBioPortal) will consistently fail after retries.

## L5: Concurrency with ThreadPoolExecutor works

The in-process `ToolUniverse` client is NOT thread-safe (singleton state), but `concurrent.futures.ThreadPoolExecutor` with a **per-thread client instantiation** pattern works for I/O-bound API calls. 6 workers gave ~1.2s effective per-call time vs ~6s sequential.

## L6: CancerPrognosisTool response shapes

- **get_gene_expression** returns `{"expression": [{"sampleId", "patientId", "value"}, ...]}`. Deduplicate by keeping primary tumor samples (`sampleId` ending in `-01`). Use `patientId` for merging with survival data (not `sampleId`).
- **get_survival_data** returns `{"patients": [{"patientId", "os_time", "os_status"}, ...]}`. `os_time` is in months. `os_status="DECEASED"` → event=1; `"LIVING"` → event=0.
- Parameters: `cancer` (TCGA code), `gene` (HGNC symbol for expression), `operation`, `max_samples`/`max_patients`.

## L7: Tool name format dual-personality

The same tool has **different names** depending on execution mode:
- CLI: `tu run CancerPrognosis_get_gene_expression cancer=KIRC gene=TP53`
- In-process: `ToolUniverse().run_one_function({"tool_name": "CancerPrognosisTool", "arguments": {"operation": "get_gene_expression", ...}})`

When switching between modes, always verify the correct format. The `tool_name` field in in-process API uses the **PascalCase class name** (e.g., `CancerPrognosisTool`, `TIMER2Tool`, `SurvivalTool`) not the CLI's snake_case operation name.

## L8: HGNC withdrawn symbol resolution

Old/withdrawn HGNC symbols (ITFG3→FAM234A, CCDC114→ODAD1, HFE2→HJV — ~10-15% of genes from older datasets) fail on Ensembl `/lookup/symbol/` with HTTP 400. Use two-step HGNC API fallback:
1. `GET https://rest.genenames.org/search/{symbol}` → get `hgnc_id`
2. `GET https://rest.genenames.org/fetch/hgnc_id/{id}` → get current `symbol`, `ensembl_gene_id`, `prev_symbol`
3. Cross-validate: Ensembl `GET /lookup/id/{ensembl_id}`

## L9: Always export all 6 proxy variables

Different Python HTTP libraries respect different case conventions:
```bash
export HTTP_PROXY=http://127.0.0.1:7890  HTTPS_PROXY=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890  https_proxy=http://127.0.0.1:7890
export ALL_PROXY=socks5h://127.0.0.1:7890  all_proxy=socks5h://127.0.0.1:7890
```
Missing any one case variant causes silent failures in tools using that library.
