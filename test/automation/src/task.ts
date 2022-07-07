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
		this.quickaccess.runCommand('workbench.action.tasks.runTask');
		await this.quickInput.type(filter);
		//TODO@meganrogge: check for specific elements
		await this.quickInput.waitForQuickInputElements(elements => elements.length === expected.length);
		await this.quickInput.closeQuickInput();
	}

	async configureTask(properties: ITaskConfigurationProperties) {
		await this.quickaccess.openFileQuickAccessAndWait('tasks.json', 'tasks.json');
		await this.quickInput.selectQuickInputElement(0);
		await this.quickInput.waitForQuickInputClosed();
		await this.editor.waitForTypeInEditor('tasks.json', `{`);
		await this.quickaccess.runCommand('editor.action.selectAll');
		await this.code.dispatchKeybinding('Delete');
		await this.editors.saveOpenedFile();
		let taskString = `{
			"version": "2.0.0",
			"tasks": [
				{`;
		for (let [key, value] of Object.entries(properties)) {
			value = key === 'hide' ? value : `"${value}"`;
			taskString += `"${key}": ${value},\n`;
		}
		taskString += `}]`;
		await this.code.dispatchKeybinding('right');
		// this.editor.waitForTypeInEditor('tasks.json', `${taskString}`);
		this.editor.waitForEditorContents('tasks.json', (contents) => contents.includes(`${taskString}`));
		await setTimeout(async () => {
			await this.editors.saveOpenedFile();
		}, 1000);
	}
}
