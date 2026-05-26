# Codex agent harness — overview

High-level snapshot of the Codex provider integration in the agent host.
For incremental phase plans see the sibling `phase*-plan.md` files; for
end-to-end manual verification see [`testing-playbook.md`](./testing-playbook.md).

## What we built

A Codex `IAgent` provider that runs in the **agent host utility process**
alongside Copilot and Claude, surfaces in the Agents Window / chat session
target dropdown, and routes turns through a local CAPI proxy.

```
Workbench (renderer) ──IPC──▶ AgentService ──▶ CodexAgent
                                                  │
                              ┌───────────────────┴───────────────┐
                              ▼                                   ▼
                       CodexProxyService (127.0.0.1)   ICodexAgentSdkService
                              │                                   │
                              ▼                                   ▼
                       ICopilotApiService                 dynamic import
                              │                          @openai/codex-sdk
                              ▼                                   │
                            CAPI                                  ▼
                                                          codex Rust CLI
                                                          (spawned subprocess)
```

## Files

| File | Role |
|---|---|
| [`codexAgent.ts`](../codexAgent.ts) | `IAgent` impl — auth, models, session lifecycle, sendMessage, abort, changeModel, setPendingMessages, shutdown. |
| [`codexAgentSdkService.ts`](../codexAgentSdkService.ts) | Lazy dynamic loader for `@openai/codex-sdk` from the path setting. |
| [`codexProxyService.ts`](../codexProxyService.ts) | Local HTTP server that speaks the OpenAI Responses API and forwards to `ICopilotApiService`. Bearer-nonce auth. |
| [`codexMapSessionEvents.ts`](../codexMapSessionEvents.ts) | Translates SDK `ThreadEvent` → AHP session signals (text, turn state). |
| [`codexPromptResolver.ts`](../codexPromptResolver.ts) | Renders protocol `MessageAttachment[]` into the prompt string (inline + `<system-reminder>` blocks). |
| [`codexSessionConfigKeys.ts`](../codexSessionConfigKeys.ts) | Session-config schema keys: `approvalPolicy`, `sandboxMode`. |

Plus the standard wiring: provider gate in
[`agentHostMain.ts`](../../agentHostMain.ts) +
[`agentHostServerMain.ts`](../../agentHostServerMain.ts), env/setting forward
in the [electron](../../../electron-main/electronAgentHostStarter.ts) and
[node](../../nodeAgentHostStarter.ts) starters, settings registered in
[`chat.shared.contribution.ts`](../../../../../workbench/contrib/chat/browser/chat.shared.contribution.ts).

## Distribution

The SDK and its ~190MB native Rust CLI are **not bundled** with VS Code.
`@openai/codex-sdk` is a `devDependency` only. At runtime the agent host
loads the SDK via `await import(pathToFileURL(sdkPath))` where `sdkPath`
is the workbench setting `chat.agentHost.codexAgent.path` (forwarded to
the utility process as `VSCODE_AGENT_HOST_CODEX_SDK_PATH`). When the
setting is empty the `CodexAgent` provider is not registered at all.

## Auth & models

- Protected resource: `GITHUB_COPILOT_PROTECTED_RESOURCE`. `CodexAgent.authenticate(resource, token)` stores the GitHub Copilot token, (re)starts `CodexProxyService` with a fresh nonce, and instantiates `Codex` pointed at `http://127.0.0.1:<port>/v1` via a **custom model provider** (`model_providers.capi-proxy`, `wire_api: 'responses'`, `env_key: CODEX_API_KEY`). Custom provider is required because the built-in `openai` provider can't be overridden and would force a Responses-over-WebSocket path.
- Model list comes from `ICopilotApiService.models(token)`, filtered to `vendor === 'OpenAI' && model_picker_enabled && supports.tool_calls`. Each model surfaces a `configSchema.reasoningEffort` enum built from CAPI's `capabilities.supports.reasoning_effort`.

## Sessions

