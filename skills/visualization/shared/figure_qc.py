#!/usr/bin/env python3
"""PDF/PNG technical checks, not visual or scientific acceptance.
Requires Pillow and Poppler (pdfinfo, pdffonts; --render: pdftoppm, pdfseparate).
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from PIL import Image, ImageChops


def command(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=120,
                          env={**os.environ, "LC_ALL": "C"}).stdout


def check_png(png, min_dpi):
    with Image.open(png) as image:
        image.load()  # reject truncated/corrupt data; Pillow finds pHYs at any chunk offset
        if image.format != "PNG":
            raise ValueError(f"Not PNG: {png}")
        dpi = image.info.get("dpi", (0, 0))
        if min(dpi) + 0.1 < min_dpi:  # pHYs integer rounding tolerance
            raise ValueError(f"Missing/low DPI in {png}: {dpi}")
        if "A" in image.getbands() or "transparency" in image.info:
            if image.convert("RGBA").getchannel("A").getextrema()[0] < 255:
                raise ValueError(f"Transparent pixels in {png}")
        rgb = image.convert("RGB")
        ink = ImageChops.difference(rgb, Image.new("RGB", rgb.size, "white")).getbbox()
        if ink is None or all(low == high for low, high in rgb.getextrema()):
            raise ValueError(f"Blank/uniform image: {png}")
        return dict(path=str(png), pixels=list(image.size), dpi=list(dpi), nonblank=True)


def check_pdf(pdf, render=False, dpi=400, min_dpi=300):
    if pdf.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF: {pdf}")
    info = command("pdfinfo", str(pdf))
    match = re.search(r"^Pages:\s+(\d+)", info, re.M)
    if not match or int(match[1]) < 1:
        raise ValueError(f"Cannot determine page count: {pdf}")
    pages = int(match[1])
    # Last five fields are emb/sub/uni/object/ID; font type may contain spaces.
    fonts = command("pdffonts", str(pdf)).splitlines()[2:]
    if any(len(row.split()) < 5 or row.split()[-5] != "yes" for row in fonts if row.strip()):
        raise ValueError(f"Unembedded or unreadable font entry: {pdf}")
    pairs = []
    for page in range(1, pages + 1):
        stem = pdf.stem if pages == 1 else f"{pdf.stem}-page-{page}"
        page_pdf = pdf if pages == 1 else pdf.with_name(stem + ".pdf")
        png = pdf.with_name(stem + ".png")
        if render:
            # Keep previous files valid until new ones are fully written and checked.
            with tempfile.TemporaryDirectory(dir=pdf.parent) as temporary:
                prefix = Path(temporary) / "render"
                command("pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
                        "-r", str(dpi), "-png", str(pdf), str(prefix))
                rendered = prefix.with_suffix(".png")
                check_png(rendered, min_dpi)
                if pages > 1:
                    pattern = str(Path(temporary) / "page-%d.pdf")
                    command("pdfseparate", "-f", str(page), "-l", str(page), str(pdf), pattern)
                    os.replace(Path(temporary) / f"page-{page}.pdf", page_pdf)
                os.replace(rendered, png)
        if pages > 1:
            # Each split page is also independently usable as a PNG/PDF pair.
            page_info = command("pdfinfo", str(page_pdf))
            if not re.search(r"^Pages:\s+1\s*$", page_info, re.M):
                raise ValueError(f"Missing/invalid single-page PDF: {page_pdf}")
        pairs.append(dict(pdf=str(page_pdf), png=check_png(png, min_dpi)))
    return dict(pdf=str(pdf), pages=pages, fonts="embedded" if fonts else "no font objects",
                pairs=pairs, technical_qc="passed", visual_review="pending")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", nargs="+", type=Path, help="Explicit PDFs from this run (not an old output directory)")
    parser.add_argument("--render", action="store_true", help="Create/replace PNGs; split multi-page PDFs into pairs")
    parser.add_argument("--dpi", type=int, default=400)
    parser.add_argument("--min-dpi", type=int, default=300)
    args = parser.parse_args()
    if args.min_dpi < 300 or args.dpi < args.min_dpi:
        parser.error("DPI must meet the figure standard (>=300)")
    results = []
    for pdf in args.pdf:
        try:
            results.append(check_pdf(pdf.resolve(), args.render, args.dpi, args.min_dpi))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            results.append(dict(pdf=str(pdf), technical_qc="failed", error=str(error), visual_review="pending"))
    print(json.dumps(dict(mode="programmatic", results=results,
                         limitations="No check of overlap, legibility, colors, axes, statistics, or scientific meaning; visual review still required."),
                     ensure_ascii=False, indent=2))
    return int(any(item["technical_qc"] != "passed" for item in results))


if __name__ == "__main__":
    raise SystemExit(main())
