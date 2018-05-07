/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Commands } from '../workbench/workbench';
import { Editor } from '../editor/editor';
import { Editors } from '../editor/editors';
import { Code } from '../../vscode/code';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
}

const SEARCH_INPUT = '.settings-search-input input';

export class SettingsEditor {

	constructor(private code: Code, private userDataPath: string, private commands: Commands, private editors: Editors, private editor: Editor) { }

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.commands.runCommand('workbench.action.openSettings');
		await this.code.waitAndClick(SEARCH_INPUT);
		await this.code.waitForActiveElement(SEARCH_INPUT);

		await this.editor.waitForEditorFocus('settings.json', 1, '.editable-preferences-editor-container');

		await this.code.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value}`, '.editable-preferences-editor-container');
		await this.editors.saveOpenedFile();
	}

	async clearUserSettings(): Promise<void> {
		const settingsPath = path.join(this.userDataPath, 'User', 'settings.json');
		await new Promise((c, e) => fs.writeFile(settingsPath, '{}', 'utf8', err => err ? e(err) : c()));

		await this.commands.runCommand('workbench.action.openSettings');
		await this.editor.waitForEditorContents('settings.json', c => c === '{}', '.editable-preferences-editor-container');
	}
}