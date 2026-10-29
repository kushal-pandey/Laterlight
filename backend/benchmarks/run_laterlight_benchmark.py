from __future__ import annotations

import asyncio
import json
import sys
from difflib import SequenceMatcher
from pathlib import Path

# Run from the backend directory so the existing backend/.env is loaded as usual.
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
DATASET_DIR = REPO_DIR / "laterlight_ground_truth_dataset"
GROUND_TRUTH_PATH = DATASET_DIR / "ground_truth.json"
DOCUMENTS_DIR = DATASET_DIR / "documents"
OUTPUT_DIR = BACKEND_DIR / "benchmark_results"

sys.path.insert(0, str(BACKEND_DIR))

from app.services.ai_provider import TinkerProvider  # noqa: E402


def normalized(value: object) -> str:
    return " ".join(str(value or "").lower().split())


def similarity(expected: dict, actual: dict) -> float:
    expected_text = normalized(expected.get("title")) + " " + normalized(expected.get("description"))
    actual_text = normalized(actual.get("title")) + " " + normalized(actual.get("description"))
    return SequenceMatcher(None, expected_text, actual_text).ratio()


def match_actions(expected_actions: list[dict], actual_actions: list[dict]) -> list[tuple[int, int, float]]:
    # Greedy one-to-one matching by title + description similarity.
    candidates = []
    for ei, expected in enumerate(expected_actions):
        for ai, actual in enumerate(actual_actions):
            candidates.append((similarity(expected, actual), ei, ai))
    candidates.sort(reverse=True)

    used_expected, used_actual, matches = set(), set(), []
    for score, ei, ai in candidates:
        if score < 0.30 or ei in used_expected or ai in used_actual:
            continue
        used_expected.add(ei)
        used_actual.add(ai)
        matches.append((ei, ai, score))
    return matches


async def main() -> None:
    if not GROUND_TRUTH_PATH.exists():
        raise SystemExit(f"Dataset not found: {GROUND_TRUTH_PATH}")

    ground_truth = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
    provider = TinkerProvider()

    results = []
    total_expected = total_predicted = total_matched = 0
    date_correct = date_scored = priority_correct = priority_scored = 0
    documents_with_errors = 0

    for item in ground_truth["documents"]:
        doc_id = item["document_id"]
        doc_path = DOCUMENTS_DIR / item["filename"]
        if not doc_path.exists():
            results.append({"document_id": doc_id, "error": f"Missing document: {doc_path}"})
            documents_with_errors += 1
            continue

        text = doc_path.read_text(encoding="utf-8")
        expected = item.get("expected_actions", [])
        total_expected += len(expected)

        try:
            extraction = await provider.extract(text)
            predicted = [a.model_dump(mode="json") for a in extraction.actions]
            total_predicted += len(predicted)
            matches = match_actions(expected, predicted)
            total_matched += len(matches)

            matched_details = []
            for ei, ai, score in matches:
                exp, got = expected[ei], predicted[ai]
                date_scored += 1
                if exp.get("due_date") == got.get("due_date"):
                    date_correct += 1
                priority_scored += 1
                if normalized(exp.get("priority")) == normalized(got.get("priority")):
                    priority_correct += 1
                matched_details.append({
                    "expected_title": exp.get("title"),
                    "predicted_title": got.get("title"),
                    "title_description_similarity": round(score, 3),
                    "expected_due_date": exp.get("due_date"),
                    "predicted_due_date": got.get("due_date"),
                    "due_date_correct": exp.get("due_date") == got.get("due_date"),
                    "expected_priority": exp.get("priority"),
                    "predicted_priority": got.get("priority"),
                    "priority_correct": normalized(exp.get("priority")) == normalized(got.get("priority")),
                })

            results.append({
                "document_id": doc_id,
                "category": item.get("category"),
                "expected_action_count": len(expected),
                "predicted_action_count": len(predicted),
                "matched_action_count": len(matches),
                "false_negative_count": max(0, len(expected) - len(matches)),
                "false_positive_count": max(0, len(predicted) - len(matches)),
                "matches": matched_details,
                "predictions": predicted,
            })
            print(f"{doc_id}: expected={len(expected)} predicted={len(predicted)} matched={len(matches)}")
        except Exception as exc:
            documents_with_errors += 1
            results.append({
                "document_id": doc_id,
                "error_type": type(exc).__name__,
                "error": str(exc)[:500],
            })
            print(f"{doc_id}: ERROR {type(exc).__name__}: {str(exc)[:180]}")

    precision = total_matched / total_predicted if total_predicted else 0.0
    recall = total_matched / total_expected if total_expected else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    report = {
        "dataset": ground_truth.get("dataset_name"),
        "model": "configured Tinker model",
        "documents_total": len(ground_truth["documents"]),
        "documents_with_errors": documents_with_errors,
        "expected_actions": total_expected,
        "predicted_actions": total_predicted,
        "matched_actions": total_matched,
        "false_positives": max(0, total_predicted - total_matched),
        "false_negatives": max(0, total_expected - total_matched),
        "action_precision": round(precision, 4),
        "action_recall": round(recall, 4),
        "action_f1": round(f1, 4),
        "due_date_accuracy_on_matched_actions": round(date_correct / date_scored, 4) if date_scored else None,
        "priority_accuracy_on_matched_actions": round(priority_correct / priority_scored, 4) if priority_scored else None,
        "matching_note": "Greedy title+description similarity matching with a 0.30 threshold. Review predictions.json for borderline matches.",
        "results": results,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUTPUT_DIR / "predictions.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== LATERLIGHT BENCHMARK SUMMARY ===")
    for key in (
        "documents_total", "documents_with_errors", "expected_actions", "predicted_actions",
        "matched_actions", "false_positives", "false_negatives", "action_precision",
        "action_recall", "action_f1", "due_date_accuracy_on_matched_actions",
        "priority_accuracy_on_matched_actions",
    ):
        print(f"{key}: {report[key]}")
    print(f"\nReports saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
