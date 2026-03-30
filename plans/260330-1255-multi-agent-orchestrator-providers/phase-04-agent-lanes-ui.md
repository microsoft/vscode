# Phase 4: Agent Lanes UI

## Context Links
- [Viewlet Architecture Report](../reports/researcher-260330-1257-vscode-viewlet-architecture.md)
- Phase 2: [Provider Management UI](phase-02-provider-management-ui.md) — shares ViewContainer
- Phase 3: [Agent System Core](phase-03-agent-system-core.md) — IAgentLaneService

## Overview
- **Priority**: P1
- **Status**: implemented
- **Description**: Build the Agent Lanes ViewPane — agent management, creation wizard, tracking board showing agent status and current tasks

## Key Insights
- Shares ViewContainer with Providers (registered in Phase 2)
- Agent tracking board = card grid showing agent state, task, model, provider
- Creation wizard needs model dropdown → provider dropdown (filtered by model compatibility)
- Real-time updates via IAgentLaneService.onDidChangeState events

## Requirements

### Functional
- Agent Lanes view showing all agent definitions and active instances
- Create agent wizard: name → role → instructions → model → provider(s)
- Agent tracking board with status cards (idle/running/blocked/error)
- Card shows: agent name, role icon, current task, model, provider, token usage
- Inline actions: start/stop agent, edit definition, view chat history
- Filter/sort agents by state, role, model

### Non-Functional
- Smooth card animations on state change
- Virtual scrolling for 20+ agents
- Keyboard accessible

## Architecture

### Agent Lanes View Layout

```
┌─────────────────────────────────────────────┐
│ Agent Lanes                        [+ Add]  │
├─────────────────────────────────────────────┤
│ ┌─ Active Agents (3/6) ────────────────┐    │
│ │                                      │    │
│ │ ┌──────────────┐ ┌──────────────┐   │    │
│ │ │ 🟢 Planner   │ │ 🟡 Coder     │   │    │
│ │ │ claude-opus  │ │ claude-sonnet│   │    │
│ │ │ anthropic    │ │ openrouter   │   │    │
│ │ │ Planning     │ │ Implementing │   │    │
│ │ │ auth system  │ │ login page   │   │    │
│ │ │ 12.5k tokens │ │ 45.2k tokens│   │    │
│ │ └──────────────┘ └──────────────┘   │    │
│ │                                      │    │
│ │ ┌──────────────┐                    │    │
│ │ │ 🔴 Tester    │                    │    │
│ │ │ gemini-2.5   │                    │    │
│ │ │ google       │                    │    │
│ │ │ ERROR: quota │                    │    │
│ │ │ exceeded     │                    │    │
│ │ └──────────────┘                    │    │
│ └──────────────────────────────────────┘    │
│                                             │
│ ┌─ Available Agents (3) ───────────────┐    │
│ │ Designer · Reviewer · Debugger       │    │
│ └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Agent Card Component

```typescript
// src/vs/workbench/contrib/multiAgent/browser/agent-card-widget.ts

interface IAgentCardData {
  agent: IAgentInstance;
  definition: IAgentDefinition;
  providerName: string;
  stateColor: string;    // green/yellow/red/gray
  stateIcon: string;     // codicon name
}

class AgentCardWidget extends Disposable {
  constructor(
    container: HTMLElement,
    data: IAgentCardData,
    @IAgentLaneService agentLaneService: IAgentLaneService,
  ) {
    // Render card with state-reactive bindings
    // Subscribe to state changes for this agent
  }
}
```

### Create Agent Wizard Flow

```
Step 1: Basic Info          Step 2: Model Selection       Step 3: Provider Selection
┌────────────────────┐     ┌────────────────────┐        ┌────────────────────┐
│ Name: [          ] │     │ Model:             │        │ Providers (ordered):│
│ Role: [Planner ▼]  │     │ ○ Claude Opus 4    │        │ ☑ Anthropic (pri)  │
│ Description:       │  →  │ ○ Claude Sonnet 4  │   →    │ ☑ OpenRouter (2nd) │
│ [                ] │     │ ○ GPT-4o           │        │ ☐ OpenAI (n/a)     │
│ Instructions:      │     │ ○ Gemini 2.5 Pro   │        │                    │
│ [                ] │     │ ...                │        │ [Create Agent]     │
└────────────────────┘     └────────────────────┘        └────────────────────┘
                                                          (grayed = incompatible)
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/browser/agent-lanes-view-pane.ts` — AgentLanesViewPane
- `src/vs/workbench/contrib/multiAgent/browser/agent-card-widget.ts` — Agent status card
- `src/vs/workbench/contrib/multiAgent/browser/agent-creation-wizard.ts` — Multi-step creation
- `src/vs/workbench/contrib/multiAgent/browser/agent-tracking-board.ts` — Card grid layout

### Files to Reference
- `src/vs/workbench/browser/parts/views/viewPane.ts` — ViewPane base
- `src/vs/base/browser/ui/grid/grid.ts` — Grid layout utilities
- `src/vs/workbench/contrib/testing/browser/testingExplorerView.ts` — Tree + card pattern

## Implementation Steps

1. Implement `AgentLanesViewPane` extending `ViewPane`
   - Two sections: "Active Agents" (card grid) + "Available Agents" (compact list)
   - Add toolbar action: "+ Add Agent"
2. Build `AgentCardWidget` — single agent status card
   - State-colored border/icon (green=running, yellow=blocked, red=error, gray=idle)
   - Show: name, model, provider, current task, token count
   - Inline actions: stop, edit, view history
   - Subscribe to `IAgentLaneService.onDidChangeState` for live updates
3. Build `AgentTrackingBoard` — grid container for AgentCardWidgets
   - Virtual scrolling for performance
   - Filter bar: by state, role, model
4. Build `AgentCreationWizard` using `IQuickInputService` multi-step
   - Step 1: name, role (dropdown), description, system instructions
   - Step 2: model selection (from IMultiAgentProviderService.getModels())
   - Step 3: provider selection (filtered by model compatibility, ordered)
   - Validation: at least one compatible provider required
5. Wire up events: state changes → card re-render, new agents → add card

## Todo List
- [ ] Implement AgentLanesViewPane with two-section layout
- [ ] Build AgentCardWidget with state-reactive rendering
- [ ] Build AgentTrackingBoard grid with virtual scrolling
- [ ] Build AgentCreationWizard (3-step QuickInput)
- [ ] Wire event subscriptions for live updates
- [ ] Add filter/sort bar for agent list
- [ ] Add inline card actions (stop, edit, view history)

## Success Criteria
- Agent Lanes view renders in sidebar with correct layout
- Cards reflect agent state in real-time (color, icon, task text)
- Creation wizard validates model-provider compatibility
- Can start/stop agents from UI
- Filter/sort works correctly
- Performance acceptable with 20 concurrent agents
