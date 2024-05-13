/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { getNextTickChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IFileChange } from 'vs/platform/files/common/files';
import { AbstractUniversalWatcherClient, ILogMessage, IUniversalWatcher } from 'vs/platform/files/common/watcher';

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
