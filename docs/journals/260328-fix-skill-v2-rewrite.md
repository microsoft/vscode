# Fix Skill v2.0 Rewrite: Eliminating Guesswork from Bug Diagnosis

**Date**: 2026-03-28 12:35
**Severity**: High
**Component**: `ck:fix` skill (v1.2.0 → v2.0.0)
**Status**: Complete

## What Happened

Rewrote the fix skill pipeline from 5 steps to 7 steps, replacing guesswork-based diagnosis with structured analysis. The v1.2.0 pipeline had a critical flaw: Step 2 literally said "Guess all possible root causes" instead of performing systematic diagnosis.

## The Brutal Truth

This was a design failure that should've been caught earlier. The skill was teaching users to jump to hypotheses without understanding the codebase context first. Step 2 didn't diagnose — it guessed. And "conditional" skill activation meant debugging happened only when already stuck. Every user following this pipeline was potentially fixing symptoms instead of root causes, leaving the actual bugs to resurface later.

## Technical Details

**Old pipeline (v1.2.0):**
1. Context gathering
2. Debug (literally: "guess all possible root causes")
3. Hypothesis prioritization
4. Fix implementation
5. Verification (vague: "spawn Explore subagents")

**New pipeline (v2.0):**
1. Mode selection
2. Scout (MANDATORY) — understand codebase structure before diagnosing
3. Diagnose (not "debug") — structured analysis via `ck:sequential-thinking` + `ck:debug`
4. Complexity assessment + task orchestration
5. Fix implementation
6. Verify + prevent (mandatory regression test + defense-in-depth)
7. Finalize

**Mandatory skill activation changed from 1 to 3:**
- `ck:scout` — always first
- `ck:debug` + `ck:sequential-thinking` — always for diagnosis
- `ck:problem-solving` — auto-triggers when 2+ hypotheses fail (was "conditional")

## What We Tried

- **Approach A** (surgical enhancement): Minor tweaks to existing steps. Rejected: wouldn't fix the structural "guess" problem.
- **Approach C** (pure skill chaining): Mandate chaining without reordering pipeline. Rejected: bloated SKILL.md without addressing root order issue.
- **Approach B + C blend** (chosen): Rewrite pipeline to enforce scout→diagnose→fix→prevent order + mandatory skill chaining.

## Root Cause Analysis

Original design assumed diagnosis could happen in isolation. It couldn't. Guessing without context meant hypothesis formation before understanding what you're fixing. Conditional skill activation meant users had to fail first, then debug. Prevention step was absent entirely — fix = tests pass, no guards against recurrence.

## Lessons Learned

1. **Order matters more than content** — Scout before diagnose. Understand before hypothesize. Baseline before fixing.
2. **"Conditional" is a trap** — If a skill prevents recurring issues, make it mandatory, not optional.
3. **Verification needs teeth** — "Verify no regressions" is vague. "Iron-law: mandatory before/after comparison + regression test + defense-in-depth" is clear.
4. **Prevention is not optional** — Every fix should leave guards against recurrence. Not "nice to have."

## Next Steps

- Users upgrading from v1.2.0 get better diagnosis workflows automatically
- Monitor adoption to ensure scout phase doesn't feel like overhead
- Consider similar pipeline audit on other skills (investigate, implement, etc.)

**Files modified**: 10 (1 rewrite, 2 new references, 7 updates)
**Breaking changes**: None (entry point and arguments unchanged)
**Backward compatibility**: Full
