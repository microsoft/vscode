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

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.openUserSettingsFile();

		await this.code.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value},`);
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
}
