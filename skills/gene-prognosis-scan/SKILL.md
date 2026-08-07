---
name: gene-prognosis-scan
description: 'Cancer prognosis scan for gene lists — systematic TCGA survival analysis with two-tier validation (HPA + TIMER2) and immune infiltration correlation. Use this skill whenever a user has a list of genes (from DEG analysis, RNA-seq, enrichment results, or any source) and wants to know their association with cancer patient survival. Triggered by: 差异基因预后, gene prognosis, cancer survival, gene-disease association, 基因与疾病关联, 预后分析, prognostic biomarker, DEG和癌症, 基因-肿瘤预后, does this gene affect survival, 生存分析, 基因表达和预后, differential expression + cancer/prognosis/survival, TCGA survival, check genes in TCGA, 查看基因和生存期, 全癌种扫描, immune infiltration correlation, 免疫浸润相关性, TCGA数据库. Also use when the user asks about a gene''s clinical relevance in cancer, wants to prioritize genes for functional validation, or needs translational evidence connecting molecular findings to patient outcomes.'
---

# Gene Prognosis Scan — Systematic Cancer Survival Analysis

## Overview

This skill performs a systematic TCGA cancer survival scan for a list of genes, with two-tier validation and immune cell infiltration analysis. It answers: **"Which of my genes are clinically relevant in cancer, and what is the mechanism?"**

The workflow has four phases:
1. **Phase 0** — Ensembl ID verification (prevent data corruption from wrong IDs)
2. **Phase 1** — HPA panoramic scan across all cancers
3. **Phase 2** — TIMER2 independent validation for significant hits
4. **Phase 2.5** — Immune infiltration & gene co-expression analysis

The analysis uses verified ToolUniverse interfaces — the local `tu` CLI for one-off queries and the in-process `ToolUniverse` API for batch jobs (see below) — inside the normal Scientist execution workflow. No MCP server is involved.

## Execution Mode: Scientist workflow with optional retrieval

This skill describes a multi-step analysis, not a Librarian retrieval task. Do not delegate the TCGA/HPA/TIMER2 computation or report generation to `sci_librarian`.

1. **Load this SKILL.md** — understand the workflow and Critical Rules.
2. **Classify as NEW or CONTINUE** and use `sci_scout` to inspect the input gene list and relevant existing outputs.
3. **Resolve scientific choices with the user**, confirm the Shared Scientific Contract and analysis directory, then create a persistent plan that assigns this skill to the relevant worker steps.
4. **Run the analysis through `sci_implement`** so Worker execution is automatically reviewed.
5. **Optionally call `sci_librarian` only when the main agent identifies a concrete external-evidence gap**, such as current package documentation, benchmark comparisons, or literature interpretation. The analysis workflow must remain valid when no Librarian lookup is needed.

When optional retrieval is useful, give `sci_librarian` a focused retrieval question with the gene symbols, cancer types, phenotype, and desired evidence type. Do not ask it to run the complete four-phase scan or write files.

## Critical Rules (learned from production failures)

These rules exist because each one caused a real failure in production analysis:

### Rule 1: Never hardcode Ensembl IDs
Ensembl IDs are non-obvious and easy to get wrong. ENSG00000157060 looks like TRAF1 but is actually SHCBP1L. **Always** look up IDs fresh using `Ensembl_lookup_gene_by_symbol`.

### Rule 2: Validate every HPA return
After each `HPA_get_cancer_prognostics_by_gene` call, check that the returned `gene` field matches the expected gene name. A wrong ID returns a *different gene's data without any error message*.

### Rule 3: Cap concurrency at ~6 workers
The in-process `ToolUniverse` client is not thread-safe. Drive parallelism with `ThreadPoolExecutor(max_workers=6)` and one client per thread (`threading.local()`). Higher fan-out triggers transient `"Gene not found"` errors and upstream rate-limiting (cBioPortal/GDC). After each batch, confirm every return carries a real payload (`data` or `status: "success"`) and retry individual failures rather than the whole batch.

