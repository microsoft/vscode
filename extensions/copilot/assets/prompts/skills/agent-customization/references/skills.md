# [Agent Skills (SKILL.md)](https://code.visualstudio.com/docs/copilot/customization/agent-skills)

Folders of instructions, scripts, and resources that agents load on-demand for specialized tasks.

## Structure

```
.github/skills/<skill-name>/
├── SKILL.md           # Required (name must match folder)
├── scripts/           # Executable code
├── references/        # Docs loaded as needed
└── assets/            # Templates, boilerplate
```

## Locations

| Path | Scope |
|------|-------|
| `.github/skills/<name>/` | Project |
| `.agents/skills/<name>/` | Project |
| `.claude/skills/<name>/` | Project |
| `~/.copilot/skills/<name>/` | Personal |
| `~/.agents/skills/<name>/` | Personal |
| `~/.claude/skills/<name>/` | Personal |

## SKILL.md Format

```yaml
---
name: skill-name              # Required: 1-64 chars, lowercase alphanumeric + hyphens, must match folder
description: 'What and when to use. Max 1024 chars.'
argument-hint: 'Optional hint shown for slash invocation'
user-invocable: true          # Optional: show as slash command (default: true)
disable-model-invocation: false # Optional: disable automatic model-triggered loading
---
```

### Body

- What the skill accomplishes
- When to use (triggers and use cases)
- Step-by-step procedures
- References to resources: `[script](./scripts/test.js)`

## Template

```markdown
---
name: webapp-testing
description: 'Test web applications using Playwright. Use for verifying frontend, debugging UI, capturing screenshots.'
---

# Web Application Testing

## When to Use
- Verify frontend functionality
- Debug UI behavior

## Procedure
1. Start the web server
2. Run [test script](./scripts/test.js)
3. Review screenshots in `./screenshots/`
```

## Progressive Loading

1. **Discovery** (~100 tokens): Agent reads `name` and `description`
2. **Instructions** (<5000 tokens): Loads `SKILL.md` body when relevant
3. **Resources**: Additional files load only when referenced

Keep file references one level deep from `SKILL.md`.

## Slash Command Behavior

Skills and prompt files both appear after typing `/` in chat.

| Configuration | Slash command | Auto-loaded |
|---|---|---|
| Default (both omitted) | Yes | Yes |
| `user-invocable: false` | No | Yes |
| `disable-model-invocation: true` | Yes | No |
| Both set | No | No |

## When to Use

Repeatable, on-demand workflows with bundled assets (scripts, templates, reference docs).

## Core Principles

1. **Keyword-rich descriptions**: Include trigger words for discovery
2. **Progressive loading**: Keep SKILL.md under 500 lines; use reference files
3. **Relative paths**: Always use `./` for skill resources
4. **Self-contained**: Include all procedural knowledge to complete the task

## Anti-patterns

- **Vague descriptions**: "A helpful skill" doesn't enable discovery
- **Monolithic SKILL.md**: Everything in one file instead of references
- **Name mismatch**: Folder name doesn't match `name` field
- **Missing procedures**: Descriptions without step-by-step guidance