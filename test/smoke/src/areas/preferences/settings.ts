/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Editor } from '../editor/editor';
import { Editors } from '../editor/editors';
import { Code } from '../../vscode/code';
import { QuickOpen } from '../quickopen/quickopen';

export const enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
}

export class SettingsEditor {

	constructor(private code: Code, private userDataPath: string, private editors: Editors, private editor: Editor, private quickopen: QuickOpen) { }

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.openSettings();
		await this.editor.waitForEditorFocus('settings.json', 1);

		await this.code.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value}`);
		await this.editors.saveOpenedFile();
	}

	async clearUserSettings(): Promise<void> {
		const settingsPath = path.join(this.userDataPath, 'User', 'settings.json');
		await new Promise((c, e) => fs.writeFile(settingsPath, '{\n}', 'utf8', err => err ? e(err) : c()));

		await this.openSettings();
		await this.editor.waitForEditorContents('settings.json', c => c === '{}');
	}

	private async openSettings(): Promise<void> {
		await this.quickopen.runCommand('Preferences: Open Settings (JSON)');
	}
}