### Rule 4: Parameter names are non-intuitive
- `TIMER2_gene_correlation` uses `gene1`/`gene2` (NOT `gene`/`gene2`)
- `TIMER2_survival_association` uses `gene` (NOT `gene_symbol`)
- When in doubt, inspect the schema with `tu info <tool>`

### Rule 5: Call tooluniverse through one entry point
Don't invoke bare tool names ad hoc. In Python, go through the in-process API — `ToolUniverse().run_one_function({"tool_name": "<PascalCaseTool>", "arguments": {...}})`; from the shell, `tu run <tool> '<json>'`. Both take `tool_name` + `arguments` (see Rule 10 for the name-format difference).

### Rule 6: Mouse-to-human ortholog mapping — avoid Ensembl /homology/symbol/
The `homologene` PyPI package is no longer available (HTTP 404). **Do not use** Ensembl REST `/homology/symbol/mouse/{gene}` for ortholog mapping — it is **non-deterministic** for ambiguous symbols. For example, `Cklf` non-deterministically maps to KLF15 or KLF5 (wrong gene family) instead of the correct CKLF. Use **Ensembl BioMart** (batch REST, deterministic) as the primary source, with human-side namesake-alias fallback for historical mouse symbols:
```
BioMart batch query (POST https://rest.ensembl.org/biomart/martservice) 
  → deterministic ortholog_one2one / one2many results
  → cross-validate with HGNC symbol lookup
  → Fallback: uppercase mouse symbol → check if it's a former HGNC alias
     (e.g., Itfg3→FAM234A, Ppapdc3→PLPP7, Hfe2→HJV, Gramd2→GRAMD2A)
```

### Rule 7: Direction inference when median survival is not reached
In long-survival cohorts (KIRC, ACC, UVM), one group's median survival may not be reached within follow-up. The `median_high` vs `median_low` comparison fails for those pairs. **Fallback**: compute per-group event-rate ratio (`n_events/n`) — it's a direct hazard proxy, always computable, and correctly infers direction. **Do not** use the log-rank statistic sign (tested: ~20% misclassification rate vs median-based direction).

### Rule 8: HGNC withdrawn-symbol two-step fallback (live queries only)
~10-15% of gene symbols in older datasets are withdrawn/obsolete HGNC symbols (e.g., ITFG3→FAM234A, CCDC114→ODAD1, HFE2→HJV). Ensembl `/lookup/symbol/` returns HTTP 400 for these. **Always** use a two-pass live resolution, never hardcode aliases:
- **Pass 1**: Ensembl REST `GET /lookup/symbol/{symbol}?species=human` — works for ~85% of genes
- **Pass 2 (fallback)**: For HTTP 400 failures → HGNC REST `GET /search/{symbol}` → parse `hgnc_id` → `GET /fetch/hgnc_id/{id}` → extract `ensembl_gene_id` + `symbol` (current approved name) + `prev_symbol` (confirms it matches the old input)
- Cross-validate: call Ensembl `GET /lookup/id/{ensembl_id}` to confirm the returned gene is correct
- **Store both** `input_human_gene` (original CRISPR/DE symbol) and `returned_symbol` (current HGNC symbol) for downstream tools — HPA uses Ensembl ID, TIMER2 uses current HGNC symbol

