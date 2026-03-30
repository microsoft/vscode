# Phase 5: Orchestrator Engine

## Context Links
- [Multi-Agent Orchestrator Patterns](../reports/researcher-260330-1255-multi-agent-orchestrator-patterns.md)
- [VS Code Chat Infrastructure](../reports/researcher-260330-1255-vscode-chat-infrastructure.md)
- Phase 3: [Agent System Core](phase-03-agent-system-core.md)

## Overview
- **Priority**: P1
- **Status**: implemented
- **Description**: Build the orchestrator — a master agent that receives tasks, decomposes them, delegates to specialized sub-agents, and collects results

## Key Insights
- Fan-out/Fan-in pattern: master decomposes → spawns parallel sub-tasks → collects
- Use existing chat request pipeline: orchestrator is itself a chat agent
- Users can talk to orchestrator OR directly to sub-agents
- Task dependency tracking needed for sequential work ordering

## Requirements

### Functional
- Master orchestrator agent receives high-level tasks from user
- Automatic task decomposition based on sub-agent capabilities
- Task delegation to appropriate sub-agents based on role matching
- Dependency-aware scheduling (task B waits for task A)
- Fan-out parallel execution for independent sub-tasks
- Fan-in result collection and synthesis
- User can override: talk directly to any sub-agent
- Task progress tracking with status updates to user

### Non-Functional
- Orchestrator itself uses a model (configurable, default: most capable available)
- Max fan-out configurable (default: 5 concurrent sub-agents)
- Timeout per sub-task (configurable, default: 5 minutes)
- Graceful degradation: if sub-agent fails, orchestrator reports and continues

## Architecture

### Orchestrator Service

```typescript
// src/vs/workbench/contrib/multiAgent/common/orchestrator-service.ts

interface ITask {
  id: string;
  parentId?: string;          // orchestrator task ID
  description: string;
  assignedAgentId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  dependencies: string[];     // task IDs this depends on
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

interface ITaskDecomposition {
  originalTask: string;
  subTasks: Array<{
    description: string;
    suggestedRole: string;     // 'planner', 'coder', 'tester', etc.
    dependencies: string[];    // references to other sub-task descriptions
    priority: number;
  }>;
  executionPlan: string;       // human-readable execution summary
}

interface IOrchestratorService {
  // Task management
  submitTask(description: string): Promise<ITask>;
  decomposeTask(taskId: string): Promise<ITaskDecomposition>;
  delegateSubTasks(taskId: string, decomposition: ITaskDecomposition): Promise<ITask[]>;
  getTaskStatus(taskId: string): ITask;
  getSubTasks(parentTaskId: string): readonly ITask[];
  cancelTask(taskId: string): void;

  // Execution
  executeTask(taskId: string): Promise<void>;  // full pipeline: decompose → delegate → collect
  getActiveExecutions(): readonly ITask[];

  // Direct agent communication
  sendToAgent(agentId: string, message: string): Promise<string>;

  // Events
  readonly onDidChangeTask: Event<ITask>;
  readonly onDidCompleteExecution: Event<{ taskId: string; summary: string }>;
}
```

### Task Decomposition Flow

```
User: "Build authentication system with login, register, and password reset"
                    │
                    ▼
        ┌─── Orchestrator ───┐
        │  Decompose task     │
        │  using LLM call     │
        └─────────┬───────────┘
                  │
    ┌─────────────┼─────────────────┐
    ▼             ▼                 ▼
┌─────────┐ ┌──────────┐    ┌───────────┐
│ Planner │ │  Coder   │    │  Tester   │
│ Plan    │ │ Implement│    │ Write     │
│ auth    │ │ login +  │    │ tests     │
│ system  │ │ register │    │           │
│ [dep:∅] │ │ [dep:P]  │    │ [dep:C]   │
└────┬────┘ └────┬─────┘    └────┬──────┘
     │           │               │
     ▼           ▼               ▼
  Result      Result          Result
     │           │               │
     └───────────┼───────────────┘
                 ▼
         ┌──────────────┐
         │ Orchestrator  │
         │ Collect &     │
         │ Synthesize    │
         └──────────────┘
```

### Orchestrator as Chat Agent

