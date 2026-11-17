/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IKeyboardLayoutService } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { WorkbenchKeybindingService } from '../../browser/keybindingService.js';
import { FallbackKeyboardMapper } from '../../common/fallbackKeyboardMapper.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('WorkbenchKeybindingService dispatch', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('direct and window dispatch share hold suppression and keyup release', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IKeyboardLayoutService, {
			getKeyboardMapper: () => new FallbackKeyboardMapper(false, OS),
			validateCurrentKeyboardMapping: () => { },
			onDidChangeKeyboardLayout: Event.None,
		});
		const commandId = 'test.holdWebviewKey';
		store.add(KeybindingsRegistry.registerKeybindingRule({
			id: commandId, primary: KeyCode.F9, weight: KeybindingWeight.WorkbenchContrib,
		}));
		let invoked = 0;
		let released = 0;
		const pending: Promise<void>[] = [];
		instantiationService.stub(ICommandService, {
			executeCommand: async () => {
				invoked++;
				const hold = service.enableKeybindingHoldMode(commandId);
				assert.ok(hold);
				pending.push(hold.then(() => { released++; }));
			},
		});
		const service = store.add(instantiationService.createInstance(WorkbenchKeybindingService));
		const key = (type: 'keydown' | 'keyup', repeat = false) => new KeyboardEvent(type, {
			key: 'F9', code: 'F9', keyCode: 120, repeat, bubbles: true, cancelable: true,
		});
		for (const source of ['direct', 'window'] as const) {
			const send = (type: 'keydown' | 'keyup', repeat = false) => {
				const event = key(type, repeat);
				if (source === 'window') {
					mainWindow.dispatchEvent(event);
				} else {
					service.dispatchEvent(new StandardKeyboardEvent(event), mainWindow.document.body, undefined, type);
				}
			};
			send('keydown');
			send('keydown', true);
			send('keyup');
			await Promise.all(pending);
		}
		assert.deepStrictEqual({ invoked, released }, { invoked: 2, released: 2 });
	});
});
