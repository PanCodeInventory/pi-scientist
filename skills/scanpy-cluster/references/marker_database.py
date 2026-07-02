"""
Marker gene database for cluster-identify.
Used by the agent to select representative genes for expression validation.

Sources:
- PanglaoDB (https://panglaodb.se/) - peer-reviewed marker gene database
- Human Cell Atlas / HPCA - canonical lineage markers
- ImmPort - immune cell and functional-state markers
- CellMarker 2.0 - curated tissue and stromal markers

Convention:
- All gene names use HUMAN uppercase format (CD3D, MS4A1)
- For mouse data, the agent converts to Title-case (Cd3d, Ms4a1)
- Each cell type has 3-8 representative markers
- Markers are chosen for specificity where possible
"""

MARKER_DATABASE = {
    # Source: PanglaoDB canonical pan-T markers
    "T_cells": ["CD3D", "CD3E", "CD2", "TRBC1"],
    "Pan_T": ["CD3D", "CD3E", "CD2", "TRBC1"],
    # Source: PanglaoDB / HPCA canonical CD4 T markers
    "CD4_T_cells": ["CD4", "IL7R", "LTB", "MALAT1"],
    # Source: PanglaoDB / HPCA canonical CD8 T markers
    "CD8_T_cells": ["CD8A", "CD8B", "NKG7", "CST7"],
    # Source: PanglaoDB naive T-cell markers
    "Naive_CD4_T": ["CCR7", "LEF1", "TCF7", "IL7R"],
    "Naive_CD8_T": ["CCR7", "LEF1", "CD8A", "LTB"],
    # Source: PanglaoDB activated/memory T markers
    "Central_memory_T": ["IL7R", "LTB", "MAL", "CCR7"],
    "Effector_memory_T": ["IL7R", "GZMK", "CXCR3", "CCL5"],
    # Source: PanglaoDB / ImmPort regulatory T-cell markers
    "Regulatory_T": ["FOXP3", "IL2RA", "CTLA4", "TIGIT"],
    "Treg": ["FOXP3", "IL2RA", "CTLA4", "TIGIT"],
    # Source: ImmPort exhausted T-cell markers
    "Exhausted_T": ["PDCD1", "LAG3", "HAVCR2", "TIGIT"],
    # Source: PanglaoDB cytotoxic T markers
    "Cytotoxic_T": ["NKG7", "PRF1", "GZMB", "CTSW"],
    # Source: PanglaoDB gamma-delta T-cell markers
    "Gamma_delta_T": ["TRDC", "TRGC1", "TRGC2", "NKG7"],
    "gdT": ["TRDC", "TRGC1", "TRGC2", "NKG7"],
    # Source: PanglaoDB Tfh markers
    "Tfh": ["CXCR5", "PDCD1", "ICOS", "IL21R"],
    # Source: PanglaoDB Th17 markers
    "Th17": ["RORC", "CCR6", "IL7R", "KLRB1"],
    # Source: PanglaoDB MAIT markers
    "MAIT": ["TRAV1-2", "KLRB1", "SLC4A10", "IL7R"],
    # Source: PanglaoDB / ImmPort NKT markers
    "NKT": ["TRAC", "NKG7", "KLRD1", "NCAM1"],

    # Source: PanglaoDB canonical B-cell markers
    "B_cells": ["MS4A1", "CD79A", "CD79B", "CD74"],
    # Source: PanglaoDB naive B-cell markers
    "Naive_B": ["MS4A1", "IGHD", "TCL1A", "HVCN1"],
    # Source: PanglaoDB memory B-cell markers
    "Memory_B": ["CD27", "AIM2", "BANK1", "TNFRSF13B"],
    # Source: PanglaoDB germinal-center B-cell markers
    "Germinal_center_B": ["BCL6", "RGS13", "AICDA", "CD83"],
    # Source: PanglaoDB plasmablast markers
    "Plasmablasts": ["JCHAIN", "MZB1", "TNFRSF17", "SDC1"],
    # Source: PanglaoDB plasma-cell markers
    "Plasma_cells": ["MZB1", "JCHAIN", "SDC1", "XBP1"],

    # Source: PanglaoDB canonical NK markers
    "NK_cells": ["NCAM1", "NKG7", "GNLY", "KLRD1"],
    # Source: PanglaoDB mature NK markers
    "Cytotoxic_NK": ["FGFBP2", "PRF1", "GZMB", "FCGR3A"],
    # Source: PanglaoDB cytokine-producing NK markers
    "Activated_NK": ["XCL1", "XCL2", "NKG7", "CCL5"],

    # Source: PanglaoDB monocyte markers
    "Monocytes": ["CD14", "LYZ", "FCN1", "S100A8"],
    # Source: PanglaoDB classical monocyte markers
    "Classical_monocytes": ["CD14", "S100A8", "S100A9", "FCN1"],
    # Source: PanglaoDB non-classical monocyte markers
    "Non_classical_monocytes": ["FCGR3A", "MS4A7", "LST1", "SIGLEC10"],
    # Source: PanglaoDB intermediate monocyte markers
    "Intermediate_monocytes": ["FCER1G", "SAT1", "CTSD", "LILRB1"],
    # Source: PanglaoDB macrophage markers
    "Macrophages": ["CD68", "CD163", "C1QA", "APOE"],
    # Source: ImmPort inflammatory macrophage markers
    "M1_macrophages": ["IL1B", "TNF", "CXCL10", "FCGR3A"],
    # Source: ImmPort alternative macrophage markers
    "M2_macrophages": ["CD163", "MRC1", "C1QC", "MSR1"],
    # Source: PanglaoDB tissue-resident macrophage markers
    "Alveolar_macrophages": ["PPARG", "FABP4", "MARCO", "INHBA"],
    # Source: PanglaoDB osteoclast markers
    "Osteoclasts": ["CTSK", "ACP5", "ATP6V0D2", "MMP9"],

    # Source: PanglaoDB conventional dendritic-cell markers
    "Conventional_DC": ["FCER1A", "CLEC10A", "CD1C", "HLA-DRA"],
    "cDC2": ["FCER1A", "CLEC10A", "CD1C", "HLA-DRA"],
    # Source: PanglaoDB cDC1 markers
    "cDC1": ["CLEC9A", "XCR1", "BATF3", "CADM1"],
    # Source: PanglaoDB plasmacytoid dendritic-cell markers
    "Plasmacytoid_DC": ["LILRA4", "GZMB", "CLEC4C", "IRF7"],
    "pDC": ["LILRA4", "GZMB", "CLEC4C", "IRF7"],
    # Source: PanglaoDB Langerhans-cell markers
    "Langerhans_cells": ["CD207", "CD1A", "FCER1A", "HLA-DRA"],

    # Source: PanglaoDB mast-cell markers
    "Mast_cells": ["TPSAB1", "KIT", "MS4A2", "CPA3"],
    # Source: PanglaoDB basophil markers
    "Basophils": ["CLC", "MS4A2", "HDC", "TPSB2"],
    # Source: PanglaoDB eosinophil markers
    "Eosinophils": ["CLC", "PRG2", "RNASE2", "SIGLEC8"],
    # Source: PanglaoDB neutrophil markers
    "Neutrophils": ["FCGR3B", "S100A8", "S100A9", "CXCR2"],

    # Source: PanglaoDB platelet markers
    "Platelets": ["PPBP", "PF4", "GP9", "NRGN"],
    # Source: PanglaoDB megakaryocyte markers
    "Megakaryocytes": ["PPBP", "PF4", "ITGA2B", "TUBB1"],
    # Source: PanglaoDB erythrocyte markers
    "Erythrocytes": ["HBB", "HBA1", "HBA2", "ALAS2"],
    # Source: PanglaoDB erythroid progenitor markers
    "Erythroid_progenitors": ["KLF1", "GYPA", "AHSP", "ALAS2"],

    # Source: HPCA / PanglaoDB hematopoietic stem-cell markers
    "HSC": ["CD34", "KIT", "PROM1", "GATA2"],
    # Source: HPCA progenitor markers
    "Progenitors": ["SOX4", "MKI67", "TYMS", "STMN1"],
    # Source: PanglaoDB cycling-cell markers
    "Cycling_cells": ["MKI67", "TOP2A", "PCNA", "TYMS"],

    # Source: CellMarker / PanglaoDB fibroblast markers
    "Fibroblasts": ["COL1A1", "COL3A1", "DCN", "LUM"],
    # Source: CellMarker myofibroblast markers
    "Myofibroblasts": ["ACTA2", "TAGLN", "COL1A1", "MYLK"],
    # Source: PanglaoDB pericyte markers
    "Pericytes": ["RGS5", "CSPG4", "MCAM", "PDGFRB"],
    # Source: PanglaoDB smooth-muscle markers
    "Smooth_muscle": ["ACTA2", "MYH11", "TAGLN", "CNN1"],
    # Source: PanglaoDB endothelial markers
    "Endothelial": ["PECAM1", "VWF", "CDH5", "KDR"],
    # Source: PanglaoDB lymphatic endothelial markers
    "Lymphatic_endothelial": ["PROX1", "PDPN", "FLT4", "CCL21"],
    # Source: CellMarker mesenchymal stem/stromal markers
    "Mesenchymal_stromal": ["THY1", "ENG", "NT5E", "COL1A1"],
    # Source: CellMarker adipocyte markers
    "Adipocytes": ["PLIN1", "FABP4", "ADIPOQ", "LEP"],
    # Source: CellMarker chondrocyte markers
    "Chondrocytes": ["COL2A1", "ACAN", "SOX9", "MATN3"],
    # Source: CellMarker osteoblast markers
    "Osteoblasts": ["BGLAP", "SPP1", "ALPL", "COL1A1"],
    # Source: CellMarker osteocyte markers
    "Osteocytes": ["DMP1", "PHEX", "MEPE", "SOST"],

    # Source: PanglaoDB pan-epithelial markers
    "Epithelial": ["EPCAM", "KRT8", "KRT18", "CDH1"],
    # Source: PanglaoDB basal epithelial markers
    "Basal_epithelial": ["KRT5", "KRT14", "TP63", "KRT17"],
    # Source: PanglaoDB secretory epithelial markers
    "Secretory_epithelial": ["KRT19", "MUC1", "KRT8", "KRT18"],
    # Source: CellMarker keratinocyte markers
    "Keratinocytes": ["KRT14", "KRT1", "KRT10", "SFN"],
    # Source: CellMarker club-cell markers
    "Club_cells": ["SCGB1A1", "KRT19", "CYP2F1", "KRT8"],
    # Source: PanglaoDB ciliated-cell markers
    "Ciliated_cells": ["FOXJ1", "PIFO", "TPPP3", "DYX1C1"],
    # Source: PanglaoDB alveolar type 1 markers
    "AT1": ["AGER", "CAV1", "EMP2", "PDPN"],
    # Source: PanglaoDB alveolar type 2 markers
    "AT2": ["SFTPA1", "SFTPA2", "SFTPC", "ABCA3"],
    # Source: CellMarker hepatocyte markers
    "Hepatocytes": ["ALB", "APOA1", "TTR", "CYP3A4"],
    # Source: CellMarker cholangiocyte markers
    "Cholangiocytes": ["KRT19", "KRT7", "SOX9", "EPCAM"],
    # Source: CellMarker pancreatic acinar markers
    "Acinar_cells": ["PRSS1", "CPA1", "CTRB2", "CELA3A"],
    # Source: CellMarker pancreatic ductal markers
    "Ductal_cells": ["KRT19", "KRT7", "MSLN", "SLC4A4"],
    # Source: CellMarker pancreatic beta-cell markers
    "Beta_cells": ["INS", "IAPP", "PCSK1", "PDX1"],
    # Source: CellMarker pancreatic alpha-cell markers
    "Alpha_cells": ["GCG", "TTR", "ARX", "LOXL4"],
    # Source: CellMarker pancreatic delta-cell markers
    "Delta_cells": ["SST", "HHEX", "RBP4", "GHSR"],
    # Source: CellMarker enterocyte markers
    "Enterocytes": ["ALPI", "EPCAM", "KRT20", "FABP1"],
    # Source: CellMarker goblet-cell markers
    "Goblet_cells": ["MUC2", "SPINK4", "TFF3", "CLCA1"],
    # Source: CellMarker tuft-cell markers
    "Tuft_cells": ["POU2F3", "TRPM5", "GFI1B", "IL25"],

    # Source: PanglaoDB neuron markers
    "Neurons": ["MAP2", "RBFOX3", "NEFL", "SLC17A7"],
    # Source: PanglaoDB excitatory-neuron markers
    "Excitatory_neurons": ["SLC17A7", "CAMK2A", "SATB2", "SYT1"],
    # Source: PanglaoDB inhibitory-neuron markers
    "Inhibitory_neurons": ["GAD1", "GAD2", "SLC6A1", "DLX1"],
    # Source: PanglaoDB astrocyte markers
    "Astrocytes": ["GFAP", "AQP4", "SLC1A2", "ALDH1L1"],
    # Source: PanglaoDB oligodendrocyte markers
    "Oligodendrocytes": ["MBP", "PLP1", "MOG", "MOBP"],
    # Source: PanglaoDB oligodendrocyte precursor markers
    "OPC": ["PDGFRA", "CSPG4", "OLIG1", "OLIG2"],
    # Source: PanglaoDB microglia markers
    "Microglia": ["TMEM119", "P2RY12", "CX3CR1", "TREM2"],
    # Source: CellMarker ependymal markers
    "Ependymal": ["FOXJ1", "S100B", "PIFO", "DNAH9"],
    # Source: CellMarker Schwann-cell markers
    "Schwann_cells": ["SOX10", "MPZ", "S100B", "PLP1"],

    # Source: CellMarker cardiomyocyte markers
    "Cardiomyocytes": ["TNNT2", "MYH6", "ACTC1", "NKX2-5"],
    # Source: CellMarker skeletal muscle markers
    "Skeletal_muscle": ["MYOD1", "MYOG", "DES", "ACTA1"],

    # Source: generic epithelial tumor markers from HPCA / CellMarker
    "Tumor_cells": ["EPCAM", "KRT19", "MUC1", "KRT8"],
    # Source: canonical cancer stem-like markers
    "Cancer_stem": ["ALDH1A1", "CD44", "PROM1", "SOX2"],
    # Source: EMT-like malignant-state markers
    "EMT_like_tumor": ["VIM", "FN1", "SNAI2", "ZEB1"],
}


def to_mouse_genes(genes):
    result = []
    for gene in genes:
        if gene.startswith("MT-"):
            result.append("mt-" + gene[3:].capitalize())
        else:
            result.append(gene[:1] + gene[1:].lower())
    return result


# Source: ImmPort and MSigDB Hallmark collections.
FUNCTIONAL_MARKERS = {
    "Activation": ["CD69", "IL2RA", "HLA-DRA"],
    "Exhaustion": ["PDCD1", "LAG3", "HAVCR2", "TIGIT"],
    "Cytotoxicity": ["PRF1", "GZMB", "NKG7", "GNLY"],
    "Proliferation": ["MKI67", "PCNA", "TOP2A"],
    "Apoptosis": ["BAX", "CASP3", "FAS"],
    "IFN_response": ["IFIT1", "ISG15", "MX1"],
    "Hypoxia": ["VEGFA", "CA9", "SLC2A1"],
    "EMT": ["VIM", "FN1", "SNAI1"],
    "Antigen_presentation": ["HLA-DRA", "CD74", "B2M"],
    "Stress_response": ["JUN", "FOS", "HSPA1A"],
}
