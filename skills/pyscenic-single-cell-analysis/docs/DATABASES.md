# cisTarget Databases for pySCENIC

pySCENIC `ctx` needs:
- Ranking database(s): `*.genes_vs_motifs.rankings.feather`
- Motif-to-TF annotation table: `motifs-*.tbl`
- TF list: `allTFs_*.txt`

Recommended database version: `mc_v10_clust` (feather v2).

## Human (hg38, refseq_r80, mc_v10_clust)

| Type | Filename | URL |
|---|---|---|
| Ranking (10kb) | `hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather` | https://resources.aertslab.org/cistarget/databases/homo_sapiens/hg38/refseq_r80/mc_v10_clust/gene_based/hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather |
| Ranking (500bp) | `hg38_500bp_up_100bp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather` | https://resources.aertslab.org/cistarget/databases/homo_sapiens/hg38/refseq_r80/mc_v10_clust/gene_based/hg38_500bp_up_100bp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather |
| Motif annotations | `motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl` | https://resources.aertslab.org/cistarget/motif2tf/motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl |
| TF list | `allTFs_hg38.txt` | https://resources.aertslab.org/cistarget/tf_lists/allTFs_hg38.txt |

## Mouse (mm10, refseq_r80, mc_v10_clust)

| Type | Filename | URL |
|---|---|---|
| Ranking (10kb) | `mm10_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather` | https://resources.aertslab.org/cistarget/databases/mus_musculus/mm10/refseq_r80/mc_v10_clust/gene_based/mm10_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather |
| Ranking (500bp) | `mm10_500bp_up_100bp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather` | https://resources.aertslab.org/cistarget/databases/mus_musculus/mm10/refseq_r80/mc_v10_clust/gene_based/mm10_500bp_up_100bp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather |
| Motif annotations | `motifs-v10nr_clust-nr.mgi-m0.001-o0.0.tbl` | https://resources.aertslab.org/cistarget/motif2tf/motifs-v10nr_clust-nr.mgi-m0.001-o0.0.tbl |
| TF list | `allTFs_mm.txt` | https://resources.aertslab.org/cistarget/tf_lists/allTFs_mm.txt |

## Download Commands

Example (wget):
```bash
mkdir -p db && cd db
wget -c "https://resources.aertslab.org/cistarget/tf_lists/allTFs_hg38.txt"
wget -c "https://resources.aertslab.org/cistarget/motif2tf/motifs-v10nr_clust-nr.hgnc-m0.001-o0.0.tbl"
wget -c "https://resources.aertslab.org/cistarget/databases/homo_sapiens/hg38/refseq_r80/mc_v10_clust/gene_based/hg38_10kbp_up_10kbp_down_full_tx_v10_clust.genes_vs_motifs.rankings.feather"
```

Example (curl):
```bash
curl -L -o allTFs_hg38.txt "https://resources.aertslab.org/cistarget/tf_lists/allTFs_hg38.txt"
```

Checksums:
- The resources site often provides `*.sha1sum.txt` for large files.
- On macOS: `shasum -a 1 <file>`.

## Which Ranking DB Should I Use?

- `10kbp_up_10kbp_down`: broader promoter-proximal search space; good default.
- `500bp_up_100bp_down`: more promoter-focused; can be more stringent.

You can run `ctx` with multiple ranking databases, but start with one DB until you have a working baseline.
