# Changelog — Son of Anton fork

A higher-level changelog for the Son of Anton VS Code fork. The
`extensions/son-of-anton` extension has its own granular changelog at
`extensions/son-of-anton/CHANGELOG.md`.

Son of Anton currently forks **VS Code 1.112.x** (see the `version` field in
the repo-root `package.json`). Upstream rebases retain Tier 1 / Tier 2 work
intact; Tier 3 patches are documented in `docs/modifications/`.

## [Unreleased]

### Brand sweep

- Replaced the **VS Code → Son of Anton** identity across `product.json`
  (`nameShort`, `nameLong`, `applicationName`, mutex names, bundle IDs,
  tunnel names, server names) and the welcome surface.
- Renamed the user-data folder to `.son-of-anton` and the server data
  folder to `.son-of-anton-server` so a Son of Anton install never collides
  with an upstream Code install.
- License retained as MIT, license URL updated to the Son of Anton repo.

### Multi-provider LLM stack

- Added the `son-of-anton` extension's `LlmClient` with provider routing
  for **Anthropic, OpenAI, Microsoft Foundry / Azure OpenAI, Amazon
  Bedrock, and Google Gemini** — 14 distinct model ids in total.
- Provider selection is keyed on the `ModelId` literal union and isolated
  per provider (one `streamX` method per provider) so adding a sixth
  provider is a localised change.
- Tool calling honoured on Anthropic and Bedrock today; other providers
  silently ignore the `tools` field until their function-calling
  integrations land.
- Streaming token events plus cache token accounting routed through a
  `CostReporter` that drives the chat header's cost meter.

### Real MCP transport

- Built a stdio JSON-RPC transport (`McpStdioTransport`) and connection
  layer (`McpServerConnection`) in the extension. Configure servers
  through `sota.mcp.servers`; each entry's tools are exposed to the LLM as
  `mcp__<server>__<tool>`.
- The `McpToolBridge` registers MCP-discovered tools into the same
  `ToolRegistry` the chat panel uses for built-in tools, so the LLM cannot
  tell the difference between `read_file` and an MCP-bridged tool.

### Chat sidebar with agent integration

- New activity-bar **chat sidebar** (`sota-chat`) backed by `ChatSession`,
  shared between a webview panel and a webview view.
- The `AgentBridge` wires `OrchestratorAgent` and the nine specialists
  (`@anton-code`, `@anton-test`, `@anton-e2e`, `@anton-security`,
  `@anton-docs`, `@anton-ci`, `@anton-pr`, `@anton-moderniser`,
  `@anton-spec`) into the same chat surface used by the native chat
  participants.
- Plan + subtask cards render live as the orchestrator emits
  `plan-proposed` / `subtask-started` / `subtask-token` /
  `subtask-completed` / `subtask-failed` events.
- Tool-call cards, terminal-output blocks, and approval cards all persist
  through reload via base64-encoded sentinels.

### Setup wizard

- First-run **`Son of Anton: Open Setup Wizard`** walks new users through
  every provider with smoke validation before saving credentials to
  `vscode.SecretStorage`.
- `credentialDetection` short-circuits the wizard when an existing API
  key, environment variable, or `CredentialBroker` token is already
  available, so existing installs aren't nagged.

### Welcome screen replacement

- A new `sotaWelcomeContent.ts` registers the **Welcome to Son of Anton**
  walkthrough alongside the upstream walkthrough definitions. The Son of
  Anton walkthrough is featured and listed first, so it replaces the
  upstream Setup walkthrough on first launch without a Tier 3 patch.
- An optional Easter Egg walkthrough is contributed for Silicon Valley
  fans.

### Personality and Easter eggs

- A reusable `siliconValleyQuotes` library exposes a tagged set of quotes
  used by startup banners, terminal banners, the orchestrator chat surface,
  and the Konami code listener.
- ASCII art and frame-based animations (`asciiArt`, `asciiAnimations`)
  power the Pied Piper logo, compression-running animation, Tabs vs Spaces
  showdown, and similar surfaces — all printable-ASCII for terminal
  fidelity.
- The Konami code listener and three palette commands (`Show Pied Piper
  Logo`, `Show Silicon Valley Quote`, `Celebrate (Compression Animation)`)
  surface the Easter eggs explicitly. A git-blame Easter egg also fires
  once per file per session.
