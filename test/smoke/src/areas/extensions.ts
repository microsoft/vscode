/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from "./common";

export class Extensions {

	private readonly extensionsViewletSelector = 'div[id="workbench.view.extensions"]';

	constructor(private spectron: SpectronApplication, private common: CommonActions) {
	}

	public async openExtensionsViewlet(): Promise<any> {
		await this.spectron.command('workbench.view.extensions');
		return this.spectron.wait();
	}

	public async searchForExtension(name: string): Promise<any> {
		const searchBoxSelector = `${this.extensionsViewletSelector} .search-box`;

		await this.spectron.client.clearElement(searchBoxSelector);
		await this.spectron.client.click(searchBoxSelector, false);
		await this.spectron.client.keys(name);
		return this.spectron.client.keys(['NULL', 'Enter', 'NULL']);
	}

	public installFirstResult(): Promise<any> {
		return this.spectron.client.click(`${this.extensionsViewletSelector} .monaco-list-rows>:nth-child(1) .extension .extension-action.install`);
	}

	public getFirstReloadText(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `${this.extensionsViewletSelector} .monaco-list-rows>:nth-child(1) .extension .extension-action.reload`);
	}

	public async selectMinimalIconsTheme(): Promise<any> {
		await this.common.showCommands();
		await this.common.type('File Icon Theme');
		await this.spectron.wait();
		await this.common.enter();
		return this.spectron.client.keys(['ArrowDown', 'NULL', 'Enter', 'NULL']);
	}

	public async verifyFolderIconAppearance(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getHTML, 'style[class="contributedIconTheme"]');
	}
}