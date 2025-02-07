/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor } from './editor';
import { Editors } from './editors';
import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { Quality } from './application';

const SEARCH_BOX_NATIVE_EDIT_CONTEXT = '.settings-editor .suggest-input-container .monaco-editor .native-edit-context';
const SEARCH_BOX_TEXTAREA = '.settings-editor .suggest-input-container .monaco-editor textarea';

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

		await this.code.dispatchKeybinding('right', async () => {
			const isEditorSelection = this._acceptEditorSelection(this.code.quality, await this.editor.getEditorSelection('settings.json'));
			const isTypeInEditor = await this.editor.isTypedInEditor('settings.json', `"${setting}": ${value},`);
			return isEditorSelection && isTypeInEditor;
		});
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

		await this.code.dispatchKeybinding('right', async () => {
			const isEditorSelection = this._acceptEditorSelection(this.code.quality, await this.editor.getEditorSelection('settings.json'));
			const isTypeInEditor = await this.editor.isTypedInEditor('settings.json', settings.map(v => `"${v[0]}": ${v[1]},`).join(''));
			return isEditorSelection && isTypeInEditor;
		});
		await this.editors.saveOpenedFile();
	}

	async clearUserSettings(): Promise<void> {
		await this.openUserSettingsFile();
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.dispatchKeybinding('Delete', async () => {
			const isEditorContents = await this.editor.isEditorContents('settings.json', contents => contents === '');
			const isTypeInEditor = await this.editor.isTypedInEditor('settings.json', `{`); // will auto close }
			return isEditorContents && isTypeInEditor;
		});
		await this.editors.saveOpenedFile();
		await this.quickaccess.runCommand('workbench.action.closeActiveEditor');
	}

	async openUserSettingsFile(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.openSettingsJson');
		await this.editor.waitForEditorFocus('settings.json', 1);
	}

	async openUserSettingsUI(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.openSettings2');
		await this.code.waitForActiveElement(this._editContextSelector());
	}

	async searchSettingsUI(query: string): Promise<void> {
		await this.openUserSettingsUI();

		await this.code.waitAndClick(this._editContextSelector());
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+a', () => true);
		} else {
			await this.code.dispatchKeybinding('ctrl+a', () => true);
		}
		await this.code.dispatchKeybinding('Delete', async () => {
			const elements = await this.code.getElements('.settings-editor .settings-count-widget', false);
			return !!elements && (!elements || (elements?.length === 1 && !elements[0].textContent));
		});
		await this.code.waitForTypeInEditor(this._editContextSelector(), query);
		await this.code.waitForElements('.settings-editor .settings-count-widget', false, results => results?.length === 1 && results[0].textContent.includes('Found'));
	}

	private _editContextSelector() {
		return this.code.quality === Quality.Stable ? SEARCH_BOX_TEXTAREA : SEARCH_BOX_NATIVE_EDIT_CONTEXT;
	}

	private _acceptEditorSelection(quality: Quality, s: { selectionStart: number; selectionEnd: number }): boolean {
		if (quality === Quality.Stable) {
			return true;
		}
		return s.selectionStart === 1 && s.selectionEnd === 1;
	}
}
