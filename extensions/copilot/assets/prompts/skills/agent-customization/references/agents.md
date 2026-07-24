# [Custom Agents (.agent.md)](https://code.visualstudio.com/docs/copilot/customization/custom-agents)

Custom personas with specific tools, instructions, and behaviors. Use for orchestrated workflows with role-based tool restrictions.

## Locations

| Path | Scope |
|------|-------|
| `.github/agents/*.agent.md` | Workspace |
| `<profile>/agents/*.agent.md` | User profile |

## Frontmatter

```yaml
---
description: "<required>"    # For agent picker and subagent discovery
name: "Agent Name"           # Optional, defaults to filename
tools: [search, web]         # Optional: aliases, MCP (<server>/*), extension tools
model: "Claude Sonnet 4"     # Optional; supports fallback entries with per-model defaults
argument-hint: "Task..."     # Optional, input guidance
agents: [agent1, agent2]     # Optional, restrict allowed subagents by name (omit = all, [] = none)
user-invocable: true         # Optional, show in agent picker (default: true)
disable-model-invocation: false  # Optional, prevent subagent invocation (default: false)
handoffs: [...]              # Optional, transitions to other agents
hooks:                       # Optional, inline hooks for this agent's lifecycle events
  PreToolUse:
    - type: command
      command: "./scripts/validate.sh"
  PostToolUse:
    - type: command
      command: "./scripts/format.sh"
---
```

### Invocation Control

| Attribute | Default | Effect |
|-----------|---------|--------|
| `user-invocable: false` | `true` | Hide from agent picker, only accessible as subagent |
| `disable-model-invocation: true` | `false` | Prevent other agents from invoking as subagent |

### Model Fallback

```yaml
model: ['Claude Sonnet 4.6 (copilot)', 'GPT-5.4 (copilot)']  # First available model is used
```

VS Code-target and default-target agents can mix model names with structured entries. Each structured entry requires `name` and can declare `reasoning-effort` and a positive-integer `context-size` cap:

```yaml
model:
  - name: Claude Sonnet 4.6 (copilot)
    reasoning-effort: low
    context-size: 100000
  - GPT-5.4 (copilot)
```

VS Code checks entries in order and selects the first available model. Defaults come from that same entry; an unavailable entry's configuration is never applied to a later fallback. Reasoning effort must be supported by the selected provider. Context size can use a custom value between 10,000 tokens and the model's maximum, including a value that is not one of the provider's advertised picker tiers. If the provider declares a minimum, VS Code uses it; otherwise the minimum is 10,000, capped at the model's maximum.

When the agent is selected manually, declared defaults update that chat editor's model picker and request configuration. A later manual model or configuration choice overrides them until the agent is explicitly selected again or its definition changes.

For each `runSubagent` call, model selection uses this precedence:

1. The call's explicit `model`
2. The named agent's fallback list, or the current agent's list when `agentName` is omitted
3. The parent request model

An explicit model that matches any entry in the applicable agent list receives that entry's defaults, even when it is a later fallback. An explicit model outside the list receives no defaults from the agent. Unavailable, skipped, and differently named entries never contribute configuration.

After selecting the model, its request configuration uses this precedence:

1. The resolved model's current base configuration
2. `reasoning-effort` and `context-size` defaults from the matching agent entry
3. The call's explicit `reasoningEffort` and `contextSize`, applied independently

For example, this named-agent call selects the first available fallback, replaces both defaults for that invocation, and does not change the saved model configuration:

```json
{
  "agentName": "Researcher",
  "prompt": "Investigate the issue",
  "description": "Investigate issue",
  "reasoningEffort": "high",
  "contextSize": 180000
}
```

This call explicitly selects a later entry from `Researcher`'s list. It keeps that entry's `context-size` default while replacing only its reasoning effort:

```json
{
  "agentName": "Researcher",
  "model": "GPT-5.4 (copilot)",
  "prompt": "Investigate the issue",
  "description": "Investigate issue",
  "reasoningEffort": "medium"
}
```

Per-call overrides are validated against the resolved model. Unsupported effort values, missing provider configuration properties, and context sizes outside the model's supported range reject that call so the parent agent can correct it and retry; they do not select a different fallback.

Structured entries are not supported in prompt files, Claude-target agents, or GitHub-target agents.

## Tools

Sources: built-in aliases, specific tools, MCP servers (`<server>/*`), extension tools.

**Special**: `[]` = no tools, omit = defaults. Body reference: `#tool:<name>`

### Tool Aliases

| Alias | Purpose |
|-------|---------|
| `execute` | Run shell commands |
| `read` | Read file contents |
| `edit` | Edit files |
| `search` | Search files or text |
| `agent` | Invoke custom agents as subagents |
| `web` | Fetch URLs and web search |
| `todo` | Manage task lists |

### Common Patterns

```yaml
tools: [read, search]             # Read-only research
tools: [myserver/*]               # MCP server only
tools: [read, edit, search]       # No terminal access
tools: []                         # Conversational only
```

To discover available tools, check your current tool list or use `#tool:` syntax in the body to reference specific tools.

## Template

```markdown
---
description: "{Use when... trigger phrases for subagent discovery}"
tools: [{minimal set of tool aliases}]
user-invocable: false
---
You are a specialist at {specific task}. Your job is to {clear purpose}.

## Constraints
- DO NOT {thing this agent should never do}
- DO NOT {another restriction}
- ONLY {the one thing this agent does}

## Approach
1. {Step one of how this agent works}
2. {Step two}
3. {Step three}

## Output Format
{Exactly what this agent should return}
```

## Invocation

- **Manual**: Agent selector in chat
- **Subagent**: Parent agent delegates based on `description` match (when `infer` allows)

## Core Principles

1. **Single role**: One persona with focused responsibilities per agent
2. **Minimal tools**: Only include what the role needs—excess tools dilute focus
3. **Clear boundaries**: Define what the agent should NOT do
4. **Keyword-rich description**: Include trigger words so parent agents know when to delegate

## Anti-patterns

- **Swiss-army agents**: Too many tools, tries to do everything
- **Vague descriptions**: "A helpful agent" doesn't guide delegation—be specific
- **Role confusion**: Description doesn't match body persona
- **Circular handoffs**: A → B → A without progress criteria

## Inline Hooks

Custom agents support inline `hooks` in frontmatter. These hooks execute shell commands at agent lifecycle points and are scoped to this agent only. The format matches standalone hook files (see [hooks reference](../hooks.md)).

### Supported Events

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`

### Example

```yaml
---
description: "Secure code reviewer that blocks dangerous commands"
tools: [read, search, execute]
hooks:
  PreToolUse:
    - type: command
      command: "./scripts/block-dangerous-cmds.sh"
      timeout: 10
  PostToolUse:
    - type: command
      command: "./scripts/auto-lint.sh"
---
```

Each hook command supports: `type` (must be `command`), `command`, platform overrides (`windows`, `linux`, `osx`), `cwd`, `env`, `timeout`.
