/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, ListWidget, WorkbenchListHasSelectionOrFocus, getSelectionKeyboardEvent, WorkbenchListWidget, WorkbenchListSelectionNavigation, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent, WorkbenchTreeElementHasChild, WorkbenchTreeElementCanExpand, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchListSupportsFind, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey, WorkbenchTreeStickyScrollFocused } from 'vs/platform/list/browser/listService';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { equals, range } from 'vs/base/common/arrays';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree } from 'vs/base/browser/ui/tree/dataTree';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Table } from 'vs/base/browser/ui/table/tableWidget';
import { AbstractTree, TreeFindMatchType, TreeFindMode } from 'vs/base/browser/ui/tree/abstractTree';
import { isActiveElement } from 'vs/base/browser/dom';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize, localize2 } from 'vs/nls';
import { IHoverService } from 'vs/platform/hover/browser/hover';

function ensureDOMFocus(widget: ListWidget | undefined): void {
	// it can happen that one of the commands is executed while
	// DOM focus is within another focusable control within the
	// list/tree item. therefor we should ensure that the
	// list/tree has DOM focus again after the command ran.
	const element = widget?.getHTMLElement();
	if (element && !isActiveElement(element)) {
		widget?.domFocus();
	}
}

async function updateFocus(widget: WorkbenchListWidget, updateFocusFn: (widget: WorkbenchListWidget) => void | Promise<void>): Promise<void> {
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

async function navigate(widget: WorkbenchListWidget | undefined, updateFocusFn: (widget: WorkbenchListWidget) => void | Promise<void>): Promise<void> {
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.DownArrow,
	mac: {
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.WinCtrl | KeyCode.KeyN]
	},
	handler: (accessor, arg2) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusNext(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.UpArrow,
	mac: {
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.WinCtrl | KeyCode.KeyP]
	},
	handler: (accessor, arg2) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusPrevious(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusAnyDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.Alt | KeyCode.DownArrow,
	mac: {
		primary: KeyMod.Alt | KeyCode.DownArrow,
		secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyN]
	},
	handler: (accessor, arg2) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
			await widget.focusNext(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusAnyUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.Alt | KeyCode.UpArrow,
	mac: {
		primary: KeyMod.Alt | KeyCode.UpArrow,
		secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyP]
	},
	handler: (accessor, arg2) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
			await widget.focusPrevious(typeof arg2 === 'number' ? arg2 : 1, false, fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusPageDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.PageDown,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusNextPage(fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusPageUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.PageUp,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusPreviousPage(fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusFirst',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.Home,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusFirst(fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusLast',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.End,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			await widget.focusLast(fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusAnyFirst',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.Alt | KeyCode.Home,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
			await widget.focusFirst(fakeKeyboardEvent);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusAnyLast',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.Alt | KeyCode.End,
	handler: (accessor) => {
		navigate(accessor.get(IListService).lastFocusedList, async widget => {
			const fakeKeyboardEvent = new KeyboardEvent('keydown', { altKey: true });
			await widget.focusLast(fakeKeyboardEvent);
		});
	}
});

function expandMultiSelection(focused: WorkbenchListWidget, previousFocus: unknown): void {

	// List
	if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
		const list = focused;

		const focus = list.getFocus() ? list.getFocus()[0] : undefined;
		const selection = list.getSelection();
		if (selection && typeof focus === 'number' && selection.indexOf(focus) >= 0) {
			list.setSelection(selection.filter(s => s !== previousFocus));
		} else {
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
		} else {
			list.setSelection(selection.concat(focus), fakeKeyboardEvent);
		}
	}
}

function revealFocusedStickyScroll(tree: ObjectTree<any, any> | DataTree<any, any> | AsyncDataTree<any, any>, postRevealAction?: (focus: any) => void): void {
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.Shift | KeyCode.DownArrow,
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.Shift | KeyCode.UpArrow,
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent)),
	primary: KeyCode.LeftArrow,
	mac: {
		primary: KeyCode.LeftArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
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
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: WorkbenchTreeStickyScrollFocused,
	primary: KeyCode.LeftArrow,
	mac: {
		primary: KeyCode.LeftArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
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
	weight: KeybindingWeight.WorkbenchContrib,
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
	weight: KeybindingWeight.WorkbenchContrib,
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanExpand, WorkbenchTreeElementHasChild)),
	primary: KeyCode.RightArrow,
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
		} else if (widget instanceof AsyncDataTree) {
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

function selectElement(accessor: ServicesAccessor, retainCurrentFocus: boolean): void {
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
			} else if (typeof tree.expandOnlyOnTwistieClick !== 'boolean' && tree.expandOnlyOnTwistieClick(focus[0])) {
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.Enter,
	mac: {
		primary: KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
	},
	handler: (accessor) => {
		selectElement(accessor, false);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.stickyScrollselect',
	weight: KeybindingWeight.WorkbenchContrib + 50, // priorities over file explorer
	when: WorkbenchTreeStickyScrollFocused,
	primary: KeyCode.Enter,
	mac: {
		primary: KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	handler: accessor => {
		selectElement(accessor, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.selectAll',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.CtrlCmd | KeyCode.KeyA,
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
			let start: unknown | undefined = undefined;

			if (focus.length > 0 && (selection.length === 0 || !selection.includes(focus[0]))) {
				start = focus[0];
			}

			if (!start && selection.length > 0) {
				start = selection[0];
			}

			// What is the scope of select all?
			let scope: unknown | undefined = undefined;

			if (!start) {
				scope = undefined;
			} else {
				scope = tree.getParentElement(start);
			}

			const newSelection: unknown[] = [];
			const visit = (node: ITreeNode<unknown, unknown>) => {
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
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
		} else {
			widget.setSelection([...selection, focus[0]]);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.showHover',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
	when: WorkbenchListFocusContextKey,
	handler: async (accessor: ServicesAccessor, ...args: any[]) => {
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
		const scrollableElement = treeDOM.querySelector('.monaco-scrollable-element');
		const listRows = scrollableElement?.querySelector('.monaco-list-rows');
		const focusedElement = listRows?.querySelector('.focused');
		if (!focusedElement) {
			return;
		}

		const elementWithHover = getCustomHoverForElement(focusedElement as HTMLElement);
		if (elementWithHover) {
			accessor.get(IHoverService).showManagedHover(elementWithHover as HTMLElement);
		}
	},
});

function getCustomHoverForElement(element: HTMLElement): HTMLElement | undefined {
	// Check if the element itself has a hover
	if (element.matches('[custom-hover="true"]')) {
		return element;
	}

	// Only consider children that are not action items or have a tabindex
	// as these element are focusable and the user is able to trigger them already
	const noneFocusableElementWithHover = element.querySelector('[custom-hover="true"]:not([tabindex]):not(.action-item)');
	if (noneFocusableElementWithHover) {
		return noneFocusableElementWithHover as HTMLElement;
	}

	return undefined;
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.toggleExpand',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.Space,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Tree only
		if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const tree = focused;
			const focus = tree.getFocus();

			if (focus.length > 0 && tree.isCollapsible(focus[0])) {
				tree.toggleCollapsed(focus[0]);
				return;
			}
		}

		selectElement(accessor, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.stickyScrolltoggleExpand',
	weight: KeybindingWeight.WorkbenchContrib + 50, // priorities over file explorer
	when: WorkbenchTreeStickyScrollFocused,
	primary: KeyCode.Space,
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListHasSelectionOrFocus),
	primary: KeyCode.Escape,
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
			} else {
				widget.setSelection([], fakeKeyboardEvent);
			}
		} else {
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchListSupportsFind),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
	secondary: [KeyCode.F3],
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen),
	primary: KeyCode.Escape,
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
	weight: KeybindingWeight.WorkbenchContrib,
	// Since the default keybindings for list.scrollUp and widgetNavigation.focusPrevious
	// are both Ctrl+UpArrow, we disable this command when the scrollbar is at
	// top-most position. This will give chance for widgetNavigation.focusPrevious to execute
	when: ContextKeyExpr.and(
		WorkbenchListFocusContextKey,
		WorkbenchListScrollAtTopContextKey?.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
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
	weight: KeybindingWeight.WorkbenchContrib,
	// same as above
	when: ContextKeyExpr.and(
		WorkbenchListFocusContextKey,
		WorkbenchListScrollAtBottomContextKey?.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
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
	weight: KeybindingWeight.WorkbenchContrib,
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
	weight: KeybindingWeight.WorkbenchContrib,
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

	run(accessor: ServicesAccessor) {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('workbench.tree.enableStickyScroll');
		configurationService.updateValue('workbench.tree.enableStickyScroll', newValue);
	}
});
