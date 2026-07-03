# Figure Standards — Single Source of Truth

This file is the ONLY authority for figure quality in this workflow.

- **Workers** read it before producing any figure that goes into `results/plots/`.
- **Reviewers** read it before reviewing any figure.

Both sides reference this same file — never maintain separate standard copies.

## Severity Levels

| Level | Meaning | On violation |
|-------|---------|--------------|
| 🔴 BLOCKER | Objectively verifiable hard rule | → NEEDS FIX (auto-reject) |
| 🟡 MAJOR | Important, but judged visually | → PASS WITH CONCERNS, recorded |

Only 🔴 BLOCKERS trigger NEEDS FIX. 🟡 items are recorded in review notes but do not block.

## MANDATORY BLOCKERS (🔴 — verify with these commands)

These 6 are objectively verifiable via bash. Any failure ⇒ the figure is rejected.

| # | Rule | Check command (run in bash) |
|---|------|------------------------------|
| 2 | No JPEG | `file <fig> \| grep -i jpeg` (hit = FAIL) |
| 3 | Both `.png` and `.pdf` exist | `ls <base>.png <base>.pdf` (missing one = FAIL) |
| 4 | Raster DPI ≥ 300 | `identify -format "%x %y\n" <fig>` ; fallback `python -c "from PIL import Image; print(Image.open('<fig>').info.get('dpi'))"` |
| 7 | No `jet`/`rainbow`/`nipy_spectral`/`gist_rainbow` on continuous data | `grep -nEi "cmap[=('\"]+ *(jet\|rainbow\|nipy_spectral\|gist_rainbow)" <script>` (hit = FAIL) |
| 11 | X AND Y axis labels non-empty | `grep -nE "set_xlabel\|set_ylabel\|labs\(" <script>` (absent/empty = FAIL) |
| 18 | Top + right spines removed | `grep -nE "spines\['(top\|right)'\].*set_visible\(False\)" <script>` (matplotlib) or R theme removing them |

If `identify` is unavailable, use the PIL one-liner; if both unavailable, downgrade rule 4 to 🟡 and note it — never silently pass.

## The 32 Standards

### File Delivery
1. 🟡 Plots in PDF (vector, preferred) or PNG. Heatmaps/photos may use TIFF.
2. 🔴 Never JPEG (compression artifacts).
3. 🔴 Every figure saved as BOTH `.png` and `.pdf`.
4. 🔴 Raster DPI ≥ 300.
5. 🟡 Embed fonts in PDF output.

### Color
6. 🟡 Continuous data: `viridis` / `plasma` / `cividis`.
7. 🔴 Continuous data MUST NOT use `jet` / `rainbow` / `nipy_spectral` / `gist_rainbow`.
8. 🟡 Categorical data: Elegant Muted 24-color palette (interpolate with `colorRampPalette()` when >24):
   ```
   #4E79A7  #F28E2B  #E15759  #76B7B2  #59A14F  #EDC948
   #B07AA1  #FF9DA7  #9C755F  #BAB0AC  #882E72  #1965B0
   #7BAFDE  #4EB265  #CAE0AB  #F7F056  #EE8026  #DC050C
   #72190E  #4271BD  #984EA3  #FFFF33  #A65628  #F781BF
   ```
9. 🟡 Diverging data: `RdBu_r` or `PuOr`. Avoid red-green combinations.

### Typography
10. 🟡 Sans-serif font (Arial / Helvetica).
11. 🔴 X AND Y axes must have text labels with units (non-empty).
12. 🟡 Axis label font ≥ 9pt.
13. 🟡 Tick label font ≥ 7pt.
14. 🟡 Labels in sentence case with units, e.g. `"Expression (log2 CPM)"`.
15. 🟡 Title 10pt bold.
16. 🟡 Legend text 7pt.
17. 🟡 Panel labels (A/B/C) 10pt bold, uppercase.

### Layout
18. 🔴 Remove top + right spines; keep left + bottom.
19. 🟡 Legend frameless.
20. 🟡 Legend positioned to the RIGHT of the main plot, vertically centered. Strictly NO overlap with the plot area.
21. 🟡 No gridlines unless essential for readability.
22. 🟡 White background (`#FFFFFF`), no transparency.
23. 🟡 No chart junk (3D, shadows, excessive decoration).
24. 🟡 Multi-panel: labels (A/B/C) top-left/top-center, consistent sizing across panels.

### Dimensions
25. 🟡 Single column 85mm (3.35") or full page 175mm (6.89").
26. 🟡 Aspect ratio 4:3 or golden ratio (1.618:1).

### Statistics
27. 🟡 Statistical figures must have error bars.
28. 🟡 Error bar type (SD / SEM / 95% CI) stated in caption.
29. 🟡 Show individual data points when n < 200.
30. 🟡 Significance markers: `*` p<0.05, `**` p<0.01, `***` p<0.001.

### Semantics
31. 🟡 Figure title is a noun phrase (e.g. "MASH vs Control").
32. 🟡 NO annotation text inside the plot area. "Annotation text" = data-point labels, gene names, numeric values, p-values, arrow callouts, and similar ADD-ON text. Axis labels, ticks, title, and legend are STRUCTURAL text and are retained.

## Pre-submission Checklist (workers self-run before declaring a step done)

- [ ] Saved as BOTH `.png` (300 DPI) and `.pdf`
- [ ] Not JPEG
- [ ] No `jet`/`rainbow` on continuous data
- [ ] X AND Y axes labeled with units
- [ ] Top + right spines removed
- [ ] Legend to the right, not overlapping the plot
- [ ] No annotation text inside plot area
- [ ] Sans-serif, labels ≥9pt, ticks ≥7pt
