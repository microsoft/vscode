/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { posix } from 'path';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, ListWidget, WorkbenchListHasSelectionOrFocus } from 'vs/platform/list/browser/listService';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { range } from 'vs/base/common/arrays';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { InEditorZenModeContext, NoEditorsVisibleContext, SingleEditorGroupsContext } from 'vs/workbench/common/editor';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IDownloadService } from 'vs/platform/download/common/download';
import { generateUuid } from 'vs/base/common/uuid';
import { ObjectTree } from 'vs/base/browser/ui/tree/objectTree';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { DataTree } from 'vs/base/browser/ui/tree/dataTree';

// --- List Commands

function ensureDOMFocus(widget: ListWidget): void {
	// it can happen that one of the commands is executed while
	// DOM focus is within another focusable control within the
	// list/tree item. therefor we should ensure that the
	// list/tree has DOM focus again after the command ran.
	if (widget && widget.getHTMLElement() !== document.activeElement) {
		widget.domFocus();
	}
}

export const QUIT_ID = 'workbench.action.quit';
export function registerCommands(): void {

	function focusDown(accessor: ServicesAccessor, arg2?: number): void {
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
			const list = focused;

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.focusNext(count, false, fakeKeyboardEvent);

			const listFocus = list.getFocus();
			if (listFocus.length) {
				list.reveal(listFocus[0]);
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
			const selection = list.getSelection();
			const fakeKeyboardEvent = new KeyboardEvent('keydown');

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
				focusDown(accessor, arg2);

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

	function focusUp(accessor: ServicesAccessor, arg2?: number): void {
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
			const list = focused;

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.focusPrevious(count, false, fakeKeyboardEvent);

			const listFocus = list.getFocus();
			if (listFocus.length) {
				list.reveal(listFocus[0]);
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
			if (focused instanceof List || focused instanceof PagedList) {
				const list = focused;

				// Focus up first
				const previousFocus = list.getFocus() ? list.getFocus()[0] : undefined;
				focusUp(accessor, arg2);

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
				if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
					const tree = focused;
					const focusedElements = tree.getFocus();

					if (focusedElements.length === 0) {
						return;
					}

					const focus = focusedElements[0];

					if (!tree.expand(focus)) {
						const child = tree.getFirstElementChild(focus);

						if (child) {
							const fakeKeyboardEvent = new KeyboardEvent('keydown');
							tree.setFocus([child], fakeKeyboardEvent);
							tree.reveal(child);
						}
					}
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
			const list = focused;
			const first = list.getFirstElementChild(null);

			if (!first) {
				return;
			}

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.setFocus([first], fakeKeyboardEvent);
			list.reveal(first);
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
			const list = focused;
			const last = list.getLastElementAncestor();

			if (!last) {
				return;
			}

			const fakeKeyboardEvent = new KeyboardEvent('keydown');
			list.setFocus([last], fakeKeyboardEvent);
			list.reveal(last);
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
				const fakeKeyboardEvent = new KeyboardEvent('keydown');
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

	// --- commands

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.closeWindow', // close the window when the last editor is closed by reusing the same keybinding
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NoEditorsVisibleContext, SingleEditorGroupsContext),
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		handler: accessor => {
			const windowService = accessor.get(IWindowService);
			windowService.closeWindow();
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.exitZenMode',
		weight: KeybindingWeight.EditorContrib - 1000,
		handler(accessor: ServicesAccessor, configurationOrName: any) {
			const partService = accessor.get(IPartService);
			partService.toggleZenMode();
		},
		when: InEditorZenModeContext,
		primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: QUIT_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		handler(accessor: ServicesAccessor) {
			const windowsService = accessor.get(IWindowsService);
			windowsService.quit();
		},
		when: undefined,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_Q,
		win: { primary: undefined }
	});

	CommandsRegistry.registerCommand('_workbench.removeFromRecentlyOpened', function (accessor: ServicesAccessor, path: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string) {
		const windowsService = accessor.get(IWindowsService);

		return windowsService.removeFromRecentlyOpened([path]).then(() => undefined);
	});

	CommandsRegistry.registerCommand('_workbench.downloadResource', function (accessor: ServicesAccessor, resource: URI) {
		const downloadService = accessor.get(IDownloadService);
		const location = posix.join(tmpdir(), generateUuid());

		return downloadService.download(resource, location).then(() => URI.file(location));
	});
}
