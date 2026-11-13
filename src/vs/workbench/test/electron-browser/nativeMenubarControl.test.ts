/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../base/common/keybindings.js';
import { isMacintosh, OperatingSystem } from '../../../base/common/platform.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IMenu, IMenuService } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IMenubarData } from '../../../platform/menubar/common/menubar.js';
import { IMenubarService } from '../../../platform/menubar/electron-browser/menubar.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IUpdateService, State } from '../../../platform/update/common/update.js';
import { NativeMenubarControl } from '../../electron-browser/parts/titlebar/menubarControl.js';
import { IPreferencesService } from '../../services/preferences/common/preferences.js';
import { TestMenuService, workbenchInstantiationService } from '../browser/workbenchTestServices.js';
import { TestNativeHostService } from './workbenchTestServices.js';

class EmptyMenubarMenuService extends TestMenuService {
	override createMenu(): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => [['', []]]
		};
	}
}

suite('NativeMenubarControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const commandId = 'workbench.action.toggleWindowAlwaysOnTop';
	const shortcut = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyT)], OperatingSystem.Macintosh);
	const chord = new USLayoutResolvedKeybinding([
		new KeyCodeChord(true, false, false, false, KeyCode.KeyK),
		new KeyCodeChord(true, false, false, false, KeyCode.KeyT)
	], OperatingSystem.Macintosh);

	for (const { name, binding, expected } of [
		{ name: 'native shortcut', binding: shortcut, expected: { label: 'Ctrl+T', userSettingsLabel: 'ctrl+t' } },
		{ name: 'chord', binding: chord, expected: { label: chord.getLabel(), isNative: false, userSettingsLabel: 'ctrl+k ctrl+t' } },
		{ name: 'no shortcut', binding: undefined, expected: undefined }
	]) {
		(isMacintosh ? test : test.skip)(`forwards Always on Top keybinding metadata with ${name}`, async () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(INativeHostService, new TestNativeHostService());
			instantiationService.stub(IMenuService, new EmptyMenubarMenuService());
			instantiationService.stub(IUpdateService, new class extends mock<IUpdateService>() {
				override readonly onStateChange = Event.None;
				override readonly state = State.Uninitialized;
			});
			instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { });
			instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
			instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id: string) => id === commandId ? binding : shortcut);
			const update = new DeferredPromise<IMenubarData>();
			instantiationService.stub(IMenubarService, {
				updateMenubar: async (_windowId: number, data: IMenubarData) => { await update.complete(data); }
			});

			store.add(instantiationService.createInstance(NativeMenubarControl));
			const data = await update.p;

			assert.deepStrictEqual(data.keybindings, {
				'workbench.action.quit': { label: 'Ctrl+T', userSettingsLabel: 'ctrl+t' },
				...(expected ? { [commandId]: expected } : {})
			});
		});
	}
});
