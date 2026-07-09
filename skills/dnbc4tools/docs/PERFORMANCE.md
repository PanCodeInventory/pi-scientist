# 性能优化与资源估算

## 资源需求估算

### 内存需求

| 分析阶段 | 基础需求 | 影响因素 |
|----------|----------|----------|
| 参考基因组构建 | 32-50 GB | 基因组大小 |
| STAR 比对 | 30-40 GB | 线程数 × ~2GB |
| 细胞识别 | 10-20 GB | 细胞数量 |
| 聚类分析 | 5-15 GB | 细胞数量 |

**估算公式**：

```
总内存 ≈ 30GB + (线程数 × 2GB)
```

**推荐配置**：

| 细胞数 | 推荐内存 |
|--------|----------|
| < 10,000 | 64 GB |
| 10,000 - 50,000 | 128 GB |
| > 50,000 | 256 GB |

### 存储空间需求

| 文件类型 | 空间估算 |
|----------|----------|
| 参考基因组（人类） | 30-35 GB |
| 参考基因组（小鼠） | 25-30 GB |
| 输入 FASTQ | 10-100 GB/样品 |
| 临时文件 | 输入数据 × 1.5 |
| BAM 输出 | 输入数据 × 2-3 |
| 矩阵输出 | 100 MB - 2 GB |

**存储优化**：使用 `--no_bam` 可减少 50-70% 输出空间

### CPU 需求

| 配置 | 推荐线程数 |
|------|-----------|
| 8 核 | 6-8 |
| 16 核 | 12-14 |
| 32 核 | 24-28 |
| 64 核 | 48-56 |

> 建议保留 10-20% 核心给系统

---

## 性能优化参数

### 线程设置

```bash
# 推荐：可用核心的 80%
--threads 24  # 32 核服务器
--threads 12  # 16 核服务器
```

### 内存限制（参考构建）

```bash
# 限制 STAR 索引内存使用
dnbc4tools rna mkref \
  --fasta genome.fa \
  --ingtf genes.gtf \
  --limitram 64 \
  --threads 10
```

### 跳过 BAM 生成

```bash
# 节省存储和时间
dnbc4tools rna run \
  --name sample \
  ... \
  --no_bam
```

**效果**：
- 节省 50-70% 输出存储
- 减少 20-30% 运行时间
- 适用于仅需表达矩阵的场景

### 快速测试模式

```bash
# 抽样 100 万 reads 测试参数
dnbc4tools rna run \
  --name test_sample \
  ... \
  --sample_read_pairs 1000000
```

**用途**：
- 验证参数设置
- 快速检查数据质量
- 调试问题

---

## 运行时间估算

### scRNA-seq

| 细胞数 | 数据量 | 8核/32GB | 16核/64GB | 32核/128GB |
|--------|--------|----------|-----------|------------|
| 3,000 | 20M reads | ~40 分钟 | ~25 分钟 | ~15 分钟 |
| 5,000 | 50M reads | ~1 小时 | ~35 分钟 | ~25 分钟 |
| 10,000 | 100M reads | ~2 小时 | ~1 小时 | ~40 分钟 |
| 30,000 | 300M reads | ~5 小时 | ~2.5 小时 | ~1.5 小时 |
| 50,000 | 500M reads | ~8 小时 | ~4 小时 | ~2.5 小时 |

### 参考基因组构建

| 物种 | 10 线程 | 20 线程 |
|------|---------|---------|
| 人类 | 1.5-2 小时 | 1-1.5 小时 |
| 小鼠 | 1-1.5 小时 | 45-60 分钟 |
| 混合 | 2.5-3 小时 | 1.5-2 小时 |

### 实测基准（v3.0，人 GRCh38，每样品 6–7 亿 cDNA reads）

> 以下为真实运行实测数据（DNBelab C4 标准 3' chemistry，GENCODE r44 参考），可作为规划参考。实际值受 reads 数、读长、磁盘 I/O 影响显著。

**参考基因组构建（mkref）**

| 指标 | 实测 |
|------|------|
| 线程数 | 30 |
| 耗时 | ~16 分钟 |
| 峰值内存 | ~36 GB（STAR 在内存中构建后缀数组） |
| 索引大小 | Genome 3.0G + SA 24G + SAindex 1.5G ≈ 28G |

**单样品 rna run（30 线程）**

| 指标 | 实测 |
|------|------|
| 耗时 | 1h39m – 2h04m |
| 磁盘峰值 | ~108 GB（cDNA 过滤中间文件 temp1.read ~53G + temp2.read ~15G + 比对 temp） |
| 比对完成后 | 清理到 ~57 GB |
| BAM 大小 | ~38 GB/样品 |
| STAR 比对内存 | ~30–40 GB |

> ⚠️ **并行磁盘高峰预警**：cDNA 过滤产生的 `temp1.read`/`temp2.read`（合计 ~68 GB/样品）要到 **比对+UMI 计数完成** 才被清理。4 样本并行时 `results/data/` 中间态一度达 **~450 GB**。规划磁盘需按「并行数 × 110 GB + 缓冲」预留；空间紧张时可加 `--no_bam` 降低占用。

