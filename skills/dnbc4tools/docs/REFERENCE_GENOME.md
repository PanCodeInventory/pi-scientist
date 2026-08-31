# 参考基因组构建

## 概述

在运行 `dnbc4tools rna run` 或 `dnbc4tools atac run` 之前，必须先构建参考基因组索引。此步骤使用注释文件（GTF）和基因组序列（FASTA）创建比对索引。

## 所需文件

| 文件类型 | 格式 | 说明 |
|----------|------|------|
| 基因组序列 | FASTA | 物种完整基因组序列（建议使用 primary assembly） |
| 基因注释 | GTF | 基因结构注释文件（必须与 FASTA 版本匹配） |

### 推荐数据来源

- **Ensembl**: https://www.ensembl.org/
- **GENCODE**: https://www.gencodegenes.org/

> ⚠️ 不支持 GFF 格式，请使用 GTF 格式

---

## 步骤一：GTF 文件处理（推荐）

GTF 文件通常包含多种基因类型。过滤保留关键基因类型可以：
- 减少基因重叠导致的比对歧义
- 提高蛋白编码基因的 UMI 计数

### 1.1 查看基因类型统计

```bash
dnbc4tools tools mkgtf \
  --action stat \
  --ingtf genes.gtf \
  --output gtf_stats.txt \
  --type gene_type
```

输出示例：
```
Type                Count
protein_coding      20006
lncRNA              17755
processed_pseudogene 10159
miRNA               1879
...
```

### 1.2 过滤基因类型

```bash
# 使用默认过滤规则（推荐）
dnbc4tools tools mkgtf \
  --ingtf genes.gtf \
  --output genes.filter.gtf \
  --type gene_type
```

**默认保留的基因类型**：
- protein_coding
- lncRNA / lincRNA
- antisense
- IG_*_gene（免疫球蛋白基因）
- TR_*_gene（T细胞受体基因）

### 1.3 自定义过滤

```bash
# 仅保留蛋白编码基因
dnbc4tools tools mkgtf \
  --ingtf genes.gtf \
  --output genes.filter.gtf \
  --type gene_type \
  --include protein_coding
```

### 1.4 修复不完整的 GTF

如果 GTF 文件缺少必要字段：

```bash
dnbc4tools tools mkgtf \
  --action check \
  --ingtf genes.gtf \
  --output genes.fixed.gtf
```

---

## 步骤二：构建索引

### 人类参考基因组 (GRCh38)

```bash
# 下载参考文件
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_32/GRCh38.primary_assembly.genome.fa.gz
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_32/gencode.v32.primary_assembly.annotation.gtf.gz

# 解压
gzip -d GRCh38.primary_assembly.genome.fa.gz
gzip -d gencode.v32.primary_assembly.annotation.gtf.gz

# 过滤 GTF
dnbc4tools tools mkgtf \
  --ingtf gencode.v32.primary_assembly.annotation.gtf \
  --output genes.filter.gtf \
  --type gene_type

# 构建索引
dnbc4tools rna mkref \
  --fasta GRCh38.primary_assembly.genome.fa \
  --ingtf genes.filter.gtf \
  --species Homo_sapiens \
  --threads 10
```

### 小鼠参考基因组 (GRCm38)

```bash
# 下载参考文件
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M23/GRCm38.primary_assembly.genome.fa.gz
wget http://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M23/gencode.vM23.primary_assembly.annotation.gtf.gz

# 解压
gzip -d GRCm38.primary_assembly.genome.fa.gz
gzip -d gencode.vM23.primary_assembly.annotation.gtf.gz

# 过滤 GTF
dnbc4tools tools mkgtf \
  --ingtf gencode.vM23.primary_assembly.annotation.gtf \
  --output genes.filter.gtf \
  --type gene_type

# 构建索引
dnbc4tools rna mkref \
  --fasta GRCm38.primary_assembly.genome.fa \
  --ingtf genes.filter.gtf \
  --species Mus_musculus \
  --threads 10
```

### 混合物种参考（人+鼠）

用于 PDX 模型或物种混合实验：

