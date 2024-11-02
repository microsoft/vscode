/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInput } from './quickinput';
import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { IElement } from './driver';

export enum Selector {
	TerminalView = `#terminal`,
	CommandDecorationPlaceholder = `.terminal-command-decoration.codicon-terminal-decoration-incomplete`,
	CommandDecorationSuccess = `.terminal-command-decoration.codicon-terminal-decoration-success`,
	CommandDecorationError = `.terminal-command-decoration.codicon-terminal-decoration-error`,
	Xterm = `#terminal .terminal-wrapper`,
	XtermEditor = `.editor-instance .terminal-wrapper`,
	TabsEntry = '.terminal-tabs-entry',
	Description = '.label-description',
	XtermFocused = '.terminal.xterm.focus',
	PlusButton = '.codicon-plus',
	EditorGroups = '.editor .split-view-view',
	EditorTab = '.terminal-tab',
	SingleTab = '.single-terminal-tab',
	Tabs = '.tabs-list .monaco-list-row',
	SplitButton = '.editor .codicon-split-horizontal',
	XtermSplitIndex0 = '#terminal .terminal-groups-container .split-view-view:nth-child(1) .terminal-wrapper',
	XtermSplitIndex1 = '#terminal .terminal-groups-container .split-view-view:nth-child(2) .terminal-wrapper',
	Hide = '.hide'
}

/**
 * Terminal commands that accept a value in a quick input.
 */
export enum TerminalCommandIdWithValue {
	Rename = 'workbench.action.terminal.rename',
	ChangeColor = 'workbench.action.terminal.changeColor',
	ChangeIcon = 'workbench.action.terminal.changeIcon',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell',
	AttachToSession = 'workbench.action.terminal.attachToSession',
	WriteDataToTerminal = 'workbench.action.terminal.writeDataToTerminal'
}

/**
 * Terminal commands that do not present a quick input.
 */
export enum TerminalCommandId {
	Split = 'workbench.action.terminal.split',
	KillAll = 'workbench.action.terminal.killAll',
	Unsplit = 'workbench.action.terminal.unsplit',
	Join = 'workbench.action.terminal.join',
	Show = 'workbench.action.terminal.toggleTerminal',
	CreateNewEditor = 'workbench.action.createTerminalEditor',
	SplitEditor = 'workbench.action.createTerminalEditorSide',
	MoveToPanel = 'workbench.action.terminal.moveToTerminalPanel',
	MoveToEditor = 'workbench.action.terminal.moveToEditor',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell',
	DetachSession = 'workbench.action.terminal.detachSession',
	CreateNew = 'workbench.action.terminal.new'
}
interface TerminalLabel {
	name?: string;
	description?: string;
	icon?: string;
	color?: string;
}
type TerminalGroup = TerminalLabel[];

interface ICommandDecorationCounts {
	placeholder: number;
	success: number;
	error: number;
}

export class Terminal {

	constructor(private code: Code, private quickaccess: QuickAccess, private quickinput: QuickInput) { }

	async runCommand(commandId: TerminalCommandId, expectedLocation?: 'editor' | 'panel'): Promise<void> {
		const keepOpen = commandId === TerminalCommandId.Join;
		await this.quickaccess.runCommand(commandId, { keepOpen });
		if (keepOpen) {
			await this.code.dispatchKeybinding('enter');
			await this.quickinput.waitForQuickInputClosed();
		}
		switch (commandId) {
			case TerminalCommandId.Show:
			case TerminalCommandId.CreateNewEditor:
			case TerminalCommandId.CreateNew:
			case TerminalCommandId.NewWithProfile:
				await this._waitForTerminal(expectedLocation === 'editor' || commandId === TerminalCommandId.CreateNewEditor ? 'editor' : 'panel');
				break;
			case TerminalCommandId.KillAll:
				// HACK: Attempt to kill all terminals to clean things up, this is known to be flaky
				// but the reason why isn't known. This is typically called in the after each hook,
				// Since it's not actually required that all terminals are killed just continue on
				// after 2 seconds.
				await Promise.race([
					this.code.waitForElements(Selector.Xterm, true, e => e.length === 0),
					this.code.wait(2000)
				]);
				break;
		}
	}

