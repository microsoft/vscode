/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { Client, IIPCOptions } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { parsePtyHostDebugPort } from '../../environment/node/environmentService.js';
import { IReconnectConstants } from '../common/terminal.js';
import { IPtyHostConnection, IPtyHostStarter } from './ptyHost.js';

export class NodePtyHostStarter extends Disposable implements IPtyHostStarter {
	constructor(
		private readonly _reconnectConstants: IReconnectConstants,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService
	) {
		super();
	}

	start(): IPtyHostConnection {
		const opts: IIPCOptions = {
			serverName: 'Pty Host',
			args: ['--type=ptyHost', '--logsPath', this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
			env: {
				VSCODE_ESM_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
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

		const store = new DisposableStore();
		store.add(client);

		return {
			client,
			store,
			onDidProcessExit: client.onDidProcessExit
		};
	}
}
