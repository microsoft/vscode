# Claude Session Target — User Guide

This guide covers the **Claude** session target in VS Code Copilot Chat: what it is, how to use it, and every feature available to you.

> **Quick summary:** The Claude session target lets you delegate agentic coding tasks to Anthropic's Claude Agent SDK running locally on your machine — directly inside VS Code's chat UI. It can read your code, run shell commands, edit files, search the web, and iterate autonomously until a task is complete.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Enabling Claude Sessions](#enabling-claude-sessions)
  - [Opening a Claude Session](#opening-a-claude-session)
  - [Choosing a Model](#choosing-a-model)
  - [Thinking Effort](#thinking-effort)
- [Session Options](#session-options)
  - [Permission Mode](#permission-mode)
  - [Folder Selection](#folder-selection)
- [Working with Claude](#working-with-claude)
  - [Sending Messages](#sending-messages)
  - [Attaching Context](#attaching-context)
  - [Tool Confirmations](#tool-confirmations)
  - [Plan Mode](#plan-mode)
  - [Sessions View](#sessions-view)
    - [Opening the Sessions View](#opening-the-sessions-view)
    - [Browsing Past Sessions](#browsing-past-sessions)
    - [Searching and Filtering Sessions](#searching-and-filtering-sessions)
    - [Session Context Menu](#session-context-menu)
    - [Opening an Old Session](#opening-an-old-session)
- [Slash Commands](#slash-commands)
  - [`/memory` — Manage Memory Files](#memory--manage-memory-files)
  - [`/agents` — Create and Manage Subagents](#agents--create-and-manage-subagents)
  - [`/hooks` — Configure Lifecycle Hooks](#hooks--configure-lifecycle-hooks)
  - [`/init` — Initialize a CLAUDE.md](#init--initialize-a-claudemd)
  - [`/review` — Review a Pull Request](#review--review-a-pull-request)
  - [`/pr-comments` — Get PR Comments](#pr-comments--get-pr-comments)
  - [`/simplify` — Review Changed Code](#simplify--review-changed-code)
  - [`/claude-api` — Claude API Help](#claude-api--claude-api-help)
  - [`/security-review` — Security Audit](#security-review--security-audit)
  - [`/compact` — Compact Conversation History](#compact--compact-conversation-history)
- [Tools Available to Claude](#tools-available-to-claude)
- [Memory Files (CLAUDE.md)](#memory-files-claudemd)
- [Custom Subagents](#custom-subagents)
- [Hooks](#hooks)
- [Settings Reference](#settings-reference)
- [How It Differs from Other Session Targets](#how-it-differs-from-other-session-targets)
- [Tips and Best Practices](#tips-and-best-practices)

---

## Getting Started

### Prerequisites

- **VS Code Insiders** (the extension uses proposed APIs not available in Stable)
- **GitHub Copilot subscription** — Claude sessions are powered by your existing Copilot plan; no separate Anthropic API key is required
- **Signed into GitHub** — you must be authenticated in VS Code. If you see "Not Logged In" in the status bar, sign in via the Accounts button in the sidebar before using Claude

### Enabling Claude Sessions

Claude sessions are **enabled by default**. If you don't see Claude in the session target picker, verify the setting is on:

1. Open VS Code Settings (`Cmd+,` / `Ctrl+,`)
2. Search for `claudeAgent.enabled`
3. Ensure **"Enable Claude Agent sessions in VS Code"** is checked

To disable Claude sessions, set this in your `settings.json`:

```json
{
  "github.copilot.chat.claudeAgent.enabled": false
}
```

### Opening a Claude Session

Once enabled, **Claude** appears as a session target in the chat panel. A *session target* determines which AI backend and execution environment processes your requests — for example, Copilot running in the cloud vs. Claude running locally on your machine.

The session target picker is the button at the **bottom** of the chat input area — it displays the name of the currently active target (e.g., **"Local"**).

1. Open the Chat panel (`⌃⌘I` on macOS / `Ctrl+Alt+I` on Windows/Linux)
2. At the bottom of the chat input, click the current session target name (e.g., **"Local"**) to open the picker
3. Select **Claude** from the list of options:
   - **Local** — Default Copilot agent mode
   - **Copilot CLI** — Background agent using GitHub Copilot CLI (runs in a separate Git worktree)
   - **Cloud** — Cloud-based Copilot coding agent
   - **Claude** — Anthropic's Claude Agent SDK running locally
   - *Learn about agent types...* — opens documentation

A new chat session opens with the Claude welcome message: *"Powered by the same agent as Claude Code"*

The input placeholder reads: *"Run local tasks with Claude, type `#` for adding context"*

> **Troubleshooting:** If selecting Claude shows a "Failed to open chat session" error (e.g., *"Can not find provider for claude-code"*), make sure you're signed into GitHub via the **Accounts** button in the sidebar. Claude sessions require an active GitHub Copilot subscription.

### Choosing a Model

Claude sessions support multiple Anthropic models. The **"Pick Model"** button in the chat input toolbar (shows the current model name, e.g., **"Claude Sonnet 4"**) lets you select from all available Claude models on your subscription:

- **Claude Sonnet** — Balanced performance (default)
- **Claude Opus** — Most capable, best for complex reasoning
- **Claude Haiku** — Fastest, best for simple tasks

Your model choice is remembered across sessions. To change models, click the model picker button at any time.

> **Default behavior:** If no preference is stored, the latest Sonnet model is selected automatically.

### Thinking Effort

Some Claude models support configurable **thinking effort** — the amount of reasoning Claude applies before responding. When a model supports this, a **Thinking Effort** dropdown appears in the model picker with options such as:

| Level | Description |
|-------|-------------|
| **Low** | Faster responses with less reasoning |
| **Medium** | Balanced reasoning and speed |
| **High** | Greater reasoning depth but slower (default when available) |

Thinking effort is set per request and is not persisted across sessions.

---

## Session Options

When starting a new Claude session, options appear at the bottom of the chat input area. These control how the session behaves.

### Permission Mode

In the chat input area, you'll see the current permission mode (e.g., **"Edit automatically"**). Click it to change how Claude handles tool execution and file edits. Claude sessions have their own permission modes, distinct from other session targets:

> **Note:** Before selecting Claude, you'll see the **Local** target's permission modes (e.g., "Default Approvals"). The modes below only appear after you switch to the Claude session target.

| Mode | Label in UI | Behavior |
|------|-------------|----------|
| `default` | **Ask before edits** | Claude asks for confirmation before each edit. The safest mode — you approve every change. |
| `acceptEdits` | **Edit automatically** | Claude auto-approves file edits within your workspace. Shell commands and other actions still require confirmation. This is the **default** for Claude sessions. |
| `plan` | **Plan mode** | Claude first creates a plan describing what it intends to do, then asks you to approve before executing. |
| `bypassPermissions` | **Bypass all permissions** | All tools run without confirmation. ⚠️ Only visible when `github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions` is enabled. **Recommended only for sandboxed environments with no internet access.** |

You can change the permission mode at any time during a session by clicking the permission mode button at the bottom of the chat input.

### Folder Selection

Claude needs a working directory to operate in. How folder selection works depends on your workspace:

| Workspace Type | Behavior |
|----------------|----------|
| **Single-root** (1 folder) | The workspace folder is used automatically. No picker shown. |
| **Multi-root** (2+ folders) | A folder picker appears. The selected folder becomes the working directory; all others are accessible as additional directories. |
| **Empty workspace** (no folders) | A picker shows your most recently used folders (up to 10). |

> **Note:** The folder selection is **locked** for existing sessions to prevent changing the working directory mid-conversation.

---

## Working with Claude

### Sending Messages

Type your request in the chat input and press **Enter**. Claude processes your message through its agentic loop — it may:

1. **Think** about the task
2. **Use tools** (read files, search code, run commands)
3. **Make edits** to your files
4. **Ask you questions** if it needs clarification
5. **Iterate** until the task is complete

You can queue multiple messages while Claude is working. They are processed sequentially.

### Attaching Context

Use `#` in the chat input to attach context:

- **`#file`** — Attach a specific file for Claude to reference
- **`#selection`** — Attach the current editor selection
- **Images** — Drag and drop or paste images directly (supported by models with vision)

File attachments and images are resolved and included in Claude's prompt automatically.

### Tool Confirmations

When Claude wants to use a tool, you may see a confirmation dialog depending on your [permission mode](#permission-mode):

- **Shell commands (Bash)** — Always show a terminal-style confirmation with the command to run
- **File edits (Edit/Write)** — Auto-approved in "Edit automatically" mode for workspace files; require confirmation in "Ask before edits" mode
- **Plan execution** — In "Plan mode", Claude shows you the full plan and waits for approval

You can **approve** or **deny** each action. If denied, Claude receives a message that the action was declined and adjusts its approach.

### Plan Mode

Plan mode gives you maximum control over Claude's actions:

1. Select **"Plan mode"** in the permission mode dropdown
2. Send your request
3. Claude creates a step-by-step plan using the `EnterPlanMode` tool
4. You review the plan in a confirmation dialog titled **"Ready to code?"**
5. **Approve** to let Claude execute the plan, or **Deny** to ask for revisions

After approval, Claude switches to "Edit automatically" mode and executes the plan. It can re-enter plan mode if it encounters something unexpected.

### Sessions View

Claude sessions are persisted to disk and can be resumed across VS Code restarts. The **Sessions view** is your central hub for browsing, searching, and resuming past sessions.

#### Opening the Sessions View

The Sessions view appears in two places:

1. **Inline in the Chat panel** — A compact **SESSIONS** list sits above the chat input in the secondary sidebar. It shows your most recent sessions with a **"More"** link to expand the full list.

2. **Dedicated Sessions sidebar** — Click the **"Show Agent Sessions Sidebar"** button (the panel icon in the SESSIONS toolbar) to open a wider, dedicated view. This is the best way to browse many sessions, as it shows sessions grouped by time period (**Today**, **Last 7 days**, **Older**) and includes a **"New Session"** button at the top.

> **Tip:** The Sessions view shows sessions from **all** session targets (Local, Claude, Copilot CLI, Cloud, Codex) — not just Claude. Use the [filter](#searching-and-filtering-sessions) to show only Claude sessions.

#### Browsing Past Sessions

Each session in the list displays:

| Element | Description |
|---------|-------------|
| **Title** | The session name — derived from your first message, or a custom name if you've renamed it |
| **Duration** | How long the session ran (e.g., "Completed in 6 mins", "Completed in 19s") |
| **Age** | Relative timestamp (e.g., "2 days", "7 days", "1 wk") |
| **Blue dot** | Indicates an unread or recently active session |
| **Status icon** | Shows whether the session is completed, in progress, needs input, or failed |
| **Folder badge** | In multi-root or empty workspaces, shows which folder the session ran in |

Sessions are sorted by recency — the most recent session appears at the top. In the dedicated sidebar, they're also grouped by time period.

#### Searching and Filtering Sessions

The Sessions toolbar (above the session list) provides three tools:

- **Refresh** (circular arrow icon) — Reload the session list from disk
- **Find** (magnifying glass icon) — Opens a search input to filter sessions by title text. Type any part of a session name to narrow the list.
- **Filter** (funnel icon) — Opens a dropdown with checkbox filters:

  **By session type:** Local, Claude, Copilot CLI, Cloud, Codex

  **By status:** Completed, In Progress, Input Needed, Failed, Read, Archived

  Use these to show only Claude sessions, or to find sessions that need your attention. A **Reset** option at the bottom clears all filters.

- **Archive All** — Appears when filters are active; archives all visible sessions at once

#### Session Context Menu

Right-click any session in the list to access these actions:

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Open as Editor** | `Ctrl+Enter` | Open the session in the main chat editor area |
| **Open to the Side** | `Ctrl+Alt+Enter` | Open the session in a split view alongside the current editor |
| **Open in New Window** | — | Open the session in a new VS Code window |
| **Mark as Unread** | — | Mark the session with the blue unread indicator |
| **Mark All as Read** | — | Clear the unread indicator from all sessions |
| **Archive** | `Cmd+Backspace` | Archive the session (hides it from the default view; use the "Archived" filter to see archived sessions) |
| **Rename...** | — | Give the session a custom name to make it easier to find later |

> **Tip:** Renaming sessions is a great way to organize your work. Instead of "hi" or a long first-message excerpt, give sessions descriptive names like "Refactor auth module" or "Fix CI pipeline".

#### Opening an Old Session

Click any session in the list to open it. When you open a past session:

1. The full **conversation history** loads in the chat editor — you'll see all previous messages, tool calls, and Claude's responses
2. The **session target** automatically switches to **Claude** with the model and permission mode from the original session
3. The **chat input** is ready for new messages — type a follow-up and Claude picks up where it left off with full context
4. The session is highlighted in the Sessions sidebar

Session files are stored on disk at `~/.claude/projects/<workspace-slug>/` as JSONL files, so they persist across VS Code restarts and even across machines if the files are synced.

---

## Slash Commands

Slash commands are special commands you type in the chat input. They appear in the command completion menu when you type `/`.

### `/memory` — Manage Memory Files

Opens a picker to view and edit your Claude memory files (CLAUDE.md). Memory files contain persistent instructions that are included in every Claude conversation.

**Usage:** Type `/memory` in the chat input

**Available memory locations:**

| Location | Path | Purpose | Version Controlled |
|----------|------|---------|-------------------|
| **User** | `~/.claude/CLAUDE.md` | Personal instructions for all projects | N/A |
| **Project** | `.claude/CLAUDE.md` | Shared project instructions | ✅ Yes |
| **Project (local)** | `.claude/CLAUDE.local.md` | Personal project-specific notes | ❌ No (gitignored) |

If a memory file doesn't exist, `/memory` creates it with a starter template and opens it in the editor.

**Example use cases:**
- Store your preferred coding style in User memory
- Document project architecture in Project memory
- Keep local environment details in Project (local) memory

### `/agents` — Create and Manage Subagents

Launches an interactive wizard to create specialized Claude subagents. Subagents are autonomous agents with their own system prompts, tool access, and model selection that Claude can delegate tasks to.

**Usage:** Type `/agents` in the chat input

**What you can do:**
- **Create** a new agent (guided wizard or AI-generated)
- **View** existing agents
- **Edit** an agent's tools, model, or system prompt
- **Delete** agents

**Agent storage locations:**
- **Project agents** (`.claude/agents/`) — shared with your team via version control
- **Personal agents** (`~/.claude/agents/`) — available across all projects

**Creation flow:**
1. Choose storage location (Project or Personal)
2. Choose creation method:
   - **Generate with Claude** (recommended) — describe what the agent should do, and Claude writes the configuration
   - **Manual configuration** — set the type, system prompt, and description yourself
3. Select which tools the agent can use
4. Choose the agent's model (Sonnet, Opus, Haiku, or inherit from parent)
5. The agent file is saved and opened in the editor

**Agent file format** (Markdown with YAML frontmatter):

```markdown
---
name: test-writer
description: "Writes comprehensive unit tests for TypeScript code"
model: sonnet
allowedTools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash
---

You are a test-writing specialist. When given a source file, analyze its exports
and write comprehensive unit tests covering edge cases, error paths, and typical usage.
Use Vitest as the test framework.
```

### `/hooks` — Configure Lifecycle Hooks

Launches an interactive wizard to configure hooks — custom scripts that run in response to Claude's tool usage and lifecycle events.

**Usage:** Type `/hooks` in the chat input

**Hook event types:**

**Tool-based hooks** (filtered by tool name pattern):

| Event | When It Fires | What Your Script Receives | Special Exit Codes |
|-------|---------------|---------------------------|-------------------|
| **PreToolUse** | Before a tool runs | `{ tool_name, tool_input }` | Exit 0: allow, Exit 2: block |
| **PostToolUse** | After a tool succeeds | `{ tool_name, tool_input, tool_response }` | — |
| **PostToolUseFailure** | After a tool fails | `{ tool_name, tool_input, error, is_interrupt }` | — |
| **PermissionRequest** | When permission is needed | `{ tool_name, tool_input, permission_suggestions }` | Exit 0: allow, Exit 2: deny |

**Lifecycle hooks** (fire for all matching events):

| Event | When It Fires | What Your Script Receives |
|-------|---------------|---------------------------|
| **UserPromptSubmit** | User sends a message | `{ prompt }` |
| **Stop** | Agent execution stops | `{ stop_hook_active }` |
| **SubagentStart** | A subagent is spawned | `{ agent_id, agent_type }` |
| **SubagentStop** | A subagent completes | `{ agent_id, agent_transcript_path, stop_hook_active }` |
| **PreCompact** | Before history compaction | `{ trigger, custom_instructions }` |
| **SessionStart** | Session initializes | `{ source }` |
| **SessionEnd** | Session terminates | `{ reason }` |
| **Notification** | Status notification sent | `{ message, notification_type, title }` |

**Save locations for hooks:**
- **Workspace local** — `.vscode/settings.json` (not version controlled)
- **Workspace** — `.vscode/settings.json` (version controlled)
- **User settings** — VS Code user settings

**Example:** Block all Bash commands that use `rm -rf`:

```bash
#!/bin/bash
# .claude/hooks/safe-bash.sh
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q "rm -rf"; then
  echo "Blocked: rm -rf is not allowed" >&2
  exit 2
fi
exit 0
```

### `/init` — Initialize a CLAUDE.md

Creates a new `CLAUDE.md` file with documentation about your codebase. Claude analyzes your project structure and generates a memory file with relevant context.

**Usage:** Type `/init` in the chat input

### `/review` — Review a Pull Request

Asks Claude to perform a code review of a pull request.

**Usage:** Type `/review` in the chat input

### `/pr-comments` — Get PR Comments

Fetches and displays comments from a GitHub pull request for Claude to address.

**Usage:** Type `/pr-comments` in the chat input

### `/simplify` — Review Changed Code

Reviews your changed code for opportunities to improve reuse, quality, and efficiency. Claude analyzes modified files and suggests simplifications.

**Usage:** Type `/simplify` in the chat input

Claude will examine your pending changes (staged and unstaged) and look for:
- Code that could be deduplicated or extracted into shared utilities
- Overly complex logic that can be simplified
- Inefficient patterns that could be optimized

### `/claude-api` — Claude API Help

Provides guidance for building applications with the Claude API or Anthropic SDK. Claude assists with code that uses `@anthropic-ai/sdk`, `anthropic` (Python), or `claude_agent_sdk`.

**Usage:** Type `/claude-api` in the chat input

**What it helps with:**
- Setting up and configuring the Anthropic SDK
- Making API calls to Claude models
- Implementing streaming responses
- Using tool use / function calling
- Building with the Claude Agent SDK

### `/security-review` — Security Audit

Asks Claude to perform a comprehensive security review of the pending changes on the current branch.

**Usage:** Type `/security-review` in the chat input

### `/compact` — Compact Conversation History

Compresses the conversation history to save context tokens. Useful for long sessions approaching the context limit.

**Usage:** Type `/compact` in the chat input

> **Note:** An additional `/terminal` command exists in the codebase but is currently disabled pending review. When enabled, it will create a VS Code terminal with the Claude CLI configured to use your Copilot subscription.

---

## Tools Available to Claude

Claude has access to a comprehensive set of tools for coding tasks:

### File Operations

| Tool | Description |
|------|-------------|
| **Read** | Read file contents |
| **Edit** | Make inline edits to a file |
| **MultiEdit** | Make multiple edits to a file in one operation |
| **Write** | Create or overwrite a file |
| **NotebookEdit** | Edit Jupyter notebook cells |

### Search & Navigation

| Tool | Description |
|------|-------------|
| **Glob** | Find files by pattern (e.g., `**/*.ts`) |
| **Grep** | Search file contents with regex |
| **LS** | List directory contents |
| **WebSearch** | Search the web for information |
| **WebFetch** | Fetch content from a URL |

### Execution

| Tool | Description |
|------|-------------|
| **Bash** | Execute shell commands |
| **BashOutput** | Read output from a running command |
| **KillBash** | Kill a running shell process |

### Planning & Organization

| Tool | Description |
|------|-------------|
| **EnterPlanMode** | Switch to plan mode before making changes |
| **ExitPlanMode** | Present plan to user and execute on approval |
| **TodoWrite** | Create and manage a task list |

### Interaction

| Tool | Description |
|------|-------------|
| **Task** | Delegate work to a subagent |
| **AskUserQuestion** | Ask the user a question with optional choices |

### IDE Integration

Claude also has access to IDE-provided tools via MCP (Model Context Protocol):

| Tool | Description |
|------|-------------|
| **getDiagnostics** | Get language diagnostics (errors, warnings) from VS Code's language servers |

This means Claude can see your TypeScript errors, ESLint warnings, and other language server diagnostics — and fix them autonomously.

---

## Memory Files (CLAUDE.md)

Memory files are Markdown files that provide persistent context to Claude across all conversations. They act as a "system prompt supplement" — instructions and information you want Claude to always know.

### Locations (loaded in order)

1. **`~/.claude/CLAUDE.md`** — User-level memory, applies to all projects
2. **`.claude/CLAUDE.md`** — Project-level memory, shared via version control
3. **`.claude/CLAUDE.local.md`** — Project-level memory, local only (gitignored)

### What to Put in Memory Files

- **Coding standards:** "Use tabs for indentation. Prefer arrow functions."
- **Project architecture:** "The `src/platform/` directory contains shared services."
- **Build commands:** "Run `npm run compile` to build. Run `npm run test:unit` for tests."
- **Naming conventions:** "Use PascalCase for types, camelCase for functions."
- **Patterns to follow:** "Always use `IInstantiationService` for dependency injection."
- **Things to avoid:** "Never use `any` types. Don't import from `node_modules` directly."

### Managing Memory Files

Use the [`/memory`](#memory--manage-memory-files) slash command, or edit the files directly.

---

## Custom Subagents

Subagents are specialized Claude agents that the main Claude session can delegate tasks to. Each subagent has:

- A **system prompt** describing its specialty
- A restricted **tool set** (only the tools it needs)
- A **model** (can be different from the parent session)
- A **name** and **description** that tells Claude when to use it

### When Claude Uses Subagents

Claude automatically delegates to a subagent when:
- The task matches the subagent's description
- The subagent has the right tools for the job
- The main agent determines delegation would be more efficient

### Managing Subagents

Use the [`/agents`](#agents--create-and-manage-subagents) slash command to create, view, edit, and delete subagents.

### Subagent File Location

| Location | Path | Shared |
|----------|------|--------|
| Project | `.claude/agents/<name>.md` | ✅ Yes (version controlled) |
| Personal | `~/.claude/agents/<name>.md` | ❌ No (user-specific) |

---

## Hooks

Hooks let you run custom scripts at key moments in Claude's execution. They're configured via the [`/hooks`](#hooks--configure-lifecycle-hooks) slash command and stored in VS Code settings.

### Common Hook Use Cases

- **Linting gate:** Run a linter after every file edit (PostToolUse on Edit)
- **Command allowlist:** Block dangerous shell commands (PreToolUse on Bash)
- **Auto-format:** Run a formatter after writes (PostToolUse on Write)
- **Logging:** Log all tool invocations for audit purposes
- **Notifications:** Send a desktop notification when a long task completes (Stop event)

### How Hooks Work

1. Claude triggers a hook event (e.g., about to run a Bash command)
2. Your script receives a JSON payload on stdin with event details
3. Your script runs and exits:
   - **Exit 0** — Allow the action (for PreToolUse/PermissionRequest)
   - **Exit 2** — Block the action; stderr message is shown to Claude
   - **Any other exit** — Hook is ignored; action proceeds normally

---

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `github.copilot.chat.claudeAgent.enabled` | boolean | `true` | Enable Claude Agent sessions in VS Code |
| `github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions` | boolean | `false` | Show "Bypass all permissions" option. ⚠️ Sandboxes only |

---

## How It Differs from Other Session Targets

VS Code Copilot Chat offers four session targets. Here's how Claude compares:

| Feature | Claude | Local (Copilot) | Copilot CLI | Cloud |
|---------|--------|-----------------|-------------|-------|
| **Where it runs** | Locally via Agent SDK | Locally via VS Code | Locally in a separate Git worktree (isolated from your working copy) | Cloud (GitHub) |
| **Agentic loop** | ✅ Autonomous iteration | ✅ Agent mode | ✅ Background | ✅ Async |
| **Shell commands** | ✅ Direct Bash execution | Via tools framework | ✅ CLI tools | Cloud sandbox |
| **Plan mode** | ✅ Plan → review → execute | Not available | Not available | Not available |
| **Subagents** | ✅ Custom specialized agents | Not available | Not available | Not available |
| **Memory files** | ✅ CLAUDE.md | Custom instructions | Custom instructions | Custom instructions |
| **Hooks** | ✅ Custom lifecycle scripts | Not available | Not available | Not available |
| **Permission modes** | Ask before edits / Edit automatically / Plan mode / Bypass all permissions | Default Approvals / Bypass Approvals / Autopilot (Preview) | — | — |
| **Session persistence** | ✅ JSONL files on disk | Chat history | Git worktree | Cloud state |
| **Todo tracking** | ✅ Built-in | Not available | Not available | Not available |
| **IDE diagnostics** | ✅ Via MCP server | Via tools | — | — |
| **Models** | Claude family only | All Copilot models | All Copilot models | All Copilot models |

---

## Tips and Best Practices

1. **Start with "Edit automatically" mode** — it's the best balance of speed and safety. Switch to "Ask before edits" if you want more control.

2. **Use memory files** — run `/memory` and add your project's coding standards. Claude will follow them in every session.

3. **Create subagents for repeated tasks** — if you frequently ask Claude to write tests or review code, create a dedicated subagent with `/agents`.

4. **Use `/compact` for long sessions** — if Claude starts losing context or responses slow down, compact the history.

5. **Attach files with `#`** — give Claude specific files as context rather than hoping it finds them. This speeds up responses.

6. **Use Plan mode for risky changes** — when refactoring critical code, switch to Plan mode so you can review Claude's approach before any files change.

7. **Set up hooks for your workflow** — if your team has strict linting rules, add a PostToolUse hook that runs the linter after every edit.

8. **Leverage IDE diagnostics** — Claude can see TypeScript errors and warnings. Ask it to "fix all compile errors" and it will use the diagnostics tool to find and fix them.

9. **Queue multiple requests** — you can type follow-up messages while Claude is still working. They are processed in order.

10. **Resume sessions** — don't worry about closing VS Code. Your Claude sessions persist and can be browsed in the [Sessions view](#sessions-view). Rename important sessions so you can find them later.