	async runCommandWithValue(commandId: TerminalCommandIdWithValue, value?: string, altKey?: boolean): Promise<void> {
		const keepOpen = !!value || commandId === TerminalCommandIdWithValue.NewWithProfile || commandId === TerminalCommandIdWithValue.Rename || (commandId === TerminalCommandIdWithValue.SelectDefaultProfile && value !== 'PowerShell');
		await this.quickaccess.runCommand(commandId, { keepOpen });
		// Running the command should hide the quick input in the following frame, this next wait
		// ensures that the quick input is opened again before proceeding to avoid a race condition
		// where the enter keybinding below would close the quick input if it's triggered before the
		// new quick input shows.
		await this.quickinput.waitForQuickInputOpened();
		if (value) {
			await this.quickinput.type(value);
		} else if (commandId === TerminalCommandIdWithValue.Rename) {
			// Reset
			await this.code.dispatchKeybinding('Backspace');
		}
		await this.code.wait(100);
		await this.code.dispatchKeybinding(altKey ? 'Alt+Enter' : 'enter');
		await this.quickinput.waitForQuickInputClosed();
		if (commandId === TerminalCommandIdWithValue.NewWithProfile) {
			await this._waitForTerminal();
		}
	}

	async runCommandInTerminal(commandText: string, skipEnter?: boolean): Promise<void> {
		await this.code.writeInTerminal(Selector.Xterm, commandText);
		if (!skipEnter) {
			await this.code.dispatchKeybinding('enter');
		}
	}

	/**
	 * Creates a terminal using the new terminal command.
	 * @param expectedLocation The location to check the terminal for, defaults to panel.
	 */
	async createTerminal(expectedLocation?: 'editor' | 'panel'): Promise<void> {
		await this.runCommand(TerminalCommandId.CreateNew, expectedLocation);
		await this._waitForTerminal(expectedLocation);
	}

	/**
	 * Creates an empty terminal by opening a regular terminal and resetting its state such that it
	 * essentially acts like an Pseudoterminal extension API-based terminal. This can then be paired
	 * with `TerminalCommandIdWithValue.WriteDataToTerminal` to make more reliable tests.
	 */
	async createEmptyTerminal(expectedLocation?: 'editor' | 'panel'): Promise<void> {
		await this.createTerminal(expectedLocation);

		// Run a command to ensure the shell has started, this is used to ensure the shell's data
		// does not leak into the "empty terminal"
		await this.runCommandInTerminal('echo "initialized"');
		await this.waitForTerminalText(buffer => buffer.some(line => line.startsWith('initialized')));

		// Erase all content and reset cursor to top
		await this.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, `${csi('2J')}${csi('H')}`);

