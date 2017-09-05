/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { QuickOpen } from '../quickopen/quickopen';

export class QuickOutline extends QuickOpen {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	public async openSymbols(): Promise<void> {
		await this.spectron.client.waitFor(async () => {
			await this.spectron.command('workbench.action.gotoSymbol');
			const element = await this.spectron.client.element('div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row[aria-label="body, symbols, picker"] .quick-open-entry');
			if (element) {
				return element;
			}
			await this.closeQuickOpen();
		});
	}
}
