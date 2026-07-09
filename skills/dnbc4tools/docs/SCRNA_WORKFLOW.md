# scRNA-seq 分析流程

## 流程概述

```
原始数据 → 质量控制 → 序列比对 → 细胞识别 → 表达矩阵 → 聚类分析 → 报告生成
```

dnbc4tools scRNA 分析流程将 DNBelab C Series 平台的原始测序数据处理为单细胞基因表达矩阵，并进行初步的聚类分析。

---

## 输入文件要求

### 必需的 FASTQ 文件

| 文库类型 | 参数 | 内容说明 |
|----------|------|----------|
| **cDNA** | `-c1`, `-c2` | Cell Barcode + UMI + 转录本序列 |
| **Oligo** | `-i1`, `-i2` | Bead Barcode 信息（用于珠子合并） |

### 文件格式

- 格式：`.fastq.gz` 或 `.fq.gz`
- 配对：R1 和 R2 成对
- 命名：无特殊要求

### 多文件语法

```bash
# 多 lane 数据：逗号分隔
--cDNAfastq1 lane1_R1.fq.gz,lane2_R1.fq.gz
--cDNAfastq2 lane1_R2.fq.gz,lane2_R2.fq.gz

# 多个 oligo 文件
--oligofastq1 oligo1_R1.fq.gz,oligo2_R1.fq.gz
--oligofastq2 oligo1_R2.fq.gz,oligo2_R2.fq.gz
```

> ⚠️ 同一参数下的所有文件必须来自同一文库，具有相同的测序模式和暗反应设置

---

## 完整参数说明

### 必需参数

```bash
-n, --name <STR>        # 样本名称，用于输出文件命名
-g, --genomeDir <DIR>   # 参考基因组目录（mkref 生成）
```

### 输入文件参数

**方式一：目录模式（自动检测）**
```bash
--fastqs <DIR>          # 包含 cDNA/ 和 oligo/ 子目录
```

**方式二：文件模式（推荐，更精确）**
```bash
-c1, --cDNAfastq1 <FILE>    # cDNA Read1 文件
-c2, --cDNAfastq2 <FILE>    # cDNA Read2 文件
-i1, --oligofastq1 <FILE>   # Oligo Read1 文件
-i2, --oligofastq2 <FILE>   # Oligo Read2 文件
```

### 基础设置

```bash
-o, --outdir <DIR>      # 输出目录（默认：当前目录）
-t, --threads <INT>     # CPU 线程数（默认：使用所有核心）
```

### 细胞过滤参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--calling_method` | emptydrops | 细胞识别方法 |
| `--expectcells` | auto | 预期细胞数（引导算法） |
| `--forcecells` | - | 强制使用指定细胞数 |
| `--minumi` | 1000 | 最低 UMI 阈值 |

**细胞识别方法对比**：

| 方法 | 原理 | 适用场景 |
|------|------|----------|
| `emptydrops` | 统计检验，区分真细胞与背景 | 标准分析（推荐） |
| `barcoderanks` | UMI 排序曲线拐点 | 快速预分析 |

### 文库设置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--chemistry` | auto | 试剂版本 |
| `--darkreaction` | auto | 暗反应设置 |
| `--customize` | - | 自定义 Barcode/UMI 结构（高级） |

**支持的试剂版本**：
- `scRNAv1HT`
- `scRNAv2HT`
- `scRNAv3HT`
- `scRNA5Pv1`（5' 端）
- `auto`（自动检测）

**暗反应设置格式**：`<cDNA设置>,<oligo设置>`

| 选项 | 说明 |
|------|------|
| `auto` | 自动检测 |
| `R1` | 仅 R1 有暗反应 |
| `R1R2` | R1 和 R2 都有暗反应 |
| `unset` | 无暗反应 |

示例：`--darkreaction R1,R1R2`

### 分析选项

| 参数 | 说明 |
|------|------|
| `--no_introns` | 排除内含子 reads（提高特异性） |
| `--end5` | 5' 端分析模式（用于 VDJ 前置分析） |
| `--no_bam` | 跳过 BAM 生成（节省 50%+ 存储） |
| `--sample_read_pairs <N>` | 抽样测试模式 |

---

## 使用示例

### 基础分析

```bash
dnbc4tools rna run \
  --name PBMC_sample \
  --cDNAfastq1 /data/PBMC_cDNA_R1.fq.gz \
  --cDNAfastq2 /data/PBMC_cDNA_R2.fq.gz \
  --oligofastq1 /data/PBMC_oligo_R1.fq.gz \
  --oligofastq2 /data/PBMC_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --threads 16
```

### 多 lane 数据合并

```bash
dnbc4tools rna run \
  --name sample \
  --cDNAfastq1 lane1_cDNA_R1.fq.gz,lane2_cDNA_R1.fq.gz \
  --cDNAfastq2 lane1_cDNA_R2.fq.gz,lane2_cDNA_R2.fq.gz \
  --oligofastq1 oligo_R1.fq.gz \
  --oligofastq2 oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --threads 32
```

### 5' 端分析（用于 VDJ）

```bash
dnbc4tools rna run \
  --name sample_5prime \
  --cDNAfastq1 /data/5prime_cDNA_R1.fq.gz \
  --cDNAfastq2 /data/5prime_cDNA_R2.fq.gz \
  --oligofastq1 /data/5prime_oligo_R1.fq.gz \
  --oligofastq2 /data/5prime_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --end5 \
  --threads 16
```

### 节省空间模式

```bash
dnbc4tools rna run \
  --name sample \
  --fastqs /data/fastq_dir \
  --genomeDir /database/GRCh38 \
  --no_bam \
  --threads 16
```

