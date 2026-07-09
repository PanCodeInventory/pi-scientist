# 输出文件格式说明

## 目录结构

scRNA-seq 分析完成后的输出目录结构：

> ℹ️ `rna run` 会在 `--outdir` 指定目录下再创建一层 `<--name>/` 子目录，即实际路径为 `<outdir>/<name>/outs/`。若 `--outdir` 本身已以样本名结尾，会出现双重嵌套（如 `NK3-1/NK3-1/outs/`）。下游读取路径以实际生成位置为准。

```
<outdir>/
└── <name>/                        # <--name> 指定的样本名
    ├── outs/                           # 主输出目录
│   ├── filter_matrix/              # 过滤后表达矩阵【核心输出】
│   │   ├── barcodes.tsv.gz
│   │   ├── features.tsv.gz
│   │   └── matrix.mtx.gz
│   ├── raw_matrix/                 # 原始表达矩阵
│   │   ├── barcodes.tsv.gz
│   │   ├── features.tsv.gz
│   │   └── matrix.mtx.gz
│   ├── filter_feature.h5ad         # AnnData 格式矩阵
│   ├── analysis/                   # 下游分析结果
│   │   ├── cluster.csv
│   │   ├── marker.csv
│   │   └── QC_Cluster.h5ad
│   ├── anno_decon_sorted.bam       # 比对文件
│   ├── anno_decon_sorted.bam.bai   # BAM 索引
│   ├── metrics_summary.xls         # 统计指标汇总
│   ├── singlecell.csv              # 细胞元数据
│   └── *_scRNA_report.html         # 交互式报告
└── logs/                           # 运行日志
```

---

## 核心输出文件

### filter_matrix/ - 过滤后表达矩阵

**用途**：下游分析的主要输入（Seurat、Scanpy 等）

**格式**：Market Matrix Exchange (MEX) 格式

| 文件 | 说明 |
|------|------|
| `barcodes.tsv.gz` | 细胞 ID 列表，每行一个 |
| `features.tsv.gz` | 基因信息（ID、名称、类型） |
| `matrix.mtx.gz` | 稀疏矩阵（行=基因，列=细胞） |

**读取方式**：

```python
# Python (Scanpy)
import scanpy as sc
adata = sc.read_10x_mtx('/path/to/filter_matrix')
```

```r
# R (Seurat)
library(Seurat)
counts <- Read10X(data.dir = "/path/to/filter_matrix")
```

### filter_feature.h5ad - AnnData 格式

**用途**：Python 生态系统（Scanpy）的标准格式

**读取方式**：

```python
import scanpy as sc
adata = sc.read_h5ad('/path/to/filter_feature.h5ad')
```

### raw_matrix/ - 原始表达矩阵

**用途**：包含所有检测到的 Barcode（含空液滴）

**适用场景**：
- 自定义细胞过滤
- 质控评估
- 环境 RNA 分析

---

## 分析结果文件

### analysis/cluster.csv

**内容**：细胞聚类结果和坐标

| 列 | 说明 |
|----|------|
| Barcode | 细胞 ID |
| Cluster | 聚类编号 |
| UMAP_1 | UMAP 第一维坐标 |
| UMAP_2 | UMAP 第二维坐标 |
| nGene | 检测到的基因数 |
| nUMI | UMI 总数 |

### analysis/marker.csv

**内容**：每个聚类的差异表达基因

| 列 | 说明 |
|----|------|
| cluster | 聚类编号 |
| gene | 基因名称 |
| avg_log2FC | 平均 log2 倍数变化 |
| p_val_adj | 校正后 p 值 |
| pct.1 | 目标聚类中表达比例 |
| pct.2 | 其他聚类中表达比例 |

### analysis/QC_Cluster.h5ad

**内容**：完整的 AnnData 对象，包含：
- 表达矩阵
- 细胞元数据（聚类、QC 指标）
- 降维结果（UMAP）
- 差异基因结果

---

## 比对文件

### anno_decon_sorted.bam

**格式**：BAM（Binary Alignment Map）

**特点**：
- 按基因组坐标排序
- 包含单细胞特有标签

**重要 TAG 字段**：

