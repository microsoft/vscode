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
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ENVIRONMENT_PICKER_ICON_ONLY_SETTING } from '../../common/constants.js';
import { ENVIRONMENT_PICKER_ID, IconOnlySessionPickers } from '../../browser/iconOnlySessionPickers.js';

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

	test('the environment picker follows its setting until the user chooses from the context menu, which persists', async () => {
		const storageService = store.add(new TestStorageService());
		const configurationService = new TestConfigurationService();
		const contextMenuService = new TestContextMenuService();
		const create = () => store.add(new IconOnlySessionPickers(
			() => undefined,
			storageService,
			configurationService,
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
		const setEnvironmentDefault = async (iconOnly: boolean) => {
			await configurationService.setUserConfiguration(ENVIRONMENT_PICKER_ICON_ONLY_SETTING, iconOnly);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === ENVIRONMENT_PICKER_ICON_ONLY_SETTING }));
		};
		const states: { readonly iconOnly: string[]; readonly environmentChoice: boolean; readonly menu?: string }[] = [];
		const snapshot = (menu?: string) => states.push({ iconOnly: [...pickers.iconOnlyPickerIds.get()], environmentChoice: pickers.hasChoice(ENVIRONMENT_PICKER_ID, undefined), menu });

		snapshot();
		await setEnvironmentDefault(true);
		snapshot();
		snapshot(toggle(ENVIRONMENT_PICKER_ID));
		await setEnvironmentDefault(true);
		snapshot();
		snapshot(toggle('harness'));
		// A new instance over the same storage, as after a window reload.
		const reloaded = create();
		states.push({ iconOnly: [...reloaded.iconOnlyPickerIds.get()], environmentChoice: reloaded.hasChoice(ENVIRONMENT_PICKER_ID, undefined), menu: 'reloaded' });
		snapshot(toggle('harness'));

		assert.deepStrictEqual(states, [
			{ iconOnly: [], environmentChoice: false, menu: undefined },
			{ iconOnly: [ENVIRONMENT_PICKER_ID], environmentChoice: false, menu: undefined },
			{ iconOnly: [], environmentChoice: true, menu: 'Collapse to Icon ✓' },
			{ iconOnly: [], environmentChoice: true, menu: undefined },
			{ iconOnly: ['harness'], environmentChoice: true, menu: 'Collapse to Icon' },
			{ iconOnly: ['harness'], environmentChoice: true, menu: 'reloaded' },
			{ iconOnly: [], environmentChoice: true, menu: 'Collapse to Icon ✓' },
		]);
	});
});
