---
name: VS Code Viewlet/Panel Architecture Research
description: How to register new sidebar viewlets and add views to them
type: reference
---

# VS Code Viewlet/Panel Architecture

## Executive Summary
VS Code uses a **Registry-based** architecture for viewlets (sidebar panels). To add "Agent Lanes" and "Providers" views:

1. Register a ViewContainer via `IViewContainersRegistry`
2. Define the container's constructor (e.g., `ViewPaneContainer` or custom class)
3. Register views via `IViewsRegistry.registerViews()`
4. Implement view UI as a `ViewPane` subclass

This is done in `.contribution.ts` files at startup. No runtime file watching.

---

## Key Architecture

### 1. View Container Registration

**Pattern:** `Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer()`

```typescript
// From search.contribution.ts
const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry)
  .registerViewContainer({
    id: VIEWLET_ID,                    // Unique ID
    title: nls.localize2('search', "Search"),  // UI label
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, options]),
    icon: searchViewIcon,              // Sidebar icon
    order: 1,                          // Display order
    hideIfEmpty: true,                 // Hide if no active views
  }, ViewContainerLocation.Sidebar);   // Sidebar, Panel, AuxiliaryBar, ChatBar
```

**Key Properties (IViewContainerDescriptor):**
- `id`: Unique identifier
- `title`: Localized UI title
- `ctorDescriptor`: SyncDescriptor instantiation (usually `ViewPaneContainer`)
- `icon`: ThemeIcon or URI for sidebar icon
- `order`: Z-order in sidebar (lower = higher priority)
- `hideIfEmpty`: Auto-hide if no visible views
- `alwaysUseContainerInfo`: Always show container title (not merged with single view)
- `openCommandActionDescriptor`: Custom open command (auto-generated if omitted)

**Locations (ViewContainerLocation enum):**
- `Sidebar` (0) — left sidebar
- `Panel` (1) — bottom panel
- `AuxiliaryBar` (2) — right sidebar
- `ChatBar` (3) — chat sidebar

---

### 2. View Registration

**Pattern:** `Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews()`

```typescript
// From testing.contribution.ts
viewsRegistry.registerViews([{
  id: Testing.ExplorerViewId,
  name: nls.localize2('testExplorer', "Test Explorer"),
  ctorDescriptor: new SyncDescriptor(TestingExplorerView),
  canToggleVisibility: true,         // User can hide/show
  canMoveView: true,                 // User can move to other containers
  weight: 80,                        // Width allocation (flex basis)
  order: -999,                       // Display order within container
  containerIcon: testingViewIcon,    // Icon override in container
  when: ContextKeyExpr.greater(...), // Conditional visibility
}], viewContainer);
```

**Key Properties (IViewDescriptor):**
- `id`: Unique view ID
- `name`: Localized UI title
- `ctorDescriptor`: SyncDescriptor for view class (extends `ViewPane`)
- `canToggleVisibility`: User can collapse/hide
- `canMoveView`: User can drag to other containers
- `weight`: Flex basis for width/height
- `order`: Z-order (negative = higher)
- `containerIcon`: Icon in container header
- `when`: ContextKeyExpr for conditional rendering
- `collapsed`: Default collapsed state
- `hideByDefault`: Hidden unless explicitly opened

---

## Core Classes

### IViewPaneContainer (Base Interface)
Implemented by ViewPaneContainer. Manages multiple ViewPane instances.

```typescript
export interface IViewPaneContainer {
  readonly views: IView[];
  readonly onDidAddViews: Event<IView[]>;
  readonly onDidRemoveViews: Event<IView[]>;
  readonly onDidChangeViewVisibility: Event<IView>;

  setVisible(visible: boolean): void;
  isVisible(): boolean;
  focus(): void;
  getView(viewId: string): IView | undefined;
  toggleViewVisibility(viewId: string): void;
}
```

### ViewPane (Abstract Base Class)
Base class for all view implementations. Located at:
`src/vs/workbench/browser/parts/views/viewPane.ts`

```typescript
export abstract class ViewPane extends Pane {
  constructor(options: IViewPaneOptions, ...services)

  // Must implement:
  abstract focusBody(): void;

  // Available:
  showProgress(): IProgressIndicator;
  hideProgress(): void;
  focus(): void;
  setTitle(title: string): void;
  setDescription(desc: string): void;
  toggleWelcome(): void;
}
```

### ViewPaneContainer (Concrete Implementation)
Standard sidebar/panel container. Located at:
`src/vs/workbench/browser/parts/views/viewPaneContainer.ts`

Instantiates and manages ViewPane instances. Usually sufficient for custom views.

---

## Services & Dependencies

**Key Injected Services:**

```typescript
constructor(
  @IInstantiationService instantiationService,
  @IViewDescriptorService viewDescriptorService,
  @IViewsService viewsService,        // Open/focus views
  @IContextKeyService contextKeyService,
  @IStorageService storageService,    // Persist state
  @IThemeService themeService,
  @ITelemetryService telemetryService,
)
```

**IViewsService Usage:**
```typescript
// From codebase
viewsService.openView(viewId, focus?: boolean)
viewsService.closeView(viewId)
```

---

## Implementation Pattern

### Step 1: Create Custom ViewPane Class
```typescript
// File: src/vs/workbench/contrib/agents/browser/agentLanesView.ts
export class AgentLanesView extends ViewPane {
  constructor(options: IViewPaneOptions, @IInstantiationService inst) {
    super(options, inst);
  }

  override focusBody(): void {
    // Focus main content
  }

  protected override renderBody(container: HTMLElement): void {
    // Render HTML into container
    const content = document.createElement('div');
    content.textContent = 'Agent Lanes';
    container.appendChild(content);
  }
}
```

