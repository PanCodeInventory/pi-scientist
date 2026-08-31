---
name: gene-prognosis-scan
description: 'Pan-cancer prognosis scan for gene lists. Use when the user wants to scan genes for cancer survival/prognosis, correlate a gene with immune infiltration, or map mouse genes to human orthologs.'
---

# Gene Prognosis Scan — Systematic Cancer Survival Analysis

## Overview

This skill performs a systematic TCGA cancer survival scan for a list of genes, with two-tier validation and immune cell infiltration analysis.

The workflow has five phases:
1. **Phase 0** — Ensembl ID verification (prevent data corruption from wrong IDs)
2. **Phase 1** — HPA panoramic scan across all cancers
3. **Phase 2** — TIMER2 independent validation for significant hits
4. **Phase 2.5** — Immune infiltration & gene co-expression analysis
5. **Phase 3** — Kaplan-Meier curve generation for dual-validated hits

The analysis uses verified ToolUniverse interfaces — the local `tu` CLI for one-off queries and the in-process `ToolUniverse` API for batch jobs — inside the normal Scientist execution workflow.

## Execution Mode: Scientist workflow with optional retrieval

This skill describes a multi-step analysis, not a Librarian retrieval task. Do not delegate the TCGA/HPA/TIMER2 computation or report generation to `sci_librarian`.

1. **Classify as NEW or CONTINUE** and use `sci_scout` to inspect the input gene list and relevant existing outputs.
2. **Resolve scientific choices with the user**, confirm the Shared Scientific Contract and analysis directory, then create a persistent plan that assigns this skill to the relevant worker steps.
3. **Run the analysis through `sci_implement`** so Worker execution is automatically reviewed.
4. **Optionally call `sci_librarian` only when the main agent identifies a concrete external-evidence gap**, such as current package documentation, benchmark comparisons, or literature interpretation. The analysis workflow must remain valid when no Librarian lookup is needed.

When optional retrieval is useful, give `sci_librarian` a focused retrieval question with the gene symbols, cancer types, phenotype, and desired evidence type.

## Critical Rules (learned from production failures)

### Rule 1: Never hardcode Ensembl IDs
ENSG00000157060 looks like TRAF1 but is actually SHCBP1L. **Always** look up IDs fresh using the two-pass live resolution in Phase 0.

### Rule 2: Validate every HPA return
After each `HPA_get_cancer_prognostics_by_gene` call, check that the returned `gene` field matches the expected gene name. A wrong ID returns a *different gene's data without any error message*.

### Rule 3: Cap concurrency at ~6 workers
The in-process `ToolUniverse` client is not thread-safe. Drive parallelism with `ThreadPoolExecutor(max_workers=6)` and one client per thread (`threading.local()`). Higher fan-out triggers transient `"Gene not found"` errors and upstream rate-limiting (cBioPortal/GDC). After each batch, confirm every return carries a real payload (`data` or `status: "success"`) and retry individual failures rather than the whole batch.

### Rule 4: Call tooluniverse through one entry point
Don't invoke bare tool names ad hoc. In Python, go through the in-process API — `ToolUniverse().run_one_function({"tool_name": "<PascalCaseTool>", "arguments": {...}})`; from the shell, `tu run <tool> '<json>'`. Both take `tool_name` + `arguments` (see `references/tool-reference.md` for the CLI-vs-in-process name-format difference).

### Rule 5: Mouse-to-human ortholog mapping — avoid Ensembl /homology/symbol/
The `homologene` PyPI package is no longer available (HTTP 404). **Do not use** Ensembl REST `/homology/symbol/mouse/{gene}` for ortholog mapping — it is **non-deterministic** for ambiguous symbols. For example, `Cklf` non-deterministically maps to KLF15 or KLF5 (wrong gene family) instead of the correct CKLF. Use **Ensembl BioMart** (batch REST, deterministic) as the primary source, with human-side namesake-alias fallback for historical mouse symbols:
```
BioMart batch query (POST https://rest.ensembl.org/biomart/martservice) 
  → deterministic ortholog_one2one / one2many results
  → cross-validate with HGNC symbol lookup
  → Fallback: uppercase mouse symbol → check if it's a former HGNC alias
     (e.g., Itfg3→FAM234A, Ppapdc3→PLPP7, Hfe2→HJV, Gramd2→GRAMD2A)
```

