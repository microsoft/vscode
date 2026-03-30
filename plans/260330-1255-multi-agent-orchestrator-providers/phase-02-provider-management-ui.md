# Phase 2: Provider Management UI

## Context Links
- [Viewlet Architecture Report](../reports/researcher-260330-1257-vscode-viewlet-architecture.md)
- [Cockpit Tools Reference](../reports/researcher-260330-1255-reference-repos-analysis.md)
- Phase 1: [Core Provider Infrastructure](phase-01-core-provider-infrastructure.md)

## Overview
- **Priority**: P0
- **Status**: implemented
- **Description**: Build the Providers ViewPane in sidebar — account management, quota dashboard, provider health display

## Key Insights
- ViewPaneContainer pattern: register container + views via Registry
- Cockpit Tools shows unified dashboard with per-provider quota bars, reset timers
- 9Router shows tiered provider list with fallback status
- VS Code TreeView pattern ideal for provider/account hierarchy

## Requirements

### Functional
- Providers view in sidebar showing provider list as tree (Provider → Accounts)
- Add/edit/remove provider accounts via inline actions
- API key input via SecretStorage-backed secure input
- Quota dashboard showing per-account: remaining quota, reset timer, error state
- Provider health badges (green/yellow/red)
- Quick actions: refresh quota, toggle account active/inactive, set priority

### Non-Functional
- Responsive updates when account health changes
- Tree view with lazy loading for large account lists
- Accessible (keyboard nav, screen reader labels)

## Architecture

### View Registration

```typescript
// src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts

// Register view container
const multiAgentViewContainer = Registry.as<IViewContainersRegistry>(...)
  .registerViewContainer({
    id: 'workbench.views.multiAgent',
    title: localize2('multiAgent', "AI Agents"),
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.views.multiAgent']),
    icon: registerIcon('multi-agent-icon', Codicon.sparkle, ...),
    order: 8,
    hideIfEmpty: false,
  }, ViewContainerLocation.Sidebar);

// Register views
Registry.as<IViewsRegistry>(...).registerViews([
  {
    id: 'workbench.views.multiAgent.providers',
    name: localize2('providers', "Providers"),
    ctorDescriptor: new SyncDescriptor(ProvidersViewPane),
    order: 1,
    canToggleVisibility: true,
  },
  {
    id: 'workbench.views.multiAgent.agentLanes',
    name: localize2('agentLanes', "Agent Lanes"),
    ctorDescriptor: new SyncDescriptor(AgentLanesViewPane),
    order: 2,
    canToggleVisibility: true,
  }
], multiAgentViewContainer);
```

### Providers Tree Structure

```
Providers
├── Anthropic (3 accounts) [green badge]
│   ├── Main Key (**...abc1) — 45% quota remaining [green]
│   ├── Backup Key (**...def2) — 100% quota [green]
│   └── Team Key (**...ghi3) — 2% quota [red] — resets in 3h
├── OpenAI (1 account) [yellow badge]
│   └── Personal (**...jkl4) — 15% quota [yellow]
├── Google AI (2 accounts) [green badge]
│   ├── Free Tier (**...mno5) — 80% quota [green]
│   └── Pro Key (**...pqr6) — 100% quota [green]
└── OpenRouter (1 account) [green badge]
    └── Default (**...stu7) — 60% quota [green]
```

### Quota Dashboard (collapsible panel within ProvidersViewPane)

```
╔══════════════════════════════════════════╗
║  Provider Health Dashboard               ║
╠══════════════════════════════════════════╣
║  Anthropic    ████████░░  80%  ↻ 5h     ║
║  OpenAI       ███░░░░░░░  15%  ↻ 2h     ║
║  Google AI    █████████░  90%  ↻ 24h    ║
║  OpenRouter   ██████░░░░  60%  ↻ 12h   ║
╚══════════════════════════════════════════╝
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — View registration
- `src/vs/workbench/contrib/multiAgent/browser/providers-view-pane.ts` — ProvidersViewPane
- `src/vs/workbench/contrib/multiAgent/browser/providers-tree-data-provider.ts` — Tree data
- `src/vs/workbench/contrib/multiAgent/browser/provider-account-editor.ts` — Add/edit account dialog
- `src/vs/workbench/contrib/multiAgent/browser/quota-dashboard-widget.ts` — Quota visualization

### Files to Reference
- `src/vs/workbench/browser/parts/views/viewPane.ts` — ViewPane base class
- `src/vs/workbench/browser/parts/views/viewPaneContainer.ts` — ViewPaneContainer
- `src/vs/workbench/contrib/search/browser/search.contribution.ts` — Simple viewlet reference
- `src/vs/workbench/contrib/testing/browser/testing.contribution.ts` — Multi-view reference

## Implementation Steps

1. Create `multiAgent.contribution.ts` — register ViewContainer + both views
2. Implement `ProvidersViewPane` extending `ViewPane`
   - Override `renderBody()` with tree + dashboard layout
   - Inject `IMultiAgentProviderService` from Phase 1
3. Implement `ProvidersTreeDataProvider` with `ITreeViewDataProvider` pattern
   - Provider nodes (expandable) → Account nodes (leaf)
   - Inline actions: add account, edit, remove, toggle active
4. Build `ProviderAccountEditor` — modal/inline form for API key input
   - Use `IQuickInputService` for quick-pick style key input
   - Store via `ISecretStorageService`
5. Build `QuotaDashboardWidget` — HTML-based progress bars within ViewPane
   - Subscribe to `IMultiAgentProviderService.onDidChangeHealth`
   - Update quota bars and reset timers in real-time
6. Register contribution import in workbench entry point
7. Add icons: `registerIcon()` for provider types and health badges

## Todo List
- [ ] Create multiAgent.contribution.ts with container + view registrations
- [ ] Implement ProvidersViewPane with tree + dashboard layout
- [ ] Implement provider tree data provider
- [ ] Build account add/edit dialog (QuickInput-based)
- [ ] Build quota dashboard widget with progress bars
- [ ] Wire up event subscriptions for real-time updates
- [ ] Register in workbench entry point
- [ ] Add provider icons and health badge icons

## Success Criteria
- Providers view appears in sidebar with correct icon
- Can add/remove/edit provider accounts from UI
- Quota bars update in real-time when health changes
- Health badges reflect account status (green/yellow/red)
- Tree expands/collapses properly with account details
