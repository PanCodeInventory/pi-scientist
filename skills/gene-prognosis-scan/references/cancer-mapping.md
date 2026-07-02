# Cancer Type Mapping Reference

## HPA Cancer Name → TCGA Abbreviation

This mapping is essential for converting HPA results (which use full cancer names) to TIMER2 queries (which use TCGA abbreviations).

| HPA Cancer Name | TCGA Code | Common Name (中文) |
|----------------|-----------|-------------------|
| Breast Invasive Carcinoma | BRCA | 乳腺癌 |
| Lung Adenocarcinoma | LUAD | 肺腺癌 |
| Lung Squamous Cell Carcinoma | LUSC | 肺鳞癌 |
| Liver Hepatocellular Carcinoma | LIHC | 肝细胞癌 |
| Kidney Renal Clear Cell Carcinoma | KIRC | 肾透明细胞癌 |
| Kidney Renal Papillary Cell Carcinoma | KIRP | 肾乳头状细胞癌 |
| Kidney Chromophobe | KICH | 肾嫌色细胞癌 |
| Head and Neck Squamous Cell Carcinoma | HNSC | 头颈鳞癌 |
| Cervical Squamous Cell Carcinoma | CESC | 宫颈鳞癌 |
| Glioblastoma Multiforme | GBM | 胶质母细胞瘤 |
| Colon Adenocarcinoma | COAD | 结肠腺癌 |
| Rectum Adenocarcinoma | READ | 直肠腺癌 |
| Pancreatic Adenocarcinoma | PAAD | 胰腺腺癌 |
| Uterine Corpus Endometrial Carcinoma | UCEC | 子宫内膜癌 |
| Ovary Serous Cystadenocarcinoma | OV | 卵巢浆液性囊腺癌 |
| Stomach Adenocarcinoma | STAD | 胃腺癌 |
| Bladder Urothelial Carcinoma | BLCA | 膀胱尿路上皮癌 |
| Thyroid Carcinoma | THCA | 甲状腺癌 |
| Prostate Adenocarcinoma | PRAD | 前列腺癌 |
| Skin Cutaneous Melanoma | SKCM | 皮肤黑色素瘤 |
| Acute Myeloid Leukemia | LAML | 急性髓系白血病 |
| Brain Lower Grade Glioma | LGG | 低级别胶质瘤 |
| Esophageal Carcinoma | ESCA | 食管癌 |
| Testicular Germ Cell Tumors | TGCT | 睾丸生殖细胞瘤 |
| Adrenocortical Carcinoma | ACC | 肾上腺皮质癌 |
| Mesothelioma | MESO | 间皮瘤 |
| Uveal Melanoma | UVM | 葡萄膜黑色素瘤 |

## Notes

- HPA sometimes appends "(TCGA)" or "(validation)" to the cancer name — strip these before matching.
- For cancer types not in this list, consult `CancerPrognosis_get_study_summary` or `tooluniverse_find_tools` to discover available TCGA studies.
- Some TIMER2 cancer codes map to combined cBioPortal studies (e.g., READ may use `coadread_tcga`).
