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
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { NoEditorsVisibleContext, InZenModeContext } from 'vs/workbench/electron-browser/workbench';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IListService, ListFocusContext } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import errors = require('vs/base/common/errors');
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';

// --- List Commands

export function registerCommands(): void {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.down',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ListFocusContext,
		primary: KeyCode.DownArrow,
		mac: {
			primary: KeyCode.DownArrow,
			secondary: [KeyMod.WinCtrl | KeyCode.KEY_N]
		},
		handler: (accessor, arg2) => {
			const listService = accessor.get(IListService);
			const focused = listService.getFocused();
			const count = typeof arg2 === 'number' ? arg2 : 1;

			// List
			if (focused instanceof List) {
				const list = focused;

				list.focusNext(count);
				list.reveal(list.getFocus()[0]);
			}

			// Tree
			else if (focused) {
				const tree = focused;

				tree.focusNext(count, { origin: 'keyboard' });
				tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.up',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ListFocusContext,
		primary: KeyCode.UpArrow,
		mac: {
			primary: KeyCode.UpArrow,
			secondary: [KeyMod.WinCtrl | KeyCode.KEY_P]
		},
		handler: (accessor, arg2) => {
			const listService = accessor.get(IListService);
			const focused = listService.getFocused();
			const count = typeof arg2 === 'number' ? arg2 : 1;

			// List
			if (focused instanceof List) {
				const list = focused;

				list.focusPrevious(count);
				list.reveal(list.getFocus()[0]);
			}

			// Tree
			else if (focused) {
				const tree = focused;

				tree.focusPrevious(count, { origin: 'keyboard' });
				tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'list.left',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ListFocusContext,
		primary: KeyCode.LeftArrow,
		mac: {
			primary: KeyCode.LeftArrow,
			secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
		},
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
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
		id: 'list.right',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ListFocusContext,
		primary: KeyCode.RightArrow,
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
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

	// --- commands

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.closeWindow', // close the window when the last editor is closed by reusing the same keybinding
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: NoEditorsVisibleContext,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		handler: accessor => {
			const windowService = accessor.get(IWindowIPCService);
			windowService.getWindow().close();
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.exitZenMode',
		weight: CommonEditorRegistry.commandWeight(-1000),
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

	CommandsRegistry.registerCommand('_workbench.diff', function (accessor: ServicesAccessor, args: [URI, URI, string, string]) {
		const editorService = accessor.get(IWorkbenchEditorService);
		let [leftResource, rightResource, label, description] = args;

		if (!label) {
			label = nls.localize('diffLeftRightLabel', "{0} ⟷ {1}", leftResource.toString(true), rightResource.toString(true));
		}

		return editorService.openEditor({ leftResource, rightResource, label, description }).then(() => {
			return void 0;
		});
	});

	CommandsRegistry.registerCommand('_workbench.open', function (accessor: ServicesAccessor, args: [URI, number]) {
		const editorService = accessor.get(IWorkbenchEditorService);
		const [resource, column] = args;

		return editorService.openEditor({ resource }, column).then(() => {
			return void 0;
		});
	});
}