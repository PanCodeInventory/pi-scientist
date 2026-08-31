# Tool Parameter Reference

Quick-reference for all tooluniverse tools used in the prognosis scan workflow. Call them via the in-process API — `ToolUniverse().run_one_function({"tool_name": "<PascalCaseTool>", "arguments": {...}})` — or, for one-off shell use, `tu run <tool> '<json>'`. See the In-Process API vs CLI table below for the name-format difference.

## Phase 0: Ensembl ID Lookup

Phase 0 does not use a tooluniverse tool — it resolves symbols via raw Ensembl/HGNC REST (two-pass live resolution). See SKILL.md Phase 0 for the procedure.

---

## Phase 1: HPA Prognosis Scan

### `HPA_get_cancer_prognostics_by_gene` (in-process: `HPATool`)
Query prognostic associations across all cancers for a single gene.

```json
{
  "tool_name": "HPATool",
  "arguments": {
    "operation": "get_cancer_prognostics_by_gene",
    "ensembl_id": "ENSG00000141510"
  }
}
```

**Returns**:
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

**Pitfalls**:
- Wrong Ensembl ID → returns a *different gene's* data without error. Always validate the `gene` field (see SKILL.md Rule 2).
- HPA may return an old/archived symbol in `gene` even when queried by the correct Ensembl ID (e.g., ENSG00000109066 → `gene: "TMEM104"` instead of `SLC38A12`). Accept if the Ensembl ID matches; annotate as old-symbol edge case.
- MESO (mesothelioma) has only ~12 patients with both expression + survival data — too few for median-split survival. Exclude from the pan-cancer scan.

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

**Returns**:
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
Each group has exactly three fields: `n`, `n_events`, `median_survival_months`. If `median_survival_months` is `null` (not reached), use event-rate ratio `n_events/n` for direction (see SKILL.md Rule 6).

**Pitfalls**:
- `gene` parameter takes HGNC symbol (e.g., "TP53"), NOT Ensembl ID.
- cBioPortal connection may fail intermittently. Retry once, then skip.
- Small cohorts (e.g., KICH n=65) may have limited statistical power.
- The original TIMER2.0/3.0 API is decommissioned; this tool uses a cBioPortal proxy. Data is reliable; note the source in reports.

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

**Pitfalls**:
- Some gene×cancer correlations show r=±1.0 at n=5 (real API response, statistically unreliable). Flag with `low_n_warning` (n<20) and `extreme_low_n_warning` (n<20 and |r|≥0.8); do not delete but interpret with caution.

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
| CLI (`tu run`) | `CancerPrognosis_get_gene_expression` | `tu run CancerPrognosis_get_gene_expression '{"cancer":"KIRC","gene":"AIG1"}'` |
| In-process Python | `CancerPrognosisTool` + `operation` | `ToolUniverse().run_one_function({"tool_name": "CancerPrognosisTool", "arguments": {"operation": "get_gene_expression", ...}})` |

## General Notes

- `GDC_get_gene_expression` returns only **file metadata**, not expression values. Use `CancerPrognosis_get_gene_expression` (cBioPortal tumor-only) for expression; bulk STAR-Counts download (tens of GB) is the only path to actual normal expression.
- Pan-cancer BH FDR: ~924 tests per dimension (28 genes × 33 cancers), but FDR conditioning is on HPA-reported pairs only, not the full gene×cancer universe. Report both FDR and nominal p; note the FDR scope limitation in methods.

## Tool Discovery Commands

```bash
tu find "survival gene expression"    # Search tools by keyword
tu info CancerPrognosis_get_gene_expression   # Get parameter schema
tu list   # List all available tools
```