**4 样本并行**

| 指标 | 实测 |
|------|------|
| 配置 | 4 × 30 线程 = 120/128 核 |
| 并行总内存 | ~160 GB（4 × ~40 GB STAR） |
| 总耗时 | ≈ 最慢样品（~2h） |
| 总产出 | 46,451 细胞，2.65B reads |

---

## 批量处理优化

### 并行策略

**资源平衡原则**：

```
并行数 × 每任务线程 ≤ 总核心数 × 0.8
并行数 × 40GB ≤ 总内存
```

**示例配置**：

| 服务器 | 并行数 | 每任务线程 | 每任务内存 |
|--------|--------|-----------|-----------|
| 16核/64GB | 1 | 14 | 60GB |
| 32核/128GB | 2 | 14 | 60GB |
| 64核/256GB | 4 | 14 | 60GB |
| 96核/384GB | 6 | 14 | 60GB |

### 批量运行脚本

```bash
#!/bin/bash
# optimized_batch.sh

MAX_PARALLEL=4
THREADS_PER_JOB=14

# 使用 GNU Parallel
ls sample*.sh | parallel -j $MAX_PARALLEL \
  "sed -i 's/--threads [0-9]*/--threads $THREADS_PER_JOB/' {} && bash {}"
```

### 任务调度器集成

**简单队列**：

```bash
#!/bin/bash
# job_queue.sh

MAX_JOBS=4

for script in sample*.sh; do
  # 等待有空闲槽位
  while [ $(jobs -rp | wc -l) -ge $MAX_JOBS ]; do
    sleep 30
  done
  
  echo "$(date): Starting $script"
  bash $script &
done

wait
echo "$(date): All jobs completed"
```

---

## I/O 优化

### 存储建议

| 用途 | 推荐存储类型 |
|------|-------------|
| 软件安装 | SSD/HDD |
| 参考基因组 | SSD（推荐） |
| 输入 FASTQ | SSD（推荐） |
| 输出目录 | SSD（推荐） |
| 临时文件 | SSD（强烈推荐） |

### 避免的配置

- ❌ NFS 作为临时文件目录
- ❌ 网络存储用于高 I/O 操作
- ❌ 机械硬盘用于大规模并行

### 临时目录设置

```bash
# 设置高速临时目录
export TMPDIR=/fast_ssd/tmp
mkdir -p $TMPDIR
```

---

## 监控与调优

### 实时监控

```bash
# CPU 和内存使用
htop

# 磁盘 I/O
iotop

# 特定进程
watch -n 5 "ps aux | grep dnbc4tools"
```

### 日志分析

```bash
# 查看运行时间
grep "Elapsed" sample/logs/pipeline.log

# 查看各阶段耗时
grep -E "Starting|done" sample/logs/pipeline.log
```

### 瓶颈诊断

| 症状 | 可能瓶颈 | 解决方案 |
|------|----------|----------|
| CPU 使用率低 | I/O 瓶颈 | 使用 SSD |
| 内存使用接近上限 | 内存不足 | 减少线程数 |
| 磁盘 I/O 等待高 | 存储慢 | 使用本地 SSD |
| 进程频繁换入换出 | 内存严重不足 | 增加内存或减少并行 |

---

## 资源估算计算器

### 单样品资源估算

```bash
# 输入参数
FASTQ_SIZE_GB=50          # FASTQ 总大小 (GB)
EXPECTED_CELLS=10000      # 预期细胞数
THREADS=16                # 计划使用线程数

# 估算
MEMORY_GB=$((30 + THREADS * 2))
DISK_TEMP_GB=$((FASTQ_SIZE_GB * 2))
DISK_OUTPUT_GB=$((FASTQ_SIZE_GB * 3))  # 含 BAM
DISK_OUTPUT_NOBAM_GB=$((FASTQ_SIZE_GB / 2))  # 不含 BAM

echo "预计内存需求: ${MEMORY_GB} GB"
echo "预计临时空间: ${DISK_TEMP_GB} GB"
echo "预计输出空间（含BAM）: ${DISK_OUTPUT_GB} GB"
echo "预计输出空间（无BAM）: ${DISK_OUTPUT_NOBAM_GB} GB"
```

### 批量分析资源估算

```bash
# 输入参数
NUM_SAMPLES=10
FASTQ_SIZE_PER_SAMPLE=30  # GB
PARALLEL_JOBS=2

# 估算
TOTAL_MEMORY=$((PARALLEL_JOBS * 50))
TOTAL_DISK=$((NUM_SAMPLES * FASTQ_SIZE_PER_SAMPLE * 4))

echo "并行运行 ${PARALLEL_JOBS} 个任务需要: ${TOTAL_MEMORY} GB 内存"
echo "总存储需求: ${TOTAL_DISK} GB"
```
