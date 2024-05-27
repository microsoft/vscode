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
			await app.code.waitForElements('.line-numbers', false, elements => !elements || elements.length === 0);
		});

		it('turns on editor rulers and verifies the live change', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.openUserSettingsFile();
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 0);

			await app.workbench.settingsEditor.addUserSetting('editor.rulers', '[60, 70]');
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 2);

			await app.workbench.settingsEditor.clearUserSettings();
		});

		it('turns on rulers and rulers info & verifies the live change', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.openUserSettingsFile();
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 0);

			await app.workbench.settingsEditor.addUserSetting('editor.rulers', '[60, 70]');
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 2);
			await app.workbench.settingsEditor.addUserSetting('editor.rulersInfo', 'true');
			await app.code.waitForElements('.ruler-column', false, elements => elements.length === 2);

			await app.workbench.settingsEditor.clearUserSettings();
		});

		it('turns on rulers info without rulers & verifies no ruler-column exists', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.openUserSettingsFile();
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 0);

			await app.workbench.settingsEditor.addUserSetting('editor.rulersInfo', 'true');
			await app.code.waitForElements('.ruler-column', false, elements => elements.length === 0);

			await app.workbench.settingsEditor.clearUserSettings();
		});

		it('turns on rulers info and verifies the column numbers textContent', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.openUserSettingsFile();

			await app.workbench.settingsEditor.addUserSetting('editor.rulers', '[60, 70]');
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 2);

			await app.workbench.settingsEditor.addUserSetting('editor.rulersInfo', 'true');
			await app.code.waitForElements('.ruler-column', false, (elements) => {
				return elements.length === 2 &&
					elements[0].textContent === '60' &&
					elements[1].textContent === '70';
			});

			await app.workbench.settingsEditor.clearUserSettings();
		});

		it('verify live rulers info changes', async function () {
			const app = this.app as Application;
			await app.workbench.settingsEditor.openUserSettingsFile();

			// Setup two rulers and enable rulersInfo
			await app.workbench.settingsEditor.addUserSetting('editor.rulers', '[60, 70]');
			await app.code.waitForElements('.view-ruler', false, elements => elements.length === 2);

			await app.workbench.settingsEditor.addUserSetting('editor.rulersInfo', 'true');
			await app.code.waitForElements('.ruler-column', false, (elements) => {
				return elements.length === 2 &&
					elements[0].textContent === '60' &&
					elements[1].textContent === '70';
			});

			// Setup only one ruler
			await app.workbench.settingsEditor.clearUserSettings();
			await app.workbench.settingsEditor.addUserSetting('editor.rulers', '[60]');

			// Check that the ruler-column elements update
			await app.code.waitForElements('.ruler-column', false, (elements) => {
				return elements.length === 1 &&
					elements[0].textContent === '60';
			});
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
			await app.code.waitForSetValue('.settings-editor .setting-item-contents .setting-item-control input', '6');
			await app.code.waitForElement('.settings-editor .setting-item-contents .setting-item-modified-indicator');
			await app.code.waitForSetValue('.settings-editor .setting-item-contents .setting-item-control input', '4');
		});

		// Skipping test due to it being flaky.
		it.skip('turns off editor line numbers and verifies the live change', async function () {
			const app = this.app as Application;

			await app.workbench.editors.newUntitledFile();
			await app.code.dispatchKeybinding('enter');
			await app.code.waitForElements('.line-numbers', false, elements => !!elements.length);

			// Turn off line numbers
			await app.workbench.settingsEditor.searchSettingsUI('editor.lineNumbers');
			await app.code.waitAndClick('.settings-editor .monaco-list-rows .setting-item-control select', 2, 2);
			await app.code.waitAndClick('.context-view .option-text', 2, 2);

			await app.workbench.editors.selectTab('Untitled-1');
			await app.code.waitForElements('.line-numbers', false, elements => !elements || elements.length === 0);
		});

		// Skipping test due to it being flaky.
		it.skip('hides the toc when searching depending on the search behavior', async function () {
			const app = this.app as Application;

			// Hide ToC when searching
			await app.workbench.settingsEditor.searchSettingsUI('workbench.settings.settingsSearchTocBehavior');
			await app.code.waitAndClick('.settings-editor .monaco-list-rows .setting-item-control select', 2, 2);
			await app.code.waitAndClick('.context-view .monaco-list-row:nth-child(1) .option-text', 2, 2);
			await app.workbench.settingsEditor.searchSettingsUI('test');
			await app.code.waitForElements('.settings-editor .settings-toc-container', false, elements => elements.length === 1 && elements[0].attributes['style'].includes('width: 0px'));
			await app.code.waitForElements('.settings-editor .settings-body .monaco-sash', false, elements => elements.length === 1 && elements[0].className.includes('disabled'));

			// Show ToC when searching
			await app.workbench.settingsEditor.searchSettingsUI('workbench.settings.settingsSearchTocBehavior');
			await app.code.waitAndClick('.settings-editor .monaco-list-rows .setting-item-control select', 2, 2);
			await app.code.waitAndClick('.context-view .monaco-list-row:nth-child(2) .option-text', 2, 2);
			await app.workbench.settingsEditor.searchSettingsUI('test');
			await app.code.waitForElements('.settings-editor .settings-toc-container', false, elements => elements.length === 1 && !elements[0].attributes['style'].includes('width: 0px'));
			await app.code.waitForElements('.settings-editor .settings-body .monaco-sash', false, elements => elements.length === 1 && !elements[0].className.includes('disabled'));
		});
	});
}
