/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
};

export class SettingsEditor {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	async openUserSettings(): Promise<void> {
		await this.spectron.command('workbench.action.openGlobalSettings');
		await this.spectron.client.waitForActiveElement('.settings-search-input input');
	}

	async focusEditableSettings(): Promise<void> {
		await this.spectron.client.keys(['ArrowDown', 'NULL'], false);
		await this.spectron.client.waitForActiveElement('.editable-preferences-editor-container .monaco-editor textarea');
		await this.spectron.client.keys(['ArrowRight', 'NULL'], false);
	}

	async addUserSetting(setting: string, value: string): Promise<void> {
		await this.openUserSettings();

		await this.focusEditableSettings();
		await this.spectron.client.keys(`"${setting}": ${value},`);
		await this.spectron.workbench.saveOpenedFile();
	}
}