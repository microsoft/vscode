# Logos Planning System

## Overview

The Logos Planning System provides a Cursor-inspired mode selector and planning capability for Aria, the AI assistant. It allows users to switch between different operational modes that control how Aria processes requests and which tools are available.

## Modes

### Agent Mode (Default)

Full agentic mode with access to all tools. Aria can:
- Read, write, and create files
- Execute terminal commands
- Make git operations
- Debug and analyze code

**Shortcut:** `Cmd+Shift+1`

### Plan Mode

Create detailed plans without making changes. Aria will:
- Analyze the user's request thoroughly
- Break down complex tasks into clear steps
- Create a structured plan with file paths and code snippets
- Save plans as markdown files for later execution

**Shortcut:** `Cmd+Shift+2`

### Debug Mode

Focus on debugging and problem diagnosis. Aria can:
- Analyze errors and stack traces
- Examine variables and call stacks
- Read logs and terminal output
- Run tests to identify failures
- Suggest fixes (without applying them)

**Shortcut:** `Cmd+Shift+3`

### Ask Mode

Question and answer mode with no changes. Aria will:
- Answer questions about the codebase
- Explain code, concepts, and patterns
- Provide guidance and best practices
- Reference relevant documentation

**Shortcut:** `Cmd+Shift+4`

### Research Mode

Deep research via Athena integration. Aria can:
- Conduct deep research on technical topics
- Search the web for current information
- Analyze and synthesize multiple sources
- Provide properly cited references

**Shortcut:** `Cmd+Shift+5`

### Code Review Mode

Analyze code quality and suggest improvements. Aria will:
- Analyze code quality, style, and patterns
- Identify bugs, security issues, and performance problems
- Suggest improvements and refactoring opportunities
- Create a plan of suggested improvements

**Shortcut:** `Cmd+Shift+6`

## Using the Mode Selector

The mode selector appears in the chat header:

1. Click on the mode dropdown to see all available modes
2. Select a mode to switch
3. The mode indicator shows the current active mode

## Plan Files

Plans are saved as markdown files with YAML frontmatter in `.cursor/plans/`:

```markdown
---
name: My Plan
overview: Brief description of what this plan accomplishes
todos:
  - id: task-1
    content: First task description
    status: pending
  - id: task-2
    content: Second task description
    status: pending
---

# My Plan

## Overview

Detailed description of the plan...

## Tasks

- [ ] First task description
- [ ] Second task description
```

### Plan Status Values

- `pending` - Not yet started
- `in_progress` - Currently being worked on
- `completed` - Finished
- `cancelled` - No longer needed
- `blocked` - Waiting on something else

## API Reference

### ModeRegistry

```typescript
import { ModeRegistry } from './chat/modes';

const registry = ModeRegistry.getInstance();

// Get current mode
const currentMode = registry.getCurrentMode();

// Switch modes
registry.switchMode('plan', 'user');

// Check tool permissions
const allowed = registry.isToolAllowed('write_file');
```

### PlanningService

```typescript
import { PlanningService } from './chat/planning';

const service = PlanningService.getInstance();

// Create a plan
const plan = service.createPlan({
  name: 'My Feature',
  overview: 'Description',
  createdByMode: 'plan',
});

// Update item status
service.updateItemStatus(plan.id, 'task-1', 'completed');

// Get progress
const progress = service.getProgress(plan.id);
// { completed: 1, total: 2, percentage: 50 }
```

## Configuration

In VS Code settings:

```json
{
  "logos.planning.autoSave": true,
  "logos.planning.planDirectory": ".cursor/plans",
  "logos.mode.default": "agent",
  "logos.mode.autoSwitch": true
}
```


