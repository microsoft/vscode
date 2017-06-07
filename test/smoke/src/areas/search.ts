/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class Search {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openSearchViewlet(): Promise<any> {
		return this.spectron.command('workbench.view.search');
	}

	public async searchFor(text: string): Promise<any> {
		await this.spectron.client.keys(text);
		return this.spectron.client.keys(['NULL', 'Enter', 'NULL'], false);
	}

	public setReplaceText(text: string): any {
		return this.spectron.client.setValue('.viewlet .input[title="Replace"]', text);
	}

	public replaceFirstMatch(): any {
		return this.spectron.client.click('.monaco-tree-rows.show-twisties .action-label.icon.action-replace-all');
	}

	public getResultText(): any {
		return this.spectron.waitFor(this.spectron.client.getText, '.search-viewlet .message>p');
	}

	public toggleSearchDetails(): any {
		return this.spectron.client.click('.query-details .more');
	}

	public toggleReplace(): any {
		return this.spectron.client.click('.monaco-button.toggle-replace-button.collapse');
	}

	public hoverOverResultCount(): any {
		return this.spectron.waitFor(this.spectron.client.moveToObject, '.monaco-count-badge');
	}

	public dismissResult(): any {
		return this.spectron.client.click('.action-label.icon.action-remove');
	}
}