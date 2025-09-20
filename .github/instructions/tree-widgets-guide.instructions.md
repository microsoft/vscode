# VS Code Tree Widgets: Complete Guide

This guide provides comprehensive instructions for consuming the different tree widgets available in VS Code's platform layer. These widgets are designed to provide consistent behavior, theming, and accessibility across the entire workbench. To ensure most trees look and behave similarly, consumers should rely on the built-in theming capabilities and avoid making significant custom CSS changes.

## Overview

VS Code provides several tree widget implementations in the `src/vs/platform/list/browser/listService.ts` module:

- **WorkbenchObjectTree** - Simple hierarchical tree with static data
- **WorkbenchCompressibleObjectTree** - Tree with compression for long paths
- **WorkbenchDataTree** - Tree with synchronous data source
- **WorkbenchAsyncDataTree** - Tree with asynchronous data loading
- **WorkbenchCompressibleAsyncDataTree** - Async tree with compression

All tree widgets extend their base implementations and add workbench-specific features like context keys, keyboard navigation, theming, and resource navigation.

## Common Requirements

All tree widgets require these core components:

### 1. Virtual Delegate (IListVirtualDelegate)
Controls the virtual scrolling behavior by defining item height and which renderer template to use. The `getTemplateId` method determines which renderer handles each element type, enabling different item types to use different visual representations. The default height of 22 pixels is recommended for consistency.

```typescript
class MyTreeDelegate implements IListVirtualDelegate<MyItem> {
	getHeight(element: MyItem): number {
		return 22;
	}

	getTemplateId(element: MyItem): string {
		return 'mytemplate'; // Must match a renderer's templateId
	}
}
```

### 2. Renderer (ITreeRenderer)
Renders tree items in the DOM:

```typescript
interface MyTemplateData {
	container: HTMLElement;
	label: HTMLElement;
	icon?: HTMLElement;
	disposables: DisposableStore;
}

class MyTreeRenderer implements ITreeRenderer<MyItem, FuzzyScore, MyTemplateData> {
	readonly templateId = 'mytemplate';

	renderTemplate(container: HTMLElement): MyTemplateData {
		const disposables = new DisposableStore();
		const label = document.createElement('span');
		container.appendChild(label);
		return { container, label, disposables };
	}

	renderElement(element: ITreeNode<MyItem, FuzzyScore>, index: number, templateData: MyTemplateData): void {
		templateData.label.textContent = element.element.name;
	}

	disposeTemplate(templateData: MyTemplateData): void {
		templateData.disposables.dispose();
	}
}
```

### 3. Accessibility Provider (IListAccessibilityProvider)
Provides screen reader support:

```typescript
const accessibilityProvider: IListAccessibilityProvider<MyItem> = {
	getAriaLabel(element: MyItem): string {
		return element.name;
	},
	getWidgetAriaLabel(): string {
		return 'My Tree';
	}
};
```

## Tree Widget Types

### WorkbenchObjectTree

**Use Case**: Simple hierarchical trees with static data structure.

**Constructor Parameters**:
```typescript
constructor(
	user: string,                           // Unique identifier for the tree
	container: HTMLElement,                 // DOM container
	delegate: IListVirtualDelegate<T>,      // Height/template provider
	renderers: ITreeRenderer<T, TFilterData, any>[], // Item renderers
	options: IWorkbenchObjectTreeOptions<T, TFilterData>, // Configuration
	@IInstantiationService instantiationService: IInstantiationService,
	@IContextKeyService contextKeyService: IContextKeyService,
	@IListService listService: IListService,
	@IConfigurationService configurationService: IConfigurationService
)
```

**Required Options**:
```typescript
interface IWorkbenchObjectTreeOptions<T, TFilterData> {
	readonly accessibilityProvider: IListAccessibilityProvider<T>; // Required
	readonly overrideStyles?: IStyleOverride<IListStyles>;         // Optional theming
	readonly selectionNavigation?: boolean;                        // Enable selection-based navigation
	readonly scrollToActiveElement?: boolean;                      // Auto-scroll to active item
	// ... other IObjectTreeOptions
}
```

