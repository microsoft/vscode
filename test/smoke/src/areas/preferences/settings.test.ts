/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';
import { CommonActions } from '../../areas/common';
import { SettingsEditor } from './settings';

let app: SpectronApplication;
let common: CommonActions;

export function testSettings() {

	describe('Settings Customisation', () => {

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			return await app.start();
		});
		afterEach(async function () {
			await app.stop();
		});

		it('turns off editor line numbers and verifies the live change', async function () {
			await common.openFile('app.js', true);
			let lineNumbers = await app.client.elements('.line-numbers');
			assert.ok(!!lineNumbers.value.length, 'Line numbers are not present in the editor before disabling them.');

			const settingsEditor = new SettingsEditor(app);
			await settingsEditor.openUserSettings();
			await settingsEditor.focusEditableSettings();
			await app.client.keys(`"editor.lineNumbers": "off"`);
			await common.saveOpenedFile();

			await common.selectTab('app.js');
			lineNumbers = await app.client.elements('.line-numbers', result => !result || result.length === 0);
			assert.ok(!lineNumbers.value.length, 'Line numbers are still present in the editor after disabling them.');
		});
	});
}