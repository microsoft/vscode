# Multi-Agent Orchestrator Architecture

**Last Updated**: 2026-03-30
**Version**: 1.0.0
**Module Location**: `src/vs/workbench/contrib/multiAgent/`

## Overview

VS Code includes a comprehensive multi-agent orchestrator framework enabling specialized agents to collaborate on complex development tasks. The system provides:
- **Provider Management**: Register and manage AI provider accounts (OpenAI, Anthropic, Google, etc.)
- **Agent Lifecycle**: Create, configure, and execute agents with state management
- **Task Orchestration**: Decompose tasks and delegate to specialized agents
- **Load Balancing**: Automatic provider rotation with quota tracking

## Architecture

### Service Layer (`common/`)

```
IMultiAgentProviderService      — Interface for provider registry & account management
  └─ multiAgentProviderServiceImpl.ts — Implementation

IAgentLaneService               — Interface for agent lifecycle & state machine
  └─ agentLaneServiceImpl.ts     — Agent creation, execution, and status tracking

IOrchestratorService            — Interface for task decomposition & delegation
  └─ orchestratorServiceImpl.ts  — Analyze tasks, create execution plans, delegate

IProviderRotationService        — Interface for load balancing & quota management
  └─ providerRotationServiceImpl.ts — Auto-rotate providers, track usage

Supporting Modules:
  ├─ modelProviderMap.ts        — Built-in provider and model definitions
  └─ builtInAgents.ts           — 6 pre-configured agent templates
```

### UI Layer (`browser/`)

```
providersViewPane.ts           — Sidebar UI for provider/account management
agentLanesViewPane.ts          — Sidebar UI for agent execution and status monitoring
multiAgent.contribution.ts     — Service registration and extension configuration
```

## Core Services

### IMultiAgentProviderService

Manages AI provider accounts and configurations.

**Responsibilities**:
- Register/unregister AI providers
- Manage authentication credentials
- Track account quotas and usage
- Store provider configurations

**Key Features**:
- Multi-provider support (OpenAI, Anthropic, Google, Grok, etc.)
- Credential encryption and secure storage
- Usage quota tracking per provider
- Provider health checks and fallback logic

### IAgentLaneService

Controls agent lifecycle and execution state.

**Responsibilities**:
- Create and configure agent instances
- Manage agent lifecycle (create → run → complete → cleanup)
- Track agent execution state
- Handle agent communication and data passing

**Key Features**:
- Agent state machine (idle → running → completed)
- Agent configuration templates
- Execution history and logging
- Inter-agent message passing

### IOrchestratorService

Decomposes complex tasks and coordinates agent execution.

**Responsibilities**:
- Parse and analyze complex tasks
- Decompose into subtasks
- Create delegation strategies
- Execute and monitor orchestration

**Key Features**:
- Task analysis and planning
- Subtask assignment to agents
- Execution plan validation
- Progress monitoring and reporting

### IProviderRotationService

Balances load across providers and manages quotas.

**Responsibilities**:
- Track provider quota usage
- Auto-select next available provider
- Load balance across providers
- Handle provider fallback logic

**Key Features**:
- Fair rotation scheduling
- Quota exhaustion detection
- Provider availability monitoring
- Cost-aware provider selection

## Data Model

### Built-in Agents (6 templates)

1. **Task Analyzer** - Breaks down complex requests into subtasks
2. **Coder** - Implementation specialist for code generation
3. **Reviewer** - Code quality assessment and suggestions
4. **Tester** - Quality assurance and test creation
5. **Documenter** - Documentation and API reference generation
6. **Debugger** - Issue diagnosis and root cause analysis

### Provider/Model Map

Predefined configurations for:
- **OpenAI**: GPT-4, GPT-4-Turbo, GPT-3.5-Turbo
- **Anthropic**: Claude-3 (Opus, Sonnet, Haiku)
- **Google**: Gemini 2.5 Flash, Pro
- **Grok**: Grok-Code, Grok-Vision
- **Custom**: Local and custom endpoints

Per provider:
- Available models and versions
- Quota limits (tokens, requests per minute)
- Pricing tiers
- Feature support matrix

## Integration Points

### Sidebar Views

**Providers ViewPane**:
- List connected provider accounts
- Add/remove provider credentials
- Monitor quota usage
- Switch active provider

**Agent Lanes ViewPane**:
- Display active agents
- Show execution status and progress
- View agent logs and output
- Control agent execution (pause, cancel)

### Extension Configuration

The `multiAgent.contribution.ts` module:
- Registers services with VS Code's dependency injection
- Configures sidebar view providers
- Sets up command bindings
- Initializes default configuration

## Usage Patterns

### Simple Task Delegation

```
User Input
    ↓
Orchestrator analyzes task
    ↓
Selects appropriate agent(s)
    ↓
Agent Lane creates instance
    ↓
Provider Rotation selects provider
    ↓
Agent executes with provider
    ↓
Result displayed to user
```

### Complex Task Decomposition

```
User Input (complex task)
    ↓
Orchestrator decomposes into subtasks
    ↓
┌─→ Agent 1 (Analyzer)
├─→ Agent 2 (Coder)
├─→ Agent 3 (Tester)
└─→ Agent 4 (Documenter)
    ↓
Orchestrator collects results
    ↓
Final output composed
```

## Security Considerations

- **Credential Storage**: Encrypted in VS Code's secure storage
- **Provider Authentication**: OAuth 2.0 and API key support
- **Rate Limiting**: Enforced per provider
- **Audit Logging**: All agent executions logged
- **Sandbox Execution**: Agents run in isolated contexts

## Performance Characteristics

**Load Balancing**:
- Automatic provider rotation prevents quota exhaustion
- Cost-aware selection minimizes expenses
- Fallback logic ensures availability

**Scalability**:
- Unlimited agent instances (limited by provider quotas)
- Concurrent execution across providers
- Queue management for rate limiting

**Response Time**:
- Provider selection: < 10ms
- Agent initialization: 100-500ms
- Task execution: varies by task complexity

## Configuration

Configuration managed through:
- VS Code settings (`multiAgent.*`)
- Provider credentials (secure storage)
- Built-in agent templates
- Model provider mappings

## Related Documentation

- [System Architecture](./system-architecture.md) - Full system overview
- [Code Standards](./code-standards.md) - Development guidelines
- [Project Overview](./project-overview-pdr.md) - Project requirements

## Unresolved Questions

1. **Custom Agent Creation**: Should users be able to create custom agent templates in UI?
2. **Provider Quotas**: How to handle provider quota upgrades dynamically?
3. **Cross-Provider Tasks**: Support for tasks that span multiple providers?
