/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editor } from './editor';
import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { Editors } from './editors';
import { QuickInput } from './quickinput';

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
	Rename = 'workbench.action.terminal.rename'
}

export class Task {

	constructor(private code: Code, private editor: Editor, private editors: Editors, private quickaccess: QuickAccess, private quickInput: QuickInput) {

	}

	async runTask(filter: string, expected: ITaskConfigurationProperties[]) {
		await this.code.dispatchKeybinding('right');
		await this.editors.saveOpenedFile();
		await this.quickaccess.runCommand('workbench.action.tasks.runTask', true);
		if (expected.length === 0) {
			await this.quickInput.waitForQuickInputElements(e => e.length > 1 && e.every(label => label.trim() !== filter.trim()));
		} else {
			await this.quickInput.waitForQuickInputElements(e => e.length > 1 && e.some(label => label.trim() === filter.trim()));
		}
		await this.quickInput.closeQuickInput();
	}

	async configureTask(properties: ITaskConfigurationProperties) {
		await this.quickaccess.openFileQuickAccessAndWait('tasks.json', 'tasks.json');
		await this.quickInput.selectQuickInputElement(0);
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.dispatchKeybinding('Delete');
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
				await this.code.dispatchKeybinding('Enter');
			}
		}
		await this.editors.saveOpenedFile();
	}
}
