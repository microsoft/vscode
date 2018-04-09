/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { API } from '../../api';
import { Commands } from '../workbench/workbench';
import { Editor } from '../editor/editor';
import { Editors } from '../editor/editors';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
}

const SEARCH_INPUT = '.settings-search-input input';
const EDITOR = '.editable-preferences-editor-container .monaco-editor textarea';

export class SettingsEditor {

	constructor(private api: API, private userDataPath: string, private commands: Commands, private editors: Editors, private editor: Editor) { }

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.commands.runCommand('workbench.action.openGlobalSettings');
		await this.api.waitAndClick(SEARCH_INPUT);
		await this.api.waitForActiveElement(SEARCH_INPUT);

		await this.api.dispatchKeybinding('down');
		await this.api.waitForActiveElement(EDITOR);

		await this.api.dispatchKeybinding('right');
		await this.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value}`, '.editable-preferences-editor-container');
		await this.editors.saveOpenedFile();
	}

	async clearUserSettings(): Promise<void> {
		const settingsPath = path.join(this.userDataPath, 'User', 'settings.json');
		await new Promise((c, e) => fs.writeFile(settingsPath, '{}', 'utf8', err => err ? e(err) : c()));

		await this.editor.waitForEditorContents('settings.json', c => c.length === 0, '.editable-preferences-editor-container');
	}
}