**Example Usage**:
```typescript
// Create tree instance
const tree = instantiationService.createInstance(
	WorkbenchObjectTree<MyItem, FuzzyScore>,
	'MyTreeId',
	container,
	new MyTreeDelegate(),
	[new MyTreeRenderer()],
	{
		accessibilityProvider,
		identityProvider: {
			getId: (element: MyItem) => element.id
		},
		sorter: {
			compare: (a: MyItem, b: MyItem) => a.name.localeCompare(b.name)
		},
		filter: {
			filter: (element: MyItem) => TreeVisibility.Visible
		}
	}
);

// Set tree dimensions (required for proper rendering and scrolling)
tree.layout(300, 400);

// Set data
tree.setChildren(null, [
	{
		element: { id: '1', name: 'Parent' },
		children: [
			{ element: { id: '1.1', name: 'Child' } }
		]
	}
]);
```

### WorkbenchDataTree

**Use Case**: Trees where data is provided through a synchronous data source.

**Additional Requirements**:
- **Data Source (IDataSource)**: Provides child elements synchronously

```typescript
class MyDataSource implements IDataSource<RootItem, MyItem> {
	hasChildren(element: RootItem | MyItem): boolean {
		return element.children && element.children.length > 0;
	}

	getChildren(element: RootItem | MyItem): MyItem[] {
		return element.children || [];
	}
}
```

**Constructor Parameters**:
```typescript
constructor(
	user: string,
	container: HTMLElement,
	delegate: IListVirtualDelegate<T>,
	renderers: ITreeRenderer<T, TFilterData, any>[],
	dataSource: IDataSource<TInput, T>,      // Data provider
	options: IWorkbenchDataTreeOptions<T, TFilterData>,
	// ... services
)
```

**Example Usage**:
```typescript
const tree = instantiationService.createInstance(
	WorkbenchDataTree<RootItem, MyItem, FuzzyScore>,
	'MyDataTreeId',
	container,
	new MyTreeDelegate(),
	[new MyTreeRenderer()],
	new MyDataSource(),
	{
		accessibilityProvider,
		identityProvider: {
			getId: (element: MyItem) => element.id
		}
	}
);

// Set tree dimensions
tree.layout(300, 400);

// Set input (root)
tree.setInput(rootItem);
```

### WorkbenchAsyncDataTree

**Use Case**: Trees where data loading is asynchronous (network calls, file system access).

**Additional Requirements**:
- **Async Data Source (IAsyncDataSource)**: Provides child elements asynchronously

```typescript
class MyAsyncDataSource implements IAsyncDataSource<RootItem, MyItem> {
	hasChildren(element: RootItem | MyItem): boolean {
		return element.hasChildren;
	}

	async getChildren(element: RootItem | MyItem): Promise<MyItem[]> {
		return await this.loadChildrenFromServer(element.id);
	}

	private async loadChildrenFromServer(id: string): Promise<MyItem[]> {
		const children = await ...;
		return children;
	}
}
```

**Constructor Parameters**:
```typescript
constructor(
	user: string,
	container: HTMLElement,
	delegate: IListVirtualDelegate<T>,
	renderers: ITreeRenderer<T, TFilterData, any>[],
	dataSource: IAsyncDataSource<TInput, T>,  // Async data provider
	options: IWorkbenchAsyncDataTreeOptions<T, TFilterData>,
	// ... services
)
```

**Example Usage**:
```typescript
const tree = instantiationService.createInstance(
	WorkbenchAsyncDataTree<RootItem, MyItem, FuzzyScore>,
	'MyAsyncTreeId',
	container,
	new MyTreeDelegate(),
	[new MyTreeRenderer()],
	new MyAsyncDataSource(),
	{
		accessibilityProvider,
		identityProvider: {
			getId: (element: MyItem) => element.id
		}
	}
);

// Set tree dimensions
tree.layout(300, 400);

// Set input (root)
await tree.setInput(rootItem);
```

