# OTel CLI Parity Sprint — branch `zhichli/oteladdition`

Reference: copilot-agent-runtime CLI PR #8037 (`e8a24076831b09a17f7f641b33885ddd5fcb4b3e`).

Goal: bring VS Code's extension-side OTel up to the new `github.copilot.*` shape introduced in the CLI, without breaking existing `copilot_chat.*` consumers (Agent Debug Log, Chronicle, OTLP exporters, SQLite span store).

## Locked design decisions

| # | Decision |
|---|---|
| 1 | MCP server names hashed by default (SHA-256 hex). Raw name only when `captureContent=true`. |
| 2 | `agent.type` derived from existing `modeInstructions2.isBuiltin` flag (`builtin` / `custom`). A richer registry-source field is a follow-up. |
| 3 | Skill source emitted verbatim as VS Code's `PromptFileSource` enum value (no CLI mapping). Deferred — skill emission not part of this PR. |
| 4 | Indefinite dual-emit; legacy `copilot_chat.*` keys keep emitting, marked **Legacy** in doc, no sunset. |

## Tasks (atomic commits)

1. **feat(otel): add `github.copilot.*` attribute constants and hash helper** — `genAiAttributes.ts`
2. **feat(otel): dual-emit git context under `github.copilot.git.*`** — `workspaceOTelMetadata.ts`
3. **feat(otel): rename reasoning tokens key with dual-emit** — `chatMLFetcher.ts`, `otelSqliteStore.ts`
4. **feat(otel): stamp `github.copilot.agent.type` on `invoke_agent`** — `toolCallingLoop.ts`
5. **feat(otel): structured `github.copilot.tool.parameters.*` on `execute_tool`** — `toolsService.ts`
6. **feat(otel): enrich `execute_hook` with `decision` / `tool_names` / `duration_seconds`** — `chatHookService.ts`
7. **docs(otel): document `github.copilot.*` attributes and mark `copilot_chat.repo.*` legacy** — `agent_monitoring.md`
8. **docs(otel): add dual-emit policy section to OTel skill** — `.github/skills/otel/SKILL.md`

## Deferred to follow-up PRs

- `github.copilot.skill.invoked` span event with raw `PromptFileSource`.
- `github.copilot.mcp.server.lifecycle` event + `connection.count` counter.
- `github.copilot.context.{skills,mcp_server_names,custom_agent_names}` snapshot attrs on `invoke_agent`.
- Mode/agent registry `source` field for the richer `agent.type` enum.

## Hiccups & Notes

(Filled in during execution.)
