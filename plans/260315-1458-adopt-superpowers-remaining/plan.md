---
name: Adopt Remaining Superpowers Features into CKE
status: pending
priority: medium
branch: feat/adopt-superpowers-learnings
date: 2026-03-15
blockedBy: []
blocks: []
---

# Adopt Remaining Superpowers Features: TDD Iron Law · Multi-Platform · Test Infrastructure

> Continues from completed plan: `plans/260315-1401-adopt-superpowers-learnings`
> Based on gap analysis: `plans/reports/brainstorm-260315-1443-superpowers-vs-cke-post-adoption.md`

**Goal:** Close remaining 3 Superpowers advantages with CKE-appropriate implementations.

**Approach:**
- TDD → Optional enforcement mode (`--tdd` flag), not mandatory default
- Multi-platform → Plugin manifests + Gemini extension for discoverability
- Test infra → Skill-triggering tests using `claude -p` headless mode

---

## Phases

| # | Phase | Status | Effort | Priority |
|---|-------|--------|--------|----------|
| 1 | TDD Iron Law (optional mode) | pending | M | High |
| 2 | Skill Test Infrastructure | pending | L | Medium |
| 3 | Multi-Platform Manifests | pending | S | Low |

---

## Key Constraints

- TDD must be opt-in (`--tdd` flag) — CKE serves general-purpose users, not TDD purists
- Test infra requires `claude` CLI in PATH — document as dev dependency
- Plugin manifests must not break existing installation methods
- All changes backward-compatible
