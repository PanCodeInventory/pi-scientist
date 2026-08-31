# 多样品批量处理

## 概述

`dnbc4tools rna multi` 命令用于批量生成多个样品的分析脚本，简化大规模样品的分析工作。

---

## 配置文件格式

### 创建 sample_sheet.tsv

使用 **Tab 分隔** 的三列格式：

```tsv
SampleName	cDNA_Path	Oligo_Path
sample1	/data/s1_cDNA_R1.fq.gz;/data/s1_cDNA_R2.fq.gz	/data/s1_oligo_R1.fq.gz;/data/s1_oligo_R2.fq.gz
sample2	/data/s2_cDNA_R1.fq.gz;/data/s2_cDNA_R2.fq.gz	/data/s2_oligo_R1.fq.gz;/data/s2_oligo_R2.fq.gz
sample3	/data/s3_cDNA_R1.fq.gz;/data/s3_cDNA_R2.fq.gz	/data/s3_oligo_R1.fq.gz;/data/s3_oligo_R2.fq.gz
```

### 格式规则

| 分隔符 | 用途 | 示例 |
|--------|------|------|
| **Tab** | 列分隔 | `sample1\t/path/R1;/path/R2\t...` |
| **分号 `;`** | R1 和 R2 分隔 | `R1.fq.gz;R2.fq.gz` |
| **逗号 `,`** | 多 lane/多文件 | `L1_R1.fq.gz,L2_R1.fq.gz` |

### 复杂示例

```tsv
# 多 lane 数据
sample_multi_lane	/data/L1_R1.fq.gz,/data/L2_R1.fq.gz;/data/L1_R2.fq.gz,/data/L2_R2.fq.gz	/data/oligo_R1.fq.gz;/data/oligo_R2.fq.gz

# 多个 oligo 文件
sample_multi_oligo	/data/cDNA_R1.fq.gz;/data/cDNA_R2.fq.gz	/data/oligo1_R1.fq.gz,/data/oligo2_R1.fq.gz;/data/oligo1_R2.fq.gz,/data/oligo2_R2.fq.gz
```

---

## 生成批量脚本

### 基础命令

```bash
dnbc4tools rna multi \
  --list sample_sheet.tsv \
  --genomeDir /database/GRCh38 \
  --threads 16
```

### 带输出目录

```bash
dnbc4tools rna multi \
  --list sample_sheet.tsv \
  --genomeDir /database/GRCh38 \
  --outdir /results \
  --threads 16
```

### 添加额外参数

```bash
dnbc4tools rna multi \
  --list sample_sheet.tsv \
  --genomeDir /database/GRCh38 \
  --threads 16 \
  --no_bam  # 所有样品都跳过 BAM 生成
```

### 输出结果

```
sample1.sh
sample2.sh
sample3.sh
```

**生成的脚本示例** (`sample1.sh`)：

```bash
/opt/software/dnbc4tools3.0/dnbc4tools rna run \
  --name sample1 \
  --cDNAfastq1 /data/s1_cDNA_R1.fq.gz \
  --cDNAfastq2 /data/s1_cDNA_R2.fq.gz \
  --oligofastq1 /data/s1_oligo_R1.fq.gz \
  --oligofastq2 /data/s1_oligo_R2.fq.gz \
  --genomeDir /database/GRCh38 \
  --threads 16
```

---

## 运行策略

### 策略一：顺序执行

最简单的方式，适合资源有限的环境：

```bash
for script in sample*.sh; do
  echo "Running $script..."
  bash $script
  echo "$script completed."
done
```

### 策略二：并行执行（GNU Parallel）

需要安装 `parallel`：

```bash
# 安装（Ubuntu）
sudo apt install parallel

# 同时运行 2 个样品
ls sample*.sh | parallel -j 2 bash {}

# 同时运行 4 个样品
ls sample*.sh | parallel -j 4 bash {}
```

### 策略三：后台执行

使用 `nohup`：

```bash
# 后台运行单个样品
nohup bash sample1.sh > sample1.log 2>&1 &

# 批量后台运行
for script in sample*.sh; do
  name=${script%.sh}
  nohup bash $script > ${name}.log 2>&1 &
done

# 查看运行状态
jobs -l
```

使用 `screen`：

```bash
# 创建新会话
screen -S sample1
bash sample1.sh

# 分离会话：Ctrl+A, D

# 重新连接
screen -r sample1
```

### 策略四：任务队列（推荐用于大批量）

```bash
#!/bin/bash
# batch_runner.sh

MAX_JOBS=4
running=0

for script in sample*.sh; do
  while [ $running -ge $MAX_JOBS ]; do
    sleep 60
    running=$(jobs -rp | wc -l)
  done
  
  echo "Starting $script"
  bash $script &
  running=$((running + 1))
done

wait
echo "All jobs completed."
```

