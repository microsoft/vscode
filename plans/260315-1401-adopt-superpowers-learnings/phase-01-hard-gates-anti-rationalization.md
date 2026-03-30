---
phase: 1
name: Hard Gates & Anti-Rationalization Tables
status: pending
priority: high
---

# Phase 1: Hard Gates & Anti-Rationalization Tables

## Context

- Analysis report: `plans/reports/brainstorm-260315-1144-superpowers-vs-cke-analysis.md`
- Superpowers uses `<HARD-GATE>` XML blocks + rationalization tables to prevent LLMs from skipping workflows
- CKE skills have workflow descriptions but no enforcement mechanisms

## Overview

Add `<HARD-GATE>` blocks and anti-rationalization tables to 3 core skills: `cook`, `fix`, `brainstorm`.

## Files to Modify

- `.claude/skills/cook/SKILL.md`
- `.claude/skills/fix/SKILL.md`
- `.claude/skills/brainstorm/SKILL.md`

## Implementation Steps

### 1. Add Hard Gate to `cook/SKILL.md`

Insert after "## Usage" section, before "## Smart Intent Detection":

```markdown
<HARD-GATE>
Do NOT write implementation code until a plan exists and has been reviewed.
This applies regardless of task simplicity. "Simple" tasks are where unexamined assumptions waste the most time.
Exception: `--fast` mode skips research but still requires a plan step.
User override: If user explicitly says "just code it" or "skip planning", respect their instruction.
</HARD-GATE>

## Anti-Rationalization

| Thought | Reality |
|---------|---------|
| "This is too simple to plan" | Simple tasks have hidden complexity. Plan takes 30 seconds. |
| "I already know how to do this" | Knowing ≠ planning. Write it down. |
| "Let me just start coding" | Undisciplined action wastes tokens. Plan first. |
| "The user wants speed" | Fastest path = plan → implement → done. Not: implement → debug → rewrite. |
| "I'll plan as I go" | That's not planning, that's hoping. |
| "Just this once" | Every skip is "just this once." No exceptions. |
```

### 2. Add Hard Gate to `fix/SKILL.md`

Insert after "## Arguments" section, before "## Workflow":

```markdown
<HARD-GATE>
Do NOT propose or implement fixes before completing root cause investigation (Step 2: Debug).
Symptom fixes are failure. Find the cause first.
If 3+ fix attempts fail, STOP and question the architecture — discuss with user before attempting more.
User override: `--quick` mode allows fast debug→fix cycle for trivial issues (lint, type errors).
</HARD-GATE>

## Anti-Rationalization

| Thought | Reality |
|---------|---------|
| "I can see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "Quick fix for now, investigate later" | "Later" never comes. Fix properly now. |
| "Just try changing X" | Random fixes waste time and create new bugs. |
| "It's probably X" | "Probably" = guessing. Verify first. |
| "One more fix attempt" (after 2+) | 3+ failures = wrong approach. Question architecture. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check. |
```

### 3. Add Hard Gate to `brainstorm/SKILL.md`

Insert after "## Your Process" list, before "## Report Output":

```markdown
<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it.
This applies to EVERY brainstorming session regardless of perceived simplicity.
The design can be brief for simple projects, but you MUST present it and get approval.
</HARD-GATE>

## Anti-Rationalization

| Thought | Reality |
|---------|---------|
| "This is too simple to need a design" | Simple projects = most wasted work from unexamined assumptions. |
| "I already know the solution" | Then writing it down takes 30 seconds. Do it. |
| "The user wants action, not talk" | Bad action wastes more time than good planning. |
| "Let me explore the code first" | Brainstorming tells you HOW to explore. Follow the process. |
| "I'll just prototype quickly" | Prototypes become production code. Design first. |
```

## Todo

- [ ] Add `<HARD-GATE>` + anti-rationalization table to `cook/SKILL.md`
- [ ] Add `<HARD-GATE>` + anti-rationalization table to `fix/SKILL.md`
- [ ] Add `<HARD-GATE>` + anti-rationalization table to `brainstorm/SKILL.md`
- [ ] Verify skills still parse correctly (no broken markdown)

## Success Criteria

- Hard gates prevent premature implementation in cook/fix/brainstorm
- Anti-rationalization tables cover common LLM excuse patterns
- User override mechanism preserved (user instructions > skill instructions)
- Existing flags (--auto, --fast, --quick) still work correctly
