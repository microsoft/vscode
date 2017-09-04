/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';
import { SettingsEditor } from './settings';

export function testSettings() {
	describe('Settings Customisation', () => {
		let app: SpectronApplication = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		before(() => app.start());
		after(() => app.stop());

		it('turns off editor line numbers and verifies the live change', async function () {
			await app.workbench.explorer.openFile('app.js');
			let lineNumbers = await app.client.waitForElements('.line-numbers');
			assert.ok(!!lineNumbers.length, 'Line numbers are not present in the editor before disabling them.');

			const settingsEditor = new SettingsEditor(app);
			await settingsEditor.openUserSettings();
			await settingsEditor.focusEditableSettings();
			await app.client.keys(`"editor.lineNumbers": "off"`);
			await app.workbench.saveOpenedFile();

			await app.workbench.selectTab('app.js');
			lineNumbers = await app.client.waitForElements('.line-numbers', result => !result || result.length === 0);
			assert.ok(!lineNumbers.length, 'Line numbers are still present in the editor after disabling them.');
		});
	});
}