/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class KeybindingsEditor {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async openKeybindings(): Promise<void> {
		await this.spectron.command('workbench.action.openGlobalKeybindings');
		await this.spectron.client.waitForElement('.settings-search-input .synthetic-focus');
	}

	public async search(text: string, select: boolean = false): Promise<void> {
		await this.spectron.type(text);
		if (select) {
			await this.spectron.client.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item');
			await this.spectron.client.waitForElement('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item.focused.selected');
		}
	}

	public async openDefineKeybindingDialog(): Promise<any> {
		await this.spectron.client.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item .action-item .icon.add');
		return this.spectron.client.waitForElement('.defineKeybindingWidget .monaco-inputbox.synthetic-focus');
	}

	public async updateKeybinding(command: string, keys: string[], ariaLabel: string): Promise<any> {
		await this.search(command, true);
		await this.openDefineKeybindingDialog();
		await this.spectron.client.keys(keys);
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.spectron.client.waitForElement(`div[aria-label="Keybindings"] div[aria-label="Keybinding is ${ariaLabel}."]`);
	}

}