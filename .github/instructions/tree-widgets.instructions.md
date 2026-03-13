---
description: Use when asked to consume workbench tree widgets in VS Code.
---

# Workbench Tree Widgets Overview

**Location**: `src/vs/platform/list/browser/listService.ts`
**Type**: Platform Services
**Layer**: Platform

## Purpose

The Workbench Tree Widgets provide high-level, workbench-integrated tree components that extend the base tree implementations with VS Code-specific functionality like context menus, keyboard navigation, theming, accessibility, and dependency injection integration. These widgets serve as the primary tree components used throughout the VS Code workbench for file explorers, debug views, search results, and other hierarchical data presentations.

## Scope

### Included Functionality
- **Context Integration**: Automatic context key management, focus handling, and VS Code theme integration
- **Resource Navigation**: Built-in support for opening files and resources with proper editor integration
- **Accessibility**: Complete accessibility provider integration with screen reader support
- **Keyboard Navigation**: Smart keyboard navigation with search-as-you-type functionality
- **Multi-selection**: Configurable multi-selection behavior with platform-appropriate modifier keys
- **Dependency Injection**: Full integration with VS Code's service container for automatic service injection
- **Configuration**: Automatic integration with user settings for tree behavior customization

### Integration Points
- **IInstantiationService**: For service injection and component creation
- **IContextKeyService**: For managing focus, selection, and tree state context keys
- **IListService**: For registering trees and managing workbench list lifecycle
- **IConfigurationService**: For reading tree configuration settings
- **Resource Navigators**: For handling file/resource opening with proper editor integration

### Out of Scope
- Low-level tree rendering and virtualization (handled by base tree classes)
- Data management and async loading logic (provided by data sources)
- Custom styling beyond workbench theming integration

## Architecture

### Key Classes & Interfaces

- **WorkbenchTreeInternals**: Encapsulates common workbench functionality across all tree types
- **ResourceNavigator**: Handles file/resource opening with proper editor integration
- **IOpenEvent**: Event interface for resource opening with editor options
- **IWorkbench*TreeOptions**: Configuration interfaces extending base options with workbench features
- **IResourceNavigatorOptions**: Configuration for resource opening behavior

### Key Files

- **`src/vs/platform/list/browser/listService.ts`**: Contains all workbench tree widget implementations, shared workbench functionality (`WorkbenchTreeInternals`), and configuration utilities
	- `src/vs/platform/list/browser/test/listService.test.ts`: Unit tests for workbench trees
- **`src/vs/base/browser/ui/tree/objectTree.ts`**: Base implementation for static trees and compressible trees
	- `src/vs/base/test/browser/ui/tree/objectTree.test.ts`: Base tree tests
- **`src/vs/base/browser/ui/tree/asyncDataTree.ts`**: Base implementation for async trees with lazy loading support
	- `src/vs/base/test/browser/ui/tree/asyncDataTree.test.ts`: Async tree tests
- **`src/vs/base/browser/ui/tree/dataTree.ts`**: Base implementation for data-driven trees with explicit data sources
	- `src/vs/base/test/browser/ui/tree/dataTree.test.ts`: Data tree tests
- **`src/vs/base/browser/ui/tree/abstractTree.ts`**: Base tree foundation
- **`src/vs/base/browser/ui/tree/tree.ts`**: Core interfaces and types

## Development Guidelines

### Choosing the Right Tree Widget

1. **WorkbenchObjectTree**: Use for simple, static hierarchical data that doesn't change frequently
   ```typescript
   // Example: Timeline items, loaded scripts
   const tree = instantiationService.createInstance(
     WorkbenchObjectTree<TimelineItem, FuzzyScore>,
     'TimelineView', container, delegate, renderers, options
   );
   ```

2. **WorkbenchAsyncDataTree**: Use for dynamic data that loads asynchronously
   ```typescript
   // Example: Debug variables, file contents
   const tree = instantiationService.createInstance(
     WorkbenchAsyncDataTree<IStackFrame, IExpression, FuzzyScore>,
     'VariablesView', container, delegate, renderers, dataSource, options
   );
   ```

3. **WorkbenchCompressible*Tree**: Use when you need path compression for deep hierarchies
   ```typescript
   // Example: File explorer, call stack
   const tree = instantiationService.createInstance(
     WorkbenchCompressibleAsyncDataTree<ExplorerItem[], ExplorerItem, FuzzyScore>,
     'FileExplorer', container, delegate, compressionDelegate, renderers, dataSource, options
   );
   ```

### Construction Pattern

**Always use IInstantiationService.createInstance()** to ensure proper dependency injection:

```typescript
constructor(
  @IInstantiationService private instantiationService: IInstantiationService
) {
  this.tree = this.instantiationService.createInstance(
    WorkbenchAsyncDataTree<TInput, T, TFilterData>,
    'UniqueTreeId',           // Used for settings and context keys
    container,                // DOM container element
    delegate,                 // IListVirtualDelegate for item height/template
    renderers,                // Array of tree renderers
    dataSource,              // Data source (async trees only)
    options                  // Tree configuration options
  );
}
```

### Required Options

All workbench trees require an **accessibilityProvider**:
```typescript
const options: IWorkbenchAsyncDataTreeOptions<T, TFilterData> = {
  accessibilityProvider: {
    getAriaLabel: (element: T) => element.name,
    getRole: () => 'treeitem'
  }
  // ... other options
};
```

### Common Configuration Patterns

```typescript
// Standard tree setup with search, identity, and navigation
const options = {
  accessibilityProvider: new MyAccessibilityProvider(),
  identityProvider: { getId: (element) => element.id },
  keyboardNavigationLabelProvider: {
    getKeyboardNavigationLabel: (element) => element.name
  },
  multipleSelectionController: {
    isSelectionSingleChangeEvent: (e) => e.ctrlKey || e.metaKey,
    isSelectionRangeChangeEvent: (e) => e.shiftKey
  },
  overrideStyles: this.getLocationBasedColors().listOverrideStyles
};
```

### Lifecycle Management

- **Always register trees as disposables** in the containing component
- **Use the tree's `setInput()` method** to provide initial data
- **Always call `layout()` when the container initializes and when its size changes**
- **Handle selection and open events** through the tree's event system

### Performance Considerations

- Use **compression** for deep hierarchies to reduce DOM nodes
- Implement **efficient data sources** that avoid unnecessary data fetching
- Consider **virtualization settings** for large datasets
- Use **identity providers** for efficient updates and state preservation

---
