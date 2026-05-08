# Son of Anton

Multi-provider AI chat sidebar with orchestrated specialist agents, Model
Context Protocol (MCP) integration, and code-graph-aware context. Ships as a
built-in extension of the Son of Anton VS Code fork.

Anton routes a single chat surface across five LLM providers, delegates to
nine specialist agents through the orchestrator, and exposes both built-in
and MCP-bridged tools to every model — all with first-run setup and a cost
meter built in.

## Quick start

1. Open the chat sidebar with `Ctrl+L` / `Cmd+L` (or click the chat icon in
   the activity bar).
2. Run **Son of Anton: Open Setup Wizard** from the command palette.
3. Pick a provider and paste an API key (or sign in via OAuth where
   supported). The wizard runs a smoke test before saving.
4. Type a question, or send `/help` to list slash commands.

## Features

### Multi-provider LLM stack

- **Five providers**: Anthropic, OpenAI, Microsoft Foundry / Azure OpenAI,
  Amazon Bedrock, and Google Gemini.
- **14 model IDs** routed by `ModelId`: `opus`, `sonnet`, `haiku`, `gpt-4o`,
  `gpt-4o-mini`, `gpt-5-codex`, `foundry-gpt-4o`, `foundry-gpt-4o-mini`,
  `foundry-claude-sonnet`, `bedrock-claude-sonnet`, `bedrock-claude-haiku`,
  `gemini-1-5-pro`, `gemini-1-5-flash`, `gemini-2-0-flash`.
- **Tool calling on every provider** — built-in workspace tools and
  MCP-bridged tools are advertised to every supported model.
- **Streaming everywhere** — token-by-token streaming, with a `complete`
  event carrying input/output/cache token counts for cost reporting.

### Agents

- **Orchestrator** (`@anton`) decomposes a request into a JSON plan, pauses
  for approval, then dispatches subtasks to specialists with file
  scope-locking and dependency ordering.
- **Nine specialists**: `@anton-code`, `@anton-test`, `@anton-e2e`,
  `@anton-security`, `@anton-docs`, `@anton-ci`, `@anton-pr`,
  `@anton-moderniser`, `@anton-spec`. See `docs/agents.md` for details.
- **Live token streaming** of each subtask, plus structured `plan-proposed`,
  `subtask-started`, `subtask-completed`, and `subtask-failed` events.

### Chat surface

- **Slash commands**: `/help`, `/clear`, `/specialist <id>`, `/model <id>`,
  `/agents`, `/status`. Autocomplete popup is driven from the same
  `getCommandList()` source so help and autocomplete never drift.
- **`@file` and `@folder` mentions** in the composer with a workspace-index
  popup; sensitive paths are excluded.
- **Workspace context auto-injection** — active editor (with selection
  range), README overview, recent files, project name, and git branch,
  budgeted to 6 KB soft / 12 KB hard with sensitive-file exclusion.
- **Image attachments** — drag-drop, paste, or `Attach > Image…` to add up
  to 10 images per message (5 MB combined). Multimodal-capable models
  receive the images inline; text-only models get a single skip note so
  the rest of the prompt still goes through.
- **Conversation history** — every conversation persists to a `History`
  view in the chat sidebar. Rename, delete, or jump back to any of the
  last 50 conversations from the tree; long conversations are capped at
  500 messages with the oldest dropped first.
- **Checkpoint snapshots** — every user turn captures a workspace snapshot
  via `git stash create` (no working-tree mutation). Restore a checkpoint
  to roll the working tree back to a prior turn, optionally rewinding the
  conversation as well. See `Son of Anton: Checkpoints` palette commands.
- **Tool-call cards** with persistence — every tool invocation renders as a
  card and survives reload via a base64-encoded sentinel format that
  tolerates triple backticks in the tool output.
- **Approval workflow** for `write_file` and `run_command`. The auto-approve
  pill replaces the modal when `sota.chat.autoApproveSafeOperations` is on,
  so power users keep moving without losing the audit trail.
- **Terminal output blocks** for shell commands — stdout, stderr, exit code
  all rendered in a styled block alongside the tool card.
- **Cost meter in the chat header** with per-model breakdown, debounced
  updates, and a one-click reset.
- **Plan + subtask cards** rendered live as the orchestrator emits its plan
  and the specialists stream their work.
- **In-chat provider configuration** — the empty-state surfaces all five
  providers as cards with status pills, and the gear icon opens an in-chat
  Settings view (Providers, Personality, Chat, MCP Servers, Advanced) so
  you don't need to leave the panel to tweak credentials. Saves run a
  single-token smoke validation before persisting.
- **Welcome hero** — the upstream welcome page is replaced with a Pied
  Piper ASCII banner, a daily-rotating Silicon Valley quote, and four pill
  CTAs (Open Chat, Setup Wizard, Show Quote, Recent Conversation) above
  the recent files / walkthroughs grid.

### MCP

- Real **stdio JSON-RPC transport** — `McpStdioTransport` spawns the child
  process; `McpServerConnection` performs the `initialize` handshake and
  surfaces `tools/list` and `tools/call`.
- Configure servers via `sota.mcp.servers`. Each entry's tools are exposed
  to the LLM as `mcp__<server>__<tool>` so the model can call them
  identically to built-in tools.

