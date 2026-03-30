---
name: Agent Creation Wizard + Auto-Register on Spawn
status: pending
priority: high
branch: sensitive-rat
date: 2026-03-30
blockedBy: []
blocks: []
---

# Agent Creation Wizard + Auto-Register on Spawn

> Bundled: agent creation UI (#1) + auto-register spawned agents as chat participants (#2)

## Phases

| # | Phase | Priority | Effort |
|---|-------|----------|--------|
| 1 | Agent Creation Wizard | P0 | M |
| 2 | Auto-Register + Toolbar Actions | P0 | S |

## Phase 1: Agent Creation Wizard

### What
Multi-step QuickInput wizard for creating custom agents: name → role → instructions → model → provider(s)

### Files to Create
- `src/vs/workbench/contrib/multiAgent/browser/agentCreationWizard.ts`

### Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — add create command
- `src/vs/workbench/contrib/multiAgent/browser/agentLanesViewPane.ts` — add "+ Add" toolbar action

### Implementation

```typescript
// agentCreationWizard.ts
class AgentCreationWizard {
  constructor(
    @IQuickInputService quickInputService,
    @IAgentLaneService agentLaneService,
    @IMultiAgentProviderService providerService,
  ) {}

  async run(): Promise<IAgentDefinition | undefined> {
    // Step 1: Name + Role
    const name = await this._askName();
    const role = await this._askRole();  // QuickPick with built-in roles + "Custom"

    // Step 2: System Instructions
    const instructions = await this._askInstructions(role);

    // Step 3: Model Selection
    const model = await this._askModel();  // QuickPick from providerService.getModels()

    // Step 4: Provider Selection (filtered by model compatibility)
    const providers = await this._askProviders(model);  // Multi-select QuickPick

    // Create agent
    return agentLaneService.addAgentDefinition({ name, role, ... });
  }
}
```

### Wizard Flow
```
Step 1: "Agent Name" → InputBox
Step 2: "Agent Role" → QuickPick [Planner, Coder, Designer, Tester, Reviewer, Debugger, Custom...]
Step 3: "System Instructions" → InputBox (pre-filled based on role)
Step 4: "Select Model" → QuickPick [Claude Opus 4, Claude Sonnet 4, GPT-4o, Gemini 2.5...]
Step 5: "Select Providers" → Multi-select QuickPick (filtered: only compatible providers)
→ Create + Spawn agent
```

### Key Details
- Role selection pre-fills system instructions from built-in templates
- Model QuickPick shows capabilities as description (vision, code, reasoning)
- Provider multi-select grays out incompatible providers
- Validation: at least 1 compatible provider required
- After creation: auto-spawn agent instance

## Phase 2: Auto-Register on Spawn + Toolbar

### What
- When `spawnAgent()` is called, auto-register as VS Code chat participant via `chatBridge.registerAgent()`
- Add "+ Add Agent" toolbar action to AgentLanesViewPane header
- Add inline card actions: stop, edit

### Files to Modify
- `src/vs/workbench/contrib/multiAgent/common/agentLaneServiceImpl.ts` — inject IAgentChatBridge, auto-register on spawn
- `src/vs/workbench/contrib/multiAgent/browser/agentLanesViewPane.ts` — add toolbar action + card actions
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — register create command

### Implementation

```typescript
// agentLaneServiceImpl.ts — modify spawnAgent()
spawnAgent(definitionId: string): IAgentInstance {
  // ... existing spawn logic ...

  // Auto-register as chat participant
  const registration = this._chatBridge.registerAgent(definitionId, instance.id);
  this._agentRegistrations.set(instance.id, registration);

  return instance;
}

// terminateAgent() — auto-unregister
terminateAgent(instanceId: string): void {
  this._agentRegistrations.get(instanceId)?.dispose();
  this._agentRegistrations.delete(instanceId);
  // ... existing terminate logic ...
}
```

## Success Criteria
- User can create custom agents via "+ Add Agent" button
- Wizard validates model-provider compatibility
- Created agents auto-spawn and register as chat participants
- Terminated agents auto-unregister from chat
