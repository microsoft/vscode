/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor } from './editor';
import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { Editors } from './editors';
import { QuickInput } from './quickinput';
import { Terminal } from './terminal';
import { wait } from './playwrightDriver';

interface ITaskConfigurationProperties {
	label?: string;
	type?: string;
	command?: string;
	identifier?: string;
	group?: string;
	isBackground?: boolean;
	promptOnClose?: boolean;
	icon?: { id?: string; color?: string };
	hide?: boolean;
}

export enum TaskCommandId {
	TerminalRename = 'workbench.action.terminal.rename'
}

export class Task {

	constructor(private code: Code, private editor: Editor, private editors: Editors, private quickaccess: QuickAccess, private quickinput: QuickInput, private terminal: Terminal) {

	}

	async assertTasks(filter: string, expected: ITaskConfigurationProperties[], type: 'run' | 'configure') {
		await this.code.sendKeybinding('right');
		// TODO https://github.com/microsoft/vscode/issues/242535
		await wait(100);
		await this.editors.saveOpenedFile();
		type === 'run' ? await this.quickaccess.runCommand('workbench.action.tasks.runTask', { keepOpen: true }) : await this.quickaccess.runCommand('workbench.action.tasks.configureTask', { keepOpen: true });
		if (expected.length === 0) {
			await this.quickinput.waitForQuickInputElements(e => e.length > 1 && e.every(label => label.trim() !== filter.trim()));
		} else {
			await this.quickinput.waitForQuickInputElements(e => e.length > 1 && e.some(label => label.trim() === filter.trim()));
		}
		if (expected.length > 0 && !expected[0].hide) {
			// select the expected task
			await this.quickinput.selectQuickInputElement(0, true);
			// Continue without scanning the output
			await this.quickinput.selectQuickInputElement(0);
			if (expected[0].icon) {
				await this.terminal.assertSingleTab({ color: expected[0].icon.color, icon: expected[0].icon.id || 'tools' });
			}
		}
		await this.quickinput.closeQuickInput();
	}

	async configureTask(properties: ITaskConfigurationProperties) {
		await this.quickaccess.openFileQuickAccessAndWait('tasks.json', 'tasks.json');
		await this.quickinput.selectQuickInputElement(0);
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.sendKeybinding('Delete');
		// TODO https://github.com/microsoft/vscode/issues/242535
		await wait(100);
		const taskStringLines: string[] = [
			'{', // Brackets auto close
			'"version": "2.0.0",',
			'"tasks": [{' // Brackets auto close
		];
		for (let [key, value] of Object.entries(properties)) {
			if (typeof value === 'object') {
				value = JSON.stringify(value);
			} else if (typeof value === 'boolean') {
				value = value;
			} else if (typeof value === 'string') {
				value = `"${value}"`;
			} else {
				throw new Error('Unsupported task property value type');
			}
			taskStringLines.push(`"${key}": ${value},`);
		}
		for (const [i, line] of taskStringLines.entries()) {
			await this.editor.waitForTypeInEditor('tasks.json', `${line}`);
			if (i !== taskStringLines.length - 1) {
				await this.code.sendKeybinding('Enter');
				// TODO https://github.com/microsoft/vscode/issues/242535
				await wait(100);
			}
		}
		await this.editors.saveOpenedFile();
	}
}
