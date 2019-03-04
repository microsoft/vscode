/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNextTickChannel } from 'vs/base/parts/ipc/node/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { toFileChangesEvent, IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';
import { WatcherChannelClient } from 'vs/workbench/services/files/node/watcher/nsfw/watcherIpc';
import { FileChangesEvent, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { Event } from 'vs/base/common/event';
import { IWatchError } from 'vs/workbench/services/files/node/watcher/nsfw/watcher';
import { getPathFromAmdModule } from 'vs/base/common/amd';

export class FileWatcher {
	private static readonly MAX_RESTARTS = 5;

	private service: WatcherChannelClient;
	private isDisposed: boolean;
	private restartCounter: number;
	private toDispose: IDisposable[] = [];

	constructor(
		private contextService: IWorkspaceContextService,
		private configurationService: IConfigurationService,
		private onFileChanges: (changes: FileChangesEvent) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean,
	) {
		this.isDisposed = false;
		this.restartCounter = 0;
	}

	public startWatching(): () => void {
		const client = new Client(
			getPathFromAmdModule(require, 'bootstrap-fork'),
			{
				serverName: 'File Watcher (nsfw)',
				args: ['--type=watcherService'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/files/node/watcher/nsfw/watcherApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: this.verboseLogging
				}
			}
		);
		this.toDispose.push(client);

		client.onDidProcessExit(() => {
			// our watcher app should never be completed because it keeps on watching. being in here indicates
			// that the watcher process died and we want to restart it here. we only do it a max number of times
			if (!this.isDisposed) {
				if (this.restartCounter <= FileWatcher.MAX_RESTARTS) {
					this.errorLogger('[FileWatcher] terminated unexpectedly and is restarted again...');
					this.restartCounter++;
					this.startWatching();
				} else {
					this.errorLogger('[FileWatcher] failed to start after retrying for some time, giving up. Please report this as a bug report!');
				}
			}
		}, null, this.toDispose);

		// Initialize watcher
		const channel = getNextTickChannel(client.getChannel('watcher'));
		this.service = new WatcherChannelClient(channel);

		const options = { verboseLogging: this.verboseLogging };
		const onWatchEvent = Event.filter(this.service.watch(options), () => !this.isDisposed);

		const onError = Event.filter<any, IWatchError>(onWatchEvent, (e): e is IWatchError => typeof e.message === 'string');
		onError(err => this.errorLogger(err.message), null, this.toDispose);

		const onFileChanges = Event.filter<any, IRawFileChange[]>(onWatchEvent, (e): e is IRawFileChange[] => Array.isArray(e) && e.length > 0);
		onFileChanges(e => this.onFileChanges(toFileChangesEvent(e)), null, this.toDispose);

		// Start watching
		this.updateFolders();
		this.toDispose.push(this.contextService.onDidChangeWorkspaceFolders(() => this.updateFolders()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files.watcherExclude')) {
				this.updateFolders();
			}
		}));

		return () => this.dispose();
	}

	private updateFolders() {
		if (this.isDisposed) {
			return;
		}

		this.service.setRoots(this.contextService.getWorkspace().folders.filter(folder => {
			// Only workspace folders on disk
			return folder.uri.scheme === Schemas.file;
		}).map(folder => {
			// Fetch the root's watcherExclude setting and return it
			const configuration = this.configurationService.getValue<IFilesConfiguration>({
				resource: folder.uri
			});
			let ignored: string[] = [];
			if (configuration.files && configuration.files.watcherExclude) {
				ignored = Object.keys(configuration.files.watcherExclude).filter(k => !!configuration.files.watcherExclude[k]);
			}
			return {
				basePath: folder.uri.fsPath,
				ignored
			};
		}));
	}

	private dispose(): void {
		this.isDisposed = true;
		this.toDispose = dispose(this.toDispose);
	}
}
