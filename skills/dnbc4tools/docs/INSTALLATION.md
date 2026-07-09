# 安装指南

## 方法一：tar.gz 解压安装（推荐）

dnbc4tools v3.0 采用自包含方式分发，解压即可使用，无需额外安装依赖。

### 1. 下载

```bash
# 使用 wget
wget -O dnbc4tools-3.0.tar.gz \
  "ftp://ftp2.cngb.org/pub/CNSA/data7/CNP0008672/Single_Cell/CSE0000574/dnbc4tools-3.0.tar.gz"

# 或使用 curl
curl -o dnbc4tools-3.0.tar.gz \
  "ftp://ftp2.cngb.org/pub/CNSA/data7/CNP0008672/Single_Cell/CSE0000574/dnbc4tools-3.0.tar.gz"
```

**文件信息**：
| 项目 | 值 |
|------|-----|
| 文件名 | dnbc4tools-3.0.tar.gz |
| 大小 | 513MB |
| MD5 | d9a26a8848b4d703dbffb99670f82837 |

### 2. 安装

```bash
# 解压到指定目录（示例：/opt/software）
cd /opt/software
tar -xzvf dnbc4tools-3.0.tar.gz

# 验证 MD5（可选）
md5sum dnbc4tools-3.0.tar.gz
# 应输出: d9a26a8848b4d703dbffb99670f82837
```

### 3. 目录结构

解压后的目录结构：

```
dnbc4tools3.0/
├── dnbc4tools          # 主程序（可执行文件）
├── external/           # 外部依赖（STAR, samtools 等）
├── lib/                # Python 库文件
├── misc/               # 杂项文件（白名单等）
└── sourceC4.bash       # 环境配置脚本（可选）
```

### 4. 验证安装

```bash
cd /opt/software/dnbc4tools3.0

# 测试基本功能
./dnbc4tools --version
./dnbc4tools --help

# 测试各模块
./dnbc4tools rna --help
./dnbc4tools atac --help
./dnbc4tools vdj --help
```

### 5. 环境配置（可选）

**方式一：添加到 PATH**

```bash
# 添加到 ~/.bashrc 或 ~/.bash_profile
echo 'export PATH=/opt/software/dnbc4tools3.0:$PATH' >> ~/.bashrc
source ~/.bashrc

# 验证
dnbc4tools --version
```

**方式二：创建别名**

```bash
# 添加到 ~/.bashrc
echo 'alias dnbc4tools="/opt/software/dnbc4tools3.0/dnbc4tools"' >> ~/.bashrc
source ~/.bashrc
```

**方式三：创建符号链接**

```bash
sudo ln -s /opt/software/dnbc4tools3.0/dnbc4tools /usr/local/bin/dnbc4tools
```

---

## 方法二：Docker（容器化部署）

适用于需要隔离环境或云端部署的场景。

### 拉取镜像

```bash
docker pull dnbelabc4/dnbc4tools:latest

# 指定版本
docker pull dnbelabc4/dnbc4tools:3.0
```

### 验证安装

```bash
docker run --rm dnbelabc4/dnbc4tools dnbc4tools --version
```

> 详细 Docker 使用说明见 [DOCKER.md](DOCKER.md)

---

## 系统要求

### 硬件要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| 处理器 | x86-64 兼容 | 多核服务器 CPU |
| 内存 | 50GB RAM | 128GB+ RAM |
| CPU 核心 | 8 核 | 16+ 核 |
| 存储 | HDD（充足空间） | SSD（推荐） |

### 软件要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Linux 64-bit |
| 推荐发行版 | Ubuntu 20.04+, CentOS 7+ |
| GLIBC | ≥ 2.17 |

### 存储空间估算

| 用途 | 空间需求 |
|------|----------|
| 软件本身 | ~2GB（解压后） |
| 参考基因组（人类） | 30-50GB |
| 参考基因组（小鼠） | 25-40GB |
| 单样品分析临时文件 | 输入数据 × 2-3倍 |

---

## 依赖说明

### v3.0（当前版本）

**无需额外安装任何依赖**。软件包内已包含：
- STAR（RNA 比对）
- Chromap（ATAC 比对）
- Samtools
- Python 3 + Scanpy 等库

### 旧版本（v2.x）

如需使用旧版本，可能需要手动安装：
- Python 3.7+
- 部分 R/Python 包

> 建议使用最新的 v3.0 版本以获得最佳兼容性

---

## 常见安装问题

### 问题 1：下载速度慢

**解决方案**：
```bash
# 使用断点续传
wget -c -O dnbc4tools-3.0.tar.gz "ftp://..."

# 或使用下载工具
axel -n 10 "ftp://ftp2.cngb.org/pub/CNSA/data7/CNP0008672/Single_Cell/CSE0000574/dnbc4tools-3.0.tar.gz"
```

### 问题 2：权限不足

**解决方案**：
```bash
chmod +x /opt/software/dnbc4tools3.0/dnbc4tools
```

### 问题 3：GLIBC 版本过低

**错误信息**：`GLIBC_2.xx not found`

**解决方案**：
- 升级操作系统到更新版本
- 或使用 Docker 运行

### 问题 4：解压失败

**解决方案**：
```bash
# 检查文件完整性
md5sum dnbc4tools-3.0.tar.gz

# 如 MD5 不匹配，重新下载
rm dnbc4tools-3.0.tar.gz
wget -O dnbc4tools-3.0.tar.gz "ftp://..."
```

### 问题 5：Command not found

**解决方案**：
```bash
# 使用完整路径
/opt/software/dnbc4tools3.0/dnbc4tools --version

# 或配置环境变量（见上文）
```

---

## 版本历史

| 版本 | 发布日期 | 主要更新 |
|------|----------|----------|
| v3.0 | 2025-12 | 自动清理临时文件、性能优化 |
| v2.1 | 2024 | Scanpy 替代 Seurat |
| v2.0 | 2023 | Docker/Singularity 支持 |

> 旧版本下载见官方文档的 [Previous Installation Guide](https://github.com/MGI-tech-bioinformatics/DNBelab_C_Series_HT_scRNA-analysis-software/blob/version3.0/doc/installation_previous.md)
