# Phase 3: Agent System Core

## Context Links
- [VS Code Chat Infrastructure Report](../reports/researcher-260330-1255-vscode-chat-infrastructure.md)
- [Multi-Agent Orchestrator Patterns](../reports/researcher-260330-1255-multi-agent-orchestrator-patterns.md)
- [IChatAgentService](../../src/vs/workbench/contrib/chat/common/participants/chatAgents.ts)

## Overview
- **Priority**: P0
- **Status**: implemented
- **Description**: Build the agent definition system — roles, lifecycle state machine, model/provider assignment, built-in agent templates

## Key Insights
- VS Code has `IChatAgentService.registerDynamicAgent()` for runtime agent creation
- Agents implement `IChatAgentImplementation` with `invoke()` method
- Existing chat modes (Ask/Edit/Agent) control agent behavior
- 7-state lifecycle: idle → queued → running → blocked → waiting → error → done

## Requirements

### Functional
- Define custom agents with name, role, system instructions, model, provider(s)
- Built-in agent templates: Designer, Planner, Coder, Tester, Reviewer, Debugger
- Agent lifecycle state machine with observable state changes
- Model assignment with provider fallback chain per agent
- Agent-provider validation (ensure selected provider supports selected model)
- Agent persistence across sessions (definitions stored, runtime state session-scoped)

### Non-Functional
- Agent definitions serializable to JSON
- Max 20 concurrent agents (performance guard)
- State transitions emit events for UI updates

## Architecture

### Agent Definition

```typescript
// src/vs/workbench/contrib/multiAgent/common/agent-definition.ts

interface IAgentDefinition {
  id: string;
  name: string;
  role: string;                    // 'designer', 'planner', 'coder', custom
  description: string;
  systemInstructions: string;      // Custom system prompt
  modelId: string;                 // e.g., 'claude-sonnet-4-20250514'
  providerIds: string[];           // Ordered fallback: ['anthropic', 'openrouter']
  icon?: string;                   // Codicon name
  isBuiltIn: boolean;
  capabilities: AgentCapability[]; // 'code-edit', 'file-read', 'terminal', 'web-search'
  maxConcurrentTasks: number;      // Default 1
}

type AgentCapability = 'code-edit' | 'file-read' | 'file-write' | 'terminal' | 'web-search' | 'image-gen';

// Built-in templates
const BUILT_IN_AGENTS: IAgentDefinition[] = [
  {
    id: 'builtin-planner',
    name: 'Planner',
    role: 'planner',
    description: 'Technical planning and architecture design',
    systemInstructions: 'You are a technical architect...',
    modelId: 'claude-opus-4',
    providerIds: ['anthropic', 'openrouter'],
    icon: 'layout',
    isBuiltIn: true,
    capabilities: ['file-read', 'web-search'],
    maxConcurrentTasks: 1,
  },
  // ... Designer, Coder, Tester, Reviewer, Debugger
];
```

### Agent Lifecycle State Machine

```typescript
// src/vs/workbench/contrib/multiAgent/common/agent-lifecycle.ts

enum AgentState {
  Idle = 'idle',
  Queued = 'queued',
  Running = 'running',
  Blocked = 'blocked',
  Waiting = 'waiting',
  Error = 'error',
  Done = 'done',
}

interface IAgentInstance {
  readonly definition: IAgentDefinition;
  readonly state: AgentState;
  readonly currentTaskId?: string;
  readonly currentTaskDescription?: string;
  readonly startedAt?: number;
  readonly error?: { message: string; retryCount: number };
  readonly activeProviderId?: string;   // Which provider currently in use
  readonly activeAccountId?: string;    // Which account currently in use
  readonly tokenUsage: { input: number; output: number };
}

// State transitions
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.Idle]:    [AgentState.Queued],
  [AgentState.Queued]:  [AgentState.Running, AgentState.Idle],
  [AgentState.Running]: [AgentState.Done, AgentState.Error, AgentState.Blocked, AgentState.Waiting],
  [AgentState.Blocked]: [AgentState.Running, AgentState.Error],
  [AgentState.Waiting]: [AgentState.Running, AgentState.Error],
  [AgentState.Error]:   [AgentState.Queued, AgentState.Idle],
  [AgentState.Done]:    [AgentState.Idle],
};
```

### Agent Lane Service

