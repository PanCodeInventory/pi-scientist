# Docker 使用指南

## 概述

dnbc4tools 提供官方 Docker 镜像，适用于：
- 无 root 权限的环境
- 云端部署
- 保证环境一致性
- 快速部署

---

## 镜像信息

| 项目 | 值 |
|------|-----|
| 镜像名 | `dnbelabc4/dnbc4tools` |
| Docker Hub | https://hub.docker.com/r/dnbelabc4/dnbc4tools |
| 最新版本 | `latest` (v3.0) |
| 镜像大小 | ~2 GB |

---

## 基础使用

### 拉取镜像

```bash
# 拉取最新版本
docker pull dnbelabc4/dnbc4tools:latest

# 拉取指定版本
docker pull dnbelabc4/dnbc4tools:3.0
```

### 验证安装

```bash
docker run --rm dnbelabc4/dnbc4tools dnbc4tools --version
docker run --rm dnbelabc4/dnbc4tools dnbc4tools --help
```

### 交互模式

```bash
# 进入容器 shell
docker run -it --rm \
  -v /host/data:/data \
  dnbelabc4/dnbc4tools \
  /bin/bash

# 在容器内执行命令
dnbc4tools rna --help
```

---

## 运行分析

### 目录挂载说明

| 容器路径 | 宿主机路径 | 用途 |
|----------|-----------|------|
| `/data` | 数据目录 | FASTQ 文件 |
| `/reference` | 参考目录 | 基因组索引 |
| `/output` | 输出目录 | 分析结果 |

### 构建参考基因组

```bash
docker run --rm \
  -v /host/ref_files:/input \
  -v /host/database:/output \
  dnbelabc4/dnbc4tools \
  dnbc4tools rna mkref \
    --fasta /input/genome.fa \
    --ingtf /input/genes.gtf \
    --genomeDir /output/GRCh38 \
    --species Homo_sapiens \
    --threads 10
```

### 运行 scRNA-seq 分析

```bash
docker run --rm \
  -v /host/fastq:/data \
  -v /host/database:/reference \
  -v /host/results:/output \
  dnbelabc4/dnbc4tools \
  dnbc4tools rna run \
    --name sample1 \
    --cDNAfastq1 /data/sample_cDNA_R1.fq.gz \
    --cDNAfastq2 /data/sample_cDNA_R2.fq.gz \
    --oligofastq1 /data/sample_oligo_R1.fq.gz \
    --oligofastq2 /data/sample_oligo_R2.fq.gz \
    --genomeDir /reference/GRCh38 \
    --outdir /output \
    --threads 16
```

### 使用 --fastqs 目录模式

```bash
docker run --rm \
  -v /host/fastq_dir:/data \
  -v /host/database:/reference \
  -v /host/results:/output \
  dnbelabc4/dnbc4tools \
  dnbc4tools rna run \
    --name sample1 \
    --fastqs /data \
    --genomeDir /reference/GRCh38 \
    --outdir /output \
    --threads 16
```

---

## 资源限制

### 限制 CPU 和内存

```bash
docker run --rm \
  --cpus=16 \
  --memory=64g \
  -v /host/data:/data \
  -v /host/database:/reference \
  -v /host/results:/output \
  dnbelabc4/dnbc4tools \
  dnbc4tools rna run \
    --name sample1 \
    --fastqs /data \
    --genomeDir /reference/GRCh38 \
    --outdir /output \
    --threads 16
```

### 资源建议

| 分析类型 | 推荐 CPU | 推荐内存 |
|----------|----------|----------|
| 参考构建 | 8-16 | 50GB |
| RNA 分析 | 16-32 | 64GB |
| ATAC 分析 | 16-32 | 64GB |

---

## 批量分析

### 批量运行脚本

