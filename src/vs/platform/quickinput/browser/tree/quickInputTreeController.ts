/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../list/browser/listService.js';
import { IQuickTreeCheckboxEvent, IQuickTreeItem, IQuickTreeItemButtonEvent, QuickPickFocus } from '../../common/quickInput.js';
import { QuickInputTreeDelegate } from './quickInputDelegate.js';
import { getParentNodeState, IQuickTreeFilterData } from './quickInputTree.js';
import { QuickTreeAccessibilityProvider } from './quickInputTreeAccessibilityProvider.js';
import { QuickInputTreeFilter } from './quickInputTreeFilter.js';
import { QuickInputCheckboxStateHandler, QuickInputTreeRenderer } from './quickInputTreeRenderer.js';
import { QuickInputTreeSorter } from './quickInputTreeSorter.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';

const $ = dom.$;
const flatHierarchyClass = 'quick-input-tree-flat';

class QuickInputTreeIdentityProvider implements IIdentityProvider<IQuickTreeItem> {
	private readonly _elementIds = new WeakMap<IQuickTreeItem, string>();
	private _counter = 0;

	getId(element: IQuickTreeItem): { toString(): string } {
		let id = element.id;
		if (id !== undefined) {
			return id;
		}

		id = this._elementIds.get(element);
		if (id !== undefined) {
			return id;
		}

		id = `__generated_${this._counter++}`;
		this._elementIds.set(element, id);
		return id;
	}
}

export class QuickInputTreeController extends Disposable {
	private readonly _renderer: QuickInputTreeRenderer<IQuickTreeItem>;
	private readonly _checkboxStateHandler: QuickInputCheckboxStateHandler<IQuickTreeItem>;
	private readonly _filter: QuickInputTreeFilter;
	private readonly _sorter: QuickInputTreeSorter;
	private readonly _tree: WorkbenchObjectTree<IQuickTreeItem, IQuickTreeFilterData>;

	private readonly _onDidTriggerButton = this._register(new Emitter<IQuickTreeItemButtonEvent<IQuickTreeItem>>());
	readonly onDidTriggerButton = this._onDidTriggerButton.event;

	private readonly _onDidChangeCheckboxState = this._register(new Emitter<IQuickTreeCheckboxEvent<IQuickTreeItem>>());
	readonly onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;

	private readonly _onDidCheckedLeafItemsChange = this._register(new Emitter<ReadonlyArray<IQuickTreeItem>>());
	readonly onDidChangeCheckedLeafItems = this._onDidCheckedLeafItemsChange.event;

	private readonly _onLeave = new Emitter<void>();
	/**
	 * Event that is fired when the tree would no longer have focus.
	*/
	readonly onLeave: Event<void> = this._onLeave.event;

	private readonly _onDidAccept = this._register(new Emitter<void>());
	/**
	 * Event that is fired when a non-pickable item is clicked, indicating acceptance.
	 */
	readonly onDidAccept: Event<void> = this._onDidAccept.event;

	private readonly _container: HTMLElement;

	constructor(
		container: HTMLElement,
		hoverDelegate: IHoverDelegate | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._container = dom.append(container, $('.quick-input-tree'));
		this._checkboxStateHandler = this._register(new QuickInputCheckboxStateHandler<IQuickTreeItem>());
		this._renderer = this._register(this.instantiationService.createInstance(
			QuickInputTreeRenderer,
			hoverDelegate,
			this._onDidTriggerButton,
			this.onDidChangeCheckboxState,
			this._checkboxStateHandler,
		));
		this._filter = this.instantiationService.createInstance(QuickInputTreeFilter);
		this._sorter = this._register(new QuickInputTreeSorter());
		this._tree = this._register(this.instantiationService.createInstance(
			WorkbenchObjectTree<IQuickTreeItem, IQuickTreeFilterData>,
			'QuickInputTree',
			this._container,
			new QuickInputTreeDelegate(),
			[this._renderer],
			{
				accessibilityProvider: new QuickTreeAccessibilityProvider(this.onDidChangeCheckboxState),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				findWidgetEnabled: false,
				alwaysConsumeMouseWheel: true,
				hideTwistiesOfChildlessElements: true,
				renderIndentGuides: RenderIndentGuides.None,
				expandOnDoubleClick: true,
				expandOnlyOnTwistieClick: true,
				disableExpandOnSpacebar: true,
				sorter: this._sorter,
				filter: this._filter,
				identityProvider: new QuickInputTreeIdentityProvider()
			}
		));
		this.registerCheckboxStateListeners();
		this.registerOnDidChangeFocus();
	}

