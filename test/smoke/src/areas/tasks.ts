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

	public build(): Promise<any> {
		return this.spectron.command('workbench.action.tasks.build');
	}

	public openProblemsView(): Promise<any> {
		return this.spectron.command('workbench.actions.view.problems');
	}

	public async firstOutputLineEndsWith(fileName: string): Promise<boolean> {
		const firstLine = await this.spectron.waitFor(this.spectron.client.getText, `${this.outputViewSelector}>:nth-child(2)`);
		return firstLine.endsWith(fileName);
	}

	public getOutputResult(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `${this.outputViewSelector}>:nth-child(10) span.mtk1`);
	}

	public selectOutputViewType(type: string): Promise<any> {
		return this.spectron.client.selectByValue(`${this.workbenchPanelSelector} .select-box`, type);
	}

	public getOutputViewType(): Promise<any> {
		return this.spectron.client.getValue(`${this.workbenchPanelSelector} .select-box`);
	}

	public getProblemsViewFirstElementName(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `${this.problemsViewSelector} .label-name`);
	}

	public getProblemsViewFirstElementCount(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `${this.problemsViewSelector} .monaco-count-badge`);
	}
}