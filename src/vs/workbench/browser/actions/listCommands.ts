/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, ListWidget, WorkbenchListHasSelectionOrFocus, getSelectionKeyboardEvent } from 'vs/platform/list/browser/listService';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { range } from 'vs/base/common/arrays';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree } from 'vs/base/browser/ui/tree/dataTree';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

function ensureDOMFocus(widget: ListWidget): void {
	// it can happen that one of the commands is executed while
	// DOM focus is within another focusable control within the
	// list/tree item. therefor we should ensure that the
	// list/tree has DOM focus again after the command ran.
	if (widget && widget.getHTMLElement() !== document.activeElement) {
		widget.domFocus();
	}
}

function focusDown(accessor: ServicesAccessor, arg2?: number, loop: boolean = true): void {
	const focused = accessor.get(IListService).lastFocusedList;
	const count = typeof arg2 === 'number' ? arg2 : 1;

	// Ensure DOM Focus
	ensureDOMFocus(focused);

	// List
	if (focused instanceof List || focused instanceof PagedList) {
		const list = focused;

		list.focusNext(count);
		const listFocus = list.getFocus();
		if (listFocus.length) {
			list.reveal(listFocus[0]);
		}
	}

	// ObjectTree
	else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
		const tree = focused;

		const fakeKeyboardEvent = new KeyboardEvent('keydown');
		tree.focusNext(count, loop, fakeKeyboardEvent);

		const listFocus = tree.getFocus();
		if (listFocus.length) {
			tree.reveal(listFocus[0]);
		}
	}

	// Tree
	else if (focused) {
		const tree = focused;

		tree.focusNext(count, { origin: 'keyboard' });
		tree.reveal(tree.getFocus());
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.DownArrow,
	mac: {
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.WinCtrl | KeyCode.KEY_N]
	},
	handler: (accessor, arg2) => focusDown(accessor, arg2)
});

function expandMultiSelection(focused: List<any> | PagedList<any> | ITree | ObjectTree<any, any> | DataTree<any, any, any> | AsyncDataTree<any, any, any>, previousFocus: any): void {

	// List
	if (focused instanceof List || focused instanceof PagedList) {
		const list = focused;

		const focus = list.getFocus() ? list.getFocus()[0] : undefined;
		const selection = list.getSelection();
		if (selection && selection.indexOf(focus) >= 0) {
			list.setSelection(selection.filter(s => s !== previousFocus));
		} else {
			list.setSelection(selection.concat(focus));
		}
	}

	// ObjectTree
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

	// Tree
	else if (focused) {
		const tree = focused;

		const focus = tree.getFocus();
		const selection = tree.getSelection();
		if (selection && selection.indexOf(focus) >= 0) {
			tree.setSelection(selection.filter(s => s !== previousFocus));
		} else {
			tree.setSelection(selection.concat(focus));
		}
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.expandSelectionDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.Shift | KeyCode.DownArrow,
	handler: (accessor, arg2) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList || focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;

			// Focus down first
			const previousFocus = list.getFocus() ? list.getFocus()[0] : undefined;
			focusDown(accessor, arg2, false);

			// Then adjust selection
			expandMultiSelection(focused, previousFocus);
		}

		// Tree
		else if (focused) {
			const tree = focused;

			// Focus down first
			const previousFocus = tree.getFocus();
			focusDown(accessor, arg2);

			// Then adjust selection
			expandMultiSelection(focused, previousFocus);
		}
	}
});

