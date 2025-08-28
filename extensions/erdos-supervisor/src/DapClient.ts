/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// eslint-disable-next-line import/no-unresolved
import * as erdos from 'erdos';
import { JupyterLanguageRuntimeSession } from './erdos-supervisor';

export class DapClient {
	private static _counter = 0;

	private _msgStem: string;

	constructor(readonly clientId: string,
		readonly serverPort: number,
		readonly debugType: string,
		readonly debugName: string,
		readonly session: JupyterLanguageRuntimeSession) {

		this._msgStem = Math.random().toString(16).slice(2, 10);
	}

	handleDapMessage(msg: any) {
		switch (msg.msg_type) {
			case 'start_debug': {
				this.session.emitJupyterLog(`Starting debug session for DAP server ${this.clientId}`);
				const config: vscode.DebugConfiguration = {
					type: this.debugType,
					name: this.debugName,
					request: 'attach',
					debugServer: this.serverPort,
					internalConsoleOptions: 'neverOpen',
				};
				vscode.debug.startDebugging(undefined, config);
				break;
			}

			case 'execute': {
				this.session.execute(
					msg.content.command,
					this._msgStem + '-dap-' + DapClient._counter++,
					erdos.RuntimeCodeExecutionMode.Interactive,
					erdos.RuntimeErrorBehavior.Stop
				);
				break;
			}

			case 'restart': {
				this.session.restart();
				break;
			}

			default: {
				this.session.emitJupyterLog(`Unknown DAP command: ${msg.msg_type}`);
				break;
			}
		}
	}
}
