/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { QuickOpen } from '../quickopen/quickopen';

export class CommandPallette extends QuickOpen {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	public async runCommand(commandText: string): Promise<void> {
		await this.spectron.command('workbench.action.showCommands');
		await this.waitForQuickOpenOpened();
		await this.typeCommand(commandText);
		await this.spectron.client.waitForText(`div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row:nth-child(1) .quick-open-entry a.label-name span.monaco-highlighted-label span.highlight`, commandText);
		await this.spectron.client.waitAndClick(`div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row:nth-child(1) .quick-open-entry`);
	}

	// Need to retry multiple times due to late context switches might eat up some keys (e.g space)
	private async typeCommand(commandText: string): Promise<void> {
		await this.spectron.client.waitFor(async () => {
			await this.spectron.command('workbench.action.showCommands');
			await this.waitForQuickOpenOpened();
			await this.spectron.client.type(commandText);
			const text = await this.spectron.webclient.getValue('.quick-open-input input');

			if (text === `>${commandText}`) {
				return true;
			}
			await this.spectron.client.clearElement('.quick-open-input input');
			await this.closeQuickOpen();
			return undefined;
		});
	}
}
