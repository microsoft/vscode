# [Hooks (.json)](https://code.visualstudio.com/docs/copilot/customization/hooks)

Deterministic lifecycle automation for agent sessions. Use hooks to enforce policy, automate validation, and inject runtime context.

## Locations

| Path | Scope |
|------|-------|
| `.github/hooks/*.json` | Workspace (team-shared) |
| `.claude/settings.local.json` | Workspace local (not committed) |
| `.claude/settings.json` | Workspace |
| `~/.claude/settings.json` | User profile |

Hooks from all configured locations are collected and executed; workspace and user hooks do not override each other.

## Hook Events

| Event | Trigger |
|------|-------|
| `SessionStart` | First prompt of a new agent session |
| `UserPromptSubmit` | User submits a prompt |
| `PreToolUse` | Before tool invocation |
| `PostToolUse` | After successful tool invocation |
| `PreCompact` | Before context compaction |
| `SubagentStart` | Subagent starts |
| `SubagentStop` | Subagent ends |
| `Stop` | Agent session ends |

## Configuration Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "./scripts/validate-tool.sh",
        "timeout": 15
      }
    ]
  }
}
```

Each hook command supports:
- `type` (must be `command`)
- `command` (default)
- `windows`, `linux`, `osx` (platform overrides)
- `cwd`, `env`, `timeout`

## Input / Output Contract

Hooks receive JSON on stdin and can return JSON on stdout.

- Common output: `continue`, `stopReason`, `systemMessage`
- `PreToolUse` permissions are read from `hookSpecificOutput.permissionDecision` (`allow` | `ask` | `deny`)
- `PostToolUse` output can block further processing with `decision: block`

`PreToolUse` example output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "Needs user confirmation"
  }
}
```

Exit codes:
- `0` success
- `2` blocking error
- Other values produce non-blocking warnings

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
4. Prefer workspace hooks for team policy, user hooks for personal automation

## Anti-patterns

- Running long hooks that block normal flow
- Using hooks where plain instructions are sufficient
- Letting agents edit hook scripts without approval controls
