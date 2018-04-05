/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../client';
import { Commands } from '../workbench/workbench';

const SEARCH_INPUT = '.settings-search-input input';

export class KeybindingsEditor {

	constructor(private api: API, private commands: Commands) { }

	async updateKeybinding(command: string, keys: string[], ariaLabel: string): Promise<any> {
		await this.commands.runCommand('workbench.action.openGlobalKeybindings');
		await this.api.waitForActiveElement(SEARCH_INPUT);
		await this.api.setValue(SEARCH_INPUT, command);

		await this.api.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item');
		await this.api.waitForElement('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item.focused.selected');

		await this.api.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item .action-item .icon.add');
		await this.api.waitForElement('.defineKeybindingWidget .monaco-inputbox.synthetic-focus');

		await this.api.keys([...keys, 'NULL', 'Enter', 'NULL']);
		await this.api.waitForElement(`div[aria-label="Keybindings"] div[aria-label="Keybinding is ${ariaLabel}."]`);
	}
}