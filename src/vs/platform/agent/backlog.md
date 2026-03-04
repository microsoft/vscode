# Agent host backlog

> **Keep this document in sync with the code.** When you complete a backlog item, remove or update it here. When you discover new work, add it. If a blocked item becomes unblocked, move it to the appropriate priority section.

Remaining work to bring the agent-host to feature parity with VS Code's native chat agent. For design decisions, see [design.md](design.md). For process architecture, see [architecture.md](architecture.md).

## Completed

- **Model selection** -- SDK models exposed in the picker via `AgentHostLanguageModelProvider`. Selected model passed to `createSession({ model })`.
- **Session URIs** -- Sessions identified by URIs (`copilot:/<id>`, `claude:/<id>`) instead of raw string IDs. `AgentSession` namespace provides helpers.
- **Multi-provider support** -- Separate `CopilotAgent` and `ClaudeAgent` implementations. Generic `AgentHostSessionHandler` configured via `IAgentHostSessionHandlerConfig`.
- **Separate contributions** -- Replaced `CopilotAgentHostContribution` and `ClaudeAgentHostContribution` with single `AgentHostContribution` that discovers agents dynamically via `listAgents()`. No hardcoded constants.
- **Setting gate** -- `chat.agentHost.enabled` (default `false`) controls process spawn, renderer connection, and contribution registration.
- **Build infrastructure** -- esbuild entry point, ASAR unpack, platform binary filtering, macOS universal app support.

## Blocked (SDK gaps)

These items cannot be implemented without changes to `@github/copilot` itself.

### Custom-type tools / responses API (apply_patch)

The `apply_patch` tool uses OpenAI's responses API with a custom tool type. The Copilot SDK doesn't support custom-type tools or the responses API format. Not implementable with the SDK's agent loop.

### LM request proxying / BYOK

The SDK makes its own LM requests using the GitHub token. There's no way to intercept those requests and route them through VS Code's `IChatEndpoint` or a user's own API key. Options: SDK adds a custom endpoint callback, or BYOK users fall back to the native agent loop.

### Dynamic tool set changes mid-turn

VS Code sometimes changes the available tool set during an active turn (e.g., installing a Python extension to bootstrap notebook tools). The SDK would need to support updating available tools mid-turn.

---

## Open questions

- **Which tools do we use -- ours or theirs?** See [design.md](design.md) for context.
- Can the SDK's system prompt be replaced or appended to?
- Does `session.send()` accept structured context (files, images) beyond a text prompt?
- What API exists for registering custom tools or intercepting tool calls?
- How does `tool.user_requested` work -- does the SDK block waiting for an approve/deny response?
- Does the SDK support creating/restoring snapshots for checkpoints?
- Custom compaction prompts?
- Custom LM endpoint / request interception for BYOK?
- Does the SDK generate follow-up suggestions?

---

## P0 -- Unblocks real usage

### Plugging in VS Code tools

The SDK runs its own built-in tools. We have no way to plug in VS Code tools (from extensions or built-in) to be used instead of or alongside the SDK's tools.

The SDK needs an API to register custom tools or intercept tool calls. The `tool.user_requested` event already fires when a tool needs user approval. Investigate `CopilotSession` for a tool override / custom tool handler API. Once found, implement the round-trip: SDK requests a tool call -> IPC to renderer -> renderer executes via `ILanguageModelToolsService` -> result sent back over IPC -> fed back to SDK.

### Tool confirmation

Not plumbed. The SDK fires `tool.user_requested` with tool name, arguments, and a call ID. We need to implement confirmation on the renderer side: receive this event over IPC, show the VS Code confirmation UI, and send back an approve/deny response.

### Attachments / user-selected context

Only the plain text message is sent. File attachments, editor selections, directory references, and images are silently discarded. Expand `sendMessage()` to accept structured context alongside the prompt.

### Interrupt / abort

Stubbed -- the interrupt callback returns `true` but doesn't actually stop anything. Add an `abortSession(sessionId)` IPC method wired to `session.abort()`.

---

## P1 -- Core UX parity

### System prompt and instructions injection

The SDK uses its own system prompt. VS Code's `.instructions.md` files, `copilot-instructions.md`, skills, agent instructions, and per-model JIT instructions are all ignored. Assemble VS Code's full system prompt in the renderer and pass it to the agent-host.

### Streaming tool call arguments

