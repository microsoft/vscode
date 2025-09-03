/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getDelayedChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IFileChange } from '../../../../platform/files/common/files.js';
import { AbstractUniversalWatcherClient, ILogMessage, IRecursiveWatcher } from '../../../../platform/files/common/watcher.js';
import { IUtilityProcessWorkerWorkbenchService } from '../../utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';

export class UniversalWatcherClient extends AbstractUniversalWatcherClient {

	constructor(
		onFileChanges: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean,
		private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService
	) {
		super(onFileChanges, onLogMessage, verboseLogging);

		this.init();
	}

	protected override createWatcher(disposables: DisposableStore): IRecursiveWatcher {
		const watcher = ProxyChannel.toService<IRecursiveWatcher>(getDelayedChannel((async () => {

			// Acquire universal watcher via utility process worker
			//
			// We explicitly do not add the worker as a disposable
			// because we need to call `stop` on disposal to prevent
			// a crash on shutdown (see below).
			//
			// The utility process worker services ensures to terminate
			// the process automatically when the window closes or reloads.
			const { client, onDidTerminate } = disposables.add(await this.utilityProcessWorkerWorkbenchService.createWorker({
				moduleId: 'vs/platform/files/node/watcher/watcherMain',
				type: 'fileWatcher',
				name: 'file-watcher'
			}));

			// React on unexpected termination of the watcher process
			// by listening to the `onDidTerminate` event. We do not
			// consider an exit code of `0` as abnormal termination.

			onDidTerminate.then(({ reason }) => {
				if (reason?.code === 0) {
					this.trace(`terminated by itself with code ${reason.code}, signal: ${reason.signal}`);
				} else {
					this.onError(`terminated by itself unexpectedly with code ${reason?.code}, signal: ${reason?.signal} (ETERM)`);
				}
			});

			return client.getChannel('watcher');
		})()));

		return watcher;
	}
}
