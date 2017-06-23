/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class Tasks {

	private readonly outputViewSelector = 'div[id="workbench.panel.output"] .view-lines';
	private readonly workbenchPanelSelector = 'div[id="workbench.parts.panel"]';
	private readonly problemsViewSelector = 'div[id="workbench.panel.markers"] .monaco-tree-row.expanded';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async build(): Promise<any> {
		await this.spectron.command('workbench.action.tasks.build');
		return this.spectron.wait();  // wait for build to finish
	}

	public openProblemsView(): Promise<any> {
		return this.spectron.command('workbench.actions.view.problems');
	}

	public async outputContains(string: string): Promise<boolean> {
		const output: string = await this.spectron.waitFor(this.spectron.client.getText, this.outputViewSelector);

		if (output.indexOf(string) !== -1) {
			return true;
		}

		return false;
	}

	public selectOutputViewType(type: string): Promise<any> {
		try {
			return this.spectron.client.selectByValue(`${this.workbenchPanelSelector} .select-box`, type);
		} catch (e) {
			return Promise.reject(`Failed to select ${type} as workbench panel output.`);
		}
	}

	public getOutputViewType(): Promise<any> {
		return this.spectron.client.getValue(`${this.workbenchPanelSelector} .select-box`);
	}

	public getProblemsViewFirstElementName(): Promise<any> {
		try {
			return this.spectron.waitFor(this.spectron.client.getText, `${this.problemsViewSelector} .label-name`);
		} catch (e) {
			return Promise.reject('Failed to get problem label from Problems view: ' + e);
		}
	}

	public getProblemsViewFirstElementCount(): Promise<any> {
		try {
			return this.spectron.waitFor(this.spectron.client.getText, `${this.problemsViewSelector} .monaco-count-badge`);
		} catch (e) {
			return Promise.reject('Failed to get problem count from Problems view: ' + e);
		}
	}
}