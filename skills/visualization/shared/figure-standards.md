# Figure Standards — Single Source of Truth

This file is the ONLY authority for figure quality in this workflow. Every figure must pass all 32 standards below; the Pre-submission Checklist at the end is the minimum self-check.

🔴 = hard rule (objectively verifiable) · 🟡 = judged visually.

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

`theme_elegant()` must be called with `base_size = 9` to hit these sizes — its default (14) yields a 16.8pt title, violating the 10pt standard.

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

## Programmatic QC when visual inspection is unavailable

All 32 standards still apply. A text-only agent may report **technical QC passed;
visual review pending**, never “all standards passed” or pretend to have inspected a figure.
Ask a visual-capable reviewer/user to check layout, legibility and scientific meaning
before final acceptance. Do not silently weaken the rules or block useful technical work.

Use the bundled helper (Python + Pillow, Poppler `pdfinfo`/`pdffonts`; conversion also
needs `pdftoppm`/`pdfseparate`):

```bash
# Convert PDF output and check the resulting pairs; default rendering is 400 DPI.
python <visualization-skill>/shared/figure_qc.py --render path/to/figure.pdf
# Check existing pairs without modifying them:
python <visualization-skill>/shared/figure_qc.py path/to/figure.pdf > path/to/figure-qc.json
```

Pass the explicit PDFs produced by this run. Multi-page PDFs retain their original and
produce `<stem>-page-N.pdf` + `<stem>-page-N.png` pairs. `--render` explicitly replaces
derived files; it does not improve the effective resolution of embedded raster content.
The checker verifies PDF readability/page count, paired PNG decoding, DPI metadata,
absence of transparency, nonblank pixels and PDF font embedding. Missing tools/check
failures return nonzero. PNG metadata is parsed by Pillow, not a fixed byte-offset guess.

The JSON is evidence of **only those checks**. Nonblank pixels do not prove labels are
readable; metadata DPI does not prove effective resolution; font embedding does not
prove correct typography. List remaining visual checks and any code-level checks
performed (palette/axis-label parameters, etc.) separately. No automatic visual approval.

## Pre-submission Checklist

- [ ] Saved as BOTH `.png` (300 DPI) and `.pdf`
- [ ] Not JPEG
- [ ] No `jet`/`rainbow` on continuous data
- [ ] X AND Y axes labeled with units
- [ ] Top + right spines removed
- [ ] Legend to the right, not overlapping the plot
- [ ] No annotation text inside plot area
- [ ] Sans-serif, labels ≥9pt, ticks ≥7pt
