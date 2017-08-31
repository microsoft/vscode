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

	public async openUserSettings(): Promise<void> {
		await this.spectron.command('workbench.action.openGlobalSettings');
		return this.spectron.client.element('.settings-search-input .synthetic-focus');
	}

	public async focusEditableSettings(): Promise<void> {
		await this.spectron.client.keys(['ArrowDown', 'NULL'], false);
		await this.spectron.client.element(`.editable-preferences-editor-container .monaco-editor.focused`);
		await this.spectron.client.keys(['ArrowRight', 'NULL'], false);
	}

}