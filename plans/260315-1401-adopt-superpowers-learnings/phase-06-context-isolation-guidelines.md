---
phase: 6
name: Context Isolation Guidelines
status: pending
priority: medium
---

# Phase 6: Context Isolation Guidelines

## Context

- Superpowers principle: "Subagents receive only the context they need"
- Prevents context window pollution, improves focus, reduces cost
- CKE's `subagent-init` hook injects ~200 tokens of context — good start
- But no explicit guideline about crafting minimal subagent prompts

## Overview

Add context isolation guidelines to `orchestration-protocol.md`.

## Files to Modify

- `.claude/rules/orchestration-protocol.md`

## Implementation Steps

### 1. Add Context Isolation Section

Append after the new "## Subagent Status Protocol" section (from Phase 4):

```markdown
---

## Context Isolation Principle

**Subagents receive only the context they need.** Never pass full session history.

### Rules

1. **Craft prompts explicitly** — Provide task description, relevant file paths, acceptance criteria. Not "here's what we discussed."
2. **No session history** — Subagent gets fresh context. Summarize relevant decisions, don't replay conversation.
3. **Scope file references** — List specific files to read/modify. Not "look at the codebase."
4. **Include plan context** — If working from a plan, provide the specific phase text, not the entire plan.
5. **Preserve controller context** — Coordination work stays in main agent. Don't dump coordination details into subagent prompts.

### Prompt Template

```
Task: [specific task description]
Files to modify: [list]
Files to read for context: [list]
Acceptance criteria: [list]
Constraints: [any relevant constraints]
Plan reference: [phase file path if applicable]

Work context: [project path]
Reports: [reports path]
```

### Anti-Patterns

| Bad | Good |
|-----|------|
| "Continue from where we left off" | "Implement X feature per spec in phase-02.md" |
| "Fix the issues we discussed" | "Fix null check in auth.ts:45, root cause: missing validation" |
| "Look at the codebase and figure out" | "Read src/api/routes.ts and add POST /users endpoint" |
| Passing 50+ lines of conversation | 5-line task summary with file paths |
```

## Todo

- [ ] Add Context Isolation section to `orchestration-protocol.md`

## Success Criteria

- Clear guidelines for crafting minimal subagent prompts
- Anti-pattern table prevents common context pollution
- Prompt template provides consistent structure