### Step 2: Register in `.contribution.ts`
```typescript
// File: src/vs/workbench/contrib/agents/browser/agents.contribution.ts
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation }
  from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';

// Register container
const agentsViewContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry)
  .registerViewContainer({
    id: 'workbench.views.agents',
    title: { value: 'Agents', original: 'Agents' },
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.views.agents']),
    icon: agentsIcon,
    order: 7,
    hideIfEmpty: true,
  }, ViewContainerLocation.Sidebar);

// Register views
Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([
  {
    id: 'workbench.views.agents.lanes',
    name: { value: 'Agent Lanes', original: 'Agent Lanes' },
    ctorDescriptor: new SyncDescriptor(AgentLanesView),
    canToggleVisibility: true,
    canMoveView: true,
    order: 1,
  },
  {
    id: 'workbench.views.agents.providers',
    name: { value: 'Providers', original: 'Providers' },
    ctorDescriptor: new SyncDescriptor(ProvidersView),
    canToggleVisibility: true,
    canMoveView: true,
    order: 2,
  }
], agentsViewContainer);
```

---

## Reference Files in Codebase

| File | Purpose |
|------|---------|
| `src/vs/workbench/common/views.ts` | Core interfaces: `IViewContainerDescriptor`, `IViewDescriptor`, `IView`, `IViewPaneContainer` |
| `src/vs/workbench/browser/parts/views/viewPane.ts` | Base `ViewPane` class |
| `src/vs/workbench/browser/parts/views/viewPaneContainer.ts` | `ViewPaneContainer` implementation |
| `src/vs/workbench/services/views/browser/viewDescriptorService.ts` | Manages view registry state |
| `src/vs/workbench/contrib/search/browser/search.contribution.ts` | Reference: Simple sidebar viewlet |
| `src/vs/workbench/contrib/testing/browser/testing.contribution.ts` | Reference: Multi-view container |
| `src/vs/workbench/contrib/scm/browser/scm.contribution.ts` | Reference: SCM (Source Control) panel |

---

## Key Design Patterns

### Conditional View Visibility
```typescript
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

{
  id: 'myView',
  name: localize2('myView', 'My View'),
  when: ContextKeyExpr.equals('myContext', true),  // Only show if context true
  ctorDescriptor: new SyncDescriptor(MyViewPane),
}
```

### View Welcome Content (Empty State)
```typescript
viewsRegistry.registerViewWelcomeContent('myViewId', {
  content: localize('noData', "No data available"),
  when: 'default',
});

viewsRegistry.registerViewWelcomeContent('myViewId', {
  content: '[Learn More](https://example.com)',
  order: 10
});
```

### Dynamic View Opening
```typescript
@IViewsService
private viewsService: IViewsService,

// Open view programmatically
this.viewsService.openView('myViewId', true); // true = focus
```

---

## Architecture Diagram

```
Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry)
  ├─ registerViewContainer(IViewContainerDescriptor, Location)
  │   └─ Returns: ViewContainer
  │
Registry.as<IViewsRegistry>(Extensions.ViewsRegistry)
  ├─ registerViews([IViewDescriptor[], viewContainer)
  │
ViewPaneContainer (instantiated via ctorDescriptor)
  ├─ Manages multiple ViewPane instances
  └─ Renders sidebar header + pane toggle UI
      └─ ViewPane (e.g., AgentLanesView)
          ├─ Header bar + title
          ├─ Body (renderBody override)
          └─ Progress indicator
```

---

## Trade-offs & Notes

### ViewPaneContainer vs Custom Container
- **ViewPaneContainer** (RECOMMENDED): Built-in sidebar logic, pane splitting, drag/drop
  - Sufficient for 95% of use cases
  - Zero custom UI code needed
- **Custom Container**: Subclass `IViewPaneContainer` → requires managing ViewPane instantiation, layout, etc.

### State Persistence
- View visibility/collapsed state: Automatic (ViewDescriptorService)
- Custom view data: Use `@IStorageService` in ViewPane constructor
  ```typescript
  constructor(@IStorageService storage) {
    const state = storage.get('myViewState', StorageScope.WORKSPACE);
  }
  ```

### Icon Handling
Use `registerIcon` for theme-aware icons:
```typescript
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';

const agentsIcon = registerIcon('agents-icon', Codicon.robot,
  localize('agentsIcon', 'Icon for agents view'));
```

---

## Unresolved Questions

1. How to add custom toolbar actions to ViewPane header?
   - Likely: Override `getActions()` method in ViewPane
2. How to handle async data loading in ViewPane?
   - Likely: Use `showProgress()` + `@IProgressService`
3. Can ViewPaneContainer be customized to show views side-by-side?
   - Likely: Yes, via `IPaneViewOptions` in constructor descriptor

---

## Summary

**To add "Agent Lanes" and "Providers":**

1. Create two ViewPane subclasses in `src/vs/workbench/contrib/agents/browser/`
2. Create `agents.contribution.ts` with:
   - One `registerViewContainer()` call (one sidebar icon, two views)
   - Two `registerViews()` entries
3. Ensure `.contribution.ts` is imported in main `index.ts` or registered via manifest
4. Build & test

Total LOC: ~200-400 depending on view complexity.
