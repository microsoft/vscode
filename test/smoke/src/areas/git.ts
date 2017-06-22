/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from "./common";

export class Git {
	private readonly bodyVarSelector = '.view-lines>:nth-child(6) .mtk11';

	constructor(private spectron: SpectronApplication, private commonActions: CommonActions) {
		// noop
	}

	public openGitViewlet(): Promise<any> {
		return this.spectron.command('workbench.view.scm');
	}

	public getScmIconChanges(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, 'div[id="workbench.parts.activitybar"] .badge.scm-viewlet-label .badge-content');
	}

	public async verifyScmChange(fileName: string): Promise<any> {
		let el;
		try {
			el = await this.spectron.client.element(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"]`);
		} catch (e) {
			return Promise.reject(`${fileName} change is not present in SCM viewlet.`);
		}

		if (el.status === 0) {
			return el;
		}

		return undefined;
	}

	public getOriginalAppJsBodyVarName(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `.editor.original ${this.bodyVarSelector}`);
	}

	public getModifiedAppJsBodyVarName(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `.editor.modified ${this.bodyVarSelector}`);
	}

	public async stageFile(fileName: string): Promise<any> {
		try {
			await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
		} catch (e) {
			return Promise.reject(`${fileName} was not found in SCM viewlet`);
		}

		await this.spectron.wait();

		try {
			await this.spectron.client.click('.action-label.icon.contrib-cmd-icon-4');
		} catch (e) {
			return Promise.reject('Stage button was not found');
		}
		return this.spectron.wait();
	}

	public async unstageFile(fileName: string): Promise<any> {
		try {
			await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
		} catch (e) {
			return Promise.reject(`${fileName} was not found in SCM viewlet`);
		}

		try {
			await this.spectron.client.click('.action-label.icon.contrib-cmd-icon-6');
		} catch (e) {
			return Promise.reject('Unstage button was not found.');
		}
		return this.spectron.wait();
	}

	public async getStagedCount(): Promise<any> {
		let scmHeaders: Array<string>;
		try {
			scmHeaders = await this.spectron.waitFor(this.spectron.client.getText, '.scm-status.show-file-icons .monaco-list-rows .name'); // get all headers
		}
		catch (e) {
			return Promise.reject('No row names in SCM viewlet were found.');
		}

		const stagedTitle = scmHeaders.find((val) => {
				return val.match(/staged/i) ? true : false;
			});

		if (!stagedTitle) {
			return Promise.reject(`No 'Staged' header title found in SCM viewlet`);
		}

		const monacoRowIndex = scmHeaders.indexOf(stagedTitle);
		try {
			return this.spectron.waitFor(this.spectron.client.getText, `.scm-status.show-file-icons .monaco-list-rows>:nth-child(${monacoRowIndex+1}) .monaco-count-badge`);
		} catch (e) {
			return Promise.reject('Stage count badge cannot be found');
		}
	}

	public focusOnCommitBox(): Promise<any> {
		return this.spectron.client.click('div[id="workbench.view.scm"] textarea');
	}

	public async pressCommit(): Promise<any> {
		await this.spectron.client.click('.action-label.icon.contrib-cmd-icon-10');
		return this.spectron.wait();
	}

	public getOutgoingChanges(): Promise<string> {
		return this.spectron.client.getText('a[title="Synchronize Changes"]');
	}
}