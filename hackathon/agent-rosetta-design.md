# Agent Rosetta: AHP × ACP Universal Agent Host

- **Status:** Draft
- **Target:** CoreAI China Mini Hackathon
- **Track:** AI-native Team / Agent Building Blocks
- **Primary implementation target:** VS Code Agent Host

## 1. Summary

Agent Rosetta is an experimental adapter that enables VS Code's native Agent Host to run any compatible Agent Client Protocol (ACP) coding agent.

VS Code already uses the Agent Host Protocol (AHP) between its user interfaces and the Agent Host. The Agent Host currently contains first-party adapters for Copilot, Claude, and Codex. Agent Rosetta adds a generic ACP-backed adapter beside those implementations:

```text
VS Code Agents Window and other AHP clients
                         │
                         │ AHP
                         ▼
                 VS Code Agent Host
                         │
                         │ Agent Rosetta
                         │ ACP over stdio
                         ▼
           Any configured ACP coding agent
```

This is not another ACP chat panel. ACP agents appear as native Agent Host providers and reuse the existing VS Code experience for sessions, streamed responses, tool calls, approvals, cancellation, and multi-client observation.

The hackathon MVP intentionally targets a narrow, demonstrable path: ACP v1 over stdio, one ACP process per configured provider, one ACP session per AHP chat, and enough event mapping to complete a real coding task.

## 2. Motivation

Editor-to-agent integrations are currently fragmented. Every new agent often needs a custom VS Code extension or a first-party Agent Host adapter. This duplicates process management, chat UI, permission UI, session UI, and protocol translation.

ACP standardizes the boundary between an editor-like client and a coding agent. AHP standardizes the boundary between an Agent Host and one or more clients observing and controlling durable agent sessions. The two protocols solve adjacent problems:

| Protocol | Boundary | Responsibility |
|---|---|---|
| AHP | Agent Host ↔ UI clients | Shared session state, reconnection, remote execution, and multi-client synchronization |
| ACP | Agent client ↔ coding agent | Agent startup, prompts, streaming updates, tool calls, permissions, and agent sessions |
| MCP | Agent ↔ tools and data | Tool and context interoperability |

Agent Rosetta composes these layers rather than replacing either protocol:

- AHP remains VS Code's client-facing session protocol.
- ACP becomes a generic Agent Host runtime adapter.
- MCP remains the optional tool integration layer.

## 3. Problem Statement

VS Code's Agent Host has a common internal provider interface, but adding an agent currently requires an agent-specific adapter. Meanwhile, ACP already has an ecosystem of compatible agents, including Gemini CLI, Qwen Code, OpenCode, and other local or vendor-provided runtimes.

The missing component is a reusable translation layer that:

1. Starts and manages an ACP agent inside the Agent Host process boundary.
2. Maps ACP sessions and updates into the Agent Host's common provider and session model.
3. Maps Agent Host user actions back into ACP requests.
4. Preserves the native AHP-based VS Code experience without agent-specific UI code.

## 4. Goals

### 4.1 Product Goals

- Make configured ACP agents appear as native providers in the VS Code Agents Window.
- Allow the same adapter implementation to run multiple unrelated ACP agents.
- Preserve native Agent Host behavior, including execution independent of a connected editor window.
- Reuse existing VS Code UI for streaming output, tool activity, approvals, cancellation, and session visibility.
- Demonstrate an end-to-end coding workflow with no agent-specific UI implementation.

### 4.2 Engineering Goals

- Implement ACP support behind the existing `IAgent` and `IAgentChats` abstractions.
- Keep protocol translation isolated in a new `agentHost/node/acp` module.
- Launch ACP agents lazily and communicate through JSON-RPC 2.0 over stdio.
- Use capability negotiation instead of assuming optional ACP features.
- Surface unsupported capabilities and protocol failures explicitly.
- Avoid changes to the workbench and Agents Window unless required for generic provider correctness.

### 4.3 Hackathon Success Criteria

The MVP is successful when:

1. At least three independently configured ACP agents can appear in the native provider picker.
2. A user can start a session, submit a coding task, observe streamed output and tool activity, and cancel an active turn.
3. At least one agent completes an end-to-end workflow that edits code and runs a validation command.
4. A second VS Code window can observe the same running AHP session without creating a second ACP session.
5. Switching agents requires configuration only, with no agent-specific source or UI changes.

