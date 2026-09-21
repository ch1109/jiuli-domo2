import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "demo-generated" / "source_inventory.json"
CATALOG = ROOT / "demo-generated" / "REAL_SAMPLE_CATALOG.md"


class SampleCatalogValidation(unittest.TestCase):
    def test_catalog_covers_inventory_samples(self):
        inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
        catalog = CATALOG.read_text(encoding="utf-8")
        sample_table = catalog.split("## 样本总表", 1)[1].split("## 样本说明与缺口", 1)[0]
        rows = re.findall(r"^\| `([^`]+)` \|", sample_table, flags=re.MULTILINE)

        self.assertEqual(len(rows), len(inventory["samples"]))
        self.assertEqual(set(rows), {sample["sampleId"] for sample in inventory["samples"]})

    def test_catalog_preserves_material_count_and_unknown_policy(self):
        inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
        catalog = CATALOG.read_text(encoding="utf-8")

        self.assertIn(f"{inventory['summary']['materialFileCount']} 份材料", catalog)
        self.assertIn("`UNKNOWN` 表示", catalog)


if __name__ == "__main__":
    unittest.main()
