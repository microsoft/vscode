/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

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

	private selectorsMap: Map<StatusBarElement, string>;
	private readonly mainSelector = 'div[id="workbench.parts.statusbar"]';

	constructor(private spectron: SpectronApplication) {
		this.populateSelectorsMap();
	}

	public async isVisible(element: StatusBarElement): Promise<boolean> {
		const selector = this.selectorsMap.get(element);
		if (!selector) {
			throw new Error('No such element in the status bar defined.');
		}

		return this.spectron.client.isVisible(selector);
	}

	public async clickOn(element: StatusBarElement): Promise<any> {
		const selector = this.selectorsMap.get(element);
		if (!selector) {
			throw new Error('No such element in the status bar defined.');
		}

		try {
			return this.spectron.client.click(selector);
		} catch (e) {
			return Promise.reject(`Clicking on status bar element ${selector} failed.`);
		}
	}

	public async getProblemsView(): Promise<any> {
		let el = await this.spectron.client.element('div[id="workbench.panel.markers"]');
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}

	public async getFeedbackView(): Promise<any> {
		let el = await this.spectron.client.element('.feedback-form');
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}

	public isQuickOpenWidgetVisible(): Promise<any> {
		return this.spectron.client.isVisible('.quick-open-widget');
	}

	public async getEditorHighlightedLine(lineNumber: number): Promise<any> {
		let el = await this.spectron.client.element(`.monaco-editor .view-overlays>:nth-child(${lineNumber}) .current-line`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}

	public async getEOLMode(): Promise<any> {
		const selector = this.selectorsMap.get(StatusBarElement.EOL_STATUS);
		if (!selector) {
			throw new Error('No such element in the status bar defined.');
		}

		return this.spectron.client.getText(selector);
	}

	private populateSelectorsMap(): void {
		this.selectorsMap = new Map<StatusBarElement, string>();
		this.selectorsMap.set(StatusBarElement.BRANCH_STATUS, `${this.mainSelector} .octicon.octicon-git-branch`);
		this.selectorsMap.set(StatusBarElement.SYNC_STATUS, `${this.mainSelector} .octicon.octicon-sync`);
		this.selectorsMap.set(StatusBarElement.PROBLEMS_STATUS, `${this.mainSelector} .task-statusbar-item[title="Problems"]`);
		this.selectorsMap.set(StatusBarElement.SELECTION_STATUS, `${this.mainSelector} .editor-status-selection`);
		this.selectorsMap.set(StatusBarElement.INDENTATION_STATUS, `${this.mainSelector} .editor-status-indentation`);
		this.selectorsMap.set(StatusBarElement.ENCODING_STATUS, `${this.mainSelector} .editor-status-encoding`);
		this.selectorsMap.set(StatusBarElement.EOL_STATUS, `${this.mainSelector} .editor-status-eol`);
		this.selectorsMap.set(StatusBarElement.LANGUAGE_STATUS, `${this.mainSelector} .editor-status-mode`);
		this.selectorsMap.set(StatusBarElement.FEEDBACK_ICON, `${this.mainSelector} .dropdown.send-feedback`);
	}
}