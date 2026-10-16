import importlib.util
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
import zlib

from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location("figure_qc", Path(__file__).resolve().parents[1] / "skills/visualization/shared/figure_qc.py")
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


class FigureQC(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image = Image.new("RGB", (80, 60), "white")
        ImageDraw.Draw(self.image).rectangle((10, 10, 30, 30), fill="black")

    def tearDown(self):
        self.temp.cleanup()

    def test_dpi_chunk_after_metadata_and_failure_cases(self):
        png = self.root / "plot.png"
        self.image.save(png, dpi=(400, 400))
        data = png.read_bytes()
        # Insert valid text metadata before pHYs, well beyond the old 33-byte assumption.
        text = b"Comment\x00" + b"x" * 200
        chunk = b"tEXt" + text
        png.write_bytes(data[:33] + struct.pack(">I", len(text)) + chunk + struct.pack(">I", zlib.crc32(chunk)) + data[33:])
        self.assertGreater(png.read_bytes().index(b"pHYs"), 200)
        self.assertTrue(qc.check_png(png, 300)["nonblank"])
        self.image.save(png, dpi=(72, 72))
        with self.assertRaisesRegex(ValueError, "DPI"):
            qc.check_png(png, 300)
        self.image.save(png)
        with self.assertRaisesRegex(ValueError, "DPI"):
            qc.check_png(png, 300)
        Image.new("RGB", (80, 60), "white").save(png, dpi=(400, 400))
        with self.assertRaisesRegex(ValueError, "Blank"):
            qc.check_png(png, 300)
        transparent = self.image.convert("RGBA")
        transparent.putpixel((0, 0), (255, 255, 255, 0))
        transparent.save(png, dpi=(400, 400))
        with self.assertRaisesRegex(ValueError, "Transparent"):
            qc.check_png(png, 300)
        png.write_bytes(b"broken")
        with self.assertRaises(OSError):
            qc.check_png(png, 300)

    @unittest.skipUnless(all(shutil.which(p) for p in ["pdfinfo", "pdffonts", "pdftoppm", "pdfseparate"]), "Poppler not installed")
    def test_single_and_multipage_conversion_and_missing_pair(self):
        for pages in [1, 2]:
            pdf = self.root / f"figure-{pages}.pdf"
            self.image.save(pdf, save_all=True, append_images=[self.image] * (pages - 1))
            with self.assertRaises((OSError, subprocess.CalledProcessError)):
                qc.check_pdf(pdf)
            result = qc.check_pdf(pdf, render=True)
            self.assertEqual(len(result["pairs"]), pages)
            self.assertEqual(result["visual_review"], "pending")
            self.assertEqual(qc.check_pdf(pdf)["technical_qc"], "passed")
            for pair in result["pairs"]:
                self.assertTrue(Path(pair["pdf"]).is_file())
                self.assertGreater(pair["png"]["dpi"][0], 399)


if __name__ == "__main__":
    unittest.main()
