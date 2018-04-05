/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../client';
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
		await this.api.keys(['Enter', 'NULL']);
	}

	async waitForTerminalText(fn: (text: string[]) => boolean, timeOutDescription: string = 'Getting Terminal Text'): Promise<string[]> {
		return this.api.waitFor(async () => {
			const terminalText = await this.getTerminalText();
			if (fn(terminalText)) {
				return terminalText;
			}
			return undefined;
		}, void 0, timeOutDescription);
	}

	getCurrentLineNumber(): Promise<number> {
		return this.getTerminalText().then(text => text.length);
	}

	private async getTerminalText(): Promise<string[]> {
		return await this.api.selectorExecute(XTERM_SELECTOR,
			div => {
				const xterm = (<any>(Array.isArray(div) ? div[0] : div)).xterm;
				const buffer = xterm.buffer;
				const lines: string[] = [];
				for (let i = 0; i < buffer.lines.length; i++) {
					lines.push(buffer.translateBufferLineToString(i, true));
				}
				return lines;
			}
		);
	}
}