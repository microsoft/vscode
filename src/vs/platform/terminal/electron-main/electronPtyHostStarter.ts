/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IReconnectConstants } from 'vs/platform/terminal/common/terminal';
import { NodePtyHostStarter } from 'vs/platform/terminal/node/nodePtyHostStarter';
import { IPtyHostConnection, IPtyHostStarter } from 'vs/platform/terminal/node/ptyHost';
// import { FileAccess } from 'vs/base/common/network';
// import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
// import { parsePtyHostDebugPort } from 'vs/platform/environment/node/environmentService';
// import { UtilityProcess } from 'vs/platform/utilityProcess/electron-main/utilityProcess';

export class ElectronPtyHostStarter implements IPtyHostStarter {

	// private utilityProcess: UtilityProcess | undefined = undefined;

	constructor(
		private readonly _reconnectConstants: IReconnectConstants,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService
	) {
	}

	start(lastPtyId: number): IPtyHostConnection {
		return new NodePtyHostStarter(this._reconnectConstants, this._environmentService).start(lastPtyId);

		// console.log('use utility proc');

		// // TODO: Convert to use utility process
		// const opts: IIPCOptions = {
		// 	serverName: 'Pty Host',
		// 	args: ['--type=ptyHost', '--logsPath', this._environmentService.logsHome.fsPath],
		// 	env: {
		// 		VSCODE_LAST_PTY_ID: lastPtyId,
		// 		VSCODE_PTY_REMOTE: this._isRemote,
		// 		VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
		// 		VSCODE_PIPE_LOGGING: 'true',
		// 		VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client,
		// 		VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
		// 		VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
		// 		VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
		// 	}
		// };

		// const ptyHostDebug = parsePtyHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
		// if (ptyHostDebug) {
		// 	if (ptyHostDebug.break && ptyHostDebug.port) {
		// 		opts.debugBrk = ptyHostDebug.port;
		// 	} else if (!ptyHostDebug.break && ptyHostDebug.port) {
		// 		opts.debug = ptyHostDebug.port;
		// 	}
		// }

		// const client = new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, opts);

		// return {
		// 	client,
		// 	dispose: client.dispose,
		// 	onDidProcessExit: client.onDidProcessExit
		// };
	}
}