## 5. Non-Goals

The following are explicitly outside the hackathon MVP:

- Building a new chat sidebar, webview, or replacement Agents Window.
- Implementing a standalone AHP server from scratch.
- Supporting ACP v2.
- Supporting remote ACP transports over HTTP or WebSocket.
- Automatically discovering or installing agents from the ACP registry.
- Forwarding VS Code MCP servers to ACP agents.
- Advertising ACP client filesystem or terminal RPC capabilities.
- Providing restart-safe restoration for every ACP agent.
- Supporting multiple chats within one AHP session.
- Supporting chat fork, checkpoints, prompt attachments, or image input.
- Implementing ACP authentication UI; agents must be authenticated before launch.
- Hot-reloading agent configuration without restarting the Agent Host.
- Guaranteeing compatibility with agents that require optional ACP client capabilities.

## 6. User Experience

### 6.1 Configuration

The user configures one or more ACP executables. Each entry has a stable identifier and process launch information:

```jsonc
{
  "chat.agentHost.acpAgents": [
    {
      "id": "qwen",
      "name": "Qwen Code",
      "command": "npx",
      "args": ["@qwen-code/qwen-code@latest", "--acp"],
      "env": {}
    },
    {
      "id": "gemini",
      "name": "Gemini CLI",
      "command": "npx",
      "args": ["@google/gemini-cli@latest", "--experimental-acp"],
      "env": {}
    }
  ]
}
```

For the MVP, configuration is read when the Agent Host starts. Each entry is registered as an independent provider with a normalized provider identifier such as `acp-qwen`.

Validation requirements:

- `id` must be unique and contain only lowercase ASCII letters, numbers, and hyphens.
- `command` must not be empty.
- Environment entries must be strings.
- Invalid entries must be logged and omitted with an actionable error.
- Secrets are referenced through the environment; they are not stored or displayed by Agent Rosetta.

### 6.2 Native Provider Experience

After the Agent Host restarts:

1. Each valid configured agent appears in the native agent picker.
2. Selecting an agent and creating a session lazily launches its process.
3. Agent Rosetta completes ACP initialization and creates an ACP session rooted at the AHP session's working directory.
4. Prompts and updates use the existing VS Code session UI.
5. Closing the VS Code window does not stop the turn because the process is owned by the Agent Host.

### 6.3 Demo Flow

The recommended three-minute demonstration is:

1. Show Qwen Code, Gemini CLI, and OpenCode in the native agent picker.
2. Start a Qwen session and ask it to make a small code change and run a targeted test.
3. Show streamed reasoning or response content, tool activity, and an approval in native UI.
4. Open the same session from a second VS Code window while the task is still running.
5. Start a new session with Gemini or OpenCode using the same Agent Rosetta implementation.
6. Show the configuration and emphasize: three agents, one adapter, zero agent-specific UI.

## 7. Proposed Architecture

### 7.1 Placement

Agent Rosetta is implemented inside the existing VS Code Agent Host:

```text
src/vs/platform/agentHost/node/acp/
├── acpAgent.ts
├── acpClient.ts
├── acpConnection.ts
├── acpProtocol.ts
├── acpSession.ts
└── mapAcpSessionUpdates.ts
```

Responsibilities:

- `acpAgent.ts`: implements `IAgent` and `IAgentChats`.
- `acpClient.ts`: typed ACP v1 request/notification API.
- `acpConnection.ts`: child-process lifecycle and JSON-RPC stdio transport.
- `acpProtocol.ts`: minimal ACP v1 types needed by the MVP.
- `acpSession.ts`: AHP chat ↔ ACP session state and transcript ownership.
- `mapAcpSessionUpdates.ts`: translates ACP updates into Agent Host signals.

If adopting the official ACP TypeScript SDK is straightforward and compatible with VS Code's dependency constraints, it should replace locally defined wire types. The implementation must not maintain a second hand-written protocol stack when the official SDK covers the required behavior.

### 7.2 Provider Registration

At Agent Host startup:

