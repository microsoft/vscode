# Optimize Planning Skill: The Draft That Never Took Off

**Date**: 2025-11-11 11:20
**Severity**: Low
**Component**: Planning Skill System
**Status**: Archived (Never Implemented)

## What Happened

Created a plan to refactor the 115-line `planning` skill SKILL.md into 7 focused reference files following patterns from backend-development and web-frameworks skills. Plan included 4 phases: preparation, reference extraction, skill restructuring, and validation. The plan was well-structured, prioritized as Medium. It was never implemented.

## The Brutal Truth

This is the most frustrating kind of failure because the plan was objectively good. Well-written, technically sound, clear phases. And it never got touched. Not because it was bad, but because once the plan was written, something else took priority.

The bitter part of this pattern is recognizing that planning itself can be a form of procrastination. We created a detailed map but never walked the terrain. The skill references would have made planning clearer and more maintainable. That would have helped all subsequent planning work. We chose not to invest 2-3 hours to unblock future efficiency. That's a choice worth examining.

What makes this particularly grating: the problem it solves still exists. The 115-line file is still hard to navigate. New users still get cognitive overload reading the entire SKILL.md. The technical debt is still there, just ignored.

## Technical Details

**Current state:** SKILL.md at `/.claude/skills/planning/SKILL.md` is 115 lines containing all guidance in single file

**Proposed structure:**
```
references/
  01-research-analysis.md
  02-codebase-understanding.md
  03-solution-design.md
  04-plan-creation.md
  05-task-breakdown.md
  06-workflow.md
  07-quality-standards.md
```

**Target:** Reduce SKILL.md to ~50 lines of overview + navigation, with each reference providing focused depth on one aspect.

Similar patterns already established in backend-development (6 references) and web-frameworks (5 references) skills prove this structure works.

## What We Tried

Nothing. The plan was created. No implementation attempt was made. This was a planning-cycle artifact: plan created, attention moved to other priorities, plan archived without execution.

## Root Cause Analysis

Three factors converged:

1. **Priority creep**: Windows statusline (higher priority) consumed team focus
2. **Implementation tax**: Refactoring a skill system requires understanding current implementation, extracting content thoughtfully, validating references work. That takes 2-3 focused hours, and we didn't block that time
3. **Invisible returns**: Unlike Windows statusline (visible to users), skill reference optimization is internal. The benefit is "planning might be 10% clearer." That doesn't create urgency

The real lesson: we don't have a mechanism to track internal technical improvements once planning completes. External features get prioritized because their value is visible. Skill optimization has equal real value but no stakeholder asking for it.

## Lessons Learned

**What we missed:**
- Creating a plan is not completing work. Writing detailed phases doesn't execute them
- Internal optimization needs explicit time allocation or it gets deferred indefinitely
- Medium priority items without external pressure consistently lose to any higher-priority feature
- We should estimate implementation time in the plan itself (this was 2-3 hours) to make scheduling decisions visible

**Pattern to prevent this:**
- Plans with no implementation target date are plans that won't execute
- Distinguish between "plan creation" (thinking work) and "plan implementation" (execution work)
- Medium-priority skill improvements should have dedicated blocks in development schedule
- Create a tracking mechanism for non-feature work that must execute

## Impact

Minimal negative impact. The planning skill still works. Users can read the full SKILL.md if they need depth. The unimplemented refactoring represents potential efficiency, not broken functionality.

However, there's a cumulative cost. Each small unaddressed technical improvement adds friction. New users open SKILL.md and face a wall of text. Developers making small updates to planning guidance have a harder time finding the right place. These small frictions compound.

## Next Steps

Two options:

**Option 1: Actually implement it**
Allocate 3 hours in next planning cycle. Execute Phase 1-4 sequentially. Measure actual time consumed. Validate that planning guidance is clearer post-refactor.

**Option 2: Deprioritize permanently**
Decide the 115-line SKILL.md is acceptable as-is. Document that decision. Stop creating plans for internal optimization if we won't resource them.

We haven't done either. That's the real problem. This plan sits in archive limbo - not rejected, not scheduled, just forgotten.

The rule we broke: **Plans without execution schedules are not plans, they're wish lists.**
