/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Extensions {

	constructor(private spectron: SpectronApplication) {
	}

	public async openExtensionsViewlet(): Promise<any> {
		await this.spectron.command('workbench.view.extensions');
		await this.waitForExtensionsViewlet();
	}

	public async waitForExtensionsViewlet(): Promise<any> {
		await this.spectron.client.waitForElement('div.extensions-viewlet[id="workbench.view.extensions"] .search-box.synthetic-focus[placeholder="Search Extensions in Marketplace"]');
	}

	public async searchForExtension(name: string): Promise<any> {
		const searchBoxSelector = 'div.extensions-viewlet[id="workbench.view.extensions"] .search-box[placeholder="Search Extensions in Marketplace"]';

		await this.spectron.client.clearElement(searchBoxSelector);
		await this.spectron.client.click(searchBoxSelector);
		await this.spectron.client.waitForElement('div.extensions-viewlet[id="workbench.view.extensions"] .search-box.synthetic-focus[placeholder="Search Extensions in Marketplace"]');
		await this.spectron.client.keys(name);

	}

	public async installExtension(name: string): Promise<boolean> {
		await this.searchForExtension(name);
		await this.spectron.client.waitAndClick(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.install`);
		await this.spectron.client.waitForElement(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.reload`);
		return true;
	}
}