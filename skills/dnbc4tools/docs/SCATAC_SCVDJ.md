# scATAC-seq 和 scVDJ-seq 分析指南

## scATAC-seq 分析

### 概述

scATAC-seq（单细胞染色质可及性测序）用于分析单细胞水平的染色质开放区域，揭示基因调控机制。

### 构建参考基因组

```bash
# 下载参考文件（以人类为例）
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_32/GRCh38.primary_assembly.genome.fa.gz
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_32/gencode.v32.primary_assembly.annotation.gtf.gz

gzip -d *.gz

# 过滤 GTF
dnbc4tools tools mkgtf \
  --ingtf gencode.v32.primary_assembly.annotation.gtf \
  --output genes.filter.gtf \
  --type gene_type

# 构建 ATAC 索引
dnbc4tools atac mkref \
  --fasta GRCh38.primary_assembly.genome.fa \
  --ingtf genes.filter.gtf \
  --species Homo_sapiens \
  --prefix chr
```

> `--prefix chr` 用于染色体命名标准化

### 运行分析

```bash
dnbc4tools atac run \
  --fastq1 /data/sample_R1.fq.gz \
  --fastq2 /data/sample_R2.fq.gz \
  --genomeDir /database/scATAC/Homo_sapiens \
  --name sample_atac \
  --threads 16
```

### 多文件输入

```bash
dnbc4tools atac run \
  --fastq1 /data/L1_R1.fq.gz,/data/L2_R1.fq.gz \
  --fastq2 /data/L1_R2.fq.gz,/data/L2_R2.fq.gz \
  --genomeDir /database/scATAC/Homo_sapiens \
  --name sample_atac \
  --threads 16
```

### 关键参数

| 参数 | 说明 |
|------|------|
| `--fastq1` | Read1 FASTQ 文件 |
| `--fastq2` | Read2 FASTQ 文件 |
| `--genomeDir` | ATAC 参考基因组目录 |
| `--name` | 样本名称 |
| `--threads` | CPU 线程数 |

### 输出文件

```
sample_atac/outs/
├── filter_peak_matrix/     # 过滤后 Peak 矩阵
│   ├── barcodes.tsv.gz
│   ├── peaks.bed.gz
│   └── matrix.mtx.gz
├── fragments.tsv.gz        # 原始 Fragments 文件
├── filtered.fragments.tsv.gz  # 过滤后 Fragments
├── singlecell.csv          # 细胞元数据
├── metrics_summary.xls     # 统计指标
└── *_scATAC_report.html    # 分析报告
```

---

## scVDJ-seq 分析

### 概述

scVDJ-seq（单细胞免疫组库测序）用于分析 T 细胞受体（TCR）或 B 细胞受体（BCR）的多样性。

> ⚠️ **前置条件**：必须先完成 5' scRNA-seq 分析以建立细胞-珠子对应关系

### 步骤一：5' RNA 分析

```bash
dnbc4tools rna run \
  --name sample_5prime \
  --cDNAfastq1 /data/5prime_cDNA_R1.fq.gz \
  --cDNAfastq2 /data/5prime_cDNA_R2.fq.gz \
  --oligofastq1 /data/5prime_oligo_R1.fq.gz \
  --oligofastq2 /data/5prime_oligo_R2.fq.gz \
  --genomeDir /database/scRNA/Homo_sapiens \
  --end5 \
  --threads 16
```

> 注意：必须使用 `--end5` 参数

### 步骤二：VDJ 分析

**TCR 分析（人类）**：

```bash
dnbc4tools vdj run \
  --fastq1 /data/tcr_R1.fq.gz \
  --fastq2 /data/tcr_R2.fq.gz \
  --beadstrans /sample_5prime/outs/singlecell.csv \
  --ref human \
  --chain TR \
  --name sample_tcr \
  --threads 16
```

**BCR 分析（人类）**：

```bash
dnbc4tools vdj run \
  --fastq1 /data/bcr_R1.fq.gz \
  --fastq2 /data/bcr_R2.fq.gz \
  --beadstrans /sample_5prime/outs/singlecell.csv \
  --ref human \
  --chain IG \
  --name sample_bcr \
  --threads 16
```

**TCR 分析（小鼠）**：

```bash
dnbc4tools vdj run \
  --fastq1 /data/tcr_R1.fq.gz \
  --fastq2 /data/tcr_R2.fq.gz \
  --beadstrans /mouse_5prime/outs/singlecell.csv \
  --ref mouse \
  --chain TR \
  --name mouse_tcr \
  --threads 16
```

### 关键参数

| 参数 | 说明 |
|------|------|
| `--fastq1` | VDJ Read1 FASTQ 文件 |
| `--fastq2` | VDJ Read2 FASTQ 文件 |
| `--beadstrans` | 5' RNA 分析输出的 singlecell.csv |
| `--ref` | 参考物种（human/mouse） |
| `--chain` | 链类型（TR=TCR, IG=BCR） |
| `--name` | 样本名称 |
| `--threads` | CPU 线程数 |

### 输出文件

```
sample_tcr/outs/
├── clonotypes.csv          # 克隆型信息
├── filtered_contig.csv     # 过滤后的 Contig
├── all_contig.csv          # 所有 Contig
├── metrics_summary.xls     # 统计指标
└── *_scVDJ_report.html     # 分析报告
```

---

## 快速参考表

### 命令对比

| 分析类型 | 构建索引 | 运行分析 |
|----------|----------|----------|
| scRNA-seq | `dnbc4tools rna mkref` | `dnbc4tools rna run` |
| scATAC-seq | `dnbc4tools atac mkref` | `dnbc4tools atac run` |
| scVDJ-seq | 内置参考 | `dnbc4tools vdj run` |

### VDJ 链类型

| 参数值 | 链类型 | 说明 |
|--------|--------|------|
| `TR` | TCR | T 细胞受体（α/β 或 γ/δ） |
| `IG` | BCR | B 细胞受体（免疫球蛋白） |

### 支持的物种

| 物种 | RNA | ATAC | VDJ |
|------|:---:|:----:|:---:|
| 人类 (human) | ✓ | ✓ | ✓ |
| 小鼠 (mouse) | ✓ | ✓ | ✓ |
| 其他物种 | ✓* | ✓* | ✗ |

> *需要自行准备参考基因组

---

## 常见问题

### ATAC：Peak 数量过少

**可能原因**：测序深度不足或样品质量问题

**解决**：检查 TSS enrichment score 和 fragment 分布

### VDJ：无法找到 beadstrans 文件

**错误**：`singlecell.csv not found`

**解决**：确保 5' RNA 分析已完成，路径正确

### VDJ：克隆型数量为 0

**可能原因**：
1. 未使用 `--end5` 进行 RNA 分析
2. 数据质量问题
3. 物种/链类型设置错误

**解决**：检查 RNA 分析是否使用了 5' 模式