| TAG | 类型 | 说明 |
|-----|------|------|
| CB | String | 细胞 Barcode（合并后） |
| UB | String | 校正后 UMI |
| GN | String | 基因名称 |
| GX | String | 基因 ID |
| RE | String | 区域类型 (E=外显子, N=内含子, I=基因间) |

**查看方式**：

```bash
# 查看 BAM 头部
samtools view -H anno_decon_sorted.bam

# 查看前几条记录
samtools view anno_decon_sorted.bam | head

# 统计比对信息
samtools flagstat anno_decon_sorted.bam
```

---

## 统计汇总文件

### metrics_summary.xls

**内容**：关键分析指标汇总

> ⚠️ **格式注意**：尽管扩展名为 `.xls`，实际是 **tab 分隔的纯文本**（非真正 Excel 也非 CSV）。解析时需用 `\t` 作为分隔符，而非逗号。

**解析示例**：
```python
import pandas as pd
# 读取（tab 分隔）
df = pd.read_csv('metrics_summary.xls', sep='\t')
# 或 csv 模块
import csv
with open('metrics_summary.xls') as f:
    reader = csv.reader(f, delimiter='\t')
    header = next(reader)
    data = next(reader)
```

**主要指标类别**：

| 类别 | 包含指标 |
|------|----------|
| 基础统计 | 总 reads、有效 Barcode 比例、Q30 |
| 细胞统计 | 细胞数、每细胞 UMI/基因中位数 |
| 比对统计 | 基因组比对率、转录组比对率 |
| 饱和度 | 测序饱和度 |

### singlecell.csv

**内容**：每个细胞的详细 QC 信息

**主要列**：
- 细胞 ID
- UMI 数量
- 基因数量
- 线粒体基因比例
- 是否为有效细胞
- 珠子合并信息

---

## 分析报告

### *_scRNA_report.html

**格式**：交互式 HTML 报告

**包含内容**：
- 样本基本信息
- 测序质量统计
- 细胞识别曲线
- 聚类可视化（UMAP）
- Marker 基因热图
- QC 指标分布

**查看方式**：使用任意浏览器打开，无需网络连接

---

## 文件格式详解

### MEX 格式 (Market Matrix Exchange)

适用于稀疏矩阵存储：

```
%%MatrixMarket matrix coordinate integer general
%
<行数> <列数> <非零元素数>
<行索引> <列索引> <值>
...
```

**优点**：
- 空间效率高（>95% 零值不存储）
- 广泛兼容

### H5AD 格式 (AnnData)

基于 HDF5 的结构化格式：

| 组件 | 维度 | 说明 |
|------|------|------|
| X | cells × genes | 主表达矩阵 |
| obs | cells × features | 细胞元数据 |
| var | genes × features | 基因元数据 |
| obsm | cells × dims | 降维坐标 |
| uns | - | 非结构化数据 |

**优点**：
- 单文件包含所有信息
- Python 生态系统原生支持
- 高效随机访问

---

## 下游分析读取

### Python (Scanpy)

```python
import scanpy as sc

# 方式 1：读取 h5ad
adata = sc.read_h5ad('outs/filter_feature.h5ad')

# 方式 2：读取 MEX
adata = sc.read_10x_mtx('outs/filter_matrix')

# 查看数据
print(adata)
print(adata.obs.head())
```

### R (Seurat)

```r
library(Seurat)

# 读取 MEX 格式
counts <- Read10X(data.dir = "outs/filter_matrix")

# 创建 Seurat 对象
seurat_obj <- CreateSeuratObject(
  counts = counts,
  project = "sample_name",
  min.cells = 3,
  min.features = 200
)
```

---

## 存储空间参考

| 文件 | 典型大小 |
|------|----------|
| filter_matrix/ | 50-500 MB |
| raw_matrix/ | 100 MB - 2 GB |
| filter_feature.h5ad | 50-500 MB |
| anno_decon_sorted.bam | 10-100 GB |
| metrics_summary.xls | < 1 MB |
| singlecell.csv | 1-50 MB |
| HTML 报告 | 1-10 MB |

> 使用 `--no_bam` 可跳过 BAM 生成，节省大量空间
