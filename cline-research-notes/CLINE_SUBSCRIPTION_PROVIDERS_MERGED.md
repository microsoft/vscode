# How Cline Uses Claude Code and OpenAI Codex Subscriptions Without API Keys

*Merged from an external draft with notes verified against this repository (`cline`). Encoding fixes applied (e.g. arrows, em dashes).*

---

## Executive Summary

This report explains how the Cline IDE agent integrates with Anthropic’s **Claude Code** and **OpenAI Codex (ChatGPT subscription)** so users can rely on **existing subscriptions** instead of pasting **platform API keys** into the extension. It focuses on architecture, auth patterns, and flows that are useful if you want to replicate a similar integration in another IDE agent.

**Core ideas (confirmed in this codebase):**

- **Claude Code:** Cline wraps the locally installed, user-authenticated `claude` CLI. It spawns a **new process per request**, passes **system prompt + serialized messages on stdin**, and reads **line-delimited `stream-json` events** on stdout. Cline **explicitly removes `ANTHROPIC_API_KEY`** from the subprocess environment so billing/auth is whatever the CLI has (subscription/session), not the IDE’s env. Cline **disables Claude Code’s built-in tools** via `--disallowedTools` and sets **`--max-turns 1`** so **Cline** remains the sole agent loop for file edits, terminal, browser, MCP, etc.
- **OpenAI Codex:** Cline uses **OAuth** against `https://auth.openai.com` with a **local callback** (`http://localhost:1455/auth/callback`), stores **access + refresh tokens** in the IDE secret store (`openai-codex-oauth-credentials`), and calls **`https://chatgpt.com/backend-api/codex`** with **`Authorization: Bearer <access_token>`** (and headers such as `originator: "cline"`, optional `ChatGPT-Account-Id` from the id token). Usage is governed by the user’s **ChatGPT** subscription, not **platform** API billing.
- **Unification:** Both paths implement Cline’s **`ApiHandler`** (`createMessage` yields an `ApiStream`). The rest of Cline (plan/act mode, tools, checkpoints, hooks) stays **provider-agnostic**.

**Related paths (not the focus of this doc but part of the same “no API key in the box” story in Cline):**

- **Cline provider:** OAuth to `app.cline.bot` — no vendor keys; billing through Cline.
- **GitHub Copilot:** `vscode-lm` uses VS Code’s Language Model API (Copilot entitlement).
- **Qwen Code:** OAuth + `~/.qwen` credentials.

---

## Background: Cline, Claude Code, and Codex

Cline is an autonomous coding agent that runs inside VS Code (and shares core with CLI / other hosts), orchestrating LLMs with tools for editing files, terminals, browser automation, and MCP.

**Claude Code** is Anthropic’s CLIcoding assistant. Users install it and sign in with **Claude Max / Pro / (or enterprise)**; the CLI holds session material per Anthropic’s design.

**OpenAI Codex** in this document means the **ChatGPT / Codex subscription** surface accessed via OAuth-backed HTTP (`chatgpt.com/backend-api/codex`), **not** the generic `api.openai.com` “Platform API key” product.

### Goals of the integration

- **Bring your own subscription** without putting raw Anthropic or OpenAI **platform** API keys into Cline settings.
- Treat these backends as **first-class** `ApiHandler` implementations.
- Keep secrets where they belong: **CLI store** (Claude Code) or **OS/IDE secret storage** (Codex tokens).

---

## Claude Code Integration Pattern

### High-level behaviour (docs + code)

- User installs and authenticates Claude Code per Anthropic.
- In Cline: provider **Claude Code**, path to `claude` (or rely on `PATH`).
- Each chat turn: Cline runs **`runClaudeCode`** → **`runProcess`** in `src/integrations/claude-code/run.ts`, which **execa**s the CLI with structured args, writes **`JSON.stringify(messages)`** to stdin, consumes **stdout** line-by-line.
- **`ClaudeCodeHandler`** (`src/core/api/providers/claude-code.ts`) maps parsed chunks into **`ApiStream`** events (text, usage, etc.).

