/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Element } from 'webdriverio';

export class QuickOpen {

	static QUICK_OPEN_ENTRY_SELECTOR = 'div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties .monaco-tree-row .quick-open-entry';

	constructor(readonly spectron: SpectronApplication) {
	}

	public async openQuickOpen(): Promise<void> {
		await this.spectron.command('workbench.action.quickOpen');
		await this.waitForQuickOpenOpened();
	}

	public async closeQuickOpen(): Promise<void> {
		await this.spectron.command('workbench.action.closeQuickOpen');
		await this.waitForQuickOpenClosed();
	}

	public async getQuickOpenElements(): Promise<Element[]> {
		return this.spectron.client.waitForElements(QuickOpen.QUICK_OPEN_ENTRY_SELECTOR);
	}

	public async openFile(fileName: string): Promise<void> {
		await this.openQuickOpen();
		await this.spectron.client.type(fileName);
		await this.getQuickOpenElements();
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.spectron.client.waitForElement(`.tabs-container div[aria-selected="true"][aria-label="${fileName}, tab"]`);
		await this.spectron.client.waitForElement(`div.editor-container[aria-label="${fileName}. Text file editor., Group 1."]`);
		await this.spectron.workbench.waitForEditorFocus(fileName);
	}

	protected waitForQuickOpenOpened(): Promise<Element> {
		return this.spectron.client.waitForElement('.quick-open-widget .quick-open-input input:focus');
	}

	protected waitForQuickOpenClosed(): Promise<Element> {
		return this.spectron.client.waitForElement('div.quick-open-widget[aria-hidden="true"]');
	}

	public async isQuickOpenVisible(): Promise<boolean> {
		await this.waitForQuickOpenOpened();
		return true;
	}

	public async submit(text: string): Promise<void> {
		await this.spectron.client.type(text);
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.waitForQuickOpenClosed();
	}

	public async selectQuickOpenElement(index: number): Promise<void> {
		await this.waitForQuickOpenOpened();
		for (let from = 0; from < index; from++) {
			await this.spectron.client.keys(['ArrowDown', 'NULL']);
			this.spectron.wait(3);
		}
		await this.spectron.client.keys(['Enter', 'NULL']);
		await this.waitForQuickOpenClosed();
	}
}
