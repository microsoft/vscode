/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { getDelayedChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
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
		const service = ProxyChannel.toService<IWatcherService>(getDelayedChannel((async () => {

			// Acquire parcel watcher via shared process worker
			//
			// We explicitly do not add the worker as a disposable
			// because we need to call `stop` on disposal to prevent
			// a crash on shutdown (see below).
			//
			// The shared process worker services ensures to terminate
			// the process automatically when the window closes or reloads.
			const { client, onDidTerminate } = await this.sharedProcessWorkerWorkbenchService.createWorker({
				moduleId: 'vs/platform/files/node/watcher/parcel/watcherApp',
				type: 'watcherServiceParcelSharedProcess'
			});

			// React on unexpected termination of the watcher process
			// We never expect the watcher to terminate by its own,
			// so if that happens we want to restart the watcher.
			onDidTerminate.then(({ reason }) => {
				if (reason) {
					this.onError(`terminated by itself with code ${reason.code}, signal: ${reason.signal}`);
				}
			});

			return client.getChannel('watcher');
		})()));

		// Looks like parcel needs an explicit stop to prevent
		// access on data structures after process exit. This
		// only seem to be happening when used from Electron,
		// not pure node.js.
		// https://github.com/microsoft/vscode/issues/136264
		disposables.add(toDisposable(() => service.stop()));

		return service;
	}
}
