/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

export class Extensions extends Viewlet {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async openExtensionsViewlet(): Promise<any> {
		await this.spectron.command('workbench.view.extensions');
		await this.waitForExtensionsViewlet();
	}

	async waitForExtensionsViewlet(): Promise<any> {
		await this.spectron.client.waitForActiveElement('div.extensions-viewlet[id="workbench.view.extensions"] input.search-box');
	}

	async searchForExtension(name: string): Promise<any> {
		const searchBoxSelector = 'div.extensions-viewlet[id="workbench.view.extensions"] .search-box';

		await this.spectron.client.clearElement(searchBoxSelector);
		await this.spectron.client.click(searchBoxSelector);
		await this.spectron.client.waitForActiveElement('div.extensions-viewlet[id="workbench.view.extensions"] input.search-box');
		await this.spectron.client.keys(name);
	}

	async installExtension(name: string): Promise<boolean> {
		await this.searchForExtension(name);

		// we might want to wait for a while longer since the Marketplace can be slow
		// a minute should do
		await this.spectron.client.waitFor(() => this.spectron.client.click(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.install`), void 0, 'waiting for install button', 600);

		await this.spectron.client.waitForElement(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.reload`);
		return true;
	}
}