	get tree(): WorkbenchObjectTree<IQuickTreeItem, IQuickTreeFilterData> {
		return this._tree;
	}

	get renderer(): QuickInputTreeRenderer<IQuickTreeItem> {
		return this._renderer;
	}

	get displayed() {
		return this._container.style.display !== 'none';
	}

	set displayed(value: boolean) {
		this._container.style.display = value ? '' : 'none';
	}

	get sortByLabel() {
		return this._sorter.sortByLabel;
	}

	set sortByLabel(value: boolean) {
		this._sorter.sortByLabel = value;
		this._tree.resort(null, true);
	}

	getActiveDescendant() {
		return this._tree.getHTMLElement().getAttribute('aria-activedescendant');
	}

	filter(input: string): void {
		this._filter.filterValue = input;
		this._tree.refilter();
	}

	updateFilterOptions(options: {
		matchOnLabel?: boolean;
		matchOnDescription?: boolean;
	}): void {
		if (options.matchOnLabel !== undefined) {
			this._filter.matchOnLabel = options.matchOnLabel;
		}
		if (options.matchOnDescription !== undefined) {
			this._filter.matchOnDescription = options.matchOnDescription;
		}
		this._tree.refilter();
	}

	setTreeData(treeData: readonly IQuickTreeItem[]): void {
		let hasNestedItems = false;
		const createTreeElement = (item: IQuickTreeItem): IObjectTreeElement<IQuickTreeItem> => {
			let children: IObjectTreeElement<IQuickTreeItem>[] | undefined;
			if (item.children && item.children.length > 0) {
				hasNestedItems = true;
				children = item.children.map(child => createTreeElement(child));
				item.checked = getParentNodeState(children);
			}
			return {
				element: item,
				children,
				collapsible: !!children,
				collapsed: item.collapsed ?
					ObjectTreeElementCollapseState.PreserveOrCollapsed :
					ObjectTreeElementCollapseState.PreserveOrExpanded
			};
		};

		const treeElements = treeData.map(item => createTreeElement(item));
		this._tree.setChildren(null, treeElements);
		this._container.classList.toggle(flatHierarchyClass, !hasNestedItems);
	}

