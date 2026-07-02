# Troubleshooting pySCENIC

## Issue: 0 regulons found / very few regulons

Symptoms:
- `pyscenic ctx` finishes, but `regulons.csv` is empty or tiny

Cause:
- Gene identifiers in your expression matrix do not match the cisTarget database gene naming convention

Solution:
- Run `scripts/validate_genes.py` and fix gene naming before running pySCENIC:
```bash
python scripts/validate_genes.py --expression expr_mat.loom --database hg38_10kbp*.feather
```
- Common mismatches: Ensembl IDs vs HGNC/MGI symbols, version suffixes (`.16`), wrong species, case.

## Issue: MemoryError / process killed during `ctx`

Symptoms:
- `MemoryError`, killed worker, or OS terminates the process

Cause:
- Ranking databases are large; `ctx` can be RAM-heavy, especially with many workers or multiple DBs

Solution:
- Reduce `--num_workers`
- Start with a single ranking DB
- Run on a machine with more RAM

## Issue: Expression values look wrong (floats, negatives)

Symptoms:
- Many non-integer values; unexpected distributions; regulons look nonsensical

Cause:
- Using normalized/log-transformed/scaled data instead of raw counts

Solution:
- Use raw counts matrix (integers)
- In Scanpy, double-check which layer you export (often `adata.raw.X` or a raw-count layer)

## Issue: Many "TF not found" / "Unknown TF" warnings

Symptoms:
- GRN step warns that TFs are missing from the expression matrix

Cause:
- TF list uses different gene symbols than your matrix, or your matrix lacks those TF genes

Solution:
- Validate gene overlap and naming
- Confirm you use the correct TF list for species (`allTFs_hg38.txt` vs `allTFs_mm.txt`)

## Issue: Dask/worker timeouts during GRN inference

Symptoms:
- Dask scheduler errors, worker timeouts, hanging jobs

Cause:
- Environment / multiprocessing issues on some platforms

Solution:
- Try fewer workers
- Consider using the `arboreto_with_multiprocessing.py` entrypoint if available in your install

## Gene ID Conversion Resources

- Python: mygene (`pip install mygene`) for symbol/Ensembl mapping
- R: biomaRt for robust Ensembl/HGNC/MGI conversions
- HGNC / MGI reference tables (when you need an authoritative symbol set)
