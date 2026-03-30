---
phase: 3
name: Two-Stage Code Review
status: pending
priority: high
---

# Phase 3: Two-Stage Code Review

## Context

- Superpowers separates review into: (1) Spec compliance, (2) Code quality
- Catches well-written code that doesn't match requirements
- CKE currently does single-pass review via `code-reviewer` agent
- CKE already has `verification-before-completion.md` reference — good foundation

## Overview

Add two-stage review protocol to `code-review` skill: spec compliance first, then code quality. Create new reference file for spec compliance review.

## Files to Modify

- `.claude/skills/code-review/SKILL.md` — add two-stage flow to Quick Decision Tree
- `.claude/skills/code-review/references/spec-compliance-review.md` — NEW reference

## Files to Read (no modify)

- `.claude/skills/code-review/references/requesting-code-review.md`
- `.claude/skills/code-review/references/verification-before-completion.md`
- `.claude/agents/code-reviewer.md`

## Implementation Steps

### 1. Create `spec-compliance-review.md` Reference

New file at `.claude/skills/code-review/references/spec-compliance-review.md`:

```markdown
---
name: spec-compliance-review
description: First-pass review checking implementation matches spec/plan requirements before quality review
---

# Spec Compliance Review

## Purpose

Verify implementation matches what was requested BEFORE evaluating code quality.
Well-written code that doesn't match requirements is still wrong.

## When to Use

- After implementing features from a plan
- Before code quality review pass
- When plan/spec exists for the work being reviewed

## Process

1. **Load spec/plan** — Read the plan.md or phase file that defined this work
2. **List requirements** — Extract every requirement, acceptance criterion
3. **Check each requirement** against actual implementation:
   - Present? → ✅
   - Missing? → ❌ MISSING (must fix before quality review)
   - Extra (not in spec)? → ⚠️ EXTRA (flag for removal unless justified)
4. **Verdict:**
   - All requirements met, no unjustified extras → PASS → proceed to quality review
   - Missing requirements → FAIL → implementer fixes → re-review
   - Unjustified extras → WARN → discuss with user

## Checklist Template

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | [from spec] | ✅/❌/⚠️ | [evidence] |
| 2 | ... | ... | ... |

## Red Flags

- Skipping spec review because "code looks good"
- Accepting extra features without spec justification
- Treating spec review as optional
```

### 2. Update `code-review/SKILL.md` Quick Decision Tree

Replace current Quick Decision Tree with two-stage version:

```markdown
## Quick Decision Tree

`` `
SITUATION?
│
├─ Received feedback → STOP if unclear, verify if external, implement if human partner
├─ Completed work from plan/spec:
│   ├─ Stage 1: Spec compliance review (references/spec-compliance-review.md)
│   │   └─ PASS? → Stage 2: Code quality review (code-reviewer subagent)
│   │   └─ FAIL? → Fix missing requirements → Re-review Stage 1
│   └─ Stage 2: Code quality review
│       └─ Scout edge cases → Request code-reviewer subagent
├─ Completed work (no plan) → Scout edge cases → Code quality review only
├─ Pre-landing / ship → Load checklists → Two-pass review (critical + informational)
├─ Multi-file feature (3+ files) → Create review pipeline tasks (scout→review→fix→verify)
└─ About to claim status → RUN verification command FIRST
`` `

### Two-Stage Review Protocol

When a plan or spec exists for the work being reviewed:

**Stage 1 — Spec Compliance** (load `references/spec-compliance-review.md`)
- Does code match what was requested?
- Any missing requirements?
- Any unjustified extras?
- MUST pass before Stage 2

**Stage 2 — Code Quality** (existing code-reviewer subagent flow)
- Only runs AFTER spec compliance passes
- Standards, security, performance, edge cases
```

### 3. Update `code-review/SKILL.md` Practices Table

Add spec compliance row:

```markdown
| Practice | When | Reference |
|----------|------|-----------|
| **Spec compliance** | After implementing from plan/spec, BEFORE quality review | `references/spec-compliance-review.md` |
| Receiving feedback | ... | ... |
```

## Todo

- [ ] Create `references/spec-compliance-review.md`
- [ ] Update Quick Decision Tree in `code-review/SKILL.md` with two-stage flow
- [ ] Add spec compliance to Practices table
- [ ] Verify code-reviewer agent prompt doesn't conflict

## Success Criteria

- Plan-based implementations get spec compliance check BEFORE quality review
- Missing requirements caught before code quality discussion
- Non-plan work (ad hoc fixes) still gets quality review only (no false gates)
