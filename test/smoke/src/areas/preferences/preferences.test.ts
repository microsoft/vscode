/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication } from '../../spectron/application';
import { ActivityBarPosition } from '../activitybar/activityBar';

describe('Preferences', () => {
	before(function () {
		this.app.suiteName = 'Preferences';
	});

	it('turns off editor line numbers and verifies the live change', async function () {
		const app = this.app as SpectronApplication;

		await app.workbench.explorer.openFile('app.js');
		let lineNumbers = await app.client.waitForElements('.line-numbers');
		await app.screenCapturer.capture('app.js has line numbers');
		assert.ok(!!lineNumbers.length, 'Line numbers are not present in the editor before disabling them.');

		await app.workbench.settingsEditor.addUserSetting('editor.lineNumbers', '"off"');
		await app.workbench.selectTab('app.js');
		lineNumbers = await app.client.waitForElements('.line-numbers', result => !result || result.length === 0);

		await app.screenCapturer.capture('line numbers hidden');
		assert.ok(!lineNumbers.length, 'Line numbers are still present in the editor after disabling them.');
	});

	it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
		const app = this.app as SpectronApplication;
		assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.LEFT), 'Activity bar should be positioned on the left.');

		await app.workbench.keybindingsEditor.updateKeybinding('workbench.action.toggleSidebarPosition', ['Control', 'u'], 'Control+U');

		await app.client.keys(['Control', 'u', 'NULL']);
		assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.RIGHT), 'Activity bar was not moved to right after toggling its position.');
	});

	after(async function () {
		const app = this.app as SpectronApplication;
		await app.workbench.settingsEditor.clearUserSettings();
	});
});