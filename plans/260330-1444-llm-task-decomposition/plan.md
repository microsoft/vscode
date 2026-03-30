---
name: LLM-Based Task Decomposition
status: pending
priority: high
branch: sensitive-rat
date: 2026-03-30
blockedBy: []
blocks: []
---

# LLM-Based Task Decomposition

> Replace hardcoded plan→code→test pipeline with real LLM call for intelligent task decomposition

## Scope
Single file modification: `orchestratorServiceImpl.ts` — replace `_createDefaultDecomposition()` with LLM-powered `_decomposeViaLLM()`

## Architecture

```
User: "Build auth system with login, register, password reset"
  │
  ▼
Orchestrator.decomposeTask()
  │
  ├─ Build system prompt listing available agent roles + capabilities
  ├─ Call LLM via AgentChatBridge.executeAgentTask() or direct sendChatRequest()
  ├─ Parse structured JSON response
  └─ Return ITaskDecomposition with sub-tasks + dependencies
```

## Implementation

### System Prompt for Decomposition
```
You are a task decomposition engine. Given a user task and available agent roles,
break it down into sub-tasks. Output ONLY valid JSON:

{
  "subTasks": [
    { "description": "...", "suggestedRole": "planner|coder|tester|...", "dependencies": [0,1], "priority": 0 }
  ],
  "executionPlan": "Brief human-readable summary"
}

Available roles: planner, coder, designer, tester, reviewer, debugger
Rules:
- Each sub-task assigned to exactly one role
- Dependencies reference sub-task indices (0-based)
- Lower priority = execute first
- Keep sub-tasks focused and actionable
```

### Changes to orchestratorServiceImpl.ts

1. Replace `_createDefaultDecomposition()` call with `_decomposeViaLLM()`
2. `_decomposeViaLLM()` uses `IAgentChatBridge.executeAgentTask()` to call LLM
3. Parse JSON response → `ITaskDecomposition`
4. Fallback: if LLM fails or returns invalid JSON → use existing `_createDefaultDecomposition()`

### Files to Modify
- `src/vs/workbench/contrib/multiAgent/common/orchestratorServiceImpl.ts`

### No New Files Needed

## Success Criteria
- Orchestrator decomposes tasks via LLM call
- Output is structured ITaskDecomposition with role assignments + dependencies
- Graceful fallback to hardcoded pipeline if LLM fails
- JSON parsing validated before use
