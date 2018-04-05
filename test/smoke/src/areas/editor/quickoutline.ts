/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickOpen } from '../quickopen/quickopen';

export class QuickOutline extends QuickOpen {

	public async open(): Promise<void> {
		let retries = 0;

		while (++retries < 10) {
			await this.spectron.runCommand('workbench.action.gotoSymbol');

			const text = await this.spectron.client.waitForText('div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row .quick-open-entry .monaco-icon-label .label-name .monaco-highlighted-label span');

			if (text !== 'No symbol information for the file') {
				return;
			}

			await this.closeQuickOpen();
			await new Promise(c => setTimeout(c, 250));
		}
	}
}
