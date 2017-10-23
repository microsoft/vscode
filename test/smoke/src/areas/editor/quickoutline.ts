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

	public async open(): Promise<void> {
		await this.spectron.client.waitFor(async () => {
			await this.spectron.runCommand('workbench.action.gotoSymbol');
			const entry = await this.spectron.client.element('div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row .quick-open-entry');
			if (entry) {
				const text = await this.spectron.client.getText('div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row .quick-open-entry .monaco-icon-label .label-name .monaco-highlighted-label span');
				if (text !== 'No symbol information for the file') {
					return entry;
				}
			}
			await this.closeQuickOpen();
		}, undefined, 'Opening Outline');
	}
}
