/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, ActivityBarPosition, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Preferences', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('turns off editor line numbers and verifies the live change', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.openUserSettingsFile();
			await app.code.waitForElements('.line-numbers', false, elements => !!elements.length);

			await app.workbench.settingsEditor.addUserSetting('editor.lineNumbers', '"off"');
			await app.code.waitForElements('.line-numbers', false, result => !result || result.length === 0);
		});

		it('changes "workbench.action.toggleSidebarPosition" command key binding and verifies it', async function () {
			const app = this.app as Application;

			await app.workbench.activitybar.waitForActivityBar(ActivityBarPosition.LEFT);

			await app.workbench.keybindingsEditor.updateKeybinding('workbench.action.toggleSidebarPosition', 'View: Toggle Primary Side Bar Position', 'ctrl+u', 'Control+U');

			await app.code.dispatchKeybinding('ctrl+u');
			await app.workbench.activitybar.waitForActivityBar(ActivityBarPosition.RIGHT);
		});
	});

	describe('Settings editor', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('shows a modified indicator on a modified setting', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.searchSettingsUI('@id:editor.tabSize');
			await app.code.waitForSetValue('.settings-editor .setting-item-contents .setting-item-control input', '15');
			await app.code.waitForElement('.settings-editor .setting-item-contents .setting-item-modified-indicator');
			await app.code.waitForSetValue('.settings-editor .setting-item-contents .setting-item-control input', '14');
		});
	});
}
