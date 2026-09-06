# Architecture

## Data flow

1. Source-specific scanners collect advertisements and explicitly record page-verification status.
2. Normalization maps source fields into stable listing identities and time-stamped observations.
3. Validation separates trusted totals from per-square-metre prices and flags ambiguous records.
4. Scoring classifies opportunities using price, freshness, location and property attributes.
5. Strict matching creates review candidates from location, area, room count, price, contacts, descriptions and photos.
6. Human review confirms duplicates, marks the same development or rejects a proposed relationship.
7. The dashboard exposes research, quality, digest and CRM workflows through a server-side API boundary.

## Core records

| Record | Responsibility |
|---|---|
| `listings` | Stable source identity and current listing state |
| `listing_observations` | Append-only scan observations |
| `price_history` | Price baselines and detected changes |
| `deal_scores` | Explainable opportunity classification |
| `duplicate_candidates` | Evidence-backed relationships awaiting review |
| `listing_workflows` | Follow-ups, viewings, negotiation and acquisition costs |
| `saved_searches` | Reusable criteria and digest frequency |
| `scans` | Source health, coverage and failure signals |

## Duplicate-safety rule

Matching automation never merges or deletes listings. It creates or refreshes review candidates, preserves confirmed/rejected decisions and keeps every original advertisement recoverable.

## Removal-safety rule

A listing is marked removed only after a source page is successfully verified as unavailable. CAPTCHA, logout, throttling, access failure and incomplete pagination are recorded as unable to verify—not as removal evidence.

## Public-repository boundary

This edition contains application source, schema migrations and synthetic demo data. Production runtime secrets, hosting identity, raw scan exports, browser sessions, personal CRM notes and live database contents remain outside Git.
