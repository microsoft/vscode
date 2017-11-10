/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

const VIEWLET = 'div[id="workbench.view.scm"]';
const SCM_INPUT = `${VIEWLET} .scm-editor textarea`;
const SCM_RESOURCE = `${VIEWLET} .monaco-list-row > .resource`;
const SCM_RESOURCE_GROUP = `${VIEWLET} .monaco-list-row > .resource-group`;
const REFRESH_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Refresh"]`;
const COMMIT_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Commit"]`;
const SCM_RESOURCE_CLICK = name => `${SCM_RESOURCE} .monaco-icon-label[title$="${name}"]`;
const SCM_RESOURCE_GROUP_COMMAND_CLICK = name => `${SCM_RESOURCE_GROUP} .actions .action-label[title="${name}"]`;

export interface Change {
	id: string;
	name: string;
	type: string;
	actions: { id: string, title: string; }[];
}

export class SCM extends Viewlet {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async openSCMViewlet(): Promise<any> {
		await this.spectron.runCommand('workbench.view.scm');
		await this.spectron.client.waitForElement(SCM_INPUT);
	}

	async waitForChange(func: (change: Change) => boolean): Promise<Change> {
		return await this.spectron.client.waitFor(async () => {
			const changes = await this.getChanges();
			return changes.filter(func)[0];
		}, void 0, 'Getting changes');
	}

	async refreshSCMViewlet(): Promise<any> {
		await this.spectron.client.click(REFRESH_COMMAND);
	}

	async getChanges(): Promise<Change[]> {
		const result = await this.spectron.webclient.selectorExecute(SCM_RESOURCE,
			div => (Array.isArray(div) ? div : [div]).map(element => {
				const name = element.querySelector('.label-name') as HTMLElement;
				const icon = element.querySelector('.monaco-icon-label') as HTMLElement;
				const actionElementList = element.querySelectorAll('.actions .action-label');
				const actionElements: any[] = [];

				for (let i = 0; i < actionElementList.length; i++) {
					const element = actionElementList.item(i) as HTMLElement;
					actionElements.push({ element, title: element.title });
				}

				return {
					name: name.textContent,
					type: (icon.title || '').replace(/^([^,]+),.*$/, '$1'),
					element,
					actionElements
				};
			})
		);

		return result.map(({ name, type, element, actionElements }) => {
			// const actions = actionElements.reduce((r, { element, title }) => r[title] = element.ELEMENT, {});
			const actions = actionElements.map(({ element, title }) => ({ id: element.ELEMENT, title }));
			return { name, type, id: element.ELEMENT, actions };
		});
	}

	async openChange(change: Change): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_CLICK(change.name));
	}

	async stage(change: Change): Promise<void> {
		const action = change.actions.filter(a => a.title === 'Stage Changes')[0];
		assert(action);
		await this.spectron.client.spectron.client.elementIdClick(action.id);
	}

	async stageAll(): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_RESOURCE_GROUP_COMMAND_CLICK('Stage All Changes'));
	}

	async unstage(change: Change): Promise<void> {
		const action = change.actions.filter(a => a.title === 'Unstage Changes')[0];
		assert(action);
		await this.spectron.client.spectron.client.elementIdClick(action.id);
	}

	async commit(message: string): Promise<void> {
		await this.spectron.client.waitAndClick(SCM_INPUT);
		await this.spectron.client.waitForActiveElement(SCM_INPUT);
		await this.spectron.client.setValue(SCM_INPUT, message);
		await this.spectron.client.waitAndClick(COMMIT_COMMAND);
	}
}