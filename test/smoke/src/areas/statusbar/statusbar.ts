/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from '../../vscode/code';

export enum StatusBarElement {
	BRANCH_STATUS = 0,
	SYNC_STATUS = 1,
	PROBLEMS_STATUS = 2,
	SELECTION_STATUS = 3,
	INDENTATION_STATUS = 4,
	ENCODING_STATUS = 5,
	EOL_STATUS = 6,
	LANGUAGE_STATUS = 7,
	FEEDBACK_ICON = 8
}

export class StatusBar {

	private readonly mainSelector = 'div[id="workbench.parts.statusbar"]';
	private readonly leftSelector = '.statusbar-item.left';
	private readonly rightSelector = '.statusbar-item.right';

	constructor(private code: Code) { }

	async waitForStatusbarElement(element: StatusBarElement): Promise<void> {
		await this.code.waitForElement(this.getSelector(element));
	}

	async clickOn(element: StatusBarElement): Promise<void> {
		await this.code.waitAndClick(this.getSelector(element));
	}

	async waitForEOL(eol: string): Promise<string> {
		return this.code.waitForTextContent(this.getSelector(StatusBarElement.EOL_STATUS), eol);
	}

	async waitForStatusbarText(title: string, text: string): Promise<void> {
		await this.code.waitForTextContent(`${this.mainSelector} span[title="${title}"]`, text);
	}

	private getSelector(element: StatusBarElement): string {
		switch (element) {
			case StatusBarElement.BRANCH_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .octicon.octicon-git-branch`;
			case StatusBarElement.SYNC_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .octicon.octicon-sync`;
			case StatusBarElement.PROBLEMS_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .task-statusbar-item[title="Problems"]`;
			case StatusBarElement.SELECTION_STATUS:
				return `${this.mainSelector} ${this.rightSelector} .editor-status-selection`;
			case StatusBarElement.INDENTATION_STATUS:
				return `${this.mainSelector} ${this.rightSelector} .editor-status-indentation`;
			case StatusBarElement.ENCODING_STATUS:
				return `${this.mainSelector} ${this.rightSelector} .editor-status-encoding`;
			case StatusBarElement.EOL_STATUS:
				return `${this.mainSelector} ${this.rightSelector} .editor-status-eol`;
			case StatusBarElement.LANGUAGE_STATUS:
				return `${this.mainSelector} ${this.rightSelector} .editor-status-mode`;
			case StatusBarElement.FEEDBACK_ICON:
				return `${this.mainSelector} ${this.rightSelector} .monaco-dropdown.send-feedback`;
			default:
				throw new Error(element);
		}
	}
}