function focusUp(accessor: ServicesAccessor, arg2?: number, loop: boolean = true): void {
	const focused = accessor.get(IListService).lastFocusedList;
	const count = typeof arg2 === 'number' ? arg2 : 1;

	// Ensure DOM Focus
	ensureDOMFocus(focused);

	// List
	if (focused instanceof List || focused instanceof PagedList) {
		const list = focused;

		list.focusPrevious(count);
		const listFocus = list.getFocus();
		if (listFocus.length) {
			list.reveal(listFocus[0]);
		}
	}

	// ObjectTree
	else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
		const tree = focused;

		const fakeKeyboardEvent = new KeyboardEvent('keydown');
		tree.focusPrevious(count, loop, fakeKeyboardEvent);

		const listFocus = tree.getFocus();
		if (listFocus.length) {
			tree.reveal(listFocus[0]);
		}
	}

	// Tree
	else if (focused) {
		const tree = focused;

		tree.focusPrevious(count, { origin: 'keyboard' });
		tree.reveal(tree.getFocus());
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.UpArrow,
	mac: {
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.WinCtrl | KeyCode.KEY_P]
	},
	handler: (accessor, arg2) => focusUp(accessor, arg2)
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.expandSelectionUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.Shift | KeyCode.UpArrow,
	handler: (accessor, arg2) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList || focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;

			// Focus up first
			const previousFocus = list.getFocus() ? list.getFocus()[0] : undefined;
			focusUp(accessor, arg2, false);

			// Then adjust selection
			expandMultiSelection(focused, previousFocus);
		}

		// Tree
		else if (focused) {
			const tree = focused;

			// Focus up first
			const previousFocus = tree.getFocus();
			focusUp(accessor, arg2);

			// Then adjust selection
			expandMultiSelection(focused, previousFocus);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.collapse',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.LeftArrow,
	mac: {
		primary: KeyCode.LeftArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
	},
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Tree only
		if (focused && !(focused instanceof List || focused instanceof PagedList)) {
			if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
				const tree = focused;
				const focusedElements = tree.getFocus();

				if (focusedElements.length === 0) {
					return;
				}

				const focus = focusedElements[0];

				if (!tree.collapse(focus)) {
					const parent = tree.getParentElement(focus);

					if (parent) {
						const fakeKeyboardEvent = new KeyboardEvent('keydown');
						tree.setFocus([parent], fakeKeyboardEvent);
						tree.reveal(parent);
					}
				}
			} else {
				const tree = focused;
				const focus = tree.getFocus();

				tree.collapse(focus).then(didCollapse => {
					if (focus && !didCollapse) {
						tree.focusParent({ origin: 'keyboard' });

						return tree.reveal(tree.getFocus());
					}

					return undefined;
				});
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.expand',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.RightArrow,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Tree only
		if (focused && !(focused instanceof List || focused instanceof PagedList)) {
			if (focused instanceof ObjectTree || focused instanceof DataTree) {
				// TODO@Joao: instead of doing this here, just delegate to a tree method
				const tree = focused;
				const focusedElements = tree.getFocus();

				if (focusedElements.length === 0) {
					return;
				}

				const focus = focusedElements[0];

				if (!tree.expand(focus)) {
					const child = tree.getFirstElementChild(focus);

					if (child) {
						const node = tree.getNode(child);

						if (node.visible) {
							const fakeKeyboardEvent = new KeyboardEvent('keydown');
							tree.setFocus([child], fakeKeyboardEvent);
							tree.reveal(child);
						}
					}
				}
			} else if (focused instanceof AsyncDataTree) {
				// TODO@Joao: instead of doing this here, just delegate to a tree method
				const tree = focused;
				const focusedElements = tree.getFocus();

				if (focusedElements.length === 0) {
					return;
				}

				const focus = focusedElements[0];
				tree.expand(focus).then(didExpand => {
					if (focus && !didExpand) {
						const child = tree.getFirstElementChild(focus);

						if (child) {
							const node = tree.getNode(child);

							if (node.visible) {
								const fakeKeyboardEvent = new KeyboardEvent('keydown');
								tree.setFocus([child], fakeKeyboardEvent);
								tree.reveal(child);
							}
						}
					}
				});
			} else {
				const tree = focused;
				const focus = tree.getFocus();

				tree.expand(focus).then(didExpand => {
					if (focus && !didExpand) {
						tree.focusFirstChild({ origin: 'keyboard' });

						return tree.reveal(tree.getFocus());
					}

					return undefined;
				});
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusPageUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.PageUp,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Ensure DOM Focus
		ensureDOMFocus(focused);

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;

			list.focusPreviousPage();
			list.reveal(list.getFocus()[0]);
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.focusPreviousPage(fakeKeyboardEvent);
			list.reveal(list.getFocus()[0]);
		}

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusPreviousPage({ origin: 'keyboard' });
			tree.reveal(tree.getFocus());
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusPageDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.PageDown,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Ensure DOM Focus
		ensureDOMFocus(focused);

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;

			list.focusNextPage();
			list.reveal(list.getFocus()[0]);
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.focusNextPage(fakeKeyboardEvent);
			list.reveal(list.getFocus()[0]);
		}

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusNextPage({ origin: 'keyboard' });
			tree.reveal(tree.getFocus());
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusFirst',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.Home,
	handler: accessor => listFocusFirst(accessor)
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusFirstChild',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: 0,
	handler: accessor => listFocusFirst(accessor, { fromFocused: true })
});

function listFocusFirst(accessor: ServicesAccessor, options?: { fromFocused: boolean }): void {
	const focused = accessor.get(IListService).lastFocusedList;

	// Ensure DOM Focus
	ensureDOMFocus(focused);

	// List
	if (focused instanceof List || focused instanceof PagedList) {
		const list = focused;

		list.setFocus([0]);
		list.reveal(0);
	}

	// ObjectTree
	else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
		const tree = focused;
		const fakeKeyboardEvent = new KeyboardEvent('keydown');
		tree.focusFirst(fakeKeyboardEvent);

		const focus = tree.getFocus();

		if (focus.length > 0) {
			tree.reveal(focus[0]);
		}
	}

	// Tree
	else if (focused) {
		const tree = focused;

		tree.focusFirst({ origin: 'keyboard' }, options && options.fromFocused ? tree.getFocus() : undefined);
		tree.reveal(tree.getFocus());
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusLast',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.End,
	handler: accessor => listFocusLast(accessor)
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.focusLastChild',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: 0,
	handler: accessor => listFocusLast(accessor, { fromFocused: true })
});

