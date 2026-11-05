/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { IconOnlySessionPickers } from '../../browser/iconOnlySessionPickers.js';

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	actions: readonly IAction[] = [];

	override showContextMenu(delegate: IContextMenuDelegate): void {
		this.actions = delegate.getActions();
	}
}

suite('Sessions - IconOnlySessionPickers', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('pickers show labels by default and persist context menu choices across reloads', () => {
		const storageService = store.add(new TestStorageService());
		const contextMenuService = new TestContextMenuService();
		const create = () => store.add(new IconOnlySessionPickers(
			() => undefined,
			storageService,
			contextMenuService,
			upcastPartial<ICommandService>({}),
			new MockKeybindingService(),
		));
		const pickers = create();
		const anchor = new StandardMouseEvent(mainWindow, new MouseEvent('contextmenu'));
		const toggle = (pickerId: string) => {
			pickers.showContextMenu(pickerId, anchor);
			const [action] = contextMenuService.actions;
			const menu = `${action.label}${action.checked ? ' ✓' : ''}`;
			action.run();
			return menu;
		};
		const states: { readonly iconOnly: string[]; readonly menu?: string }[] = [];
		const snapshot = (menu?: string) => states.push({ iconOnly: [...pickers.iconOnlyPickerIds.get()], menu });

		snapshot();
		snapshot(toggle(FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID));
		snapshot(toggle('harness'));
		// A new instance over the same storage, as after a window reload.
		const reloaded = create();
		states.push({ iconOnly: [...reloaded.iconOnlyPickerIds.get()], menu: 'reloaded' });
		snapshot(toggle(FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID));
		snapshot(toggle('harness'));
		states.push({ iconOnly: [...create().iconOnlyPickerIds.get()], menu: 'reloaded' });

		assert.deepStrictEqual(states, [
			{ iconOnly: [], menu: undefined },
			{ iconOnly: [FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID], menu: 'Collapse to Icon' },
			{ iconOnly: [FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID, 'harness'], menu: 'Collapse to Icon' },
			{ iconOnly: [FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID, 'harness'], menu: 'reloaded' },
			{ iconOnly: ['harness'], menu: 'Collapse to Icon ✓' },
			{ iconOnly: [], menu: 'Collapse to Icon ✓' },
			{ iconOnly: [], menu: 'reloaded' },
		]);
	});

	test('the options disclosure can be hidden and restored across reloads without a picker target', async () => {
		const storageService = store.add(new TestStorageService());
		const contextMenuService = new TestContextMenuService();
		const create = () => store.add(new IconOnlySessionPickers(
			() => undefined, storageService, contextMenuService,
			upcastPartial<ICommandService>({}), new MockKeybindingService(),
		));
		const pickers = create();
		const anchor = new StandardMouseEvent(mainWindow, new MouseEvent('contextmenu'));
		const states: boolean[] = [pickers.showOptionsToggle.get()];
		for (let i = 0; i < 2; i++) {
			pickers.showContextMenu(undefined, anchor);
			const [action] = contextMenuService.actions;
			await action.run();
			states.push(pickers.showOptionsToggle.get(), create().showOptionsToggle.get());
		}
		assert.deepStrictEqual({ states, menu: contextMenuService.actions.map(action => action.label), compact: [...pickers.iconOnlyPickerIds.get()] }, {
			states: [true, false, false, true, true],
			menu: ['Show Session Options Toggle'],
			compact: [],
		});
	});
});
