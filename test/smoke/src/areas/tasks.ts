/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { IntegratedTerminal } from './integrated-terminal';

export class Tasks {

	private readonly outputViewSelector = IntegratedTerminal.terminalRowsSelector;
	private readonly workbenchPanelSelector = 'div[id="workbench.parts.panel"]';
	private readonly problemsViewSelector = 'div[id="workbench.panel.markers"] .monaco-tree-row.expanded';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async build(): Promise<any> {
		await this.spectron.command('workbench.action.tasks.build');
		await this.spectron.wait(); // wait for build to finish

		// Validate that it has finished
		let trial = 0;
		while (trial < 3) {
			// Determine build status based on the statusbar indicator, don't continue until task has been terminated
			try {
				return await this.spectron.client.getValue('.task-statusbar-item-progress.builder-hidden');
			} catch (e) {
				await this.spectron.wait();
				trial++;
			}
		}

		return Promise.reject('Could not determine if the task was terminated based on status bar progress spinner.');
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

	public async selectOutputViewType(type: string): Promise<any> {
		await this.openOutputView();

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

	private openOutputView(): Promise<any> {
		try {
			return this.spectron.command('workbench.action.output.toggleOutput');
		} catch (e) {
			return Promise.reject('Failed to toggle output view');
		}
	}
}