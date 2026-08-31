# Quick Reference — 统计检验代码

## 检验正态性
```python
from scipy import stats
stats.shapiro(data)  # n < 5000
stats.normaltest(data)  # n >= 20
# 或可视化
import matplotlib.pyplot as plt
stats.probplot(data, plot=plt)
```

## 计算效应量
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

## 多重比较校正
```python
from statsmodels.stats.multitest import multipletests
rejected, padj, _, _ = multipletests(pvals, method='fdr_bh')  # Benjamini-Hochberg
rejected, padj, _, _ = multipletests(pvals, method='bonferroni')  # Bonferroni
```
