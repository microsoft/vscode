---
phase: 5
name: Scope Assessment
status: pending
priority: medium
---

# Phase 5: Scope Assessment

## Context

- Superpowers brainstorming assesses if project too large for single spec
- Multi-subsystem requests decomposed into sub-projects
- CKE brainstorm/plan don't have this gate

## Overview

Add scope assessment step to `brainstorm` and `plan` SKILL.md.

## Files to Modify

- `.claude/skills/brainstorm/SKILL.md`
- `.claude/skills/plan/SKILL.md`

## Implementation Steps

### 1. Add Scope Assessment to `brainstorm/SKILL.md`

Insert in "Your Process" list, after step 2 (Discovery Phase):

```markdown
3. **Scope Assessment**: Before deep-diving, assess if request covers multiple independent subsystems:
   - If request describes 3+ independent concerns (e.g., "build platform with chat, billing, analytics") → flag immediately
   - Help user decompose into sub-projects: identify pieces, relationships, build order
   - Each sub-project gets its own brainstorm → plan → implement cycle
   - Don't spend questions refining details of a project that needs decomposition first
```

### 2. Add Scope Check to `plan/SKILL.md`

Insert as a note in "## Workflow Process" step 4 (Codebase Analysis):

```markdown
**Scope Check:** If spec/requirements cover multiple independent subsystems, suggest breaking into separate plans — one per subsystem. Each plan should produce working, testable software on its own. Flag to user if decomposition needed.
```

## Todo

- [ ] Add scope assessment step to `brainstorm/SKILL.md` process
- [ ] Add scope check note to `plan/SKILL.md` workflow
- [ ] Renumber brainstorm process steps if needed

## Success Criteria

- Over-scoped requests flagged early in brainstorming
- Plans for multi-subsystem work suggest decomposition
- Each sub-project independently testable
