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
		return this.spectron.command('workbench.view.git');
	}

	public getScmIconChanges(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, 'div[id="workbench.parts.activitybar"] .badge.scm-viewlet-label .badge-content');
	}

	public async verifyScmChange(fileName: string): Promise<any> {
		let el = await this.spectron.client.element(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"]`);
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
		await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
		await this.spectron.wait();
		await this.spectron.client.click('.action-label.icon.contrib-cmd-icon-4');
		return this.spectron.wait();
	}

	public async unstageFile(fileName: string): Promise<any> {
		await this.spectron.client.moveToObject(`div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.commonActions.getExtensionSelector(fileName)}"`);
		await this.spectron.client.click('.action-label.icon.contrib-cmd-icon-6');
		return this.spectron.wait();
	}

	public getStagedCount(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, '.scm-status.show-file-icons .monaco-list-rows>:nth-child(1) .monaco-count-badge');
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