# 问题排查指南

## 快速诊断流程

```
1. 检查错误信息 → 查看日志
2. 确认输入文件 → 路径、格式、完整性
3. 验证参考基因组 → 版本匹配
4. 检查资源 → 内存、磁盘、权限
5. 尝试解决方案 → 见下文具体问题
```

---

## 安装问题

### Command not found

**错误**：`dnbc4tools: command not found`

**解决**：
```bash
# 方案 1：使用完整路径
/opt/software/dnbc4tools3.0/dnbc4tools --version

# 方案 2：添加到 PATH
export PATH=/opt/software/dnbc4tools3.0:$PATH

# 方案 3：创建别名
alias dnbc4tools='/opt/software/dnbc4tools3.0/dnbc4tools'
```

### Permission denied

**错误**：`Permission denied`

**解决**：
```bash
chmod +x /opt/software/dnbc4tools3.0/dnbc4tools
```

### GLIBC version error

**错误**：`GLIBC_2.xx not found`

**解决**：
- 升级操作系统
- 或使用 Docker 运行

### sourceC4.bash 与 `set -u` 冲突

**错误**：自写脚本 `source sourceC4.bash` 时报 `_CONDA_PYTHON_SYSCONFIGDATA_NAME: 未绑定的变量` 并立即退出

**原因**：`sourceC4.bash` 内部引用了若干未定义的环境变量（如 `_CONDA_PYTHON_SYSCONFIGDATA_NAME`），在 bash `set -u`（nounset）模式下会触发“未绑定变量”错误并退出。

**解决**：调用 dnbc4tools 的脚本不要用 `-u`，或在 source 前临时关闭：
```bash
set -eo pipefail          # ✅ 用 -e 不用 -u
# 或者：
set +u
source /opt/software/dnbc4tools3.0/sourceC4.bash
set -u
```

---

## 参考基因组问题

### GTF 解析失败

**错误**：`GTF parsing failed` 或 `Invalid GTF format`

**诊断**：
```bash
# 检查 GTF 格式
head -20 genes.gtf

# 检查必要字段
grep -c "gene_id" genes.gtf
grep -c "transcript_id" genes.gtf
```

**解决**：
```bash
# 使用内置工具修复
dnbc4tools tools mkgtf \
  --action check \
  --ingtf genes.gtf \
  --output genes.fixed.gtf
```

### 染色体名称不匹配

**错误**：`Chromosome names do not match between FASTA and GTF`

**诊断**：
```bash
# 检查 FASTA 染色体名称
grep "^>" genome.fa | head -5

# 检查 GTF 染色体名称
cut -f1 genes.gtf | sort -u | head -5
```

**解决**：确保 FASTA 和 GTF 来自相同来源（如都来自 GENCODE 或 Ensembl）

### 内存不足（mkref）

**错误**：`Out of memory during STAR index generation`

**解决**：
```bash
# 限制内存并减少线程
dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.gtf \
  --limitram 50 \
  --threads 8
```

### 线粒体检测失败

**警告**：`Could not detect mitochondrial chromosome`

**解决**：
```bash
# 手动指定
dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.gtf \
  --chrM MT  # 或 chrM，取决于您的参考
```

---

## 分析流程问题

### 试剂版本检测失败

**错误**：`Could not detect chemistry` 或 `Chemistry detection failed`

**解决**：
```bash
# 手动指定试剂版本和暗反应
dnbc4tools rna run \
  --name sample \
  ... \
  --chemistry scRNAv3HT \
  --darkreaction R1,R1R2
```

**常见组合**：

| 试剂版本 | 典型暗反应设置 |
|----------|----------------|
| scRNAv1HT | R1,R1R2 |
| scRNAv2HT | R1,R1R2 |
| scRNAv3HT | R1,R1R2 |
| scRNA5Pv1 | R1,R1R2 |

### 细胞数为 0

**错误**：`Estimated number of cells: 0`

**诊断**：
```bash
# 检查比对率
grep -i "mapped" sample/logs/pipeline.log
```

**可能原因与解决**：

| 原因 | 解决方案 |
|------|----------|
| 参考基因组不匹配 | 使用正确物种的参考 |
| UMI 阈值过高 | `--minumi 500` |
| 数据质量问题 | 检查原始数据质量 |
| 试剂版本错误 | 手动指定 `--chemistry` |

