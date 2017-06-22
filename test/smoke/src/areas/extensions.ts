/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from "./common";

var htmlparser = require('htmlparser2');

export class Extensions {

	private readonly extensionsViewletSelector = 'div[id="workbench.view.extensions"]';
	private viewletExtensionIndex: number;

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

	public async installExtension(name: string): Promise<any> {
		const extensionListSelector = `${this.extensionsViewletSelector} .monaco-list-rows`;
		this.viewletExtensionIndex = await this.getExtensionIndex(name, extensionListSelector);
		return this.spectron.client.click(`${extensionListSelector}>:nth-child(${this.viewletExtensionIndex}) .extension .extension-action.install`);
	}

	public getExtensionReloadText(): Promise<any> {
		return this.spectron.waitFor(this.spectron.client.getText, `${this.extensionsViewletSelector} .monaco-list-rows>:nth-child(${this.viewletExtensionIndex}) .extension .extension-action.reload`);
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

	private getExtensionIndex(name: string, extensionListSelector: string): Promise<number> {
		return new Promise(async (res, rej) => {
			const html = await this.spectron.waitFor(this.spectron.client.getHTML, extensionListSelector);
			let extensionIndex: number = 0;
			let extension: boolean;
			var domelems:string[] = [];
			var parser = new htmlparser.Parser({
				onopentag: function (name, attribs) {
					if (name === 'div' && attribs.class === 'extension') {
						extensionIndex++;
						extension = true;
					}
					if (extension) {
						domelems.push(name);
					}
				},
				ontext: function (text) {
					if (extension && text === name) {
						parser.end();
					}
				},
				onclosetag: function (name) {
					if (extension) {
						domelems.pop();
					}
					if (extension && domelems.length === 0) {
						extension = false;
					}
				},
				onend: function () {
					if (extensionIndex === 0) {
						rej(`${name} extension was not found.`);
					}
					res(extensionIndex);
				}
			});
			parser.write(html);
		});
	}
}