---
name: "dnbc4tools"
description: |
  华大 DNBelab C Series™ 单细胞分析工具完整指南。
  支持 scRNA-seq（重点）、scATAC-seq、scVDJ-seq 分析流程。
  包含：安装配置、参考基因组构建、多样品批量处理、
  性能优化、Docker 部署、结果解读和问题排查。
  适用于华大单细胞测序平台数据分析。
version: "1.0"
triggers:
  - dnbc4tools
  - 华大单细胞
  - DNBelab
  - BGI single cell
  - scRNA analysis MGI
---

# DNBelab C Series™ 单细胞分析工具 (dnbc4tools)

## Level 1: 概述（始终阅读）

dnbc4tools 是华大基因（MGI）开发的官方单细胞分析流程，用于处理 DNBelab C Series 高通量单细胞测序数据。**当前最新版本：v3.0**

### 支持的分析类型

| 类型 | 命令 | 说明 |
|------|------|------|
| **scRNA-seq** | `dnbc4tools rna` | 单细胞转录组分析【主要】 |
| scATAC-seq | `dnbc4tools atac` | 染色质可及性分析 |
| scVDJ-seq | `dnbc4tools vdj` | 免疫组库分析（需先完成 5' RNA） |

### 系统要求速览

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| 内存 | 50GB | 128GB+ |
| CPU | 8 核 | 16+ 核 |
| 存储 | HDD | SSD |
| 系统 | Linux 64-bit | Ubuntu 20.04+ / CentOS 7+ |

### 30秒快速命令

```bash
# 安装
wget -O dnbc4tools-3.0.tar.gz "ftp://ftp2.cngb.org/pub/CNSA/data7/CNP0008672/Single_Cell/CSE0000574/dnbc4tools-3.0.tar.gz"
tar -xzvf dnbc4tools-3.0.tar.gz && cd dnbc4tools3.0
./dnbc4tools --version

# 运行 scRNA-seq 分析
./dnbc4tools rna run \
  --name sample1 \
  --cDNAfastq1 sample_cDNA_R1.fq.gz --cDNAfastq2 sample_cDNA_R2.fq.gz \
  --oligofastq1 sample_oligo_R1.fq.gz --oligofastq2 sample_oligo_R2.fq.gz \
  --genomeDir /path/to/reference \
  --threads 16
```

---

## Level 2: 快速开始

### 安装（解压即用）

```bash
# 下载 v3.0
wget -O dnbc4tools-3.0.tar.gz \
  "ftp://ftp2.cngb.org/pub/CNSA/data7/CNP0008672/Single_Cell/CSE0000574/dnbc4tools-3.0.tar.gz"

# 解压
tar -xzvf dnbc4tools-3.0.tar.gz
cd dnbc4tools3.0

# 验证
./dnbc4tools --version
./dnbc4tools rna --help
```

> 详细安装说明见 [docs/INSTALLATION.md](docs/INSTALLATION.md)

### 构建参考基因组

```bash
# 1. 过滤 GTF（推荐）
#    ⚠️ --type 取决于 GTF 来源：GENCODE 用 gene_type，Ensembl 用 gene_biotype
#    用错会过滤出空 GTF（0 基因）！判断：
#      grep -c 'gene_type "' genes.gtf   # GENCODE（>0 则用 gene_type）
#      grep -c 'gene_biotype "' genes.gtf # Ensembl（>0 则用 gene_biotype）
./dnbc4tools tools mkgtf \
  --ingtf genes.gtf \
  --output genes.filter.gtf \
  --type gene_type   # GENCODE；若用 Ensembl GTF 改为 gene_biotype

# 2. 构建索引
./dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.filter.gtf \
  --species Homo_sapiens \
  --threads 10
```

> 详细说明见 [docs/REFERENCE_GENOME.md](docs/REFERENCE_GENOME.md)

### 运行 scRNA-seq 分析

```bash
./dnbc4tools rna run \
  --name PBMC_sample \
  --cDNAfastq1 /data/PBMC_cDNA_R1.fq.gz \
  --cDNAfastq2 /data/PBMC_cDNA_R2.fq.gz \
  --oligofastq1 /data/PBMC_oligo_R1.fq.gz \
  --oligofastq2 /data/PBMC_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --threads 16
```

> 完整参数说明见 [docs/SCRNA_WORKFLOW.md](docs/SCRNA_WORKFLOW.md)

---

## Level 3: 详细文档索引

