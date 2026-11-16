/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

interface IQuickInputElementInfo {
	label: string;
	id?: string;
}

export class QuickInput {

	private static QUICK_INPUT = '.quick-input-widget';
	private static QUICK_INPUT_INPUT = `${QuickInput.QUICK_INPUT} .quick-input-box input`;
	private static QUICK_INPUT_ROW = `${QuickInput.QUICK_INPUT} .quick-input-list .monaco-list-row`;
	private static QUICK_INPUT_FOCUSED_ENTRY = `${QuickInput.QUICK_INPUT_ROW}.focused .quick-input-list-entry`;
	// Note: this only grabs the label and not the description or detail
	private static QUICK_INPUT_ENTRY_LABEL = `${QuickInput.QUICK_INPUT_ROW} .quick-input-list-row > .monaco-icon-label .label-name`;
	private static QUICK_INPUT_ENTRY_LABEL_SPAN = `${QuickInput.QUICK_INPUT_ROW} .monaco-highlighted-label`;
	private static QUICK_INPUT_FOCUSED_LABEL = `${QuickInput.QUICK_INPUT_ROW}.focused .quick-input-list-row > .monaco-icon-label .label-name`;
	private static QUICK_INPUT_FOCUSED_ELEMENTS = `${QuickInput.QUICK_INPUT_FOCUSED_ENTRY}, ${QuickInput.QUICK_INPUT_FOCUSED_LABEL}`;
	private static MODAL_DIALOG = '.monaco-dialog-box';

	constructor(private code: Code) { }

	async waitForQuickInputOpened(retryCount?: number): Promise<void> {
		await this.code.waitForActiveElement(QuickInput.QUICK_INPUT_INPUT, retryCount);
	}

	async type(value: string): Promise<void> {
		await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, value);
	}

	async waitForQuickInputElement(): Promise<IQuickInputElementInfo> {
		const [entry, label] = await this.code.waitForElements(QuickInput.QUICK_INPUT_FOCUSED_ELEMENTS, false, elements => elements.length === 2);
		return {
			label: label.textContent,
			id: entry.attributes['data-quick-input-id']
		};
	}

	async waitForQuickInputElementText(): Promise<string> {
		return this.code.waitForTextContent(QuickInput.QUICK_INPUT_ENTRY_LABEL_SPAN);
	}

	async closeQuickInput(): Promise<void> {
		await this.waitForNoModalDialog();
		await this.code.dispatchKeybinding('escape', () => this.waitForQuickInputClosed());
	}

	/**
	 * Escape cancels a modal dialog instead of reaching the quick input, and a dialog can open at any time, like the
	 * proxy login dialog of a network request, which is not shown again once cancelled. Before pressing Escape for the
	 * quick input, gives an open dialog time to be answered by what handles it.
	 */
	async waitForNoModalDialog(): Promise<void> {
		try {
			await this.code.waitForElement(QuickInput.MODAL_DIALOG, element => !element, 300);
		} catch {
			this.code.logger.log('QuickInput: a modal dialog is still open after 30 seconds, pressing Escape anyway');
		}
	}

	async waitForQuickInputElements(accept: (names: string[]) => boolean): Promise<void> {
		await this.code.waitForElements(QuickInput.QUICK_INPUT_ENTRY_LABEL, false, els => accept(els.map(e => e.textContent)));
	}

	async waitForQuickInputClosed(): Promise<void> {
		await this.code.waitForElement(QuickInput.QUICK_INPUT, r => !!r && r.attributes.style.indexOf('display: none;') !== -1);
	}

	async selectQuickInputElement(index: number, keepOpen?: boolean): Promise<void> {
		await this.waitForQuickInputOpened();
		for (let from = 0; from < index; from++) {
			await this.code.dispatchKeybinding('down', async () => { });
		}
		await this.code.dispatchKeybinding('enter', async () => {
			if (!keepOpen) {
				await this.waitForQuickInputClosed();
			}
		});
	}
}
