/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export class Explorer {

	constructor(private spectron: SpectronApplication) {
	}

	public openExplorerView(): Promise<any> {
		return this.spectron.command('workbench.view.explorer');
	}

	public async openFile(fileName: string): Promise<any> {
		let selector = `div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.getExtensionSelector(fileName)} explorer-item"]`;
		try {
			await this.spectron.client.doubleClickAndWait(selector);
			await this.spectron.client.waitForElement(`.tabs-container div[aria-label="${fileName}, tab"]`);
			await this.spectron.client.waitForElement(`.monaco-editor.focused`);
		} catch (e) {
			return Promise.reject(`Cannot fine ${fileName} in a viewlet.`);
		}
	}

	public getExtensionSelector(fileName: string): string {
		const extension = fileName.split('.')[1];
		if (extension === 'js') {
			return 'js-ext-file-icon javascript-lang-file-icon';
		} else if (extension === 'json') {
			return 'json-ext-file-icon json-lang-file-icon';
		} else if (extension === 'md') {
			return 'md-ext-file-icon markdown-lang-file-icon';
		}
		throw new Error('No class defined for this file extension');
	}

}