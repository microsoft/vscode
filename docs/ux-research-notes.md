# UX Research Notes — for the Chat Interface Expansion

Compiled from Cline (`/Users/danielhalwell/PythonProjects/cline`), GitHub Copilot Chat, Anthropic Claude Code, and OpenAI Codex extensions. Distilled for the next pass of UX work.

## Settings tab — multi-section structure

Cline splits Settings into 8 sub-tabs (sidebar nav inside the settings view). Adopt this pattern. Sub-sections we should ship:

1. **API Configuration** — provider rows + per-provider deep config (model picker, base URL, custom headers, API version, reasoning-effort, thinking-budget)
2. **Features** — agent behaviour toggles (auto-approve safe ops, auto-inject workspace context, per-message hover, focus-chain checklist, etc.)
3. **Terminal** — output-line cap slider, shell-integration enable, default shell, working-directory override
4. **Browser** — when an agent drives a browser (future); enable/disable, screenshot quality, viewport size
5. **General** — preferred language, theme, font size, telemetry opt-in (with explicit privacy policy link)
6. **Personality** — Silicon Valley quotes toggle, voice intensity slider, ASCII art on/off, easter eggs
7. **MCP Servers** — list + add/edit/delete + per-server enable toggle + tool allowlist per server
8. **About / Debug** — version info, log levels, `Reset all` button (with confirmation modal), export logs button

Each tab gets a section header with title + description. Within a tab, related controls group under sub-headers (e.g. Settings Tab → "Auto-approval" sub-header → individual checkboxes).

## Provider catalog — beyond the 5 we have

Cline ships 43 provider integrations. Many are valuable to add. Group them:

### First-party API
- Anthropic Claude (have)
- OpenAI (have)
- Microsoft Foundry / Azure OpenAI (have)
- Amazon Bedrock (have)
- Google Gemini (have)
- Google Vertex AI (different auth flow than Gemini API key)

### Subscription / OAuth
- Claude via Claude Code CLI (just landed)
- OpenAI Codex CLI (the user mentioned — pending follow-up)
- GitHub Copilot — proxies through `vscode.lm` API

### Aggregators
- OpenRouter (single API key, hundreds of models, good for power users)
- LiteLLM (self-hosted aggregator)

### Open-weight / local
- Ollama (local llama.cpp / similar)
- LM Studio (local model server)
- Hugging Face Inference (managed inference of OS models)

### Hosted OS-model providers
- DeepSeek (DeepSeek-V3, DeepSeek-R1 reasoning)
- Mistral (Mistral Large, Codestral)
- Groq (LPU-accelerated, very fast Llama)
- Cerebras (wafer-scale, very fast Llama)
- Together AI (broad model menu)
- Fireworks (fine-tuned + hosted)
- Moonshot (Kimi)

### Specialized
- Baseten, Nebius, Hicap, Aihubmix, etc. (skip for now — long tail)

## Per-provider config — what each form should expose

Beyond the API key, providers vary in what they need. Cline's pattern:

- **Anthropic**: API key, optional base URL override, custom headers (for proxies / Helix)
- **OpenAI**: API key, base URL (compatible-API mode), org id, custom headers
- **Foundry**: endpoint, API key, deployments map, API version
- **Bedrock**: region, profile OR (access-key + secret + session-token), custom endpoint
- **Gemini**: API key, project id (for Vertex), location
- **Ollama / LM Studio**: base URL, no API key
- **OpenRouter**: API key, optional models filter, optional preferred providers list

Each form should have a **"Test connection"** button that pings the provider and reports `OK` / specific error. Today our save-and-validate is implicit; making it explicit reduces user confusion.

## Reasoning controls (per-model)

Several modern models are "reasoning" models that benefit from extra knobs:

- **`reasoning_effort`** (low/medium/high) — gpt-5, o1, o3, o4 families. Default to `medium`.
- **`thinking_budget_tokens`** (0–24000) — Claude 4.x extended thinking. Default to 0 (off). Slider ranges 0–24K.
- **`max_thinking_seconds`** (1–300) — Claude Code's thinking timer.

