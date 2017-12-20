/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import uri from 'vs/base/common/uri';
import { toFileChangesEvent, IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';
import { IWatcherChannel, WatcherChannelClient } from 'vs/workbench/services/files/node/watcher/nsfw/watcherIpc';
import { FileChangesEvent, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class FileWatcher {
	private static readonly MAX_RESTARTS = 5;

	private service: WatcherChannelClient;
	private isDisposed: boolean;
	private restartCounter: number;
	private toDispose: IDisposable[];

	constructor(
		private contextService: IWorkspaceContextService,
		private configurationService: IConfigurationService,
		private onFileChanges: (changes: FileChangesEvent) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean,
	) {
		this.isDisposed = false;
		this.restartCounter = 0;
		this.toDispose = [];
	}

	public startWatching(): () => void {
		const args = ['--type=watcherService'];

		const client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Watcher',
				args,
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/files/node/watcher/nsfw/watcherApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: this.verboseLogging
				}
			}
		);
		this.toDispose.push(client);

		// Initialize watcher
		const channel = getNextTickChannel(client.getChannel<IWatcherChannel>('watcher'));
		this.service = new WatcherChannelClient(channel);
		this.service.initialize(this.verboseLogging).then(null, err => {
			if (!this.isDisposed && !(err instanceof Error && err.name === 'Canceled' && err.message === 'Canceled')) {
				return TPromise.wrapError(err); // the service lib uses the promise cancel error to indicate the process died, we do not want to bubble this up
			}
			return void 0;
		}, (events: IRawFileChange[]) => this.onRawFileEvents(events)).done(() => {

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
		}, error => {
			if (!this.isDisposed) {
				this.errorLogger(error);
			}
		});

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

		this.service.setRoots(this.contextService.getWorkspace().folders.map(folder => {
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

	private onRawFileEvents(events: IRawFileChange[]): void {
		if (this.isDisposed) {
			return;
		}

		// Emit through event emitter
		if (events.length > 0) {
			this.onFileChanges(toFileChangesEvent(events));
		}
	}

	private dispose(): void {
		this.isDisposed = true;
		this.toDispose = dispose(this.toDispose);
	}
}