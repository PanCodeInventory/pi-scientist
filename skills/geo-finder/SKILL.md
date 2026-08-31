---
name: geo-finder
description: GEO (Gene Expression Omnibus) dataset search and retrieval via the local `tu` CLI. Use when the user wants to find RNA-seq, ChIP-seq, ATAC-seq, or DNA methylation datasets, browse any other functional genomics data in GEO, or look up a published dataset by accession (GSE/GSM).
---

# GEO-finder

Search and explore NCBI's Gene Expression Omnibus (GEO).

## Tool inventory

All tools are tooluniverse operations called through the local `tu` CLI. GEO is NCBI-hosted and therefore **not** in the `tooluniverse-min` whitelist — use bare `tu` (full registry), not the `tu-min` wrapper:

```bash
tu run geo_search_datasets '{"query":"pancreatic cancer","organism":"Homo sapiens"}'
```

Inspect any tool's parameters first with `tu info <tool>`.

### Detail tools (inspect specific datasets)

| Tool | Use case | Input |
|------|----------|-------|
| `geo_get_dataset_info` | Get title, summary, metadata | GSE accession (e.g., `GSE12345`) |
| `geo_get_sample_info` | Get sample characteristics, conditions | GSE accession |
| `GEO_get_dataset_details` | Comprehensive metadata + supplementary links | GSE accession |

## Workflow

Follow this pattern for any GEO lookup:

### Step 0 — Pre-flight
Verify the local proxy can reach NCBI before relying on these calls.

### Step 1 — Search
Choose the search tool for the data type the user cares about:

- **RNA-seq / gene expression** → `GEO_search_rnaseq_datasets`
- **ChIP-seq / protein-DNA binding** (TF binding, histone marks) → `GEO_search_chipseq_datasets`
- **ATAC-seq / open chromatin** (chromatin accessibility) → `GEO_search_atacseq_datasets`
- **DNA methylation** (450K, EPIC arrays) → `GEO_search_methylation_datasets`
- **Unspecified / mixed / other assay types** → `geo_search_datasets`

Pass the most specific parameters available (e.g., `query` for disease/gene, `organism` for species).

Done when you have issued the search call and hold a list of candidate GSE accessions.

### Step 2 — Get dataset details
Once you have a GSE accession of interest, call `geo_get_dataset_info` or `GEO_get_dataset_details` to retrieve:

- Full title and summary
- Experiment type and platform
- Organism and sample count
- Publication date and associated paper
- Supplementary file links

`GEO_get_dataset_details` returns richer metadata and is preferred for the assay-specific tools (RNA-seq, ChIP-seq, ATAC-seq, methylation). Use `geo_get_dataset_info` for results from `geo_search_datasets`.

Done when you have all of: title, summary, platform, organism, sample count, publication, supplementary links.

### Step 3 — Get sample info (optional)
If the user needs to understand experimental design — treatment vs control, tissue types, time points, genotypes — call `geo_get_sample_info` with the GSE accession.

Done when you have the sample metadata table (treatment/control, tissue, time points, genotypes).

## Presenting results

When returning search results to the user:
- List datasets with **GSE accession**, **title**, **organism**, and **sample count**
- If there are many results, ask the user to narrow down by organism, tissue, or other criteria