### Onboarding

- **First-run setup wizard** with provider cards (Anthropic, OpenAI,
  Foundry, Bedrock, Google) and a smoke-validation step that proves
  credentials before saving.
- **Credential detection** scans SecretStorage, settings, environment
  variables, and the `CredentialBroker` so users with an existing API key
  bypass the wizard automatically.
- **SecretStorage-first** — wizard-saved API keys live in SecretStorage; the
  LLM client reads SecretStorage before falling back to settings or env.

### Personality

- **Silicon Valley quote signatures** in selected agent surfaces (toggleable
  via `sota.personality.enabled`).
- **Easter eggs**: Konami-code listener, Pied Piper logo and ASCII
  animations exposed through palette commands (`Show Pied Piper Logo`,
  `Celebrate (Compression Animation)`, `Show Silicon Valley Quote`), and a
  git-blame-driven Easter egg.

## Configuration

Every setting below lives under the `sota.*` namespace. Secrets are stored
in `vscode.SecretStorage` once the wizard saves them; the matching settings
remain as a fallback for users who paste keys directly.

| Setting | Default | Description |
| --- | --- | --- |
| `sota.personality.enabled` | `true` | Master switch for quotes, ASCII art, Easter eggs. |
| `sota.defaultModel` | `sonnet` | Default model: `opus`, `sonnet`, or `haiku`. |
| `sota.chat.includeWorkspaceContext` | `true` | Auto-inject workspace context (active editor, README, recent files). |
| `sota.chat.autoApproveSafeOperations` | `false` | Skip the modal for `write_file` / `run_command`; auto-approved pill is still shown. |
| `sota.checkpoints.enabled` | `true` | Capture a workspace checkpoint via `git stash create` on every chat turn. Disable to opt out of the per-turn capture overhead. |
| `sota.checkpoints.maxCount` | `100` | Maximum checkpoints retained across all conversations. Oldest are pruned first. Hard ceiling: 1000. |
| `sota.completions.enabled` | `true` | Enable inline ghost-text completions. |
| `sota.completions.debounceMs` | `300` | Debounce before triggering completions. |
| `sota.traces.maxSessions` | `50` | Maximum trace sessions retained. |
| `sota.apiKey` | `""` | Anthropic API key (falls back to `ANTHROPIC_API_KEY`). |
| `sota.openaiApiKey` | `""` | OpenAI API key (falls back to `OPENAI_API_KEY`). |
| `sota.foundryApiKey` | `""` | Microsoft Foundry / Azure OpenAI key. |
| `sota.foundryEndpoint` | `""` | Foundry / Azure OpenAI base endpoint. |
| `sota.foundryApiVersion` | `2024-10-01-preview` | Foundry API version. |
| `sota.foundryDeployments` | `"{}"` | JSON map of `foundry-*` model id → deployment name. |
| `sota.bedrockRegion` | `us-east-1` | AWS region for Bedrock requests. |
| `sota.bedrockAccessKeyId` | `""` | AWS access key id (falls back to standard AWS credential chain). |
| `sota.bedrockSecretAccessKey` | `""` | AWS secret access key. |
| `sota.bedrockSessionToken` | `""` | Optional STS session token. |
| `sota.bedrockProfile` | `""` | Named profile from `~/.aws/credentials` (takes precedence over keys). |
| `sota.bedrockModelMap` | `"{}"` | JSON map of `bedrock-*` model id → Bedrock invocation id. |
| `sota.googleApiKey` | `""` | Google Gemini API key. |
| `sota.googleModelMap` | `"{}"` | JSON map of `gemini-*` model id → Google model name. |
| `sota.mcp.servers` | `[]` | Array of MCP servers to spawn over stdio. |
| `sotaAuth.anthropic-oauth.clientId` | `""` | OAuth client id for the Claude sign-in flow (advanced). |
| `sotaAuth.chatgpt-oauth.clientId` | `""` | OAuth client id for the ChatGPT / Codex flow (advanced). |

## Keyboard shortcuts

These shortcuts are scoped to the chat webview (the global `Cmd/Ctrl+L`
listener fires whenever focus is anywhere inside the chat panel).

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+L` | Focus the chat composer. |
| `Cmd/Ctrl+Shift+L` | Clear the current conversation. |
| `Esc` (while streaming) | Stop generating. |
| `Up Arrow` (when the composer is empty) | Recall the last sent message into the composer for editing. |
| `Cmd/Ctrl+K` (in editor) | Inline edit on the current selection. |

## Privacy

Anton does not phone home. There is no telemetry endpoint and no usage
beacon. Provider API keys live in `vscode.SecretStorage` once you save them
through the setup wizard; settings storage is a fallback only. The
workspace-context provider excludes `.env*`, `credentials*`, `secrets*`,
private-key extensions (`*.key`, `*.pem`, `*.pfx`, `*.p12`), SSH private
keys (`id_rsa`, `id_ed25519`, etc.), `node_modules/`, `.git/`, and
`.son-of-anton/` from auto-injected context. When the active editor holds a
sensitive path, only the file header (path, language, line range) is sent —
never the body.

## License

MIT. Inherits the upstream VS Code (Code OSS) license; see
`../../LICENSE.txt` at the repo root.
