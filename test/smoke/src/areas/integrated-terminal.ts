/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { CommonActions } from "./common";

export class IntegratedTerminal {

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

		return this.spectron.command('workbench.action.terminal.toggleTerminal');
	}

	public async commandOutputHas(result: string): Promise<boolean> {
		const selector = 'div[id="workbench.panel.terminal"] .xterm-rows';

		const rows = await this.spectron.client.elements(`${selector} div`);
		for (let i = 0; i < rows.value.length; i++) {
			const rowText = await this.spectron.client.getText(`${selector}>:nth-child(${i + 1})`);
			if (rowText.trim() === result) {
				return true;
			}
		}

		return false;
	}
}