Official docs still call out **UX differences** vs native API streaming (historically “batch feel” in some setups); the **current** integration uses `--output-format stream-json` and `--verbose` for structured stream parsing.

### Verified implementation details (this repo)

| Concern | What the code does |
|--------|---------------------|
| **Paths** | Integration: `src/integrations/claude-code/run.ts`. Handler: `src/core/api/providers/claude-code.ts` (not `src/api/...`). |
| **CLI args** | `--system-prompt` or `--system-prompt-file` (long prompts / Windows limits), `--verbose`, `--output-format stream-json`, `--disallowedTools <built-in Claude tools>`, `--max-turns 1`, `--model <id>`, `-p`. |
| **Auth / keys** | **`delete env["ANTHROPIC_API_KEY"]`** before spawn — Cline does **not** funnel IDE env API keys into the CLI; subscription/session auth is left to Claude Code. |
| **Built-in tools** | A long `--disallowedTools` list (Task, Bash, Read, Edit, …) so the model is nudged toward **text** and Cline’s own tool loop handles execution. |
| **Images** | `filterMessagesForClaudeCode` strips image blocks; handler comment states CLI path does not support images like the HTTP API. |
| **Subscription vs “paid API” signal** | On `system` / `init`, handler sets `isPaidUsage` from **`apiKeySource !== "none"`** — comment in code: subscription usage can set **`apiKeySource` to `"none"`** (aligns with cost-display behaviour described in community issues). |
| **Operational limits** | 10-minute timeout, 20 MB buffer; explicit errors for `ENOENT`, `E2BIG`, `ENAMETOOLONG`, outdated CLI (`unknown option '--system-prompt-file'`). |
| **Env tuning** | e.g. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_NON_ESSENTIAL_MODEL_CALLS` defaults set to reduce nonessential CLI traffic (see `run.ts`). |

### Authentication without API keys (precise statement)

- **Flow:** IDE → Cline → **`claude` subprocess** → Anthropic (per CLI session).
- **Secrets:** Not extracted by Cline for Claude Code; subprocess uses CLI-managed credentials.
- **Billing:** Appears on the user’s **Claude subscription / org** side, not as a Cline-managed API key line item.

**Replication checklist:** require CLI installed + logged in; configurable binary path; spawn with **stream-json**; parse lines; **do not** inject platform API keys unless you intentionally want API-key metering instead of CLI auth.

### Limitations (docs + code)

- **No images** through this provider (filtered).
- **No Anthropic prompt cache** via this path (different surface than Messages API).
- **Streaming feel** depends on CLI + parsing; still fundamentally subprocess-bound.
- **Cost UI** must handle **`apiKeySource === "none"`** without assuming “free” or “paid API” incorrectly.
- **Windows / long prompts:** file-based system prompt and docs links in `run.ts` / `docs/provider-config/claude-code.mdx`.

---

## OpenAI Codex OAuth Integration Pattern

### High-level behaviour

1. User selects **ChatGPT Subscription** / OpenAI Codex provider.
2. **Sign in** triggers OAuth (browser to **`https://auth.openai.com/oauth/authorize`** with registered `client_id`, `redirect_uri` **localhost:1455**, scopes `openid profile email offline_access`).
3. Tokens exchanged at **`https://auth.openai.com/oauth/token`**; stored under **`openai-codex-oauth-credentials`** (see `src/integrations/openai-codex/oauth.ts`).
4. Requests use **Bearer access token** to **`https://chatgpt.com/backend-api/codex`** (Responses API shape via OpenAI SDK with `apiKey: accessToken` and custom `baseURL`, plus fetch fallback and optional **WebSocket** path for some models — `OpenAiCodexHandler`).
5. **401 / auth errors** can trigger **force refresh** once (`openAiCodexOAuthManager.forceRefreshAccessToken()`).

### Headers and identity

- **`originator: cline`** — identifies the client.
- **`session_id`** — per-handler session string.
- **`ChatGPT-Account-Id`** — when available from JWT/id token (`chatgpt_account_id`), for org/subscription contexts.

### Authentication without platform API keys

