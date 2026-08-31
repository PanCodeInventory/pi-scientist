# TaskN: [Short Title]

> Created: YYYY-MM-DD | Status: READY | Progress: 0/N steps
> Analysis parent directory: `/absolute/path/chosen-by-user`
> Plan file: `Task/TaskN-YYYYMMDD.md`
> Analysis modules: `01_Preprocessing/`, `02_Clustering/`, `03_DEG/`

## Goal
One sentence summary of what this task accomplishes.

---

## Module Layout

| Module | Purpose | Main outputs |
|--------|---------|--------------|
| `01_Preprocessing/` | QC and normalization | cleaned h5ad, QC plots/tables |
| `02_Clustering/` | PCA/neighbors/UMAP/clustering | clustered h5ad, UMAP plots |
| `03_DEG/` | marker/DEG analysis | DEG tables and plots |

---

## Todolist

> 每条 Todolist 项与下方 Task Details 中的条目一一对应，编号必须一致。

- [ ] **P01**: [Title] — 一句话概述
- [ ] **P02**: [Title] — 一句话概述
- [ ] **P03**: [Title] — 一句话概述
- [ ] **PNN**: [Title]

---

## Main-Agent Completion Reminder (Not a Subagent Step)

When all Todolist items above are marked `[x]`:
1. Stop dispatching worker/reviewer subagents for this plan.
2. The **main agent** summarizes completion to the user: what was done, key results, and any caveats.
3. Tell the user that once the results are confirmed and finalized, they can run `/generate-report`. That command synthesizes the analysis results with the session discussion.
4. Do not git commit on your own.

---

## Task Details

### P01: QC and preprocessing

**Module**: `01_Preprocessing/`

**What to do**: 本步骤的目标。

**Script**: `01_Preprocessing/scripts/stages/01_qc_preprocess.py`

**Config**: `01_Preprocessing/scripts/config/qc_preprocess.yaml`

**Input**:
- `data/raw/sample.h5ad`

**Output**:
- `01_Preprocessing/results/data/01_after_qc.h5ad`
- `01_Preprocessing/results/tables/qc_summary.tsv`
- `01_Preprocessing/results/plots/qc_metrics.png`
- `01_Preprocessing/results/plots/qc_metrics.pdf`

**Skill**: `scanpy-prep`

**Long-running**: no

**Estimated time**: <1min

**Method notes**:
- 使用 `sc.pp.filter_cells`，min_genes=200
- 过滤线粒体比例 >20% 的细胞
- 保存 normalized + raw counts

---

### P02: Clustering

**Module**: `02_Clustering/`

**What to do**: ...

**Script**: `02_Clustering/scripts/stages/01_clustering.py`

**Config**: `02_Clustering/scripts/config/clustering.yaml`

**Input**:
- `01_Preprocessing/results/data/01_after_qc.h5ad` (来自 P01)

**Output**:
- `02_Clustering/results/data/02_clustered.h5ad`
- `02_Clustering/results/plots/umap_clusters.png`
- `02_Clustering/results/plots/umap_clusters.pdf`
- `02_Clustering/results/tables/cluster_summary.tsv`

**Skill**: `scanpy-cluster`

**Long-running**: no

**Estimated time**: 2-5min

**Method notes**:
- HVG selection: n_top_genes=2000
- PCA → neighbors → Leiden (resolution=0.5) → UMAP
- Find marker genes with Wilcoxon test

---

### PNN: ...

（每条 Todolist 项必须有对应编号的 Task Details 条目，不可遗漏）

---

## Methodology

### Packages and Versions
| Package | Version | Citation/DOI | Purpose |
|---------|---------|-------------|---------|
| scanpy | 1.10.x | Wolf et al., 2018 | scRNA-seq analysis |

### Parameter Justification
| Parameter | Value | Default | Rationale |
|-----------|-------|---------|-----------|
| n_top_genes | 2000 | 1000 | Dataset has 50k cells |

### Assumptions
- Data has been pre-QC'd by CellRanger
- Batch effects are minimal

### Alternative Approaches Considered
- **Alt 1**: Description — why not chosen

---

## File Manifest

```text
Task/
└── TaskN-YYYYMMDD.md
01_Preprocessing/
├── scripts/
│   ├── config/qc_preprocess.yaml
│   ├── stages/01_qc_preprocess.py
│   └── utils/
└── results/
    ├── data/01_after_qc.h5ad
    ├── tables/qc_summary.tsv
    └── plots/qc_metrics.png / .pdf
02_Clustering/
└── ...

# Post-completion deliverable, generated on-demand by the main agent when the user runs /generate-report:
Report/
└── TaskN-具体内容-YYYYMMDD.html
```

## Success Criteria
- [ ] All scripts run without errors
- [ ] All expected analysis output files exist under the declared module directories
- [ ] No generated analysis outputs are written under `Task/`
- [ ] Results are categorized by file type under `results/data/`, `results/tables/`, and `results/plots/`
- [ ] Figures are publication quality
- [ ] Statistical tests are appropriate and correctly reported
