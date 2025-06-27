/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, TreeMouseEventTarget } from '../../../../base/browser/ui/tree/tree.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../list/browser/listService.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IQuickTree, IQuickTreeCheckboxEvent, IQuickTreeExpansionEvent, IQuickTreeItem, IQuickTreeItemButtonEvent, QuickInputType, TreeItemCollapsibleState } from '../../common/quickInput.js';
import { QuickInput, type QuickInputUI } from '../quickInput.js';
import { QuickTreeDataSource } from './quickTreeDataSource.js';
import { IQuickTreeRenderOptions, QuickTreeAccessibilityProvider, QuickTreeRenderer } from './quickTreeRenderer.js';

const $ = dom.$;

interface IQuickTreeDelegate<T extends IQuickTreeItem> extends IListVirtualDelegate<T> {
	getTemplateId(element: T): string;
}

/**
 * Delegate for QuickTree that provides height and template information.
 */
class QuickTreeDelegate<T extends IQuickTreeItem> implements IQuickTreeDelegate<T> {
	getHeight(_element: T): number {
		return 22;
	}

	getTemplateId(_element: T): string {
		return QuickTreeRenderer.ID;
	}
}

export class QuickTree<T extends IQuickTreeItem> extends QuickInput implements IQuickTree<T> {

	private static readonly DEFAULT_ARIA_LABEL = localize('quickTree.ariaLabel', "Type to filter tree results.");