### Rule 9: Proxy environment variables — set ALL case variants
External API calls fail silently if only one case is set. Always export **all six**:
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export ALL_PROXY=socks5h://127.0.0.1:7890
export all_proxy=socks5h://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1
export no_proxy=localhost,127.0.0.1
```
Different Python libraries (requests, urllib3, httpx) respect different case conventions.

### Rule 10: Tool name formats differ between CLI and in-process API
The tooluniverse CLI (`tu run`) uses underscore-separated operation names (e.g., `CancerPrognosis_get_gene_expression`), but the in-process Python API (`ToolUniverse.run_one_function()`) uses CamelCase tool class names with an `operation` parameter (e.g., `{"tool_name": "CancerPrognosisTool", "arguments": {"operation": "get_gene_expression", ...}}`). Always verify the correct format for your execution mode.

### Rule 11: In-process API for batch jobs (>100 calls)
When running >50 API calls of the same tool, use the Python in-process `ToolUniverse` API directly — not subprocess `tu run` calls. Subprocess adds ~6-8s Python startup overhead per call. For a 109-gene HPA scan, in-process batching with `ThreadPoolExecutor` (per-thread client, 6 workers) takes ~17min vs ~2h via subprocess. The client is NOT thread-safe, so instantiate one per thread.

### Rule 12: CancerPrognosisTool response parsing
- **get_gene_expression** returns: list of `{patientId, value}` dicts. Filter for primary tumor samples (`sampleId` ending in `-01`). Use `patientId` (not `sampleId`) for merging with survival data.
- **get_survival_data** returns: list of `{patientId, os_time, os_status}` dicts. `os_status` = `"DECEASED"` → event=1; `"LIVING"` → event=0. Convert months to desired unit.
- Parameters: `cancer` (TCGA code like `"BRCA"`), `gene` (HGNC symbol), `operation` (required string).

### Rule 13: TIMER2 response group structure
Both `high_expression_group` and `low_expression_group` have exactly three fields:
```json
{ "n": 267, "n_events": 106, "median_survival_months": 73.16 }
```
If `median_survival_months` is `null`/missing (not yet reached in that group), use event-rate ratio (`n_events / n`) for the direction comparison. The raw response also includes `n_patients`, `median_expression_cutoff`, `log_rank_p_value`, and `log_rank_statistic`.

---

## Complete Workflow

### Phase 0: Ensembl ID Verification (mandatory first step)

For every gene symbol in the input list, look up the correct Ensembl gene ID. Use a **two-pass live resolution** (see Rule 8):

**Pass 1 — Direct Ensembl lookup** (parallel, ≤8 per batch):
```python
import requests
resp = requests.get(
    f"https://rest.ensembl.org/lookup/symbol/homo_sapiens/{gene_symbol}?content-type=application/json",
    proxies={"http": "http://127.0.0.1:7890", "https": "http://127.0.0.1:7890"}
)
if resp.status_code == 200:
    data = resp.json()
    ensembl_id = data["id"]
    returned_symbol = data.get("display_name", gene_symbol)
```

**Pass 2 — HGNC fallback for HTTP 400 failures** (withdrawn/obsolete symbols):
```python
# Step A: Search HGNC
resp = requests.get(f"https://rest.genenames.org/search/{gene_symbol}",
    headers={"Accept": "application/json"})
docs = resp.json()["response"]["docs"]
# Find the one whose prev_symbol or alias_symbol contains the input
hgnc_id = docs[0]["hgnc_id"]

# Step B: Fetch by HGNC ID
resp = requests.get(f"https://rest.genenames.org/fetch/hgnc_id/{hgnc_id}",
    headers={"Accept": "application/json"})
info = resp.json()["response"]["docs"][0]
current_symbol = info["symbol"]
ensembl_id = info["ensembl_gene_id"]
prev_symbols = info.get("prev_symbol", [])