```bash
dnbc4tools rna mkref \
  --fasta GRCh38.primary_assembly.genome.fa,GRCm38.primary_assembly.genome.fa \
  --ingtf hg38/genes.filter.gtf,mm10/genes.filter.gtf \
  --species hg38,mm10 \
  --threads 10
```

> ⚠️ 多物种时，确保 FASTA、GTF 和 species 参数顺序一致

---

## mkref 参数说明

### 必需参数

| 参数 | 说明 |
|------|------|
| `--fasta` | 基因组 FASTA 文件（多物种用逗号分隔） |
| `--ingtf` | GTF 注释文件（多物种用逗号分隔） |

### 可选参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--genomeDir` | 当前目录 | 输出目录 |
| `--species` | undefined | 物种名称（影响细胞注释） |
| `--threads` | 10 | CPU 线程数 |
| `--chrM` | auto | 线粒体染色体名称 |
| `--limitram` | - | 内存限制（GB） |
| `--noindex` | false | 仅生成配置文件，跳过索引 |

### 支持细胞注释的物种

| 物种名称 | 别名 |
|----------|------|
| Homo_sapiens | hg38 |
| Mus_musculus | mm10 |

> 其他物种可以运行分析，但不支持自动细胞类型注释

---

## 输出目录结构

> v3.0 实际输出为 **嵌套结构**：在 `--genomeDir` 下先建一层 `<species>/` 子目录，所有文件都在其中。

```
genomeDir/
└── <species>/              # 如 Homo_sapiens / Mus_musculus
    ├── ref.json            # mkref 实际写入位置
    ├── cmd.txt             # 构建命令记录
    ├── fasta/
    │   ├── genome.fa       # 处理后的基因组序列
    │   └── genome.fa.fai   # 序列索引
    ├── genes/
    │   └── genes.gtf       # 处理后的注释文件
    └── star/
        ├── SA              # STAR 索引
        ├── SAindex
        ├── Genome
        ├── chrLength.txt
        ├── chrName.txt
        ├── mtgene.list     # 线粒体基因列表
        └── ...
```

### ref.json 内容示例

```json
{
    "chrmt": "chrM",
    "genome": "/database/Homo_sapiens/fasta/genome.fa",
    "genomeDir": "/database/Homo_sapiens/star",
    "gtf": "/database/Homo_sapiens/genes/genes.gtf",
    "species": "Homo_sapiens",
    "version": "dnbc4tools 3.0"
}
```

---

## 资源需求

### 时间估算

| 物种 | 线程数 | 预计时间 |
|------|--------|----------|
| 人类 | 10 | 1-2 小时 |
| 小鼠 | 10 | 1-1.5 小时 |
| 混合 | 10 | 2-3 小时 |

### 内存需求

| 阶段 | 内存需求 |
|------|----------|
| GTF 处理 | 2-4 GB |
| STAR 索引构建 | 32-50 GB |

### 存储需求

| 物种 | 索引大小 |
|------|----------|
| 人类 | 30-35 GB |
| 小鼠 | 25-30 GB |
| 混合 | 55-65 GB |

---

## 常见问题

### GTF 格式错误

**错误**：`GTF parsing failed`

**解决**：
```bash
# 检查并修复 GTF
dnbc4tools tools mkgtf --action check --ingtf genes.gtf --output genes.fixed.gtf
```

### 内存不足

**错误**：`Out of memory during STAR index generation`

**解决**：
```bash
# 限制内存使用
dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.gtf \
  --limitram 50 \
  --threads 8
```

### 染色体名称不匹配

**错误**：`Chromosome names do not match`

**解决**：确保 FASTA 和 GTF 文件来自相同来源和版本

### 线粒体识别失败

**警告**：`Could not detect mitochondrial chromosome`

**解决**：
```bash
# 手动指定线粒体名称
dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.gtf \
  --chrM MT  # 或 chrM
```

---

## scATAC-seq 参考构建

ATAC 分析使用 Chromap 索引：

```bash
dnbc4tools atac mkref \
  --fasta GRCh38.primary_assembly.genome.fa \
  --ingtf genes.filter.gtf \
  --species Homo_sapiens \
  --prefix chr
```

> `--prefix chr` 用于染色体前缀标准化