- User authorizes **Codex / ChatGPT** OAuth, not “API keys from platform.openai.com”.
- Tokens live in **secret storage**; refresh flow implemented in `oauth.ts` manager.
- **Metering:** subscription / ChatGPT-side limits — not the same as billing **`api.openai.com`** usage keys.

### Caveats for implementers

- **Callback port** fixed in config (`1455`) — host must allow local loopback OAuth.
- **Corporate proxy:** Cline’s shared `fetch` (`src/shared/net.ts`) matters for JetBrains/CLI; VS Code uses its own proxy behaviour.
- **Not generic OpenAI:** base URL is **`chatgpt.com/backend-api/codex`**, not the platform API host.

---

## Provider Abstraction and Tool Integration

Both providers implement **`ApiHandler`** with **`createMessage(systemPrompt, messages, tools?)` → `AsyncGenerator<ApiStream>`** (Codex includes native tool calling; Claude Code handler yields stream from CLI parsing — tools are primarily **Cline’s**, not Claude Code’s disabled builtins).

### Design lessons for a custom IDE

Your draft’s **generic interface** (`sendChat`, `listModels`, usage fields, `subscriptionUsage` flags) still applies:

- Hide **transport** (subprocess vs HTTPS vs WebSocket).
- Normalize to **one** internal message + tool-call representation.
- Surface **usage** in a way that distinguishes **metered API** vs **opaque subscription** (Cline uses `apiKeySource` / paid flags for Claude Code; Codex paths integrate with existing usage chunks).

**Tool mapping:** Cline’s product model is **one tool vocabulary** executed by the IDE; Claude Code’s own tools are **explicitly disabled** so the model does not “double up” with a parallel agent. For a Codex-style HTTP provider, use the provider’s native function/tool format and map into your executor.

---

## Blueprint: Replicating in Your Own IDE

1. **`ApiHandler`-style interface** — async iterable stream of unified chunks; retries optional (`@withRetry` in Cline).
2. **Claude Code–style**
   - Configurable CLI path; validate `claude --version`.
   - Spawn with **`stream-json`**, pipe messages on stdin; stderr for errors.
   - Strip **platform API keys from env** if you want subscription-only CLI behaviour.
   - Disable **CLI-embedded tools** if your IDE owns tools.
   - Parse **`system` init** for subscription vs API-key usage metadata.
3. **Codex-style**
   - OAuth PKCE/public-client pattern with **local redirect** or secure relay.
   - Persist **refresh token**; automatic refresh + user re-login on failure.
   - Call the **correct Codex base URL**; set **client-identifying headers**.
   - Optional WebSocket stream path if the backend supports it.
4. **Unify** planning, approvals, and telemetry **above** the provider layer.

---

## Appendix: Cline-Wide Features That Complement These Providers

Short cross-reference to why Cline is a strong “host” for subscription backends:

- **Plan vs act modes**, **human-in-the-loop approvals**, **checkpoints**, **MCP**, **browser tool**, **hooks**, **`.clineignore`**, **multi-root workspaces**, **shared `~/.cline/data/`** across VS Code/CLI — see **`CLINE_HIGHLIGHTS.md`** in this bundle.

---

## Source index (this repository)

| Topic | Location |
|-------|----------|
| Claude Code spawn + args + env | `src/integrations/claude-code/run.ts` |
| Claude Code → ApiStream | `src/core/api/providers/claude-code.ts` |
| Message filter (images, etc.) | `src/integrations/claude-code/message-filter.ts` |
| Codex OAuth | `src/integrations/openai-codex/oauth.ts` |
| Codex HTTP/WS + base URL | `src/core/api/providers/openai-codex.ts` |
| Provider registry / `buildApiHandler` | `src/core/api/index.ts` (and related) |
| User-facing setup | `docs/provider-config/claude-code.mdx`, `docs/getting-started/authorizing-with-cline.mdx` |

---

## Disclaimer

OAuth endpoints, model IDs, and CLI flags can change. Treat this document as **implementation guidance tied to this checkout**; verify against current Anthropic/OpenAI documentation and [https://docs.cline.bot](https://docs.cline.bot).
