/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

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

	// private selectorsMap: Map<StatusBarElement, string>;
	private readonly mainSelector = 'div[id="workbench.parts.statusbar"]';

	constructor(private spectron: SpectronApplication) {
	}

	public async isVisible(element: StatusBarElement): Promise<boolean> {
		return this.spectron.client.isVisible(this.getSelector(element));
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
				return `${this.mainSelector} .octicon.octicon-git-branch`;
			case StatusBarElement.SYNC_STATUS:
				return `${this.mainSelector} .octicon.octicon-sync`;
			case StatusBarElement.PROBLEMS_STATUS:
				return `${this.mainSelector} .task-statusbar-item[title="Problems"]`;
			case StatusBarElement.SELECTION_STATUS:
				return `${this.mainSelector} .editor-status-selection`;
			case StatusBarElement.INDENTATION_STATUS:
				return `${this.mainSelector} .editor-status-indentation`;
			case StatusBarElement.ENCODING_STATUS:
				return `${this.mainSelector} .editor-status-encoding`;
			case StatusBarElement.EOL_STATUS:
				return `${this.mainSelector} .editor-status-eol`;
			case StatusBarElement.LANGUAGE_STATUS:
				return `${this.mainSelector} .editor-status-mode`;
			case StatusBarElement.FEEDBACK_ICON:
				return `${this.mainSelector} .dropdown.send-feedback`;
			default:
				throw new Error(element);
		}
	}
}