function listFocusLast(accessor: ServicesAccessor, options?: { fromFocused: boolean }): void {
	const focused = accessor.get(IListService).lastFocusedList;

	// Ensure DOM Focus
	ensureDOMFocus(focused);

	// List
	if (focused instanceof List || focused instanceof PagedList) {
		const list = focused;

		list.setFocus([list.length - 1]);
		list.reveal(list.length - 1);
	}

	// ObjectTree
	else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
		const tree = focused;
		const fakeKeyboardEvent = new KeyboardEvent('keydown');
		tree.focusLast(fakeKeyboardEvent);

		const focus = tree.getFocus();

		if (focus.length > 0) {
			tree.reveal(focus[0]);
		}
	}

	// Tree
	else if (focused) {
		const tree = focused;

		tree.focusLast({ origin: 'keyboard' }, options && options.fromFocused ? tree.getFocus() : undefined);
		tree.reveal(tree.getFocus());
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
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;
			list.setSelection(list.getFocus());
			list.open(list.getFocus());
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;
			const fakeKeyboardEvent = getSelectionKeyboardEvent('keydown', false);
			list.setSelection(list.getFocus(), fakeKeyboardEvent);
			list.open(list.getFocus());
		}

		// Tree
		else if (focused) {
			const tree = focused;
			const focus = tree.getFocus();

			if (focus) {
				tree.setSelection([focus], { origin: 'keyboard' });
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.selectAll',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_A,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;
			list.setSelection(range(list.length));
		}

		// Trees
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const tree = focused;
			const focus = tree.getFocus();
			const selection = tree.getSelection();

			// Which element should be considered to start selecting all?
			let start: any | undefined = undefined;

			if (focus.length > 0 && (selection.length === 0 || selection.indexOf(focus[0]) === -1)) {
				start = focus[0];
			}

			if (!start && selection.length > 0) {
				start = selection[0];
			}

			// What is the scope of select all?
			let scope: any | undefined = undefined;

			if (!start) {
				scope = undefined;
			} else {
				const selectedNode = tree.getNode(start);
				const parentNode = selectedNode.parent;

				if (!parentNode.parent) { // root
					scope = undefined;
				} else {
					scope = parentNode.element;
				}
			}

			const newSelection: any[] = [];
			const visit = (node: ITreeNode<any, any>) => {
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
	id: 'list.toggleExpand',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchListFocusContextKey,
	primary: KeyCode.Space,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// Tree only
		if (focused && !(focused instanceof List || focused instanceof PagedList)) {
			if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
				const tree = focused;
				const focus = tree.getFocus();

				if (focus.length === 0) {
					return;
				}

				tree.toggleCollapsed(focus[0]);
			} else {
				const tree = focused;
				const focus = tree.getFocus();

				if (focus) {
					tree.toggleExpansion(focus);
				}
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.clear',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListHasSelectionOrFocus),
	primary: KeyCode.Escape,
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;

			if (list.getSelection().length > 0) {
				list.setSelection([]);
			} else if (list.getFocus().length > 0) {
				list.setFocus([]);
			}
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const list = focused;
			const fakeKeyboardEvent = new KeyboardEvent('keydown');

			if (list.getSelection().length > 0) {
				list.setSelection([], fakeKeyboardEvent);
			} else if (list.getFocus().length > 0) {
				list.setFocus([], fakeKeyboardEvent);
			}
		}

		// Tree
		else if (focused) {
			const tree = focused;

			if (tree.getSelection().length) {
				tree.clearSelection({ origin: 'keyboard' });
			} else if (tree.getFocus()) {
				tree.clearFocus({ origin: 'keyboard' });
			}
		}
	}
});

CommandsRegistry.registerCommand({
	id: 'list.toggleKeyboardNavigation',
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			// TODO@joao
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const tree = focused;
			tree.toggleKeyboardNavigation();
		}
	}
});

CommandsRegistry.registerCommand({
	id: 'list.toggleFilterOnType',
	handler: (accessor) => {
		const focused = accessor.get(IListService).lastFocusedList;

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			// TODO@joao
		}

		// ObjectTree
		else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
			const tree = focused;
			tree.updateOptions({ filterOnType: !tree.filterOnType });
		}
	}
});
