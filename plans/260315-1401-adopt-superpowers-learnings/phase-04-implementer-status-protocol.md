---
phase: 4
name: Implementer Status Protocol
status: pending
priority: medium
---

# Phase 4: Implementer Status Protocol

## Context

- Superpowers defines 4 statuses: DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT
- CKE subagents currently have no standardized status reporting
- Controller (main agent) needs structured way to handle subagent outcomes

## Overview

Add standardized status protocol to `orchestration-protocol.md` rules file.

## Files to Modify

- `.claude/rules/orchestration-protocol.md`

## Implementation Steps

### 1. Add Status Protocol Section

Append after "#### Parallel Execution" section, before "## Agent Teams":

```markdown
---

## Subagent Status Protocol

Subagents MUST report one of these statuses when completing work:

| Status | Meaning | Controller Action |
|--------|---------|-------------------|
| **DONE** | Task completed successfully | Proceed to next step (review, next task) |
| **DONE_WITH_CONCERNS** | Completed but flagged doubts | Read concerns → address if correctness/scope issue → proceed if observational |
| **BLOCKED** | Cannot complete task | Assess blocker → provide context / break task / escalate to user |
| **NEEDS_CONTEXT** | Missing information to proceed | Provide missing context → re-dispatch |

### Handling Rules

- **Never** ignore BLOCKED or NEEDS_CONTEXT — something must change before retry
- **Never** force same approach after BLOCKED — try: more context → simpler task → more capable model → escalate
- **DONE_WITH_CONCERNS** about file growth or tech debt → note for future, proceed now
- **DONE_WITH_CONCERNS** about correctness → address before review
- If subagent fails 3+ times on same task → escalate to user, don't retry blindly

### Reporting Format

Subagents should end their response with:

```
**Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
**Summary:** [1-2 sentence summary]
**Concerns/Blockers:** [if applicable]
```
```

## Todo

- [ ] Add Subagent Status Protocol section to `orchestration-protocol.md`
- [ ] Verify no conflict with existing agent definitions

## Success Criteria

- All subagent statuses have defined controller actions
- Escalation path clear for BLOCKED scenarios
- 3-failure rule prevents infinite retry loops