### 策略五：tmux 并行（推荐，防 SSH/agent 超时中断）

为每个样品开一个独立 tmux 会话并行运行，主脚本轮询等待全部完成。相比 nohup，tmux 可随时 `tmux attach` 查看实时输出，且不被 SSH 断开或上层调度超时中断。

```bash
#!/bin/bash
# parallel_tmux.sh — 每样品一个 tmux 会话并行
DNB_DIR=/opt/software/dnbc4tools3.0
GENOME_DIR=/database/GRCh38
THREADS=30                      # 每样品线程数；并行数 × THREADS ≤ 总核心
SAMPLES=(sample1 sample2 sample3 sample4)

for S in "${SAMPLES[@]}"; do
  cat > run_${S}.sh << EOF
#!/usr/bin/env bash
set -eo pipefail                # ⚠️ 勿用 -u（sourceC4.bash 引用未定义变量会冲突）
source "$DNB_DIR/sourceC4.bash"
"$DNB_DIR/dnbc4tools" rna run \\
  --fastqs /data/fastq/$S \\
  --genomeDir "$GENOME_DIR" \\
  --name "$S" \\
  --outdir /results/$S \\
  --threads $THREADS
echo "EXIT_CODE=\$?"
EOF
  chmod +x run_${S}.sh
  tmux new-session -d -s "rna_${S}" "bash run_${S}.sh 2>&1 | tee ${S}.log"
done

# 轮询等待全部完成
PENDING=("${SAMPLES[@]/#/rna_}")
while [ ${#PENDING[@]} -gt 0 ]; do
  NEW=()
  for sess in "${PENDING[@]}"; do
    tmux has-session -t "$sess" 2>/dev/null && NEW+=("$sess")
  done
  PENDING=("${NEW[@]}")
  [ ${#PENDING[@]} -gt 0 ] && sleep 30
done
echo "All samples finished."
```

**监控**：
```bash
tmux ls                          # 查看会话
tmux attach -t rna_sample1       # 实时查看某样品（Ctrl+B D 退出 attach）
tail -f sample1.log              # 或看日志
```

---

## 资源分配建议

### 单机运行

| 服务器配置 | 推荐并行数 | 每任务线程 |
|------------|-----------|-----------|
| 16核/64GB | 1 | 16 |
| 32核/128GB | 2 | 16 |
| 64核/256GB | 4 | 16 |
| 96核/384GB | 6 | 16 |

### 内存估算

```
总内存需求 ≈ 并行数 × 40GB
```

### 存储估算

每个样品：
- 输入数据：10-50GB
- 临时文件：输入 × 1.5
- 输出结果：5-30GB（含 BAM）/ 2-10GB（无 BAM）

---

## 监控运行状态

### 查看运行进度

```bash
# 查看正在运行的任务
ps aux | grep dnbc4tools

# 查看日志最后几行
tail -f sample1/logs/pipeline.log
```

### 批量检查完成状态

```bash
#!/bin/bash
# check_status.sh

for dir in sample*/; do
  name=${dir%/}
  if [ -f "${dir}outs/${name}_scRNA_report.html" ]; then
    echo "✓ $name: Completed"
  elif [ -d "${dir}logs" ]; then
    echo "⟳ $name: Running"
  else
    echo "✗ $name: Not started"
  fi
done
```

### 统计结果汇总

```bash
#!/bin/bash
# summary.sh

echo -e "Sample\tCells\tMedianGenes\tMedianUMI"
for dir in sample*/; do
  name=${dir%/}
  if [ -f "${dir}outs/metrics_summary.xls" ]; then
    # 提取关键指标
    cells=$(grep "Estimated" ${dir}outs/metrics_summary.xls | cut -f2)
    genes=$(grep "Median genes" ${dir}outs/metrics_summary.xls | cut -f2)
    umi=$(grep "Median UMI" ${dir}outs/metrics_summary.xls | cut -f2)
    echo -e "$name\t$cells\t$genes\t$umi"
  fi
done
```

---

## 常见问题

### 配置文件格式错误

**症状**：脚本生成失败或参数错误

**检查**：
```bash
# 检查分隔符
cat -A sample_sheet.tsv | head -3
# Tab 应显示为 ^I
```

### 路径包含空格

**解决**：使用引号包裹路径，或避免路径中有空格

### 部分样品失败

**解决**：
```bash
# 检查失败样品日志
cat failed_sample/logs/pipeline.log | tail -100

# 单独重新运行
bash failed_sample.sh
```

---

## 模板文件

模板文件位于 [`resources/templates/sample_sheet.tsv`](../resources/templates/sample_sheet.tsv)。
