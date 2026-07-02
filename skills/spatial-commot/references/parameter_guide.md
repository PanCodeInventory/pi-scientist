# COMMOT Parameter Tuning Guide

## The Most Important Parameter: `dis_thr` (Distance Threshold)

`dis_thr` sets the maximum spatial distance at which two cells can signal to each other. Transport plan entries where `distance(i,j) > dis_thr` are set to zero. This is the single most impactful parameter.

### How to Choose

1. **Check your coordinate scale**: `np.ptp(adata.obsm['spatial'], axis=0)` gives the range of coordinates
2. **Know your platform resolution**:
   - 10x Visium spots are ~55µm apart in a hexagonal grid
   - MERFISH/seqFISH cells are typically 5-20µm apart
3. **Biological reasoning**: How far can a secreted ligand diffuse? Paracrine signaling is typically 100-300µm; juxtacrine requires direct contact

### Platform-Specific Recommendations

| Platform | Resolution | dis_thr | Rationale |
|----------|-----------|---------|-----------|
| 10x Visium | ~55µm spots | 200–300 | 3–5 spot diameters; captures paracrine signaling |
| Visium HD | ~2µm bins | 50–100 | Smaller bins allow finer spatial resolution |
| MERFISH | ~10µm cells | 30–75 | Single-cell; 3–7 cell diameters |
| seqFISH+ | ~10µm cells | 30–50 | As tested in the COMMOT paper |
| Slide-seq V2 | ~10µm beads | 30–100 | Tune to tissue density |
| Xenium | ~5µm cells | 20–60 | Subcellular; tighter constraints |
| CosMx | ~5µm cells | 20–60 | Similar to Xenium |

### Per-LR-Pair Distance Thresholds

Some signaling types have different effective ranges. Use a dict to set per-pair thresholds:

```python
dis_thr = {
    ('EGF', 'EGFR'): 100,                  # short-range juxtacrine
    ('TGFB1', 'TGFBR1_TGFBR2'): 300,       # long-range paracrine
    ('VEGFA', 'KDR'): 250,                  # medium-range angiogenic
}
```

### When to Use `cost_type='euc_square'`

Squared Euclidean distance makes long-range transport disproportionately expensive compared to short-range. Use when:
- You want to emphasize local signaling over global patterns
- `dis_thr` is set high but you still want most signaling to be short-range
- You're studying contact-dependent signaling (Cell-Cell Contact type)

---

## OT Solver Parameters

### `cot_eps_p` (Entropy Regularization)

Controls how diffuse the transport plan is. Lower = sharper, higher = more spread out.

| Value | Effect | When to Use |
|-------|--------|-------------|
| 0.01 | Very sharp, most signaling to nearest neighbor | When you want precise, focused signaling |
| 0.05 | Moderately sharp | Single-cell data, MERFISH |
| 0.1 (default) | Balanced | Most datasets |
| 0.2 | Diffuse, signaling to many neighbors | When you get too few interactions with default |
| 0.5 | Very diffuse | Exploratory analysis |

**Interaction with `cot_rho`**: High `eps_p` + high `rho` forces more mass through more connections. Low `eps_p` + low `rho` produces sparse, focused signaling.

### `cot_rho` (Unbalanced Mass Penalty)

Controls how strictly the transport plan must preserve the total expression mass. Higher = more mass must be transported.

| Value | Effect | When to Use |
|-------|--------|-------------|
| 1 | Very relaxed, most mass can stay unmatched | Exploratory, when you want only the strongest signals |
| 5 | Moderate | When default produces too many interactions |
| 10 (default) | Standard | Most datasets |
| 20 | Strict, forces most expression to be transported | When you want comprehensive signaling maps |
| 50 | Very strict | When you suspect the method is missing interactions |

### `cot_weights` (Four-Level COT Weights)

COMMOT solves four coupled OT problems and combines them. The weights control the contribution of each:

| Level | Index | What it models |
|-------|-------|----------------|
| Global | 0 | All ligands → all receptors simultaneously |
| Row-wise | 1 | Each ligand → all its receptors |
| Column-wise | 2 | All ligands → each receptor |
| Block-wise | 3 | Each specific ligand → receptor pair |

**Recommended settings:**
- Default `(0.25, 0.25, 0.25, 0.25)` — balanced, captures competition
- `(1.0, 0, 0, 0)` — global competition only, faster computation
- `(0, 0, 0, 1.0)` — independent pairwise signaling, no competition modeling

### `cot_nitermax` (Max Iterations)

