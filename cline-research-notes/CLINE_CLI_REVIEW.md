# Cline CLI — codebase review

This document summarizes how the **Cline CLI** (`cli/` package, npm name **`cline`**) is built, what it can do, and how it relates to the VS Code extension. It is based on reading **`cli/src/index.ts`**, supporting modules, and **`cli/package.json`**.

---

## What it is

| Item | Detail |
|------|--------|
| **Binary** | `cline` → `dist/cli.mjs` (Node **≥ 20**). |
| **Library** | `import { ClineAgent, … } from "cline"` → `dist/lib.mjs` — see `cli/src/exports.ts`. |
| **UI stack** | **React 19** + **Ink** (terminal UI), **Commander** for subcommands. |
| **Core** | Same **`Controller`**, **StateManager**, **Task**, API handlers, hooks, and most integration code as the extension — wired through **`HostProvider.initialize`** with CLI-specific implementations. |

The CLI is not a separate agent rewrite; it is a **different host** for the shared “Cline core.”

---

## How the CLI bootstraps

1. **`initializeCliContext`** (`cli/src/vscode-context.ts`) builds a minimal **`ExtensionContext`**, resolves **`CLINE_DIR` / `~/.cline/data`**, workspace storage, and extension directory (bundled `extension/`).
2. **`ClineEndpoint.initialize`** loads environment/endpoints (production, staging, local, self-hosted).
3. **`HostProvider.initialize`** registers:
   - **`CliWebviewProvider`** (bridges “webview” concepts to the TUI),
   - **`FileEditProvider`**,
   - **`CliCommentReviewController`**,
   - **`StandaloneTerminalManager`**,
   - **CLI host bridge** (`createCliHostBridgeProvider`),
   - optional **AuthHandler** callback URLs for OAuth.
4. **`StateManager.initialize`**, **`ErrorService.initialize`**, telemetry activation.
5. **Auto-update** may run on startup (`autoUpdateOnStartup`).

**Logging:** `Logger` subscribes to a VS Code–shim output channel; logs also tie into **`CLI_LOG_FILE`** (`cli/src/vscode-shim.ts`). **`cline dev log`** opens that file.

**Hooks:** Optional **`--hooks-dir`** sets **`setRuntimeHooksDir`** for extra hook scripts (same hook system as the extension).

---

## Commands (Commander)

| Command | Purpose |
|---------|--------|
| *(default)* `[prompt]` | Interactive welcome, or run a task if `prompt` / stdin is present. Supports many flags (see below). |
| **`task`** / **`t`** `<prompt>` | Start a task; **`--taskId`** resumes with optional follow-up message. |
| **`history`** / **`h`** | Paginated task history (Ink UI). |
| **`config`** | Ink UI of global + workspace state (`ConfigViewWrapper`). |
| **`auth`** | Interactive wizard or **quick setup**: `-p provider -k apikey -m modelid [-b baseurl]`. |
| **`mcp add`** | Shortcut to add an MCP server entry (stdio / http / sse) into **`cline_mcp_settings.json`**. |
| **`version`** | Print CLI version. |
| **`update`** | Check npm for updates (and Kanban-related updates per implementation). |
| **`kanban`** | Spawn **Kanban** CLI companion (install helper if missing). |
| **`dev log`** | Open the CLI log file. |

**Default entry quirks:**

- **`--acp`**: runs **Agent Client Protocol** mode (stdio JSON-RPC) — see next section.
- **`--kanban`** / **`--tui`**: Kanban vs legacy TUI; mutually exclusive.
- **`--update`**, **`--continue`**, **`--taskId`** interact with guards so conflicting combos exit with a warning.
- **Piped stdin** is merged into the prompt when appropriate; empty stdin with no prompt errors out.

---

## Modes of operation

### 1. Interactive Ink TUI

Clears screen, renders **`App`** with views: **`welcome`**, **`auth`**, **`task`**, **`history`**, settings, etc. Uses **raw mode** when supported (`StdinContext`).

### 2. Plain text / automation

Triggered when **`selectOutputMode`** says so (non-TTY stdout/stdin, **`--json`**, **`--yolo`**, etc.). Uses **`runPlainTextTask`**:

- **Non-JSON:** final **`completion_result`** text to **stdout**; progress / verbose to **stderr** (pipe-friendly).
- **JSON:** streaming JSON lines with `type`, `text`, `ts`, optional `reasoning`, `say`/`ask` subtypes, etc. (see **`man/cline.1.md`**).
- **Requires auth** before run; otherwise warns to run **`cline auth`** and exits (no interactive OAuth in plain mode for “cold” CI unless already configured).

### 3. ACP mode (`--acp`)

**`runAcpMode`** (`cli/src/acp/index.ts`):

