/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editors } from './editors';
import { Code } from './code';

export class QuickOpen {

	static QUICK_OPEN = '.quick-input-widget';
	static QUICK_OPEN_INPUT = `${QuickOpen.QUICK_OPEN} .quick-input-box input`;
	static QUICK_OPEN_ROW = `${QuickOpen.QUICK_OPEN} .quick-input-list .monaco-list-row`;
	static QUICK_OPEN_FOCUSED_ELEMENT = `${QuickOpen.QUICK_OPEN_ROW}.focused .monaco-highlighted-label`;
	static QUICK_OPEN_ENTRY_LABEL = `${QuickOpen.QUICK_OPEN_ROW} .label-name`;
	static QUICK_OPEN_ENTRY_LABEL_SPAN = `${QuickOpen.QUICK_OPEN_ROW} .monaco-highlighted-label span`;

	constructor(private code: Code, private editors: Editors) { }

	async openQuickOpen(value: string): Promise<void> {
		let retries = 0;

		// other parts of code might steal focus away from quickopen :(
		while (retries < 5) {
			if (process.platform === 'darwin') {
				await this.code.dispatchKeybinding('cmd+p');
			} else {
				await this.code.dispatchKeybinding('ctrl+p');
			}

			try {
				await this.waitForQuickOpenOpened(10);
				break;
			} catch (err) {
				if (++retries > 5) {
					throw err;
				}

				await this.code.dispatchKeybinding('escape');
			}
		}

		if (value) {
			await this.code.waitForSetValue(QuickOpen.QUICK_OPEN_INPUT, value);
		}
	}

	async closeQuickOpen(): Promise<void> {
		await this.code.dispatchKeybinding('escape');
		await this.waitForQuickOpenClosed();
	}

	async openFile(fileName: string): Promise<void> {
		await this.openQuickOpen(fileName);

		await this.waitForQuickOpenElements(names => names[0] === fileName);
		await this.code.dispatchKeybinding('enter');
		await this.editors.waitForActiveTab(fileName);
		await this.editors.waitForEditorFocus(fileName);
	}

	async waitForQuickOpenOpened(retryCount?: number): Promise<void> {
		await this.code.waitForActiveElement(QuickOpen.QUICK_OPEN_INPUT, retryCount);
	}

	private async waitForQuickOpenClosed(): Promise<void> {
		await this.code.waitForElement(QuickOpen.QUICK_OPEN, r => !!r && r.attributes.style.indexOf('display: none;') !== -1);
	}

	async submit(text: string): Promise<void> {
		await this.code.waitForSetValue(QuickOpen.QUICK_OPEN_INPUT, text);
		await this.code.dispatchKeybinding('enter');
		await this.waitForQuickOpenClosed();
	}

	async selectQuickOpenElement(index: number): Promise<void> {
		this.activateQuickOpenElement(index);
		await this.code.dispatchKeybinding('enter');
		await this.waitForQuickOpenClosed();
	}

	async waitForQuickOpenElements(accept: (names: string[]) => boolean): Promise<void> {
		await this.code.waitForElements(QuickOpen.QUICK_OPEN_ENTRY_LABEL, false, els => accept(els.map(e => e.textContent)));
	}

	async runCommand(commandId: string): Promise<void> {
		await this.openQuickOpen(`>${commandId}`);

		// wait for best choice to be focused
		await this.code.waitForTextContent(QuickOpen.QUICK_OPEN_FOCUSED_ELEMENT);

		// wait and click on best choice
		await this.selectQuickOpenElement(0);
	}

	async activateQuickOpenElement(index: number): Promise<void> {
		await this.waitForQuickOpenOpened();
		for (let from = 0; from < index; from++) {
			await this.code.dispatchKeybinding('down');
		}
	}

	async openQuickOutline(): Promise<void> {
		let retries = 0;

		while (++retries < 10) {
			if (process.platform === 'darwin') {
				await this.code.dispatchKeybinding('cmd+shift+o');
			} else {
				await this.code.dispatchKeybinding('ctrl+shift+o');
			}

			const text = await this.code.waitForTextContent(QuickOpen.QUICK_OPEN_ENTRY_LABEL_SPAN);

			if (text !== 'No symbol information for the file') {
				return;
			}

			await this.closeQuickOpen();
			await new Promise(c => setTimeout(c, 250));
		}
	}
}
