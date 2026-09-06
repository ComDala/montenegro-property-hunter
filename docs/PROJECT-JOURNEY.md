# Project journey

The project evolved through small, testable milestones rather than a single code dump.

| Date | Milestone |
|---|---|
| 2026-08-18 | Built the Phase 1 property-intelligence dashboard |
| 2026-08-19 | Connected live contacts and historical scan state |
| 2026-08-22 | Added multi-source filters and filtered CSV export |
| 2026-08-23 | Added shortlist notes, change tracking and duplicate comparison |
| 2026-08-23 | Introduced deal alerts and a human duplicate-review workflow |
| 2026-08-23 | Added investment calculations and contact workflow |
| 2026-08-24 | Added optimized listing galleries |
| 2026-08-24 | Added source-health and photo-coverage filtering |
| 2026-08-25 | Grouped cross-source matches and strengthened photo evidence |
| 2026-08-25 | Added the Data Quality Center and strict duplicate automation |
| 2026-08-25 | Added saved searches, digests and photo enrichment |
| 2026-08-25 | Added natural-language search, CRM follow-ups and scanner readiness |
| 2026-09-05 | Completed the authenticated Estitor CLI workflow and full import validation |

## Product decisions demonstrated

- Preserve raw advertisements rather than hiding uncertainty through destructive merges.
- Keep scanning evidence separate from normalized current state.
- Prefer explainable matching signals over opaque duplicate decisions.
- Treat inaccessible pages as unverifiable, not removed.
- Store original image URLs instead of duplicating large image files.
- Keep privileged database access on the server side.
- Publish synthetic data while retaining the private production dataset.

## Current direction

The private production system continues as the operational research tool. This repository is the sanitized engineering portfolio edition: reproducible, inspectable and safe to share publicly.
