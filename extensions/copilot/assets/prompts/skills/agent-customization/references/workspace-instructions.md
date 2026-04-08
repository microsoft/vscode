# [Workspace Instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

Guidelines that automatically apply to all chat requests across your entire workspace.

## File Types (Choose One)

| File | Location | Purpose |
|------|----------|---------|
| `copilot-instructions.md` | `.github/` | Project-wide standards (recommended, cross-editor) |
| `AGENTS.md` | Root or subfolders | Open standard, monorepo hierarchy support |

Use **only one**—not both.

## AGENTS.md Hierarchy

For monorepos, the closest file in the directory tree takes precedence:

```
/AGENTS.md              # Root defaults
/frontend/AGENTS.md     # Frontend-specific (overrides root)
/backend/AGENTS.md      # Backend-specific (overrides root)
```

Use nested `AGENTS.md` files for monorepos when different areas need different defaults.

## Template

Only include sections the workspace benefits from:

```markdown
# Project Guidelines

## Code Style
{Language and formatting preferences—reference key files that exemplify patterns}

## Architecture
{Major components, service boundaries, the "why" behind structural decisions}

## Build and Test
{Commands to install, build, test—agents will attempt to run these}

## Conventions
{Patterns that differ from common practices—include specific examples}
```

For large repos, link to detailed docs instead of embedding: `See docs/TESTING.md for test conventions.`

## When to Use

- General coding standards that apply everywhere
- Team preferences shared through version control
- Project-wide requirements (testing, documentation)

## Core Principles

1. **Minimal by default**: Only what's relevant to *every* task
2. **Concise and actionable**: Every line should guide behavior
3. **Link, don't embed**: Reference docs instead of copying content. Search for existing docs (`docs/**/*.md`, `CONTRIBUTING.md`, etc.) and catalog what they cover—only inline agent-critical gotchas not documented elsewhere
4. **Keep current**: Update when practices change

## Anti-patterns

- **Using both file types**: Having both `copilot-instructions.md` and `AGENTS.md`
- **Kitchen sink**: Everything instead of what matters most
- **Duplicating docs**: Copying README instead of linking
- **Obvious instructions**: Conventions already enforced by linters
