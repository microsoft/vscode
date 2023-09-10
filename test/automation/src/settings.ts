/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor } from './editor';
import { Editors } from './editors';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

export class SettingsEditor {

	constructor(private code: Code, private editors: Editors, private editor: Editor, private quickaccess: QuickAccess) { }

	/**
	 * Write a single setting key value pair.
	 *
	 * Warning: You may need to set `editor.wordWrap` to `"on"` if this is called with a really long
	 * setting.
	 */
	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.openUserSettingsFile();

		await this.code.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value},`);
		await this.editors.saveOpenedFile();
	}

	/**
	 * Write several settings faster than multiple calls to {@link addUserSetting}.
	 *
	 * Warning: You will likely also need to set `editor.wordWrap` to `"on"` if `addUserSetting` is
	 * called after this in the test.
	 */
	async addUserSettings(settings: [key: string, value: string][]): Promise<void> {
		await this.openUserSettingsFile();

		await this.code.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', settings.map(v => `"${v[0]}": ${v[1]},`).join(''));
		await this.editors.saveOpenedFile();
	}

	async clearUserSettings(): Promise<void> {
		await this.openUserSettingsFile();
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.dispatchKeybinding('Delete');
		await this.editor.waitForTypeInEditor('settings.json', `{`); // will auto close }
		await this.editors.saveOpenedFile();
		await this.quickaccess.runCommand('workbench.action.closeActiveEditor');
	}

	async openUserSettingsFile(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.openSettingsJson');
		await this.editor.waitForEditorFocus('settings.json', 1);
	}

	async openUserSettingsUI(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.openSettings2');
		await this.code.waitForElement('.settings-editor');
	}

	async searchSettingsUI(query: string): Promise<void> {
		await this.openUserSettingsUI();
		await this.code.waitAndClick('.settings-editor .suggest-input-container .monaco-editor textarea');
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+a');
		} else {
			await this.code.dispatchKeybinding('ctrl+a');
		}
		await this.code.dispatchKeybinding('Delete');
		await this.code.waitForElements('.settings-editor .settings-count-widget', false, results => !results || (results?.length === 1 && !results[0].textContent));
		await this.code.waitForTypeInEditor('.settings-editor .suggest-input-container .monaco-editor textarea', query);
		await this.code.waitForElements('.settings-editor .settings-count-widget', false, results => results?.length === 1 && results[0].textContent.includes('Found'));
	}
}
