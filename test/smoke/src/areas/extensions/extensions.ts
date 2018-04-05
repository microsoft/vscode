/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from '../workbench/viewlet';
import { API } from '../../api';
import { Commands } from '../workbench/workbench';

const SEARCH_BOX = 'div.extensions-viewlet[id="workbench.view.extensions"] input.search-box';

export class Extensions extends Viewlet {

	constructor(api: API, private commands: Commands) {
		super(api);
	}

	async openExtensionsViewlet(): Promise<any> {
		await this.commands.runCommand('workbench.view.extensions');
		await this.waitForExtensionsViewlet();
	}

	async waitForExtensionsViewlet(): Promise<any> {
		await this.api.waitForActiveElement(SEARCH_BOX);
	}

	async searchForExtension(name: string): Promise<any> {
		await this.api.waitAndClick(SEARCH_BOX);
		await this.api.waitForActiveElement(SEARCH_BOX);
		await this.api.setValue(SEARCH_BOX, name);
	}

	async installExtension(name: string): Promise<boolean> {
		await this.searchForExtension(name);

		// we might want to wait for a while longer since the Marketplace can be slow
		// a minute should do
		await this.api.waitFor(() => this.api.waitAndClick(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.install`), void 0, 'waiting for install button', 600);

		await this.api.waitForElement(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[aria-label="${name}"] .extension li[class='action-item'] .extension-action.reload`);
		return true;
	}
}