1. Read and validate configured ACP agent entries.
2. Create one `AcpAgent` instance per entry.
3. Register each instance through `AgentService.registerProvider`.
4. Publish the resulting descriptors through the existing AHP root state.

The workbench already dynamically registers Agent Host providers from `rootState.agents`; therefore the MVP should not require a new chat UI or per-agent workbench contribution.

### 7.3 Process Model

Each configured provider owns at most one ACP child process:

```text
AcpAgent(acp-qwen)
  └── AcpConnection
      └── qwen --acp
          ├── ACP session A
          └── ACP session B
```

The process is launched lazily on the first operation that requires it. Multiple AHP sessions for the same provider share the connection because ACP supports multiple sessions per connection.

The connection lifecycle is:

```text
notStarted → starting → initializing → ready
                    ↘ failed
ready → exited → failed
```

Rules:

- Concurrent startup requests share one startup promise.
- JSON-RPC requests have bounded timeouts.
- Agent `stderr` is written to the Agent Host log with provider context.
- Unexpected process exit fails in-flight turns and marks the provider unavailable.
- The MVP does not silently restart an agent during an active turn.
- Process disposal rejects pending requests and terminates the child process.

### 7.4 Session Model

One concrete AHP chat maps to one ACP session:

```text
AHP session
  └── default AHP chat URI
      └── ACP sessionId
```

Agent Rosetta stores:

- AHP chat URI.
- ACP session identifier.
- Working directory used to create the ACP session.
- Negotiated ACP protocol version and capabilities.
- Current turn state.
- Minimal transcript required by `getMessages`.
- Active tool-call metadata needed for incremental updates.

The hackathon MVP supports only the default chat. `createChat`, `fork`, and `disposeChat` return explicit unsupported-operation errors.

### 7.5 Working Directory

The first AHP working directory becomes ACP's `cwd` for `session/new`.

MVP rules:

- Exactly one working directory is supported.
- Workspace-less sessions are rejected with a clear message.
- Additional AHP working directories are ignored only if none are active; otherwise the operation is rejected as unsupported rather than silently changing semantics.
- The working directory must be a local file URI visible to the Agent Host.
- Changing working directories after ACP session creation is unsupported.

## 8. Protocol Mapping

### 8.1 Lifecycle and Capabilities

| Agent Host operation | ACP v1 operation | Notes |
|---|---|---|
| Provider startup | `initialize` | Negotiate protocol version and record capabilities |
| Create AHP session/chat | `session/new` | Use the AHP working directory as `cwd` |
| Send user message | `session/prompt` | Stream updates while request is active |
| Cancel turn | `session/cancel` | Also cancel the local pending request |
| Dispose session | `session/close` if supported | Otherwise remove local mapping and keep no resumable guarantee |
| Restore history | `session/load` if supported | Not required for MVP |

Agent Rosetta advertises Agent Host capabilities conservatively. A capability is exposed only when both the adapter and the connected ACP agent can support it.

### 8.2 Content Updates

| ACP v1 update | Agent Host representation |
|---|---|
| `agent_message_chunk` | Assistant response delta |
| `agent_thought_chunk` | Thinking/reasoning response part |
| `user_message_chunk` | Ignored for live echo; retained for restore if needed |
| `plan` | Plan/progress part when representable |
| `available_commands_update` | Deferred beyond MVP |
| `current_mode_update` | Deferred beyond MVP |
| `session_info_update` | Session metadata update where representable |
| Prompt completion and `stopReason` | Turn completion or cancellation |

Text chunks must preserve ordering. Unknown update variants are logged at debug level and otherwise ignored only when ACP forward-compatibility permits that behavior.

### 8.3 Tool Calls

| ACP v1 update | Agent Host representation |
|---|---|
| `tool_call` | Start an AHP tool call |
| `tool_call_update` with progress | Update tool call status/content |
| `tool_call_update` completed | Complete the AHP tool call |
| `tool_call_update` failed | Complete with an explicit error |

Tool-call identifiers are scoped to an ACP session and mapped to AHP tool-call identifiers. Duplicate starts and updates for unknown identifiers are treated according to ACP upsert semantics where possible; invalid transitions are logged and surfaced as protocol errors when state cannot be recovered safely.

