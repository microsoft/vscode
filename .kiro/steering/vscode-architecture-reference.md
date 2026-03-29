---
inclusion: auto
---

# VSCode Architecture Reference Guide

This document serves as the authoritative reference for VSCode secondary development. **MUST READ before starting any new feature development.**

## Core Architecture Principles

### 1. Project Structure (src/vs/)

```
vs/
├── base/          # Foundation layer - utilities, UI primitives, data structures
├── platform/      # Platform layer - DI container, core service interfaces
├── editor/        # Monaco editor core
│   ├── common/    # Environment-agnostic editor logic
│   ├── browser/   # Browser-specific rendering
│   └── contrib/   # Optional editor features (folding, references, etc.)
├── workbench/     # Workbench layer - complete IDE framework
│   ├── common/    # Core workbench logic
│   ├── browser/   # Browser workbench implementation
│   ├── services/  # Workbench-level services
│   ├── contrib/   # Feature modules (search, git, debug, terminal, etc.)
│   └── api/       # Extension API implementation
├── code/          # Application entry (Electron main process, CLI)
└── server/        # Remote development server
```

**Key Rule**: Lower layers cannot depend on upper layers. Each layer provides abstractions for the layer above.

### 2. Three-Layer Architecture

#### Data Layer (State Management)
- **TextModel**: Document content, cursor, undo/redo stack
- **Configuration**: Settings from multiple scopes (default, user, workspace)
- **Workbench State**: Open editors, panel visibility, layout dimensions
- **Context Keys**: Transient state for controlling feature availability (e.g., `editorTextFocus`, `gitHasChanges`)
- **Storage Service**: Persistent state across sessions

**Pattern**: Decentralized state management - each subsystem manages its own state and emits events on changes.

#### Service Layer (Business Logic)
- **Service Definition**: Interface-based (`IServiceName`) with dependency injection
- **Platform Services**: `IFileService`, `ILogService`, `IStorageService`, `IConfigurationService`
- **Workbench Services**: `IEditorService`, `IViewletService`, `IPanelService`, `ICommandService`
- **Extension Points**: Services handle extension contributions (commands, menus, languages, debuggers)

**Pattern**: Services encapsulate business logic, provide clean interfaces, and can have different implementations per environment.

#### Rendering Layer (UI Components)
- **Workbench Parts**: `EditorPart`, `SidebarPart`, `PanelPart`, `StatusBarPart`, `TitleBar`
- **View Components**: Viewlets, Panels, Views registered via registries
- **Transient UI**: Quick Pick, Notifications, Dialogs managed by services
- **No Framework**: Custom lightweight UI framework, not React/Vue

**Pattern**: UI components call services for operations, subscribe to events for updates. No direct DOM manipulation outside component boundaries.

### 3. Design Patterns

#### Dependency Injection (DI)
```typescript
// 1. Define service interface and identifier
export const IMyService = createDecorator<IMyService>('myService');
export interface IMyService {
    doSomething(): void;
}

// 2. Implement service
class MyService implements IMyService {
    doSomething() { /* ... */ }
}

// 3. Register service
registerSingleton(IMyService, MyService, InstantiationType.Delayed);

// 4. Inject in consumer
class MyComponent {
    constructor(@IMyService private myService: IMyService) {
        this.myService.doSomething();
    }
}
```

**Benefits**: Decoupling, unified lifecycle management, flexible implementations per environment.

#### Contribution Points (Extension Mechanism)
```typescript
// Internal contribution pattern
class MyFeatureContribution implements IWorkbenchContribution {
    constructor(
        @IStatusbarService statusbarService: IStatusbarService,
        @ICommandService commandService: ICommandService
    ) {
        // Register commands, menus, views, etc.
    }
}

// Register contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(MyFeatureContribution, LifecyclePhase.Restored);
```

**Key Registries**:
- `CommandsRegistry` - Commands
- `MenuRegistry` - Menu items
- `KeybindingsRegistry` - Key

