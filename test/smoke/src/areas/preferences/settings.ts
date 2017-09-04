/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Element } from 'webdriverio';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
};

export class SettingsEditor {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async openUserSettings(): Promise<Element> {
		await this.spectron.command('workbench.action.openGlobalSettings');
		return this.spectron.client.waitForElement('.settings-search-input input:focus');
	}

	public async focusEditableSettings(): Promise<void> {
		await this.spectron.client.keys(['ArrowDown', 'NULL'], false);
		await this.spectron.client.waitForElement(`.editable-preferences-editor-container .monaco-editor.focused`);
		await this.spectron.client.keys(['ArrowRight', 'NULL'], false);
	}

	public async addUserSetting(setting: string, value: string): Promise<void> {
		await this.openUserSettings();

		// await this.spectron.wait(1);
		await this.focusEditableSettings();
		await this.spectron.client.keys(`"${setting}": ${value}`);
		await this.spectron.workbench.saveOpenedFile();
	}
}