```typescript
// src/vs/workbench/contrib/multiAgent/common/agent-lane-service.ts

interface IAgentLaneService {
  // Agent definition CRUD
  getAgentDefinitions(): readonly IAgentDefinition[];
  getBuiltInAgents(): readonly IAgentDefinition[];
  addAgentDefinition(def: Omit<IAgentDefinition, 'id' | 'isBuiltIn'>): IAgentDefinition;
  updateAgentDefinition(id: string, updates: Partial<IAgentDefinition>): void;
  removeAgentDefinition(id: string): void;

  // Agent instances (runtime)
  getAgentInstances(): readonly IAgentInstance[];
  getAgentInstance(agentId: string): IAgentInstance | undefined;
  spawnAgent(definitionId: string): IAgentInstance;
  terminateAgent(agentId: string): void;

  // State management
  transitionState(agentId: string, newState: AgentState, metadata?: Record<string, unknown>): void;
  assignTask(agentId: string, taskId: string, description: string): void;
  completeTask(agentId: string, result: 'success' | 'failure', summary: string): void;

  // Validation
  validateModelProviderAssignment(modelId: string, providerIds: string[]): ValidationResult;

  // Events
  readonly onDidChangeDefinitions: Event<void>;
  readonly onDidChangeInstances: Event<IAgentInstance>;
  readonly onDidChangeState: Event<{ agentId: string; oldState: AgentState; newState: AgentState }>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];  // e.g., "Provider 'openai' does not support model 'claude-sonnet-4'"
}
```

### Integration with VS Code Chat

```typescript
// Bridge: register each spawned agent as a dynamic IChatAgent
function registerAgentAsChatParticipant(
  agentInstance: IAgentInstance,
  chatAgentService: IChatAgentService,
  languageModelsService: ILanguageModelsService
): IDisposable {
  const agentData: IChatAgentData = {
    id: `multiAgent.${agentInstance.definition.id}`,
    name: agentInstance.definition.name,
    description: agentInstance.definition.description,
    isDefault: false,
    isDynamic: true,
    // ... other fields
  };

  const agentImpl: IChatAgentImplementation = {
    invoke: async (request, progress, history, token) => {
      // Route through orchestrator or direct execution
      // Use agent's assigned model/provider via ILanguageModelsService
    },
  };

  return chatAgentService.registerDynamicAgent(agentData, agentImpl);
}
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/common/agent-definition.ts` — IAgentDefinition types + built-in templates
- `src/vs/workbench/contrib/multiAgent/common/agent-lifecycle.ts` — AgentState enum, transition rules, IAgentInstance
- `src/vs/workbench/contrib/multiAgent/common/agent-lane-service.ts` — IAgentLaneService interface
- `src/vs/workbench/contrib/multiAgent/common/agent-lane-service-impl.ts` — Implementation
- `src/vs/workbench/contrib/multiAgent/common/agent-chat-bridge.ts` — Bridge to IChatAgentService
- `src/vs/workbench/contrib/multiAgent/common/agent-definition-storage.ts` — Persistence

### Files to Reference
- `src/vs/workbench/contrib/chat/common/participants/chatAgents.ts` — IChatAgentService, registerDynamicAgent
- `src/vs/workbench/contrib/chat/common/languageModels.ts` — ILanguageModelsService
- `src/vs/workbench/contrib/chat/common/chatService/chatService.ts` — IChatService

## Implementation Steps

1. Define `IAgentDefinition` type and built-in agent templates (6 templates)
2. Implement `AgentState` enum and state transition validator
3. Define `IAgentInstance` interface for runtime agent state
4. Define `IAgentLaneService` interface
5. Implement `AgentLaneService`:
   - Agent definition CRUD with JSON persistence
   - Agent instance spawning with state machine
   - Model-provider validation (cross-reference with IMultiAgentProviderService)
6. Implement `AgentChatBridge`:
   - Register spawned agents as dynamic chat participants
   - Route chat requests through agent's assigned model/provider
   - Handle streaming responses
7. Register `IAgentLaneService` as singleton
8. Unit tests for state transitions, CRUD, validation

## Todo List
- [ ] Define IAgentDefinition type and 6 built-in templates
- [ ] Implement AgentState enum and transition rules
- [ ] Define IAgentInstance and IAgentLaneService interfaces
- [ ] Implement AgentLaneService (CRUD + state machine)
- [ ] Implement model-provider validation
- [ ] Build AgentChatBridge (register as dynamic chat participants)
- [ ] Implement agent definition persistence
- [ ] Register singleton service
- [ ] Unit tests for state transitions and validation

## Success Criteria
- Can create custom agents with role, model, provider assignment
- Built-in templates available and spawn correctly
- State machine enforces valid transitions only
- Agents registered as dynamic chat participants in VS Code
- Model-provider validation prevents incompatible assignments
- Agent definitions persist across sessions

## Risk Assessment
- State machine complexity — mitigate with strict transition validation + logging
- Chat bridge compatibility — isolate via adapter pattern, test with mock IChatAgentService
