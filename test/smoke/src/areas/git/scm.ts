/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from '../workbench/viewlet';
import { API } from '../../spectron/client';
import { Commands } from '../workbench/workbench';

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

	constructor(api: API, private commands: Commands) {
		super(api);
	}

	async openSCMViewlet(): Promise<any> {
		await this.commands.runCommand('workbench.view.scm');
		await this.api.waitForElement(SCM_INPUT);
	}

	waitForChange(name: string, type?: string): Promise<void> {
		return this.api.waitFor(async () => {
			const changes = await this.queryChanges(name, type);
			return changes.length;
		}, l => l > 0, 'Getting SCM changes') as Promise<any> as Promise<void>;
	}

	async refreshSCMViewlet(): Promise<any> {
		await this.api.waitAndClick(REFRESH_COMMAND);
	}

	private async queryChanges(name: string, type?: string): Promise<Change[]> {
		const result = await this.api.selectorExecute(SCM_RESOURCE, (div, name, type) => {
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
						name: name.textContent || '',
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
		await this.api.waitAndClick(SCM_RESOURCE_CLICK(name));
	}

	async stage(name: string): Promise<void> {
		await this.api.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Stage Changes'));
	}

	async stageAll(): Promise<void> {
		await this.api.waitAndClick(SCM_RESOURCE_GROUP_COMMAND_CLICK('Stage All Changes'));
	}

	async unstage(name: string): Promise<void> {
		await this.api.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Unstage Changes'));
	}

	async commit(message: string): Promise<void> {
		await this.api.waitAndClick(SCM_INPUT);
		await this.api.waitForActiveElement(SCM_INPUT);
		await this.api.setValue(SCM_INPUT, message);
		await this.api.waitAndClick(COMMIT_COMMAND);
	}
}