	private _value = '';
	private _ariaLabel: string | undefined;
	private _placeholder: string | undefined;
	private readonly onDidChangeValueEmitter = this._register(new Emitter<string>());
	private readonly onWillAcceptEmitter = this._register(new Emitter<void>());
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());
	private _canSelectMany = false;
	private _manuallyManageCheckboxes = false;
	private _hideCheckAll = false;
	private _matchOnDescription = false;
	private _matchOnDetail = false;
	private _matchOnLabel = true;
	private _sortByLabel = true;
	private _activeItem: T | undefined;
	private readonly onDidChangeActiveEmitter = this._register(new Emitter<T | undefined>());
	private _selectedItems: T[] = [];
	private readonly onDidChangeSelectionEmitter = this._register(new Emitter<T[]>());
	private readonly onDidChangeCheckboxStateEmitter = this._register(new Emitter<IQuickTreeCheckboxEvent<T>>());
	private readonly onDidChangeExpansionEmitter = this._register(new Emitter<IQuickTreeExpansionEvent<T>>());
	private readonly onDidLeaveEmitter = this._register(new Emitter<void>());
	private readonly onChangedCheckedCountEmitter = this._register(new Emitter<number>());
	private readonly onDidTriggerItemButtonEmitter = this._register(new Emitter<IQuickTreeItemButtonEvent<T>>());

	// Input filtering - use inherited visibleDisposables from QuickInput

	// Tree-specific components
	private readonly dataSource: QuickTreeDataSource<T>;
	private readonly delegate: QuickTreeDelegate<T>;
	private readonly renderer: QuickTreeRenderer<T>;
	private readonly accessibilityProvider: QuickTreeAccessibilityProvider<T>;
	private tree: WorkbenchObjectTree<T, void> | undefined;

	// Tree container
	private treeContainer: HTMLElement | undefined;

	readonly type = QuickInputType.QuickTree;

	constructor(
		ui: QuickInputUI,
		options: { hoverDelegate?: IHoverDelegate; styles?: any },
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super(ui);

		// Initialize tree components
		this.dataSource = this._register(new QuickTreeDataSource<T>({ maintainParentReferences: true }));
		this.delegate = new QuickTreeDelegate<T>();
		this.accessibilityProvider = new QuickTreeAccessibilityProvider<T>();

		const renderOptions: IQuickTreeRenderOptions = {
			indent: 5,
			hasCheckbox: false, // Will be updated based on canSelectMany
			hoverDelegate: options.hoverDelegate
		};
		this.renderer = this._register(new QuickTreeRenderer<T>(renderOptions, this.themeService));

		// Setup event handlers
		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		// Listen to data source changes for structural changes
		this._register(this.dataSource.onDidChangeTreeData(() => {
			this.updateTree();
		}));

		// Renderer event handlers (twistie handling now done by tree itself)

		// Handle checkbox changes with scroll preservation
		this.renderer['onCheckboxChange'] = (element, checked) => {
			this.handleCheckboxChange(element, checked);
		};

		// Handle button clicks
		this.renderer['onButtonClick'] = (element, button) => {
			this.onDidTriggerItemButtonEmitter.fire({
				button,
				item: element
			});
		};
	}

	private handleInputChange(value: string): void {
		if (this._value !== value) {
			this._value = value;
			// Don't call update() here to avoid infinite loop since input change comes from UI
			this.filterTree();
			// Force layout update after filtering to adjust height
			setTimeout(() => this.layoutTree(), 0);
			this.onDidChangeValueEmitter.fire(this._value);
		}
	}

	private handleAccept(): void {
		// Update selected items based on current state
		if (this.canSelectMany) {
			// For multi-select, gather all checked items
			this._selectedItems = this.getAllCheckedItems();
		} else if (this.activeItem) {
			// For single-select, use the active item
			this._selectedItems = [this.activeItem];
		} else {
			// No active item, clear selection
			this._selectedItems = [];
		}

		// Fire selection change event first
		this.onDidChangeSelectionEmitter.fire(this._selectedItems);

		// Fire onWillAccept event first (allows for veto, but simplified for now)
		this.onWillAcceptEmitter.fire();

		// Fire onDidAccept event
		this.onDidAcceptEmitter.fire();
	}

	private getAllCheckedItems(): T[] {
		const checkedItems: T[] = [];

		const collectCheckedItems = (items: readonly T[]) => {
			for (const item of items) {
				const children = this.dataSource.getStoredChildren(item);

				if (children.length > 0) {
					// This is a parent node - recurse into children instead of counting the parent
					collectCheckedItems(children);
				} else if (item.checked === true) {
					// This is a leaf node (no children) and it's checked - count it
					checkedItems.push(item);
				}
			}
		};

		collectCheckedItems(this.dataSource.getRoots());
		return checkedItems;
	}

	private updateCheckedCount(): void {
		const checkedCount = this.getAllCheckedItems().length;
		this.onChangedCheckedCountEmitter.fire(checkedCount);
	}

	// IQuickTree implementation

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		if (this._value !== value) {
			this._value = value;
			this.update();
			this.filterTree();
			this.onDidChangeValueEmitter.fire(this._value);
		}
	}

	get ariaLabel(): string | undefined {
		return this._ariaLabel;
	}

	set ariaLabel(ariaLabel: string | undefined) {
		this._ariaLabel = ariaLabel;
		this.update();
	}

	get placeholder(): string | undefined {
		return this._placeholder;
	}

	set placeholder(placeholder: string | undefined) {
		this._placeholder = placeholder;
		this.update();
	}

	readonly onDidChangeValue: Event<string> = this.onDidChangeValueEmitter.event;
	readonly onWillAccept: Event<void> = this.onWillAcceptEmitter.event;
	readonly onDidAccept: Event<void> = this.onDidAcceptEmitter.event;

	get canSelectMany(): boolean {
		return this._canSelectMany;
	}

	set canSelectMany(canSelectMany: boolean) {
		if (this._canSelectMany !== canSelectMany) {
			this._canSelectMany = canSelectMany;
			// Update renderer options
			(this.renderer as any).options.hasCheckbox = canSelectMany;
			this.update();
		}
	}

	get manuallyManageCheckboxes(): boolean {
		return this._manuallyManageCheckboxes;
	}

	set manuallyManageCheckboxes(manuallyManageCheckboxes: boolean) {
		this._manuallyManageCheckboxes = manuallyManageCheckboxes;
	}

	get hideCheckAll(): boolean {
		return this._hideCheckAll;
	}

	set hideCheckAll(hideCheckAll: boolean) {
		if (this._hideCheckAll !== hideCheckAll) {
			this._hideCheckAll = hideCheckAll;
			this.update();
		}
	}

	get matchOnDescription(): boolean {
		return this._matchOnDescription;
	}

	set matchOnDescription(matchOnDescription: boolean) {
		this._matchOnDescription = matchOnDescription;
		this.filterTree();
	}

	get matchOnDetail(): boolean {
		return this._matchOnDetail;
	}

	set matchOnDetail(matchOnDetail: boolean) {
		this._matchOnDetail = matchOnDetail;
		this.filterTree();
	}

	get matchOnLabel(): boolean {
		return this._matchOnLabel;
	}

	set matchOnLabel(matchOnLabel: boolean) {
		this._matchOnLabel = matchOnLabel;
		this.filterTree();
	}

	get sortByLabel(): boolean {
		return this._sortByLabel;
	}

	set sortByLabel(sortByLabel: boolean) {
		this._sortByLabel = sortByLabel;
		this.updateTree();
	}

	get activeItem(): T | undefined {
		return this._activeItem;
	}

	set activeItem(activeItem: T | undefined) {
		if (this._activeItem !== activeItem) {
			this._activeItem = activeItem;
			this.onDidChangeActiveEmitter.fire(this._activeItem);
			// Don't call update() for just activeItem changes as it causes unnecessary tree rebuilds
			// The tree focus will be handled by the tree event handlers
		}
	}

	readonly onDidChangeActive: Event<T | undefined> = this.onDidChangeActiveEmitter.event;

	get selectedItems(): readonly T[] {
		return this._selectedItems;
	}

	set selectedItems(selectedItems: readonly T[]) {
		this._selectedItems = [...selectedItems];
		this.onDidChangeSelectionEmitter.fire(this._selectedItems);
		// Only update UI elements, don't rebuild the tree for selection changes
		this.updateUI();
	}

	readonly onDidChangeSelection: Event<T[]> = this.onDidChangeSelectionEmitter.event;
	readonly onDidChangeCheckboxState: Event<IQuickTreeCheckboxEvent<T>> = this.onDidChangeCheckboxStateEmitter.event;
	readonly onDidChangeExpansion: Event<IQuickTreeExpansionEvent<T>> = this.onDidChangeExpansionEmitter.event;
	readonly onDidLeave: Event<void> = this.onDidLeaveEmitter.event;
	readonly onChangedCheckedCount: Event<number> = this.onChangedCheckedCountEmitter.event;
	readonly onDidTriggerItemButton: Event<IQuickTreeItemButtonEvent<T>> = this.onDidTriggerItemButtonEmitter.event;

	setChildren(parent: T | null, children: readonly T[]): void {
		this.dataSource.setChildren(parent, children);

		// Initialize parent checkboxes for automatic tri-state management
		if (!this.manuallyManageCheckboxes && this.canSelectMany) {
			this.initializeParentCheckboxes();
		}

		// Update checked count when tree structure changes
		this.updateCheckedCount();
	}

	getChildren(parent: T | null): readonly T[] {
		return this.dataSource.getStoredChildren(parent);
	}

	getCheckboxState(element: T): boolean | 'partial' | undefined {
		return element.checked;
	}

	setCheckboxState(element: T, checked: boolean | 'partial'): void {
		if (element.checked !== checked) {
			element.checked = checked;
			this.onDidChangeCheckboxStateEmitter.fire({ item: element, checked });
			this.updateTriStateLogic(element);
			this.updateCheckedCount();
		}
	}

	expand(element: T): void {
		if (!this.tree) {
			return;
		}

		// Let the tree handle the expansion - it will update the state via onDidChangeCollapseState
		this.tree.expand(element);
		this.onDidChangeExpansionEmitter.fire({ item: element, expanded: true });

		// Update layout after expansion as height may change
		setTimeout(() => this.layoutTree(), 0);
	}

	collapse(element: T): void {
		if (!this.tree) {
			return;
		}

		// Let the tree handle the collapse - it will update the state via onDidChangeCollapseState
		this.tree.collapse(element);
		this.onDidChangeExpansionEmitter.fire({ item: element, expanded: false });

		// Update layout after collapse as height may change
		setTimeout(() => this.layoutTree(), 0);
	}

	isExpanded(element: T): boolean {
		return this.tree?.isCollapsed ? !this.tree.isCollapsed(element) : false;
	}

	focusOnInput(): void {
		this.ui.inputBox.setFocus();
	}

	focusOnTree(): void {
		this.focusTree();
	}

	// Lifecycle methods

	override didHide(reason?: any): void {
		this.cleanupTree();
		super.didHide(reason);
	}

	override show(): void {
		super.show();

		// Connect to UI accept events (OK button and ENTER key)
		this.visibleDisposables.add(this.ui.onDidAccept(() => {
			this.handleAccept();
		}));

		// Register input box event handlers
		this.visibleDisposables.add(
			this.ui.inputBox.onDidChange(value => {
				this.handleInputChange(value);
			})
		);

		// Register input box keyboard navigation
		this.visibleDisposables.add(
			this.ui.inputBox.onKeyDown(e => {
				this.handleInputKeyDown(new StandardKeyboardEvent(e.browserEvent));
			})
		);

		// Register checkAll checkbox event
		this.visibleDisposables.add(
			this.ui.checkAll.onChange(() => {
				this.handleCheckAllChange(this.ui.checkAll.checked);
			})
		);

		// Tree will be initialized in update() when needed

		// Fire initial checked count and update checkAll state
		this.updateCheckedCount();
		this.updateCheckAllState();
	}

	override dispose(): void {
		this.cleanupTree();
		super.dispose();
	}

	// Internal methods

	private updateUI(): void {
		if (!this.visible) {
			return;
		}

		// Update UI elements that don't require tree rebuilding
		const hasDescription = !!this.description;
		const visibilities = {
			title: !!this.title || !!this.step || !!this.titleButtons.length,
			description: hasDescription,
			checkAll: this.canSelectMany && !this._hideCheckAll,
			checkBox: this.canSelectMany,
			inputBox: true,
			progressBar: hasDescription,
			visibleCount: true,
			count: this.canSelectMany,
			ok: true,
			list: false,
			message: !!this.validationMessage,
			customButton: false
		};

		this.ui.setVisibilities(visibilities);
		// Don't call super.update() to avoid triggering tree rebuild

		// Update input box values
		if (this.ui.inputBox.value !== this.value) {
			this.ui.inputBox.value = this.value;
		}
		if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
			this.ui.inputBox.placeholder = (this.placeholder || '');
		}
	}

	protected override update(): void {
		if (!this.visible) {
			return;
		}

		const hasDescription = !!this.description;
		const visibilities = {
			title: !!this.title || !!this.step || !!this.titleButtons.length,
			description: hasDescription,
			checkAll: this.canSelectMany && !this._hideCheckAll,
			checkBox: this.canSelectMany,
			inputBox: true, // Always show input for filtering
			progressBar: hasDescription,
			visibleCount: true,
			count: this.canSelectMany,
			ok: true,
			list: false, // Hide the original list component
			message: !!this.validationMessage,
			customButton: false
		};

		this.ui.setVisibilities(visibilities);
		super.update();

		// Hide the original list and show our tree container
		if (this.ui.list) {
			this.ui.list.displayed = false;
		}
		if (this.treeContainer) {
			this.treeContainer.style.display = '';
		}

		// Update input box
		if (this.ui.inputBox.value !== this.value) {
			this.ui.inputBox.value = this.value;
		}
		if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
			this.ui.inputBox.placeholder = (this.placeholder || '');
		}

		// Update aria label
		let ariaLabel = this.ariaLabel;
		if (!ariaLabel) {
			ariaLabel = this.placeholder || QuickTree.DEFAULT_ARIA_LABEL;
			if (this.title) {
				ariaLabel += ` - ${this.title}`;
			}
		}

		// Initialize tree if needed (always initialize since we're replacing the list)
		if (!this.tree) {
			this.initializeTree();
		}

		// Update tree if it exists
		if (this.tree) {
			this.updateTree();
		}
	}

	private initializeTree(): void {
		// Create tree container alongside existing UI components
		if (!this.treeContainer) {
			// Get the main container element from the UI
			const mainContainer = this.ui.container;
			if (!mainContainer) {
				return;
			}

			// Create tree container with proper CSS classes to match list positioning and enable tree styling
			this.treeContainer = dom.append(mainContainer, $('.quick-tree-container.show-file-icons'));
			// Add tree-specific classes for proper twistie rendering (like Explorer does)
			this.treeContainer.classList.add('monaco-tree-wrapper', 'monaco-workbench-tree');
		}

		const treeContainer = this.treeContainer;

		// Initialize WorkbenchObjectTree
		this.tree = this.instantiationService.createInstance(
			WorkbenchObjectTree<T, void>,
			'QuickTree',
			treeContainer,
			this.delegate,
			[this.renderer],
			{
				accessibilityProvider: this.accessibilityProvider,
				identityProvider: {
					// TODO: math.random is suspicious here
					getId: (element: T) => element.id || element.label || Math.random().toString()
				},
				filter: this.createTreeFilter(),
				sorter: this.sortByLabel ? this.createTreeSorter() : undefined,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: true,
				hideTwistiesOfChildlessElements: true
			}
		);

		this._register(this.tree);

		// Setup tree event handlers
		this.setupTreeEventHandlers();

		// Listen to tree's built-in expand/collapse events to keep our items in sync
		// But only update if the state actually changed to prevent feedback loops
		this._register(this.tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			const isExpanded = !e.node.collapsed;

			if (element) {
				const newState = isExpanded
					? TreeItemCollapsibleState.Expanded
					: TreeItemCollapsibleState.Collapsed;

				// Only update if the state actually changed to prevent feedback loops
				if (element.collapsibleState !== newState) {
					element.collapsibleState = newState;

					// Tree automatically handles twistie visual updates

					// Update layout when collapse state changes to resize container
					setTimeout(() => this.layoutTree(), 0);
				}
			}
		}));

		// Setup tree layout management
		this.setupTreeLayout();

		// Trigger initial layout
		setTimeout(() => this.layoutTree(), 50);
	}

	private setupTreeLayout(): void {
		// Tree layout is handled independently, but we need to respond to UI layout changes
		// Register for UI layout events if needed
		if (this.treeContainer) {
			// Initial sizing based on UI constraints
			this.layoutTree();
		}
	}

	private cleanupTree(): void {
		if (this.tree) {
			this.tree.dispose();
			this.tree = undefined;
		}
		if (this.treeContainer) {
			this.treeContainer.remove();
			this.treeContainer = undefined;
		}
	}

	private layoutTree(maxHeight?: number): void {
		if (!this.tree || !this.treeContainer) {
			return;
		}

		const treeElement = this.tree.getHTMLElement();

		if (maxHeight && maxHeight > 0) {
			// Use provided maxHeight (similar to how UI list handles layout)
			const itemHeight = 22;
			const minHeight = itemHeight * 3;
			const finalHeight = Math.max(maxHeight, minHeight);

			// Apply sizing to both container and tree
			this.treeContainer.style.maxHeight = `${finalHeight}px`;
			treeElement.style.maxHeight = `${finalHeight}px`;
			treeElement.style.height = '';
			this.tree.layout();
		} else {
			// Content-based sizing with limits similar to quick-input-list
			const itemCount = this.getVisibleItemCount();
			const itemHeight = 22;
			const calculatedHeight = itemCount * itemHeight; // No minimum height
			const maxCalculatedHeight = itemHeight * 20; // Match list's 20-item limit
			const finalHeight = Math.min(calculatedHeight, maxCalculatedHeight);

			// Apply sizing to container to match list behavior
			this.treeContainer.style.height = `${finalHeight}px`;
			this.treeContainer.style.maxHeight = `${maxCalculatedHeight}px`;
			treeElement.style.height = `${finalHeight}px`;
			treeElement.style.maxHeight = `${maxCalculatedHeight}px`;
			this.tree.layout(finalHeight);
		}
	}

	private getVisibleItemCount(): number {
		if (!this.tree) {
			return 3;
		}

		// Count only visible (non-filtered) items
		let count = 0;
		const roots = this.dataSource.getRoots();

		const countVisibleItems = (items: readonly T[]) => {
			for (const item of items) {
				// Check if item passes the current filter
				if (this.isItemVisible(item)) {
					count++;
					// Only count expanded children if parent is visible and expanded
					if (item.collapsibleState === TreeItemCollapsibleState.Expanded) {
						const children = this.dataSource.getStoredChildren(item);
						if (children.length > 0) {
							countVisibleItems(children);
						}
					}
				}
			}
		};

		countVisibleItems(roots);
		return count; // No minimum height - shrink to actual content
	}

	private isItemVisible(item: T): boolean {
		if (!this.value || this.value.trim() === '') {
			return true; // No filter, all items visible
		}

		// Use the same logic as the tree filter
		return this.createTreeFilter().filter(item);
	}

	private setupTreeEventHandlers(): void {
		if (!this.tree) {
			return;
		}

		// Selection changes
		this._register(this.tree.onDidChangeFocus(e => {
			if (e.elements.length > 0) {
				const firstElement = e.elements[0];
				if (firstElement !== null && firstElement !== undefined) {
					this.activeItem = firstElement;
				}
			}
		}));

		this._register(this.tree.onDidChangeSelection(e => {
			this.selectedItems = e.elements.filter((el): el is T => el !== null && el !== undefined);
		}));

		// Keyboard navigation
		this._register(this.tree.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			this.handleTreeKeyDown(event);
		}));

		// Handle double-clicks and Enter key for acceptance
		this._register(this.tree.onDidOpen(e => {
			if (e.element) {
				if (!this.canSelectMany) {
					// In single-select mode, double-click accepts the selection
					this.onDidAcceptEmitter.fire();
				}
			}
		}));

		// Handle mouse clicks on tree items for checkbox toggling
		this._register(this.tree.onMouseClick(e => {
			// Only handle clicks on the element content, not the twistie
			if (e.target === TreeMouseEventTarget.Element && e.element && this.canSelectMany) {
				// Check if the click was on the checkbox element itself - if so, don't handle it
				// The checkbox component will handle its own clicks
				const target = e.browserEvent.target as HTMLElement;

				if (target && (target.classList.contains('monaco-checkbox') || target.closest('.monaco-checkbox'))) {
					return; // Let the checkbox handle its own click
				}

				this.toggleCheckbox(e.element);
			}
		}));
	}

	private handleInputKeyDown(event: StandardKeyboardEvent): void {
		switch (event.keyCode) {
			case KeyCode.DownArrow:
				if (this.tree && this.ui.inputBox.isSelectionAtEnd()) {
					// Move focus to the tree
					event.preventDefault();
					event.stopPropagation();
					this.focusTree();
				}
				break;
		}
	}

	private handleTreeKeyDown(event: StandardKeyboardEvent): void {
		switch (event.keyCode) {
			case KeyCode.Enter:
				this.handleAccept();
				event.stopPropagation();
				event.preventDefault();
				break;
			case KeyCode.Space:
				if (this.canSelectMany && this.activeItem) {
					this.toggleCheckbox(this.activeItem);
					event.stopPropagation();
					event.preventDefault();
				}
				break;
			case KeyCode.UpArrow: {
				// Only handle if we're at the very top
				const focusedElements = this.tree?.getFocus();
				if (focusedElements && focusedElements.length > 0) {
					// Check if this is the first visible item by trying a non-destructive check
					const roots = this.dataSource.getRoots();
					const firstVisible = roots.find(item => this.isItemVisible(item));
					if (firstVisible && focusedElements[0] === firstVisible) {
						event.preventDefault();
						event.stopPropagation();
						this.onDidLeaveEmitter.fire();
					}
				}
				break;
			}
			case KeyCode.DownArrow:
				// Don't interfere with down arrow - let tree handle it
				break;
		}
	}

	private updateTree(): void {
		if (!this.tree) {
			return;
		}

		// Preserve focus before updating
		const focusedElements = this.tree.getFocus();

		const roots = this.dataSource.getRoots();
		const elements = this.buildTreeElements(roots);
		this.tree.setChildren(null, elements);

		// Update checked count after tree update
		this.updateCheckedCount();

		// Restore focus if it was lost
		if (focusedElements.length > 0 && this.tree.getFocus().length === 0) {
			// Try to find the same element in the updated tree
			const elementToFocus = focusedElements[0];
			if (elementToFocus) {
				this.tree.setFocus([elementToFocus]);
			}
		}
	}

	private buildTreeElements(items: readonly T[]): IObjectTreeElement<T>[] {
		return items.map(item => {
			const children = this.dataSource.getStoredChildren(item);
			const hasChildren = children.length > 0;
			const isCollapsible = item.collapsibleState !== TreeItemCollapsibleState.None;
			const isCollapsed = item.collapsibleState === TreeItemCollapsibleState.Collapsed;


			return {
				element: item,
				children: hasChildren ? this.buildTreeElements(children) : undefined,
				collapsible: isCollapsible,
				collapsed: isCollapsed
			};
		});
	}

	private filterTree(): void {
		if (!this.tree) {
			return;
		}

		this.tree.refilter();
		this.layoutTree();
	}

	private createTreeFilter() {
		return {
			filter: (element: T): boolean => {
				if (!this.value || this.value.trim() === '') {
					return true;
				}

				const searchTerm = this.value.toLowerCase();
				let matches = false;

				// Check if element matches
				if (this.matchOnLabel && element.label?.toLowerCase().includes(searchTerm)) {
					matches = true;
				}
				if (this.matchOnDescription && element.description?.toLowerCase().includes(searchTerm)) {
					matches = true;
				}
				if (this.matchOnDetail && element.detail?.toLowerCase().includes(searchTerm)) {
					matches = true;
				}

				// Check if any children match (show parent if child matches)
				if (!matches) {
					const children = this.dataSource.getStoredChildren(element);
					matches = children.some(child => this.elementMatches(child, searchTerm));
				}

				return matches;
			}
		};
	}

	private elementMatches(element: T, searchTerm: string): boolean {
		let matches = false;

		if (this.matchOnLabel && element.label?.toLowerCase().includes(searchTerm)) {
			matches = true;
		}
		if (this.matchOnDescription && element.description?.toLowerCase().includes(searchTerm)) {
			matches = true;
		}
		if (this.matchOnDetail && element.detail?.toLowerCase().includes(searchTerm)) {
			matches = true;
		}

		// Recursively check children
		if (!matches) {
			const children = this.dataSource.getStoredChildren(element);
			matches = children.some(child => this.elementMatches(child, searchTerm));
		}

		return matches;
	}

	private createTreeSorter() {
		return {
			compare: (a: T, b: T): number => {
				return (a.label || '').localeCompare(b.label || '');
			}
		};
	}


	private toggleCheckbox(element: T): void {
		const currentState = element.checked;
		const newState = currentState === true ? false : true;


		if (!this.tree) {
			return;
		}

		// Save current scroll position
		const scrollTop = this.tree.scrollTop;

		// Update checkbox state
		element.checked = newState;
		this.onDidChangeCheckboxStateEmitter.fire({ item: element, checked: newState });


		// Handle FULL tri-state logic (both up and down propagation)
		this.updateTriStateLogic(element);

		// Update checked count
		this.updateCheckedCount();

		// Restore scroll position after a minimal delay
		setTimeout(() => {
			if (this.tree) {
				// Re-render the clicked element
				this.tree.rerender(element);

				// Re-render all parent elements up the chain
				let parent = this.dataSource.getParentElement(element);
				while (parent) {
					this.tree.rerender(parent);
					parent = this.dataSource.getParentElement(parent);
				}

				// Re-render all children elements down the chain
				this.reRenderChildren(element);

				this.tree.scrollTop = scrollTop;
			}
		}, 0);
	}

	private reRenderChildren(element: T): void {
		if (!this.tree) {
			return;
		}

		const children = this.dataSource.getStoredChildren(element);
		for (const child of children) {
			this.tree.rerender(child);
			// Recursively re-render grandchildren
			this.reRenderChildren(child);
		}
	}

	private handleCheckboxChange(element: T, checked: boolean): void {
		if (!this.tree) {
			return;
		}

		// Save current scroll position
		const scrollTop = this.tree.scrollTop;

		// Update checkbox state
		element.checked = checked;
		this.onDidChangeCheckboxStateEmitter.fire({ item: element, checked });

		// Handle tri-state logic
		this.updateTriStateLogic(element);

		// Update checked count and checkAll state
		this.updateCheckedCount();
		this.updateCheckAllState();

		// Restore scroll position after a minimal delay
		setTimeout(() => {
			if (this.tree) {
				// Element-specific re-render is what actually updates the checkbox visual state
				this.tree.rerender(element);

				// Also re-render all parent elements up the chain since tri-state logic may have changed them
				let parent = this.dataSource.getParentElement(element);
				while (parent) {
					this.tree.rerender(parent);
					parent = this.dataSource.getParentElement(parent);
				}

				// Also re-render all children elements down the chain since tri-state logic may have changed them
				this.reRenderChildren(element);

				this.tree.scrollTop = scrollTop;
			}
		}, 0);
	}

	private updateTriStateLogic(element: T): void {
		if (!this.canSelectMany || this.manuallyManageCheckboxes) {
			return;
		}

		// Prevent cascading loops by tracking which elements we're currently updating
		if ((element as any)._updatingTriState) {
			return;
		}

		try {
			(element as any)._updatingTriState = true;

			// Update children state if parent was changed
			const children = this.dataSource.getStoredChildren(element);
			if (children.length > 0 && element.checked !== 'partial') {
				this.updateChildrenCheckboxState(element, children, true);
			}

			// Update parent state based on children
			const parent = this.dataSource.getParentElement(element);
			if (parent) {
				this.updateParentCheckboxState(parent, true);
			}
		} finally {
			delete (element as any)._updatingTriState;
		}
	}

	private updateParentCheckboxState(parent: T, suppressEvents: boolean = false): void {
		const children = this.dataSource.getStoredChildren(parent);

		// Only manage parent state if it has checkable children
		const checkableChildren = children.filter(child => child.checked !== undefined);
		if (checkableChildren.length === 0) {
			return;
		}

		// Initialize parent checkbox if it's undefined but has checkable children
		if (parent.checked === undefined && checkableChildren.length > 0) {
			parent.checked = false; // Start with unchecked state
		}

		const checkedChildren = children.filter(child => child.checked === true);
		const partialChildren = children.filter(child => child.checked === 'partial');

		let newState: boolean | 'partial';
		if (checkedChildren.length === children.length && checkedChildren.length > 0) {
			newState = true;
		} else if (checkedChildren.length === 0 && partialChildren.length === 0) {
			newState = false;
		} else {
			newState = 'partial';
		}

		if (parent.checked !== newState) {
			parent.checked = newState;
			// Only fire events for the directly changed element, not cascaded changes
			if (!suppressEvents) {
				this.onDidChangeCheckboxStateEmitter.fire({ item: parent, checked: newState });
			}
			// Continue propagating up the tree
			const grandparent = this.dataSource.getParentElement(parent);
			if (grandparent) {
				this.updateParentCheckboxState(grandparent, suppressEvents);
			}
		}
	}

	private updateChildrenCheckboxState(parent: T, children: readonly T[], suppressEvents: boolean = false): void {
		const parentState = parent.checked;
		if (parentState === 'partial') {
			return;
		}

		for (const child of children) {
			if (child.checked !== parentState && parentState !== undefined) {
				child.checked = parentState;
				// Only fire events for the directly changed element, not cascaded changes
				if (!suppressEvents) {
					this.onDidChangeCheckboxStateEmitter.fire({ item: child, checked: parentState });
				}

				// Recursively update grandchildren
				const grandchildren = this.dataSource.getStoredChildren(child);
				if (grandchildren.length > 0) {
					this.updateChildrenCheckboxState(child, grandchildren, suppressEvents);
				}
			}
		}
	}

	private initializeParentCheckboxes(): void {
		// Walk through all items and initialize parent checkboxes if they have checkable children
		const processElements = (elements: readonly T[]) => {
			for (const element of elements) {
				const children = this.dataSource.getStoredChildren(element);
				if (children.length > 0) {
					// Recursively process children first
					processElements(children);

					// Then initialize parent if it has checkable children
					const checkableChildren = children.filter(child => child.checked !== undefined);
					if (checkableChildren.length > 0 && element.checked === undefined) {
						// Initialize parent checkbox state based on children
						this.updateParentCheckboxState(element, true); // suppressEvents = true for initialization
					}
				}
			}
		};

		const roots = this.dataSource.getRoots();
		processElements(roots);
	}

	private handleCheckAllChange(checked: boolean): void {
		if (!this.canSelectMany || this.manuallyManageCheckboxes) {
			return;
		}

		// Get all visible items in the tree (respecting filters)
		const allItems = this.getAllVisibleItems();

		// Set all visible items to the checkAll state
		for (const item of allItems) {
			if (item.checked !== undefined) {
				item.checked = checked;
				// Don't fire individual events - we'll fire them in batch
			}
		}

		// Fire checkbox state change events for all affected items
		for (const item of allItems) {
			if (item.checked !== undefined) {
				this.onDidChangeCheckboxStateEmitter.fire({ item, checked });
			}
		}

		// Update the tree rendering
		this.updateTree();
		this.updateCheckedCount();
		this.updateCheckAllState();
	}

	private updateCheckAllState(): void {
		if (!this.canSelectMany || this._hideCheckAll) {
			return;
		}

		const allItems = this.getAllVisibleItems();
		const checkableItems = allItems.filter(item => item.checked !== undefined);

		if (checkableItems.length === 0) {
			// No checkable items - hide checkAll or set to unchecked
			this.ui.checkAll.checked = false;
			return;
		}

		const checkedItems = checkableItems.filter(item => item.checked === true);
		const partialItems = checkableItems.filter(item => item.checked === 'partial');

		if (checkedItems.length === checkableItems.length) {
			// All items checked
			this.ui.checkAll.checked = true;
			this.ui.checkAll.domNode.classList.remove('partial');
		} else if (checkedItems.length === 0 && partialItems.length === 0) {
			// No items checked
			this.ui.checkAll.checked = false;
			this.ui.checkAll.domNode.classList.remove('partial');
		} else {
			// Mixed state - some checked, some not (partial state like tree checkboxes)
			this.ui.checkAll.checked = false; // Don't show as checked
			this.ui.checkAll.domNode.classList.add('partial');
		}
	}

	private getAllVisibleItems(): T[] {
		const allItems: T[] = [];

		const collectItems = (items: readonly T[]) => {
			for (const item of items) {
				if (this.isItemVisible(item)) {
					allItems.push(item);
				}
				const children = this.dataSource.getStoredChildren(item);
				if (children.length > 0) {
					collectItems(children);
				}
			}
		};

		const roots = this.dataSource.getRoots();
		collectItems(roots);
		return allItems;
	}

	private focusTree(): void {
		if (!this.tree) {
			return;
		}

		// First, ensure an item is focused
		const focusedElements = this.tree.getFocus();
		if (focusedElements.length === 0) {
			// Use focusFirst to focus the first visible item, similar to QuickInputTree
			this.tree.focusFirst(undefined, (e) => {
				// Filter to only focus items that are visible and not filtered out
				if (!e.element) {
					return false;
				}
				const isVisible = this.isItemVisible(e.element);
				return isVisible;
			});
		}

		// Then focus the tree DOM element - this will focus the focused item
		this.tree.domFocus();
	}


}
