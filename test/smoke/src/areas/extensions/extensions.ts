/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

const SEARCH_BOX = 'div.extensions-viewlet[id="workbench.view.extensions"] input.search-box';

export class Extensions extends Viewlet {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async openExtensionsViewlet(): Promise<any> {
		await this.spectron.runCommand('workbench.view.extensions');
		await this.waitForExtensionsViewlet();
	}

	async waitForExtensionsViewlet(): Promise<any> {
		await this.spectron.client.waitForActiveElement(SEARCH_BOX);
	}

	async searchForExtension(name: string): Promise<any> {
		await this.spectron.client.waitAndClick(SEARCH_BOX);
		await this.spectron.client.waitForActiveElement(SEARCH_BOX);
		await this.spectron.client.setValue(SEARCH_BOX, name);
	}

	async installExtension(name: string): Promise<boolean> {
		await this.searchForExtension(name);

		// we might want to wait for a while longer since the Marketplace can be slow
		// a minute should do
		await this.spectron.client.waitFor(() => this.spectron.client.waitAndClick(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.install`), void 0, 'waiting for install button', 600);

		await this.spectron.client.waitForElement(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.reload`);
		return true;
	}
}