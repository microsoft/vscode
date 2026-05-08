# Changelog

All notable changes to the Son of Anton extension will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows pre-1.0 semantic versioning.

## [Unreleased]

### In progress

- Phase 55 — In-chat MCP server management UI. Replaces the
  `Edit in settings.json` link in the in-chat Settings view with a list of
  configured `sota.mcp.servers`, add/remove/edit affordances, and a status
  indicator per server. Wiring is in flight in `src/chat/` and the chat
  webview CSS at the time of this changelog.

### Added

- Phase 47 — `ConversationStore` with multi-conversation history and a
  `ConversationListProvider` tree view in the activity bar's chat container.
  Conversations are persisted to `globalState` under
  `sota.conversations.index` plus per-conversation `sota.conversations.<id>`
  keys, capped at **50 conversations** and **500 messages per conversation**
  (oldest dropped first). A one-shot migration imports the legacy
  `sota.chatHistory` workspace-state key behind a `sota.conversations.migrated`
  flag. New palette/title commands `sota.newConversation`,
  `sota.openConversation`, `sota.renameConversation`, and
  `sota.deleteConversation` round out the surface, and `ChatPanel` switches
  conversations through a generation-counted load token so concurrent
  switches don't render messages from a stale conversation.
- Phase 48 — Documentation pass. Wrote the extension `CHANGELOG.md` and
  `README.md`, the root `CHANGELOG.md`, and `docs/architecture.md` /
  `docs/agents.md` covering Phases 23-46.
- Phase 49 — Test coverage extension. Four new test files
  (`costReporter.test.ts`, `orchestratorQuotes.test.ts`,
  `terminalBlock.test.ts`, `conversationStorePolicies.test.ts`) covering 43
  cases across cost accounting, orchestrator quote-injection probability,
  shell-execution metadata rendering, and `ConversationStore` cap / migration
  policies.
- Phase 51 — Image attachments in the chat composer. Drag-drop, paste, and
  the `Attach > Image…` file picker collect images as base64 payloads,
  rendered as removable chips above the input. Per-message limits: at most
  10 images and a 5 MB combined byte cap. `LlmClient` exposes an
  `LlmContentPart` union (`text` | `image`) and a `MULTIMODAL_MODELS` set
  covering 11 image-capable model ids (Opus, Sonnet, GPT-4o, GPT-4o-mini,
  three Foundry deployments, Bedrock Claude Sonnet, and three Gemini
  models). When a request targets a text-only model, image parts are
  stripped and a single `[image attachment was not sent: ...]` note is
  appended so the model still receives the user's prose.
- Phase 52 — Workspace checkpoint snapshots. `CheckpointManager` mints a
  checkpoint per user turn via `git stash create` (no working-tree
  mutation) and stores the resulting SHAs in `sota.checkpoints.index` in
  `globalState`. Restore runs `git stash apply` against the captured SHA
  with a modal confirmation, optionally rewinding the conversation to drop
  every message after the captured turn. Three palette commands
  (`Capture Checkpoint`, `List Checkpoints`, `Restore Checkpoint`) plus
  two settings: `sota.checkpoints.enabled` (default `true`) and
  `sota.checkpoints.maxCount` (default 100, hard ceiling 1000).
- Phase 53 — Welcome page hero. A new `sotaWelcomeHero.ts` data module and
  a `buildSotaWelcomeHero` renderer in `gettingStarted.ts` inject a Pied
  Piper ASCII banner, daily-rotating Silicon Valley quote (deterministic
  per UTC day), tagline, and four pill CTAs (Open Chat, Setup Wizard,
  Show Quote, Recent Conversation) above the upstream Start / Recent /
  Walkthroughs grid. The upstream `Start` rail and the `<product> /
  Editing evolved` header are suppressed via the `has-sota-welcome-hero`
  CSS class so the hero doesn't double up with the upstream chrome.
- Phase 54 — In-chat 5-provider configuration GUI. The chat empty state now
  surfaces all five providers (Anthropic, OpenAI, Foundry, Bedrock, Google)
  as cards with a status pill per provider, replacing the previous
  three-card placeholder. Selecting a provider opens an inline form with
  paste-key fields tailored per provider; saving runs a 1-token smoke
  validation through `LlmClient` before marking the provider configured.
  A new in-chat **Settings** view (gear icon in the chat header) hosts five
  sections — Providers, Personality, Chat, MCP Servers, Advanced — and
  reuses the same provider forms. Persistence and validation are
  centralised in `src/onboarding/providerCredentialSaver.ts` so the chat
  empty state and the standalone `SetupWizardPanel` write through a single
  `persistProviderCredentials` / `saveProviderCredentials` pair.

### Changed

- Phase 50 — Welcome featured-walkthrough hardening. The first-launch
  selector in `gettingStarted.ts` now prefers `visibleCategories.find(c =>
  c.isFeatured)` over the array `[0]` index, so the Son of Anton
  walkthrough opens on first run regardless of category ordering churn
  upstream.

### Fixed

- Pied Piper ASCII art letterform — the second column of the `PIED` block
  was rendering with the `P`-shape glyph (producing `PPED PIPER`) instead
  of an `I`. Corrected so the banner now reads `PIED PIPER` in both the
  extension catalogue (`asciiArt.ts`) and the welcome hero
  (`sotaWelcomeHero.ts`).
- Chat webview CSP nonce — the panel HTML was emitting a literal
  `nonce-YourNonceHere` placeholder in the Content-Security-Policy and on
  every inline `<script>` tag, so the browser blocked the entire chat
  bootstrap. Replaced with a per-load 32-character random nonce minted at
  HTML build time and threaded through every `<script nonce="...">` in
  `ChatPanel`. The chat surface is now actually interactive on first
  render.

