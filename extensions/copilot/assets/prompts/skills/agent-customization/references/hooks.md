# [Hooks (.json)](https://docs.github.com/en/copilot/reference/hooks-reference)

Deterministic lifecycle automation for agent sessions. Use hooks to enforce policy, automate validation, and inject runtime context.

Create hooks in the GitHub Copilot hooks format described in the published [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference). Load that reference before writing a hook: it is the source for event names, the fields of each hook entry, the input a hook receives, and the output it can return. Do not rely on memory or on other hook formats.

## Locations

| Path | Scope |
|------|-------|
| `.github/hooks/*.json` at the root of the git repository | Repository (team-shared). The repository root is not always the open folder. |
| `~/.copilot/hooks/*.json` | User |

Never create or edit hook files in `.claude` folders; those belong to Claude Code.

## Configuration Format

Use `"version": 1` and the native camelCase event names from the reference (for example `preToolUse`), not PascalCase names such as `PreToolUse`. A PascalCase event name is read as a different, deprecated format whose input and output differ, so the hook can load and silently do nothing.

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/check-tool.sh",
        "powershell": "./scripts/check-tool.ps1"
      }
    ]
  }
}
```

Take every field name, input field and output field from the reference, and confirm them there for the event you use.

## Hooks vs Other Customizations

| Primitive | Behavior |
|------|-------|
| Instructions / Prompts / Skills / Agents | Guidance (non-deterministic) |
| Hooks | Runtime enforcement and deterministic automation |

Use hooks when behavior must be guaranteed (for example: block dangerous commands, force validation, auto-inject context).

## Core Principles

1. Keep hooks small and auditable
2. Validate and sanitize hook inputs
3. Avoid hardcoded secrets in scripts
4. Prefer repository hooks for team policy, user hooks for personal automation

## Anti-patterns

- Running long hooks that block normal flow
- Using hooks where plain instructions are sufficient
- Letting agents edit hook scripts without approval controls
