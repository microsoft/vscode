/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElement, QuickInput } from '.';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

const TERMINAL_VIEW_SELECTOR = `#terminal`;
const XTERM_SELECTOR = `${TERMINAL_VIEW_SELECTOR} .terminal-wrapper`;
const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;
const TABS = '.tabs-list .terminal-tabs-entry';
const XTERM_TEXTAREA = `${XTERM_SELECTOR} textarea.xterm-helper-textarea`;
export class Terminal {

	constructor(private code: Code, private quickaccess: QuickAccess, private quickinput: QuickInput) { }

	async show(): Promise<void> {
		await this.code.dispatchKeybinding('Control+`');
		await this.code.waitForActiveElement(XTERM_TEXTAREA);
		await this.code.waitForTerminalBuffer(XTERM_SELECTOR, lines => lines.some(line => line.length > 0));
	}

	async createNew(): Promise<void> {
		await this.code.dispatchKeybinding('Control+Shift+`');
		await this.code.waitForActiveElement(XTERM_TEXTAREA);
		await this.code.waitForTerminalBuffer(XTERM_SELECTOR, lines => lines.some(line => line.length > 0));
	}

	async runCommand(commandId: string, value?: string): Promise<void> {
		await this.quickaccess.runCommand(commandId, !!value);
		if (value) {
			await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, value);
			await this.code.dispatchKeybinding('enter');
			await this.quickinput.waitForQuickInputClosed();
		}
	}

	async runCommandInTerminal(commandText: string): Promise<void> {
		await this.code.writeInTerminal(XTERM_SELECTOR, commandText);
		// hold your horses
		await new Promise(c => setTimeout(c, 500));
		await this.code.dispatchKeybinding('enter');
	}

	async getTabLabels(expectedCount: number, splits?: boolean, accept?: (result: IElement[]) => boolean): Promise<string[]> {
		const result: string[] = [];
		const tabs = await this.code.waitForElements(TABS, true, e => accept ? accept(e) : e.length === expectedCount && (!splits || e.some(e => e.textContent.startsWith('┌'))) && e.every(element => element.textContent.trim().length > 1));
		for (const t of tabs) {
			result.push(t.textContent);
		}
		if (!result[0].startsWith('┌')) {
			const first = result[1];
			const second = result[0];
			return [first, second];
		}
		return result;
	}

	async runProfileCommand(type: 'createInstance' | 'setDefault', contributed?: boolean, altKey?: boolean): Promise<void> {
		const command = type === 'createInstance' ? 'Terminal: Create New Terminal (With Profile)' : 'Terminal: Select Default Profile';
		if (contributed) {
			await this.quickaccess.runCommand(command, true);
			await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, CONTRIBUTED_PROFILE_NAME);
		} else {
			await this.quickaccess.runCommand(command, true);
			await this.code.dispatchKeybinding('down');
		}
		await this.code.dispatchKeybinding(altKey ? 'Alt+Enter' : 'enter');
		await this.quickinput.waitForQuickInputClosed();
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
