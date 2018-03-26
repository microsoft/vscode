/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export enum StatusBarElement {
	BRANCH_STATUS,
	SYNC_STATUS,
	ERROR_STATUS,
	WARNING_STATUS,
	SELECTION_STATUS,
	INDENTATION_STATUS,
	ENCODING_STATUS,
	EOL_STATUS,
	LANGUAGE_STATUS,
	FEEDBACK_ICON
}

export class StatusBar {

	private readonly mainSelector = 'div[id="workbench.parts.statusbar"]';
	private readonly leftSelector = '.statusbar-item.left';
	private readonly rightSelector = '.statusbar-item.right';

	constructor(private spectron: SpectronApplication) {
	}

	public async waitForStatusbarElement(element: StatusBarElement): Promise<void> {
		await this.spectron.client.waitForElement(this.getSelector(element));
	}

	public async clickOn(element: StatusBarElement): Promise<void> {
		await this.spectron.client.waitAndClick(this.getSelector(element));
	}

	public async waitForEOL(eol: string): Promise<string> {
		return this.spectron.client.waitForText(this.getSelector(StatusBarElement.EOL_STATUS), eol);
	}

	public async getStatusbarTextByTitle(title: string): Promise<string> {
		return await this.spectron.client.waitForText(`${this.mainSelector} span[title="smoke test"]`);
	}

	private getSelector(element: StatusBarElement): string {
		switch (element) {
			case StatusBarElement.BRANCH_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .octicon.octicon-git-branch`;
			case StatusBarElement.SYNC_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .octicon.octicon-sync`;
			case StatusBarElement.ERROR_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .task-statusbar-item .task-statusbar-item-label-counter[title*="Error"]`;
			case StatusBarElement.WARNING_STATUS:
				return `${this.mainSelector} ${this.leftSelector} .task-statusbar-item .task-statusbar-item-label-counter[title*="Warning"]`;
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