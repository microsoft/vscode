# Copilot Agent Runtime — Customization Surface Spec

> **Purpose:** Definitive reference for every customization mechanism that affects agent behavior when a user sends a message. Intended for building a UI that collects all customizations into a single view.
>
> **Source:** `github/copilot-agent-runtime` codebase as of 2026-02-25.

> Some information has been removed by the human compiling this spec, scoping to what is deemed most relevant for the sessions window implementation. For the full details, see the source code (for maintainers likely checked out side-by-side).

---

## Overview

When a user sends a message, the agent assembles its behavior from **10 customization categories**, each discovered from well-known file paths, environment variables, or runtime APIs. This document enumerates every source, file pattern, and merge rule.

---

## 1. Instructions

System-prompt additions that shape how the agent responds. Multiple sources are discovered and merged in priority order.

### 1.1 Repo-Level Instruction Files

Each pattern is defined in `src/helpers/repo-helpers.ts` → `instructionPatterns`:

| Convention | File Pattern | Notes |
|------------|-------------|-------|
| Copilot | `{repo}/.github/copilot-instructions.md` | Primary repo instructions |
| Codex / OpenAI | `{repo}/AGENTS.md` | OpenAI model convention |
| Claude / Anthropic | `{repo}/CLAUDE.md` | Claude model convention |
| Claude (alt) | `{repo}/.claude/CLAUDE.md` | Secondary Claude location |
| Gemini / Google | `{repo}/GEMINI.md` | Gemini model convention |

### 1.2 VSCode-Style Instruction Files

Glob-matched instruction files with metadata (applyTo patterns, description).

| Scope | File Pattern | Code Reference |
|-------|-------------|----------------|
| Repo | `{repo}/.github/instructions/**/*.instructions.md` | `readVSCodeInstructions()` |
| User | `~/.copilot/instructions/**/*.instructions.md` | `readUserCopilotInstructions()` |

### 1.3 User-Level Instructions

| Scope | File Pattern | Code Reference |
|-------|-------------|----------------|
| User global | `~/.copilot/copilot-instructions.md` | `hasHomeCopilotInstructions()` |

### 1.4 CWD-Specific Instructions

When the working directory differs from the repo root, the same instruction patterns are re-checked relative to `{cwd}`:

- `{cwd}/.github/copilot-instructions.md`
- `{cwd}/CLAUDE.md`, `{cwd}/.claude/CLAUDE.md`
- `{cwd}/AGENTS.md`
- `{cwd}/GEMINI.md`

### 1.5 Nested / Child Instructions

Breadth-first traversal from `{cwd}` up to **2 levels deep** (`CHILD_INSTRUCTIONS_MAX_DEPTH = 2`), scanning all instruction patterns in subdirectories.

**Ignored directories:** `node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`, `.nuxt`, `out`, `coverage` (plus `.gitignore` patterns when available).

Feature-gated via `enableChildInstructions` option.

### 1.6 Additional Sources

| Source | Mechanism |
|--------|-----------|
| Env var | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` — comma-separated list of additional directories to scan |
| Organization | `RuntimeContext.organizationCustomInstructions` — injected at runtime via API (not file-based) |

### 1.7 Merge Order

Instructions are concatenated in this order (all additive):

1. User global (`~/.copilot/copilot-instructions.md`)
2. Repo-level instruction files (all patterns above)
3. VSCode-style instruction files (repo, then user)
4. CWD-specific overrides (when cwd ≠ repo root)
5. Child/nested instructions
6. Organization instructions (API-injected)

Duplicate content is deduplicated by file content hash.

---

## 2. Skills

Reusable prompt-based capabilities exposed as `/skill-name` slash commands.

### 2.1 Discovery Paths

| Source | File Pattern | Code Reference |
|--------|-------------|----------------|
| Repo (Copilot) | `{repo}/.github/skills/*/SKILL.md` | `loader.ts` collectProjectDirs |
| Repo (Agents) | `{repo}/.agents/skills/*/SKILL.md` | `loader.ts` collectProjectDirs |
| Repo (Claude) | `{repo}/.claude/skills/*/SKILL.md` | `loader.ts` collectProjectDirs |
| User (Copilot) | `~/.copilot/skills/*/SKILL.md` | `loader.ts` personalDirs |
| User (Claude) | `~/.claude/skills/*/SKILL.md` | `loader.ts` personalDirs |
| Env var | Dirs listed in `COPILOT_SKILLS_DIRS` (comma-separated) | `loader.ts` |
| Plugins | `{pluginRoot}/skills/*/SKILL.md` | `skills.ts` |

### 2.2 File Structure

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```
.github/skills/
  my-skill/
    SKILL.md       ← markdown with frontmatter