	layout(maxHeight?: number): void {
		this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${
			// Make sure height aligns with list item heights
			Math.floor(maxHeight / 44) * 44
			// Add some extra height so that it's clear there's more to scroll
			+ 6
			}px` : '';
		this._tree.layout();
	}

	focus(what: QuickPickFocus): void {
		switch (what) {
			case QuickPickFocus.First:
				this._tree.scrollTop = 0;
				this._tree.focusFirst();
				break;
			case QuickPickFocus.Second: {
				this._tree.scrollTop = 0;
				let isSecondItem = false;
				this._tree.focusFirst(undefined, (e) => {
					if (isSecondItem) {
						return true;
					}
					isSecondItem = !isSecondItem;
					return false;
				});
				break;
			}
			case QuickPickFocus.Last:
				this._tree.scrollTop = this._tree.scrollHeight;
				this._tree.focusLast();
				break;
			case QuickPickFocus.Next: {
				const prevFocus = this._tree.getFocus();
				this._tree.focusNext(undefined, false, undefined, (e) => {
					this._tree.reveal(e.element);
					return true;
				});
				const currentFocus = this._tree.getFocus();
				if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
					this._onLeave.fire();
				}
				break;
			}
			case QuickPickFocus.Previous: {
				const prevFocus = this._tree.getFocus();
				this._tree.focusPrevious(undefined, false, undefined, (e) => {
					// do we want to reveal the parent?
					this._tree.reveal(e.element);
					return true;
				});
				const currentFocus = this._tree.getFocus();
				if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
					this._onLeave.fire();
				}
				break;
			}
			case QuickPickFocus.NextPage:
				this._tree.focusNextPage(undefined, (e) => {
					this._tree.reveal(e.element);
					return true;
				});
				break;
			case QuickPickFocus.PreviousPage:
				this._tree.focusPreviousPage(undefined, (e) => {
					// do we want to reveal the parent?
					this._tree.reveal(e.element);
					return true;
				});
				break;
			case QuickPickFocus.NextSeparator:
			case QuickPickFocus.PreviousSeparator:
				// These don't make sense for the tree
				return;
		}
	}

	registerCheckboxStateListeners() {
		this._register(this._tree.onDidOpen(e => {
			const item = e.element;
			if (!item) {
				return;
			}

			if (item.disabled) {
				return;
			}

			// Check if the item is pickable (defaults to true if not specified)
			if (item.pickable === false) {
				// For non-pickable items, set it as the active item and fire the accept event
				this._tree.setFocus([item]);
				this._onDidAccept.fire();
				return;
			}

			const target = e.browserEvent?.target as HTMLElement | undefined;
			if (target && target.classList.contains(Checkbox.CLASS_NAME)) {
				return;
			}

			this.updateCheckboxState(item, item.checked === true);
		}));

		this._register(this._checkboxStateHandler.onDidChangeCheckboxState(e => {
			this.updateCheckboxState(e.item, e.checked === true);
		}));
	}

	private updateCheckboxState(item: IQuickTreeItem, newState: boolean): void {
		if ((item.checked ?? false) === newState) {
			return; // No change
		}

		// Handle checked item
		item.checked = newState;
		this._tree.rerender(item);

		// Handle children of the checked item
		const updateSet = new Set<IQuickTreeItem>();
		const toUpdate = [...this._tree.getNode(item).children];
		while (toUpdate.length) {
			const pop = toUpdate.shift();
			if (pop?.element && !updateSet.has(pop.element)) {
				updateSet.add(pop.element);
				if ((pop.element.checked ?? false) !== item.checked) {
					pop.element.checked = item.checked;
					this._tree.rerender(pop.element);
				}
				toUpdate.push(...pop.children);
			}
		}

		// Handle parents of the checked item
		let parent = this._tree.getParentElement(item);
		while (parent) {
			const parentChildren = [...this._tree.getNode(parent).children];
			const newState = getParentNodeState(parentChildren);

			if ((parent.checked ?? false) !== newState) {
				parent.checked = newState;
				this._tree.rerender(parent);
			}
			parent = this._tree.getParentElement(parent);
		}

		this._onDidChangeCheckboxState.fire({
			item,
			checked: item.checked ?? false
		});
		this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
	}

	registerOnDidChangeFocus() {
		// Ensure that selection follows focus
		this._register(this._tree.onDidChangeFocus(e => {
			const item = this._tree.getFocus().findLast(item => item !== null);
			this._tree.setSelection(item ? [item] : [], e.browserEvent);
		}));
	}

	getCheckedLeafItems() {
		const lookedAt = new Set<IQuickTreeItem>();
		const toLookAt = [...this._tree.getNode().children];
		const checkedItems = new Array<IQuickTreeItem>();
		while (toLookAt.length) {
			const lookAt = toLookAt.shift();
			if (!lookAt?.element || lookedAt.has(lookAt.element)) {
				continue;
			}
			if (lookAt.element.checked) {
				lookedAt.add(lookAt.element);
				toLookAt.push(...lookAt.children);
				if (!lookAt.element.children) {
					checkedItems.push(lookAt.element);
				}
			}
		}
		return checkedItems;
	}

	getActiveItems(): readonly IQuickTreeItem[] {
		return this._tree.getFocus().filter((item): item is IQuickTreeItem => item !== null);
	}

	check(element: IQuickTreeItem, checked: boolean | 'mixed') {
		if (element.checked === checked) {
			return;
		}
		element.checked = checked;
		this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
	}

	checkAll(checked: boolean | 'mixed') {
		const updated = new Set<IQuickTreeItem>();
		const toUpdate = [...this._tree.getNode().children];
		let fireCheckedChangeEvent = false;
		while (toUpdate.length) {
			const update = toUpdate.shift();
			if (!update?.element || updated.has(update.element)) {
				continue;
			}
			if (update.element.checked !== checked) {
				fireCheckedChangeEvent = true;
				update.element.checked = checked;
				toUpdate.push(...update.children);
				updated.add(update.element);
				this._tree.rerender(update.element);
				this._onDidChangeCheckboxState.fire({
					item: update.element,
					checked: update.element.checked
				});
			}
		}
		if (fireCheckedChangeEvent) {
			this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
		}
	}
}
