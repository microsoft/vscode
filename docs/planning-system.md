# Logos Planning System

## Overview

The Logos Planning System provides a Cursor-inspired mode selector and planning capability for Aria, the AI assistant. It allows users to switch between different operational modes that control how Aria processes requests and which tools are available.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ChatPanel                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     ModeSelector                          │   │
│  │  [🤖 Agent] [📝 Plan] [🐛 Debug] [❓ Ask] [🔬 Research]  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     ModeRegistry                          │   │
│  │   • Current mode state                                    │   │
│  │   • Mode configurations                                   │   │
│  │   • Tool permission filtering                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│      │ PlanViewer   │ │ PlanExecutor │ │PlanningService│        │
│      └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Modes

### Agent Mode (Default)

Full agentic mode with access to all tools. Aria can:
- Read, write, and create files
- Execute terminal commands
- Make git operations
- Debug and analyze code
- Execute plans created in Plan mode

**Shortcut:** `Cmd+Shift+1` (macOS) / `Ctrl+Shift+1` (Windows/Linux)

### Plan Mode

Create detailed plans without making changes. Aria will:
- Analyze the user's request thoroughly
- Break down complex tasks into clear steps
- Create a structured plan with file paths and code snippets
- Save plans as markdown files for later execution

**Shortcut:** `Cmd+Shift+2`

**Allowed Tools:** `read_file`, `list_dir`, `grep`, `find_files`, `get_diagnostics`

### Debug Mode

Focus on debugging and problem diagnosis. Aria can:
- Analyze errors and stack traces
- Set breakpoints and step through code
- Examine variables and call stacks
- Read logs and terminal output
- Run tests to identify failures

**Shortcut:** `Cmd+Shift+3`

**Allowed Tools:** Read tools + `run_terminal`, `debug_*` tools

### Ask Mode

Question and answer mode with no changes. Aria will:
- Answer questions about the codebase
- Explain code, concepts, and patterns
- Provide guidance and best practices
- Reference relevant documentation

**Shortcut:** `Cmd+Shift+4`

**Allowed Tools:** `read_file`, `list_dir`, `grep`, `find_files`

### Research Mode

Deep research via Athena integration. Aria can:
- Conduct deep research on technical topics
- Search the web for current information
- Analyze and synthesize multiple sources
- Provide properly cited references

**Shortcut:** `Cmd+Shift+5`

**Allowed Tools:** `read_file`, `grep`, `web_search`, `athena_research`

### Code Review Mode

Analyze code quality and suggest improvements. Aria will:
- Analyze code quality, style, and patterns
- Identify bugs, security issues, and performance problems
- Suggest improvements and refactoring opportunities
- Create a plan of suggested improvements

**Shortcut:** `Cmd+Shift+6`

**Allowed Tools:** `read_file`, `git_diff`, `git_log`, `get_diagnostics`

## Using the Mode Selector

### UI Method

The mode selector appears in the chat header:

1. Click on the current mode indicator (e.g., "🤖 Agent")
2. A dropdown shows all available modes with descriptions
3. Select a mode to switch
4. The mode indicator updates to show the new mode

### Keyboard Shortcuts

| Shortcut | Mode |
|----------|------|
| `Cmd+Shift+1` | Agent |
| `Cmd+Shift+2` | Plan |
| `Cmd+Shift+3` | Debug |
| `Cmd+Shift+4` | Ask |
| `Cmd+Shift+5` | Research |
| `Cmd+Shift+6` | Code Review |
| `Cmd+Shift+M` | Mode Picker |

### Command Palette

Press `Cmd+Shift+P` and type:
- "Logos: Switch to Agent Mode"
- "Logos: Switch to Plan Mode"
- "Logos: Select Mode..."

## Plan Execution

### Creating a Plan

1. Switch to **Plan mode** (`Cmd+Shift+2`)
2. Describe what you want to accomplish
3. Aria analyzes and creates a structured plan
4. The plan appears in the PlanViewer component

### Executing a Plan

1. Click **▶ Execute** in the PlanViewer header
2. Aria switches to **Agent mode** automatically
3. Plan items are executed sequentially
4. Progress updates in real-time
5. Click **⏸ Pause** to pause execution
6. Click **▶ Resume** to continue
7. Click **⏹ Cancel** to stop execution

### Execution Options

| Setting | Description |
|---------|-------------|
| `sequential` | Execute all items automatically |
| `step-by-step` | Pause after each item for review |

Configure in settings:
```json
{
  "logos.plans.executionMode": "sequential"
}
```

## Plan Files

Plans are saved as markdown files with YAML frontmatter in `.logos/plans/`:

```markdown
---
id: plan-abc123
name: Implement User Authentication
overview: Add OAuth2 authentication to the API
status: active
createdAt: 2024-12-31T10:00:00Z
createdByMode: plan
linkedSessionId: session-xyz789
---

# Implement User Authentication

## Overview

Add OAuth2 authentication flow with Google and GitHub providers.

## Tasks

- [ ] Create `auth.ts` module with OAuth client configuration
- [ ] Add login endpoint at `/api/auth/login`
- [ ] Add callback handler at `/api/auth/callback`
- [ ] Implement session management with JWT
- [ ] Add protected route middleware
- [ ] Create login page UI component
```

