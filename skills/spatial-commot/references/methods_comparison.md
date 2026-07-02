# COMMOT vs Other CCC Methods

## Method Comparison Matrix

| Feature | COMMOT | CellChat | CellPhoneDB | Squidpy ligrec | LIANA+ |
|---------|--------|----------|-------------|----------------|--------|
| **Core Method** | Collective Optimal Transport | Law of mass action + permutation | Mean expression + permutation | Permutation (CellPhoneDB-like) | Rank aggregation |
| **Spatial Awareness** | ✅ Native (distance constraint) | ❌ | ❌ | ✅ Spatial neighbors | ⚠️ Wraps spatial methods |
| **Multi-species Competition** | ✅ COT solves all LR pairs simultaneously | ❌ Pairwise | ❌ Pairwise | ❌ Pairwise | ⚠️ Per method |
| **Direction Vectors** | ✅ Unique strength | ❌ | ❌ | ❌ | ❌ |
| **Communication-DEGs** | ✅ Built-in (tradeSeq) | ❌ | ❌ | ❌ | ❌ |
| **Communication Impact** | ✅ Partial corr + tree-based | ❌ | ❌ | ❌ | ❌ |
| **LR Databases** | 2 built-in (CellChatDB, CellPhoneDB) | CellChatDB (~2,000) | CellPhoneDB (~1,000) | OmniPath (~14,000) | **30+ databases** |
| **Custom LR Database** | ✅ DataFrame input | ❌ R package | ❌ R/Python | ✅ Via interactions param | ✅ Via resource |
| **Heteromeric Complexes** | ✅ min/ave rules | ✅ Built-in | ✅ Built-in | ✅ Via database | ✅ Via wrapped methods |
| **Language** | Python | R | Python/R | Python | Python |
| **Scalability** | Moderate (OT is O(n²×k)) | Fast | Fast | Fast | Fast |
| **Cluster-level p-values** | ✅ Label + spatial permutation | ✅ Permutation | ✅ Permutation | ❌ | ✅ Via rank aggregation |
| **Citation** | Cang et al., Nat Methods 2023 | Jin et al., Nat Commun 2021 | Efremova et al., Nat Protoc 2020 | Palla et al., Nat Methods 2022 | Dimitrov et al., Nat Commun 2022 |

---

## When to Choose COMMOT

### ✅ COMMOT is the best choice when:

1. **You have spatial transcriptomics data** with coordinates — COMMOT's distance constraint ensures signaling is spatially plausible
2. **You need signaling direction** — vector field plots are unique to COMMOT and reveal tissue-level signaling organization
3. **Ligand-receptor competition matters** — the COT framework naturally handles multiple ligands competing for the same receptor
4. **You want to link signaling to gene expression** — built-in `communication_impact` and `communication_deg_detection` are powerful downstream tools
5. **You're studying tissue architecture** — stream plots and direction fields reveal signaling organization across tissue

### ❌ Consider alternatives when:

1. **Non-spatial scRNA-seq** — Use CellChat or CellPhoneDB; spatial constraint is irrelevant without coordinates
2. **Need many L-R databases** — COMMOT only bundles 2 (CellChatDB + CellPhoneDB). LIANA+ offers 30+ databases. For a broader database, use Squidpy ligrec with OmniPath
3. **Quick exploration** — COMMOT's OT solver is slower than CellChat/CellPhoneDB's permutation approach. For quick screening, Squidpy ligrec is faster
4. **No Python environment** — CellChat is R-based and has richer pathway visualization
5. **Consensus across methods** — LIANA+ aggregates results from multiple CCC methods for robustness

---

## Technical Differences

### How COMMOT Differs from Permutation-Based Methods

**Permutation methods** (CellChat, CellPhoneDB, Squidpy ligrec):
1. For each LR pair: compare observed mean expression in cluster pairs vs. null distribution from shuffled labels
2. P-value from permutation test
3. No spatial constraint — cells on opposite sides of tissue can "communicate"
4. Each LR pair tested independently — no competition modeling

**COMMOT (Optimal Transport)**:
1. For all LR pairs simultaneously: find optimal transport plan P minimizing cost subject to spatial constraint
2. P[i,j] = amount of signaling from cell i to cell j
3. Spatial constraint: P[i,j] = 0 if distance(i,j) > dis_thr
4. Competition: multiple ligands compete for receptor "mass" through the COT formulation
5. Scores are continuous (transport mass), not binary (significant/not)

### What "Collective" Means

The "Collective" in COT means all LR pairs are solved together, not independently:

1. **Global COT** (weight[0]): All ligands collectively transported to all receptors — captures global competition
2. **Row-wise COT** (weight[1]): For each ligand, solve OT to all receptors — which receptor "wins" this ligand
3. **Column-wise COT** (weight[2]): For each receptor, solve OT from all ligands — which ligand "feeds" this receptor
4. **Block-wise COT** (weight[3]): Independent per-pair OT — baseline pairwise signaling

The final signaling matrix is the weighted average of all four levels. This is why COMMOT can capture competition effects that permutation methods miss.

### Unbalanced Optimal Transport

COMMOT uses **unbalanced** OT (not balanced), meaning the total ligand expression doesn't have to equal total receptor expression. This is biologically realistic — a ligand can be expressed without a nearby receptor, and vice versa. The `cot_rho` parameter controls the penalty for unbalanced mass.

---

## Combined Analysis Strategies

### Strategy 1: COMMOT + Squidpy ligrec (Spatial CCC Validation)
Run both methods and compare results:
- COMMOT for direction analysis and communication-dependent genes
- Squidpy ligrec for validation with the broader OmniPath database
- Interactions found by both methods are high-confidence

### Strategy 2: COMMOT + CellChat (Spatial + Pathway)
- COMMOT for spatial signaling inference
- CellChat for pathway-level role analysis (incoming/outgoing communication patterns)
- CellChat's pathway summarization complements COMMOT's direction analysis

### Strategy 3: COMMOT + LIANA+ (Spatial + Consensus)
- LIANA+ consensus ranking across multiple methods as initial screening
- COMMOT for detailed spatial analysis of top-ranked interactions
- Best of both: broad discovery + spatial rigor

---

## Performance Comparison

| Dataset | Cells | LR Pairs | COMMOT Runtime | CellChat Runtime | Squidpy ligrec |
|---------|-------|----------|---------------|-----------------|----------------|
| Visium (mouse brain) | 3,355 | 50 | ~2 min | ~30 sec | ~1 min |
| MERFISH (mouse cortex) | 6,000 | 100 | ~10 min | N/A (no spatial) | ~3 min |
| seqFISH+ (embryo) | 8,000 | 200 | ~30 min | N/A | ~8 min |
| Large Visium | 15,000 | 300 | ~2 hr | ~5 min | ~15 min |

**Note**: COMMOT is slower due to the COT solver, but provides richer spatially-resolved output (transport matrices, direction vectors). Reduce `cot_nitermax` for faster results.