These should appear ONLY for models that support them (gated by a per-model capability flag).

## Chat surface improvements

From Cline + Codex + Copilot Chat:

### Composer
- **Quoted-message reply** — select text in a previous turn → "Quote" button → composer pre-fills `> <quoted>\n\n` (we don't have this)
- **Drag-drop image attachment** + clipboard paste of images
- **Slash-command palette** with autocomplete (we have basic `/clear`, `/plan` — Cline has 20+)
- **Context add menu** — current file, selection, problems, terminal, git changes (we have most), recently-opened files, recently-modified files, git blame, current branch diff
- **History recall** — up-arrow steps through previous user prompts (we don't have this)
- **Submit-or-newline shortcut** — Cmd+Enter submits, Enter newlines (configurable)

### Transcript
- **Collapsible tool cards** — long tool outputs collapse with "Show all" toggle
- **Inline diff editor** — already done (Phase 63)
- **Error severity colors** — different shades for `info`/`warning`/`error`/`critical`
- **Cancel button on long-running subtasks** — per-card, not just the global stop
- **Spend limit warning** — banner when session cost exceeds threshold
- **Branch points** — when the orchestrator emits multiple plan options, render as buttons the user picks

### Side panels
- **Conversation export** — already done (Phase 64)
- **Bookmark turns** — pin specific assistant outputs for quick recall
- **Search transcript** — Cmd+F within a long conversation

## Specific Cline features worth lifting

1. **`auto-approval` panel** — granular per-tool toggles. Read-only ops always auto-approve; writes require explicit approval; commands have a denylist (rm -rf /, etc.)
2. **Plan mode preview** — before executing, render the diff "if this plan ran" as a collapsible preview
3. **Spend limit per task / per session** — kill switch when cost crosses threshold
4. **Model description markdown** — clickable info icon next to model picker entry shows: context window, max output tokens, capabilities (vision/audio/tools), pricing, ideal-use blurb
5. **Featured model card** — highlights one premium pick at top of picker (e.g. Claude Opus 4.7 today)

## Codex-specific features

OpenAI Codex extension (the official one):
- **Login via OpenAI account** (not API key) — same OAuth flow we want for Anthropic Claude Code
- **Code lens hover** — inline `Explain` / `Refactor` / `Add tests` actions on code
- **Right-sidebar chat** — not just the bottom; full vertical surface like ours
- **Inline edit** mode — model edits selected code in-place without opening the chat panel

## GitHub Copilot Chat features

- **`@workspace`** mention — equivalent to our `@file` but auto-scoped to the open workspace
- **`@vscode`** mention — answers about VS Code itself
- **`@terminal`** — already done for us
- **`/explain`, `/fix`, `/tests`** — slash commands targeting selected code
- **Context picker hover** — preview the resolved file content before submitting

## Visual polish

- **Status badges** — consistent shape (pill), color encoding (grey=idle, blue=running, green=ok, amber=warning, red=error)
- **Empty states** — every section has a thoughtful empty state (not just blank)
- **Loading skeletons** — for slow MCP server queries, show skeleton rows rather than a spinner
- **Keyboard shortcuts overlay** — Cmd+K Cmd+S → "Show keyboard shortcuts" — list every chord
- **Toast notifications** — non-modal status messages (today we have in-form errors only)

## Implementation backlog (priority order)

1. **Settings sub-tabs** — split current single-page Settings into 8 tabs.
2. **Per-provider deep config** — base URL override, custom headers, test-connection button.
3. **Reasoning controls** (effort + thinking budget) gated by model capability flags.
4. **OpenRouter + Ollama + LM Studio** — three highest-ROI new providers.
5. **Auto-approval panel** — granular per-tool toggles.
6. **Quote-reply** — select-and-quote in composer.
7. **History recall** — up-arrow stepping.
8. **Spend limit kill switch** — session + per-task.
9. **Model description tooltip** — i icon next to picker entries.
10. **DeepSeek / Mistral / Groq / Cerebras / Together / Fireworks** — five hosted providers, lighter lift than aggregators.

Each is its own phase. Don't bundle all into one sub-agent — they touch different files and a single huge prompt would stall.