		// Force windows pty mode off; assume all sequences are rendered in correct position
		if (process.platform === 'win32') {
			await this.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, `${vsc('P;IsWindows=False')}`);
		}
	}

	async assertEditorGroupCount(count: number): Promise<void> {
		await this.code.waitForElements(Selector.EditorGroups, true, editorGroups => editorGroups && editorGroups.length === count);
	}

	async assertSingleTab(label: TerminalLabel, editor?: boolean): Promise<void> {
		let regex = undefined;
		if (label.name && label.description) {
			regex = new RegExp(label.name + ' - ' + label.description);
		} else if (label.name) {
			regex = new RegExp(label.name);
		}
		await this.assertTabExpected(editor ? Selector.EditorTab : Selector.SingleTab, undefined, regex, label.icon, label.color);
	}

	async assertTerminalGroups(expectedGroups: TerminalGroup[]): Promise<void> {
		let expectedCount = 0;
		expectedGroups.forEach(g => expectedCount += g.length);
		let index = 0;
		while (index < expectedCount) {
			for (let groupIndex = 0; groupIndex < expectedGroups.length; groupIndex++) {
				const terminalsInGroup = expectedGroups[groupIndex].length;
				let indexInGroup = 0;
				const isSplit = terminalsInGroup > 1;
				while (indexInGroup < terminalsInGroup) {
					const instance = expectedGroups[groupIndex][indexInGroup];
					const nameRegex = instance.name && isSplit ? new RegExp('\\s*[├┌└]\\s*' + instance.name) : instance.name ? new RegExp(/^\s*/ + instance.name) : undefined;
					await this.assertTabExpected(undefined, index, nameRegex, instance.icon, instance.color, instance.description);
					indexInGroup++;
					index++;
				}
			}
		}
	}

	async getTerminalGroups(): Promise<TerminalGroup[]> {
		const tabCount = (await this.code.waitForElements(Selector.Tabs, true)).length;
		const groups: TerminalGroup[] = [];
		for (let i = 0; i < tabCount; i++) {
			const title = await this.code.waitForElement(`${Selector.Tabs}[data-index="${i}"] ${Selector.TabsEntry}`, e => e?.textContent?.length ? e?.textContent?.length > 1 : false);
			const description: IElement | undefined = await this.code.waitForElement(`${Selector.Tabs}[data-index="${i}"] ${Selector.TabsEntry} ${Selector.Description}`, () => true);

			const label: TerminalLabel = {
				name: title.textContent.replace(/^[├┌└]\s*/, ''),
				description: description?.textContent
			};
			// It's a new group if the the tab does not start with ├ or └
			if (title.textContent.match(/^[├└]/)) {
				groups[groups.length - 1].push(label);
			} else {
				groups.push([label]);
			}
		}
		return groups;
	}

	async getSingleTabName(): Promise<string> {
		const tab = await this.code.waitForElement(Selector.SingleTab, singleTab => !!singleTab && singleTab?.textContent.length > 1);
		return tab.textContent;
	}

	private async assertTabExpected(selector?: string, listIndex?: number, nameRegex?: RegExp, icon?: string, color?: string, description?: string): Promise<void> {
		if (listIndex) {
			if (nameRegex) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry}`, entry => !!entry && !!entry?.textContent.match(nameRegex));
				if (description) {
					await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry} ${Selector.Description}`, e => !!e && e.textContent === description);
				}
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
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab.className.includes(`terminal-icon-terminal_ansi${color}`));
			}
			if (icon) {
				selector = selector === Selector.EditorTab ? selector : `${selector} .codicon`;
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab.className.includes(icon));
			}
		}
	}

	async assertTerminalViewHidden(): Promise<void> {
		await this.code.waitForElement(Selector.TerminalView, result => result === undefined);
	}

	async assertCommandDecorations(expectedCounts?: ICommandDecorationCounts, customIcon?: { updatedIcon: string; count: number }, showDecorations?: 'both' | 'gutter' | 'overviewRuler' | 'never'): Promise<void> {
		if (expectedCounts) {
			const placeholderSelector = showDecorations === 'overviewRuler' ? `${Selector.CommandDecorationPlaceholder}${Selector.Hide}` : Selector.CommandDecorationPlaceholder;
			await this.code.waitForElements(placeholderSelector, true, decorations => decorations && decorations.length === expectedCounts.placeholder);
			const successSelector = showDecorations === 'overviewRuler' ? `${Selector.CommandDecorationSuccess}${Selector.Hide}` : Selector.CommandDecorationSuccess;
			await this.code.waitForElements(successSelector, true, decorations => decorations && decorations.length === expectedCounts.success);
			const errorSelector = showDecorations === 'overviewRuler' ? `${Selector.CommandDecorationError}${Selector.Hide}` : Selector.CommandDecorationError;
			await this.code.waitForElements(errorSelector, true, decorations => decorations && decorations.length === expectedCounts.error);
		}

		if (customIcon) {
			await this.code.waitForElements(`.terminal-command-decoration.codicon-${customIcon.updatedIcon}`, true, decorations => decorations && decorations.length === customIcon.count);
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

	async waitForTerminalText(accept: (buffer: string[]) => boolean, message?: string, splitIndex?: 0 | 1): Promise<void> {
		try {
			let selector: string = Selector.Xterm;
			if (splitIndex !== undefined) {
				selector = splitIndex === 0 ? Selector.XtermSplitIndex0 : Selector.XtermSplitIndex1;
			}
			await this.code.waitForTerminalBuffer(selector, accept);
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

	/**
	 * Waits for the terminal to be focused and to contain content.
	 * @param expectedLocation The location to check the terminal for, defaults to panel.
	 */
	private async _waitForTerminal(expectedLocation?: 'editor' | 'panel'): Promise<void> {
		await this.code.waitForElement(Selector.XtermFocused);
		await this.code.waitForTerminalBuffer(expectedLocation === 'editor' ? Selector.XtermEditor : Selector.Xterm, lines => lines.some(line => line.length > 0));
	}
}

function vsc(data: string) {
	return setTextParams(`633;${data}`);
}

function setTextParams(data: string) {
	return osc(`${data}\\x07`);
}

function osc(data: string) {
	return `\\x1b]${data}`;
}

function csi(data: string) {
	return `\\x1b[${data}`;
}
