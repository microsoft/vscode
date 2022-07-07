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
			await this.quickInput.waitForQuickInputElements(e => e.length > 1 && e.every(value => value !== filter));
		} else {
			await this.quickInput.waitForQuickInputElements(e => e.length > 1 && e.includes(filter));
		}
		await this.quickInput.closeQuickInput();

	}

	async configureTask(properties: ITaskConfigurationProperties) {
		await this.quickaccess.openFileQuickAccessAndWait('tasks.json', 'tasks.json');
		await this.quickInput.selectQuickInputElement(0);
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.dispatchKeybinding('Delete');
		await this.editors.saveOpenedFile();
		await this.code.dispatchKeybinding('right');
		let taskString = `{
			"version": "2.0.0",
			"tasks": [
				{`;
		for (let [key, value] of Object.entries(properties)) {
			if (key === 'icon') {
				value = `${{ id: value.id }}`;
			} else {
				value = key === 'hide' || key === 'icon' ? value : `"${value}"`;
			}

			taskString += `"${key}": ${value},\n`;
		}
		taskString += `}]`;
		this.editor.waitForTypeInEditor('tasks.json', `${taskString}`);
	}
}