The SDK fires `tool.execution_start` and `tool.execution_complete`, but we don't forward the partial argument stream in between. The wrapper already has `onToolProgress` and `onToolPartialResult` events -- forward these over IPC.

### Edit session integration (free with plugging in VS Code tools)

File edits proposed by the agent aren't plumbed through VS Code's editing service (diff view, accept/reject, etc.). Free once VS Code tools are plugged in -- the tool implementations already create edits through `IChatEditingService`.

### References and citations (free with plugging in VS Code tools)

Tool results arrive as plain text with no structured file references or code citations. Free once VS Code tools are plugged in.

### Tool picker

The "Configure Tools..." action is hidden when locked to a coding agent. Either remove the `lockedToCodingAgent` guard or introduce a more granular context key.

### Agent / participant picker

When locked to an agent, input completions filter out all other agents/participants. Decide whether agent-host sessions should allow switching participants.

### Post-request toolbar (redo, continue, edit)

All gated on `lockedToCodingAgent.negate()` and hidden. Continue should work today (gate needs removing). Redo and edit request need checkpoint support.

### Undo / redo edit actions

Same `lockedToCodingAgent` gate. Requires edit session integration to be working first.

### File and context attachment completions

Conditionally hidden when locked to an agent. The agent-host agent registration needs to declare `supportsPromptAttachments: true`. One-line fix once attachments are plumbed.

---

## P2 -- Important but not launch-blocking

### Linkification of file paths in responses

The native agent post-processes response text to detect file paths and turn them into clickable links in the chat UI. Agent-host responses arrive as raw markdown from the SDK and don't go through this linkification pipeline. File paths mentioned in the response (e.g., "I edited `src/foo.ts`") remain plain text. Need to either run the same linkification logic on agent-host responses, or have the SDK provide structured file references that VS Code can render as links.

### Checkpoints and request editing

Not exposed. The SDK has `session.snapshot_rewind` events suggesting checkpoint/rewind support. The "Restore Checkpoint" UI action is also gated on `lockedToCodingAgent.negate()`.

### Compaction

Not exposed, though the SDK fires `session.compaction_start` / `session.compaction_complete` events. Add a `compact(sessionId)` IPC method for `/compact`.

### Hooks (pre-tool-use)

Not plumbed. The SDK has `hook.start` / `hook.end` events. Two paths: use the SDK's hook system, or run VS Code's own hook system on the renderer side.

### Telemetry

Basic logging only. No token usage, no per-request telemetry, no tool invocation telemetry. The SDK fires `assistant.usage` and `session.usage_info` events.

### MCP server integration

Not plumbed. If we plug in VS Code tools, MCP tools come through the same round-trip. Alternatively, forward MCP server configs to the SDK and let it manage connections.

### Thinking / reasoning output

Not forwarded. The SDK fires `assistant.reasoning` and `assistant.reasoning_delta` events. Forward over IPC and render as thinking blocks.

### Follow-up suggestions

Not implemented. Needs investigation: does the SDK generate follow-up suggestions?

### Continue chat in... (delegation)

Hidden when `lockedToCodingAgent` is true. The SDK fires `session.handoff` events suggesting some support.

### Steering messages (mid-turn user input)

VS Code supports "steering" -- sending a message while the agent is still processing a previous request (`ChatRequestQueueKind.Steering`). The SDK has native message queuing: calling `session.send()` while a turn is active enqueues the message, and the SDK fires `pending_messages.modified` when the queue changes. However, SDK queuing is "next turn" -- the queued message is processed after the current turn finishes, not injected mid-turn. Needs investigation.

---

## P3 -- Nice to have

### Server-side tools (web search)

The SDK handles web search internally. The renderer doesn't see or render these invocations. Probably fine to let the SDK handle this one.

### Large tool results to disk

The SDK saves large tool results to disk internally. If we plug in VS Code tools instead, we need our own strategy.

### Title generation

Sessions display the SDK's `summary` field, but there's no on-demand title generation. The SDK likely generates summaries automatically after the first exchange.

---

## Notes

### Subagent events

The SDK fires `subagent.started`, `subagent.completed`, `subagent.failed`, and `subagent.selected` events. Could be rendered as progress/status in the chat UI. Low priority.

### `lockedToCodingAgent` gates

Many UI actions are hidden for agent-host sessions because they check `lockedToCodingAgent.negate()`. The tool picker, agent picker, post-request toolbar, undo/redo, and attachment completions are all instances of this pattern. The fix is generally to relax the gate or replace it with a capability check.
