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

	public async getCommandOutput(command: string): Promise<string> {
		const selector = 'div[id="workbench.panel.terminal"] .xterm-rows';
		// Default Powershell terminal adds 3 header rows at the top, whereas bash does not.
		let readRow = process.platform === 'win32' ? 5 : 2;
		let output: string = await this.spectron.client.getText(`${selector}>:nth-child(${readRow})`);

		// If ended up on the wrong line, it could be terminal's restored session (e.g. on OS X)
		if (output.trim().endsWith(command)) {
			output = await this.spectron.client.getText(`${selector}>:nth-child(${readRow+1})`); // try next line
		}

		return output.trim(); // remove many &nbsp; tags
	}
}