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
		await this.spectron.client.type(commandText);
		await this.spectron.client.waitForElement(`div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row:nth-child(1)[aria-label="${commandText}, commands, picker"]`);
		await this.spectron.client.waitAndClick(`div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties div.monaco-tree-row:nth-child(1) .quick-open-entry`);
	}
}
