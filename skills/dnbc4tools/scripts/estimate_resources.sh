#!/bin/bash
# estimate_resources.sh - 资源需求估算脚本
# 用途：根据输入数据估算分析所需资源

set -e

echo "=========================================="
echo "  dnbc4tools 资源需求估算"
echo "=========================================="
echo ""

# 默认值
FASTQ_SIZE_GB=${1:-0}
EXPECTED_CELLS=${2:-10000}
THREADS=${3:-16}
INCLUDE_BAM=${4:-"yes"}

# 使用说明
usage() {
    echo "用法: $0 <FASTQ大小(GB)> [预期细胞数] [线程数] [是否生成BAM]"
    echo ""
    echo "参数:"
    echo "  FASTQ大小(GB)    - 输入 FASTQ 文件总大小（必填）"
    echo "  预期细胞数       - 预期细胞数量（默认: 10000）"
    echo "  线程数           - 计划使用的 CPU 线程（默认: 16）"
    echo "  是否生成BAM      - yes/no（默认: yes）"
    echo ""
    echo "示例:"
    echo "  $0 50                   # 50GB FASTQ，使用默认值"
    echo "  $0 100 30000 32 no      # 100GB FASTQ，30000细胞，32线程，不生成BAM"
    exit 1
}

# 检查参数
if [ "$FASTQ_SIZE_GB" -eq 0 ] 2>/dev/null || [ -z "$FASTQ_SIZE_GB" ]; then
    usage
fi

# 计算资源需求
echo "【输入参数】"
echo "  FASTQ 大小:     $FASTQ_SIZE_GB GB"
echo "  预期细胞数:     $EXPECTED_CELLS"
echo "  CPU 线程数:     $THREADS"
echo "  生成 BAM:       $INCLUDE_BAM"
echo ""

# 内存估算
BASE_MEMORY=30
THREAD_MEMORY=$((THREADS * 2))
TOTAL_MEMORY=$((BASE_MEMORY + THREAD_MEMORY))

# 存储估算
TEMP_STORAGE=$((FASTQ_SIZE_GB * 2))
if [ "$INCLUDE_BAM" = "yes" ]; then
    OUTPUT_STORAGE=$((FASTQ_SIZE_GB * 3))
else
    OUTPUT_STORAGE=$((FASTQ_SIZE_GB / 2 + 1))
fi
TOTAL_STORAGE=$((FASTQ_SIZE_GB + TEMP_STORAGE + OUTPUT_STORAGE))

# 时间估算（基于经验公式）
if [ "$THREADS" -ge 32 ]; then
    TIME_FACTOR=1
elif [ "$THREADS" -ge 16 ]; then
    TIME_FACTOR=2
else
    TIME_FACTOR=4
fi

BASE_TIME=$((FASTQ_SIZE_GB / 50 + 1))  # 每50GB约1小时
ESTIMATED_TIME=$((BASE_TIME * TIME_FACTOR))

echo "【资源需求估算】"
echo ""
echo "📊 内存需求"
echo "  基础需求:       $BASE_MEMORY GB"
echo "  线程需求:       $THREAD_MEMORY GB ($THREADS 线程 × 2GB)"
echo "  ────────────────────────"
echo "  推荐总内存:     $TOTAL_MEMORY GB"
echo ""

echo "💾 存储需求"
echo "  输入数据:       $FASTQ_SIZE_GB GB"
echo "  临时文件:       $TEMP_STORAGE GB"
echo "  输出结果:       $OUTPUT_STORAGE GB"
echo "  ────────────────────────"
echo "  推荐总空间:     $TOTAL_STORAGE GB"
echo ""

echo "⏱️ 时间估算"
echo "  预计运行时间:   约 $ESTIMATED_TIME 小时"
echo ""

echo "【推荐配置】"
echo ""
if [ "$TOTAL_MEMORY" -le 64 ]; then
    echo "  服务器配置:     16核/64GB RAM"
elif [ "$TOTAL_MEMORY" -le 128 ]; then
    echo "  服务器配置:     32核/128GB RAM"
else
    echo "  服务器配置:     64核/256GB RAM"
fi
echo ""

echo "【运行命令示例】"
echo ""
echo "dnbc4tools rna run \\"
echo "  --name sample \\"
echo "  --cDNAfastq1 sample_cDNA_R1.fq.gz \\"
echo "  --cDNAfastq2 sample_cDNA_R2.fq.gz \\"
echo "  --oligofastq1 sample_oligo_R1.fq.gz \\"
echo "  --oligofastq2 sample_oligo_R2.fq.gz \\"
echo "  --genomeDir /path/to/reference \\"
echo "  --threads $THREADS"
if [ "$INCLUDE_BAM" = "no" ]; then
    echo "  --no_bam"
fi
echo ""
