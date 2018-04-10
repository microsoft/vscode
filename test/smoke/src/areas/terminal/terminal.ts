/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../api';
import { Commands } from '../workbench/workbench';

const PANEL_SELECTOR = 'div[id="workbench.panel.terminal"]';
const XTERM_SELECTOR = `${PANEL_SELECTOR} .terminal-wrapper`;

export class Terminal {

	constructor(private api: API, private commands: Commands) { }

	async showTerminal(): Promise<void> {
		if (!await this.isVisible()) {
			await this.commands.runCommand('View: Toggle Integrated Terminal');
			await this.api.waitForElement(XTERM_SELECTOR);
			await this.waitForTerminalText(text => text.length > 0, 'Waiting for Terminal to be ready');
		}
	}

	isVisible(): Promise<boolean> {
		return this.api.doesElementExist(PANEL_SELECTOR);
	}

	async runCommand(commandText: string): Promise<void> {
		// TODO@Tyriar fix this. we should not use type but setValue
		// await this.spectron.client.type(commandText);
		await this.api.dispatchKeybinding('enter');
	}

	async waitForTerminalText(fn: (text: string[]) => boolean, timeOutDescription: string = 'Getting Terminal Text'): Promise<void> {
		await this.api.waitFor(async () => {
			const terminalText = await this.api.getTerminalBuffer(XTERM_SELECTOR);
			return fn(terminalText);
		}, void 0, timeOutDescription);
	}

	async getCurrentLineNumber(): Promise<number> {
		const terminalText = await this.api.getTerminalBuffer(XTERM_SELECTOR);
		return terminalText.length;
	}
}