# Step C: Cross-validate via Ensembl
resp = requests.get(f"https://rest.ensembl.org/lookup/id/{ensembl_id}?content-type=application/json")
```

**Validation checklist:**
- Returned `symbol` must match input symbol OR input must be in `prev_symbol`/`alias_symbol` list
- If multiple Ensembl IDs returned from Pass 1, pick the protein-coding gene (usually the first)
- Store the mapping: `{ input_human_gene, returned_symbol, ensembl_id, verification_method: "direct"|"alias_resolved" }`
- **Always save raw JSONL** for provenance — helps debug downstream symbol mismatches

**Example of what can go wrong:**
```
Input:  symbol = "CCDC114"   ← withdrawn HGNC symbol
Pass 1: Ensembl returns HTTP 400 "not found"
Pass 2: HGNC search/ → hgnc_id=26516 → fetch → symbol="ODAD1", ensembl_id=ENSG00000105479, prev_symbol=["CCDC114"]
→ Store: input_human_gene="CCDC114", returned_symbol="ODAD1", ensembl_id="ENSG00000105479", method="alias_resolved"
→ HPA uses Ensembl ID (stable). TIMER2 uses current symbol "ODAD1" (not "CCDC114").
```

### Phase 1: L1 HPA Panoramic Scan

Using the verified Ensembl IDs from Phase 0, scan all cancers for each gene via tooluniverse in-process API:

```python
from tooluniverse import ToolUniverse
client = ToolUniverse()
result = client.run_one_function({
    "tool_name": "HPATool",
    "arguments": {"ensembl_id": ensembl_id}
})
# Or via CLI: tu run HPA_get_cancer_prognostics_by_gene ensembl_id=ENSG...
```

**For large gene lists (>50)**, use in-process API with ThreadPoolExecutor:
```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
thread_local = threading.local()

def get_client():
    if not hasattr(thread_local, 'client'):
        thread_local.client = ToolUniverse()
    return thread_local.client

with ThreadPoolExecutor(max_workers=6) as ex:
    futures = {ex.submit(hpa_call, gene): gene for gene in genes}
    for f in as_completed(futures):
        result = f.result()
        jsonl_file.write(json.dumps(result) + '\n')  # Save raw immediately
```
⚠️ The client is NOT thread-safe — instantiate one per thread via `threading.local()`.

**After each call, validate:**
```
Expected gene: TRAF1
HPA returned:  { "gene": "SHCBP1L" }
→ WRONG ID! Stop and re-lookup.
```

**Batch integrity check:**
After each batch, verify every call returned actual data (look for a `data` field or `status: "success"`). Payloads shaped like `{"status": "error", ...}` (e.g. transient `"Gene not found"`) are retryable — re-run those individually rather than treating them as genuine absences.

**Interpreting HPA results:**
- `prognostic_type: "favorable"` = high expression → better survival (protective)
- `prognostic_type: "unfavorable"` = high expression → worse survival (risk factor)
- `prognostic_cancers_count: 0` = HPA found nothing significant. This is normal — HPA is conservative. The gene may still have TIMER2 significance or other clinical relevance.
- Cross-reference with DE direction: UP-regulated + "unfavorable" = potential oncogenic driver; DOWN-regulated + "favorable" = consistent protective signal.

**HPA response structure:**
```json
{
  "gene": "TP53",
  "ensembl_id": "ENSG00000141510",
  "prognostic_cancers_count": 8,
  "prognostic_summary": [
    {
      "cancer": "breast cancer (TCGA)",
      "cancer_name": "Breast Invasive Carcinoma",
      "prognostic_type": "unfavorable",
      "p_value": 0.000123,
      "n_patients": 1075
    }
  ]
}
```

**Cancer name cleanup:**
HPA appends "(TCGA)" or "(validation)" to cancer names. Strip these and convert to TCGA codes using the mapping in `references/cancer-mapping.md`. The response `cancer_name` field (without suffix) should be the primary key for mapping.

**Symbol validation post-HPA:**
HPA may return an old/archived symbol in the `gene` field even when queried by the correct Ensembl ID (e.g., querying ENSG00000109066 returns `gene: "TMEM104"` instead of the current `SLC38A12`). If the returned `gene` doesn't match your expected current symbol but the Ensembl ID is correct, accept it and annotate — the data is valid, just using an older symbol name.

### Phase 2: L2 TIMER2 Validation

For every gene-cancer pair where HPA found significance (p < 0.01), run independent validation. Use the **current HGNC symbol** (from Phase 0 `returned_symbol`), not the archived input symbol:

```python
from tooluniverse import ToolUniverse
client = ToolUniverse()
result = client.run_one_function({
    "tool_name": "TIMER2Tool",
    "arguments": {
        "operation": "survival_association",
        "cancer": tcga_code,          # e.g., "BRCA"
        "gene": current_gene_symbol   # HGNC current symbol, e.g., "ODAD1" not "CCDC114"
    }
})
```

**⚠️ Using the wrong symbol**: If you use an archived symbol (e.g., `"CCDC114"`), cBioPortal may not find the gene. Always query with the verified current HGNC symbol from Phase 0. But record both symbols in the output for provenance.

**TIMER2 response structure** (see Rule 13):
```json
{
  "cancer": "KIRC",
  "gene": "AIG1",
  "n_patients": 533,
  "median_expression_cutoff": 5.234,
  "high_expression_group": {"n": 267, "n_events": 69, "median_survival_months": null},
  "low_expression_group": {"n": 266, "n_events": 106, "median_survival_months": 73.16},
  "log_rank_p_value": 0.003628,
  "log_rank_statistic": -2.9088
}
```

**TIMER2 result interpretation:**
- `log_rank_p_value < 0.05` → **Dual validation passed** (strongest evidence)
- `log_rank_p_value 0.05–0.15` → Trend, worth noting
- `log_rank_p_value > 0.15` → Not validated (cohort difference or false positive)
- Compare `median_survival_months` between high/low groups for clinical significance
- If `median_survival_months` is `null` for one group, use event-rate ratio (see Rule 7)

**Failure handling:**
- cBioPortal connection failures happen occasionally. Retry once, then skip and mark as "data unavailable".
- Small cohorts (n < 100) have limited power — note this in results.

### Phase 2.5: Immune Infiltration & Gene Co-expression

For every gene-cancer pair that passed L2 validation, add immune context:

**A. Immune infiltration correlation:**
```
For each (gene_symbol, tcga_code) that passed L2 (parallel, ≤6 workers):
  result = client.run_one_function({
      "tool_name": "TIMER2Tool",
      "arguments": {
          "operation": "immune_estimation",
          "cancer": tcga_code,
          "gene": gene_symbol
      }
  })
