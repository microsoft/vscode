/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IDiskFileChange } from 'vs/workbench/services/files/node/watcher/watcher';
import { WatcherChannelClient } from 'vs/workbench/services/files/node/watcher/unix/watcherIpc';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IWatchError, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/unix/watcher';
import { getPathFromAmdModule } from 'vs/base/common/amd';

export class FileWatcher extends Disposable {
	private static readonly MAX_RESTARTS = 5;

	private isDisposed: boolean;
	private restartCounter: number;
	private service: WatcherChannelClient;

	constructor(
		private folders: IWatcherRequest[],
		private onFileChanges: (changes: IDiskFileChange[]) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean
	) {
		super();

		this.isDisposed = false;
		this.restartCounter = 0;

		this.startWatching();
	}

	private startWatching(): void {
		const client = this._register(new Client(
			getPathFromAmdModule(require, 'bootstrap-fork'),
			{
				serverName: 'File Watcher (chokidar)',
				args: ['--type=watcherService'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/files/node/watcher/unix/watcherApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: this.verboseLogging
				}
			}
		));

		this._register(client.onDidProcessExit(() => {
			// our watcher app should never be completed because it keeps on watching. being in here indicates
			// that the watcher process died and we want to restart it here. we only do it a max number of times
			if (!this.isDisposed) {
				if (this.restartCounter <= FileWatcher.MAX_RESTARTS) {
					this.errorLogger('[File Watcher (chokidar)] terminated unexpectedly and is restarted again...');
					this.restartCounter++;
					this.startWatching();
				} else {
					this.errorLogger('[File Watcher (chokidar)] failed to start after retrying for some time, giving up. Please report this as a bug report!');
				}
			}
		}));

		// Initialize watcher
		const channel = getNextTickChannel(client.getChannel('watcher'));
		this.service = new WatcherChannelClient(channel);

		const options = { verboseLogging: this.verboseLogging };
		const onWatchEvent = Event.filter(this.service.watch(options), () => !this.isDisposed);

		const onError = Event.filter<any, IWatchError>(onWatchEvent, (e): e is IWatchError => typeof e.message === 'string');
		this._register(onError(err => this.errorLogger(`[File Watcher (chokidar)] ${err.message}`)));

		const onFileChanges = Event.filter<any, IDiskFileChange[]>(onWatchEvent, (e): e is IDiskFileChange[] => Array.isArray(e) && e.length > 0);
		this._register(onFileChanges(e => this.onFileChanges(e)));

		// Start watching
		this.service.setRoots(this.folders);
	}

	setFolders(folders: IWatcherRequest[]): void {
		this.folders = folders;

		this.service.setRoots(folders);
	}

	dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}
