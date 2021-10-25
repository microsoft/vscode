/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IDiskFileChange, ILogMessage, IWatcherService, IWatchRequest, WatcherService } from 'vs/platform/files/common/watcher';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';

export class ParcelFileWatcher extends WatcherService {

	private readonly service: IWatcherService;

	constructor(
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService
	) {
		super();

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
	}

	setVerboseLogging(verboseLogging: boolean): Promise<void> {
		return this.service.setVerboseLogging(verboseLogging);
	}

	watch(requests: IWatchRequest[]): Promise<void> {
		return this.service.watch(requests);
	}
}
