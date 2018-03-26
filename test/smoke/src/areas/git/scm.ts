/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

const VIEWLET = 'div[id="workbench.view.scm"]';
const SCM_INPUT = `${VIEWLET} .scm-editor textarea`;
const SCM_RESOURCE = `${VIEWLET} .monaco-list-row > .resource`;
const SCM_SELECTED_RESOURCE = `${VIEWLET} .monaco-list-row.focused.selected > .resource`;
const SCM_RESOURCE_GROUP = `${VIEWLET} .monaco-list-row > .resource-group`;
const REFRESH_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Refresh"]`;
const COMMIT_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Commit"]`;

const SCM_RESOURCE_CLICK = (name: string) => `${SCM_RESOURCE} .monaco-icon-label[title*="${name}"] .label-name`;
const SCM_SELECTED_RESOURCE_CLICK = (name: string) => `${SCM_SELECTED_RESOURCE} .monaco-icon-label[title*="${name}"] .label-name`;
const SCM_RESOURCE_ACTION_CLICK = (name: string, actionName: string) => `${SCM_RESOURCE} .monaco-icon-label[title*="${name}"] .actions .action-label[title*="${actionName}"]`;
const SCM_RESOURCE_GROUP_COMMAND_CLICK = (name: string) => `${SCM_RESOURCE_GROUP} .actions .action-label[title="${name}"]`;

interface Change {
	name: string;
	type: string;
	actions: string[];
}

export class SCM extends Viewlet {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async openSCMViewlet(): Promise<any> {
		await this.spectron.runCommand('workbench.view.scm');
		await this.spectron.client.waitForElement(SCM_INPUT);
	}

	async waitForClickRefreshCompletion(): Promise<void> {
		const progressActiveBar = this.spectron.workbench.getActiveSideProgressBarSelector();
		await this.spectron.workbench.waitForInactiveSideProgressBar();

		await this.spectron.client.waitFor(async () => {
			await this.spectron.client.click(REFRESH_COMMAND);
			const state = await this.spectron.client.element(progressActiveBar).then(result => {
				return true;
			});
			return state;
		}, state => !!state, 'Refreshing SCM for changes');

		await this.spectron.workbench.waitForInactiveSideProgressBar();
	}

	async waitForChange(name: string, type?: string, triggerFn?: (this: void) => Promise<void> | void): Promise<void> {
		const progressInactiveBar = this.spectron.workbench.getInactiveSideProgressBarSelector();

		if (triggerFn) { await this.spectron.workbench.waitForInactiveSideProgressBar(); }

		await this.spectron.client.waitFor(async () => {
			if (triggerFn) {
				// since progress bar starts later then this waitFor cycles, give it a moment to run
				await this.spectron.webclient.pause(500);
				const isProgressBarInactive = await this.spectron.client.element(progressInactiveBar)
					.then(result => !!result);

				if (isProgressBarInactive) {
					triggerFn();
				}
			}
			const changes = await this.queryChanges(name, type);
			return changes.length;
		}, l => l > 0, 'Getting SCM changes');

		if (triggerFn) { await this.spectron.workbench.waitForInactiveSideProgressBar(); }
	}

	private async queryChanges(name: string, type?: string): Promise<Change[]> {
		const result = await this.spectron.webclient.selectorExecute(SCM_RESOURCE, (div, name, type) => {
			return (Array.isArray(div) ? div : [div])
				.map(element => {
					const name = element.querySelector('.label-name') as HTMLElement;
					const type = element.getAttribute('data-tooltip') || '';
					const actionElementList = element.querySelectorAll('.actions .action-label');
					const actions: string[] = [];

					for (let i = 0; i < actionElementList.length; i++) {
						const element = actionElementList.item(i) as HTMLElement;
						actions.push(element.title);
					}

					return {
						name: name.textContent,
						type,
						actions
					};
				})
				.filter(change => {
					if (change.name !== name) {
						return false;
					}

					if (type && (change.type !== type)) {
						return false;
					}

					return true;
				});
		}, name, type);

		return result;
	}

	async openChange(name: string): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_CLICK(name));
	}

	async waitForFileToBeModifiedAndSaved(name: string, message: string): Promise<void> {
		await this.spectron.workbench.quickopen.openFile(name);
		await this.spectron.workbench.editor.waitForTypeInEditor(name, message);
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.waitForOpenFileToBeSaved(name);
		await this.spectron.workbench.closeTab(name);
	}

	async waitForOpenFileToBeSaved(name: string) {
		await this.spectron.workbench.saveOpenedFile();
		await this.waitForClickRefreshCompletion();
		await this.spectron.client.waitForExist(SCM_RESOURCE_CLICK(name));
	}

	async waitForListResourceToBeSelected(name: string): Promise<void> {
		await this.spectron.client.click(SCM_RESOURCE_CLICK(name));
		await this.spectron.client.waitForExist(SCM_SELECTED_RESOURCE_CLICK(name));
	}

	async stage(name: string): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Stage Changes'));
	}

	async stageAll(): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_GROUP_COMMAND_CLICK('Stage All Changes'));
	}

	async unstage(name: string): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Unstage Changes'));
	}

	async commit(message: string): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_INPUT);
		await this.spectron.client.waitForActiveElement(SCM_INPUT);
		await this.spectron.client.setValue(SCM_INPUT, message);
		await this.spectron.client.waitAndClick(COMMIT_COMMAND);
	}
}