/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { SpectronApplication } from '../../spectron/application';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
}

const SEARCH_INPUT = '.settings-search-input input';
const EDITOR = '.editable-preferences-editor-container .monaco-editor textarea';

export class SettingsEditor {

	constructor(private spectron: SpectronApplication) { }

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.spectron.runCommand('workbench.action.openGlobalSettings');
		await this.spectron.client.waitAndClick(SEARCH_INPUT);
		await this.spectron.client.waitForActiveElement(SEARCH_INPUT);

		await this.spectron.client.keys(['ArrowDown', 'NULL']);
		await this.spectron.client.waitForActiveElement(EDITOR);

		await this.spectron.client.keys(['ArrowRight', 'NULL']);
		await this.spectron.screenCapturer.capture('user settings is open and focused');

		await this.spectron.workbench.editor.waitForTypeInEditor('settings.json', `"${setting}": ${value}`, '.editable-preferences-editor-container');
		await this.spectron.workbench.saveOpenedFile();

		await this.spectron.screenCapturer.capture('user settings has changed');
	}

	async clearUserSettings(): Promise<void> {
		const settingsPath = path.join(this.spectron.userDataPath, 'User', 'settings.json');
		await new Promise((c, e) => fs.writeFile(settingsPath, '{}', 'utf8', err => err ? e(err) : c()));

		await this.spectron.workbench.editor.waitForEditorContents('settings.json', c => c.length === 0, '.editable-preferences-editor-container');
	}
}