```typescript
// Register orchestrator as the default/master chat agent
const orchestratorImpl: IChatAgentImplementation = {
  invoke: async (request, progress, history, token) => {
    const task = await orchestratorService.submitTask(request.message);

    // Report decomposition plan to user
    const decomposition = await orchestratorService.decomposeTask(task.id);
    progress.report({ content: `Decomposed into ${decomposition.subTasks.length} sub-tasks:\n` });
    for (const sub of decomposition.subTasks) {
      progress.report({ content: `- [${sub.suggestedRole}] ${sub.description}\n` });
    }

    // Delegate and execute
    const subTasks = await orchestratorService.delegateSubTasks(task.id, decomposition);
    await orchestratorService.executeTask(task.id);

    // Report results
    const results = orchestratorService.getSubTasks(task.id);
    progress.report({ content: '\n## Results\n' });
    for (const result of results) {
      progress.report({
        content: `### ${result.assignedAgentId}: ${result.status}\n${result.result || result.error}\n`
      });
    }

    return { metadata: { taskId: task.id } };
  },
};
```

### Dependency-Aware Scheduler

```typescript
// src/vs/workbench/contrib/multiAgent/common/task-scheduler.ts

class TaskScheduler {
  // Returns tasks ready to execute (all dependencies completed)
  getReadyTasks(tasks: ITask[]): ITask[] {
    return tasks.filter(t =>
      t.status === 'pending' &&
      t.dependencies.every(depId =>
        tasks.find(d => d.id === depId)?.status === 'completed'
      )
    );
  }

  // Execute ready tasks in parallel, up to maxConcurrent
  async executeParallel(
    readyTasks: ITask[],
    maxConcurrent: number,
    executor: (task: ITask) => Promise<void>
  ): Promise<void> {
    const semaphore = new Semaphore(maxConcurrent);
    await Promise.all(readyTasks.map(task =>
      semaphore.acquire().then(() =>
        executor(task).finally(() => semaphore.release())
      )
    ));
  }
}
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/common/orchestrator-service.ts` — IOrchestratorService interface
- `src/vs/workbench/contrib/multiAgent/common/orchestrator-service-impl.ts` — Implementation
- `src/vs/workbench/contrib/multiAgent/common/task-scheduler.ts` — Dependency-aware task scheduler
- `src/vs/workbench/contrib/multiAgent/common/task-decomposer.ts` — LLM-based task decomposition
- `src/vs/workbench/contrib/multiAgent/browser/orchestrator-chat-agent.ts` — Register as chat agent

### Files to Reference
- `src/vs/workbench/contrib/chat/common/participants/chatAgents.ts` — IChatAgentService
- `src/vs/workbench/contrib/chat/common/chatService/chatService.ts` — sendRequest pipeline
- `src/vs/workbench/contrib/chat/common/languageModels.ts` — sendChatRequest

## Implementation Steps

1. Define `ITask`, `ITaskDecomposition`, `IOrchestratorService` interfaces
2. Implement `TaskScheduler` — dependency resolution, parallel execution with semaphore
3. Implement `TaskDecomposer` — uses LLM call to break task into sub-tasks with role suggestions
   - System prompt instructs LLM to output structured JSON decomposition
   - Maps suggested roles to available agent definitions
4. Implement `OrchestratorService`:
   - submitTask → decomposeTask → delegateSubTasks → executeTask pipeline
   - Event emission on task state changes
   - Result collection and synthesis
5. Register orchestrator as a dynamic chat agent via `AgentChatBridge`
   - Default agent when user doesn't @mention a specific agent
   - Reports progress via IChatProgress streaming
6. Implement direct agent communication — user can @mention sub-agents
7. Unit tests for scheduler, decomposer, and orchestrator pipeline

## Todo List
- [ ] Define ITask, ITaskDecomposition, IOrchestratorService interfaces
- [ ] Implement TaskScheduler with dependency resolution
- [ ] Implement TaskDecomposer with LLM-based decomposition
- [ ] Implement OrchestratorService (full pipeline)
- [ ] Register orchestrator as default chat agent
- [ ] Implement direct sub-agent communication
- [ ] Add timeout and error handling for sub-tasks
- [ ] Unit tests

## Success Criteria
- User can submit high-level task → orchestrator decomposes and delegates
- Sub-tasks execute in parallel when no dependencies, sequential when dependent
- Results collected and synthesized back to user
- User can @mention specific sub-agents for direct communication
- Graceful failure handling (one sub-agent failure doesn't crash orchestrator)
- Progress reported to user in real-time via chat

## Risk Assessment
- LLM decomposition quality varies — mitigate with structured output format + validation
- Sub-agent timeout — configurable with sensible defaults
- Circular dependencies — detect and reject during decomposition
