/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Client} from 'vs/base/node/service.cp';
import uri from 'vs/base/common/uri';
import {EventType} from 'vs/platform/files/common/files';
import {toFileChangesEvent, IRawFileChange} from 'vs/workbench/services/files/node/watcher/common';
import {IEventService} from 'vs/platform/event/common/event';

export interface IWatcherRequest {
	basePath: string;
	ignored: string[];
	verboseLogging: boolean;
}

export class WatcherService {
	public watch(request: IWatcherRequest): TPromise<void> {
		throw new Error('not implemented');
	}
}

export class FileWatcher {
	private static MAX_RESTARTS = 5;

	private isDisposed: boolean;
	private restartCounter: number;

	constructor(private basePath: string, private ignored: string[], private eventEmitter: IEventService, private errorLogger: (msg: string) => void, private verboseLogging: boolean) {
		this.isDisposed = false;
		this.restartCounter = 0;
	}

	public startWatching(): () => void {
		const client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Watcher',
				args: ['--type=watcherService'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/files/node/watcher/unix/watcherApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: this.verboseLogging
				}
			}
		);

		const service = client.getService<WatcherService>('WatcherService', WatcherService);

		// Start watching
		service.watch({ basePath: this.basePath, ignored: this.ignored, verboseLogging: this.verboseLogging }).then(null, (err) => {
			if (!(err instanceof Error && err.name === 'Canceled' && err.message === 'Canceled')) {
				return TPromise.wrapError(err); // the service lib uses the promise cancel error to indicate the process died, we do not want to bubble this up
			}
		}, (events: IRawFileChange[]) => this.onRawFileEvents(events)).done(() => {

			// our watcher app should never be completed because it keeps on watching. being in here indicates
			// that the watcher process died and we want to restart it here. we only do it a max number of times
			if (!this.isDisposed) {
				if (this.restartCounter <= FileWatcher.MAX_RESTARTS) {
					this.errorLogger('Watcher terminated unexpectedly and is restarted again...');
					this.restartCounter++;
					this.startWatching();
				} else {
					this.errorLogger('Watcher failed to start after retrying for some time, giving up. Please report this as a bug report!');
				}
			}
		}, this.errorLogger);

		return () => {
			client.dispose();
			this.isDisposed = true;
		};
	}

	private onRawFileEvents(events: IRawFileChange[]): void {

		// Emit through broadcast service
		if (events.length > 0) {
			this.eventEmitter.emit(EventType.FILE_CHANGES, toFileChangesEvent(events));
		}
	}
}