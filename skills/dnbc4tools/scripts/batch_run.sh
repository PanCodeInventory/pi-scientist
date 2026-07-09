#!/bin/bash
# batch_run.sh - 批量运行模板脚本
# 用途：并行运行多个样品的分析

set -e

#===============================================
# 配置区域 - 请根据实际情况修改
#===============================================

# dnbc4tools 路径
DNBC4TOOLS="/opt/software/dnbc4tools3.0/dnbc4tools"

# 参考基因组目录
GENOME_DIR="/database/GRCh38"

# 输出根目录
OUTPUT_BASE="/results"

# 每个任务的线程数
THREADS_PER_JOB=16

# 最大并行任务数
MAX_PARALLEL=2

# 是否生成 BAM 文件（设为 "no" 可节省空间）
GENERATE_BAM="yes"

# 日志目录
LOG_DIR="./batch_logs"

#===============================================
# 样品配置 - 添加您的样品
#===============================================

# 样品数组：格式为 "样品名|cDNA_R1|cDNA_R2|Oligo_R1|Oligo_R2"
SAMPLES=(
    "sample1|/data/s1_cDNA_R1.fq.gz|/data/s1_cDNA_R2.fq.gz|/data/s1_oligo_R1.fq.gz|/data/s1_oligo_R2.fq.gz"
    "sample2|/data/s2_cDNA_R1.fq.gz|/data/s2_cDNA_R2.fq.gz|/data/s2_oligo_R1.fq.gz|/data/s2_oligo_R2.fq.gz"
    # 添加更多样品...
)

#===============================================
# 脚本逻辑 - 无需修改
#===============================================

# 创建日志目录
mkdir -p "$LOG_DIR"

# 运行单个样品的函数
run_sample() {
    local sample_info="$1"
    
    # 解析样品信息
    IFS='|' read -r name cdna_r1 cdna_r2 oligo_r1 oligo_r2 <<< "$sample_info"
    
    local output_dir="${OUTPUT_BASE}/${name}"
    local log_file="${LOG_DIR}/${name}.log"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始处理: $name"
    
    # 构建命令
    local cmd="$DNBC4TOOLS rna run \
        --name $name \
        --cDNAfastq1 $cdna_r1 \
        --cDNAfastq2 $cdna_r2 \
        --oligofastq1 $oligo_r1 \
        --oligofastq2 $oligo_r2 \
        --genomeDir $GENOME_DIR \
        --outdir $output_dir \
        --threads $THREADS_PER_JOB"
    
    # 添加 --no_bam 参数
    if [ "$GENERATE_BAM" = "no" ]; then
        cmd="$cmd --no_bam"
    fi
    
    # 运行分析
    if eval "$cmd" > "$log_file" 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ 完成: $name"
        return 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ 失败: $name (查看日志: $log_file)"
        return 1
    fi
}

# 导出函数供 parallel 使用
export -f run_sample
export DNBC4TOOLS GENOME_DIR OUTPUT_BASE THREADS_PER_JOB GENERATE_BAM LOG_DIR

# 主逻辑
echo "=========================================="
echo "  dnbc4tools 批量分析"
echo "=========================================="
echo ""
echo "配置信息:"
echo "  样品数量:     ${#SAMPLES[@]}"
echo "  并行数:       $MAX_PARALLEL"
echo "  每任务线程:   $THREADS_PER_JOB"
echo "  参考基因组:   $GENOME_DIR"
echo "  输出目录:     $OUTPUT_BASE"
echo "  生成 BAM:     $GENERATE_BAM"
echo ""
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# 检查是否安装了 parallel
if command -v parallel &> /dev/null; then
    # 使用 GNU Parallel 并行运行
    printf '%s\n' "${SAMPLES[@]}" | parallel -j "$MAX_PARALLEL" run_sample {}
else
    # 简单的并行实现
    running=0
    for sample in "${SAMPLES[@]}"; do
        while [ $running -ge $MAX_PARALLEL ]; do
            sleep 30
            running=$(jobs -rp | wc -l)
        done
        
        run_sample "$sample" &
        running=$((running + 1))
    done
    wait
fi

echo ""
echo "=========================================="
echo "  批量分析完成"
echo "  结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 生成汇总报告
echo ""
echo "【结果汇总】"
for sample in "${SAMPLES[@]}"; do
    IFS='|' read -r name _ <<< "$sample"
    output_dir="${OUTPUT_BASE}/${name}"
    
    if [ -f "${output_dir}/outs/${name}_scRNA_report.html" ]; then
        echo "  ✓ $name: 成功"
    elif [ -d "${output_dir}/logs" ]; then
        echo "  ⚠ $name: 可能运行中或失败"
    else
        echo "  ✗ $name: 失败"
    fi
done
