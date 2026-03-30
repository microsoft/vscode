---
name: Adopt Superpowers Learnings into CKE
status: completed
priority: high
branch: goon
date: 2026-03-15
blockedBy: []
blocks: []
---

# Adopt Superpowers Learnings into CKE

> Based on comparative analysis: `plans/reports/brainstorm-260315-1144-superpowers-vs-cke-analysis.md`

**Goal:** Integrate Superpowers' discipline-enforcement mechanisms into CKE's existing skill ecosystem without breaking current workflows.

**Approach:** Add enforcement layers (hard gates, anti-rationalization, process flows, two-stage review, status protocol) to existing CKE skills. Not replacing — augmenting.

**Scope:** Priority 1 & 2 items only. Priority 3-4 deferred.

---

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | Hard Gates & Anti-Rationalization | pending | M | cook, fix, brainstorm SKILL.md |
| 2 | Mermaid Process Flows | pending | M | cook, fix, brainstorm, plan SKILL.md |
| 3 | Two-Stage Code Review | pending | L | code-review SKILL.md + new reference |
| 4 | Implementer Status Protocol | pending | S | orchestration-protocol.md |
| 5 | Scope Assessment | pending | S | brainstorm, plan SKILL.md |
| 6 | Context Isolation Guidelines | pending | S | orchestration-protocol.md |

**Total effort:** ~2-3 hours implementation

---

## Key Constraints

- Skills are markdown — no code changes needed
- Must not break existing `--auto`, `--fast`, `--parallel` modes
- Hard gates must respect user override (CKE principle: user instructions > skill instructions)
- Mermaid (not DOT) for CKE ecosystem consistency
- Keep file sizes under 200 LOC where possible — use references/ for overflow
