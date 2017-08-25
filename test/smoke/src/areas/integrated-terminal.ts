/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from './common';

export class IntegratedTerminal {

	public static terminalSelector = 'div[id="workbench.panel.terminal"]';
	public static terminalRowsSelector = 'div[id="workbench.panel.terminal"] .xterm-rows';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async openTerminal(commonActions: CommonActions): Promise<any> {
		// Backquote dispatching does not work in OS X
		if (process.platform === 'darwin') {
			await commonActions.showCommands();
			await commonActions.type('Toggle Integrated Terminal');
			return commonActions.enter();
		}

		await this.spectron.command('workbench.action.terminal.toggleTerminal');

		// If no terminal panel was opened, try triggering terminal from quick open
		try {
			await this.spectron.client.getHTML(IntegratedTerminal.terminalSelector);
		} catch (e) {
			await commonActions.openQuickOpen();
			await this.spectron.client.keys('>Toggle Integrated Terminal');
			await this.spectron.client.keys(['Enter', 'NULL']);
		}
	}

	public async commandOutputHas(result: string): Promise<boolean> {
		const rows = await this.spectron.client.elements(`${IntegratedTerminal.terminalRowsSelector} div`);
		for (let i = 0; i < rows.value.length; i++) {
			let rowText;
			try {
				rowText = await this.spectron.client.getText(`${IntegratedTerminal.terminalRowsSelector}>:nth-child(${i + 1})`);
			} catch (e) {
				return Promise.reject(`Failed to obtain text from line ${i + 1} from the terminal.`);
			}
			if (rowText.trim() === result) {
				return true;
			}
		}

		return false;
	}
}