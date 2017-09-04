/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';
import { CommonActions } from '../../areas/common';
import { ActivityBarPosition } from '../../areas/activitybar/activityBar';
import { KeybindingsEditor } from './keybindings';

let app: SpectronApplication;
let common: CommonActions;

export function testKeybindings() {

	describe('Keybindings Customisation', () => {

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			return await app.start();
		});

		afterEach(async function () {
			await app.stop();
		});

		it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
			let activityBarElement = await app.workbench.activitybar.getActivityBar(ActivityBarPosition.LEFT);
			assert.ok(activityBarElement, 'Activity bar should be positioned on the left.');

			const keybindingsEditor = new KeybindingsEditor(app);
			await keybindingsEditor.openKeybindings();
			await keybindingsEditor.updateKeybinding('workbench.action.toggleSidebarPosition', ['Control', 'u', 'NULL'], 'Control+U');

			await app.client.keys(['Control', 'u', 'NULL']);
			activityBarElement = await app.workbench.activitybar.getActivityBar(ActivityBarPosition.RIGHT);
			assert.ok(activityBarElement, 'Activity bar was not moved to right after toggling its position.');
		});
	});
}