### WorkbenchCompressibleObjectTree

**Use Case**: Trees displaying file paths or other hierarchical data where intermediate single-child nodes should be compressed.

**Additional Requirements**:
- **Compression Renderers**: Must implement `ICompressibleTreeRenderer`

```typescript
class MyCompressibleRenderer implements ICompressibleTreeRenderer<MyItem, FuzzyScore, MyTemplateData> {
	readonly templateId = 'mytemplate';

	renderTemplate(container: HTMLElement): MyTemplateData {
		// Same as regular renderer
	}

	renderElement(node: ITreeNode<MyItem, FuzzyScore>, index: number, templateData: MyTemplateData): void {
		// Same as regular renderer
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<MyItem>, FuzzyScore>, index: number, templateData: MyTemplateData): void {
		// Render compressed path (e.g., "folder1/folder2/folder3")
		const compressedNode = node.element;
		const path = compressedNode.elements.map(e => e.name).join('/');
		templateData.label.textContent = path;
	}

	disposeTemplate(templateData: MyTemplateData): void {
		// Clean up
	}
}
```

### WorkbenchCompressibleAsyncDataTree

**Use Case**: Combines async data loading with path compression.

**Additional Requirements**:
- **Async Data Source**: `IAsyncDataSource<TInput, T>`
- **Compression Delegate**: `ITreeCompressionDelegate<T>`
- **Compressible Renderers**: `ICompressibleTreeRenderer<T, TFilterData, any>[]`

```typescript
class MyCompressionDelegate implements ITreeCompressionDelegate<MyItem> {
	isIncompressible(element: MyItem): boolean {
		// Return true for elements that should never be compressed
		return element.isImportant;
	}
}
```

## Common Options

All tree widgets support these common options:

### Core Options
```typescript
interface CommonTreeOptions<T, TFilterData> {
	// Required
	accessibilityProvider: IListAccessibilityProvider<T>;

	// Optional but commonly used
	identityProvider?: IIdentityProvider<T>;        // For stable identity across updates
	sorter?: ITreeSorter<T>;                        // Custom sorting
	filter?: ITreeFilter<T, TFilterData>;           // Custom filtering
	keyboardNavigationLabelProvider?: IKeyboardNavigationLabelProvider<T>; // Type-ahead search

	// Behavior
	multipleSelectionSupport?: boolean;             // Enable multi-select
	selectionNavigation?: boolean;                  // Selection follows navigation
	expandOnlyOnTwistieClick?: boolean;             // Click behavior
	automaticKeyboardNavigation?: boolean;          // Auto keyboard nav

	// Styling
	overrideStyles?: IStyleOverride<IListStyles>;   // Custom colors

	// Advanced
	dnd?: ITreeDragAndDrop<T>;                      // Drag and drop
	contextMenuProvider?: IContextMenuProvider;     // Context menus
}
```

### Style Override Example
View panes have the protected method `getLocationBasedColors` which allows to get the specific colors based on the location the view is rendered at. This only works when the tree is in a view pane. Otherwise, the default colors should be used (no overrideStyles) or the styles need to be passed down if needed.
```typescript
const overrideStyles: IStyleOverride<IListStyles> = this.getLocationBasedColors().listOverrideStyles;
```

## Advanced Features

### Drag and Drop
```typescript
class MyTreeDragAndDrop implements ITreeDragAndDrop<MyItem> {
	getDragURI(element: MyItem): string | null {
		return element.uri?.toString() ?? null;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		// Handle drag start
	}

	onDragOver(data: IDragAndDropData, targetElement: MyItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return true; // Allow drop
	}

	drop(data: IDragAndDropData, targetElement: MyItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void {
		// Handle drop
	}
}
```