### 8.4 Permissions

ACP permission requests are server-initiated JSON-RPC requests. Agent Rosetta maps each request to the Agent Host's existing confirmation flow:

```text
ACP agent requests permission
          │
          ▼
Agent Rosetta emits AHP pending confirmation
          │
          ▼
User approves or denies in native VS Code UI
          │
          ▼
Agent Rosetta resolves ACP request with selected option
```

Requirements:

- The ACP request remains pending until the AHP user decision arrives.
- Cancellation or session disposal resolves the request as denied/cancelled.
- Permission option identifiers are preserved exactly.
- Agent Rosetta must never auto-approve a request in the MVP.

### 8.5 Filesystem, Terminal, and MCP

ACP v1 allows a client to advertise filesystem and terminal capabilities. Agent Rosetta does not advertise these capabilities in the MVP.

Reasons:

- The Agent Host is self-contained and runs beside the workspace.
- Many coding agents already own their filesystem and terminal tools.
- Correctly proxying these operations requires additional permission, lifecycle, output, and path-security design.
- ACP v2 removes these client RPC surfaces and recommends MCP for client-provided tools.

MCP servers are not forwarded during the MVP. `session/new` sends an empty MCP server list unless the ACP schema permits omission.

## 9. Internal Interfaces

The adapter implements the existing `IAgent` surface:

- Provider descriptor and model information.
- Session creation and disposal.
- Session configuration resolution.
- Session list integration through Agent Host metadata.
- `IAgentChats.sendMessage`.
- `IAgentChats.abort`.
- `IAgentChats.getMessages`.
- Progress emission through `onDidSessionProgress`.

Unsupported operations must fail explicitly:

- Additional chat creation.
- Chat fork.
- Model switching when the ACP agent does not expose an equivalent config option.
- Custom agent switching.
- Attachments and images.

The adapter must not claim support for capabilities merely because the Agent Host interface contains the corresponding method.

## 10. Configuration and Models

Each configured ACP executable is represented as a distinct Agent Host provider rather than as a model under one generic provider. This preserves provider identity, authentication boundaries, process ownership, session filtering, and independent failure states.

For the MVP:

- Provider ID: `acp-<configured-id>`.
- Display name: configured `name`, falling back to `id`.
- Model catalog: one synthetic `default` model unless the ACP agent exposes a compatible model configuration option.
- Provider description: `"ACP agent: <name>"`.
- Configuration changes require an Agent Host restart.

Treating different agents as models of a single provider is rejected because agents can have different capabilities, authentication, sessions, tools, and process lifecycles.

## 11. Error Handling

Errors are categorized and surfaced with provider context:

| Category | Example | Behavior |
|---|---|---|
| Configuration | Invalid ID or missing command | Skip provider and log actionable error |
| Launch | Command not found | Fail session creation and preserve stderr/details |
| Handshake | Unsupported ACP version | Mark provider unavailable |
| Protocol | Invalid JSON-RPC or illegal state transition | Fail affected request; terminate connection if framing is unsafe |
| Timeout | No initialize or prompt response | Cancel request and surface timeout |
| Agent exit | Child process crashes | Fail in-flight turns and mark sessions disconnected |
| Unsupported capability | Agent requires client terminal RPC | Explain incompatibility rather than silently continuing |

No broad catch should convert failures into successful empty responses. Unknown, optional ACP notifications may be ignored only when the protocol explicitly permits forward-compatible handling.

## 12. Security and Trust

ACP assumes a trusted coding agent. Agent Rosetta still needs clear local security boundaries:

- Only explicitly configured commands are launched.
- Commands run with the Agent Host user's permissions.
- The configured working directory is passed to the agent.
- Environment variables may contain credentials and must never be logged.
- `stderr` logging must not include the configured environment.
- Permission requests default to interactive user confirmation.
- Agent Rosetta does not provide additional filesystem or terminal privileges in the MVP.
- The UI should make the concrete ACP provider identity visible before session creation.

Agent Rosetta is not a sandbox. Users are responsible for trusting installed ACP agents.

## 13. Observability

The MVP should emit structured Agent Host log entries for:

