"""Verify the ten Luna P1→P2→P3→P4 audit chains without changing them."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CALIBRATION = ROOT / "demo-generated" / "real-calibration"
SAMPLES = [
    "2026(DG)ZW001",
    "2026(DG)ZW003",
    "2026(DG)ZW050",
    "2026ACSY003",
    "2026AG001",
    "2026BMH001",
    "2026CNKJ001",
    "26SHPYD056",
    "多对多样例",
    "英卡-抽+整",
]
STAGES = ("P1", "P2", "P3", "P4")
MUTABLE_SOURCE_INDEXES = {"demo-generated/sample_manifest.json"}


def read(path: Path):
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def collect_values(value, key: str) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        item = value.get(key)
        if isinstance(item, str):
            found.add(item)
        for child in value.values():
            found.update(collect_values(child, key))
    elif isinstance(value, list):
        for child in value:
            found.update(collect_values(child, key))
    return found


def expected_order_id(row: dict) -> str | None:
    source = row.get("source", {})
    file_id, source_row = source.get("file_id"), source.get("row")
    if not file_id or not isinstance(source_row, int):
        return None
    return f"D-{file_id.removeprefix('F-')}-R{source_row:03d}"


def normalize_raw_id(value: str) -> str:
    return "I-" + value.removeprefix("I-").removeprefix("F-")


def verify_sample(sample: str) -> dict:
    directory = CALIBRATION / f"{sample}-audit"
    assert directory.is_dir(), f"{sample}: missing audit directory"
    provenance = read(directory / "provenance.json")
    assert provenance["schema_version"] == "jiuli-ai-v3"
    assert provenance["model"] == "gpt-5.6-luna"
    assert provenance["stage_order"] == list(STAGES)
    assert provenance["sample_id"] == sample

    requests: dict[str, dict] = {}
    responses: dict[str, dict] = {}
    stage_records = {item["stage"]: item for item in provenance["stages"]}
    for stage in STAGES:
        request_path = directory / f"{stage}-request.json"
        response_path = directory / f"{stage}-response.json"
        request, response = read(request_path), read(response_path)
        for document in (request, response):
            assert document["schema_version"] == "jiuli-ai-v3"
            assert document["prompt"] == stage
        assert request["request_id"] == response["request_id"]
        assert response.get("output", {}).get("processing_status"), f"{sample}/{stage}: missing status"
        record = stage_records[stage]
        assert record["request_id"] == request["request_id"]
        assert record["status"] == response["output"]["processing_status"]
        requests[stage], responses[stage] = request, response["output"]

    assert set(provenance["artifact_sha256"]) == {
        f"{stage}-{kind}.json" for stage in STAGES for kind in ("request", "response")
    }
    for relative, expected in provenance["artifact_sha256"].items():
        assert sha256(directory / relative) == expected, f"{sample}: artifact hash changed: {relative}"
    for relative, expected in provenance["source_sha256"].items():
        path = ROOT / relative
        assert path.is_file(), f"{sample}: missing source: {relative}"
        if relative not in MUTABLE_SOURCE_INDEXES:
            assert sha256(path) == expected, f"{sample}: source hash changed: {relative}"

    p1_rows = responses["P1"].get("rows", [])
    p2_rows = responses["P2"].get("raw_rows", [])
    p3_order_rows = requests["P3"].get("input", {}).get("order_rows", [])
    p3_candidates = requests["P3"].get("input", {}).get("inspection_candidates", [])
    order_ids = {row["order_row_id"] for row in p3_order_rows}
    candidate_ids = {row["raw_row_id"] for row in p3_candidates}
    derived_order_ids = {item for row in p1_rows if (item := expected_order_id(row))}
    raw_sequence: Counter[tuple[str, str]] = Counter()
    derived_raw_ids: set[str] = set()
    globally_numbered_raw_ids: set[str] = set()
    for row in p2_rows:
        file_id, warehouse_no = row.get("source", {}).get("file_id"), row.get("warehouse_no")
        if not file_id or not warehouse_no:
            continue
        key = (file_id, warehouse_no)
        raw_sequence[key] += 1
        derived_raw_ids.add(f"I-{file_id.removeprefix('F-')}-{warehouse_no}-L{raw_sequence[key]:03d}")
        if isinstance(row.get("record_no"), int):
            globally_numbered_raw_ids.add(f"I-{file_id.removeprefix('F-')}-{warehouse_no}-L{row['record_no']:03d}")
    if p3_order_rows:
        assert order_ids == derived_order_ids, f"{sample}: P1→P3 order ids differ"
    if p3_candidates:
        normalized_candidate_ids = {normalize_raw_id(item) for item in candidate_ids}
        assert normalized_candidate_ids in (derived_raw_ids, globally_numbered_raw_ids), f"{sample}: P2→P3 raw ids differ"

    p3_request_evidence = collect_values(requests["P3"], "evidence_key")
    relations = responses["P3"].get("row_relations", [])
    if responses["P3"]["processing_status"] == "SUCCESS":
        assert len(relations) == len(p3_order_rows)
        assert {item["order_row_id"] for item in relations} == order_ids
    allocated: list[str] = []
    for relation in relations:
        selected = relation.get("selected_raw_row_ids", [])
        assert set(selected) <= candidate_ids
        if relation["match_status"] == "MATCHED":
            assert selected
            allocated.extend(selected)
        else:
            assert not selected
        assert set(relation.get("evidence_keys", [])) <= p3_request_evidence
    assert len(allocated) == len(set(allocated)), f"{sample}: raw row allocated twice"

    targets = requests["P4"].get("input", {}).get("target_rows", [])
    patches = responses["P4"].get("row_patches", [])
    relation_by_order = {item["order_row_id"]: item for item in relations}
    p4_request_evidence = collect_values(requests["P4"], "evidence_key")
    p4_request_issues = collect_values(requests["P4"], "issue_id")
    if responses["P4"]["processing_status"] == "SUCCESS":
        assert len(patches) == len(targets)
    targets_by_order = {item["order_row_id"]: item for item in targets}
    for target in targets:
        relation = relation_by_order[target["order_row_id"]]
        assert relation["match_status"] == "MATCHED"
        assert target["relation"]["raw_row_ids"] == relation["selected_raw_row_ids"]
    for patch in patches:
        target = targets_by_order[patch["order_row_id"]]
        assert patch["evaluated_fields"] == target["evaluated_fields"]
        assert [item["field"] for item in patch["field_decisions"]] == target["evaluated_fields"]
        for decision in patch["field_decisions"]:
            assert set(decision.get("evidence_keys", [])) <= p4_request_evidence
            assert set(decision.get("referenced_issue_ids", [])) <= p4_request_issues

    relation_counts = Counter(item["match_status"] for item in relations)
    return {
        "sample": sample,
        "statuses": [responses[stage]["processing_status"] for stage in STAGES],
        "order_rows": len(p1_rows),
        "raw_rows": len(p2_rows),
        "matched": relation_counts["MATCHED"],
        "multiple": relation_counts["MULTIPLE_CANDIDATES"],
        "unmatched": relation_counts["UNMATCHED"],
        "decisions": sum(len(item.get("field_decisions", [])) for item in patches),
    }


def main() -> None:
    results = [verify_sample(sample) for sample in SAMPLES]
    by_sample = {item["sample"]: item for item in results}
    audit_index = read(ROOT / "demo-generated/mock/model-audit-index.json")
    indexed = {item["sampleId"]: item for item in audit_index["samples"]}
    manifest = read(ROOT / "demo-generated/sample_manifest.json")
    manifest_samples = {item["sampleId"]: item for item in manifest["samples"]}
    for sample, result in by_sample.items():
        item = indexed[sample]
        assert list(item["stageStatus"].values()) == result["statuses"], f"{sample}: audit index statuses differ"
        assert item["counts"] == {
            "orderRows": result["order_rows"],
            "rawRows": result["raw_rows"],
            "matched": result["matched"],
            "multipleCandidates": result["multiple"],
            "unmatched": result["unmatched"],
            "fieldDecisions": result["decisions"],
        }, f"{sample}: audit index counts differ"
        manifest_item = manifest_samples[sample]
        assert len(manifest_item["modelOutputPaths"]) == 8
        assert all((ROOT / path).is_file() for path in manifest_item["modelOutputPaths"])
        expected_status = "real-calibration-p1-p4" if all(status == "SUCCESS" for status in result["statuses"]) else "real-calibration-p1-p4-audited-with-blocked-stages"
        assert manifest_item["modelOutputStatus"] == expected_status
    for result in results:
        print(
            f"PASS {result['sample']}: {'/'.join(result['statuses'])}; "
            f"P1={result['order_rows']} P2={result['raw_rows']} "
            f"P3={result['matched']}/{result['multiple']}/{result['unmatched']} "
            f"P4={result['decisions']}"
        )
    print(f"Verified {len(results)} Luna audit chains and {len(results) * 8} request/response artifacts")


if __name__ == "__main__":
    main()
