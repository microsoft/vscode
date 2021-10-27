/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { AbstractWatcherService, IDiskFileChange, ILogMessage, IWatcherService } from 'vs/platform/files/common/watcher';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';

export class ParcelFileWatcher extends AbstractWatcherService {

	constructor(
		onFileChanges: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService
	) {
		super(onFileChanges, onLogMessage, verboseLogging);

		this.init();
	}

	protected override createService(disposables: DisposableStore): IWatcherService {

		// Acquire parcel watcher via shared process worker
		const watcherChannel = this.sharedProcessWorkerWorkbenchService.createWorkerChannel({
			moduleId: 'vs/platform/files/node/watcher/parcel/watcherApp',
			type: 'watcherServiceParcelSharedProcess'
		}, 'watcher').channel;

		return ProxyChannel.toService<IWatcherService>(watcherChannel);
	}
}