- Two-stage lifecycle: provisional (`_provisionalSessions: Map`) → materialized (`_sessions: DisposableMap`). Provisional entries are created by `createSession()` and promoted on first `sendMessage` (fires `onDidMaterializeSession`). On agent-host restart, sessions known to exist on disk are resumed lazily via `_resumeSession`.
- A per-session `SequencerByKey` serializes turns. Each turn pushes through `Thread.runStreamed(prompt, { signal })`; events stream back via `mapCodexEvent`.
- Model / approval / sandbox changes between turns are detected by a `threadOptionsKey` and rebuild the `Thread` via `codex.resumeThread(existingId, newOptions)` (preserves history).

## Settings

| Setting | Effect |
|---|---|
| `chat.agentHost.enabled` | Required global toggle. |
| `chat.agentHost.codexAgent.path` | Absolute path to `@openai/codex-sdk` install. Empty = provider disabled. |
| `chat.agentHost.devWebSocketPort` | Optional TCP port for an AHP WebSocket listener (for `ahpx`, debugging). Logs a copy-paste `ws://…` URL. |

Per-session config (in the chat session target dropdown):

| Key | Values |
|---|---|
| `codex.approvalPolicy` | `never` / `on-request` / `on-failure` / `untrusted` |
| `codex.sandboxMode` | `read-only` / `workspace-write` / `danger-full-access` |
| `model.reasoningEffort` | `minimal` / `low` / `medium` / `high` / `xhigh` (intersected with model capabilities) |

## What works today

- Provider appears in chat session target dropdown ("Codex - Agent Host").
- Multi-turn streaming chat (assistant text + turn-complete signals).
- Model swap mid-conversation, with per-model reasoning-effort validation.
- Session abort / cancellation.
- Approval policy + sandbox mode wired to codex CLI flags.
- Attachments resolved into the prompt (file paths, resource references).
- `setPendingMessages` buffers a steering prompt to be prepended on the next turn.
- Survives full Code OSS restart (sessions resumed from SDK on-disk JSONL when reused).

## Not implemented

- **Tool call rendering / interactive permission UI.** Codex events for tool calls aren't mapped to AHP tool-call signals yet; approval is set once at thread start via `approvalPolicy`.
- **File edit checkpointing / external-edit diffs.** No equivalent of Claude's `claudeFileEditObserver`.
- **Session listing / transcript replay.** `listSessions()` returns `[]` and `getSessionMessages()` returns `[]` — the codex SDK does not expose a public enumeration / replay API; sessions reload empty after a Code OSS restart unless re-opened by id.
- **Session forking.** `createSession({ fork })` throws.
- **MCP servers, hooks, slash commands, subagents, skills, plugins.** All Claude-only for now.
- **Mid-turn user input requests** (`respondToUserInputRequest` is a no-op).
- **Client-provided tools** (`setClientTools` is a no-op).
- **Customizations sync** (`setClientCustomizations` returns `[]`).
- **OTel traces from the codex CLI subprocess.** The CLI doesn't emit them in a form we ingest.

## Known limitations

- Restricted to OpenAI-vendor models in the user's Copilot CAPI list. Non-OpenAI models are filtered out even if `tool_calls`-capable.
- The codex CLI may refuse `model_not_available_for_integrator` on subsequent turns after a model swap — debug logging is in place; root cause not yet identified.
- The SDK requires `@openai/codex` + a matching `@openai/codex-<platform>` native package to be present on disk at the configured path; we don't fall back to PATH or auto-download.

## Quick start

1. `npm install` (pulls `@openai/codex-sdk` into dev `node_modules`).
2. `settings.json`:
   ```jsonc
   "chat.agentHost.enabled": true,
   "chat.agentHost.codexAgent.path": "/abs/path/to/vscode/node_modules/@openai/codex-sdk"
   ```
3. Full restart Code OSS.
4. New chat → session target dropdown → **Codex - Agent Host**.
