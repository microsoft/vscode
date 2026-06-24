# [File-Specific Instructions (.instructions.md)](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

Guidelines loaded on-demand when relevant to the current task, or explicitly when files match a pattern.

## Locations

| Path | Scope |
|------|-------|
| `.github/instructions/*.instructions.md` | Workspace |
| `<profile>/instructions/*.instructions.md` | User profile |

## Frontmatter

```yaml
---
description: "<required>"    # For on-demand discovery—keyword-rich
name: "Instruction Name"     # Optional, defaults to filename
applyTo: "**/*.ts"           # Optional, auto-attach for matching files
---
```

## Discovery Modes

| Mode | Trigger | Use Case |
|------|---------|----------|
| **On-demand** (`description`) | Agent detects task relevance | Task-based: migrations, refactoring, API work |
| **Explicit** (`applyTo`) | Files matching glob in context | File-based: language standards, framework rules |
| **Manual** | `Add Context` → `Instructions` | Ad-hoc attachment |

## Template

```markdown
---
description: "Use when writing database migrations, schema changes, or data transformations. Covers safety checks and rollback patterns."
---
# Migration Guidelines

- Always create reversible migrations
- Test rollback before merging
- Never drop columns in the same release as code removal
```

Note the "Use when..." pattern in the description—this helps on-demand discovery.

## Explicit File Matching (optional)

Use `applyTo` when the instruction applies to specific file types or folders:

```yaml
applyTo: "**"                           # ALWAYS included, no matter the file or description (use with caution)
applyTo: "**/*.py"                      # All Python files
applyTo: ["src/**", "lib/**"]           # Multiple patterns (OR)
applyTo: src/**, lib/**                 # Multiple patterns without array syntax (OR)
applyTo: "src/api/**/*.ts"              # Specific folder + extension
```

Applied when creating or modifying matching files, not for read-only operations.

## Core Principles

1. **Keyword-rich descriptions**: Include trigger words for on-demand discovery
2. **One concern per file**: Separate files for testing, styling, documentation
3. **Concise and actionable**: Share context window—keep focused
4. **Show, don't tell**: Brief code examples over lengthy explanations

## Anti-patterns

- **Vague descriptions**: "Helpful coding tips" doesn't enable discovery
- **Overly broad applyTo**: `"**"` with content only relevant to specific files
- **Duplicating docs**: Copy README instead of linking
- **Mixing concerns**: Testing + API design + styling in one file