### Context Menus
```typescript
tree.onContextMenu(e => {
	const actions = this.getContextMenuActions(e.element);
	this.contextMenuService.showContextMenu({
		getAnchor: () => e.anchor,
		getActions: () => actions
	});
});
```

### Keyboard Navigation
```typescript
const keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<MyItem> = {
	getKeyboardNavigationLabel(element: MyItem): { toString(): string } {
		return element.name;
	}
};
```

## Event Handling

All trees provide these common events:

```typescript
// Selection changes
tree.onDidChangeSelection(e => {
	console.log('Selected:', e.elements);
});

// Focus changes
tree.onDidChangeFocus(e => {
	console.log('Focused:', e.elements);
});

// Open events (double-click, Enter)
tree.onDidOpen(e => {
	console.log('Opened:', e.element);
	// e.editorOptions contains open options (preserveFocus, pinned, etc.)
	// e.sideBySide indicates if opened side-by-side
});

// Collapse/expand (object trees only)
tree.onDidChangeCollapseState(e => {
	console.log(`${e.node.collapsed ? 'Collapsed' : 'Expanded'}:`, e.node.element);
});
```

## Best Practices

1. **Choose the Right Widget**:
   - Use `WorkbenchObjectTree` for simple static hierarchies
   - Use `WorkbenchDataTree` for synchronous data sources
   - Use `WorkbenchAsyncDataTree` for network/async data
   - Use compressible variants for file system-like data

2. **Performance**:
   - Implement efficient `identityProvider` for stable updates
   - Use virtual scrolling (handled automatically)
   - Implement lazy loading in async data sources

3. **Accessibility**:
   - Always provide meaningful `accessibilityProvider`
   - Use semantic ARIA roles when appropriate
   - Support keyboard navigation

4. **Theming**:
   - Use `overrideStyles` sparingly, prefer CSS theming
   - Follow VS Code's color token conventions
   - Test with all built-in themes

5. **Error Handling**:
   - Handle async data source errors gracefully
   - Provide loading states for async operations
   - Show user-friendly error messages

6. **Layout Management**:
   - Always call `layout()` after creating the tree to set proper dimensions
   - Update layout when container size changes
   - Ensure container has explicit dimensions for proper scrolling

## Tree Layout Management

### The layout() Method

All tree widgets require proper layout management to function correctly. The `layout()` method tells the tree widget its exact dimensions, which is essential for:

- **Virtual scrolling**: Calculating how many items to render
- **Scrollbar positioning**: Determining when scrollbars are needed
- **Item positioning**: Properly positioning visible items
- **Performance**: Optimizing rendering for the visible area

### Basic Layout Usage

```typescript
// After creating the tree, set its dimensions
tree.layout(height, width);

// Example: Set tree to 400px height and 300px width
tree.layout(400, 300);
```

### When to Call layout()

1. **After Tree Creation**: Always call `layout()` immediately after creating a tree instance
2. **Container Resize**: When the parent container changes size
3. **Visibility Changes**: When the tree becomes visible after being hidden
4. **Dynamic Content**: When adding/removing significant amounts of data

### Layout in Different Scenarios

#### Fixed Size Containers
```typescript
const tree = instantiationService.createInstance(
	WorkbenchObjectTree<MyItem, FuzzyScore>,
	'MyTreeId',
	container,
	delegate,
	renderers,
	options
);

// Set fixed dimensions
tree.layout(300, 400);
```

#### Responsive Containers
```typescript
const tree = instantiationService.createInstance(WorkbenchObjectTree, ...);

// Initial layout
tree.layout(container.clientHeight, container.clientWidth);

// Listen for resize events
const resizeObserver = new ResizeObserver(() => {
	tree.layout(container.clientHeight, container.clientWidth);
});
resizeObserver.observe(container);
```