# Shell equivalent (one-off): tu run TIMER2_immune_estimation \
#   '{"operation":"immune_estimation","cancer":"HNSC","gene":"MAFF"}'
```

This returns Spearman correlations between the gene and 6 immune cell marker genes:
- B cell (CD19), CD4+ T (CD4), CD8+ T (CD8A), Neutrophil (FCGR3B), Macrophage (CD68), Dendritic cell (ITGAX)

**B. Key gene pair co-expression** (when relevant to the biological question):
```
  result = client.run_one_function({
      "tool_name": "TIMER2Tool",
      "arguments": {
          "operation": "gene_correlation",
          "cancer": tcga_code,
          "gene1": "GENE_A",    # ⚠️ gene1, not gene
          "gene2": "GENE_B"     # ⚠️ gene2
      }
  })
# Shell equivalent (one-off): tu run TIMER2_gene_correlation \
#   '{"operation":"gene_correlation","cancer":"HNSC","gene1":"MAFF","gene2":"TRAF1"}'
```

**When to run gene correlation:**
- Between a transcription factor and its putative target (e.g., MAFF ↔ TRAF1)
- Between genes with opposing prognostic directions in the same cancer
- Between a gene and an immune marker if the immune_estimation result is striking

**Important limitation:** TIMER2 does not cover NK cells. For NK-specific expression analysis, recommend CELLxGENE Census or TISCH2 to the user.

---

## Output Format

Present results in this structure:

```markdown
## L1 HPA Panoramic Scan
| Gene | DE Direction | Prognostic cancers | Key hits (cancer: direction, p) |
|------|-------------|-------------------|-------------------------------|

## L2 TIMER2 Validation
### ✅ Dual validation passed
| Gene | Cancer | HPA p | TIMER2 p | Direction | High OS | Low OS | Δ Survival |
|------|--------|-------|----------|-----------|---------|--------|------------|

