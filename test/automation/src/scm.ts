/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from './viewlet';
import { IElement } from './driver';
import { findElement, findElements, Code } from './code';
import { Quality } from './application';

const VIEWLET = 'div[id="workbench.view.scm"]';
const SCM_INPUT_NATIVE_EDIT_CONTEXT = `${VIEWLET} .scm-editor .native-edit-context`;
const SCM_INPUT_TEXTAREA = `${VIEWLET} .scm-editor textarea`;
const SCM_RESOURCE = `${VIEWLET} .monaco-list-row .resource`;
const REFRESH_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[aria-label="Refresh"]`;
const COMMIT_COMMAND = `div[id="workbench.parts.sidebar"] .actions-container a.action-label[aria-label="Commit"]`;
const SCM_RESOURCE_CLICK = (name: string) => `${SCM_RESOURCE} .monaco-icon-label[aria-label*="${name}"] .label-name`;
const SCM_RESOURCE_ACTION_CLICK = (name: string, actionName: string) => `${SCM_RESOURCE} .monaco-icon-label[aria-label*="${name}"] .actions .action-label[aria-label="${actionName}"]`;

interface Change {
	name: string;
	type: string;
	actions: string[];
}

function toChange(element: IElement): Change {
	const name = findElement(element, e => /\blabel-name\b/.test(e.className))!;
	const type = element.attributes['data-tooltip'] || '';

	const actionElementList = findElements(element, e => /\baction-label\b/.test(e.className));
	const actions = actionElementList.map(e => e.attributes['title']);

	return {
		name: name.textContent || '',
		type,
		actions
	};
}


export class SCM extends Viewlet {

	constructor(code: Code) {
		super(code);
	}

	async openSCMViewlet(): Promise<any> {
		await this.code.sendKeybinding('ctrl+shift+g', async () => { await this.code.waitForElement(this._editContextSelector()); });
	}

	async waitForChange(name: string, type?: string): Promise<void> {
		const func = (change: Change) => change.name === name && (!type || change.type === type);
		await this.code.waitForElements(SCM_RESOURCE, true, elements => elements.some(e => func(toChange(e))));
	}

	async refreshSCMViewlet(): Promise<any> {
		await this.code.waitAndClick(REFRESH_COMMAND);
	}

	async openChange(name: string): Promise<void> {
		await this.code.waitAndClick(SCM_RESOURCE_CLICK(name));
	}

	async stage(name: string): Promise<void> {
		await this.code.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Stage Changes'));
		await this.waitForChange(name, 'Index Modified');
	}

	async unstage(name: string): Promise<void> {
		await this.code.waitAndClick(SCM_RESOURCE_ACTION_CLICK(name, 'Unstage Changes'));
		await this.waitForChange(name, 'Modified');
	}

	async commit(message: string): Promise<void> {
		await this.code.waitAndClick(this._editContextSelector());
		await this.code.waitForActiveElement(this._editContextSelector());
		await this.code.waitForSetValue(this._editContextSelector(), message);
		await this.code.waitAndClick(COMMIT_COMMAND);
	}

	private _editContextSelector(): string {
		return this.code.quality === Quality.Stable ? SCM_INPUT_TEXTAREA : SCM_INPUT_NATIVE_EDIT_CONTEXT;
	}
}
