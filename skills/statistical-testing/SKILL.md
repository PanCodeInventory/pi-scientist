---
name: statistical-testing
description: 'Guidance for choosing and reporting statistical tests in bioinformatics. Triggered by: statistical test, p-value, DEG, differential expression, enrichment, significance, ANOVA, t-test, Wilcoxon, 多重比较, 统计检验, 差异分析, 显著性. Provides decision trees for test selection, multiple testing correction, and reporting standards.'
---

# Statistical Testing — 检验选择与报告指南

## Overview
为生信分析中的统计检验提供选择决策树、参数指导和报告规范。确保检验方法有据可依，报告完整。

## Decision Trees

### 差异表达分析
| 场景 | 推荐方法 | R/Python 实现 | 引用 |
|------|---------|---------------|------|
| Bulk RNA-seq (counts) | DESeq2 (Wald test) | `DESeq2::DESeq()` | Love et al., 2014 |
| Bulk RNA-seq (小样本) | edgeR (exact test) | `edgeR::exactTest()` | Robinson et al., 2010 |
| Single-cell (default) | Wilcoxon rank-sum | `sc.tl.rank_genes_groups(method='wilcoxon')` | 截面数据的标准选择 |
| Single-cell (大样本 >5000) | t-test | `sc.tl.rank_genes_groups(method='t-test')` | 更快，大样本下等价 |
| Single-cell (binary outcome) | Logistic regression | `sc.tl.rank_genes_groups(method='logreg')` | 适用于条件分类 |

### 多重比较校正
| 方法 | 适用场景 | 何时用 |
|------|---------|--------|
| Benjamini-Hochberg (FDR) | 默认选择 | 绝大多数生信分析 |
| Bonferroni | 需要严格控制 Family-wise error rate | GWAS、少数检验 |
| Holm-Bonferroni | 比 Bonferroni 更强但仍然保守 | 中等数量检验 |
| q-value (Storey) | 大规模检验 | 基因组-wide 研究 |

注意：DESeq2 和 edgeR 自带校正，不要重复校正。

### 组间比较
| 数据特征 | 推荐方法 | 前提假设 |
|---------|---------|----------|
| 正态分布 + 2组 | Student's t-test | 正态性、方差齐性 |
| 非正态 + 2组 | Mann-Whitney U (Wilcoxon) | 无分布假设 |
| 正态 + >2组 | One-way ANOVA + Tukey HSD | 正态性、方差齐性 |
| 非正态 + >2组 | Kruskal-Wallis + Dunn's test | 无分布假设 |
| 配对样本 | Paired t-test / Wilcoxon signed-rank | 配对设计 |
| 重复测量 | Repeated measures ANOVA | 球形假设 |

### 富集分析
| 场景 | 推荐方法 | 工具 |
|------|---------|------|
| Over-representation (DEG list) | Fisher's exact test | gseapy, clusterProfiler |
| Ranked gene list | GSEA (pre-ranked) | gseapy, clusterProfiler |
| 单细胞通路活性 | ssGSEA / AUCell | decoupler, pySCENIC |

### 相关性分析
| 数据特征 | 推荐方法 |
|---------|----------|
| 线性关系 + 正态 | Pearson |
| 单调关系 + 非正态 | Spearman |
| 等级变量 | Kendall's tau |

## Reporting Standards

每个统计报告必须包含：
1. **检验方法**: 使用了什么检验
2. **样本量**: 每组 N = ?
3. **效应量**: Cohen's d / log2FC / η² 等
4. **p值**: 精确值或 p < threshold
5. **校正方法**: BH-FDR / Bonferroni 等
6. **校正后 p 值**: padj / qvalue
7. **置信区间**: 95% CI

### 模板句式
```
[基因/特征] 在 [条件A] vs [条件B] 中显著差异表达 (log2FC = X.XX, p = 0.XXX, padj = 0.XXX, Wilcoxon rank-sum test, n_A = XX, n_B = XX).
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 对非正态数据用参数检验 | 先检验正态性 (Shapiro-Wilk)，非正态用非参 |
| 不做多重比较校正 | 始终报告 padj，标注校正方法 |
| 只看 p 值不看效应量 | 小 p 值 + 小效应量可能无生物学意义 |
| P-hacking (反复子集化) | 预先定义分析方案，避免事后反复调整 |
| 混淆统计显著与生物意义 | 统计显著 ≠ 生物学重要，报告效应量 |
| DESeq2 结果再校正 | DESeq2 padj 已经是 BH 校正后的，不要重复 |
| 忽略样本量对 power 的影响 | 事前做 power analysis |

## Quick Reference

### 检验正态性
```python
from scipy import stats
stats.shapiro(data)  # n < 5000
stats.normaltest(data)  # n >= 20
# 或可视化
import matplotlib.pyplot as plt
stats.probplot(data, plot=plt)
```

### 计算效应量
```python
# Cohen's d
import numpy as np
def cohen_d(g1, g2):
    n1, n2 = len(g1), len(g2)
    pooled_std = np.sqrt(((n1-1)*np.std(g1,ddof=1)**2 + (n2-1)*np.std(g2,ddof=1)**2) / (n1+n2-2))
    return (np.mean(g1) - np.mean(g2)) / pooled_std

# log2 fold change (生信常用)
log2fc = np.log2(np.mean(group_treated) / np.mean(group_control))
```

### 多重比较校正
```python
from statsmodels.stats.multitest import multipletests
rejected, padj, _, _ = multipletests(pvals, method='fdr_bh')  # Benjamini-Hochberg
rejected, padj, _, _ = multipletests(pvals, method='bonferroni')  # Bonferroni
```
