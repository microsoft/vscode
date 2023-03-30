/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { IChannelClient } from 'vs/base/parts/ipc/common/ipc';
import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { parsePtyHostDebugPort } from 'vs/platform/environment/node/environmentService';
import { IReconnectConstants } from 'vs/platform/terminal/common/terminal';

export interface IPtyHostStarter {
	/**
	 * Creates a pty host and connects to it.
	 *
	 * @param lastPtyId Tracks the last terminal ID from the pty host so we can give it to the new
	 * pty host if it's restarted and avoid ID conflicts.
	 */
	start(lastPtyId: number): IChannelClient;
}

export class NodePtyHostStarter implements IPtyHostStarter {
	constructor(
		private readonly _reconnectConstants: IReconnectConstants,
		private readonly _isRemote: boolean,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService
	) {
	}

	start(lastPtyId: number): IChannelClient {
		const opts: IIPCOptions = {
			serverName: 'Pty Host',
			args: ['--type=ptyHost', '--logsPath', this._environmentService.logsHome.fsPath],
			env: {
				VSCODE_LAST_PTY_ID: lastPtyId,
				VSCODE_PTY_REMOTE: this._isRemote,
				VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
				VSCODE_PIPE_LOGGING: 'true',
				VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client,
				VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
				VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
				VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
			}
		};

		const ptyHostDebug = parsePtyHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
		if (ptyHostDebug) {
			if (ptyHostDebug.break && ptyHostDebug.port) {
				opts.debugBrk = ptyHostDebug.port;
			} else if (!ptyHostDebug.break && ptyHostDebug.port) {
				opts.debug = ptyHostDebug.port;
			}
		}

		const client = new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, opts);
		// this._onPtyHostStart.fire();

		// TODO: Handle exit
		// this._register(client.onDidProcessExit(e => {
		// 	this._onPtyHostExit.fire(e.code);
		// 	if (!this._isDisposed) {
		// 		if (this._restartCount <= Constants.MaxRestarts) {
		// 			this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
		// 			this._restartCount++;
		// 			this.restartPtyHost();
		// 		} else {
		// 			this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
		// 		}
		// 	}
		// }));

		return client;
	}
}
