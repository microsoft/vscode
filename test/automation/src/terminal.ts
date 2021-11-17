/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElement, QuickInput } from '.';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

const TERMINAL_VIEW_SELECTOR = `#terminal`;
const XTERM_SELECTOR = `${TERMINAL_VIEW_SELECTOR} .terminal-wrapper`;
const TABS = '.tabs-list .terminal-tabs-entry';
const XTERM_FOCUSED_SELECTOR = '.terminal.xterm.focus';
const PLUS_BUTTON_SELECTOR = 'li.action-item.monaco-dropdown-with-primary .codicon-plus';
const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;

export enum TerminalCommandIdWithValue {
	Rename = 'workbench.action.terminal.rename',
	ChangeColor = 'workbench.action.terminal.changeColor',
	ChangeIcon = 'workbench.action.terminal.changeIcon',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell'
}

export enum TerminalCommandId {
	Split = 'workbench.action.terminal.split',
	KillAll = 'workbench.action.terminal.killAll',
	Unsplit = 'workbench.action.terminal.unsplit',
	Join = 'workbench.action.terminal.join',
	Show = 'workbench.action.terminal.toggleTerminal',
	CreateNew = 'workbench.action.terminal.new',
	CreateNewEditor = 'workbench.action.createTerminalEditor',
	SplitEditor = 'workbench.action.createTerminalEditorSide',
	MoveToPanel = 'workbench.action.terminal.moveToTerminalPanel',
	MoveToEditor = 'workbench.action.terminal.moveToEditor'
}
type NotContributedProfile = boolean;
interface TerminalLabel {
	name?: string | NotContributedProfile,
	icon?: string,
	color?: string
}
type TerminalGroup = TerminalLabel[];

export class Terminal {

	constructor(private code: Code, private quickaccess: QuickAccess, private quickinput: QuickInput) { }

	async runCommand(commandId: TerminalCommandId): Promise<void> {
		await this.quickaccess.runCommand(commandId, commandId === TerminalCommandId.Join);
		if (commandId === TerminalCommandId.Show || commandId === TerminalCommandId.CreateNew) {
			return await this._waitForTerminal();
		}
		await this.code.dispatchKeybinding('enter');
		await this.quickinput.waitForQuickInputClosed();
	}

	async runCommandWithValue(commandId: TerminalCommandIdWithValue, value?: string, altKey?: boolean): Promise<void> {
		const shouldKeepOpen = !!value || commandId === TerminalCommandIdWithValue.SelectDefaultProfile || commandId === TerminalCommandIdWithValue.NewWithProfile;
		await this.quickaccess.runCommand(commandId, shouldKeepOpen);
		if (value) {
			await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, value);
		}
		await this.code.dispatchKeybinding(altKey ? 'Alt+Enter' : 'enter');
		await this.quickinput.waitForQuickInputClosed();
	}

	async runCommandInTerminal(commandText: string): Promise<void> {
		await this.code.writeInTerminal(XTERM_SELECTOR, commandText);
		// hold your horses
		await new Promise(c => setTimeout(c, 500));
		await this.code.dispatchKeybinding('enter');
	}

	async assertTerminalGroups(expectedGroups: TerminalGroup[]): Promise<boolean> {
		const tabs = await this.code.waitForElements(TABS, true, e => e.every(elt => elt.textContent.trim().length > 1));
		let index = 0;
		for (let groupIndex = 0; groupIndex < expectedGroups.length; groupIndex++) {
			let terminalsInGroup = expectedGroups[groupIndex].length;
			let indexInGroup = 0;
			let instance = expectedGroups[groupIndex][indexInGroup];
			while (indexInGroup < terminalsInGroup) {
				// splits
				if (!this.tabMatchesExpected(tabs[index], terminalsInGroup > 1, instance.name, instance.icon)) {
					throw new Error(`Expected a split ${terminalsInGroup > 1} terminal with name ${instance.name} and icon ${instance.icon} but class was ${tabs[index].className} and text content was ${tabs[index].textContent}`);
				}
				indexInGroup++;
				instance = expectedGroups[groupIndex][indexInGroup];
				index++;
			}
		}
		return true;
	}

	private async tabMatchesExpected(tab: IElement, split: boolean, name?: string | boolean, icon?: string, color?: string): Promise<boolean> {
		const noSplitDecoration = tab.textContent.startsWith(' ');
		if ((split && noSplitDecoration) || (!split && !noSplitDecoration)) {
			throw new Error(`Expected a split terminal ${split} and had split decoration ${!noSplitDecoration}`);
		}
		let expected = true;
		if (icon) {
			expected = tab.className.includes(icon);
		}
		if (color) {
			expected = expected && tab.children.some(c => c.className.includes(color));
		}
		if (name) {
			if (typeof name === 'string') {
				expected = expected && tab.textContent.trim().includes(name);
			} else {
				expected = expected && !tab.textContent.trim().includes(CONTRIBUTED_PROFILE_NAME);
			}
		}
		return expected;
	}

	async clickPlusButton(): Promise<void> {
		this.code.waitAndClick(PLUS_BUTTON_SELECTOR);
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

	async getPage(): Promise<any> {
		return (this.code.driver as any).page;
	}

	private async _waitForTerminal(): Promise<void> {
		await this.code.waitForElement(XTERM_FOCUSED_SELECTOR);
		await this.code.waitForTerminalBuffer(XTERM_SELECTOR, lines => lines.some(line => line.length > 0));
	}
}
