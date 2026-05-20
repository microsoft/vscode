# Codex Phase 4 — Agent skeleton ✅

Stand up `CodexAgent` as a registered `IAgent` provider so the
workbench's agent picker surfaces Codex alongside Copilot CLI and
Claude.

## What landed

- [`codexAgent.ts`](../codexAgent.ts) — `CodexAgent extends Disposable
  implements IAgent`:
  - `id = 'codex'` (becomes the URI scheme via `AgentSession.uri`).
  - `getDescriptor()` → `{ provider: 'codex', displayName: 'Codex',
    description: 'Codex agent backed by the OpenAI Codex SDK' }`. The
    workbench's
    [`baseAgentHostSessionsProvider.ts::iconForAgentProvider`](../../../../sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts)
    already maps the `codex` scheme to `Codicon.openai`, so the
    sessions panel renders the OpenAI logo without further wiring.
  - `getProtectedResources()` → returns the shared
    `GITHUB_COPILOT_PROTECTED_RESOURCE`. The auth flow is identical to
    Claude's: the workbench prompts the user for a GitHub Copilot
    token, the token is forwarded via `authenticate('https://api.github.com', token)`,
    and `CodexAgent` hands it to `ICodexProxyService.start(token)`.
  - `authenticate(resource, token)` — early-returns when the token is
    unchanged, otherwise acquires a new proxy handle, constructs a
    fresh `Codex` SDK instance pointed at the proxy, disposes the old
    handle, and kicks off `_refreshModels()`.

- Registration in both entry points:
  - [`agentHostMain.ts`](../agentHostMain.ts) — always-on:
    `agentService.registerProvider(instantiationService.createInstance(CodexAgent))`.
  - [`agentHostServerMain.ts`](../agentHostServerMain.ts) — same shape;
    registration logs `"CodexAgent registered"`.

- Models flow: `ICopilotApiService.models()` is filtered by
  `vendor === 'OpenAI'` with `model_picker_enabled` and
  `supports?.tool_calls`. Result is sorted stably with
  `is_chat_default` first (so the workbench's
  `models[0]`-as-default heuristic hits the right entry) and projected
  into `IAgentModelInfo` with the codex provider id. Only Codex /
  OpenAI family models appear in the Codex picker.

- ESLint layering: added `@openai/codex-sdk` to the
  `src/vs/platform/agentHost/~` import-restriction allowlist in
  [`eslint.config.js`](../../../../../../eslint.config.js).

## Why always-on (vs. Claude's opt-in setting)

Claude's track gates registration on the non-empty
`chat.agentHost.claudeAgent.path` setting because the Anthropic SDK is
**not bundled**. The user has to install it themselves and point at it.

Codex is different: the `@openai/codex-sdk` npm package is a hard
dependency, so the SDK constructor never throws. The CLI binary (which
the SDK shells out to) may still be missing — but that's a per-message
failure mode that doesn't justify hiding the provider from root state
entirely. The first user message surfaces the spawn error as a
`SessionError`.

If we ever decide we want an opt-in toggle, add a setting in
`agentService.ts` mirroring `AgentHostClaudeAgentSdkPathSettingId`,
forward it through the starters, and gate the
`agentService.registerProvider(…)` call on the env var.