- Everything obeys the master `sota.personality.enabled` flag.

### Conversation history and checkpoints

- A new `ConversationStore` persists every chat conversation under
  `globalState`, capped at 50 conversations and 500 messages each. A
  `History` tree view in the chat activity bar lists conversations with
  rename/delete commands and a one-shot migration of the legacy
  `sota.chatHistory` workspace key.
- `CheckpointManager` captures a workspace snapshot per chat turn via
  `git stash create` (no working-tree mutation) and stores the SHAs in
  `sota.checkpoints.index`. Restore reapplies a captured stash with a
  modal warning; an optional flag rewinds the conversation alongside the
  files. New settings: `sota.checkpoints.enabled` (default `true`) and
  `sota.checkpoints.maxCount` (default 100, hard cap 1000).

### Multimodal chat

- `LlmClient` exposes an `LlmContentPart` union (`text` | `image`) and a
  `MULTIMODAL_MODELS` set covering 11 image-capable models across
  Anthropic, OpenAI, Foundry, Bedrock, and Google. Each provider serialises
  images into its native wire format (Anthropic `source.data`, OpenAI
  `image_url` data URLs, Gemini `inline_data`).
- The chat composer accepts drag-drop, paste, and file-picker images, with
  a 10-image / 5 MB-combined cap per message. Text-only models receive a
  skip note instead of the binary so the rest of the prompt still flows.

### In-chat provider configuration

- The chat empty-state now surfaces all five providers as cards with
  status pills, replacing the previous three-card placeholder. Each card
  opens an inline form tailored to the provider; saves run a single-token
  smoke validation through `LlmClient` before marking the provider
  configured.
- A new in-chat **Settings** view (gear icon in the chat header) hosts
  five sections — Providers, Personality, Chat, MCP Servers, Advanced —
  reusing the same provider forms.
- Persistence and validation are centralised in
  `extensions/son-of-anton/src/onboarding/providerCredentialSaver.ts`
  (`persistProviderCredentials` + `saveProviderCredentials`), so the chat
  empty state and the standalone `SetupWizardPanel` write through one
  shared module.

### Welcome hero

- A new `sotaWelcomeHero.ts` data module and `buildSotaWelcomeHero`
  renderer in `gettingStarted.ts` inject a Pied Piper ASCII banner, a
  daily-rotating Silicon Valley quote (deterministic per UTC day), a
  tagline, and four pill CTAs (Open Chat, Setup Wizard, Show Quote,
  Recent Conversation) above the upstream recent files / walkthroughs
  grid.
- A `has-sota-welcome-hero` CSS class suppresses the upstream `Start`
  rail and the `<product> / Editing evolved` header so the hero doesn't
  duplicate upstream chrome.
- The first-launch featured-walkthrough selector now prefers
  `visibleCategories.find(c => c.isFeatured)` over the array `[0]` index,
  hardening it against upstream category-ordering churn.

### Test coverage

- Added `costReporter`, `orchestratorQuotes`, `terminalBlock`, and
  `conversationStorePolicies` test files (43 cases total) covering cost
  accounting, the orchestrator's quote-injection probability, shell-
  execution metadata rendering, and `ConversationStore` cap / migration
  behaviour.

### Documentation

- Wrote the extension `CHANGELOG.md` and `README.md`, this root
  `CHANGELOG.md`, and `docs/architecture.md` / `docs/agents.md` covering
  Phases 23-46 (initial pass) and 47-54 (this iteration).

### Fixes

- Pied Piper ASCII art letterform — the second column of the `PIED` block
  was rendering with the `P`-shape glyph (producing `PPED PIPER`) instead
  of an `I`. Corrected so the banner now reads `PIED PIPER` in both the
  extension catalogue (`asciiArt.ts`) and the welcome hero
  (`sotaWelcomeHero.ts`).
- Chat webview CSP nonce — the panel HTML was emitting a literal
  `nonce-YourNonceHere` placeholder in the Content-Security-Policy header
  and on every inline `<script>` tag, so the browser blocked the entire
  chat bootstrap. Replaced with a per-load 32-character random nonce
  threaded through every `<script nonce="...">`. The chat surface is now
  actually interactive on first render.