### 细胞数过少

**症状**：细胞数远低于预期

**解决**：
```bash
# 方案 1：降低 UMI 阈值
--minumi 500

# 方案 2：调整预期细胞数
--expectcells 5000

# 方案 3：切换识别方法
--calling_method barcoderanks
```

### 细胞数过多

**症状**：细胞数远超预期，可能包含空液滴

**解决**：
```bash
# 方案 1：强制指定细胞数
--forcecells 5000

# 方案 2：提高 UMI 阈值
--minumi 2000
```

### 比对率过低

**症状**：Reads mapped to genome < 50%

**可能原因**：
- 物种不匹配
- 样品污染
- 数据质量问题

**解决**：
```bash
# 检查数据物种
# 使用 BLAST 或类似工具检查少量 reads

# 检查污染
# 使用 FastQC 检查 adapter 含量
```

---

## 资源问题

### 内存溢出（分析）

**错误**：`Out of memory` 或进程被 killed

**解决**：
```bash
# 减少线程数
--threads 8

# 增加系统 swap
sudo fallocate -l 32G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 磁盘空间不足

**错误**：`No space left on device`

**解决**：
```bash
# 检查空间
df -h

# 清理临时文件
rm -rf /tmp/dnbc4tools_*

# 使用 --no_bam 减少输出
dnbc4tools rna run ... --no_bam

# 指定临时目录到大容量磁盘
export TMPDIR=/large_disk/tmp
```

### 进程意外终止

**症状**：分析中途停止，无明显错误

**诊断**：
```bash
# 检查系统日志
dmesg | tail -50

# 检查是否 OOM
grep -i "out of memory" /var/log/messages
```

---

## 文件问题

### FASTQ 文件问题

**错误**：`Error reading FASTQ file`

**诊断**：
```bash
# 检查文件完整性
gzip -t sample_R1.fq.gz && echo "OK" || echo "Corrupted"

# 检查格式
zcat sample_R1.fq.gz | head -8
```

### 输入路径问题

**错误**：`File not found`

**检查**：
```bash
# 验证路径
ls -la /path/to/file.fq.gz

# 检查权限
stat /path/to/file.fq.gz
```

---

## 日志分析

### 查看日志

```bash
# 查看完整日志
cat sample/logs/pipeline.log

# 查看最后 100 行
tail -100 sample/logs/pipeline.log

# 查找错误
grep -i "error" sample/logs/pipeline.log
grep -i "failed" sample/logs/pipeline.log

# 查看各阶段耗时
grep -E "Starting|done" sample/logs/pipeline.log
```

### 常见日志信息

| 日志信息 | 含义 |
|----------|------|
| `Chemistry Detection` | 正在检测试剂版本 |
| `oligo library filtering` | 处理 Oligo 数据 |
| `cDNA library filtering` | 处理 cDNA 数据 |
| `read alignment` | 比对中 |
| `bead similarity` | 珠子合并 |
| `cell-filtered` | 细胞过滤 |
| `Analysis Finished` | 分析完成 |

---

## 获取帮助

### 收集诊断信息

在寻求帮助前，请收集：

```bash
# 软件版本
dnbc4tools --version

# 运行命令
# 您使用的完整命令

# 错误日志
cat sample/logs/pipeline.log

# 系统信息
uname -a
free -h
df -h
```

### 资源链接

| 资源 | 链接 |
|------|------|
| GitHub Issues | https://github.com/MGI-tech-bioinformatics/DNBelab_C_Series_HT_scRNA-analysis-software/issues |
| 官方文档 | https://mgi-tech-bioinformatics.github.io/DNBelab_C_Series_HT_scRNA-analysis-software/ |

### 提交 Issue 模板

```markdown
## 问题描述
[简要描述问题]

## 软件版本
[dnbc4tools --version 输出]

## 运行命令
```
[您的完整命令]
```

## 错误信息
```
[相关日志或错误信息]
```

## 系统环境
- OS: [例如 Ubuntu 20.04]
- 内存: [例如 64GB]
- CPU: [例如 16 核]
```
