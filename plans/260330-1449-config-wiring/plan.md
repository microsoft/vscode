---
name: Config Wiring - Connect multiAgent settings to services
status: pending
priority: medium
branch: sensitive-rat
date: 2026-03-30
blockedBy: []
blocks: []
---

# Config Wiring

> Connect registered `multiAgent.*` settings to actual service behavior. Replace hardcoded constants.

## Settings → Service Mapping

| Setting | Current Hardcoded | Service | File |
|---------|-------------------|---------|------|
| `multiAgent.maxConcurrentAgents` | `MAX_CONCURRENT_AGENTS = 20` | AgentLaneServiceImpl | `agentLaneServiceImpl.ts` |
| `multiAgent.taskTimeout` | `DEFAULT_TASK_TIMEOUT_MS = 300_000` | OrchestratorServiceImpl | `orchestratorServiceImpl.ts` |
| `multiAgent.defaultModel` | (not used) | AgentCreationWizard | `agentCreationWizard.ts` |
| `multiAgent.rotationStrategy` | `'priority'` only | ProviderRotationServiceImpl | `providerRotationServiceImpl.ts` |
| `multiAgent.enabled` | (not gated) | All services | contribution check |
| `multiAgent.orchestrator.enabled` | (not gated) | OrchestratorServiceImpl | `orchestratorServiceImpl.ts` |

## Changes per File

### 1. `agentLaneServiceImpl.ts`
- Inject `IConfigurationService`
- Replace `MAX_CONCURRENT_AGENTS` constant → `configurationService.getValue('multiAgent.maxConcurrentAgents')`

### 2. `orchestratorServiceImpl.ts`
- Inject `IConfigurationService`
- Replace `DEFAULT_TASK_TIMEOUT_MS` constant → `configurationService.getValue('multiAgent.taskTimeout')`

### 3. `agentCreationWizard.ts`
- Read `multiAgent.defaultModel` for pre-selecting model in wizard step 4

### 4. `providerRotationServiceImpl.ts`
- Inject `IConfigurationService`
- Read `multiAgent.rotationStrategy` to switch between priority/round-robin/cost-optimized account selection

## Implementation Pattern

```typescript
// Inject IConfigurationService
constructor(
  @IConfigurationService private readonly _configService: IConfigurationService,
  ...
) {}

// Read config at point of use (not cached — allows live updates)
private get _maxConcurrentAgents(): number {
  return this._configService.getValue<number>('multiAgent.maxConcurrentAgents') ?? 10;
}
```

## Success Criteria
- Changing settings in VS Code Settings UI immediately affects service behavior
- No hardcoded constants remain for configurable values
- Default values match registered settings defaults
