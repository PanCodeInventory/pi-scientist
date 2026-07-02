# Tool Parameter Reference

Quick-reference for all tooluniverse tools used in the prognosis scan workflow. All tools must be called through `tooluniverse_execute_tool`.

## Phase 0: Ensembl ID Lookup

### `Ensembl_lookup_gene_by_symbol`
Convert gene symbol → Ensembl gene ID. **Always run this first** — never hardcode Ensembl IDs.

```json
{
  "tool_name": "Ensembl_lookup_gene_by_symbol",
  "arguments": {
    "symbol": "TP53",
    "species": "human"
  }
}
```

**Returns**: `{ "symbol": "TP53", "ensembl_ids": [{"id": "ENSG00000141510", "type": "gene"}] }`

**Pitfalls**:
- One symbol may return multiple Ensembl IDs (e.g., IDS returns ENSG00000241489 and ENSG00000010404). Pick the protein-coding gene.
- Always verify the returned `symbol` matches the input.

---

## Phase 1: HPA Prognosis Scan

### `HPA_get_cancer_prognostics_by_gene`
Query prognostic associations across all cancers for a single gene.

```json
{
  "tool_name": "HPA_get_cancer_prognostics_by_gene",
  "arguments": {
    "ensembl_id": "ENSG00000141510"
  }
}
```

**Returns**: `{ "gene": "TP53", "prognostic_cancers_count": N, "prognostic_summary": [...] }`

**Critical validation**: After each call, verify `gene` field matches expected gene name. A mismatch means the Ensembl ID was wrong.

**Pitfalls**:
- Wrong Ensembl ID → returns a *different gene's* data without error. Always validate.
- 0 prognostic cancers is normal (HPA is conservative). Not an error.
- HPA appends "(TCGA)" or "(validation)" to cancer names — use cancer-mapping.md to convert.

---

## Phase 2: TIMER2 Survival Validation

### `TIMER2_survival_association`
Independent survival validation using cBioPortal TCGA data.

```json
{
  "tool_name": "TIMER2_survival_association",
  "arguments": {
    "operation": "survival_association",
    "cancer": "BRCA",
    "gene": "TP53"
  }
}
```

**⚠️ Parameter names**: `operation`, `cancer`, `gene` — note it's `gene` (not `gene1`).

**Returns**: `{ "n_patients": N, "log_rank_p_value": P, "high_expression_group": {...}, "low_expression_group": {...} }`

**Pitfalls**:
- `gene` parameter takes HGNC symbol (e.g., "TP53"), NOT Ensembl ID.
- cBioPortal connection may fail intermittently. Retry once, then skip.
- Small cohorts (e.g., KICH n=65) may have limited statistical power.

---

## Phase 2.5: Immune Infiltration & Gene Correlation

### `TIMER2_immune_estimation`
Correlate gene expression with immune cell marker gene expression in TCGA.

```json
{
  "tool_name": "TIMER2_immune_estimation",
  "arguments": {
    "operation": "immune_estimation",
    "cancer": "HNSC",
    "gene": "MAFF"
  }
}
```

**Returns**: Per immune cell type: `{ spearman_r, p_value }` for correlation between query gene and marker gene.

**Covered cell types**: B cell (CD19), CD4+ T (CD4), CD8+ T (CD8A), Neutrophil (FCGR3B), Macrophage (CD68), Dendritic cell (ITGAX).

**Limitation**: No NK cell estimation. For NK-specific analysis, use CELLxGENE Census or TISCH2.

### `TIMER2_gene_correlation`
Spearman correlation between two genes across TCGA samples.

```json
{
  "tool_name": "TIMER2_gene_correlation",
  "arguments": {
    "operation": "gene_correlation",
    "cancer": "HNSC",
    "gene1": "MAFF",
    "gene2": "TRAF1"
  }
}
```

**⚠️ Parameter names**: `gene1` and `gene2` — NOT `gene` and `gene2`. This is a common mistake.

**Returns**: `{ "n_samples": N, "spearman_r": R, "p_value": P }`

---

## Phase 3: KM Curve Generation

