/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { getNextTickChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IDiskFileChange, ILogMessage, IWatcherService, IWatchRequest, WatcherService } from 'vs/platform/files/common/watcher';

export class FileWatcher extends WatcherService {

	private static readonly MAX_RESTARTS = 5;

	private service: IWatcherService | undefined;
	private serviceDisposables = this._register(new MutableDisposable());

	private requests: IWatchRequest[] | undefined = undefined;

	private restartCounter = 0;

	constructor(
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean
	) {
		super();

		this.init();
	}

	private init(): void {

		// Associate disposables to the service
		const disposables = new DisposableStore();
		this.serviceDisposables.value = disposables;

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

		disposables.add(client.onDidProcessExit(() => {
			// Our watcher app should never be completed because it keeps
			// on watching. being in here indicates that the watcher process
			// died and we want to restart it here. we only do it a max number
			// of times
			if (this.restartCounter <= FileWatcher.MAX_RESTARTS && this.requests) {
				this.error('terminated unexpectedly and is restarted again...');
				this.restart(this.requests);
			} else {
				this.error('failed to start after retrying for some time, giving up. Please report this as a bug report!');
			}
		}));

		// Initialize watcher
		this.service = ProxyChannel.toService<IWatcherService>(getNextTickChannel(client.getChannel('watcher')));
		this.service.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		disposables.add(this.service.onDidChangeFile(e => this.onDidFilesChange(e)));
		disposables.add(this.service.onDidLogMessage(e => this.onLogMessage(e)));
	}

	private restart(requests: IWatchRequest[]): void {
		this.error('terminated unexpectedly and is restarted again...');
		this.restartCounter++;

		this.init();
		this.watch(requests);
	}

	async watch(requests: IWatchRequest[]): Promise<void> {
		this.requests = requests;

		await this.service?.watch(requests);
	}

	async setVerboseLogging(verboseLogging: boolean): Promise<void> {
		this.verboseLogging = verboseLogging;

		await this.service?.setVerboseLogging(verboseLogging);
	}

	private error(message: string) {
		this.onLogMessage({ type: 'error', message: `[File Watcher (parcel)] ${message}` });
	}

	override dispose(): void {

		// Render the serve invalid from here
		this.service = undefined;

		return super.dispose();
	}
}
