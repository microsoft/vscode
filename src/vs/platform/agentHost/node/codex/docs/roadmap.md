# Codex agent — roadmap

This folder hosts the agent host's Codex integration, modelled on the
sibling Claude track under [`../../claude/`](../../claude). The northern star
is the same as Claude's: surface a competing first-party agent inside
the agent host process, talking to the OpenAI Codex CLI via the bundled
`@openai/codex-sdk`, with all outbound traffic forced through GitHub
Copilot's CAPI so the user never authenticates twice.

## Current state

The Codex track lives in [`../`](..) and currently implements an
**MVP that streams chat + tool calls end-to-end through the GitHub
Copilot CAPI**, using the bundled `@openai/codex-sdk` (which shells out
to the `codex` binary on `PATH`). Concretely:

| Phase                          | Status            | Doc                              |
| ------------------------------ | ----------------- | -------------------------------- |
| 1 — CAPI Responses passthrough | ✅ done            | [phase1-plan.md](./phase1-plan.md) |
| 2 — Local Responses proxy      | ✅ done            | [phase2-plan.md](./phase2-plan.md) |
| 4 — Agent skeleton             | ✅ done            | [phase4-plan.md](./phase4-plan.md) |
| 5 — Session lifecycle          | ✅ done            | [phase5-plan.md](./phase5-plan.md) |
| 6 — sendMessage + model swap   | ✅ done            | [phase6-plan.md](./phase6-plan.md) |
| 7 — Streaming + tool calls     | ✅ done            | [phase7-plan.md](./phase7-plan.md) |
| 8 — Prompt attachments + session hardening | ✅ done | [phase8-plan.md](./phase8-plan.md) |
| 9+ — Replay / customizations / MCP / subagents / fork | ⛔ deferred | [phase-deferred.md](./phase-deferred.md) |

For exercising the integration end-to-end (launch skill + code-oss-logs
+ dap-cli) see [testing-playbook.md](./testing-playbook.md).

Phase 3 is intentionally absent — Claude's Phase 3 was about grounding
the in-house Anthropic SDK surface against the production reference,
which doesn't apply to Codex (the SDK is shipped by OpenAI and small
enough that we use its public typings directly).

## Architecture (target)

The Codex agent is one of several `IAgent` implementations registered in
the agent host process. Outbound traffic flows:

```
                       ┌─────────────────────────┐
                       │   workbench renderer    │
                       └────────────┬────────────┘
                                    │  AHP (MessagePort / WS)
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   agent host process (node)                          │
│                                                                      │
│  ┌───────────────┐    ┌────────────────────┐    ┌─────────────────┐  │
│  │ AgentService  │──▶ │     CodexAgent     │──▶ │ CodexProxy      │  │
│  └───────────────┘    └──────────┬─────────┘    │  (HTTP 127.0.0.1)│ │
│                                  │              └────────┬────────┘  │
│                       Codex SDK  │                       │           │
│                                  ▼                       ▼           │
│                       ┌────────────────────┐    ┌─────────────────┐  │
│                       │ spawned `codex` CLI│───▶│ ICopilotApiService│ │
│                       └────────────────────┘    └────────┬────────┘  │
└──────────────────────────────────────────────────────────┼───────────┘
                                                            │
                                                            ▼
                                                  https://api.githubcopilot.com
                                                  /responses
```

Key correspondences with Claude's track:

| Claude                              | Codex                                  |
| ----------------------------------- | -------------------------------------- |
| `ClaudeProxyService`                | `CodexProxyService`                    |
| Anthropic Messages `/v1/messages`   | OpenAI Responses `/v1/responses`       |
| `ClaudeAgent`                       | `CodexAgent`                           |
| `claudeMapSessionEvents.ts`         | `codexMapSessionEvents.ts`             |
| `claudeSessionConfigKeys.ts`        | `codexSessionConfigKeys.ts`            |
| `claudePromptResolver.ts`           | `codexPromptResolver.ts`               |
| `ClaudeAgentSession` (Query wrapper)| _inline_ — `Thread` is small enough    |
| `ClaudeMaterializer`                | _inline_ — provisional→materialize sits in `sendMessage` |
| `ClaudeSessionMetadataStore`        | not yet — see Phase deferred           |
| `ClaudeAgentSdkService`             | not needed — SDK statically imported   |

The codex SDK has no equivalent of Claude's `Query.setModel` /
`applyFlagSettings`, so model swaps tear down and rebuild the `Thread`
via `Codex.resumeThread(threadId, newOptions)` between turns. See
[phase6-plan.md](./phase6-plan.md#model-swaps).

## Provider gating

The Codex provider is **opt-in**, mirroring Claude. Users set
`chat.agentHost.codexAgent.path` to the absolute path of a
locally-installed `@openai/codex-sdk` package; the agent host starters
forward it as `VSCODE_AGENT_HOST_CODEX_SDK_PATH`, and
[`agentHostMain.ts`](../../agentHostMain.ts) registers `CodexAgent`
only when that env var is set. The SDK ships a ~190MB native `codex`
CLI binary per platform, which is why we deliberately do not bundle it
with VS Code. The SDK module itself is then loaded via dynamic
`import()` by [`codexAgentSdkService.ts`](../codexAgentSdkService.ts)
on first `authenticate()` — equivalent to
[`claudeAgentSdkService.ts`](../../claude/claudeAgentSdkService.ts).

## What's intentionally not ported

See [phase-deferred.md](./phase-deferred.md). Highlights:

- **Subagents** — codex has no `Task`-equivalent that spawns child
  conversations the way Claude's subagent registry handles.
- **Customizations / MCP plugins / agents.md** — codex has its own MCP
  config under `~/.codex/config.toml`; bridging the platform's
  customization model into that file is significant work and out of
  scope for the MVP.
- **canUseTool / interactive approvals** — the codex SDK's
  `approval_policy` is set at thread start; there is no per-tool-call
  callback the way Claude's `canUseTool` works.
- **Fork** — codex SDK exposes `resumeThread(id)` but not
  fork-with-truncation. Synthesising it would require copying the
  on-disk JSONL transcript and trimming records, which is fragile
  against codex schema changes.
- **Replay (`getSessionMessages` / `listSessions`)** — codex SDK has
  no transcript-read API. The JSONL on disk is in a private,
  undocumented format; reverse-engineering it is fragile and a future
  Phase 8 task.
