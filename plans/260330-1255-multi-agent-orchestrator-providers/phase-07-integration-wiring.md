# Phase 7: Integration & Wiring

## Context Links
- All previous phases (1-6)
- [VS Code Chat Infrastructure](../reports/researcher-260330-1255-vscode-chat-infrastructure.md)

## Overview
- **Priority**: P2
- **Status**: implemented
- **Description**: Wire all components together, register in VS Code workbench, ensure contribution loading, add commands/keybindings, and integration testing

## Key Insights
- VS Code loads contributions via direct imports in workbench entry files
- Need to register our contribution.ts in the right workbench import chain
- Commands and keybindings for opening views, managing agents
- Configuration settings for feature toggles and defaults

## Requirements

### Functional
- All services registered and resolvable via DI
- Contribution file loaded at workbench startup
- Commands: open providers, open agent lanes, create agent, submit task
- Keybindings for quick access
- Configuration settings for defaults (max agents, rotation strategy, etc.)
- Context keys for conditional UI (agent mode enabled, agents active, etc.)

### Non-Functional
- No startup performance regression (lazy service instantiation)
- Clean contribution loading order
- Feature toggleable via configuration

## Architecture

### Contribution Loading Chain

```
src/vs/workbench/workbench.common.main.ts
  └── import './contrib/multiAgent/browser/multiAgent.contribution.js'
        ├── registerSingleton(IMultiAgentProviderService, ...)
        ├── registerSingleton(IAgentLaneService, ...)
        ├── registerSingleton(IOrchestratorService, ...)
        ├── registerSingleton(IProviderRotationService, ...)
        ├── registerViewContainer(...)
        ├── registerViews([ProvidersViewPane, AgentLanesViewPane])
        ├── registerActions([OpenProviders, OpenAgentLanes, CreateAgent, ...])
        └── registerConfiguration(multiAgentSettings)
```

### Commands & Keybindings

```typescript
// Commands
const COMMANDS = {
  OPEN_PROVIDERS: 'workbench.action.multiAgent.openProviders',
  OPEN_AGENT_LANES: 'workbench.action.multiAgent.openAgentLanes',
  CREATE_AGENT: 'workbench.action.multiAgent.createAgent',
  SUBMIT_TASK: 'workbench.action.multiAgent.submitTask',
  TOGGLE_AGENT: 'workbench.action.multiAgent.toggleAgent',
};

// Keybindings
registerKeybinding(COMMANDS.OPEN_PROVIDERS, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP);
registerKeybinding(COMMANDS.OPEN_AGENT_LANES, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA);
```

### Configuration Settings

```typescript
// src/vs/workbench/contrib/multiAgent/common/multiAgent.configuration.ts

const multiAgentConfiguration: IConfigurationNode = {
  id: 'multiAgent',
  title: 'Multi-Agent',
  properties: {
    'multiAgent.enabled': {
      type: 'boolean',
      default: true,
      description: 'Enable multi-agent orchestrator features',
    },
    'multiAgent.maxConcurrentAgents': {
      type: 'number',
      default: 10,
      description: 'Maximum number of concurrent agent instances',
    },
    'multiAgent.defaultModel': {
      type: 'string',
      default: 'claude-sonnet-4',
      description: 'Default model for new agents',
    },
    'multiAgent.rotationStrategy': {
      type: 'string',
      enum: ['priority', 'round-robin', 'cost-optimized'],
      default: 'priority',
      description: 'Provider rotation strategy',
    },
    'multiAgent.taskTimeout': {
      type: 'number',
      default: 300000,
      description: 'Task timeout in milliseconds (default: 5 minutes)',
    },
    'multiAgent.orchestrator.enabled': {
      type: 'boolean',
      default: true,
      description: 'Enable orchestrator for automatic task decomposition',
    },
  },
};
```

### Context Keys

```typescript
const CONTEXT_KEYS = {
  MULTI_AGENT_ENABLED: new RawContextKey<boolean>('multiAgent.enabled', true),
  HAS_ACTIVE_AGENTS: new RawContextKey<boolean>('multiAgent.hasActiveAgents', false),
  HAS_PROVIDERS: new RawContextKey<boolean>('multiAgent.hasProviders', false),
  ORCHESTRATOR_BUSY: new RawContextKey<boolean>('multiAgent.orchestratorBusy', false),
};
```

## Related Code Files

### Files to Create/Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — Main contribution (extend from Phase 2)
- `src/vs/workbench/contrib/multiAgent/common/multiAgent.configuration.ts` — Settings
- `src/vs/workbench/contrib/multiAgent/common/multiAgent.contextkeys.ts` — Context keys
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.commands.ts` — Commands registration

### Files to Modify
- `src/vs/workbench/workbench.common.main.ts` — Add contribution import

### Files to Reference
- `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` — Registration pattern
- `src/vs/workbench/workbench.common.main.ts` — Import chain

## Implementation Steps

1. Consolidate `multiAgent.contribution.ts` — all service registrations, view registrations, action registrations in one file
2. Create `multiAgent.configuration.ts` — register all settings
3. Create `multiAgent.contextkeys.ts` — define and manage context keys
4. Create `multiAgent.commands.ts` — register commands with handlers
5. Add import to `workbench.common.main.ts`: `import './contrib/multiAgent/browser/multiAgent.contribution.js'`
6. Ensure lazy instantiation: services created on first use, not at startup
7. Add welcome content for empty states (no providers configured, no agents created)
8. Integration test: verify all services resolve, views render, commands work
9. End-to-end test: create provider → add account → create agent → submit task → verify orchestration

## Todo List
- [ ] Consolidate contribution file with all registrations
- [ ] Create configuration settings
- [ ] Define context keys
- [ ] Register commands and keybindings
- [ ] Add import to workbench entry point
- [ ] Add welcome content for empty states
- [ ] Integration tests
- [ ] End-to-end test

## Success Criteria
- Multi-Agent sidebar icon appears in VS Code sidebar
- Both views (Providers, Agent Lanes) render correctly
- All commands execute properly
- Configuration settings appear in VS Code settings
- Feature toggleable via `multiAgent.enabled` setting
- No startup performance regression
- All services resolvable via dependency injection

## Next Steps
- After integration: performance profiling, accessibility audit
- User documentation for creating custom agents
- Extension API for third-party provider plugins
