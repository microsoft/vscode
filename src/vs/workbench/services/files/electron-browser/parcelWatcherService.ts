/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWatcherService } from 'vs/platform/files/node/watcher/parcel/watcher';
import { IDiskFileChange, ILogMessage, IWatchRequest, WatcherService } from 'vs/platform/files/node/watcher/watcher';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/ipc/electron-sandbox/sharedProcessWorkerWorkbenchService';

export class ParcelFileWatcher extends WatcherService {

	private readonly service: IWatcherService;

	constructor(
		requests: IWatchRequest[],
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService
	) {
		super();

		// Start watching
		{
			// Acquire parcel watcher via shared process worker
			const watcherChannel = this.sharedProcessWorkerWorkbenchService.createWorkerChannel({
				moduleId: 'vs/platform/files/node/watcher/parcel/watcherApp',
				type: 'watcherServiceParcelSharedProcess'
			}, 'watcher').channel;

			// Initialize watcher
			this.service = ProxyChannel.toService<IWatcherService>(watcherChannel);
			this.service.setVerboseLogging(verboseLogging);

			// Wire in event handlers
			this._register(this.service.onDidChangeFile(e => this.onDidFilesChange(e)));
			this._register(this.service.onDidLogMessage(e => this.onLogMessage(e)));

			// Start watching
			this.watch(requests);
		}
	}

	setVerboseLogging(verboseLogging: boolean): void {
		this.service.setVerboseLogging(verboseLogging);
	}

	watch(requests: IWatchRequest[]): void {
		this.service.watch(requests);
	}
}