### Plan Status Values

| Status | Description |
|--------|-------------|
| `pending` | Not yet started |
| `in_progress` | Currently being executed |
| `completed` | Successfully finished |
| `failed` | Execution failed |
| `cancelled` | Manually cancelled |
| `blocked` | Waiting on dependency |

### Plan Item Properties

```typescript
interface PlanItem {
  id: string;
  content: string;
  status: PlanItemStatus;
  complexity?: number;  // 1-5 stars
  dependencies?: string[];
  toolCalls?: Array<{
    toolId: string;
    params: Record<string, any>;
  }>;
}
```

## API Reference

### ModeRegistry

```typescript
import { ModeRegistry } from './chat/modes';

const registry = ModeRegistry.getInstance();

// Get current state
const { currentMode, history } = registry.getState();

// Switch modes
registry.switchMode('plan', 'user', 'User clicked mode selector');

// Check tool permissions
const allowed = registry.isToolAllowed('write_file');

// Get all modes
const modes = registry.getAll();

// Get mode config
const planConfig = registry.get('plan');
// { id: 'plan', name: 'Plan', allowedTools: [...], readOnly: true, ... }
```

### PlanningService

```typescript
import { PlanningService } from './chat/planning';

const service = PlanningService.getInstance();

// Create a plan
const plan = service.createPlan({
  name: 'My Feature',
  overview: 'Description of what this accomplishes',
  createdByMode: 'plan',
});

// Add items
service.addItem(plan.id, {
  content: 'Create the database schema',
  complexity: 3,
});

// Update item status
service.updateItemStatus(plan.id, 'item-1', 'completed');

// Get progress
const progress = service.getProgress(plan.id);
// { completed: 1, total: 5, percentage: 20 }

// Save to file
await service.savePlan(plan.id);

// Load from file
const loaded = await service.loadPlan('plan-id');
```

### PlanExecutor

```typescript
import { PlanExecutor } from './chat/planning/PlanExecutor';

const executor = PlanExecutor.getInstance();

// Execute a plan
await executor.execute(planId, {
  sessionId: 'session-123',
  stopOnError: true,
  stepByStep: false,
  itemTimeout: 60000,
});

// Control execution
executor.pause();
await executor.resume();
executor.cancel();

// Check state
const state = executor.getState(); // 'running' | 'paused' | 'completed' | ...
const progress = executor.getProgress(); // { current: 3, total: 5, percentage: 60 }
const results = executor.getResults(); // ItemExecutionResult[]

// Listen for events
executor.on('itemStarted', (planId, itemId) => { ... });
executor.on('itemCompleted', (planId, result) => { ... });
executor.on('executionCompleted', (planId, results) => { ... });
executor.on('executionFailed', (planId, error) => { ... });
```

### React Hooks

```typescript
import { useModeRegistry } from './chat/modes';
import { usePlanningService } from './chat/planning';

function MyComponent() {
  // Mode hook
  const { modes, currentMode, setMode, isToolAllowed } = useModeRegistry();

  // Planning hook
  const { 
    plans, 
    activePlan, 
    createPlan, 
    updateItemStatus, 
    getProgress,
    executePlan,
  } = usePlanningService(sessionId);

  // ...
}
```

## D3N Integration

The planning system integrates with D3N's mode-aware routing:

```python
from d3n_core.agents.logos.routing_policies import LogosRoutingPolicy, AriaMode
from d3n_core.agents.logos.conductor_binding import ConductorBinding

# Route with mode awareness
policy = LogosRoutingPolicy()
decision = policy.route(query, context, mode=AriaMode.PLAN)
# decision.agent_id, decision.tier, decision.allowed_tools

# Prepare request with mode
conductor = ConductorBinding()
request = conductor.prepare_request(query, context, mode=AriaMode.PLAN)
# Includes mode-specific system prompt, tool schemas, etc.
```

## Configuration

In VS Code settings (`settings.json`):

```json
{
  "logos.defaultMode": "agent",
  "logos.autoModeSwitch": false,
  "logos.plans.autoSave": true,
  "logos.plans.directory": ".logos/plans",
  "logos.plans.executionMode": "sequential"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `logos.defaultMode` | string | `"agent"` | Default mode on startup |
| `logos.autoModeSwitch` | boolean | `false` | Auto-switch based on query |
| `logos.plans.autoSave` | boolean | `true` | Auto-save plans to workspace |
| `logos.plans.directory` | string | `".logos/plans"` | Plan storage directory |
| `logos.plans.executionMode` | string | `"sequential"` | Execution mode |

## Best Practices

### When to Use Plan Mode

- Complex multi-step tasks
- Major refactoring
- When you want to review before executing
- Collaborative planning (share plans with team)

### When to Use Agent Mode

- Quick fixes and small changes
- Executing plans
- Interactive development

### Plan Tips

1. **Be specific**: Describe exactly what you want accomplished
2. **Review plans**: Always review before executing
3. **Save plans**: Useful for documentation and reuse
4. **Break down**: Large tasks work better as multiple smaller plans
