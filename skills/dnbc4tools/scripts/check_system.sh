#!/bin/bash
# check_system.sh - 系统环境检查脚本
# 用途：检查系统是否满足 dnbc4tools 运行要求

set -e

echo "=========================================="
echo "  dnbc4tools 系统环境检查"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

# 1. 操作系统检查
echo "【1. 操作系统】"
OS=$(uname -s)
if [ "$OS" = "Linux" ]; then
    check_pass "Linux 系统"
    
    # 检查发行版
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "    发行版: $NAME $VERSION"
    fi
else
    check_fail "需要 Linux 系统，当前: $OS"
fi
echo ""

# 2. CPU 检查
echo "【2. CPU】"
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "unknown")
if [ "$CPU_CORES" != "unknown" ]; then
    if [ "$CPU_CORES" -ge 16 ]; then
        check_pass "CPU 核心数: $CPU_CORES (推荐: ≥16)"
    elif [ "$CPU_CORES" -ge 8 ]; then
        check_warn "CPU 核心数: $CPU_CORES (最低要求，推荐: ≥16)"
    else
        check_fail "CPU 核心数: $CPU_CORES (最低要求: 8)"
    fi
fi
echo ""

# 3. 内存检查
echo "【3. 内存】"
if [ -f /proc/meminfo ]; then
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1024 / 1024))
    
    if [ "$TOTAL_MEM_GB" -ge 128 ]; then
        check_pass "内存: ${TOTAL_MEM_GB} GB (推荐: ≥128GB)"
    elif [ "$TOTAL_MEM_GB" -ge 50 ]; then
        check_warn "内存: ${TOTAL_MEM_GB} GB (最低要求，推荐: ≥128GB)"
    else
        check_fail "内存: ${TOTAL_MEM_GB} GB (最低要求: 50GB)"
    fi
else
    check_warn "无法检测内存大小"
fi
echo ""

# 4. 磁盘空间检查
echo "【4. 磁盘空间】"
DISK_AVAIL=$(df -BG . 2>/dev/null | tail -1 | awk '{print $4}' | sed 's/G//')
if [ -n "$DISK_AVAIL" ]; then
    if [ "$DISK_AVAIL" -ge 500 ]; then
        check_pass "可用空间: ${DISK_AVAIL} GB"
    elif [ "$DISK_AVAIL" -ge 100 ]; then
        check_warn "可用空间: ${DISK_AVAIL} GB (建议 ≥500GB)"
    else
        check_fail "可用空间: ${DISK_AVAIL} GB (建议 ≥100GB)"
    fi
fi
echo ""

# 5. GLIBC 版本检查
echo "【5. GLIBC 版本】"
if command -v ldd &> /dev/null; then
    GLIBC_VERSION=$(ldd --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [ -n "$GLIBC_VERSION" ]; then
        MAJOR=$(echo $GLIBC_VERSION | cut -d. -f1)
        MINOR=$(echo $GLIBC_VERSION | cut -d. -f2)
        if [ "$MAJOR" -ge 2 ] && [ "$MINOR" -ge 17 ]; then
            check_pass "GLIBC 版本: $GLIBC_VERSION (需要: ≥2.17)"
        else
            check_fail "GLIBC 版本: $GLIBC_VERSION (需要: ≥2.17)"
        fi
    fi
else
    check_warn "无法检测 GLIBC 版本"
fi
echo ""

# 6. Docker 检查（可选）
echo "【6. Docker（可选）】"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
    check_pass "Docker 已安装: $DOCKER_VERSION"
else
    check_warn "Docker 未安装（可选，用于容器化部署）"
fi
echo ""

# 7. dnbc4tools 检查
echo "【7. dnbc4tools】"
if command -v dnbc4tools &> /dev/null; then
    DNBC_VERSION=$(dnbc4tools --version 2>/dev/null | head -1)
    check_pass "dnbc4tools 已安装: $DNBC_VERSION"
elif [ -f "./dnbc4tools" ]; then
    DNBC_VERSION=$(./dnbc4tools --version 2>/dev/null | head -1)
    check_pass "dnbc4tools 在当前目录: $DNBC_VERSION"
else
    check_warn "dnbc4tools 未找到（请确保已安装）"
fi
echo ""

echo "=========================================="
echo "  检查完成"
echo "=========================================="
