/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from '../../vscode/code';

export class QuickInput {

	static QUICK_INPUT = '.quick-input-widget';
	static QUICK_INPUT_INPUT = `${QuickInput.QUICK_INPUT} .quick-input-box input`;
	static QUICK_INPUT_FOCUSED_ELEMENT = `${QuickInput.QUICK_INPUT} .quick-open-tree .monaco-tree-row.focused .monaco-highlighted-label`;

	constructor(private code: Code) { }

	async closeQuickInput(): Promise<void> {
		await this.code.dispatchKeybinding('escape');
		await this.waitForQuickInputClosed();
	}

	async waitForQuickInputOpened(retryCount?: number): Promise<void> {
		await this.code.waitForActiveElement(QuickInput.QUICK_INPUT_INPUT, retryCount);
	}

	private async waitForQuickInputClosed(): Promise<void> {
		await this.code.waitForElement(QuickInput.QUICK_INPUT, r => !!r && r.attributes.style.indexOf('display: none;') !== -1);
	}

	async selectQuickInputElement(index: number): Promise<void> {
		await this.waitForQuickInputOpened();
		for (let from = 0; from < index; from++) {
			await this.code.dispatchKeybinding('down');
		}
		await this.code.dispatchKeybinding('enter');
		await this.waitForQuickInputClosed();
	}
}
