---
phase: 3
name: Multi-Platform Manifests
status: pending
priority: low
---

# Phase 3: Multi-Platform Manifests

## Context

- Superpowers supports: Claude Code, Codex, OpenCode, Gemini CLI, Cursor
- CKE supports: Claude Code, OpenCode
- Gap: Gemini CLI + Cursor plugin manifests for discoverability
- Low priority — CC is primary platform, but manifests are trivial to add

## Overview

Add platform manifests for Gemini CLI and Cursor. Manifests are metadata-only JSON files — no behavior changes.

## Files to Create

- `.claude-plugin/plugin.json` — Claude Code plugin manifest (formalize existing)
- `.cursor-plugin/plugin.json` — Cursor plugin manifest
- `gemini-extension.json` — Gemini CLI extension metadata
- `GEMINI.md` — Gemini CLI context file (maps CKE tools to Gemini equivalents)

## Implementation Steps

### 1. Create `.claude-plugin/plugin.json`

```json
{
  "name": "claudekit-engineer",
  "description": "Comprehensive AI-powered engineering framework with 70+ skills, 14 agents, and workflow automation",
  "version": "2.14.0",
  "author": {
    "name": "ClaudeKit"
  },
  "homepage": "https://claudekit.com",
  "repository": "https://github.com/claudekit/claudekit-engineer",
  "license": "MIT",
  "keywords": ["skills", "agents", "workflow", "engineering", "tdd", "debugging", "planning"]
}
```

### 2. Create `.cursor-plugin/plugin.json`

```json
{
  "name": "claudekit-engineer",
  "displayName": "ClaudeKit Engineer",
  "description": "AI engineering framework: 70+ skills, 14 agents, workflow automation",
  "version": "2.14.0",
  "author": {
    "name": "ClaudeKit"
  },
  "homepage": "https://claudekit.com",
  "repository": "https://github.com/claudekit/claudekit-engineer",
  "license": "MIT",
  "keywords": ["skills", "agents", "workflow", "engineering"],
  "skills": "./.claude/skills/",
  "agents": "./.claude/agents/",
  "commands": "./.claude/commands/",
  "hooks": "./.claude/settings.json"
}
```

### 3. Create `gemini-extension.json`

```json
{
  "name": "claudekit-engineer",
  "description": "AI engineering framework with 70+ skills and 14 agents",
  "version": "2.14.0",
  "contextFileName": "GEMINI.md"
}
```

### 4. Create `GEMINI.md`

Minimal context file that loads core skill references and maps Gemini CLI tools to CKE equivalents.

```markdown
@./.claude/skills/cook/SKILL.md
@./.claude/skills/fix/SKILL.md
@./.claude/skills/brainstorm/SKILL.md

## Gemini CLI Tool Mapping

| CKE Tool | Gemini CLI |
|----------|-----------|
| Read | read_file |
| Write | write_file |
| Edit | replace |
| Bash | shell |
| Glob | list_files |
| Grep | search_files |

**Note:** Gemini CLI does not support subagents. Skills that use subagent-driven workflows will fall back to sequential execution.
```

## Todo

- [ ] Create `.claude-plugin/plugin.json`
- [ ] Create `.cursor-plugin/plugin.json`
- [ ] Create `gemini-extension.json`
- [ ] Create `GEMINI.md`
- [ ] Add `.cursor-plugin/` and `gemini-extension.json` to published files in `package.json`

## Success Criteria

- `gemini extensions install` works with repo URL
- Cursor discovers CKE via plugin manifest
- No changes to existing CC or OpenCode behavior
- Manifests reference correct paths for skills/agents/hooks