| Dataset Size | Recommended | Notes |
|-------------|-------------|-------|
| <2,000 cells | 10000 (default) | Full convergence |
| 2,000–10,000 | 5000–10000 | Usually converges in 5000 |
| >10,000 | 3000–5000 | Reduce for speed; check convergence |
| Permutation tests | 100–500 | Speed over precision for each permutation |

---

## Smoothing Parameters

Spatial expression smoothing is optional but can help with noisy data.

### When to Smooth

- **Noisy data**: Low UMI counts, high dropout rates → smooth with small bandwidth
- **MERFISH with few genes**: May benefit from smoothing to fill gaps
- **High-quality Visium**: Usually no smoothing needed

### Parameters

| Parameter | Description | Typical Values |
|-----------|-------------|----------------|
| `smooth` | Enable/disable | `True` if data is noisy |
| `smth_eta` | Kernel bandwidth | Visium: 100–200, MERFISH: 20–50 |
| `smth_nu` | Kernel sharpness | 1–3 (higher = sharper kernel) |
| `smth_kernel` | Kernel type | `'exp'` (Gaussian-like) or `'lorentz'` (heavy-tailed) |

**Caution**: Over-smoothing blurs real spatial boundaries. If you see signaling patterns that don't match tissue architecture, reduce `smth_eta`.

---

## Heteromeric Complex Parameters

### `heteromeric_rule`

When L-R pairs involve protein complexes (e.g., `TGFBR1_TGFBR2`):

| Rule | Formula | Effect |
|------|---------|--------|
| `'min'` (default) | min(TGFBR1, TGFBR2) | Conservative: both subunits must be expressed |
| `'ave'` | mean(TGFBR1, TGFBR2) | Permissive: average expression |

**Recommendation**: Use `'min'` by default — it's biologically more accurate (a receptor complex requires all subunits). Use `'ave'` only if you suspect the `'min'` rule is filtering out too many interactions.

### `heteromeric_delimiter`

The character separating subunit names in complex annotations:
- CellChatDB uses `'_'` (default): `TGFBR1_TGFBR2`
- CellPhoneDB uses `'_'` as well
- Custom databases may use `'+'` or `'/'` — set accordingly

---

## Filter Parameters

### `ct.pp.filter_lr_database` Settings

| Parameter | Conservative | Default | Permissive |
|-----------|-------------|---------|------------|
| `min_cell_pct` | 0.10 | 0.05 | 0.01 |
| `min_cell` | 200 | 100 | 20 |

**When to be conservative** (min_cell_pct=0.10):
- Large datasets (>10,000 cells)
- You want only well-established interactions

**When to be permissive** (min_cell_pct=0.01):
- Small datasets (<1,000 cells)
- You want to capture rare interactions
- When studying rare cell populations

---

## Permutation Parameters

### `ct.tl.cluster_communication`

| Parameter | Exploration | Publication |
|-----------|-------------|-------------|
| `n_permutations` | 100 | 1000+ |
| `random_seed` | 42 | 42 (always set for reproducibility) |

### `ct.tl.cluster_communication_spatial_permutation`

| Parameter | Exploration | Publication |
|-----------|-------------|-------------|
| `n_permutations` | 50 | 200+ |
| `perm_type` | `'within_cluster'` | `'within_cluster'` (more rigorous) |
| `cot_nitermax` | 100 | 100 (keep low — many permutations needed) |

---

## `communication_direction` Parameters

| Parameter | Default | Effect of Increasing |
|-----------|---------|---------------------|
| `k` | 5 | Smoother direction field, but may miss fine-grained patterns |
| `k=3` | — | Sharper, more local directions |
| `k=5` | — | Balanced |
| `k=10` | — | Smoother, good for tissue-scale flows |

---

## Decision Tree: Which Parameters to Tune

```
Running COMMOT on new data?
│
├─ Step 1: Set dis_thr based on platform (NON-NEGOTIABLE)
│
├─ Step 2: Run with defaults
│   └─ Too few interactions?
│       ├─ Increase cot_rho (15-20)
│       ├─ Increase cot_eps_p (0.15-0.2)
│       └─ Lower filter min_cell_pct (0.02)
│
├─ Too many weak interactions?
│   ├─ Decrease cot_rho (5)
│   ├─ Decrease cot_eps_p (0.05)
│   └─ Increase filter min_cell_pct (0.10)
│
├─ Computation too slow?
│   ├─ Reduce cot_nitermax (3000-5000)
│   ├─ Filter LR pairs more aggressively
│   └─ Subset to specific pathway
│
└─ Direction vectors noisy?
    ├─ Increase k in communication_direction (8-10)
    ├─ Use 'grid' or 'stream' plot methods
    └─ Enable smoothing (smooth=True, smth_eta=50-100)
```