### `CancerPrognosisTool` (in-process API) / `CancerPrognosis_get_gene_expression` (CLI)
Fetch patient-level gene expression for a specific cancer cohort.

```json
{
  "tool_name": "CancerPrognosisTool",
  "arguments": {
    "operation": "get_gene_expression",
    "cancer": "KIRC",
    "gene": "AIG1",
    "max_samples": 2000
  }
}
```

**Returns** (truncated):
```json
{
  "status": "success",
  "cancer": "KIRC",
  "gene": "AIG1",
  "profile_name": "RNA Seq V2 RSEM",
  "n_samples": 533,
  "expression_summary": {"min": 0.5, "max": 1234.5, "median": 5.2, "mean": 12.3},
  "expression": [
    {"sampleId": "TCGA-XX-XXXX-01A", "patientId": "TCGA-XX-XXXX", "value": 3.45},
    ...
  ]
}
```

**Pitfalls**:
- `patientId` may appear multiple times (different aliquots). Deduplicate by keeping `-01` primary tumor samples.
- Some genes show `status: "error"` with `"Gene not found"` under concurrency — retry once before treating as genuine absence.
- `max_samples` is the desired output count; the tool fetches more raw data internally. Set 1000-2000 for full cohorts.

### `CancerPrognosisTool` / `CancerPrognosis_get_survival_data`
Fetch patient-level overall survival data.

```json
{
  "tool_name": "CancerPrognosisTool",
  "arguments": {
    "operation": "get_survival_data",
    "cancer": "KIRC",
    "max_patients": 2000
  }
}
```

**Returns** (truncated):
```json
{
  "status": "success",
  "study_id": "kirc_tcga",
  "n_patients": 533,
  "survival_type": "OS",
  "patients": [
    {"patientId": "TCGA-XX-XXXX", "os_status": "DECEASED", "os_time": 45.3},
    {"patientId": "TCGA-YY-YYYY", "os_status": "LIVING", "os_time": 67.8},
    ...
  ]
}
```

**Pitfalls**:
- `os_time` is in **months**. Convert to days if using lifelines with day-scale data.
- `os_status`: `"DECEASED"` / `"1"` / `"dead"` → event=1; everything else → event=0.
- Some patients have `os_time=0` — remove before analysis (invalid records).

## Optional Phase 3 (continued): Deeper Analysis

### `Survival_kaplan_meier` (local computation, no API)
Generate KM survival estimates from your own arrays.

```json
{
  "tool_name": "SurvivalTool",
  "arguments": {
    "operation": "kaplan_meier",
    "durations": [45, 67, 23, 89],
    "event_observed": [1, 0, 1, 0]
  }
}
```

**Returns**: KM step-function estimates (timeline, survival_probability, confidence intervals). Note: this computes estimates only; for publication figures, use lifelines `KaplanMeierFitter` in Python for full plot control (legends, annotations, styling).

### `Survival_log_rank_test` (local computation)
Compare two survival curves.

### `Survival_cox_regression`
Multivariate Cox analysis with clinical covariates (age, stage, grade).

### `ARCHS4_get_gene_expression`
Tissue/cell line expression from 300K+ RNA-seq samples.

### `SCXA_search_gene`
Find single-cell RNA-seq experiments where a gene is expressed.

---

## In-Process API vs CLI

| Context | Tool Name Format | Call Pattern |
|---------|-----------------|--------------|
| CLI (`tu run`) | `CancerPrognosis_get_gene_expression` | `tu run CancerPrognosis_get_gene_expression cancer=KIRC gene=AIG1` |
| In-process Python | `CancerPrognosisTool` + `operation` | `ToolUniverse().run_one_function({"tool_name": "CancerPrognosisTool", "arguments": {"operation": "get_gene_expression", ...}})` |

Use in-process API for batch jobs (>50 calls) to avoid ~6-8s subprocess startup per call.

## Tool Discovery Commands

```bash
tu find "survival gene expression"    # Search tools by keyword
tu info CancerPrognosis_get_gene_expression   # Get parameter schema
tu list   # List all available tools
```
