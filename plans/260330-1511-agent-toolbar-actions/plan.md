---
name: Agent Toolbar Actions
status: pending
priority: low
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Agent Toolbar Actions

> Add toolbar buttons to Agent Lanes view header + inline actions on agent cards

## Actions to Register

### View Title Toolbar (header of Agent Lanes view)
| Action | Icon | Group | Purpose |
|--------|------|-------|---------|
| **+ Add Agent** | `$(add)` | `navigation` | Opens agent creation wizard |
| **Stop All** | `$(debug-stop)` | `navigation` | Terminates all running agents |

### Agent Card Actions (inline per card)
| Action | Icon | Purpose |
|--------|------|---------|
| **Stop** | `$(debug-stop)` | Terminate this agent instance |
| **@Mention** | `$(mention)` | Open chat with @AgentName pre-filled |

## Pattern
```typescript
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: 'workbench.action.multiAgent.addAgent',
      title: localize2('addAgent', "Add Agent"),
      icon: Codicon.add,
      menu: [{
        id: MenuId.ViewTitle,
        group: 'navigation',
        when: ContextKeyExpr.equals('view', AgentLanesViewPane.ID),
        order: 1,
      }],
    });
  }
  run(accessor: ServicesAccessor) {
    accessor.get(ICommandService).executeCommand(COMMAND_CREATE_AGENT);
  }
});
```

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — register view title actions
- `src/vs/workbench/contrib/multiAgent/browser/agentLanesViewPane.ts` — add click handlers on card elements

## Success Criteria
- "+" button visible in Agent Lanes view header
- Clicking "+" opens creation wizard
- "Stop All" button terminates running agents
- Card click handlers functional (stop, @mention)