- Provider registration.
- Process launch and exit.
- ACP version and negotiated capability names.
- Session creation and closure.
- Prompt start, completion, cancellation, and duration.
- Permission request and decision, excluding sensitive content.
- Protocol errors and request timeouts.

Raw prompts, file contents, environment variables, and credentials must not be logged.

Protocol traffic logging may be added behind a development-only flag, with clear warnings about sensitive content.

## 14. MVP Scope

### 14.1 Included

- Experimental Agent Rosetta provider support in the VS Code Agent Host.
- Multiple statically configured ACP agents.
- ACP v1.
- JSON-RPC 2.0 over stdio.
- Lazy child-process startup.
- One child process per configured provider.
- Multiple ACP sessions over a provider connection when supported.
- One AHP default chat mapped to one ACP session.
- One local working directory.
- Text response streaming.
- Thinking/reasoning streaming when provided.
- Basic plan/progress mapping when straightforward.
- Tool-call start, progress, completion, and failure display.
- Interactive permission approval and denial.
- Turn cancellation.
- Minimal in-memory transcript for the active Agent Host lifetime.
- ACP v1 select model options discovered from `session/new`, updated by `config_option_update`, and changed through `session/set_config_option`.
- Native provider discovery through existing AHP root state.
- A demo using at least three ACP agents and one end-to-end coding task.

### 14.2 Excluded

- ACP v2.
- HTTP, WebSocket, or cloud ACP transports.
- ACP registry browsing or installation.
- ACP authentication flows.
- MCP server forwarding.
- ACP client filesystem APIs.
- ACP client terminal APIs.
- Multiple AHP working directories.
- Additional chats, chat fork, and chat disposal.
- Checkpoints and changeset-specific integration.
- Prompt attachments, images, and embedded resources.
- Non-model ACP session configuration options, including modes, reasoning levels, and boolean options.
- Reliable restoration after Agent Host or ACP process restart.
- Automatic ACP process restart and turn replay.
- Hot configuration reload.
- Telemetry beyond development logs.

### 14.3 Compatibility Promise

The MVP supports ACP agents that:

- Implement ACP v1 over stdio.
- Can operate without ACP client filesystem or terminal capabilities.
- Are already authenticated, or require no authentication.
- Accept a single local working directory.
- Do not require MCP servers for their baseline coding workflow.

“Any ACP agent” is the architectural goal, not an unconditional MVP compatibility claim.

## 15. Implementation Plan

### Phase 1: Vertical Text Slice

1. Add ACP agent configuration and startup registration.
2. Launch one ACP process and complete `initialize`.
3. Create an ACP session from an AHP session.
4. Map prompt, text chunks, completion, and cancellation.
5. Demonstrate a complete text-only conversation in native UI.

### Phase 2: Coding Workflow

1. Map tool-call lifecycle updates.
2. Map ACP permission requests to AHP confirmation.
3. Preserve a minimal transcript for `getMessages`.
4. Run an agent that edits a file and executes a test.

### Phase 3: Universal Demonstration

1. Validate three ACP agents using configuration only.
2. Verify a second VS Code client can observe the same running AHP session.
3. Improve errors, logs, and demo setup.
4. Record the three-minute demo.

Work should stop after Phase 1 if necessary to preserve a stable working prototype. A reliable vertical slice is more valuable than partially implemented optional capabilities.

## 16. Testing Strategy

### 16.1 Unit Tests

Use a fake in-memory ACP peer to test:

- Initialization and capability negotiation.
- JSON-RPC request/response correlation.
- Ordered text and thought chunk mapping.
- Tool-call state transitions.
- Permission approval, denial, cancellation, and disposal.
- Prompt cancellation.
- Process exit and timeout behavior.
- Unsupported operations.
- Redaction of environment variables in logs.

### 16.2 Integration Tests

Create a deterministic fake ACP executable that:

1. Accepts stdio ACP v1.
2. Creates sessions.
3. Streams a fixed response.
4. Emits a tool call.
5. Requests permission.
6. Completes or responds to cancellation.

Exercise it through the Agent Host provider interface rather than testing only the ACP client in isolation.

### 16.3 Manual Compatibility Matrix

