# Docs Commands Optimization: Ambitious Token Reduction That Stalled

**Date**: 2025-11-14 11:39
**Severity**: Medium
**Component**: Documentation System Commands
**Status**: Archived (Under Review, Never Implemented)

## What Happened

Created implementation plan to reduce `/docs:init`, `/docs:update`, and `/docs:summarize` token consumption by 40-60% through smart caching, incremental updates, agent prompt optimization, and command refinement. Plan analyzed exact token waste sources: 38,868 tokens per repomix scan, broad directory reads, redundant parallel scouts, missing cache layer. Documented 4 phases with specific token savings targets for each. Plan status: "Under Review." Implementation status: zero.

## The Brutal Truth

This one hurts because it's addressing real operational waste. Every time someone runs `/docs:update`, they're burning 40,000+ tokens on a full repository scan when probably 10% of the codebase changed. The token math is brutal and unnecessary. We identified it clearly. We planned how to fix it. And then we... didn't.

The frustrating part is this is the kind of optimization that pays dividends over time. Every skipped `/docs:update` saves 15,000-20,000 tokens. If this codebase averages 3 doc updates per week, that's 2.3 million tokens wasted per year on a problem with a known, 4-phase solution.

What's particularly galling: the plan is solid. Not aspirational, not fluffy-feely. Concrete: git-based change detection, metadata tracking, conditional execution logic. 4-phase roadmap starting with 15-20% savings (Phase 1) and building to 40-60% total (all phases). We could have been running Phase 1 within days.

Instead, "Under Review" became code for "waiting for perfect conditions that won't arrive."

## Technical Details

**Current token waste sources:**

1. Full repomix scans: 38,868 tokens per execution (scanning files that haven't changed)
2. Broad directory reads: all 6-8 docs in `./docs` folder each time, even if only 1 changed
3. Redundant scouts: multiple parallel `/scout` commands rescanning same directories
4. No caching: zero memory of what was scanned last execution
5. Verbose agent: 119-line docs-manager prompt with redundant instructions
6. Bulk updates: updates all docs simultaneously instead of targeting changed files

**Proposed 4-phase fix:**

**Phase 1: Smart Caching System** (15-20% savings)
- Git-based change detection: only scan files modified since last docs run
- Conditional repomix execution: skip full scan if only docs changed
- Metadata tracking: record timestamp of last successful scan
- Cache invalidation logic: fallback to full scan on git conflicts

Implementation: Add `.cache` metadata tracking, git diff integration, conditional logic in command prompts

**Phase 2: Incremental Updates** (additional 15-20% savings)
- Target specific docs instead of all 6-8
- Smart file selection: analyze git changes, map to relevant docs
- Diff-based detection: skip docs that definitely didn't need updates
- Granular control: allow `--target project-overview` to update only one doc

Implementation: Extend docs-manager to accept doc list, skip unmodified targets

**Phase 3: Agent Prompt Optimization** (additional 5-10% savings)
- Streamline docs-manager prompt: remove redundant instructions
- Consolidate workflow sections: eliminate repeated guidance
- Optimize skill references: reference docs instead of inline definitions
- Cut verbose explanations: 119-line prompt → 85-90 lines

Implementation: Refactor prompt file, validate all guidance still present

**Phase 4: Command Refinement** (additional 5-10% savings)
- Optimize command prompts: similar consolidation
- Better argument handling: explicit flags reduce ambiguity
- Conditional scanning: `--quick` flag skips full repomix
- Improved defaults: sensible behavior without verbose setup

Implementation: Update slash command definitions, add flag handling

**Cumulative impact:** 40-60% token reduction, documented with specific metrics for each phase

## What We Tried

The plan was created. Added to Under Review status. Awaiting user feedback. That's where it sits. No Phase 1 attempt. No validation of the approach. No small experiment to test change detection logic.

The "Under Review" status became a holding pattern. Not rejected. Not scheduled. Just... paused indefinitely.

## Root Cause Analysis

**Why optimization plans die:**

1. **Token savings are invisible until measured**: You don't SEE 15,000 tokens being wasted. It's an abstraction. "Implement feature X" is visible and concrete. "Stop wasting tokens" is theoretical until you measure it

2. **Premature optimization narrative**: Part of development culture says "don't optimize before you know it's a problem." This IS a known problem (38k tokens per run, documented clearly), but the narrative still applies: "maybe users don't care"

3. **Complexity perception**: "Smart caching" and "metadata tracking" sound complicated. Phase 1 is actually straightforward git integration + conditional logic. But the words sounded harder than the code is

4. **Low stakeholder pressure**: If a user complains "docs commands are too slow," that creates urgency. Nobody explicitly asked for token reduction. Budget is abstract

5. **Competing narrative**: "We should focus on features, not optimization." Valid point. But this is optimization that frees resources for features. That nuance gets lost

6. **Planning created false progress**: Once the plan was documented with all 4 phases mapped out, it felt complete. The work of creating the plan satisfied the need to address the problem. Actual implementation felt like redundant effort

## Lessons Learned

**What the plan got right:**
- Clear problem identification (38,868 tokens per repomix)
- Specific source analysis (4 distinct waste vectors)
- Phase-based approach with incremental delivery
- Measurable success criteria (40-60% reduction target)
- Risk identification and mitigation strategies
- Phase-specific token savings estimates (transparency about what each phase buys)

**What we should have done differently:**
- Started with Phase 1 IMMEDIATELY rather than "Under Review"
- Built proof of concept for git-based change detection (1-2 hours)
- Measured actual token usage before and after Phase 1
- Set execution date in the plan itself: "Phase 1: November 15-16"
- Made "Under Review" status active: "Review complete, Phase 1 starts X date"

**Pattern to prevent:**
- Optimization plans can't sit in review longer than 48 hours or energy dissipates
- Phase 1 should be executable within 3-5 hours or scope is too big
- Proof-of-concept for novel approaches (git change detection) should happen before full planning
- "Under Review" must transition to either "Rejected" or "In Progress" - no indefinite holding

## Impact

Real opportunity cost. Every `/docs:update` run continues to waste 15,000-25,000 tokens unnecessarily. Over a quarter, that's hundreds of thousands of tokens that could have been optimized away with 2-3 days of focused work.

Additionally, this plan demonstrates a pattern: we create excellent plans but struggle with execution. Developers see the plan quality and assume execution will follow. Instead, execution stalls and we create new plans. It's a cycle that feels productive (we're planning!) but doesn't move the project forward.

## Next Steps

Three options:

**Option 1: Execute Phase 1 immediately**
Dedicate 4-5 hours this week to implement git-based change detection and conditional repomix execution. Measure actual token savings. If successful (15-20% reduction achieved), schedule Phase 2. This is the path if optimization is actually a priority.

**Option 2: Deprioritize explicitly**
Decide `/docs:*` command token consumption is acceptable. Document the decision: "Sacrificing optimization for implementation simplicity." Archive the plan. Move resources to feature work. This is valid if true.

**Option 3: Redesign for execution**
Take Phase 1 only. Ignore Phases 2-4 for now. Get smart caching working. Prove the concept. Then decide if further phases are worth it. This is the realistic path given our track record.

Currently we're in limbo, which is the worst option: we've acknowledged the problem, designed a solution, and are doing nothing about it.

That's a decision we're making implicitly every day this plan remains unstarted. Explicitly, it should be made once: "We will execute this" or "We won't execute this," with clear reasoning either way.

The plan is sound. The execution is missing. Those are two separate problems, and pretending they'll resolve themselves is how we got here.
