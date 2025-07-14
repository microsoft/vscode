/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from './viewlet';
import { Code } from './code';
import { ncp } from 'ncp';
import { promisify } from 'util';
import { Commands } from './workbench';
import path = require('path');
import fs = require('fs');


export class Extensions extends Viewlet {

	constructor(code: Code, private commands: Commands) {
		super(code);
	}

	async searchForExtension(id: string): Promise<any> {
		await this.commands.runCommand('Extensions: Focus on Extensions View', { exactLabelMatch: true });
		await this.code.waitForTypeInEditor(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-editor ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`, `@id:${id}`);
		await this.code.waitForTextContent(`div.part.sidebar div.composite.title h2`, 'Extensions: Marketplace');

		let retrials = 1;
		while (retrials++ < 10) {
			try {
				return await this.code.waitForElement(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[data-extension-id="${id}"]`, undefined, 100);
			} catch (error) {
				this.code.logger.log(`Extension '${id}' is not found. Retrying count: ${retrials}`);
				await this.commands.runCommand('workbench.extensions.action.refreshExtension');
			}
		}
		throw new Error(`Extension ${id} is not found`);
	}

	async openExtension(id: string): Promise<any> {
		await this.searchForExtension(id);
		await this.code.waitAndClick(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[data-extension-id="${id}"]`);
	}

	async closeExtension(title: string): Promise<any> {
		try {
			await this.code.waitAndClick(`.tabs-container div.tab[aria-label="Extension: ${title}, preview"] div.tab-actions a.action-label.codicon.codicon-close`);
		} catch (e) {
			this.code.logger.log(`Extension '${title}' not opened as preview. Trying without 'preview'.`);
			await this.code.waitAndClick(`.tabs-container div.tab[aria-label="Extension: ${title}"] div.tab-actions a.action-label.codicon.codicon-close`);
		}
	}

	async installExtension(id: string, waitUntilEnabled: boolean): Promise<void> {
		await this.searchForExtension(id);

		// try to install extension 3 times
		let attempt = 1;
		while (true) {
			await this.code.waitAndClick(`div.extensions-viewlet[id="workbench.view.extensions"] .monaco-list-row[data-extension-id="${id}"] .extension-list-item .monaco-action-bar .action-item:not(.disabled) .extension-action.install`);

			try {
				await this.waitForExtensionToBeInstalled();
				break;
			} catch (err) {
				if (attempt++ === 3) {
					throw err;
				}
			}
		}

		if (waitUntilEnabled) {
			await this.code.waitForElement(`.extension-editor .monaco-action-bar .action-item:not(.disabled) a[aria-label="Disable this extension"]`);
		}
	}

	private async waitForExtensionToBeInstalled(): Promise<void> {
		let attempt = 1;
		while (true) {
			try {
				await this.code.waitForElement(`.extension-editor .monaco-action-bar .action-item:not(.disabled) .extension-action.uninstall`, undefined);
				break;
			} catch (err) {
				if (await this.code.getElement(`.extension-editor .monaco-action-bar .action-item .extension-action.install.installing`)) {
					if (attempt++ === 3) {
						throw err;
					}
					this.code.logger.log('Extension is still being installed. Waiting...');
				} else {
					throw err;
				}
			}
		}
	}
}

export async function copyExtension(repoPath: string, extensionsPath: string, extId: string): Promise<void> {
	const dest = path.join(extensionsPath, extId);
	if (!fs.existsSync(dest)) {
		const orig = path.join(repoPath, 'extensions', extId);

		return promisify(ncp)(orig, dest);
	}
}