### 快速测试模式

```bash
# 抽样 100 万 reads 快速验证参数
dnbc4tools rna run \
  --name test_sample \
  --cDNAfastq1 sample_cDNA_R1.fq.gz \
  --cDNAfastq2 sample_cDNA_R2.fq.gz \
  --oligofastq1 sample_oligo_R1.fq.gz \
  --oligofastq2 sample_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --sample_read_pairs 1000000 \
  --threads 8
```

### 手动指定试剂版本

当自动检测失败时：

```bash
dnbc4tools rna run \
  --name sample \
  --cDNAfastq1 sample_cDNA_R1.fq.gz \
  --cDNAfastq2 sample_cDNA_R2.fq.gz \
  --oligofastq1 sample_oligo_R1.fq.gz \
  --oligofastq2 sample_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --chemistry scRNAv3HT \
  --darkreaction R1,R1R2 \
  --threads 16
```

---

## 细胞过滤策略

### 场景一：细胞数过低

**症状**：识别的细胞数远低于预期

**解决方案**：

```bash
# 方案 1：降低 UMI 阈值
--minumi 500

# 方案 2：调整预期细胞数
--expectcells 5000

# 方案 3：切换识别方法
--calling_method barcoderanks
```

### 场景二：细胞数过高

**症状**：识别的细胞数远超预期，可能包含空液滴

**解决方案**：

```bash
# 方案 1：强制指定细胞数
--forcecells 3000

# 方案 2：提高 UMI 阈值
--minumi 2000
```

### 场景三：低质量样品

**症状**：UMI 分布曲线无明显拐点

**解决方案**：

```bash
# 使用强制细胞数 + 保守阈值
--forcecells 2000 \
--minumi 800
```

---

## 运行流程说明

运行时会显示以下阶段：

```
1. Parsed FASTQ Inputs          # 解析输入文件
2. Chemistry Detection          # 检测试剂版本和暗反应
3. oligo library filtering      # Oligo 文库过滤
4. cDNA library filtering       # cDNA 文库过滤
5. read alignment and UMI counting    # 比对和 UMI 计数
6. bead similarity and merging  # 珠子相似度计算和合并
7. raw gene expression matrix   # 生成原始表达矩阵
8. cell-filtered expression matrix    # 细胞过滤
9. sequencing saturation        # 计算测序饱和度
10. position-sorted BAM file    # 生成排序 BAM（可选）
11. clustering analysis         # 聚类分析
12. analysis report             # 生成报告
```

---

## 运行时间估算

| 细胞数 | 数据量 | 16核/64GB | 32核/128GB |
|--------|--------|-----------|------------|
| 5,000 | 30M reads | ~30 分钟 | ~20 分钟 |
| 10,000 | 100M reads | ~1 小时 | ~40 分钟 |
| 30,000 | 300M reads | ~2.5 小时 | ~1.5 小时 |
| 50,000 | 500M reads | ~4 小时 | ~2.5 小时 |

---

## 输出文件

成功运行后，输出目录结构：

```
sample_name/
├── outs/
│   ├── filter_matrix/          # 过滤后表达矩阵【主要输出】
│   │   ├── barcodes.tsv.gz
│   │   ├── features.tsv.gz
│   │   └── matrix.mtx.gz
│   ├── raw_matrix/             # 原始表达矩阵
│   ├── filter_feature.h5ad     # AnnData 格式
│   ├── analysis/
│   │   ├── cluster.csv         # 聚类结果
│   │   ├── marker.csv          # 差异基因
│   │   └── QC_Cluster.h5ad
│   ├── anno_decon_sorted.bam   # 比对文件
│   ├── anno_decon_sorted.bam.bai
│   ├── metrics_summary.xls     # 统计指标
│   ├── singlecell.csv          # 细胞元数据
│   └── *_scRNA_report.html     # 交互式报告
└── logs/                       # 运行日志
```

> 详细输出文件说明见 [OUTPUT_FILES.md](OUTPUT_FILES.md)

---

## QC 质控阈值

### 测序质量

| 指标 | 推荐 | 可接受 | 需改进 |
|------|:----:|:------:|:------:|
| Valid Barcodes | ≥80% | 70-80% | <70% |
| Valid UMIs | ≥80% | 70-80% | <70% |
| Q30 (Barcode/UMI) | ≥85% | 75-85% | <75% |

### 细胞质量

| 指标 | 推荐 | 可接受 | 需改进 |
|------|:----:|:------:|:------:|
| Fraction Reads in Cells | ≥60% | 30-60% | <30% |
| Median Genes per Cell | ≥1000 | 500-1000 | <500 |
| Sequencing Saturation | ≥40% | 20-40% | <20% |

### 比对质量

| 指标 | 推荐 | 可接受 | 需改进 |
|------|:----:|:------:|:------:|
| Reads Mapped to Genome | ≥80% | 50-80% | <50% |
| Reads Mapped to Transcriptome | ≥50% | 30-50% | <30% |
| Antisense Reads | <10% | 10-30% | >30% |

---

## 常见问题

### 试剂版本检测失败

**错误**：`Could not detect chemistry`

**解决**：手动指定 `--chemistry` 和 `--darkreaction`

### 细胞数为 0

**可能原因**：
1. 参考基因组版本不匹配
2. UMI 阈值过高
3. 数据质量问题

**解决**：
```bash
# 检查比对率
grep "Mapped" sample/logs/pipeline.log

# 降低阈值重试
--minumi 500 --calling_method barcoderanks
```

### 运行中断

**解决**：检查日志文件定位问题
```bash
cat sample/logs/pipeline.log | tail -50
```
