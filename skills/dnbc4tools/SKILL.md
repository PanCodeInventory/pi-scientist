---
name: "dnbc4tools"
description: dnbc4tools — 华大 DNBelab C Series 单细胞分析工具（scRNA-seq / scATAC-seq / scVDJ-seq）。Use when the user mentions dnbc4tools, DNBelab, or BGI/MGI single-cell analysis.
---

# dnbc4tools — 华大 DNBelab C Series 单细胞分析

dnbc4tools 是华大基因（MGI）的官方单细胞分析流程，处理 DNBelab C Series 高通量单细胞测序数据。当前版本 v3.0。

## 两个必读坑

### 1. mkgtf 的 `--type` 必须匹配 GTF 来源

`--type` 用错会过滤出空 GTF（0 基因），随后 `rna mkref` 报 `No exon features found`：

| GTF 来源 | `--type` 取值 |
|----------|--------------|
| GENCODE（人/鼠推荐） | `gene_type` |
| Ensembl | `gene_biotype` |

判断方法（哪个 >0 用哪个）：

```bash
grep -c 'gene_type "'    genes.gtf   # GENCODE
grep -c 'gene_biotype "' genes.gtf   # Ensembl
```

### 2. mkref 后必须把 ref.json 拷贝到顶层

v3.0 的 `rna mkref` 把 `ref.json` 写在 `<genomeDir>/<species>/` 子目录下，但 `rna run` 读取时需要顶层 `<genomeDir>/ref.json`。缺顶层 ref.json 时 `rna run` 报 `FileNotFoundError: .../STAR`。

**mkref 完成后，确认顶层 `<genomeDir>/ref.json` 存在**（否则拷贝）：

```bash
cp <genomeDir>/<species>/ref.json <genomeDir>/ref.json
# 例：cp /database/GRCh38/Homo_sapiens/ref.json /database/GRCh38/ref.json
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [安装指南](docs/INSTALLATION.md) | tar.gz 安装 + Docker |
| [参考基因组](docs/REFERENCE_GENOME.md) | 人/鼠/混合物种构建（含 v3.0 ref.json 拷贝步骤） |
| [scRNA-seq 流程](docs/SCRNA_WORKFLOW.md) | 完整参数与流程 |
| [ATAC/VDJ 流程](docs/SCATAC_SCVDJ.md) | 简化指南 |
| [多样品处理](docs/MULTI_SAMPLE.md) | 批量分析 |
| [性能优化](docs/PERFORMANCE.md) | 资源估算与优化 |
| [输出文件](docs/OUTPUT_FILES.md) | 格式说明 |
| [Docker 指南](docs/DOCKER.md) | 容器运行 |
| [问题排查](docs/TROUBLESHOOTING.md) | 常见错误解决 |