```

Or a flat `SKILL.md` directly in the skills directory (single-skill mode).

### 2.3 Frontmatter Schema

```yaml
---
name: skill-name                      # Optional; derived from folder name if absent
description: "What this skill does"   # Optional; derived from first 3 lines of body
allowed-tools: grep,view              # Comma-separated tool whitelist (optional)
user-invocable: true                  # Whether user can invoke via slash command (default: true)
disable-model-invocation: false       # Whether model can invoke autonomously (default: false)
---

Skill prompt content here...
```

---

## 3. Commands

A variant of skills, loaded from `.claude/commands/` only.

| Source | File Pattern | Code Reference |
|--------|-------------|----------------|
| Project | `{repo}/.claude/commands/*.md` | `loader.ts` getCommandDirectories |
| User | `~/.claude/commands/*.md` | `loader.ts` getCommandDirectories |

**Note:** Commands use only the `.claude/` convention — not `.github/` or `.agents/`.

Any `.md` file in the directory is treated as a command. Same frontmatter schema as skills. Treated internally as skills with `isCommand: true`. Skills take priority over commands on name conflicts.

---

## 4. Custom Agents

Sub-agent definitions available via the task tool or direct user selection.

### 4.1 Discovery Paths

| Source | File Pattern | Code Reference |
|--------|-------------|----------------|
| Repo (Copilot) | `{repo}/.github/agents/*.md`, `*.agent.md` | `useCustomAgents.ts` |
| Repo (Claude) | `{repo}/.claude/agents/*.md`, `*.agent.md` | `useCustomAgents.ts` |
| User (Copilot) | `~/.github/agents/*.md`, `*.agent.md` | `useCustomAgents.ts` |
| User (Claude) | `~/.claude/agents/*.md`, `*.agent.md` | `useCustomAgents.ts` |
| Plugins | `{pluginRoot}/agents/*.md`, `*.agent.md` | `agent-loader.ts` |
| Builtin | `src/agents/definitions/*.agent.yaml` | YAML agent loader |

### 4.2 Priority Rules

- `*.agent.md` takes precedence over `*.md` when both exist for the same base name.
- `.github/agents/` sources have higher priority than `.claude/agents/`.

### 4.3 Frontmatter Schema

```yaml
---
name: agent-name
displayName: "Human-Readable Name"
description: "What this agent does"
tools: ["*"]                          # or ["tool1", "tool2"] — required
model: claude-sonnet-4-20250514                  # Optional model override
disableModelInvocation: false         # Cannot be auto-invoked as a tool
userInvocable: true                   # User can select it
mcp-servers:                          # Inline MCP server config (optional)
  server-name:
    command: "npx"
    args: ["@some/mcp-server"]
---

Agent system prompt content here...
Supports {{cwd}} placeholder.
```

---

## 5. MCP Servers

Model Context Protocol servers that expose additional tools and resources.

### 5.1 Config Sources (merge order, last wins)

| Priority | Source | File Pattern | Code Reference |
|----------|--------|-------------|----------------|
| 1 (lowest) | User | `~/.copilot/mcp-config.json` | `mcp-config.ts` |
| 2 | Workspace | `{cwd}/.mcp.json` | `mcpConfigMerger.ts` |
| 3 | VSCode | `{cwd}/.vscode/mcp.json` | `vsCodeWorkspaceMcpConfig.ts` |
| 4 | Plugins | `{pluginRoot}/.mcp.json`, `{pluginRoot}/.github/mcp.json` | `mcp-loader.ts` |
| 5 | Windows ODR | Registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Mcp` | `odrMcpRegistry.ts` |
| 6 (highest) | CLI flag | `--additional-mcp-config <json\|@filepath>` | `mcpConfigMerger.ts` |

### 5.2 Config Schema

```json
{
  "mcpServers": {
    "server-name": {
      "type": "local | http | sse",
      "command": "path/to/server",
      "args": ["--flag"],
      "cwd": "/optional/working/dir",
      "env": {
        "KEY": "$ENV_VAR",
        "URL": "https://${HOST}:${PORT}",
        "WITH_DEFAULT": "${VAR:-fallback}"
      },
      "url": "https://remote-server/endpoint",
      "headers": { "Authorization": "Bearer ${TOKEN}" },
      "tools": ["*"],
      "timeout": 30000,
      "filterMapping": "hidden_characters | markdown | none",
      "displayName": "My Server",
      "oauthClientId": "client-id",
      "oauthPublicClient": false
    }
  }
}
```

**Environment variable expansion:** `$VAR`, `${VAR}`, `${VAR:-default}` are all supported in `env`, `args`, `url`, and `headers` fields.

---

## 6. Hooks

Scripts that execute at specific agent lifecycle events, with the ability to approve/deny/modify behavior.

### 6.1 Config Sources

| Source | File Pattern | Code Reference |
|--------|-------------|----------------|
| Config dirs | `{configDir}/**/*.json` | `hookConfigLoader.ts` |
| Plugins | `{pluginRoot}/hooks.json` | `hooks.ts` |
| Plugins (alt) | `{pluginRoot}/hooks/hooks.json` | `hooks.ts` |
| Plugin manifest | Inline in `plugin.json` → `hooks` field (object) | `hooks.ts` |

### 6.2 Hook Events

| Event | Trigger | Can Modify? |
|-------|---------|-------------|
| `sessionStart` | Session begins | No (informational) |
| `sessionEnd` | Session ends | No (informational) |
| `userPromptSubmitted` | User sends a message | Yes (can modify prompt) |
| `preToolUse` | Before tool execution | Yes (allow / deny / modify args) |
| `postToolUse` | After tool execution | Yes (can modify result) |
| `errorOccurred` | Error happens | Yes (retry / skip / abort) |
| `agentStop` | Main agent finishes | Yes (can force continuation) |
| `subagentStop` | Sub-agent completes | Yes (can force continuation) |

### 6.3 Config Schema

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "command": "bash",
        "args": ["-c", "echo checking"],
        "cwd": "/optional/cwd",
        "env": { "KEY": "value" },
        "timeout": 30000
      }
    ]
  }
}
```