```bash
#!/bin/bash
# docker_batch.sh

DOCKER_IMAGE="dnbelabc4/dnbc4tools:latest"
REF_DIR="/host/database/GRCh38"
OUTPUT_BASE="/host/results"

for sample_dir in /host/samples/*/; do
  sample_name=$(basename $sample_dir)
  
  docker run --rm \
    --cpus=16 \
    --memory=64g \
    -v ${sample_dir}:/data \
    -v ${REF_DIR}:/reference \
    -v ${OUTPUT_BASE}/${sample_name}:/output \
    ${DOCKER_IMAGE} \
    dnbc4tools rna run \
      --name ${sample_name} \
      --fastqs /data \
      --genomeDir /reference \
      --outdir /output \
      --threads 16
done
```

### 并行运行（使用 GNU Parallel）

```bash
#!/bin/bash
# docker_parallel.sh

export DOCKER_IMAGE="dnbelabc4/dnbc4tools:latest"
export REF_DIR="/host/database/GRCh38"
export OUTPUT_BASE="/host/results"

run_sample() {
  sample_dir=$1
  sample_name=$(basename $sample_dir)
  
  docker run --rm \
    --cpus=8 \
    --memory=48g \
    -v ${sample_dir}:/data \
    -v ${REF_DIR}:/reference \
    -v ${OUTPUT_BASE}/${sample_name}:/output \
    ${DOCKER_IMAGE} \
    dnbc4tools rna run \
      --name ${sample_name} \
      --fastqs /data \
      --genomeDir /reference \
      --outdir /output \
      --threads 8
}

export -f run_sample

# 并行运行 2 个容器
ls -d /host/samples/*/ | parallel -j 2 run_sample {}
```

---

## 后台运行

### 使用 -d 参数

```bash
# 后台运行
docker run -d \
  --name sample1_analysis \
  -v /host/data:/data \
  -v /host/database:/reference \
  -v /host/results:/output \
  dnbelabc4/dnbc4tools \
  dnbc4tools rna run \
    --name sample1 \
    --fastqs /data \
    --genomeDir /reference \
    --outdir /output \
    --threads 16

# 查看状态
docker ps

# 查看日志
docker logs -f sample1_analysis

# 停止容器
docker stop sample1_analysis
```

---

## 常见问题

### 权限问题

**问题**：输出文件属于 root 用户

**解决**：指定用户 ID

```bash
docker run --rm \
  --user $(id -u):$(id -g) \
  -v /host/data:/data \
  ...
```

### 路径问题

**问题**：容器内找不到文件

**检查**：
```bash
# 验证挂载
docker run --rm \
  -v /host/data:/data \
  dnbelabc4/dnbc4tools \
  ls -la /data
```

### 内存不足

**问题**：容器被 OOM 杀死

**解决**：
1. 增加 `--memory` 限制
2. 减少 `--threads` 参数
3. 使用 `--no_bam` 减少内存使用

### 磁盘空间

**问题**：Docker 存储空间不足

**解决**：
```bash
# 清理无用镜像和容器
docker system prune -a

# 检查 Docker 使用空间
docker system df
```

---

## 镜像管理

### 查看本地镜像

```bash
docker images | grep dnbc4tools
```

### 更新镜像

```bash
docker pull dnbelabc4/dnbc4tools:latest
```

### 删除旧镜像

```bash
docker rmi dnbelabc4/dnbc4tools:old_version
```

---

## Docker Compose（可选）

对于复杂的多样品分析，可以使用 Docker Compose：

```yaml
# docker-compose.yml
version: '3'
services:
  sample1:
    image: dnbelabc4/dnbc4tools:latest
    volumes:
      - /host/samples/sample1:/data
      - /host/database:/reference
      - /host/results/sample1:/output
    command: >
      dnbc4tools rna run
        --name sample1
        --fastqs /data
        --genomeDir /reference
        --outdir /output
        --threads 16
    deploy:
      resources:
        limits:
          cpus: '16'
          memory: 64G

  sample2:
    image: dnbelabc4/dnbc4tools:latest
    volumes:
      - /host/samples/sample2:/data
      - /host/database:/reference
      - /host/results/sample2:/output
    command: >
      dnbc4tools rna run
        --name sample2
        --fastqs /data
        --genomeDir /reference
        --outdir /output
        --threads 16
    deploy:
      resources:
        limits:
          cpus: '16'
          memory: 64G
```

运行：
```bash
docker-compose up -d
docker-compose logs -f
```