| Agent | Initialize | Prompt | Streaming | Tool calls | Permission | Cancel | Coding workflow |
|---|---|---|---|---|---|---|---|
| Qwen Code |  |  |  |  |  |  |  |
| Gemini CLI |  |  |  |  |  |  |  |
| OpenCode |  |  |  |  |  |  |  |

The matrix records observed compatibility; it is not used to add agent-specific branches.

## 17. Risks and Mitigations

### Protocol Semantic Mismatch

**Risk:** AHP models durable, shared host sessions while ACP often assumes an editor-owned subprocess.

**Mitigation:** Keep the ACP subprocess owned by the Agent Host, use one ACP session per AHP chat, and explicitly exclude restart-safe durability from the MVP.

### ACP v1/v2 Transition

**Risk:** ACP v2 changes prompt completion, capabilities, filesystem, terminal, and update semantics.

**Mitigation:** Negotiate and support v1 only for the hackathon. Keep transport and mapping modules separated so v2 can be added later.

### Agent Capability Variance

**Risk:** Some ACP agents require optional client filesystem, terminal, authentication, or MCP capabilities.

**Mitigation:** Publish a precise MVP compatibility profile, validate three known-compatible agents, and return actionable unsupported-capability errors.

### Permission Deadlock

**Risk:** An ACP request can remain blocked if its AHP confirmation is lost or the session is disposed.

**Mitigation:** Track every pending permission request, resolve it on cancellation/disposal, and enforce request timeouts.

### Hackathon Scope Expansion

**Risk:** Registry, remote transports, ACP v2, and full persistence distract from the core demonstration.

**Mitigation:** Treat the text vertical slice as the mandatory milestone and enforce the included/excluded MVP lists.

### Existing ACP Extensions Reduce Originality

**Risk:** Judges may see Agent Rosetta as another ACP client.

**Mitigation:** Demonstrate native Agent Host properties that ordinary chat extensions do not provide: shared AHP state, independent execution, native provider discovery, and multi-window observation.

## 18. Future Work

After the MVP:

- ACP v2 support with per-connection version negotiation.
- Restart-safe `session/list`, `session/load`, and `session/resume`.
- ACP session configuration options for models, modes, and reasoning levels.
- MCP server forwarding and a VS Code-to-MCP proxy for client tools.
- Remote ACP transports.
- ACP registry discovery and managed installation.
- Multiple chats and fork mapping.
- Prompt attachments and images.
- Provider health UI and process restart.
- A compatibility conformance suite for ACP agents.
- A standalone AHP↔ACP bridge for non-VS Code AHP clients.
- Capability-aware routing across ACP agents based on task, latency, privacy, and cost.

## 19. Open Questions

These questions are intentionally deferred until implementation reveals the smallest compatible choice:

1. Can the official ACP TypeScript SDK be consumed directly under VS Code's dependency and build constraints?
2. What is the narrowest existing `AgentSignal` mapping for ACP thought, plan, and tool updates?
3. How should configured agent entries be forwarded into local and standalone Agent Host startup consistently?
4. Which three ACP agents work without client filesystem, terminal, MCP, or interactive authentication capabilities?
5. Does the existing Agent Host metadata layer provide enough in-process transcript persistence for the MVP, or must `AcpSession` retain reconstructed turns?

None of these questions should broaden the MVP. If a feature cannot fit the defined vertical slice, it remains excluded.

## 20. References

- VS Code Agent Host architecture: https://code.visualstudio.com/docs/agents/concepts/agent-host
- Agent Host Protocol: https://microsoft.github.io/agent-host-protocol/
- AHP source and SDKs: https://github.com/microsoft/agent-host-protocol
- Agent Client Protocol introduction: https://agentclientprotocol.com/get-started/introduction
- ACP architecture: https://agentclientprotocol.com/get-started/architecture
- ACP v1 specification: https://agentclientprotocol.com/protocol/v1/overview
- ACP v2 migration guide: https://agentclientprotocol.com/protocol/v2/migration
- ACP clients and ecosystem: https://agentclientprotocol.com/get-started/clients
- Existing VS Code ACP extension: https://github.com/formulahendry/vscode-acp
