/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { getNextTickChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { AbstractWatcherService, IDiskFileChange, ILogMessage, IWatcherService } from 'vs/platform/files/common/watcher';

export class FileWatcher extends AbstractWatcherService {

	constructor(
		onFileChanges: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	) {
		super(onFileChanges, onLogMessage, verboseLogging);

		this.init();
	}

	protected override createService(disposables: DisposableStore): IWatcherService {

		// Fork the parcel file watcher and build a client around
		// its server for passing over requests and receiving events.
		const client = disposables.add(new Client(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			{
				serverName: 'File Watcher (parcel, node.js)',
				args: ['--type=watcherServiceParcel'],
				env: {
					VSCODE_AMD_ENTRYPOINT: 'vs/platform/files/node/watcher/parcel/watcherApp',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
				}
			}
		));

		// React on unexpected termination of the watcher process
		disposables.add(client.onDidProcessExit(({ code, signal }) => this.onError(`terminated by itself with code ${code}, signal: ${signal}`)));

		return ProxyChannel.toService<IWatcherService>(getNextTickChannel(client.getChannel('watcher')));
	}
}
