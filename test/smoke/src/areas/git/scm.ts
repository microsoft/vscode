/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

const VIEWLET = 'div[id="workbench.view.scm"]';
const SCM_INPUT = `${VIEWLET} .scm-editor textarea`;
const SCM_RESOURCE = `${VIEWLET} .monaco-list-row > .resource`;
const SCM_RESOURCE_GROUP = `${VIEWLET} .monaco-list-row > .resource-group`;
const REFRESH_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Refresh"]`;
const COMMIT_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Commit"]`;
const SCM_RESOURCE_CLICK = (name: string) => `${SCM_RESOURCE} .monaco-icon-label[title*="${name}"] .label-name`;
const SCM_RESOURCE_ACTION_CLICK = (name: string, actionName: string) => `${SCM_RESOURCE} .monaco-icon-label[title*="${name}"] .actions .action-label[title="${actionName}"]`;
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

	waitForChange(name: string, type?: string): Promise<void> {
		return this.spectron.client.waitFor(async () => {
			const changes = await this.queryChanges(name, type);
			return changes.length;
		}, l => l > 0, 'Getting SCM changes') as Promise<any> as Promise<void>;
	}

	async refreshSCMViewlet(): Promise<any> {
		await this.spectron.client.click(REFRESH_COMMAND);
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