## [0.1.0] - 2026-05-07

This release rolls up Phases 23 through 46 of the chat-surface buildout:
multi-provider LLMs, real MCP transport, the orchestrated agent stack, the
setup wizard, the personality/Easter-egg layer, and supporting tooling and
tests.

### Added

- Phase 23 — Tool-call cards in the chat UI with persistence. Cards render
  the tool name, input, and output and survive reload.
- Phase 24 — MCP-to-`ToolRegistry` bridge so MCP tools surface to the LLM
  alongside built-in tools as `mcp__<server>__<tool>`.
- Phase 27 — Real MCP stdio transport. `McpStdioTransport` spawns the child
  process; `McpServerConnection` performs the JSON-RPC `initialize`
  handshake and exposes `tools/list` / `tools/call` with timeouts and
  pending-request tracking.
- Phase 28 — `AgentBridge` and `AgentStackFactory`. The factory builds the
  canonical agent stack once per session (orchestrator + nine specialists +
  review agent + metrics + project memory) and `AgentBridge` exposes a
  streaming, event-based API the webview chat consumes through a shimmed
  `ChatResponseStream`.
- Phase 30 — Slash commands: `/help`, `/clear`, `/specialist`, `/model`,
  `/agents`, `/status`. The command catalogue is the single source of
  truth for both the dispatcher and the autocomplete popup.
- Phase 31 — Orchestrator plan-and-approve loop with structured event
  emission (`plan-proposed`, `subtask-started`, `subtask-completed`,
  `subtask-failed`).
- Phase 33 — First-run setup wizard (`SetupWizardPanel`) with provider
  cards, smoke validation, and `credentialDetection` covering
  SecretStorage, settings, env vars, and the `CredentialBroker`.
- Phase 34 — `LlmClient` migrated to read credentials from SecretStorage
  first, with settings and environment variables as fallbacks.
- Phase 35 — Per-subtask token streaming routed through the new
  `subtask-token` event so the chat surface can update each subtask card
  in place.
- Phase 36 — `WorkspaceContextProvider` auto-injects workspace context:
  active editor (with selection range), README overview, recent files,
  project name, and git branch. Soft / hard character budgets, sensitive-
  file exclusion, and an MRU recent-files list.
- Phase 41 — Approval workflow for `write_file` and `run_command`. Risky
  tools are gated behind an approval card with timeout, cancellation, and
  an auto-approve setting (`sota.chat.autoApproveSafeOperations`).
- Phase 42 — Tool definition `riskLevel` field (`'safe'` |
  `'requiresApproval'`) so tools opt into the approval gate at the
  definition level.
- Phase 43 — Personality library: `siliconValleyQuotes` (curated quote set
  with character/tone tags), `asciiArt` (Pied Piper, Son of Anton glyph,
  Hooli, Aviato, etc.), and `asciiAnimations` (compression frames, spinner,
  Tabs vs Spaces).
- Phase 44 — Welcome screen replacement (`sotaWelcomeContent.ts`)
  contributing the Son of Anton walkthrough alongside an Easter-egg
  walkthrough, replacing the upstream Setup walkthrough on first launch.
- Phase 45 — Orchestrator quote injection probability tuning and the
  `appendQuote` helper so flavour text fires on roughly half of orchestrator
  turns instead of every turn.
- Phase 46 — `ShellExecutionMetadata` (`kind: 'shell'`, command, args,
  cwd, exitCode, stdout, stderr, cancelled) so `run_command` results render
  as a terminal-style block paired with the existing tool card.
- Tests covering `AgentBridge`, slash commands, approval workflow,
  credential detection, workspace context, MCP stdio transport, orchestrator
  planning, and personality.

### Changed

- Phase 25 — Chat panel rewritten on the new `ChatSession` host, shared
  between `ChatPanel` (webview panel) and `ChatViewProvider` (sidebar view)
  so behaviour stays identical regardless of placement.
- Phase 26 — LLM provider routing extracted into `providerForModel`; the
  five-provider routing table (Anthropic, OpenAI, Foundry, Bedrock, Google)
  lives in one switch.
- Phase 29 — `BaseAgent.buildSystemPrompt` aligned with
  `specialistRegistry.buildSystemPrompt` so the chat sidebar and
  agent classes serve the same role description without a runtime cycle.
- Phase 32 — Slash-command popup driven from `getCommandList()` so the
  webview never duplicates the command catalogue.
- Phase 37 — Slash command `/specialist` tolerates a leading `@` so users
  can paste handles verbatim from the orchestrator's plan output.
- Phase 39 — Cost meter debounced and reset-aware so an idle session never
  paints `$0.00` and rapid-fire token events don't thrash the webview.
- Phase 40 — Workspace-index entries (for `@file` / `@folder` mentions)
  capped at 100 file entries and refreshed on a debounced timer.

### Fixed

- Phase 38 — Tool-card persistence sentinel rewritten to base64-encode the
  body so triple backticks inside tool output no longer break the fence
  during reload.
- Phase 38 — Foundry deployment writes for all `foundry-*` model ids; the
  earlier path only honoured `foundry-gpt-4o`.
- Phase 38 — Orchestrator cancellation polling now checks
  `token.isCancellationRequested` between every plan, dispatch, and
  review step instead of only at top of loop.
- Phase 41 — Approval-card timeout (5 minutes) auto-rejects with
  `reason: 'timeout'` so the model still receives a structured tool
  result and the loop terminates cleanly.
- Phase 43 — All quote literals constrained to printable ASCII to satisfy
  the unicode hygiene check; em-dashes written as ` -- `.