| 文档 | 说明 |
|------|------|
| [安装指南](docs/INSTALLATION.md) | tar.gz 安装 + Docker |
| [参考基因组](docs/REFERENCE_GENOME.md) | 人/鼠/混合物种构建 |
| [scRNA-seq 流程](docs/SCRNA_WORKFLOW.md) | 完整参数与流程【重点】 |
| [ATAC/VDJ 流程](docs/SCATAC_SCVDJ.md) | 简化指南 |
| [多样品处理](docs/MULTI_SAMPLE.md) | 批量分析 |
| [性能优化](docs/PERFORMANCE.md) | 资源估算与优化 |
| [输出文件](docs/OUTPUT_FILES.md) | 格式说明 |
| [Docker 指南](docs/DOCKER.md) | 容器运行 |
| [问题排查](docs/TROUBLESHOOTING.md) | 常见错误解决 |

---

## Level 4: 关键参数速查

### scRNA-seq 必需参数

| 参数 | 说明 |
|------|------|
| `-n, --name` | 样本名称（输出文件前缀） |
| `-g, --genomeDir` | 参考基因组目录（mkref 生成） |
| `-c1, --cDNAfastq1` | cDNA Read1 文件 |
| `-c2, --cDNAfastq2` | cDNA Read2 文件 |
| `-i1, --oligofastq1` | Oligo Read1 文件 |
| `-i2, --oligofastq2` | Oligo Read2 文件 |

### 常用可选参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-t, --threads` | 全部核心 | CPU 线程数 |
| `-o, --outdir` | 当前目录 | 输出目录 |
| `--chemistry` | auto | 试剂版本 (scRNAv1HT/v2HT/v3HT/5Pv1) |
| `--darkreaction` | auto | 暗反应设置 (格式: cDNA,oligo) |
| `--minumi` | 1000 | 最低 UMI 阈值 |
| `--expectcells` | auto | 预期细胞数 |
| `--forcecells` | - | 强制细胞数 |
| `--no_bam` | false | 跳过 BAM 生成（节省空间） |
| `--end5` | false | 5' 端分析模式 |
| `--no_introns` | false | 排除内含子 reads |

### 多文件输入语法

```bash
# 多 lane 数据：逗号分隔
--cDNAfastq1 lane1_R1.fq.gz,lane2_R1.fq.gz

# 批量配置文件中 R1/R2：分号分隔
sample1    R1.fq.gz;R2.fq.gz    oligo_R1.fq.gz;oligo_R2.fq.gz
```

---

## QC 质控阈值参考

| 指标 | 推荐 | 可接受 | 需改进 |
|------|:----:|:------:|:------:|
| Valid Barcodes | ≥80% | 70-80% | <70% |
| Q30 (Barcode/UMI) | ≥85% | 75-85% | <75% |
| Fraction Reads in Cells | ≥60% | 30-60% | <30% |
| Sequencing Saturation | ≥40% | 20-40% | <20% |
| Median Genes per Cell | ≥1000 | 500-1000 | <500 |

---

## 输出文件结构

```
sample_name/
├── outs/
│   ├── filter_matrix/          # 过滤后表达矩阵（MEX格式）
│   │   ├── barcodes.tsv.gz
│   │   ├── features.tsv.gz
│   │   └── matrix.mtx.gz
│   ├── raw_matrix/             # 原始表达矩阵
│   ├── filter_feature.h5ad     # AnnData 格式
│   ├── analysis/
│   │   ├── cluster.csv         # 聚类结果
│   │   ├── marker.csv          # 差异基因
│   │   └── QC_Cluster.h5ad     # 完整分析对象
│   ├── anno_decon_sorted.bam   # 比对文件
│   ├── metrics_summary.xls     # 统计指标
│   ├── singlecell.csv          # 细胞元数据
│   └── *_scRNA_report.html     # 交互式报告
└── logs/                       # 运行日志
```

---

## 常见问题快速解决

| 问题 | 解决方案 |
|------|----------|
| 试剂版本检测失败 | 手动指定 `--chemistry scRNAv3HT --darkreaction R1,R1R2` |
| 细胞数过低 | 降低 `--minumi 500` 或调整 `--expectcells` |
| 细胞数过高 | 使用 `--forcecells` 或提高 `--minumi` |
| 内存不足 | 减少 `--threads` 或使用 `--limitram`（mkref） |
| 磁盘空间不足 | 使用 `--no_bam` 跳过 BAM 生成 |
| GTF 解析失败 | 使用 `mkgtf --action check` 修复 |

> 详细问题排查见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

---

## 相关资源

- **GitHub**: https://github.com/MGI-tech-bioinformatics/DNBelab_C_Series_HT_scRNA-analysis-software
- **Docker Hub**: https://hub.docker.com/r/dnbelabc4/dnbc4tools
- **官方文档**: https://mgi-tech-bioinformatics.github.io/DNBelab_C_Series_HT_scRNA-analysis-software/
