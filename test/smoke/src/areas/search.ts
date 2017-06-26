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
		try {
			return this.spectron.client.setValue('.viewlet .input[title="Replace"]', text);
		} catch (e) {
			return Promise.reject('Cannot set replace input in the viewlet: ' + e);
		}
	}

	public replaceFirstMatch(): any {
		try {
			return this.spectron.client.click('.monaco-tree-rows.show-twisties .action-label.icon.action-replace-all');
		} catch (e) {
			return Promise.reject('Cannot replace the search first match: ' + e);
		}
	}

	public getResultText(): any {
		return this.spectron.waitFor(this.spectron.client.getText, '.search-viewlet .message>p');
	}

	public toggleSearchDetails(): any {
		try {
			return this.spectron.client.click('.query-details .more');
		} catch (e) {
			return Promise.reject('Toggling search details failed: ' + e);
		}
	}

	public toggleReplace(): any {
		try {
			return this.spectron.client.click('.monaco-button.toggle-replace-button.collapse');
		} catch (e) {
			return Promise.reject('Toggling replace failed: ' + e);
		}
	}

	public hoverOverResultCount(): any {
		try {
			return this.spectron.waitFor(this.spectron.client.moveToObject, '.monaco-count-badge');
		} catch (e) {
			return Promise.reject('Hovering over result count failed: ' + e);
		}
	}

	public dismissResult(): any {
		try {
			return this.spectron.client.click('.action-label.icon.action-remove');
		} catch (e) {
			return Promise.reject('Clicking on dismissing result failed: ' + e);
		}
	}
}