// Cleanup
disposable.dispose();
```

**IPC Communication**:
- Main ↔ Renderer: Electron IPC for window management, native dialogs
- Renderer ↔ Extension Host: RPC framework for extension API calls
- Shared Process: Background services shared across windows

## Development Workflow

### Building & Running

```bash
# Install dependencies
yarn

# Continuous compilation (recommended for development)
yarn watch

# One-time compilation
yarn compile

# Run development version (desktop)
./scripts/code.sh

# Run web version
yarn web
```

### Debugging

**Renderer Process**:
1. Open Dev Tools in development instance: `Ctrl+Shift+I`
2. Or attach from stable VSCode using launch configurations in `.vscode/launch.json`

**Extension Host**:
- Debug port: 5870 (default)
- Attach using Node.js debugger

**Main Process**:
- Attach using Node.js debugger with process picker

### Code Markers for Fork-Specific Changes

**CRITICAL**: Mark all fork-specific changes to minimize merge conflicts:

```typescript
// Single line
const value = 42; // test-workbench_change

// Multi-line
// test-workbench_change start
const foo = 1;
const bar = 2;
// test-workbench_change end

// New file (at top)
// test-workbench_change - new file
```

## Feature Development Patterns

### Pattern 1: Adding UI Elements

**Status Bar Item**:
```typescript
statusbarService.addEntry(
    {
        text: '$(icon) Label',
        tooltip: 'Tooltip',
        command: 'my.command'
    },
    'unique.id',
    StatusbarAlignment.LEFT,
    1000 // priority
);
```

**Menu Item**:
```typescript
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    command: { id: 'my.command', title: 'My Action' },
    when: ContextKeyExpr.equals('resourceLangId', 'typescript'),
    group: 'navigation',
    order: 10
});
```

**Keyboard Shortcut**:
```typescript
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'my.command',
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.textFocus,
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyQ
});
```

### Pattern 2: Creating New Services

```typescript
// 1. Define interface
export const IMyService = createDecorator<IMyService>('myService');
export interface IMyService {
    _serviceBrand: undefined;
    performAction(input: string): Promise<string>;
}

// 2. Implement service
class MyService implements IMyService {
    declare readonly _serviceBrand: undefined;

    constructor(
        @IFileService private fileService: IFileService,
        @ILogService private logService: ILogService
    ) {}

    async performAction(input: string): Promise<string> {
        this.logService.info('Performing action', input);
        // Implementation
        return result;
    }
}

// 3. Register service
registerSingleton(IMyService, MyService, InstantiationType.Delayed);
```

### Pattern 3: Creating Contrib Modules

**Directory Structure**:
```
workbench/contrib/myFeature/
├── common/
│   └── myFeature.ts          # Shared interfaces/types
├── browser/
│   ├── myFeature.ts          # Main implementation
│   ├── myFeatureView.ts      # UI components
│   └── myFeature.contribution.ts  # Registration entry point
└── electron-sandbox/         # Electron-specific (if needed)
```

**Contribution Entry Point**:
```typescript
// myFeature.contribution.ts
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class MyFeatureContribution implements IWorkbenchContribution {
    constructor(
        @IMyService private myService: IMyService,
        @ICommandService commandService: ICommandService
    ) {
        this.registerCommands();
        this.registerViews();
    }

    private registerCommands(): void {
        CommandsRegistry.registerCommand('myFeature.action', async () => {
            await this.myService.performAction('test');
        });
    }

    private registerViews(): void {
        // Register views, panels, etc.
    }
}

// Register contribution
Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
    .registerWorkbenchContribution(MyFeatureContribution, LifecyclePhase.Restored);
```

**Import in Main Entry**:
```typescript
// workbench.desktop.main.ts or workbench.common.main.ts
import 'vs/workbench/contrib/myFeature/browser/myFeature.contribution';
```

### Pattern 4: Adding Views/Panels

```typescript
// Register view container
const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry)
    .registerViewContainer({
        id: 'myFeature',
        title: 'My Feature',
        icon: 'my-icon',
        order: 5
    }, ViewContainerLocation.Sidebar);

// Register view
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry)
    .registerViews([{
        id: 'myFeature.view',
        name: 'My View',
        containerIcon: 'my-icon',
        canToggleVisibility: true,
        ctorDescriptor: new SyncDescriptor(MyFeatureView)
    }], viewContainer);
