/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../list/browser/listService.js';
import { QuickPickFocus } from '../../common/quickInput.js';
import { QuickInputTreeDelegate } from './quickInputDelegate.js';
import { getParentNodeState } from './quickInputTree.js';
import { QuickTreeAccessibilityProvider } from './quickInputTreeAccessibilityProvider.js';
import { QuickInputTreeFilter } from './quickInputTreeFilter.js';
import { QuickInputCheckboxStateHandler, QuickInputTreeRenderer } from './quickInputTreeRenderer.js';
import { QuickInputTreeSorter } from './quickInputTreeSorter.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
const $ = dom.$;
const flatHierarchyClass = 'quick-input-tree-flat';
class QuickInputTreeIdentityProvider {
    constructor() {
        this._elementIds = new WeakMap();
        this._counter = 0;
    }
    getId(element) {
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
let QuickInputTreeController = class QuickInputTreeController extends Disposable {
    constructor(container, hoverDelegate, styles, instantiationService) {
        super();
        this.instantiationService = instantiationService;
        this._onDidTriggerButton = this._register(new Emitter());
        this.onDidTriggerButton = this._onDidTriggerButton.event;
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
        this._onDidCheckedLeafItemsChange = this._register(new Emitter());
        this.onDidChangeCheckedLeafItems = this._onDidCheckedLeafItemsChange.event;
        this._onLeave = this._register(new Emitter());
        /**
         * Event that is fired when the tree would no longer have focus.
        */
        this.onLeave = this._onLeave.event;
        this._onDidAccept = this._register(new Emitter());
        /**
         * Event that is fired when a non-pickable item is clicked, indicating acceptance.
         */
        this.onDidAccept = this._onDidAccept.event;
        this._container = dom.append(container, $('.quick-input-tree'));
        this._checkboxStateHandler = this._register(new QuickInputCheckboxStateHandler());
        this._renderer = this._register(this.instantiationService.createInstance(QuickInputTreeRenderer, hoverDelegate, this._onDidTriggerButton, this.onDidChangeCheckboxState, this._checkboxStateHandler, styles.toggle));
        this._filter = this.instantiationService.createInstance(QuickInputTreeFilter);
        this._sorter = this._register(new QuickInputTreeSorter());
        this._tree = this._register(this.instantiationService.createInstance((WorkbenchObjectTree), 'QuickInputTree', this._container, new QuickInputTreeDelegate(), [this._renderer], {
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
        }));
        this._register(this._renderer.onDidDisposeFocusedElement(() => {
            this._tree.domFocus();
        }));
        this.registerCheckboxStateListeners();
        this.registerOnDidChangeFocus();
    }
    get tree() {
        return this._tree;
    }
    get renderer() {
        return this._renderer;
    }
    get displayed() {
        return this._container.style.display !== 'none';
    }
    set displayed(value) {
        this._container.style.display = value ? '' : 'none';
    }
    get sortByLabel() {
        return this._sorter.sortByLabel;
    }
    set sortByLabel(value) {
        this._sorter.sortByLabel = value;
        this._tree.resort(null, true);
    }
    getActiveDescendant() {
        return this._tree.getHTMLElement().getAttribute('aria-activedescendant');
    }
    filter(input) {
        this._filter.filterValue = input;
        this._tree.refilter();
    }
    updateFilterOptions(options) {
        if (options.matchOnLabel !== undefined) {
            this._filter.matchOnLabel = options.matchOnLabel;
        }
        if (options.matchOnDescription !== undefined) {
            this._filter.matchOnDescription = options.matchOnDescription;
        }
        this._tree.refilter();
    }
    setTreeData(treeData) {
        let hasNestedItems = false;
        const createTreeElement = (item) => {
            let children;
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
    layout(maxHeight) {
        this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${
        // Make sure height aligns with list item heights
        Math.floor(maxHeight / 44) * 44
            // Add some extra height so that it's clear there's more to scroll
            + 6}px` : '';
        this._tree.layout();
    }
    focus(what) {
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
            const target = e.browserEvent?.target;
            if (target && target.classList.contains(Checkbox.CLASS_NAME)) {
                return;
            }
            this.updateCheckboxState(item, item.checked === true);
        }));
        this._register(this._checkboxStateHandler.onDidChangeCheckboxState(e => {
            this.updateCheckboxState(e.item, e.checked === true, true);
            this._tree.setFocus([e.item]);
            this._tree.setSelection([e.item]);
        }));
    }
    updateCheckboxState(item, newState, skipItemRerender = false) {
        if ((item.checked ?? false) === newState) {
            return; // No change
        }
        // Handle checked item
        item.checked = newState;
        if (!skipItemRerender) {
            this._tree.rerender(item);
        }
        // Handle children of the checked item
        const updateSet = new Set();
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
        const lookedAt = new Set();
        const toLookAt = [...this._tree.getNode().children];
        const checkedItems = new Array();
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
    getActiveItems() {
        return this._tree.getFocus().filter((item) => item !== null);
    }
    toggleCheckbox() {
        for (const element of this.getActiveItems()) {
            if (element.pickable !== false && !element.disabled) {
                this.updateCheckboxState(element, !(element.checked === true));
            }
        }
    }
    checkAll(checked) {
        const updated = new Set();
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
};
QuickInputTreeController = __decorate([
    __param(3, IInstantiationService)
], QuickInputTreeController);
export { QuickInputTreeController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFRyZWVDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3RyZWUvcXVpY2tJbnB1dFRyZWVDb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFdEYsT0FBTyxFQUFzQiw4QkFBOEIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTlHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0UsT0FBTyxFQUFzRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNoSSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsa0JBQWtCLEVBQXdCLE1BQU0scUJBQXFCLENBQUM7QUFDL0UsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDakUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhDQUE4QyxD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