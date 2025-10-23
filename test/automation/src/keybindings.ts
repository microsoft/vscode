/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

const SEARCH_INPUT = '.keybindings-header .settings-search-input input';

export class KeybindingsEditor {

	constructor(private code: Code) { }

	async updateKeybinding(command: string, commandName: string | undefined, keybinding: string, keybindingTitle: string): Promise<any> {
		const accept = () => this.code.waitForActiveElement(SEARCH_INPUT);
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+k cmd+s', accept);
		} else {
			await this.code.dispatchKeybinding('ctrl+k ctrl+s', accept);
		}

		await this.code.waitForActiveElement(SEARCH_INPUT);
		await this.code.waitForSetValue(SEARCH_INPUT, `@command:${command}`);

		const commandTitle = commandName ? `${commandName} (${command})` : command;
		await this.code.waitAndClick(`.keybindings-table-container .monaco-list-row .command[aria-label="${commandTitle}"]`);
		await this.code.waitForElement(`.keybindings-table-container .monaco-list-row.focused.selected .command[aria-label="${commandTitle}"]`);
		await this.code.dispatchKeybinding('enter', () => this.code.waitForActiveElement('.defineKeybindingWidget .monaco-inputbox input'));
		await this.code.dispatchKeybinding(keybinding, async () => { }); // No accept cb is fine as the following keybinding verifies
		await this.code.dispatchKeybinding('enter', async () => { await this.code.waitForElement(`.keybindings-table-container .keybinding-label div[aria-label="${keybindingTitle}"]`); });
	}
}
