---
name: geo-finder
description: Search and retrieve datasets from NCBI GEO (Gene Expression Omnibus) via the local `tu` CLI (tooluniverse). Use this skill whenever the user wants to find, browse, or get details about GEO datasets — including RNA-seq, ChIP-seq, ATAC-seq, DNA methylation, or any other functional genomics data deposited in GEO. Triggers on mentions of "GEO data", "GEO dataset", "gene expression omnibus", "find RNA-seq data", "search GEO", "get GEO sample info", "methylation dataset", "ChIP-seq data", "ATAC-seq dataset", or any request to look up published omics datasets by accession (GSE/GSM).
compatibility: Requires the local `tu` CLI (tooluniverse package). GEO tools are NOT in the `tooluniverse-min` whitelist (GEO is NCBI-hosted), so invoke them with bare `tu` (full registry), not the `tu-min` wrapper. Verify the local proxy can reach NCBI before relying on these calls.
---

# GEO-finder

Search and explore NCBI's Gene Expression Omnibus (GEO) — the world's largest public repository for functional genomics data. This skill wraps the tooluniverse GEO tools to help you find datasets, inspect metadata, and examine sample characteristics.

## Tool inventory

All tools are tooluniverse operations called through the local `tu` CLI. GEO is NCBI-hosted and therefore **not** in the `tooluniverse-min` whitelist — use bare `tu` (full registry), not the `tu-min` wrapper:

```bash
tu run geo_search_datasets '{"query":"pancreatic cancer","organism":"Homo sapiens"}'
```

Inspect any tool's parameters first with `tu info <tool>`.

### Search tools (find datasets)

| Tool | Use case | Key parameters |
|------|----------|----------------|
| `geo_search_datasets` | General-purpose GEO search | `query`, `organism`, `study_type`, `platform` |
| `GEO_search_rnaseq_datasets` | RNA-seq / transcriptomics | `query`, `disease`, `tissue`, `gene` |
| `GEO_search_chipseq_datasets` | ChIP-seq (TF binding, histone marks) | `query`, `disease`, `tissue` |
| `GEO_search_atacseq_datasets` | ATAC-seq (chromatin accessibility) | `query`, `disease`, `tissue`, `cell_type` |
| `GEO_search_methylation_datasets` | DNA methylation arrays (450K, EPIC) | `query`, `disease`, `tissue` |

### Detail tools (inspect specific datasets)

| Tool | Use case | Input |
|------|----------|-------|
| `geo_get_dataset_info` | Get title, summary, metadata | GSE accession (e.g., `GSE12345`) |
| `geo_get_sample_info` | Get sample characteristics, conditions | GSE accession |
| `GEO_get_dataset_details` | Comprehensive metadata + supplementary links | GSE accession |

## Workflow

Follow this three-step pattern for any GEO lookup:

### Step 1 — Search
Choose the right search tool based on the data type the user cares about:

- **RNA-seq / gene expression** → `GEO_search_rnaseq_datasets`
- **ChIP-seq / protein-DNA binding** → `GEO_search_chipseq_datasets`
- **ATAC-seq / open chromatin** → `GEO_search_atacseq_datasets`
- **DNA methylation** → `GEO_search_methylation_datasets`
- **Unspecified / mixed / other assay types** → `geo_search_datasets`

Always pass the most specific parameters available (e.g., `query` for disease/gene, `organism` for species). If the user mentions a specific gene, tissue, disease, or cell type, include it.

### Step 2 — Get dataset details
Once you have a GSE accession of interest, call `geo_get_dataset_info` or `GEO_get_dataset_details` to retrieve:

- Full title and summary
- Experiment type and platform
- Organism and sample count
- Publication date and associated paper
- Supplementary file links

`GEO_get_dataset_details` returns richer metadata and is preferred for the epigenomics tools (RNA-seq, ChIP-seq, ATAC-seq, methylation). Use `geo_get_dataset_info` for results from `geo_search_datasets`.

### Step 3 — Get sample info (optional)
If the user needs to understand experimental design — treatment vs control, tissue types, time points, genotypes — call `geo_get_sample_info` with the GSE accession. This reveals the sample metadata table so the user can assess whether the dataset fits their analysis.

## Presenting results

When returning search results to the user:
- List datasets with **GSE accession**, **title**, **organism**, and **sample count**
- Highlight the most relevant matches first
- Offer to drill into any specific dataset for details or sample info
- If there are many results, ask the user to narrow down by organism, tissue, or other criteria

## Example

**User:** "Find RNA-seq datasets for pancreatic cancer"

1. Call `GEO_search_rnaseq_datasets` with `query: "pancreatic cancer"`, `disease: "pancreatic cancer"`
2. Present the top matches (GSE ID, title, samples)
3. Ask which ones they want to explore further

**User:** "Show me details for GSE15471"

1. Call `GEO_get_dataset_details` with the GSE ID
2. Present title, summary, platform, sample count, publication info
3. Offer to fetch sample-level metadata with `geo_get_sample_info`
