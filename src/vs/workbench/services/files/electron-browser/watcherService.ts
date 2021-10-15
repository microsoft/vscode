/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWatcherService } from 'vs/platform/files/node/watcher/nsfw/watcher';
import { IDiskFileChange, ILogMessage, IWatchRequest, WatcherService } from 'vs/platform/files/node/watcher/watcher';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/ipc/electron-sandbox/sharedProcessWorkerWorkbenchService';

export class FileWatcher extends WatcherService {

	private service: IWatcherService | undefined;

	private isDisposed = false;

	constructor(
		private requests: IWatchRequest[],
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService
	) {
		super();

		this.startWatching();
	}

	private startWatching(): void {

		// Acquire parcel watcher via shared process worker
		const watcherChannel = this.sharedProcessWorkerWorkbenchService.createWorkerChannel({
			moduleId: 'vs/platform/files/node/watcher/parcel/watcherApp',
			type: 'watcherServiceParcelSharedProcess'
		}, 'watcher');

		// Initialize watcher
		this.service = ProxyChannel.toService<IWatcherService>(watcherChannel);
		this.service.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		this._register(this.service.onDidChangeFile(e => !this.isDisposed && this.onDidFilesChange(e)));
		this._register(this.service.onDidLogMessage(e => this.onLogMessage(e)));

		// Start watching
		this.watch(this.requests);
	}

	setVerboseLogging(verboseLogging: boolean): void {
		this.verboseLogging = verboseLogging;

		if (!this.isDisposed) {
			this.service?.setVerboseLogging(verboseLogging);
		}
	}

	watch(requests: IWatchRequest[]): void {
		this.requests = requests;

		this.service?.watch(requests);
	}

	override dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}
