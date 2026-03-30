# VS Code Chat & Agent Infrastructure Research

## Executive Summary

VS Code implements a **layered chat architecture** with three tiers: chat sessions (UI/service layer), language models (provider abstraction), and agents/participants (task execution). The system supports multiple chat modes (ask/edit/agent), dynamic agent registration, and remote agent hosting through the **AgentHost protocol**. Key insight: agents are pluggable handlers; chat modes are curated behaviors; language models are provider-agnostic.

---

## Architecture Overview

### Core Services (Dependency Layer)

| Service | File | Purpose |
|---------|------|---------|
| **IChatService** | `chatService/chatService.ts` | Session lifecycle, request queuing, response streaming |
| **ILanguageModelsService** | `languageModels.ts` | Model registration, vendor abstraction, API dispatch |
| **IChatAgentService** | `participants/chatAgents.ts` | Agents registration, slash commands, request routing |
| **IChatModeService** | `chatModes.ts` | Chat modes (ask/edit/agent), custom prompt modes, mode discovery |
| **IChatSessionsService** | `chatSessionsService.ts` | Session storage and retrieval |
| **ILanguageModelsConfigurationService** | `languageModelsConfiguration.ts` | Provider group config, per-model settings |

---

## Key Interfaces & Data Flow

### Chat Request → Response Pipeline

```
User Input (IChatRequest)
  ↓
IChatService.sendRequest()
  ↓
IChatAgentService routes to agent by @mention
  ↓
IChatAgent.invoke() (custom implementation)
    • Progress: IChatProgress[] streamed in real-time
    • Tools: Language model tool calls via ILanguageModelsService
    • Results: IChatAgentResult
  ↓
IChatResponseModel collects response parts
```

### Model Provider Registration

```
ILanguageModelChatProvider (vendor-specific)
  ↓
ILanguageModelsService.registerLanguageModelProvider()
  ↓
ILanguageModelChatMetadata lookup by ID or qualified name
  ↓
sendChatRequest() dispatches to vendor implementation
```

---

## Core Components

### 1. Chat Sessions (IChatModel)

**Location:** `common/model/chatModel.ts`

- Holds request/response history
- Manages editing sessions (code modifications)
- Supports serialization (export/import)
- Observable-based reactive state

### 2. Agents/Participants (IChatAgent)

**Location:** `common/participants/chatAgents.ts`

- **Data:** `IChatAgentData` (metadata, slash commands, locations, modes)
- **Implementation:** `IChatAgentImplementation` (invoke, followups, title/summary generation)
- **Request:** `IChatAgentRequest` (message, variables, user-selected tools, location context)
- **Result:** `IChatAgentResult` (metadata, error details, exit code)
- **Attachment Capabilities:** `IChatAgentAttachmentCapabilities` (files, tools, MCP, images, etc.)

### 3. Language Models (ILanguageModelsService)

**Location:** `languageModels.ts`

**Key Methods:**
- `selectLanguageModels(selector)` — filter by capabilities
- `sendChatRequest(modelId, messages, options, token)` — dispatch LLM call
- `computeTokenLength(modelId, message)` — token counting
- `getModelConfiguration(modelId)` — per-model settings
- `setModelConfiguration(modelId, values)` — persist config

**Provider Pattern:**
```ts
registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider)
  → provider.provideChatResponse(request, token)
  → yields ILanguageModelChatResponse (streamed parts)
```

### 4. Chat Modes (IChatModeService)

**Location:** `chatModes.ts`

**Built-in Modes:**
- `ChatModeKind.Ask` — conversational (default)
- `ChatModeKind.Edit` — code editing focus
- `ChatModeKind.Agent` — autonomous task execution

**Custom Modes:**
- Loaded from `.prompt` files (custom prompt definitions)
- Cached in workspace storage
- Policy-controlled (agent mode can be disabled via config)

### 5. Configuration (ILanguageModelsConfigurationService)

**Location:** `languageModelsConfiguration.ts`

- Manages `.vscode/languages-models.json` configuration file
- `ILanguageModelsProviderGroup`: vendor + settings + per-model config
- Supports dynamic provider group management (add/remove/update)

---

## AgentHost Protocol (Remote Agents)

**Location:** `browser/agentSessions/agentHost/`

Bridges **remote agents** (external processes) to VS Code chat:

| File | Role |
|------|------|
| `agentHostSessionHandler.ts` | Subscribes to session state, transforms to IChatProgress[], dispatches actions |
| `agentHostLanguageModelProvider.ts` | Provides language models from remote agent |
| `stateToProgressAdapter.ts` | Converts agent state/turns to progress events |
| `agentHostEditingSession.ts` | Manages remote code editing sessions |

**Key Concept:** AgentHost bridges two protocol layers:
- **Client side:** VS Code chat UI (IChatProgress, IChatAgentRequest)
- **Server side:** Immutable session state (SessionClientState, ActionType)

---

## Chat Modes: Configuration-Based Behavior

**How Modes Are Discovered:**
1. Built-in modes (ask/edit/agent) available by default
2. Custom modes loaded from `.prompt` files in workspace
3. Context keys control visibility (e.g., `chat.modes.hasCustomModes`)
4. Policy: `chat.agent.enabled` controls agent mode availability

**Mode Metadata:**
- ID, name, description
- Associated agent (required agent ID)
- Required capabilities
- Default model preferences

---

## Extension Points for Integration

1. **Register Custom Agent:**
   ```ts
   IChatAgentService.registerDynamicAgent(agentData, implementation)
   ```

2. **Register Language Model Provider:**
   ```ts
   ILanguageModelsService.registerLanguageModelProvider(vendor, provider)
   ```

3. **Add Slash Commands:**
   ```ts
   IChatAgentData.slashCommands: IChatAgentCommand[]
   ```

4. **Define Chat Mode:**
   - Create `.prompt` file with prompt definitions
   - Discovered automatically by IChatModeService

5. **Tool Integration:**
   - Agents attach tools via `setRequestTools()`
   - ILanguageModelsService dispatches tool calls to model

---

## Configuration Keys (ChatConfiguration enum)

**Critical configs:**
- `chat.agent.enabled` — enable/disable agent mode
- `chat.disableAIFeatures` — kill switch
- `chat.tools.edits.autoApprove` — auto-approve edits
- `chat.extensionTools.enabled` — allow extension tools
- `chat.customAgentInSubagent.enabled` — subagent capability

---

## Unresolved Questions

1. **Protocol versioning:** How does AgentHost handle breaking changes between VS Code versions and remote agents?
2. **Tool confirmation flow:** How are tool approval workflows (user vs. auto-approve) integrated with remote agents?
3. **Model fallback:** What happens when a selected model is unavailable?
4. **State persistence:** How are in-flight agent requests persisted across editor restart?
