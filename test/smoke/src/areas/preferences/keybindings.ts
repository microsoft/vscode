/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Commands } from '../workbench/workbench';
import { Code } from '../../vscode/code';

const SEARCH_INPUT = '.settings-search-input input';

export class KeybindingsEditor {

	constructor(private code: Code, private commands: Commands) { }

	async updateKeybinding(command: string, keybinding: string, ariaLabel: string): Promise<any> {
		await this.commands.runCommand('workbench.action.openGlobalKeybindings');
		await this.code.waitForActiveElement(SEARCH_INPUT);
		await this.code.setValue(SEARCH_INPUT, command);

		await this.code.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item');
		await this.code.waitForElement('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item.focused.selected');

		await this.code.waitAndClick('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item .action-item .icon.add');
		await this.code.waitForElement('.defineKeybindingWidget .monaco-inputbox.synthetic-focus');

		await this.code.dispatchKeybinding(keybinding);
		await this.code.dispatchKeybinding('enter');
		await this.code.waitForElement(`div[aria-label="Keybindings"] div[aria-label="Keybinding is ${ariaLabel}."]`);
	}
}