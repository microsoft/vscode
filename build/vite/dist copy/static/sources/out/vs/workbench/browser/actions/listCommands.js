/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../base/common/keyCodes.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { List } from '../../../base/browser/ui/list/listWidget.js';
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, WorkbenchListHasSelectionOrFocus, getSelectionKeyboardEvent, WorkbenchListSelectionNavigation, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent, WorkbenchTreeElementHasChild, WorkbenchTreeElementCanExpand, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchListSupportsFind, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey, WorkbenchTreeStickyScrollFocused } from '../../../platform/list/browser/listService.js';
import { PagedList } from '../../../base/browser/ui/list/listPaging.js';
import { equals, range } from '../../../base/common/arrays.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ObjectTree } from '../../../base/browser/ui/tree/objectTree.js';
import { AsyncDataTree } from '../../../base/browser/ui/tree/asyncDataTree.js';
import { DataTree } from '../../../base/browser/ui/tree/dataTree.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { Table } from '../../../base/browser/ui/table/tableWidget.js';
import { AbstractTree, TreeFindMatchType, TreeFindMode } from '../../../base/browser/ui/tree/abstractTree.js';
import { isActiveElement } from '../../../base/browser/dom.js';
import { Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { localize, localize2 } from '../../../nls.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
function ensureDOMFocus(widget) {
    // it can happen that one of the commands is executed while
    // DOM focus is within another focusable control within the
    // list/tree item. therefor we should ensure that the
    // list/tree has DOM focus again after the command ran.
    const element = widget?.getHTMLElement();
    if (element && !isActiveElement(element)) {
        widget?.domFocus();
    }
}
async function updateFocus(widget, updateFocusFn) {
    if (!WorkbenchListSelectionNavigation.getValue(widget.contextKeyService)) {
        return updateFocusFn(widget);
    }
    const focus = widget.getFocus();
    const selection = widget.getSelection();
    await updateFocusFn(widget);
    const newFocus = widget.getFocus();
    if (selection.length > 1 || !equals(focus, selection) || equals(focus, newFocus)) {
        return;
    }
    const fakeKeyboardEvent = new KeyboardEvent('keydown');
    widget.setSelection(newFocus, fakeKeyboardEvent);
}
async function navigate(widget, updateFocusFn) {
    if (!widget) {
        return;
    }
    await updateFocus(widget, updateFocusFn);
    const listFocus = widget.getFocus();
    if (listFocus.length) {
        widget.reveal(listFocus[0]);
    }
    widget.setAnchor(listFocus[0]);
    ensureDOMFocus(widget);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 18 /* KeyCode.DownArrow */,
    mac: {
        primary: 18 /* KeyCode.DownArrow */,
        secondary: [256 /* KeyMod.WinCtrl */ | 44 /* KeyCode.KeyN */]
    },
    handler: (accessor, arg2) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusNext(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 16 /* KeyCode.UpArrow */,
    mac: {
        primary: 16 /* KeyCode.UpArrow */,
        secondary: [256 /* KeyMod.WinCtrl */ | 46 /* KeyCode.KeyP */]
    },
    handler: (accessor, arg2) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusPrevious(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusAnyDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
    mac: {
        primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
        secondary: [256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 44 /* KeyCode.KeyN */]
    },
    handler: (accessor, arg2) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
            await widget.focusNext(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusAnyUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
    mac: {
        primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
        secondary: [256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 46 /* KeyCode.KeyP */]
    },
    handler: (accessor, arg2) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
            await widget.focusPrevious(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusPageDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 12 /* KeyCode.PageDown */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusNextPage(fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusPageUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 11 /* KeyCode.PageUp */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusPreviousPage(fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusFirst',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 14 /* KeyCode.Home */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusFirst(fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusLast',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 13 /* KeyCode.End */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            await widget.focusLast(fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusAnyFirst',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 512 /* KeyMod.Alt */ | 14 /* KeyCode.Home */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
            await widget.focusFirst(fakeKeyboardEvent);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusAnyLast',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 512 /* KeyMod.Alt */ | 13 /* KeyCode.End */,
    handler: (accessor) => {
        navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
            const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
            await widget.focusLast(fakeKeyboardEvent);
        });
    }
});
function expandMultiSelection(focused, previousFocus) {
    // List
    if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
        const list = focused;
        const focus = list.getFocus() ? list.getFocus()[0] : undefined;
        const selection = list.getSelection();
        if (selection && typeof focus === 'number' && selection.indexOf(focus) >= 0) {
            list.setSelection(selection.filter(s => s !== previousFocus));
        }
        else {
            if (typeof focus === 'number') {
                list.setSelection(selection.concat(focus));
            }
        }
    }
    // Tree
    else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
        const list = focused;
        const focus = list.getFocus() ? list.getFocus()[0] : undefined;
        if (previousFocus === focus) {
            return;
        }
        const selection = list.getSelection();
        const fakeKeyboardEvent = new KeyboardEvent('keydown', { shiftKey: true });
        if (selection && selection.indexOf(focus) >= 0) {
            list.setSelection(selection.filter(s => s !== previousFocus), fakeKeyboardEvent);
        }
        else {
            list.setSelection(selection.concat(focus), fakeKeyboardEvent);
        }
    }
}
function revealFocusedStickyScroll(tree, postRevealAction) {
    const focus = tree.getStickyScrollFocus();
    if (focus.length === 0) {
        throw new Error(`StickyScroll has no focus`);
    }
    if (focus.length > 1) {
        throw new Error(`StickyScroll can only have a single focused item`);
    }
    tree.reveal(focus[0]);
    tree.getHTMLElement().focus(); // domfocus() would focus stiky scroll dom and not the tree todo@benibenj
    tree.setFocus(focus);
    postRevealAction?.(focus[0]);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.expandSelectionDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
    primary: 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */,
    handler: (accessor, arg2) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget) {
            return;
        }
        // Focus down first
        const previousFocus = widget.getFocus() ? widget.getFocus()[0] : undefined;
        const fakeKeyboardEvent = new KeyboardEvent('keydown');
        widget.focusNext(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        // Then adjust selection
        expandMultiSelection(widget, previousFocus);
        const focus = widget.getFocus();
        if (focus.length) {
            widget.reveal(focus[0]);
        }
        ensureDOMFocus(widget);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.expandSelectionUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
    primary: 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */,
    handler: (accessor, arg2) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget) {
            return;
        }
        // Focus up first
        const previousFocus = widget.getFocus() ? widget.getFocus()[0] : undefined;
        const fakeKeyboardEvent = new KeyboardEvent('keydown');
        widget.focusPrevious(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
        // Then adjust selection
        expandMultiSelection(widget, previousFocus);
        const focus = widget.getFocus();
        if (focus.length) {
            widget.reveal(focus[0]);
        }
        ensureDOMFocus(widget);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.collapse',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent)),
    primary: 15 /* KeyCode.LeftArrow */,
    mac: {
        primary: 15 /* KeyCode.LeftArrow */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */]
    },
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
            return;
        }
        const tree = widget;
        const focusedElements = tree.getFocus();
        if (focusedElements.length === 0) {
            return;
        }
        const focus = focusedElements[0];
        if (!tree.collapse(focus)) {
            const parent = tree.getParentElement(focus);
            if (parent) {
                navigate(widget, widget => {
                    const fakeKeyboardEvent = new KeyboardEvent('keydown');
                    widget.setFocus([parent], fakeKeyboardEvent);
                });
            }
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.stickyScroll.collapse',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    when: WorkbenchTreeStickyScrollFocused,
    primary: 15 /* KeyCode.LeftArrow */,
    mac: {
        primary: 15 /* KeyCode.LeftArrow */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */]
    },
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
            return;
        }
        revealFocusedStickyScroll(widget, focus => widget.collapse(focus));
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.collapseAll',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */]
    },
    handler: (accessor) => {
        const focused = accessor.get(IListService).lastFocusedList;
        if (focused && !(focused instanceof List || focused instanceof PagedList || focused instanceof Table)) {
            focused.collapseAll();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.collapseAllToFocus',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    handler: accessor => {
        const focused = accessor.get(IListService).lastFocusedList;
        const fakeKeyboardEvent = getSelectionKeyboardEvent('keydown', true);
        // Trees
        if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
            const tree = focused;
            const focus = tree.getFocus();
            if (focus.length > 0) {
                tree.collapse(focus[0], true);
            }
            tree.setSelection(focus, fakeKeyboardEvent);
            tree.setAnchor(focus[0]);
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.focusParent',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
            return;
        }
        const tree = widget;
        const focusedElements = tree.getFocus();
        if (focusedElements.length === 0) {
            return;
        }
        const focus = focusedElements[0];
        const parent = tree.getParentElement(focus);
        if (parent) {
            navigate(widget, widget => {
                const fakeKeyboardEvent = new KeyboardEvent('keydown');
                widget.setFocus([parent], fakeKeyboardEvent);
            });
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.expand',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanExpand, WorkbenchTreeElementHasChild)),
    primary: 17 /* KeyCode.RightArrow */,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget) {
            return;
        }
        if (widget instanceof ObjectTree || widget instanceof DataTree) {
            // TODO@Joao: instead of doing this here, just delegate to a tree method
            const focusedElements = widget.getFocus();
            if (focusedElements.length === 0) {
                return;
            }
            const focus = focusedElements[0];
            if (!widget.expand(focus)) {
                const child = widget.getFirstElementChild(focus);
                if (child) {
                    const node = widget.getNode(child);
                    if (node.visible) {
                        navigate(widget, widget => {
                            const fakeKeyboardEvent = new KeyboardEvent('keydown');
                            widget.setFocus([child], fakeKeyboardEvent);
                        });
                    }
                }
            }
        }
        else if (widget instanceof AsyncDataTree) {
            // TODO@Joao: instead of doing this here, just delegate to a tree method
            const focusedElements = widget.getFocus();
            if (focusedElements.length === 0) {
                return;
            }
            const focus = focusedElements[0];
            widget.expand(focus).then(didExpand => {
                if (focus && !didExpand) {
                    const child = widget.getFirstElementChild(focus);
                    if (child) {
                        const node = widget.getNode(child);
                        if (node.visible) {
                            navigate(widget, widget => {
                                const fakeKeyboardEvent = new KeyboardEvent('keydown');
                                widget.setFocus([child], fakeKeyboardEvent);
                            });
                        }
                    }
                }
            });
        }
    }
});
function selectElement(accessor, retainCurrentFocus) {
    const focused = accessor.get(IListService).lastFocusedList;
    const fakeKeyboardEvent = getSelectionKeyboardEvent('keydown', retainCurrentFocus);
    // List
    if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
        const list = focused;
        list.setAnchor(list.getFocus()[0]);
        list.setSelection(list.getFocus(), fakeKeyboardEvent);
    }
    // Trees
    else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
        const tree = focused;
        const focus = tree.getFocus();
        if (focus.length > 0) {
            let toggleCollapsed = true;
            if (tree.expandOnlyOnTwistieClick === true) {
                toggleCollapsed = false;
            }
            else if (typeof tree.expandOnlyOnTwistieClick !== 'boolean' && tree.expandOnlyOnTwistieClick(focus[0])) {
                toggleCollapsed = false;
            }
            if (toggleCollapsed) {
                tree.toggleCollapsed(focus[0]);
            }
        }
        tree.setAnchor(focus[0]);
        tree.setSelection(focus, fakeKeyboardEvent);
    }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.select',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 3 /* KeyCode.Enter */,
    mac: {
        primary: 3 /* KeyCode.Enter */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */]
    },
    handler: (accessor) => {
        selectElement(accessor, false);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.stickyScrollselect',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // priorities over file explorer
    when: WorkbenchTreeStickyScrollFocused,
    primary: 3 /* KeyCode.Enter */,
    mac: {
        primary: 3 /* KeyCode.Enter */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */]
    },
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
            return;
        }
        revealFocusedStickyScroll(widget, focus => widget.setSelection([focus]));
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.selectAndPreserveFocus',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    handler: accessor => {
        selectElement(accessor, true);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.selectAll',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
    primary: 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */,
    handler: (accessor) => {
        const focused = accessor.get(IListService).lastFocusedList;
        // List
        if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
            const list = focused;
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            list.setSelection(range(list.length), fakeKeyboardEvent);
        }
        // Trees
        else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
            const tree = focused;
            const focus = tree.getFocus();
            const selection = tree.getSelection();
            // Which element should be considered to start selecting all?
            let start = undefined;
            if (focus.length > 0 && (selection.length === 0 || !selection.includes(focus[0]))) {
                start = focus[0];
            }
            if (!start && selection.length > 0) {
                start = selection[0];
            }
            // What is the scope of select all?
            let scope = undefined;
            if (!start) {
                scope = undefined;
            }
            else {
                scope = tree.getParentElement(start);
            }
            const newSelection = [];
            const visit = (node) => {
                for (const child of node.children) {
                    if (child.visible) {
                        newSelection.push(child.element);
                        if (!child.collapsed) {
                            visit(child);
                        }
                    }
                }
            };
            // Add the whole scope subtree to the new selection
            visit(tree.getNode(scope));
            // If the scope isn't the tree root, it should be part of the new selection
            if (scope && selection.length === newSelection.length) {
                newSelection.unshift(scope);
            }
            const fakeKeyboardEvent = new KeyboardEvent('keydown');
            tree.setSelection(newSelection, fakeKeyboardEvent);
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.toggleSelection',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget) {
            return;
        }
        const focus = widget.getFocus();
        if (focus.length === 0) {
            return;
        }
        const selection = widget.getSelection();
        const index = selection.indexOf(focus[0]);
        if (index > -1) {
            widget.setSelection([...selection.slice(0, index), ...selection.slice(index + 1)]);
        }
        else {
            widget.setSelection([...selection, focus[0]]);
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.showHover',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */),
    when: WorkbenchListFocusContextKey,
    handler: async (accessor) => {
        const listService = accessor.get(IListService);
        const lastFocusedList = listService.lastFocusedList;
        if (!lastFocusedList) {
            return;
        }
        // Check if a tree element is focused
        const focus = lastFocusedList.getFocus();
        if (!focus || (focus.length === 0)) {
            return;
        }
        // As the tree does not know anything about the rendered DOM elements
        // we have to traverse the dom to find the HTMLElements
        const treeDOM = lastFocusedList.getHTMLElement();
        // eslint-disable-next-line no-restricted-syntax
        const scrollableElement = treeDOM.querySelector('.monaco-scrollable-element');
        // eslint-disable-next-line no-restricted-syntax
        const listRows = scrollableElement?.querySelector('.monaco-list-rows');
        // eslint-disable-next-line no-restricted-syntax
        const focusedElement = listRows?.querySelector('.focused');
        if (!focusedElement) {
            return;
        }
        const elementWithHover = getCustomHoverForElement(focusedElement);
        if (elementWithHover) {
            accessor.get(IHoverService).showManagedHover(elementWithHover);
        }
    },
});
function getCustomHoverForElement(element) {
    // Check if the element itself has a hover
    if (element.matches('[custom-hover="true"]')) {
        return element;
    }
    // Only consider children that are not action items or have a tabindex
    // as these element are focusable and the user is able to trigger them already
    // eslint-disable-next-line no-restricted-syntax
    const noneFocusableElementWithHover = element.querySelector('[custom-hover="true"]:not([tabindex]):not(.action-item)');
    if (noneFocusableElementWithHover) {
        return noneFocusableElementWithHover;
    }
    return undefined;
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.toggleExpand',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    primary: 10 /* KeyCode.Space */,
    handler: (accessor) => {
        const focused = accessor.get(IListService).lastFocusedList;
        // Tree only
        if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
            const tree = focused;
            const focus = tree.getFocus();
            if (!tree.options.disableExpandOnSpacebar && focus.length > 0 && tree.isCollapsible(focus[0])) {
                tree.toggleCollapsed(focus[0]);
                return;
            }
        }
        selectElement(accessor, true);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.stickyScrolltoggleExpand',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50, // priorities over file explorer
    when: WorkbenchTreeStickyScrollFocused,
    primary: 10 /* KeyCode.Space */,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
            return;
        }
        revealFocusedStickyScroll(widget);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.clear',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListHasSelectionOrFocus),
    primary: 9 /* KeyCode.Escape */,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (!widget) {
            return;
        }
        const selection = widget.getSelection();
        const fakeKeyboardEvent = new KeyboardEvent('keydown');
        if (selection.length > 1) {
            const useSelectionNavigation = WorkbenchListSelectionNavigation.getValue(widget.contextKeyService);
            if (useSelectionNavigation) {
                const focus = widget.getFocus();
                widget.setSelection([focus[0]], fakeKeyboardEvent);
            }
            else {
                widget.setSelection([], fakeKeyboardEvent);
            }
        }
        else {
            widget.setSelection([], fakeKeyboardEvent);
            widget.setFocus([], fakeKeyboardEvent);
        }
        widget.setAnchor(undefined);
    }
});
CommandsRegistry.registerCommand({
    id: 'list.triggerTypeNavigation',
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        widget?.triggerTypeNavigation();
    }
});
CommandsRegistry.registerCommand({
    id: 'list.toggleFindMode',
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
            const tree = widget;
            tree.findMode = tree.findMode === TreeFindMode.Filter ? TreeFindMode.Highlight : TreeFindMode.Filter;
        }
    }
});
CommandsRegistry.registerCommand({
    id: 'list.toggleFindMatchType',
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
            const tree = widget;
            tree.findMatchType = tree.findMatchType === TreeFindMatchType.Contiguous ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous;
        }
    }
});
// Deprecated commands
CommandsRegistry.registerCommandAlias('list.toggleKeyboardNavigation', 'list.triggerTypeNavigation');
CommandsRegistry.registerCommandAlias('list.toggleFilterOnType', 'list.toggleFindMode');
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.find',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchListSupportsFind),
    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
    secondary: [61 /* KeyCode.F3 */],
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        // List
        if (widget instanceof List || widget instanceof PagedList || widget instanceof Table) {
            // TODO@joao
        }
        // Tree
        else if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
            const tree = widget;
            tree.openFind();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.closeFind',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen),
    primary: 9 /* KeyCode.Escape */,
    handler: (accessor) => {
        const widget = accessor.get(IListService).lastFocusedList;
        if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
            const tree = widget;
            tree.closeFind();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.scrollUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    // Since the default keybindings for list.scrollUp and widgetNavigation.focusPrevious
    // are both Ctrl+UpArrow, we disable this command when the scrollbar is at
    // top-most position. This will give chance for widgetNavigation.focusPrevious to execute
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListScrollAtTopContextKey?.negate()),
    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
    handler: accessor => {
        const focused = accessor.get(IListService).lastFocusedList;
        if (!focused) {
            return;
        }
        focused.scrollTop -= 10;
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.scrollDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    // same as above
    when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListScrollAtBottomContextKey?.negate()),
    primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
    handler: accessor => {
        const focused = accessor.get(IListService).lastFocusedList;
        if (!focused) {
            return;
        }
        focused.scrollTop += 10;
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.scrollLeft',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    handler: accessor => {
        const focused = accessor.get(IListService).lastFocusedList;
        if (!focused) {
            return;
        }
        focused.scrollLeft -= 10;
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'list.scrollRight',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchListFocusContextKey,
    handler: accessor => {
        const focused = accessor.get(IListService).lastFocusedList;
        if (!focused) {
            return;
        }
        focused.scrollLeft += 10;
    }
});
registerAction2(class ToggleStickyScroll extends Action2 {
    constructor() {
        super({
            id: 'tree.toggleStickyScroll',
            title: {
                ...localize2('toggleTreeStickyScroll', "Toggle Tree Sticky Scroll"),
                mnemonicTitle: localize({ key: 'mitoggleTreeStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Tree Sticky Scroll"),
            },
            category: 'View',
            metadata: { description: localize('toggleTreeStickyScrollDescription', "Toggles Sticky Scroll widget at the top of tree structures such as the File Explorer and Debug variables View.") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('workbench.tree.enableStickyScroll');
        configurationService.updateValue('workbench.tree.enableStickyScroll', newValue);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdENvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvYWN0aW9ucy9saXN0Q29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFtQixRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU3RSxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDbkgsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsMENBQTBDLEVBQWMsZ0NBQWdDLEVBQUUseUJBQXlCLEVBQXVCLGdDQUFnQyxFQUFFLCtCQUErQixFQUFFLDZCQUE2QixFQUFFLDRCQUE0QixFQUFFLDZCQUE2QixFQUFFLCtCQUErQixFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLHFDQUFxQyxFQUFFLGtDQUFrQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDcGxCLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0NBQStDLENB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