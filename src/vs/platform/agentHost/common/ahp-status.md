# Agent Host Protocol - Feature Status & Gaps

Tracking the status of each feature across three layers:

1. **Protocol** - Is it defined in the AHP type definitions?
2. **CopilotAgent** - Is it implemented by `CopilotAgent` in the agent host server (`src/vs/platform/agentHost/`)?
3. **VS Code** - Is it fully plumbed through to the VS Code chat UI?

Status key: Y = yes, P = partial, N = no

Priority key: P0 = critical for self-hosting, P1 = important for feature parity, P2 = nice to have

---

| Feature | Pri | Protocol | CopilotAgent | VS Code | Notes |
|---------|-----|----------|-------------|---------|-------|
| **In protocol, not fully implemented** | | | | | |
| Tool call confirmation (approve/deny) | | Y | P | P | CopilotAgent auto-confirms as not-needed; VS Code only wires permission-based confirmation |
| Tool call result confirmation | | Y | N | N | CopilotAgent never requests it; VS Code UI doesn't handle it |
| Tool `_meta` (terminal PTY etc) | | Y | Y | P | CopilotAgent populates `ptyTerminal`; VS Code reads some keys; keys not formally documented |
| Server tools changed | | Y | N | N | CopilotAgent does not publish server tools yet |
| Active client changed | | Y | N | N | Not implemented in CopilotAgent or VS Code |
| Active client tools changed | | Y | N | N | Not implemented |
| Client-provided tool execution | | Y | N | N | Protocol supports `toolClientId`; not wired up |
| Fetch content (binary/text) | | Y | Y | P | CopilotAgent serves files; VS Code only fetches for diffs |
| Fetch turns (pagination) | | Y | Y | N | Implemented server-side; VS Code gets turns via subscribe snapshot |
| Session rename (client-initiated) | P2 | P | N | N | `session/titleChanged` is server-only; no client->server rename command |
| **Not yet in protocol** | | | | | |
| Pending edits / cumulative changes | P0 | N | N | N | Extension has via worktree `getWorktreeChanges()`; need `changes` on session state or `fetchSessionChanges` command |
| Worktree / git isolation | P0 | N | N | N | Extension has full worktree lifecycle; protocol only has `workingDirectory` |
| Steering / queue | P1 | P | N | N | Reducer accepts overlapping `turnStarted` but semantics undefined; need `session/steeringMessage` or similar |
| MCP server configuration | P1 | N | N | N | Copilot Chat extension manages MCP servers per session; no protocol concept of MCP server lifecycle |
| Custom agents | P1 | N | N | N | Extension has `.agent.md` configs, per-session agent tracking; protocol only has provider-level `IAgentInfo` |
| NeedsInput status | P1 | N | N | N | Extension has `NeedsInput` for user questions; protocol only has `Idle`/`InProgress`/`Error` |
| Elicitations | P1 | N | N | N | MCP-style elicitation (server asks client to collect structured input from user); extension has `ask_questions` tool; no protocol concept of elicitation requests |
| Session options discovery | P1 | N | N | N | Extension has dynamic option groups (isolation, branch, folder, agent); protocol has flat `ICreateSessionParams` |
| Permission policies | P2 | N | P | N | CopilotAgent auto-approves reads in workdir; no session-wide policy concept in protocol |
| Session forking | P2 | N | N | N | Extension has `forkSession` with turn selection |
| Slash commands | P1 | N | N | N | Extension has `/create-pr`, `/merge-changes`, etc; Claude has `/agents`, `/memory`; no protocol concept of commands |
| Session delegation (local<->cloud) | P2 | N | N | N | Extension has `CopilotCloudSessionsProvider` |
