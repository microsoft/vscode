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
	name?: string;
	identifier?: string;
	group?: string;
	isBackground?: boolean;
	promptOnClose?: boolean;
	icon?: { id?: string; color?: string };
	hide?: boolean;
}

export class Task {

	constructor(private code: Code, private editor: Editor, private editors: Editors, private quickaccess: QuickAccess, private quickInput: QuickInput) {

	}

	async runTask(filter: string, expected: string[]) {
		this.quickaccess.runCommand('workbench.action.tasks.runTask');
		await this.code.dispatchKeybinding(filter);
		//TODO@meganrogge: check for specific elements
		await this.quickInput.waitForQuickInputElements(elements => elements.length === expected.length);
		await this.quickInput.closeQuickInput();
	}

	async configureTask(properties: ITaskConfigurationProperties) {
		this.quickaccess.runCommand('workbench.action.tasks.openUserTasks');
		await this.code.dispatchKeybinding('enter');
		await this.code.dispatchKeybinding('right');
		let task = '{';
		for (const [key, value] of Object.entries(properties)) {
			task += `"${key}": ${value},`;
		}
		task += '}';
		await this.editor.waitForTypeInEditor('tasks.json', `${task}`);
		await this.editors.saveOpenedFile();
	}
}