- Reserves **stdout** for **ndjson** Agent Client Protocol; **redirects `console.*` to stderr**.
- Uses **`@agentclientprotocol/sdk`** (`AgentSideConnection`, `ndJsonStream`).
- **`AcpAgent`** wraps **`ClineAgent`** for stdio.

Use case: editors or harnesses that speak ACP instead of driving the Ink TUI.

---

## Task flags (high signal)

Applied via **`applyTaskOptions`** into **`StateManager` session overrides** (many are **not persisted** — e.g. yolo / auto-approve-all):

- **`--act` / `--plan`** — session mode; telemetry **`mode_flag`**.
- **`--model`** — overrides model for current mode’s provider.
- **`--thinking [tokens]`** — extended thinking budget (default 1024 if flag boolean).
- **`--reasoning-effort`** — normalized to OpenAI-style effort levels.
- **`--max-consecutive-mistakes`** — yolo guardrail.
- **`--yolo`** — **`yoloModeToggled`** + forces plain-text style behaviour via mode selection.
- **`--auto-approve-all`** — auto-approve while **keeping** interactive Ink UI (vs yolo).
- **`--double-check-completion`** — rejects first completion for re-verification.
- **`--auto-condense`** — AI context compaction path.
- **`--timeout`** — plain-text task timeout in seconds.
- **`--json`** — JSON message stream.
- **`--hooks-dir`** — extra hooks directory.
- **`--taskId`** / **`--continue`** — resume task or last task for cwd.

Images: **`--images`** plus **`@/path/in/prompt`** parsing → base64 data URLs.

---

## Authentication

- **`checkAnyProviderConfigured`** (`cli/src/utils/auth.ts`): Cline account, OpenAI Codex OAuth blob, BYO keys, or env-style defaults (e.g. AWS region, ollama URL).
- **Interactive `auth` view** in Ink for full flows (including OAuth where supported).
- **Quick auth** validates provider with **`isValidCliProvider`** / **`getValidCliProviders`**.
- **Bedrock** explicitly blocked from quick setup (complex auth).

### Provider caveat for CLI

**`vscode-lm` (GitHub Copilot)** is **excluded** on the CLI (`CLI_EXCLUDED_PROVIDERS` in `cli/src/utils/providers.ts`) because it depends on VS Code’s Language Model API. Other providers from `providers.json` remain available subject to config.

---

## MCP from the CLI

**`cline mcp add <name> …`** maps to **`addMcpServerShortcut`** (`cli/src/utils/mcp.ts`): supports **stdio** (command after `--`), **http**, **sse** transports; writes to the resolved **`cline_mcp_settings.json`**.

---

## Kanban integration

Optional **Kanban** launcher: default behaviour can open Kanban instead of the raw TUI (`shouldLaunchKanbanByDefault`). First-run **migration announcement** Ink screen (`KanbanMigrationView`). Install via detected package manager if `kanban` missing.

---

## Shutdown and signals

**SIGINT/SIGTERM:** fires **`shutdownEvent`**, aborts active task, optionally clears Ink lines (not in plain text mode), **`disposeCliContext`** (flush state, dispose controller, telemetry). Second signal forces exit. **Kanban** subprocess gets staged SIGTERM → SIGKILL timeout.

**Unhandled rejections:** “aborted” errors suppressed as expected during cancellation.

---

## NPM library surface

`cli/src/exports.ts` documents the **programmatic** API:

- **`ClineAgent`**, **`ClineSessionEmitter`**, many **ACP-facing types** (`NewSession`, `Prompt`, permissions, tool call updates, etc.).

Typical use: embed Cline in another Node app or test harness without the `cline` binary.

---

## Documentation in-repo

| File | Contents |
|------|----------|
| **`cli/README.md`** | User-facing feature overview and install. |
| **`cli/DEVELOPMENT.md`** | Monorepo setup, `npm run cli:link`, protos, dev workflow. |
| **`cli/man/cline.1.md`** | Man page source (commands, JSON schema, examples). |
| **`docs/cline-cli/`** | Published docs (getting started, etc.). |

---

## Why the CLI matters

1. **Parity** — Same task engine as the IDE; skills, hooks, MCP, providers (minus Copilot LM), and checkpoints behave consistently.
2. **Automation** — Plain text + JSON + piped stdin enable **CI**, scripts, and `git diff | cline …` style workflows.
3. **Integration** — **ACP** and the **`cline` npm library** expose a stable agent protocol for third-party clients.
4. **Operational** — **`--config`**, **`--cwd`**, **`--hooks-dir`**, and shared **`~/.cline/data`** make multi-environment and team setups manageable.

---

## Disclaimer

Command flags, default Kanban behaviour, and provider lists can change between releases. This review reflects the **current `cli/` tree** alongside `package.json` version **2.18.0** at the time of writing.
