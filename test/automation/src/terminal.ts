/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInput } from '.';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

const TERMINAL_VIEW_SELECTOR = `#terminal`;
const XTERM_SELECTOR = `${TERMINAL_VIEW_SELECTOR} .terminal-wrapper`;
const XTERM_TEXTAREA = `${XTERM_SELECTOR} textarea.xterm-helper-textarea`;
const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;

export class Terminal {

	constructor(private code: Code, private quickaccess: QuickAccess, private quickinput: QuickInput) { }

	async showTerminal(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.terminal.toggleTerminal');
		await this.code.waitForActiveElement(XTERM_TEXTAREA);
		await this.code.waitForTerminalBuffer(XTERM_SELECTOR, lines => lines.some(line => line.length > 0));
	}

	async killTerminal(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.terminal.kill');
	}

	async runCommand(commandText: string): Promise<void> {
		await this.code.writeInTerminal(XTERM_SELECTOR, commandText);
		// hold your horses
		await new Promise(c => setTimeout(c, 500));
		await this.code.dispatchKeybinding('enter');
	}

	async runProfileCommand(type: 'createInstance' | 'setDefault', contributed?: boolean): Promise<void> {
		const command = type === 'createInstance' ? 'Terminal: Create New Terminal (With Profile)' : 'Terminal: Select Default Profile';
		if (contributed) {
			await this.quickaccess.runCommand(command, 0, true);
			this.quickinput.submit(CONTRIBUTED_PROFILE_NAME);
		} else {
			await this.quickinput.waitForQuickInputElements(names => names[0] !== CONTRIBUTED_PROFILE_NAME);
			await this.quickaccess.runCommand(command, 0, true);
			await this.quickinput.selectQuickInputElement(0, false);
		}
		await new Promise(c => setTimeout(c, 500));
	}

	async waitForTerminalText(accept: (buffer: string[]) => boolean, message?: string): Promise<void> {
		try {
			await this.code.waitForTerminalBuffer(XTERM_SELECTOR, accept);
		} catch (err: any) {
			if (message) {
				throw new Error(`${message}\n\nInner exception:\n${err.message}`);
			}
			throw err;
		}
	}
}
