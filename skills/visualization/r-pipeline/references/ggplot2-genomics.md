# ggplot2 Genomics Patterns

Publication-quality charts specific to genomics workflows: volcano and MA plots for differential expression, Manhattan plots for GWAS, and PCA for sample relationships. All examples reuse `theme_elegant()` and `get_palette_values()` from `r-pipeline/scripts/utils.R` (see `theme-and-colors.md`). For general statistical charts (box, scatter, heatmap, etc.) see `ggplot2-patterns.md`.

**Visual standards** (format, DPI, typography, palette): `shared/figure-standards.md` is the single source of truth.

## Setup

```r
source("r-pipeline/scripts/utils.R")   # theme_elegant(), get_palette_values()
library(ggplot2)
library(ggrepel)                        # smart label placement (volcano, manhattan)
theme_base <- theme_elegant(base_size = 9)
```

---

## Volcano Plot

For differential expression results (DESeq2, edgeR, limma). Input: a data frame with `log2FC`, `pvalue` (or `padj`), and `gene`.

```r
deg <- deg %>%
  mutate(
    neg_log_p = -log10(padj),
    sig = case_when(
      padj < 0.05 & log2FC >  1 ~ "Up",
      padj < 0.05 & log2FC < -1 ~ "Down",
      TRUE                       ~ "NS"
    )
  )
sig_colors <- c(Up = "#D6604D", Down = "#4393C3", NS = "grey80")

top_genes <- deg %>% dplyr::filter(sig != "NS") %>%
  arrange(padj) %>% head(10)

ggplot(deg, aes(x = log2FC, y = neg_log_p, color = sig)) +
  geom_point(alpha = 0.6, size = 1) +
  geom_point(data = top_genes, size = 1.5) +
  geom_text_repel(data = top_genes, aes(label = gene), size = 2.5,
                  max.overlaps = 15, color = "black") +
  geom_hline(yintercept = -log10(0.05), linetype = "dashed", color = "grey50") +
  geom_vline(xintercept = c(-1, 1), linetype = "dashed", color = "grey50") +
  scale_color_manual(values = sig_colors, name = NULL) +
  labs(x = expression(log[2]~fold~change), y = expression(-log[10]~italic(p)[adj])) +
  theme_base
```

Key design: dashed threshold lines at significance (p=0.05) and effect size (|log2FC|=1); label only the top N by padj to avoid overplotting; NS points grey and low-alpha so the up/down signal reads.

## MA Plot

For differential expression, log-fold-change vs mean expression. Same input as volcano.

```r
deg <- deg %>% mutate(
  mean_exp = (log2FC + log2(baseMean)) ,  # or use lfcShrink log2FC vs baseMean
  sig = case_when(padj < 0.05 & log2FC >  1 ~ "Up",
                  padj < 0.05 & log2FC < -1 ~ "Down",
                  TRUE                       ~ "NS"))

ggplot(deg, aes(x = mean_exp, y = log2FC, color = sig)) +
  geom_point(alpha = 0.5, size = 0.8) +
  geom_hline(yintercept = 0, color = "grey40", linewidth = 0.4) +
  geom_hline(yintercept = c(-1, 1), linetype = "dashed", color = "grey60") +
  scale_color_manual(values = sig_colors, name = NULL) +
  labs(x = expression(log[2]~mean~expression), y = expression(log[2]~fold~change)) +
  theme_base
```

Use **`ashr`/`apeglm` shrinked log2FC** for the y-axis (raw LFC is noisy at low expression). The horizontal band should hug y=0 after shrinkage — a wide fan signals low-count noise.

## Manhattan Plot

For GWAS summary statistics. Input: data frame with `CHR`, `BP`, `P`.

```r
manh <- manh %>%
  arrange(CHR, BP) %>%
  group_by(CHR) %>%
  mutate(pos = BP - min(BP) + (max(BP) - min(BP))/2 + dplyr::lag(cumsum(max(BP)), default = 0),
         neg_log_p = -log10(P),
         chr_color = ifelse(CHR %% 2 == 0, "even", "odd"))

sig_label <- manh %>% dplyr::filter(neg_log_p > -log10(5e-8)) %>% head(20)

ggplot(manh, aes(x = pos, y = neg_log_p, color = chr_color)) +
  geom_point(alpha = 0.7, size = 1) +
  geom_text_repel(data = sig_label, aes(label = SNP), color = "black", size = 2.5) +
  geom_hline(yintercept = -log10(5e-8), color = "#D6604D", linetype = "dashed") +
  geom_hline(yintercept = -log10(1e-5), color = "grey60", linetype = "dashed") +
  scale_color_manual(values = c(even = "#4E79A7", odd = "grey40"), guide = "none") +
  scale_x_continuous(breaks = manh %>% group_by(CHR) %>% summarise(b = mean(pos)) %>% pull(b),
                     labels = manh %>% distinct(CHR) %>% pull(CHR)) +
  labs(x = "Chromosome", y = expression(-log[10]~italic(p))) +
  theme_base + theme(panel.grid.major.x = element_blank())
```

Design: alternating two-color scheme by chromosome for visual separation; two reference lines — genome-wide significance (5e-8, red) and suggestive (1e-5, grey); label only top hits. For interactive/complex Manhattan, consider `qqman` or `ggman` as alternatives.

## PCA / Dimension Reduction

For bulk RNA-seq sample relationships, batch effect check, or any matrix PCA. Use `prcomp` then plot.

```r
pca <- prcomp(t(expr_matrix), scale. = TRUE)
pca_df <- as.data.frame(pca$x)
pca_df$sample <- rownames(pca_df)
pca_df$condition <- meta$condition[match(pca_df$sample, meta$sample)]
var_pct <- round(100 * pca$sdev^2 / sum(pca$sdev^2), 1)

ggplot(pca_df, aes(x = PC1, y = PC2, color = condition)) +
  geom_point(size = 2.5, alpha = 0.8) +
  stat_ellipse(level = 0.95, linewidth = 0.4) +
  scale_color_manual(values = get_palette_values("elegant", n = nlevels(factor(pca_df$condition)))) +
  labs(x = paste0("PC1 (", var_pct[1], "%)"),
       y = paste0("PC2 (", var_pct[2], "%)")) +
  theme_base
```

Always annotate axes with **% variance explained** — a PCA without it is unreadable. Add `stat_ellipse` only when n ≥ 4 per group and clustering is expected; drop it for noisy small-n data. Label outlier samples with `geom_text_repel`.

## Anti-patterns (genomics)

| Anti-pattern | Problem | Fix |
|---|---|---|
| Volcano without threshold lines | Reader can't see cutoffs | Dashed lines at p=0.05 and \|log2FC\|=1 |
| Label every gene on volcano | Illegible; slow render | `arrange(padj) %>% head(10)` + `ggrepel` |
| MA plot with raw (unshrinked) LFC | Wide fan at low expression | Use `lfcShrink()` with apeglm/ashr |
| Manhattan with single color | Chromosomes blur together | Alternate two colors by CHR |
| PCA axis without % variance | Meaningless coordinates | `pca$sdev^2 / sum(...)` on labels |
| PCA ellipse with n < 4 per group | Fake confidence, misleading | Drop `stat_ellipse` for small n |