---

## 7. Plugins

Bundles that install combinations of skills, agents, hooks, and MCP servers.

### 7.1 Plugin Manifest Locations

Within a plugin repository, the manifest is searched at:

| File Pattern | Code Reference |
|-------------|----------------|
| `plugin.json` | `marketplace-loader.ts` PLUGIN_JSON_PATHS |
| `.github/plugin/plugin.json` | `marketplace-loader.ts` PLUGIN_JSON_PATHS |
| `.claude-plugin/plugin.json` | `marketplace-loader.ts` PLUGIN_JSON_PATHS |


Each field (`skills`, `agents`, `hooks`) can be a string path, array of paths, or (for hooks) an inline object.

---

## Appendix A: XDG Base Directory Compliance

All `~/.copilot/` paths respect XDG overrides:

| Type | Default | XDG Override |
|------|---------|-------------|
| Config files | `~/.copilot/` | `$XDG_CONFIG_HOME/.copilot/` |
| State/cache | `~/.copilot/` | `$XDG_STATE_HOME/.copilot/` |

The base directory name is always `.copilot` (`APP_DIRECTORY` in `path-helpers.ts`).

---

## Appendix B: Complete Discovery Summary

```
Message received
 │
 ├─ Feature flags resolved
 │   ├─ Tier defaults
 │   ├─ config.json → feature_flags.enabled
 │   └─ Env vars (COPILOT_CLI_ENABLED_FEATURE_FLAGS, individual)
 │
 ├─ System prompt assembled
 │   ├─ Base agent prompt
 │   ├─ User instructions      ~/.copilot/copilot-instructions.md
 │   ├─ Repo instructions       .github/copilot-instructions.md, AGENTS.md, CLAUDE.md, GEMINI.md
 │   ├─ VSCode instructions     .github/instructions/**/*.instructions.md
 │   ├─ CWD instructions        (when cwd ≠ repo root)
 │   ├─ Child instructions      (depth=2 traversal)
 │   └─ Org instructions        (API-injected)
 │
 ├─ Tools assembled
 │   ├─ Built-in tools
 │   ├─ MCP servers             ~/.copilot/mcp-config.json + .mcp.json + .vscode/mcp.json + plugins
 │   └─ Content exclusion       (org API restrictions applied)
 │
 ├─ Skills listed               .github/skills/ + .agents/skills/ + .claude/skills/ + personal + plugins
 ├─ Commands listed             .claude/commands/ + personal
 ├─ Custom agents listed        .github/agents/ + .claude/agents/ + personal + plugins
 │
 ├─ userPromptSubmitted hooks fire
 │
 ├─ Model selected              config.json → model, agent override, or default
 │
 ├─ For each tool call:
 │   ├─ preToolUse hooks        (allow / deny / modify)
 │   ├─ Permission check
 │   ├─ Firewall policy
 │   ├─ Tool executes
 │   └─ postToolUse hooks       (modify result)
 │
 └─ Session telemetry emitted
```
