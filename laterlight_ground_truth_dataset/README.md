# Laterlight Synthetic Action Extraction Benchmark v1.0

## Contents
- `documents/`: 25 fictional TXT files to upload into Laterlight.
- `ground_truth.json`: manually specified expected tasks, due dates, priorities, and verbatim evidence.
- `manifest.csv`: document index and expected task counts.

## Coverage
Invoices, notices, appointments, contracts, emails, multiple-task documents, ambiguous deadlines, and documents with no current actionable items. Includes missing/uncertain dates, relative obligations, dependencies, and conditional contract clauses.

## Suggested evaluation
1. Enable the real Tinker provider; do not use demo/fallback output.
2. Upload each TXT file and record the extracted tasks.
3. Match predicted tasks to expected tasks semantically, ignoring output order.
4. Calculate task precision, recall, and F1; separately check due-date correctness and whether evidence is actually supported by the source.
5. Keep this version unchanged for comparisons. If labels change, bump the dataset version and document the reason.

## Limitations
This is a small, synthetic, English-only starter benchmark. It does not measure PDF OCR, visual layout extraction, or real-world document distribution. Do not present results as a broad production accuracy claim. Relative deadlines without a trigger date intentionally have null due dates. LL021 tests whether the system avoids creating a task from a conditional clause when no triggering event is present.
