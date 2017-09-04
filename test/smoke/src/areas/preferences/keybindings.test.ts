/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';
import { ActivityBarPosition } from '../../areas/activitybar/activityBar';
import { KeybindingsEditor } from './keybindings';

export function testKeybindings() {

	describe('Keybindings Customisation', () => {
		let app: SpectronApplication = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		before(() => app.start());
		after(() => app.stop());

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