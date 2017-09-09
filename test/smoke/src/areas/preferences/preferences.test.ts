/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication } from '../../spectron/application';
import { ActivityBarPosition } from '../activitybar/activityBar';

describe('Preferences', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Preferences'); });
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('turns off editor line numbers and verifies the live change', async function () {
		await app.workbench.explorer.openFile('app.js');
		let lineNumbers = await app.client.waitForElements('.line-numbers');
		await app.screenCapturer.capture('line numbers');
		assert.ok(!!lineNumbers.length, 'Line numbers are not present in the editor before disabling them.');

		await app.workbench.settingsEditor.openUserSettings();
		await app.workbench.settingsEditor.focusEditableSettings();
		await app.client.keys(`"editor.lineNumbers": "off"`);
		await app.workbench.saveOpenedFile();

		await app.workbench.selectTab('app.js');
		lineNumbers = await app.client.waitForElements('.line-numbers', result => !result || result.length === 0);
		await app.screenCapturer.capture('line numbers hidden');
		assert.ok(!lineNumbers.length, 'Line numbers are still present in the editor after disabling them.');
	});

	it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
		assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.LEFT), 'Activity bar should be positioned on the left.');

		await app.workbench.keybindingsEditor.openKeybindings();
		await app.workbench.keybindingsEditor.updateKeybinding('workbench.action.toggleSidebarPosition', ['Control', 'u', 'NULL'], 'Control+U');

		await app.client.keys(['Control', 'u', 'NULL']);
		assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.RIGHT), 'Activity bar was not moved to right after toggling its position.');
	});
});