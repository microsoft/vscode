/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { getNextTickChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Client } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { IFileChange } from '../../common/files.js';
import { AbstractUniversalWatcherClient, ILogMessage, IUniversalWatcher } from '../../common/watcher.js';

export class UniversalWatcherClient extends AbstractUniversalWatcherClient {

	constructor(
		onFileChanges: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	) {
		super(onFileChanges, onLogMessage, verboseLogging);

		this.init();
	}

	protected override createWatcher(disposables: DisposableStore): IUniversalWatcher {

		// Fork the universal file watcher and build a client around
		// its server for passing over requests and receiving events.
		const client = disposables.add(new Client(
			FileAccess.asFileUri('bootstrap-fork').fsPath,
			{
				serverName: 'File Watcher',
				args: ['--type=fileWatcher'],
				env: {
					VSCODE_AMD_ENTRYPOINT: 'vs/platform/files/node/watcher/watcherMain',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
				}
			}
		));

		// React on unexpected termination of the watcher process
		disposables.add(client.onDidProcessExit(({ code, signal }) => this.onError(`terminated by itself with code ${code}, signal: ${signal} (ETERM)`)));

		return ProxyChannel.toService<IUniversalWatcher>(getNextTickChannel(client.getChannel('watcher')));
	}
}
