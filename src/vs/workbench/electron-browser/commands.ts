/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { NoEditorsVisibleContext, InZenModeContext } from 'vs/workbench/electron-browser/workbench';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { List } from 'vs/base/browser/ui/list/listWidget';
import errors = require('vs/base/common/errors');
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import { IEditorOptions, Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, ListWidget } from 'vs/platform/list/browser/listService';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { range } from 'vs/base/common/arrays';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITree } from 'vs/base/parts/tree/browser/tree';

// --- List Commands

function ensureDOMFocus(widget: ListWidget): void {
	// it can happen that one of the commands is executed while
	// DOM focus is within another focusable control within the
	// list/tree item. therefor we should ensure that the
	// list/tree has DOM focus again after the command ran.
	if (widget && !widget.isDOMFocused()) {
		widget.domFocus();
	}
}

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

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusNext(count, { origin: 'keyboard' });
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusDown',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.DownArrow,
		mac: {
			primary: KeyCode.DownArrow,
			secondary: [KeyMod.WinCtrl | KeyCode.KEY_N]
		},
		handler: (accessor, arg2) => focusDown(accessor, arg2)
	});

	function expandMultiSelection(focused: List<any> | PagedList<any> | ITree, previousFocus: any): void {

		// List
		if (focused instanceof List || focused instanceof PagedList) {
			const list = focused;

			const focus = list.getFocus() ? list.getFocus()[0] : void 0;
			const selection = list.getSelection();
			if (selection && selection.indexOf(focus) >= 0) {
				list.setSelection(selection.filter(s => s !== previousFocus));
			} else {
				list.setSelection(selection.concat(focus));
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
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyMod.Shift | KeyCode.DownArrow,
		handler: (accessor, arg2) => {
			const focused = accessor.get(IListService).lastFocusedList;

			// List
			if (focused instanceof List || focused instanceof PagedList) {
				const list = focused;

				// Focus down first
				const previousFocus = list.getFocus() ? list.getFocus()[0] : void 0;
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

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusPrevious(count, { origin: 'keyboard' });
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusUp',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyMod.Shift | KeyCode.UpArrow,
		handler: (accessor, arg2) => {
			const focused = accessor.get(IListService).lastFocusedList;

			// List
			if (focused instanceof List || focused instanceof PagedList) {
				const list = focused;

				// Focus up first
				const previousFocus = list.getFocus() ? list.getFocus()[0] : void 0;
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
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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
				const tree = focused;
				const focus = tree.getFocus();

				tree.collapse(focus).then(didCollapse => {
					if (focus && !didCollapse) {
						tree.focusParent({ origin: 'keyboard' });

						return tree.reveal(tree.getFocus());
					}

					return void 0;
				}).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.expand',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.RightArrow,
		handler: (accessor) => {
			const focused = accessor.get(IListService).lastFocusedList;

			// Tree only
			if (focused && !(focused instanceof List || focused instanceof PagedList)) {
				const tree = focused;
				const focus = tree.getFocus();

				tree.expand(focus).then(didExpand => {
					if (focus && !didExpand) {
						tree.focusFirstChild({ origin: 'keyboard' });

						return tree.reveal(tree.getFocus());
					}

					return void 0;
				}).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusPageUp',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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

			// Tree
			else if (focused) {
				const tree = focused;

				tree.focusPreviousPage({ origin: 'keyboard' });
				tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusPageDown',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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

			// Tree
			else if (focused) {
				const tree = focused;

				tree.focusNextPage({ origin: 'keyboard' });
				tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusFirst',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.Home,
		handler: accessor => listFocusFirst(accessor)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusFirstChild',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: null,
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

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusFirst({ origin: 'keyboard' }, options && options.fromFocused ? tree.getFocus() : void 0);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusLast',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.End,
		handler: accessor => listFocusLast(accessor)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.focusLastChild',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: null,
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

		// Tree
		else if (focused) {
			const tree = focused;

			tree.focusLast({ origin: 'keyboard' }, options && options.fromFocused ? tree.getFocus() : void 0);
			tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.select',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.Space,
		handler: (accessor) => {
			const focused = accessor.get(IListService).lastFocusedList;

			// Tree only
			if (focused && !(focused instanceof List || focused instanceof PagedList)) {
				const tree = focused;
				const focus = tree.getFocus();

				if (focus) {
					tree.toggleExpansion(focus);
				}
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.clear',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: WorkbenchListFocusContextKey,
		primary: KeyCode.Escape,
		handler: (accessor) => {
			const focused = accessor.get(IListService).lastFocusedList;

			// Tree only
			if (focused && !(focused instanceof List || focused instanceof PagedList)) {
				const tree = focused;

				if (tree.getSelection().length) {
					tree.clearSelection({ origin: 'keyboard' });

					return void 0;
				}

				if (tree.getFocus()) {
					tree.clearFocus({ origin: 'keyboard' });

					return void 0;
				}
			}
		}
	});

	// --- commands

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.closeWindow', // close the window when the last editor is closed by reusing the same keybinding
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: NoEditorsVisibleContext,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		handler: accessor => {
			const windowService = accessor.get(IWindowService);
			windowService.closeWindow();
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.exitZenMode',
		weight: KeybindingsRegistry.WEIGHT.editorContrib(-1000),
		handler(accessor: ServicesAccessor, configurationOrName: any) {
			const partService = accessor.get(IPartService);
			partService.toggleZenMode();
		},
		when: InZenModeContext,
		primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.quit',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		handler(accessor: ServicesAccessor) {
			const windowsService = accessor.get(IWindowsService);
			windowsService.quit();
		},
		when: void 0,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_Q,
		win: { primary: void 0 }
	});

	CommandsRegistry.registerCommand('_workbench.diff', function (accessor: ServicesAccessor, args: [URI, URI, string, string, IEditorOptions, EditorPosition]) {
		const editorService = accessor.get(IWorkbenchEditorService);
		let [leftResource, rightResource, label, description, options, position] = args;

		if (!options || typeof options !== 'object') {
			options = {
				preserveFocus: false
			};
		}

		if (!label) {
			label = nls.localize('diffLeftRightLabel', "{0} ⟷ {1}", leftResource.toString(true), rightResource.toString(true));
		}

		return editorService.openEditor({ leftResource, rightResource, label, description, options }, position).then(() => {
			return void 0;
		});
	});

	CommandsRegistry.registerCommand('_workbench.open', function (accessor: ServicesAccessor, args: [URI, IEditorOptions, EditorPosition]) {
		const editorService = accessor.get(IWorkbenchEditorService);
		const [resource, options, column] = args;

		return editorService.openEditor({ resource, options }, column).then(() => {
			return void 0;
		});
	});

	CommandsRegistry.registerCommand('_workbench.removeFromRecentlyOpened', function (accessor: ServicesAccessor, path: string) {
		const windowsService = accessor.get(IWindowsService);

		return windowsService.removeFromRecentlyOpened([path]).then(() => {
			return void 0;
		});
	});
}