### Rule 6: Direction inference when median survival is not reached
In long-survival cohorts (KIRC, ACC, UVM), one group's median survival may not be reached within follow-up. The `median_high` vs `median_low` comparison fails for those pairs. **Fallback**: compute per-group event-rate ratio (`n_events/n`) — it's a direct hazard proxy, always computable, and correctly infers direction. **Do not** use the log-rank statistic sign (tested: ~20% misclassification rate vs median-based direction).

### Rule 7: Proxy environment variables — set ALL case variants
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

### Rule 8: In-process API for batch jobs (>50 calls)
When running >50 API calls of the same tool, use the Python in-process `ToolUniverse` API directly — not subprocess `tu run` calls. Subprocess adds ~6-8s Python startup overhead per call. For a 109-gene HPA scan, in-process batching with `ThreadPoolExecutor` (per-thread client, 6 workers) takes ~17min vs ~2h via subprocess. The client is NOT thread-safe, so instantiate one per thread.

---

## Complete Workflow

### Phase 0: Ensembl ID Verification (mandatory first step)

For every gene symbol in the input list, look up the correct Ensembl gene ID using a **two-pass live resolution**:

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
- If multiple Ensembl IDs returned from Pass 1, pick the protein-coding gene
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
    "arguments": {
        "operation": "get_cancer_prognostics_by_gene",
        "ensembl_id": ensembl_id
    }
})
# Or via CLI: tu run HPA_get_cancer_prognostics_by_gene '{"ensembl_id": "ENSG..."}'
```

**Batch execution** (in-process API, see Rule 8):
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

**Completion criterion:** every input gene has a validated HPA return or a recorded retry-exhausted absence, and every significant hit is recorded with cancer + direction + p.

**Interpreting HPA results:**
- `prognostic_type: "favorable"` = high expression → better survival (protective)
- `prognostic_type: "unfavorable"` = high expression → worse survival (risk factor)
- `prognostic_cancers_count: 0` = HPA found nothing significant. This is normal — HPA is conservative. The gene may still have TIMER2 significance or other clinical relevance.
- Cross-reference with DE direction: UP-regulated + "unfavorable" = potential oncogenic driver; DOWN-regulated + "favorable" = consistent protective signal.

**Cancer name cleanup:**
HPA appends "(TCGA)" or "(validation)" to cancer names. Strip these and convert to TCGA codes using the mapping in `references/cancer-mapping.md`. The response `cancer_name` field (without suffix) should be the primary key for mapping.

**Symbol validation post-HPA:** HPA may return an old/archived symbol even for a correct Ensembl ID — accept and annotate if the Ensembl ID matches (see `references/tool-reference.md`).

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

**TIMER2 result interpretation:**
- `log_rank_p_value < 0.05` → **Dual validation passed** (strongest evidence)
- `log_rank_p_value 0.05–0.15` → Trend, worth noting
- `log_rank_p_value > 0.15` → Not validated (cohort difference or false positive)
- Compare `median_survival_months` between high/low groups for clinical significance; if it is `null` for one group, use the event-rate ratio (Rule 6)

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

**Important limitation:** TIMER2 does not cover NK cells — recommend CELLxGENE Census or TISCH2 for NK-specific analysis (see `references/tool-reference.md`).

### Phase 3: Kaplan-Meier Curve Generation

For dual-validated gene-cancer pairs, generate KM curves (PNG + PDF, dpi=300, log-rank p annotated) using patient-level data from cBioPortal:

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
- Filter for primary tumor samples (`-01` suffix) to avoid duplicate aliquots
- Remove patients with time ≤ 0 (invalid survival records)
- Minimum 3 patients per group to avoid degenerate KM estimates

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

**Large gene lists (>50)**: Split Phase 1 into batches of 8 genes. Run Phase 2 only on the top hits to control total call count.

## Going Deeper (L3/L4)

For validated hits needing deeper mechanistic evidence, these tools are available:
- `Survival_cox_regression` — multivariate analysis adjusting for age, stage, grade
- `CancerPrognosis_get_gene_expression` — full expression matrix for custom stratification
- `CancerPrognosis_get_survival_data` — patient-level OS/DFS for custom models
- `Survival_kaplan_meier` — custom KM curves with flexible cutoffs
- `SCXA_search_gene` — find single-cell experiments studying the gene
- `ARCHS4_get_gene_expression` — tissue/cell line expression background

See `references/tool-reference.md` for parameter details of the tools with schemas below.
