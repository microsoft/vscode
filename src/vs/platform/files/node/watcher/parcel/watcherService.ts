/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { getNextTickChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IDiskFileChange, ILogMessage, IWatcherService, IWatchRequest, WatcherService } from 'vs/platform/files/common/watcher';

export class FileWatcher extends WatcherService {

	private static readonly MAX_RESTARTS = 5;

	private service: IWatcherService | undefined;

	private isDisposed = false;
	private restartCounter = 0;

	constructor(
		private requests: IWatchRequest[],
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean
	) {
		super();

		this.startWatching();
	}

	private startWatching(): void {
		const client = this._register(new Client(
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

		this._register(client.onDidProcessExit(() => {
			// our watcher app should never be completed because it keeps on watching. being in here indicates
			// that the watcher process died and we want to restart it here. we only do it a max number of times
			if (!this.isDisposed) {
				if (this.restartCounter <= FileWatcher.MAX_RESTARTS) {
					this.error('terminated unexpectedly and is restarted again...');
					this.restartCounter++;
					this.startWatching();
				} else {
					this.error('failed to start after retrying for some time, giving up. Please report this as a bug report!');
				}
			}
		}));

		// Initialize watcher
		this.service = ProxyChannel.toService<IWatcherService>(getNextTickChannel(client.getChannel('watcher')));
		this.service.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		this._register(this.service.onDidChangeFile(e => !this.isDisposed && this.onDidFilesChange(e)));
		this._register(this.service.onDidLogMessage(e => this.onLogMessage(e)));

		// Start watching
		this.watch(this.requests);
	}

	async setVerboseLogging(verboseLogging: boolean): Promise<void> {
		this.verboseLogging = verboseLogging;

		if (!this.isDisposed) {
			await this.service?.setVerboseLogging(verboseLogging);
		}
	}

	error(message: string) {
		this.onLogMessage({ type: 'error', message: `[File Watcher (parcel)] ${message}` });
	}

	async watch(requests: IWatchRequest[]): Promise<void> {
		this.requests = requests;

		await this.service?.watch(requests);
	}

	override dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}
