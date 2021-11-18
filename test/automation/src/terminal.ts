/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInput } from '.';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

export enum Selector {
	TerminalView = `#terminal`,
	Xterm = `#terminal .terminal-wrapper`,
	TabsEntry = '.terminal-tabs-entry',
	XtermFocused = '.terminal.xterm.focus',
	PlusButton = '.codicon-plus',
	EditorGroups = '.editor .split-view-view',
	EditorTab = '.terminal-tab',
	EditorTabIcon = '.terminal-tab.codicon-',
	SingleTab = '.single-terminal-tab',
	Tabs = '.tabs-list .monaco-list-row',
	SplitButton = '.editor .codicon-split-horizontal'
}

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
		await this.code.writeInTerminal(Selector.Xterm, commandText);
		// hold your horses
		await new Promise(c => setTimeout(c, 500));
		await this.code.dispatchKeybinding('enter');
	}

	async assertEditorGroupCount(count: number): Promise<void> {
		await this.code.waitForElements(Selector.EditorGroups, true, editorGroups => editorGroups && editorGroups.length === count);
	}

	async assertSingleTab(label: TerminalLabel, editor?: boolean): Promise<void> {
		await this.assertTabExpected(editor ? Selector.EditorTab : Selector.SingleTab, undefined, label.name ? new RegExp(label.name) : undefined, label.icon, label.color);
	}

	async assertTerminalGroups(expectedGroups: TerminalGroup[]): Promise<void> {
		let expectedCount = 0;
		expectedGroups.forEach(g => expectedCount += g.length);
		let index = 0;
		while (index < expectedCount) {
			for (let groupIndex = 0; groupIndex < expectedGroups.length; groupIndex++) {
				let terminalsInGroup = expectedGroups[groupIndex].length;
				let indexInGroup = 0;
				const isSplit = terminalsInGroup > 1;
				while (indexInGroup < terminalsInGroup) {
					let instance = expectedGroups[groupIndex][indexInGroup];
					const nameRegex = instance.name && isSplit ? new RegExp('\\s*[├┌└]\\s*' + instance.name) : instance.name ? new RegExp(/^\s*/ + instance.name) : undefined;
					await this.assertTabExpected(undefined, index, nameRegex, instance.icon, instance.color);
					indexInGroup++;
					index++;
				}
			}
		}
	}

	private async assertTabExpected(selector?: string, listIndex?: number, nameRegex?: RegExp, icon?: string, color?: string): Promise<void> {
		if (listIndex) {
			if (nameRegex) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry}`, entry => !!entry && !!entry?.textContent.match(nameRegex));
			}
			if (color) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry} .monaco-icon-label.terminal-icon-terminal_ansi${color}`);
			}
			if (icon) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry} .codicon-${icon}`);
			}
		} else if (selector) {
			if (nameRegex) {
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab?.textContent.match(nameRegex));
			}
			if (color) {
				await this.code.waitForElement(`${selector}.terminal-icon-terminal_ansi${color}`);
			}
			if (icon) {
				await this.code.waitForElement(selector === Selector.EditorTab ? `${Selector.EditorTabIcon}${icon}` : `${selector} .codicon-${icon}`);
			}
		}
	}

	async clickPlusButton(): Promise<void> {
		await this.code.waitAndClick(Selector.PlusButton);
	}

	async clickSplitButton(): Promise<void> {
		await this.code.waitAndClick(Selector.SplitButton);
	}

	async clickSingleTab(): Promise<void> {
		await this.code.waitAndClick(Selector.SingleTab);
	}

	async waitForTerminalText(accept: (buffer: string[]) => boolean, message?: string): Promise<void> {
		try {
			await this.code.waitForTerminalBuffer(Selector.Xterm, accept);
		} catch (err: any) {
			if (message) {
				throw new Error(`${message} \n\nInner exception: \n${err.message} `);
			}
			throw err;
		}
	}

	async getPage(): Promise<any> {
		return (this.code.driver as any).page;
	}

	private async _waitForTerminal(): Promise<void> {
		await this.code.waitForElement(Selector.XtermFocused);
		await this.code.waitForTerminalBuffer(Selector.Xterm, lines => lines.some(line => line.length > 0));
	}
}
