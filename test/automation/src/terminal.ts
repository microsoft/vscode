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
const PLUS_BUTTON_SELECTOR = '.codicon-plus';
const EDITOR_GROUPS_SELECTOR = '.editor .split-view-view';
const EDITOR_TAB_SELECTOR = '.terminal-tab';
const SINGLE_TAB_SELECTOR = '.single-terminal-tab';

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
	MoveToEditor = 'workbench.action.terminal.moveToEditor',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell'
}
interface TerminalLabel {
	name?: string,
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

	async assertEditorGroupCount(count: number): Promise<void> {
		await this.code.waitForElements(EDITOR_GROUPS_SELECTOR, true, editorGroups => editorGroups && editorGroups.length === count);
	}

	async assertSingleTab(label: TerminalLabel, editor?: boolean): Promise<void> {
		const selector = editor ? EDITOR_TAB_SELECTOR : SINGLE_TAB_SELECTOR;
		const element = await this.code.waitForElement(selector, elt => elt ? elt.textContent.trim().length > 1 : false);
		await this.assertTabExpected(element, false, label.name, label.icon, label.color);
	}

	async assertTerminalGroups(expectedGroups: TerminalGroup[]): Promise<void> {
		const tabs = await this.code.waitForElements(TABS, true, e => e.every(elt => elt.textContent.trim().length > 1));
		let index = 0;
		for (let groupIndex = 0; groupIndex < expectedGroups.length; groupIndex++) {
			let terminalsInGroup = expectedGroups[groupIndex].length;
			let indexInGroup = 0;
			const isSplit = terminalsInGroup > 1;
			while (indexInGroup < terminalsInGroup) {
				let instance = expectedGroups[groupIndex][indexInGroup];
				const expected = await this.assertTabExpected(tabs[index], isSplit, instance.name, instance.icon, instance.color);
				if (!expected) {
					throw new Error(`Expected a split ${isSplit} terminal with name ${instance.name} and icon ${instance.icon} but class was ${tabs[index].className} and text content was ${tabs[index].textContent}`);
				}
				indexInGroup++;
				index++;
			}
		}
	}

	private async assertTabExpected(tab: IElement, split: boolean, name?: string, icon?: string, color?: string): Promise<boolean> {
		const splitDecoration = tab.textContent.match(/^[├┌└]/);
		if ((split && !splitDecoration) || (!split && splitDecoration)) {
			throw new Error(`Expected a split terminal ${split} and had split decoration ${splitDecoration}`);
		}
		let expected = true;
		if (icon) {
			expected = tab.className.includes(icon);
		}
		if (color) {
			expected = expected && tab.children.some(c => c.className.includes(color));
		}
		if (name) {
			expected = expected && name === '*' || tab.textContent.includes(name);
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
