## Chat sessions / background agent architecture

> **Keep this document in sync with the code.** If you change how session types are registered, modify the extension point, or update the agent-host's registration pattern, update this document as part of the same change.

There are **three layers** that connect to form a chat session type (like "Background Agent" / "Copilot CLI"):

### Layer 1: `chatSessions` Extension Point (package.json)

In package.json, the extension contributes to the `"chatSessions"` extension point. Each entry declares a session **type** (used as a URI scheme), a **name** (used as a chat participant name like `@cli`), display metadata, capabilities, slash commands, and a `when` clause for conditional availability.

### Layer 2: VS Code Platform -- Extension Point + Service

On the VS Code side:

- chatSessions.contribution.ts -- Registers the `chatSessions` extension point via `ExtensionsRegistry.registerExtensionPoint`. When extensions contribute to it, the `ChatSessionsService` processes each contribution: it sets up context keys, icons, welcome messages, commands, and -- if `canDelegate` is true -- also **registers a dynamic chat agent**.

- chatSessionsService.ts -- The `IChatSessionsService` interface manages two kinds of providers:
  - **`IChatSessionItemController`** -- Lists available sessions
  - **`IChatSessionContentProvider`** -- Provides session content (history + request handler) when you open a specific session

- agentSessions.ts -- The `AgentSessionProviders` enum maps well-known types to their string identifiers:
  - `Local` = `'local'`
  - `Background` = `'copilotcli'`
  - `Cloud` = `'copilot-cloud-agent'`
  - `Claude` = `'claude-code'`
  - `Codex` = `'openai-codex'`
  - `Growth` = `'copilot-growth'`
  - `AgentHostCopilot` = `'agent-host-copilot'`

### Layer 3: Extension Side Registration

Each session type registers three things via the proposed API:

1. **`vscode.chat.registerChatSessionItemProvider(type, provider)`** -- Provides the list of sessions
2. **`vscode.chat.createChatParticipant(type, handler)`** -- Creates the chat participant
3. **`vscode.chat.registerChatSessionContentProvider(type, contentProvider, chatParticipant)`** -- Binds content provider to participant

### Agent Host: Internal (Non-Extension) Registration

The agent-host session types (`agent-host-copilot`) bypass the extension point entirely. A single `AgentHostContribution` discovers available agents from the agent host process via `listAgents()` and dynamically registers each one:

**For each `IAgentDescriptor` returned by `listAgents()`:**
1. Chat session contribution via `IChatSessionsService.registerChatSessionContribution()`
2. Session item controller via `IChatSessionsService.registerChatSessionItemController()`
3. Session content provider via `IChatSessionsService.registerChatSessionContentProvider()`
4. Language model provider via `ILanguageModelsService.registerLanguageModelProvider()`
5. Auth token push (only if `descriptor.requiresAuth` is true)

All use the same generic `AgentHostSessionHandler` class, configured with the descriptor's metadata.

### All Entry Points

| # | Entry Point | File |
|---|-------------|------|
| 1 | **package.json `chatSessions` contribution** | package.json -- declares type, name, capabilities |
| 2 | **Extension point handler** | chatSessions.contribution.ts -- processes contributions |
| 3 | **Service interface** | chatSessionsService.ts -- `IChatSessionsService` |
| 4 | **Proposed API** | vscode.proposed.chatSessionsProvider.d.ts |
| 5 | **Agent session provider enum** | agentSessions.ts -- `AgentSessionProviders` |
| 6 | **Agent Host contribution** | agentHost/agentHostChatContribution.ts -- `AgentHostContribution` (discovers + registers dynamically) |
| 7 | **Agent Host process** | src/vs/platform/agent/ -- utility process, SDK integration |
| 8 | **Desktop registration** | electron-browser/chat.contribution.ts -- registers `AgentHostContribution` |