```

## Critical Rules for Development

### DO's
1. ✅ Use dependency injection for all service access
2. ✅ Register contributions via registries, not direct modification
3. ✅ Use events for cross-component communication
4. ✅ Follow the layer hierarchy (base → platform → editor → workbench)
5. ✅ Mark fork-specific changes with `test-workbench_change` comments
6. ✅ Use `readCode` tool for code analysis (not `readFile`)
7. ✅ Use `getDiagnostics` for error checking (not bash commands)
8. ✅ Create contrib modules for new features
9. ✅ Use existing services through interfaces
10. ✅ Implement `IDisposable` for cleanup

### DON'Ts
1. ❌ Don't directly manipulate DOM outside component boundaries
2. ❌ Don't create global singletons without DI
3. ❌ Don't modify core parts directly - use contribution points
4. ❌ Don't create circular dependencies between contrib modules
5. ❌ Don't access private implementation details of other modules
6. ❌ Don't block UI thread with heavy operations
7. ❌ Don't use `any` type - leverage TypeScript's type system
8. ❌ Don't forget to dispose event subscriptions
9. ❌ Don't bypass service interfaces to access implementation
10. ❌ Don't claim WCAG compliance without proper testing

## Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  - Window management                                    │
│  - Native dialogs, menus                                │
│  - File system (in sandbox mode)                        │
│  - Application lifecycle                                │
└────────────┬────────────────────────────────────────────┘
             │ IPC
    ┌────────┴────────┬──────────────┬──────────────┐
    │                 │              │              │
┌───▼────────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
│ Renderer 1 │  │Renderer 2│  │Extension │  │  Shared  │
│  (Window)  │  │ (Window) │  │   Host   │  │ Process  │
│            │  │          │  │          │  │          │
│ Workbench  │  │Workbench │  │Extensions│  │Background│
│    UI      │  │   UI     │  │  Run     │  │ Services │
└────────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Service Call Flow Example

**Opening a File**:
```
User Action (Explorer double-click)
    ↓
Explorer View captures event
    ↓
IEditorService.openEditor(uri)
    ↓
EditorService creates EditorInput
    ↓
EditorGroupService.openEditor()
    ↓
TextFileEditor.setInput()
    ↓
EditorInput.resolve() → ITextModelService
    ↓
IFileService.readFile(uri)
    ↓
TextModel created with content
    ↓
Monaco Editor.setModel(textModel)
    ↓
UI renders file content
```

## Common Context Keys

- `editorTextFocus` - Editor has text focus
- `editorHasSelection` - Editor has selected text
- `resourceLangId` - Language ID of current file
- `resourceScheme` - URI scheme of current resource
- `isInDiffEditor` - Currently in diff editor
- `gitHasChanges` - Git repository has changes
- `debugState` - Current debug state

## Useful Commands for Development

```bash
# Search for patterns in code
yarn grep "pattern"

# Run tests
yarn test

# Lint code
yarn eslint

# Format code
yarn format

# Clean build artifacts
yarn clean

# Full rebuild
yarn clean && yarn && yarn compile
```

## Reference Documentation

- **Source Code Organization**: https://github.com/microsoft/vscode-wiki/blob/main/Source-Code-Organization.md
- **Extension API**: https://code.visualstudio.com/api
- **Contribution Points**: Check `package.json` schemas
- **Internal APIs**: Read source code in `src/vs/`

## Pre-Development Checklist

Before starting any new feature:

- [ ] Read this reference guide
- [ ] Identify which layer the feature belongs to (platform/editor/workbench)
- [ ] Determine if it should be a contrib module
- [ ] List required services and their interfaces
- [ ] Plan event communication flow
- [ ] Design contribution points (commands, menus, views)
- [ ] Consider multi-environment support (desktop/web)
- [ ] Plan testing approach
- [ ] Prepare to mark fork-specific changes

---

**Remember**: VSCode's architecture is designed for extensibility. Work with the architecture, not against it. Use contribution points, services, and events to integrate features cleanly.