### ❌ Not validated
| Gene | Cancer | HPA p | TIMER2 p | Note |
|------|--------|-------|----------|------|

## Immune Infiltration Correlation
| Gene | Cancer | CD4+ T (r, p) | CD8+ T (r, p) | Macrophage (r, p) | Key finding |
|------|--------|---------------|---------------|-------------------|-------------|

## Gene Co-expression
| Gene A | Gene B | Cancer | Spearman r | p | Consistent with experiment? |
|--------|--------|--------|------------|---|----------------------------|

## Interpretation
[Biological narrative connecting the findings to the user's research question]
```

---

## Edge Cases

**No HPA hits for any gene**: Report and recommend alternatives — direct TIMER2 queries (HPA is conservative and may miss genes), pathway enrichment, or disease-gene databases (DisGeNET, CTD).

**HPA and TIMER2 disagree**: Report both results. This can reflect genuine cohort differences (HPA uses a combined TCGA + validation cohort, TIMER2 uses cBioPortal). Flag the discrepancy rather than picking one.

**Gene not found in Ensembl**: Pseudogenes, novel transcripts, or withdrawn symbols. Skip them and note in the report.

**cBioPortal connection failure**: Retry once. If it fails again, mark as "unavailable" and move on. Don't block the entire analysis.

**Large gene lists (>50)**: Split Phase 1 into batches of 8 genes. Run Phase 2 only on the top hits to control total call count.

---

## Tool Limitations Summary

| Tool | Limitation | Workaround |
|------|-----------|------------|
| HPA | Conservative thresholds; may miss meaningful genes | Supplement with direct TIMER2 queries |
| HPA | May return old/archived gene symbol (e.g., TMEM104 vs SLC38A12) even when querying correct Ensembl ID | Accept if Ensembl ID matches; annotate as old-symbol edge case; use Ensembl ID as grounding key |
| TIMER2 (current) | Original TIMER2.0/3.0 API decommissioned; uses cBioPortal proxy | Data is reliable; note source in reports |
| TIMER2 immune estimation | Only 6 immune cell types; **no NK cells** | Use NKG7/KLRF1/KLRD1/GNLY/CD8A as NK/cytotoxic proxy via `TIMER2_gene_correlation` |
| cBioPortal | Intermittent connection failures; small cohorts for rare cancers | Retry once; flag small-n results |
| cBioPortal | Transient "Gene not found" errors under concurrency for genes that actually exist | Retry up to 2 times; genuine absences persist after retries |
| HPA cancer naming | Full names with "(TCGA)"/"(validation)" suffixes | See `references/cancer-mapping.md` for conversion |
| GDC gene expression | `GDC_get_gene_expression` returns only **file metadata**, not expression values | Use `CancerPrognosis_get_gene_expression` (cBioPortal tumor-only); bulk STAR-Counts download (tens of GB) is the only path to actual normal expression |
| MESO (mesothelioma) | Only ~12 patients with both expression + survival data in TCGA; too few for median-split survival analysis | Exclude from pan-cancer survival scan; this is a genuine data limitation, not transient |
| TIMER2 small-n extreme correlations | Some gene×cancer correlations show r=±1.0 at n=5 (real API response, statistically unreliable) | Flag with `low_n_warning` (n<20) and `extreme_low_n_warning` (n<20 and |r|≥0.8); do not delete but interpret with caution |
| Pan-cancer BH FDR | ~924 tests per dimension (28 genes × 33 cancers); but FDR conditioning is on HPA-reported pairs only, not full gene×cancer universe | Report both FDR and nominal p; note FDR scope limitation in methods |
| Expression median source | `CancerPrognosis_get_gene_expression` `expression_summary.median` may include non-primary-tumor samples | Filter for primary tumor (`-01` suffix on sampleId) then compute median locally from aligned patient cohort |
| HGNC symbol drift | ~10-15% of gene symbols in older datasets are withdrawn/obsolete (e.g., CCDC114→ODAD1) | Use Phase 0 two-pass live resolution (Ensembl → HGNC fallback); never hardcode alias maps |
| Tool name formats | CLI uses `CancerPrognosis_get_gene_expression`; in-process API uses `CancerPrognosisTool` + `operation` parameter | Check execution mode and use correct format; see `references/tool-reference.md` |
| Proxy connectivity | External API calls fail silently if only one case of proxy env vars is set | Export all 6: HTTP_PROXY, HTTPS_PROXY, http_proxy, https_proxy, ALL_PROXY, all_proxy (see Rule 9) |

### Phase 3: Kaplan-Meier Curve Generation

For dual-validated gene-cancer pairs, generate publication-quality KM curves using patient-level data from cBioPortal:

```python
# Step 1: Get patient-level expression data
from tooluniverse import ToolUniverse
client = ToolUniverse()
expr_result = client.run_one_function({
    "tool_name": "CancerPrognosisTool",
    "arguments": {
        "operation": "get_gene_expression",
        "cancer": "KIRC",
        "gene": "AIG1",
        "max_samples": 2000
    }
})
# Returns: list of {patientId, sampleId, value} per patient
# Filter for primary tumors: sample_id.endswith("-01")
# Build: {patientId: expression_value} dict

# Step 2: Get patient-level OS survival data
surv_result = client.run_one_function({
    "tool_name": "CancerPrognosisTool",
    "arguments": {
        "operation": "get_survival_data",
        "cancer": "KIRC",
        "max_patients": 2000
    }
})
# Returns: list of {patientId, os_time, os_status} per patient
# os_status = "DECEASED" → event=1; "LIVING" → event=0
# Build: {patientId: {time, event}} dict

# Step 3: Merge & split by median
common_ids = set(expr_map.keys()) & set(surv_map.keys())
df = pd.DataFrame([{
    'patient_id': pid,
    'expression': expr_map[pid],
    'time': surv_map[pid]['time'],
    'event': surv_map[pid]['event']
} for pid in common_ids])
df['group'] = np.where(df['expression'] >= df['expression'].median(), 'High', 'Low')

# Step 4: Plot with lifelines
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test

kmf = KaplanMeierFitter()
fig, ax = plt.subplots(figsize=(6, 5))
for group in ['High', 'Low']:
    data = df[df['group'] == group]
    kmf.fit(data['time'], data['event'], label=f'{group} (n={len(data)})')
    kmf.plot_survival_function(ax=ax)

lr_result = logrank_test(
    high_data['time'], low_data['time'],
    high_data['event'], low_data['event']
)
ax.text(0.98, 0.98, f'Log-rank p = {lr_result.p_value:.2e}',
        transform=ax.transAxes, ha='right', va='top')
plt.tight_layout()
fig.savefig(f'{gene}_{cancer}_km.png', dpi=300)
fig.savefig(f'{gene}_{cancer}_km.pdf')
```

**Important notes:**
- Cache survival data per cancer (14 cancers → 14 calls, not 71)
- Filter for primary tumor samples (`-01` suffix) to avoid duplicate aliquots
- Remove patients with time ≤ 0 (invalid survival records)
- Minimum 3 patients per group to avoid degenerate KM estimates

## Going Deeper (L3/L4)

For validated hits needing deeper mechanistic evidence, these tools are available:
- `Survival_cox_regression` — multivariate analysis adjusting for age, stage, grade
- `CancerPrognosis_get_gene_expression` — full expression matrix for custom stratification
- `CancerPrognosis_get_survival_data` — patient-level OS/DFS for custom models
- `Survival_kaplan_meier` — custom KM curves with flexible cutoffs
- `SCXA_search_gene` — find single-cell experiments studying the gene
- `ARCHS4_get_gene_expression` — tissue/cell line expression background

See `references/tool-reference.md` for parameter details of all tools.
