/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

const VIEWLET = 'div[id="workbench.view.scm"]';
const SCM_INPUT = `${VIEWLET} .scm-editor textarea`;
const SCM_RESOURCE = `${VIEWLET} .monaco-list-row > .resource`;
const REFRESH_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Refresh"]`;
const COMMIT_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[title="Commit"]`;
const SCM_RESOURCE_CLICK = name => `${SCM_RESOURCE} .monaco-icon-label[title$="${name}"]`;

export interface Change {
	id: string;
	name: string;
	type: string;
	actions: { id: string, title: string; }[];
}

export class SCM {

	// private editorChangeIndex: number;

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	async openSCMViewlet(): Promise<any> {
		await this.spectron.command('workbench.view.scm');
		await this.spectron.client.waitForElement(SCM_INPUT);
	}

	async waitForChange(func: (change: Change) => boolean): Promise<Change> {
		return await this.spectron.client.waitFor(async () => {
			const changes = await this.getChanges();

			for (const change of changes) {
				if (func(change)) {
					return change;
				}
			}

			return undefined;
		});
	}

	async refreshSCMViewlet(): Promise<any> {
		await this.spectron.client.click(REFRESH_COMMAND);
	}

	async getChanges(): Promise<Change[]> {
		const result = await this.spectron.webclient.selectorExecute(SCM_RESOURCE,
			div => (Array.isArray(div) ? div : [div]).map(element => {
				const name = element.querySelector('.label-name') as HTMLElement;
				const icon = element.querySelector('.decoration-icon') as HTMLElement;
				const actionElementList = element.querySelectorAll('.actions .action-label');
				const actionElements: any[] = [];

				for (let i = 0; i < actionElementList.length; i++) {
					const element = actionElementList.item(i) as HTMLElement;
					actionElements.push({ element, title: element.title });
				}
				return {
					name: name.textContent,
					type: icon.title,
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

	async unstage(change: Change): Promise<void> {
		const action = change.actions.filter(a => a.title === 'Unstage Changes')[0];
		assert(action);
		await this.spectron.client.spectron.client.elementIdClick(action.id);
	}

	async commit(message: string): Promise<void> {
		await this.spectron.client.click(SCM_INPUT);
		await this.spectron.type(message);
		await this.spectron.client.click(COMMIT_COMMAND);
	}

	// async getChanges(expectedCount: number): Promise<Change[]> {
	// 	await this.spectron.client.waitForElements(SCM_RESOURCE, r => r.length === expectedCount);

	// }

	// public async verifyScmChange(fileName: string): Promise<any> {
	// 	let el;
	// 	try {
	// 		el = await this.spectron.client.waitForElement(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"]`);
	// 	} catch (e) {
	// 		return Promise.reject(`${fileName} change is not present in SCM viewlet.`);
	// 	}

	// 	if (el.status === 0) {
	// 		return el;
	// 	}

	// 	return undefined;
	// }

	// public async getOriginalAppJsBodyVarName(): Promise<any> {
	// 	this.editorChangeIndex = await this.getFirstChangeIndex('cdr line-delete', '.editor.original .view-overlays');
	// 	return this.spectron.waitFor(this.spectron.client.getText, `.editor.original .view-lines>:nth-child(${this.editorChangeIndex}) .mtk11`);
	// }

	// public getModifiedAppJsBodyVarName(): Promise<any> {
	// 	return this.spectron.waitFor(this.spectron.client.getText, `.editor.modified .view-lines>:nth-child(${this.editorChangeIndex}) .mtk11`);
	// }

	// public async stageFile(fileName: string): Promise<any> {
	// 	try {
	// 		await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
	// 	} catch (e) {
	// 		return Promise.reject(`${fileName} was not found in SCM viewlet`);
	// 	}

	// 	await this.spectron.wait();

	// 	try {
	// 		await this.spectron.client.waitAndClick('.action-label.icon.contrib-cmd-icon-4');
	// 	} catch (e) {
	// 		return Promise.reject('Stage button was not found');
	// 	}
	// 	return this.spectron.wait();
	// }

	// public async unstageFile(fileName: string): Promise<any> {
	// 	try {
	// 		await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
	// 	} catch (e) {
	// 		return Promise.reject(`${fileName} was not found in SCM viewlet`);
	// 	}

	// 	try {
	// 		await this.spectron.client.waitAndClick('.action-label.icon.contrib-cmd-icon-6');
	// 	} catch (e) {
	// 		return Promise.reject('Unstage button was not found.');
	// 	}
	// 	return this.spectron.wait();
	// }

	// public async getStagedCount(): Promise<any> {
	// 	let scmHeaders: Array<string>;
	// 	try {
	// 		scmHeaders = await this.spectron.waitFor(this.spectron.client.getText, '.scm-status.show-file-icons .monaco-list-rows .name'); // get all headers
	// 	}
	// 	catch (e) {
	// 		return Promise.reject('No row names in SCM viewlet were found.');
	// 	}

	// 	const stagedTitle = scmHeaders.find((val) => {
	// 		return val.match(/staged/i) ? true : false;
	// 	});

	// 	if (!stagedTitle) {
	// 		return Promise.reject(`No 'Staged' header title found in SCM viewlet`);
	// 	}

	// 	const monacoRowIndex = scmHeaders.indexOf(stagedTitle);
	// 	try {
	// 		return this.spectron.waitFor(this.spectron.client.getText, `.scm-status.show-file-icons .monaco-list-rows>:nth-child(${monacoRowIndex + 1}) .monaco-count-badge`);
	// 	} catch (e) {
	// 		return Promise.reject('Stage count badge cannot be found');
	// 	}
	// }

	// public focusOnCommitBox(): Promise<any> {
	// 	try {
	// 		return this.spectron.client.waitAndClick('div[id="workbench.view.scm"] textarea');
	// 	} catch (e) {
	// 		return Promise.reject('Failed to focus on commit box: ' + e);
	// 	}
	// }

	// public async pressCommit(): Promise<any> {
	// 	try {
	// 		await this.spectron.client.waitAndClick('.action-label.icon.contrib-cmd-icon-10');
	// 	} catch (e) {
	// 		return Promise.reject('Failed to press commit: ' + e);
	// 	}

	// 	return this.spectron.wait();
	// }

	// public getOutgoingChanges(): Promise<string> {
	// 	try {
	// 		return this.spectron.client.getText('a[title="Synchronize Changes"]');
	// 	} catch (e) {
	// 		return Promise.reject(`Failed to obtain 'synchronize changes' title value from the status bar.`);
	// 	}
	// }

	// private getFirstChangeIndex(changeClass: string, selector: string): Promise<number> {
	// 	return this.spectron.waitFor(this.spectron.client.waitForHTML, selector).then(html => {
	// 		return new Promise<number>((res, rej) => {
	// 			let lineIndex: number = 0;
	// 			let changeFound: boolean;
	// 			let tags: string[] = [];
	// 			let parser = new htmlparser.Parser({
	// 				onopentag: function (name: string, attribs: any) {
	// 					tags.push(name);
	// 					if (name === 'div' && !attribs.class) {
	// 						lineIndex++;
	// 					} else if (name === 'div' && attribs.class === changeClass) {
	// 						changeFound = true;
	// 						parser.end();
	// 					}
	// 				},
	// 				onclosetag: function (name) {
	// 					// Terminate once last tag is closed
	// 					tags.pop();
	// 					if (!changeFound && tags.length === 0) {
	// 						parser.end();
	// 					}
	// 				},
	// 				onend: function () {
	// 					if (!changeFound) {
	// 						return rej(`No changes in the diff found.`);
	// 					}
	// 					return res(lineIndex);
	// 				}
	// 			});
	// 			parser.write(html);
	// 		});
	// 	});
	// }
}