#### Dynamic Height Containers
```typescript
// For containers that should expand to fit content
const tree = instantiationService.createInstance(WorkbenchObjectTree, ...);

// Calculate height based on content
const itemHeight = 22; // From delegate.getHeight()
const maxItems = 10;
const calculatedHeight = Math.min(treeData.length * itemHeight, maxItems * itemHeight);

tree.layout(calculatedHeight, 300);
```

### Layout Best Practices

1. **Always Set Explicit Dimensions**: Never rely on CSS alone for tree dimensions
2. **Handle Resize Events**: Update layout when container size changes
3. **Consider Minimum Sizes**: Ensure trees have reasonable minimum dimensions
4. **Test Scrolling**: Verify scrollbars appear correctly with different content amounts

### Common Layout Issues

#### Issue: Tree Not Visible
```typescript
// ❌ Wrong: No layout called
const tree = createTree();
tree.setData(data);

// ✅ Correct: Layout called with proper dimensions
const tree = createTree();
tree.layout(200, 300);
tree.setData(data);
```

#### Issue: Scrolling Not Working
```typescript
// ❌ Wrong: Container doesn't constrain tree size
container.style.height = 'auto';
tree.layout(container.clientHeight, container.clientWidth);

// ✅ Correct: Container has fixed height
container.style.height = '200px';
container.style.overflow = 'hidden';
tree.layout(200, container.clientWidth);
```

#### Issue: Poor Performance with Large Data
```typescript
// ❌ Wrong: Layout called repeatedly during data updates
for (const item of largeDataSet) {
	tree.addItem(item);
	tree.layout(height, width); // Expensive!
}

// ✅ Correct: Layout called once after all updates
for (const item of largeDataSet) {
	tree.addItem(item);
}
tree.layout(height, width);
```

## Complete Example: File Explorer Tree

```typescript
interface FileItem {
	id: string;
	name: string;
	isDirectory: boolean;
	path: string;
	children?: FileItem[];
}

class FileTreeDelegate implements IListVirtualDelegate<FileItem> {
	getHeight(): number { return 22; }
	getTemplateId(): string { return 'file-item'; }
}

class FileTreeRenderer implements ITreeRenderer<FileItem, FuzzyScore, FileTemplateData> {
	readonly templateId = 'file-item';

	renderTemplate(container: HTMLElement): FileTemplateData {
		const element = document.createElement('div');
		element.className = 'file-item';

		const icon = document.createElement('span');
		icon.className = 'file-icon';

		const label = document.createElement('span');
		label.className = 'file-label';

		element.appendChild(icon);
		element.appendChild(label);
		container.appendChild(element);

		return { container: element, icon, label };
	}

	renderElement(node: ITreeNode<FileItem, FuzzyScore>, index: number, templateData: FileTemplateData): void {
		const file = node.element;
		templateData.label.textContent = file.name;
		templateData.icon.className = `file-icon ${file.isDirectory ? 'folder' : 'file'}`;
	}

	disposeTemplate(): void {}
}

class FileDataSource implements IAsyncDataSource<FileItem, FileItem> {
	hasChildren(element: FileItem): boolean {
		return element.isDirectory;
	}

	async getChildren(element: FileItem): Promise<FileItem[]> {
		// Load directory contents
		return await this.fileService.readdir(element.path);
	}
}

// Usage
const fileTree = instantiationService.createInstance(
	WorkbenchAsyncDataTree<FileItem, FileItem, FuzzyScore>,
	'FileExplorer',
	container,
	new FileTreeDelegate(),
	[new FileTreeRenderer()],
	new FileDataSource(),
	{
		accessibilityProvider: {
			getAriaLabel: (element: FileItem) => element.name,
			getWidgetAriaLabel: () => 'File Explorer'
		},
		identityProvider: {
			getId: (element: FileItem) => element.path
		},
		sorter: {
			compare: (a: FileItem, b: FileItem) => {
				// Directories first, then alphabetical
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			}
		}
	}
);

// IMPORTANT: Set tree layout dimensions
fileTree.layout(height, width);

// Set root directory
await fileTree.setInput(rootDirectory);
```
