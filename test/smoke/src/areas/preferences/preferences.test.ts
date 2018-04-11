/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication } from '../../application';
import { ActivityBarPosition } from '../activitybar/activityBar';

export function setup() {
	describe('Preferences', () => {
		it('turns off editor line numbers and verifies the live change', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.explorer.openFile('app.js');
			await app.api.waitForElements('.line-numbers', false, elements => !!elements.length);

			await app.workbench.settingsEditor.addUserSetting('editor.lineNumbers', '"off"');
			await app.workbench.editors.selectTab('app.js');
			await app.api.waitForElements('.line-numbers', false, result => !result || result.length === 0);
		});

		it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
			const app = this.app as SpectronApplication;
			assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.LEFT), 'Activity bar should be positioned on the left.');

			await app.workbench.keybindingsEditor.updateKeybinding('workbench.action.toggleSidebarPosition', 'ctrl+u', 'Control+U');

			await app.api.dispatchKeybinding('ctrl+u');
			assert.ok(await app.workbench.activitybar.getActivityBar(ActivityBarPosition.RIGHT), 'Activity bar was not moved to right after toggling its position.');
		});

		after(async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.settingsEditor.clearUserSettings();
		});
	});
}