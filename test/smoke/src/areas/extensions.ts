/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from './common';

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
		try {
			await this.spectron.client.click(searchBoxSelector, false);
		} catch (e) {
			return Promise.reject('Failed to click on search box in extensions viewlet.');
		}
		await this.spectron.client.keys(name);

		return this.spectron.client.keys(['NULL', 'Enter', 'NULL']);
	}

	public async installExtension(name: string): Promise<any> {
		const extensionListSelector = `${this.extensionsViewletSelector} .monaco-list-rows`;
		this.viewletExtensionIndex = await this.getExtensionIndex(name, extensionListSelector);

		try {
			return this.spectron.client.click(`${extensionListSelector}>:nth-child(${this.viewletExtensionIndex}) .extension .extension-action.install`);
		} catch (e) {
			return Promise.reject('Failed to click on install button for selected extension.');
		}
	}

	public getExtensionReloadText(): Promise<any> {
		try {
			return this.spectron.waitFor(this.spectron.client.getText, `${this.extensionsViewletSelector} .monaco-list-rows>:nth-child(${this.viewletExtensionIndex}) .extension .extension-action.reload`);
		} catch (e) {
			return Promise.reject('Reload was not prompted for an installed extension.');
		}
	}

	public async activateExtension(): Promise<any> {
		await this.common.showCommands();
		await this.common.type('Smoke Test Check');
		await this.spectron.wait();
		return this.common.enter();
	}

	public verifyStatusbarItem(): Promise<any> {
		try {
			return this.spectron.waitFor(this.spectron.client.getText, '.statusbar-item.statusbar-entry span[title="smoke test"]');
		} catch (e) {
			return Promise.reject('Failed to validate extension contribution.');
		}
	}

	private getExtensionIndex(name: string, extensionListSelector: string): Promise<number> {
		return this.spectron.waitFor(this.spectron.client.getHTML, extensionListSelector).then(html => {
			return new Promise<number>((res, rej) => {
				let extensionIndex: number = 0;
				let extension: boolean;
				let tags: string[] = [];
				let parser = new htmlparser.Parser({
					onopentag: function (name, attribs) {
						if (name === 'div' && attribs.class === 'extension') {
							extensionIndex++;
							extension = true;
						}
						if (extension) {
							tags.push(name);
						}
					},
					ontext: function (text) {
						if (extension && text === name) {
							parser.end();
						}
					},
					onclosetag: function (name) {
						if (extension) {
							tags.pop();
						}
						if (extension && tags.length === 0) {
							extension = false;
						}
					},
					onend: function () {
						if (extensionIndex === 0) {
							return rej(`${name} extension was not found.`);
						}
						return res(extensionIndex);
					}
				});
				parser.write(html);
			});
		});
	}
}