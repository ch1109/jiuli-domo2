import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[2]
PYTHON = "/Users/chch/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
SCRIPT = ROOT / "demo-generated/scripts/parse_adapter.py"


class ParseAdapterTests(unittest.TestCase):
    def run_adapter(self, path: Path, source_id: str = "FILE-TEST") -> tuple[int, dict]:
        process = subprocess.run(
            [PYTHON, str(SCRIPT), str(path), "--source-file-id", source_id, "--material-type", "查货"],
            capture_output=True,
            text=True,
            check=False,
        )
        return process.returncode, json.loads(process.stdout)

    def test_xlsx_rows_keep_sheet_and_row_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "明细"
            sheet.append(["品牌", "型号", "数量"])
            sheet.append(["ACME", "M-001", 3])
            workbook.save(path)

            code, output = self.run_adapter(path)
            self.assertEqual(code, 0)
            self.assertEqual(output["adapterId"], "local-text-material")
            self.assertEqual(output["facts"][1]["sourceLocation"], {"page": None, "sheet": "明细", "row": 2, "position": None})
            self.assertEqual(output["facts"][1]["fields"]["column_2"], "M-001")
            self.assertEqual(output["metadata"]["sheets"][0]["merged"], [])

    def test_unsupported_file_has_stable_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.txt"
            path.write_text("not a supported material", encoding="utf-8")
            code, output = self.run_adapter(path)
            self.assertEqual(code, 2)
            self.assertEqual(output["errorCode"], "UNSUPPORTED_FILE_TYPE")

    def test_real_pdf_is_read_only_and_has_source_pages_or_ocr_warning(self):
        pdf = next((ROOT / "真实整单样本").rglob("*.pdf"))
        before = pdf.stat().st_mtime_ns
        code, output = self.run_adapter(pdf, "REAL-PDF-TEST")
        after = pdf.stat().st_mtime_ns
        self.assertEqual(code, 0)
        self.assertEqual(before, after)
        self.assertTrue(output["facts"] or "OCR_REQUIRED" in output["warnings"])
        if output["facts"]:
            self.assertIn("page", output["facts"][0]["sourceLocation"])


if __name__ == "__main__":
    unittest.main()
