---
name: "@mention Routing for Multi-Agent"
status: pending
priority: medium
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# @mention Routing for Multi-Agent

> Enable `@Planner`, `@Coder`, etc. in VS Code chat to talk directly to sub-agents

## Current State
- Agents registered via `registerDynamicAgent()` with `name: definition.name`
- VS Code resolves @mentions by agent `name` via `getAgentsByName()`
- **@mentions already work** for spawned agents — but agents must be spawned first
- User-unfriendly: agent IDs are `multiAgent.{uuid}`, but @mention uses `name` so this is OK

## Actual Problem
Users must manually spawn agents (via wizard) before @mentioning them. Built-in agents aren't pre-spawned.

## Solution
Auto-spawn built-in agents at startup via `MultiAgentAutoRegisterContribution`. When workbench loads, spawn one instance of each built-in agent definition so they're immediately @mentionable.

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — add auto-spawn in `MultiAgentAutoRegisterContribution` constructor

## Implementation

```typescript
// In MultiAgentAutoRegisterContribution constructor, after event subscriptions:

// Auto-spawn built-in agents so they're @mentionable immediately
const builtInAgents = this._agentLaneService.getBuiltInAgents();
for (const def of builtInAgents) {
    try {
        this._agentLaneService.spawnAgent(def.id);
    } catch {
        // Ignore if max agents reached
    }
}
```

## Key Detail
- Only spawn built-in agents (6 total), not custom ones
- If user manually terminates a built-in agent, it stays terminated (don't auto-respawn)
- `spawnAgent()` triggers `onDidChangeInstances` which triggers auto-register in the same contribution

## Success Criteria
- After app start, user can type `@Planner` in chat and get routed to Planner agent
- All 6 built-in agents (@Planner, @Coder, @Designer, @Tester, @Reviewer, @Debugger) available
- Custom agents still require manual creation via wizard before @mention works
